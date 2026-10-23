import type { ViewHandle } from "../../home";
import type { DataSource } from "../../shared/data-source";
import { gameById, gameIdOf } from "../../shared/roster";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { hasGameBit } from "../../shared/streaks";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import { CODE_LENGTH, pegsLabel, scoreCode } from "./engine";
import { codeAnswer } from "./generate";
import {
  applyCodeGuess,
  loadCodeProgress,
  prepareCodeSubmissionRetry,
  saveCodeProgress,
  submitCodeOnce,
  type CodeProgress,
} from "./progress";

const GAME = gameById("code")!;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "backspace", "0", "enter"] as const;

function statusFor(progress: CodeProgress, alreadyRecorded: boolean): string {
  if (alreadyRecorded) {
    return "";
  }
  const result = `Cracked in ${progress.guesses.length} ${progress.guesses.length === 1 ? "guess" : "guesses"}.`;
  switch (progress.submission) {
    case "submitted":
      return `${result} Score recorded.`;
    case "submitting":
      return `${result} Recording your score…`;
    case "deferred":
      return `${result} Your result is safe on this device. Open Daily on Dot in the Polkadot app to record it.`;
    case "failed":
      return `${result} Your result is safe on this device. Recording failed.`;
    default:
      return result;
  }
}

/** A row of the history: the four digits, then ● per digit in place and ○ per digit elsewhere. */
function createGuessRow(guess: string, answer: string): HTMLElement {
  const pegs = scoreCode(guess, answer);
  const row = document.createElement("li");
  row.className = "code-row";
  row.dataset.codeGuess = guess;
  const digits = document.createElement("span");
  digits.className = "code-row-digits";
  for (const digit of guess) {
    const cell = document.createElement("span");
    cell.className = "code-digit";
    cell.textContent = digit;
    digits.append(cell);
  }
  const marks = document.createElement("span");
  marks.className = "code-pegs";
  marks.setAttribute("aria-label", pegsLabel(pegs));
  marks.dataset.exact = String(pegs.exact);
  marks.dataset.near = String(pegs.near);
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const peg = document.createElement("i");
    peg.className =
      index < pegs.exact
        ? "code-peg code-peg--exact"
        : index < pegs.exact + pegs.near
          ? "code-peg code-peg--near"
          : "code-peg";
    marks.append(peg);
  }
  row.append(digits, marks);
  return row;
}

