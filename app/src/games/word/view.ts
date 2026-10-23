import type { ViewHandle } from "../../home";
import type { DataSource } from "../../shared/data-source";
import {
  loadWordProgress,
  saveWordProgress,
  type WordProgress,
} from "../../shared/progress";
import { gameById, gameIdOf } from "../../shared/roster";
import { hasGameBit } from "../../shared/streaks";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { createKeyboard } from "../../shared/ui/keyboard";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import { createTile } from "../../shared/ui/tile";
import { isAllowedGuess, loadGuessList } from "./dictionary";
import { WORD_GRID_ROWS, WORD_LENGTH, type LetterScore } from "./engine";
import {
  applyGuess,
  prepareSubmissionRetry,
  submitResultOnce,
  wordScore,
} from "./session";

const SCORE_RANK: Readonly<Record<LetterScore, number>> = {
  absent: 0,
  present: 1,
  correct: 2,
};

export function keyboardScores(progress: WordProgress): Map<string, LetterScore> {
  const scores = new Map<string, LetterScore>();
  for (const guess of progress.guesses) {
    for (let index = 0; index < guess.word.length; index += 1) {
      const letter = guess.word[index];
      const score = guess.scores[index];
      if (!letter || !score) {
        continue;
      }
      const previous = scores.get(letter);
      if (!previous || SCORE_RANK[score] > SCORE_RANK[previous]) {
        scores.set(letter, score);
      }
    }
  }
  return scores;
}

export function renderWord(
  source: DataSource,
  requestedDay?: number,
): ViewHandle {
  const page = document.createElement("section");
  page.className = "page word-page";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>One word a day.</h1>
      </div>
    </div>
    <div class="word-shell" data-word-shell>
      <div class="game-loading">Loading the word…</div>
    </div>
  `;
  page.dataset.game = "word";
  document.documentElement.dataset.game = "word";
  const gameRule = createGameRule("Type a word. Tiles reveal how close you are.");
  page.append(gameRule);

  const shell = page.querySelector<HTMLElement>("[data-word-shell]");
  if (!shell) {
    throw new Error("Word shell failed to render");
  }

  let disposed = false;
  let progress: WordProgress | null = null;
  let answer = "";
  let draft = "";
  let alreadyRecorded = false;
  let statusMessage = "";
  let loadRequest = 0;
  let today = 0;
  const resultPanel = createResultPanel(source, gameById("word")!, { unit: "guess" });

  // A day recorded on chain without a local completion (another device, or an
  // older stored version) opens read-only.
  const isReadOnly = (): boolean =>
    alreadyRecorded && !(progress?.complete ?? false);

  const renderGame = (): void => {
    if (!progress) {
      return;
    }

    const readOnly = isReadOnly();
    const stage = document.createElement("div");
    stage.className = "word-stage";
    const guesses = progress.guesses;
    const resolved = readOnly || progress.complete;
    // The Result board: played rows only, no card, no meta or status line, no rule.
    const resultShown = !readOnly && resolved && showsResult(progress.submission);
    page.classList.toggle("word-page--result", resultShown);
    gameRule.hidden = resolved;
    const guessCount = guesses.length;
    const result = readOnly
      ? ""
      : progress.complete
        ? `${answer.toUpperCase()} in ${guessCount} ${guessCount === 1 ? "guess" : "guesses"}`
        : statusMessage
          || (guessCount === 0
            ? "Guess the word in as few tries as you can."
            : `${guessCount} ${guessCount === 1 ? "guess" : "guesses"} so far`);
    // The result line also carries the day's recording state so the resolved
    // screen stays one line plus one button row (D18).
    const status = readOnly || !resolved
      ? ""
      : progress.submission === "submitted"
        ? "Score recorded."
        : progress.submission === "submitting"
          ? "Recording your score…"
          : progress.submission === "deferred"
            ? "Record it in the Polkadot app."
            : progress.submission === "failed"
              ? "Recording failed."
              : "";
    const message = status ? `${result} · ${status}` : result;
    if (resolved) {
      stage.classList.add("word-stage--resolved");
    }
    stage.innerHTML = `
      <div class="word-meta">
        <div>
          <span>${progress.day < today ? `DAY ${progress.day} WORD` : "TODAY'S WORD"}</span>
          <strong>${WORD_LENGTH} LETTERS</strong>
        </div>
      </div>
      <div class="guess-grid" data-grid></div>
      <p class="word-message${!readOnly && resolved ? " word-message--solved" : ""}" aria-live="polite">${message}</p>
      <div class="word-actions" data-actions></div>
      <div data-keyboard></div>
    `;

    const grid = stage.querySelector<HTMLElement>("[data-grid]");
    const actions = stage.querySelector<HTMLElement>("[data-actions]");
    const keyboardTarget = stage.querySelector<HTMLElement>("[data-keyboard]");
    if (!grid || !actions || !keyboardTarget) {
      throw new Error("Word stage failed to render");
    }

    // The grid grows one row per guess past six and scrolls inside its box (D18).
    const rowCount = readOnly
      ? WORD_GRID_ROWS
      : resultShown
        ? guesses.length
        : Math.max(WORD_GRID_ROWS, guesses.length + (resolved ? 0 : 1));
    grid.classList.toggle("guess-grid--scroll", rowCount > WORD_GRID_ROWS);
    grid.style.setProperty("--letters", String(WORD_LENGTH));
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = document.createElement("div");
      row.className = "guess-row";
      // The winning row earns the accent (decision 1).
      row.classList.toggle(
        "guess-row--won",
        !readOnly && progress.complete && rowIndex === guesses.length - 1,
      );
      const stored = guesses[rowIndex];
      const letters =
        stored?.word ?? (rowIndex === guesses.length ? draft : "");
      for (let column = 0; column < WORD_LENGTH; column += 1) {
        row.append(createTile(letters[column] ?? "", stored?.scores[column]));
      }
      grid.append(row);
    }

    if (readOnly) {
      stage
        .querySelector(".word-message")
        ?.replaceChildren(createPlayedNotice(gameById("word")!, progress.day, today));
      shell.replaceChildren(stage);
      return;
    }

    if (resolved && progress.submission === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button-link word-action";
      retry.dataset.submissionRetry = "";
      retry.textContent = "Try recording again";
      retry.addEventListener("click", () => {
        if (!progress) {
          return;
        }
        prepareSubmissionRetry(progress);
        renderGame();
        void submitResultOnce(source, progress)
          .catch(() => undefined)
          .finally(renderGame);
      });
      actions.append(retry);
    }

    // The solved word shows the day's distribution where the keyboard was.
    if (resolved) {
      keyboardTarget.append(resultPanel.element);
    } else {
      keyboardTarget.append(
        createKeyboard((key) => void handleKey(key), keyboardScores(progress)),
      );
    }
    resultPanel.update({
      day: progress.day,
      score: wordScore(progress),
      recorded: resultShown && progress.submission === "submitted",
      pendingSave: resultShown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      detail: `the word was ${answer.toUpperCase()}`,
      onSave: !readOnly && progress.submission === "pending" ? saveNow : undefined,
    });
    syncResultChrome(page, gameById("word")!, progress.day, resultShown);
    shell.replaceChildren(stage);
    if (rowCount > WORD_GRID_ROWS) {
      grid.scrollTop = grid.scrollHeight;
    }
  };

  // Save from the unsaved result (after Not now): the prompt opens again.
  const saveNow = (): void => {
    if (!progress) {
      return;
    }
    void submitResultOnce(source, progress)
      .catch(() => undefined)
      .finally(renderGame);
  };

  const handleKey = async (key: string): Promise<void> => {
    if (!progress || isReadOnly() || progress.complete || !answer) {
      return;
    }

    if (key === "backspace") {
      draft = draft.slice(0, -1);
      statusMessage = "";
      renderGame();
      return;
    }

    if (key === "enter") {
      if (draft.length !== WORD_LENGTH) {
        statusMessage = `Enter a ${WORD_LENGTH}-letter word.`;
        renderGame();
        return;
      }
      if (!isAllowedGuess(draft, answer)) {
        statusMessage = "Not in the word list.";
        renderGame();
        return;
      }

      progress = applyGuess(progress, answer, draft);
      saveWordProgress(progress);
      draft = "";
      statusMessage = "";
      renderGame();

      // Solving the word is the day's one chain write (D14).
      if (progress.complete) {
        try {
          await submitResultOnce(source, progress);
        } catch {
          // The completed result remains in localStorage and exposes an explicit retry.
        }
        if (!disposed) {
          renderGame();
        }
      }
      return;
    }

    if (/^[a-z]$/.test(key) && draft.length < WORD_LENGTH) {
      draft += key;
      statusMessage = "";
      renderGame();
    }
  };

  const onPhysicalKey = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void handleKey("enter");
    } else if (event.key === "Backspace") {
      event.preventDefault();
      void handleKey("backspace");
    } else if (/^[a-zA-Z]$/.test(event.key)) {
      void handleKey(event.key.toLowerCase());
    }
  };
  window.addEventListener("keydown", onPhysicalKey);

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    gameRule.hidden = true;
    shell.innerHTML = '<div class="game-loading">Loading the word…</div>';

    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      setHeaderGame(gameById("word")!, day);
      const [loadedAnswer, bits] = await Promise.all([
        source.wordAnswer(day),
        source.dayBits(day),
        loadGuessList().catch((error: unknown) => {
          // Without the list only the answer passes; the game still works.
          console.warn("[daily-on-dot] guess list load failed", error);
        }),
      ]);
      if (loadedAnswer.length !== WORD_LENGTH || !/^[a-z]+$/.test(loadedAnswer)) {
        throw new Error("The word data is invalid.");
      }
      if (disposed || request !== loadRequest) {
        return;
      }
      answer = loadedAnswer;
      progress = loadWordProgress(day);
      alreadyRecorded = hasGameBit(bits.played, gameIdOf("word"));
      renderGame();

      if (
        progress.complete &&
        (progress.submission === "pending" ||
          progress.submission === "deferred") &&
        !alreadyRecorded
      ) {
        try {
          await submitResultOnce(source, progress);
        } catch {
          // Recovery follows the same local-first retry path as a live completion.
        }
        if (!disposed) {
          renderGame();
        }
      }
    } catch (error) {
      if (!disposed && request === loadRequest) {
        const failure = document.createElement("div");
        failure.className = "game-error";
        const heading = document.createElement("strong");
        heading.textContent = "Word unavailable";
        const message = document.createElement("p");
        message.textContent =
          error instanceof Error ? error.message : "Please try again.";
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try again";
        retry.addEventListener("click", () => void loadGame());
        const back = document.createElement("a");
        back.className = "button-link game-error-back";
        back.href = "#/";
        back.textContent = "Back to home";
        failure.append(heading, message, retry, back);
        shell.replaceChildren(failure);
      }
    }
  };
  void loadGame();

  return {
    element: page,
    dispose() {
      disposed = true;
      loadRequest += 1;
      window.removeEventListener("keydown", onPhysicalKey);
      if (document.documentElement.dataset.game === "word") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