export function renderCode(source: DataSource, requestedDay?: number): ViewHandle {
  const page = document.createElement("section");
  page.className = "page code-page";
  page.dataset.game = "code";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Crack the code.</h1>
      </div>
    </div>
    <div class="code-shell" data-code-shell>
      <div class="game-loading">Loading today's code…</div>
    </div>
  `;
  document.documentElement.dataset.game = "code";
  const gameRule = createGameRule("Four digits. ● right digit, right place. ○ right digit, wrong place.");
  page.append(gameRule);
  const shell = page.querySelector<HTMLElement>("[data-code-shell]")!;

  let disposed = false;
  let progress: CodeProgress | null = null;
  let alreadyRecorded = false;
  let today = 0;
  let draft = "";
  let message = "";
  let loadRequest = 0;
  const resultPanel = createResultPanel(source, GAME, { unit: "guess" });

  const submitAndRender = (): void => {
    if (!progress) {
      return;
    }
    void submitCodeOnce(source, progress)
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          renderGame();
        }
      });
  };

  const handleKey = (key: string): void => {
    if (!progress || progress.complete || alreadyRecorded) {
      return;
    }
    if (key === "backspace") {
      draft = draft.slice(0, -1);
      message = "";
    } else if (key === "enter") {
      const result = applyCodeGuess(progress, draft);
      if (!result.accepted) {
        message = result.message;
      } else {
        progress = result.progress;
        saveCodeProgress(progress);
        draft = "";
        message = "";
        if (progress.complete) {
          renderGame();
          submitAndRender();
          return;
        }
      }
    } else if (/^\d$/.test(key) && draft.length < CODE_LENGTH) {
      draft += key;
      message = "";
    }
    renderGame();
  };

  const renderGame = (): void => {
    if (!progress) {
      return;
    }
    const readOnly = alreadyRecorded || progress.complete;
    gameRule.hidden = readOnly;
    const stage = document.createElement("div");
    stage.className = "code-stage";
    stage.classList.toggle("code-stage--done", readOnly);

    const meta = document.createElement("div");
    meta.className = "code-meta";
    meta.innerHTML = `<span>GUESSES</span><strong data-code-count>${progress.guesses.length}</strong>`;
    stage.append(meta);

    const list = document.createElement("ol");
    list.className = "code-list";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Your guesses");
    if (progress.guesses.length === 0) {
      const empty = document.createElement("li");
      empty.className = "code-empty";
      empty.textContent = readOnly ? `The code was ${progress.answer}.` : "Your guesses and their pegs appear here.";
      list.append(empty);
    } else {
      for (const guess of progress.guesses) {
        list.append(createGuessRow(guess, progress.answer));
      }
    }
    stage.append(list);

    if (!readOnly) {
      const entry = document.createElement("div");
      entry.className = "code-entry";
      entry.setAttribute("aria-label", `Your guess: ${draft.split("").join(" ") || "empty"}`);
      entry.dataset.codeDraft = draft;
      for (let index = 0; index < CODE_LENGTH; index += 1) {
        const slot = document.createElement("span");
        slot.className = "code-slot";
        slot.classList.toggle("code-slot--filled", index < draft.length);
        slot.textContent = draft[index] ?? "";
        entry.append(slot);
      }
      const status = document.createElement("p");
      status.className = "code-message";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent = message;

      const pad = document.createElement("div");
      pad.className = "code-pad";
      pad.setAttribute("aria-label", "Number pad");
      for (const key of KEYS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "code-key";
        button.dataset.key = key;
        if (key === "backspace") {
          button.textContent = "⌫";
          button.setAttribute("aria-label", "Delete");
        } else if (key === "enter") {
          button.textContent = "Guess";
          button.classList.add("code-key--enter");
          button.disabled = draft.length !== CODE_LENGTH;
        } else {
          button.textContent = key;
        }
        button.addEventListener("click", () => handleKey(key));
        pad.append(button);
      }
      stage.append(entry, status, pad);
    } else {
      const result = document.createElement("p");
      result.className = "code-result";
      result.setAttribute("role", "status");
      result.textContent = statusFor(progress, alreadyRecorded);
      if (alreadyRecorded) {
        result.replaceChildren(
          createPlayedNotice(GAME, progress.day, today),
          ` The code was ${progress.answer}.`,
        );
      }
      stage.append(result, resultPanel.element);
      if (!alreadyRecorded && progress.complete && progress.submission === "failed") {
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try recording again";
        retry.addEventListener("click", () => {
          if (!progress) {
            return;
          }
          prepareCodeSubmissionRetry(progress);
          renderGame();
          submitAndRender();
        });
        stage.append(retry);
      }
    }

    // Save from the unsaved result (after Not now): the prompt opens again.
    const onSave = !alreadyRecorded && progress.complete && progress.submission === "pending"
      ? submitAndRender
      : undefined;
    const shown = !alreadyRecorded && progress.complete && showsResult(progress.submission);
    resultPanel.update({
      day: progress.day,
      score: progress.guesses.length,
      recorded: shown && progress.submission === "submitted",
      pendingSave: shown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      detail: `the code was ${progress.answer}`,
      onSave,
    });
    syncResultChrome(page, GAME, progress.day, shown);

    shell.replaceChildren(stage);
    list.scrollTop = list.scrollHeight;
  };

  const onPhysicalKey = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      handleKey("enter");
    } else if (event.key === "Backspace") {
      handleKey("backspace");
    } else if (/^\d$/.test(event.key)) {
      handleKey(event.key);
    }
  };
  window.addEventListener("keydown", onPhysicalKey);

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    gameRule.hidden = true;
    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      const answer = codeAnswer(day, "v1");
      const bits = await source.dayBits(day);
      if (disposed || request !== loadRequest) {
        return;
      }
      setHeaderGame(GAME, day);
      progress = loadCodeProgress(day, answer);
      // A day finished on this device shows from its local copy; the chain only
      // confirms the record. A recorded day with no local copy opens read-only.
      const onChain = hasGameBit(bits.played, gameIdOf("code"));
      if (onChain && progress.complete) {
        progress.submission = "submitted";
      }
      alreadyRecorded = onChain && !progress.complete;
      renderGame();
      if (
        progress.complete
        && (progress.submission === "pending" || progress.submission === "deferred")
        && !alreadyRecorded
      ) {
        submitAndRender();
      }
    } catch (error) {
      if (!disposed && request === loadRequest) {
        const failure = document.createElement("div");
        failure.className = "game-error";
        const heading = document.createElement("strong");
        heading.textContent = "Code unavailable";
        const text = document.createElement("p");
        text.textContent = error instanceof Error ? error.message : "Please try again.";
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try again";
        retry.addEventListener("click", () => void loadGame());
        const back = document.createElement("a");
        back.className = "button-link game-error-back";
        back.href = "#/";
        back.textContent = "Back to home";
        failure.append(heading, text, retry, back);
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
      if (document.documentElement.dataset.game === "code") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
