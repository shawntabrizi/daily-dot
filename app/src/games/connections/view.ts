import type { ViewHandle } from "../../home";
import type {
  ConnectionsGroup,
  ConnectionsPuzzle,
  DataSource,
} from "../../shared/data-source";
import { gameById } from "../../shared/roster";
import { hasGameBit } from "../../shared/streaks";
import { connectionsRows } from "../../shared/share";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import {
  assertConnectionsPuzzle,
  CONNECTIONS_GAME_ID,
  CONNECTIONS_GROUP_SIZE,
  CONNECTIONS_TIERS,
  groupsByTier,
} from "./engine";
import {
  deselectConnections,
  loadConnectionsProgress,
  prepareConnectionsSubmissionRetry,
  saveConnectionsProgress,
  shuffleConnections,
  submitConnectionsGuess,
  submitConnectionsOnce,
  toggleConnectionsWord,
  type ConnectionsProgress,
} from "./progress";

function mistakesText(mistakes: number): string {
  return `Finished with ${mistakes} ${mistakes === 1 ? "mistake" : "mistakes"}.`;
}

/** Four dots by the h1: one fills in the accent per mistake (the board). */
const MISTAKE_DOTS = 4;

function mistakesLabel(mistakes: number): string {
  return `${mistakes} ${mistakes === 1 ? "mistake" : "mistakes"}`;
}

function createMistakes(mistakes: number): HTMLElement {
  const dots = document.createElement("span");
  dots.className = "connections-mistakes";
  dots.dataset.mistakeDots = String(Math.min(MISTAKE_DOTS, mistakes));
  dots.setAttribute("role", "img");
  dots.setAttribute("aria-label", mistakesLabel(mistakes));
  for (let index = 0; index < MISTAKE_DOTS; index += 1) {
    const dot = document.createElement("i");
    dot.classList.toggle("is-filled", index < mistakes);
    dots.append(dot);
  }
  return dots;
}

function resultText(
  progress: ConnectionsProgress,
  alreadyRecorded: boolean,
): string {
  if (alreadyRecorded) {
    return "";
  }
  const result = mistakesText(progress.mistakes);
  if (progress.submission === "submitted") {
    return `${result} Score recorded.`;
  }
  if (progress.submission === "submitting") {
    return `${result} Recording your score…`;
  }
  if (progress.submission === "deferred") {
    return `${result} Your result is safe on this device. Open Daily on Dot in the Polkadot app to record it.`;
  }
  if (progress.submission === "failed") {
    return `${result} Your result is safe on this device. Recording failed.`;
  }
  return result;
}

function createBar(group: ConnectionsGroup): HTMLElement {
  const bar = document.createElement("div");
  bar.className = `connections-bar connections-bar--tier-${group.tier}`;
  bar.dataset.connectionsBar = String(group.tier);
  bar.setAttribute("role", "listitem");
  bar.setAttribute(
    "aria-label",
    `${CONNECTIONS_TIERS[group.tier]?.name ?? "Tier"} group, ${group.label}: ${group.words.join(", ")}`,
  );
  const label = document.createElement("strong");
  label.textContent = group.label;
  const words = document.createElement("span");
  words.textContent = group.words.join(" · ");
  bar.append(label, words);
  return bar;
}

function createGrid(
  order: readonly string[],
  selected: readonly string[],
  readOnly: boolean,
  onWord: (word: string) => void,
): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "connections-grid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Words still on the board");
  for (const word of order) {
    const isSelected = selected.includes(word);
    const tile = document.createElement("button");
    tile.className = "connections-tile";
    tile.classList.toggle("connections-tile--selected", isSelected);
    // The board: 13 px, 12 px from nine letters, 11 px from twelve.
    tile.classList.toggle("connections-tile--long", word.length >= 9);
    tile.classList.toggle("connections-tile--longer", word.length >= 12);
    tile.type = "button";
    tile.dataset.connectionsWord = word;
    tile.disabled = readOnly;
    tile.setAttribute("aria-pressed", String(isSelected));
    tile.textContent = word;
    tile.addEventListener("click", () => onWord(word));
    grid.append(tile);
  }
  return grid;
}

export function renderConnections(
  source: DataSource,
  requestedDay?: number,
): ViewHandle {
  const page = document.createElement("section");
  page.className = "page connections-page";
  page.innerHTML = `
    <div class="connections-heading">
      <h1>Four groups of four.</h1>
      <span class="connections-heading-side">
        <span data-connections-mistakes-slot></span>
      </span>
    </div>
    <div class="connections-main" data-connections-main>
      <div class="game-loading">Loading today's groups…</div>
    </div>
  `;
  page.dataset.game = "connections";
  document.documentElement.dataset.game = "connections";
  const gameRule = createGameRule("Tap four words that go together, then submit.");
  page.append(gameRule);

  const shell = page.querySelector<HTMLElement>("[data-connections-main]");
  const mistakesSlot = page.querySelector<HTMLElement>("[data-connections-mistakes-slot]");
  if (!shell || !mistakesSlot) {
    throw new Error("Connections page failed to render");
  }

  let disposed = false;
  let puzzle: ConnectionsPuzzle | null = null;
  let progress: ConnectionsProgress | null = null;
  let alreadyRecorded = false;
  let today = 0;
  const resultPanel = createResultPanel(source, gameById("connections")!, { unit: "mistake" });
  let statusMessage = "";
  let loadRequest = 0;

  const save = (): void => {
    if (progress && !alreadyRecorded) {
      saveConnectionsProgress(progress);
    }
  };

  const renderGame = (): void => {
    if (!puzzle || !progress) {
      return;
    }
    const readOnly = alreadyRecorded || progress.complete;
    gameRule.hidden = readOnly;

    const stage = document.createElement("div");
    stage.className = "connections-stage";
    // The done board earns the accent (decision 1).
    stage.classList.toggle("connections-stage--done", readOnly);

    // A recorded archive day has no local history, so no mistake dots.
    mistakesSlot.replaceChildren(
      ...(alreadyRecorded ? [] : [createMistakes(progress.mistakes)]),
    );

    // Save from the unsaved result (after Not now): the prompt opens again.
    const finished = progress;
    const onSave = !alreadyRecorded && progress.complete && progress.submission === "pending"
      ? () => {
        void submitConnectionsOnce(source, finished)
          .catch(() => undefined)
          .finally(() => {
            if (!disposed) {
              renderGame();
            }
          });
      }
      : undefined;
    const shown = !alreadyRecorded && progress.complete && showsResult(progress.submission);

    resultPanel.update({
      day: progress.day,
      score: progress.mistakes,
      recorded: shown && progress.submission === "submitted",
      pendingSave: shown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      detail: "4 groups",
      shareLines: connectionsRows(progress.guesses.map((guess) => guess.tiers)),
      onSave,
    });
    syncResultChrome(page, gameById("connections")!, progress.day, shown);

    const board = document.createElement("div");
    board.className = "connections-board";
    const bars = document.createElement("div");
    bars.className = "connections-bars";
    bars.setAttribute("role", "list");
    // A recorded archive day has no local history: show the groups by tier.
    const shownGroups = alreadyRecorded
      ? groupsByTier(puzzle)
      : progress.found.map((index) => puzzle!.groups[index]!);
    for (const group of shownGroups) {
      bars.append(createBar(group));
    }
    board.append(bars);
    if (!alreadyRecorded && progress.order.length > 0) {
      board.append(
        createGrid(progress.order, progress.selected, readOnly, handleWord),
      );
    }

    // The status line sits below the grid (the board).
    const message = document.createElement(readOnly ? "div" : "p");
    message.className = readOnly ? "connections-result" : "connections-message";
    message.setAttribute("role", "status");
    if (!readOnly) {
      message.setAttribute("aria-live", "polite");
    }
    message.textContent = readOnly
      ? resultText(progress, alreadyRecorded)
      : statusMessage || "Select four words.";
    if (alreadyRecorded) {
      message.replaceChildren(createPlayedNotice(gameById("connections")!, progress.day, today));
    }
    // Board, status, then the result (decision 5); the done stage scrolls.
    stage.append(board, message, resultPanel.element);

    const actions = document.createElement("div");
    actions.className = "connections-actions";
    if (!readOnly) {
      const shuffle = document.createElement("button");
      shuffle.className = "connections-action";
      shuffle.type = "button";
      shuffle.dataset.connectionsShuffle = "";
      shuffle.textContent = "Shuffle";
      shuffle.addEventListener("click", handleShuffle);
      const clear = document.createElement("button");
      clear.className = "connections-action";
      clear.type = "button";
      clear.dataset.connectionsClear = "";
      clear.textContent = "Clear";
      clear.addEventListener("click", handleClear);
      const submit = document.createElement("button");
      submit.className = "connections-action connections-action--submit";
      submit.type = "button";
      submit.dataset.connectionsSubmit = "";
      const ready = progress.selected.length === CONNECTIONS_GROUP_SIZE;
      // Tinted until four are picked, then the solid accent (the board).
      submit.classList.toggle("connections-action--ready", ready);
      submit.disabled = !ready;
      submit.textContent = "Submit";
      submit.addEventListener("click", () => void handleSubmit());
      actions.append(shuffle, clear, submit);
    } else if (!alreadyRecorded) {
      if (progress.submission === "failed") {
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try recording again";
        retry.addEventListener("click", () => {
          if (!progress) {
            return;
          }
          prepareConnectionsSubmissionRetry(progress);
          renderGame();
          void submitConnectionsOnce(source, progress)
            .catch(() => undefined)
            .finally(() => {
              if (!disposed) {
                renderGame();
              }
            });
        });
        actions.append(retry);
      }
    }
    stage.append(actions);
    shell.replaceChildren(stage);
  };

  const handleWord = (word: string): void => {
    if (!progress || progress.complete || alreadyRecorded) {
      return;
    }
    const next = toggleConnectionsWord(progress, word);
    if (
      next.selected.length === progress.selected.length
      && !progress.selected.includes(word)
    ) {
      statusMessage = "Four words are already selected.";
    } else {
      statusMessage = `${next.selected.length} of ${CONNECTIONS_GROUP_SIZE} selected.`;
    }
    progress = next;
    save();
    renderGame();
    [...shell.querySelectorAll<HTMLButtonElement>("[data-connections-word]")]
      .find((tile) => tile.dataset.connectionsWord === word)
      ?.focus();
  };

  const handleShuffle = (): void => {
    if (!progress || progress.complete || alreadyRecorded) {
      return;
    }
    progress = shuffleConnections(progress);
    statusMessage = "Board shuffled.";
    save();
    renderGame();
    shell.querySelector<HTMLButtonElement>("[data-connections-shuffle]")?.focus();
  };

  const handleClear = (): void => {
    if (!progress || progress.complete || alreadyRecorded) {
      return;
    }
    progress = deselectConnections(progress);
    statusMessage = "Selection cleared.";
    save();
    renderGame();
    shell.querySelector<HTMLButtonElement>("[data-connections-shuffle]")?.focus();
  };

  const handleSubmit = async (): Promise<void> => {
    if (
      !puzzle
      || !progress
      || progress.complete
      || alreadyRecorded
      || progress.selected.length !== CONNECTIONS_GROUP_SIZE
    ) {
      return;
    }
    const result = submitConnectionsGuess(progress, puzzle);
    progress = result.progress;
    switch (result.outcome.kind) {
      case "correct": {
        const group = puzzle.groups[result.outcome.group]!;
        statusMessage = progress.complete
          ? "All four groups found."
          : `${group.label} — found.`;
        break;
      }
      case "one-away":
        statusMessage = "One away…";
        break;
      case "wrong":
        statusMessage = "Not a group.";
        break;
      case "repeat":
        statusMessage = "Already tried that set.";
        break;
    }
    save();
    renderGame();
    if (!progress.complete) {
      shell.querySelector<HTMLButtonElement>("[data-connections-shuffle]")?.focus();
      return;
    }

    try {
      await submitConnectionsOnce(source, progress);
    } catch {
      // The finished result remains local and exposes an explicit retry.
    }
    if (!disposed) {
      renderGame();
    }
  };

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    gameRule.hidden = true;
    shell.innerHTML = '<div class="game-loading">Loading today\'s groups…</div>';

    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      setHeaderGame(gameById("connections")!, day);
      if (!source.connectionsPuzzle) {
        throw new Error("This data source does not provide Connections puzzles.");
      }
      const [loadedPuzzle, bits] = await Promise.all([
        source.connectionsPuzzle(day),
        source.dayBits(day),
      ]);
      if (disposed || request !== loadRequest) {
        return;
      }
      assertConnectionsPuzzle(loadedPuzzle);

      puzzle = loadedPuzzle;
      progress = loadConnectionsProgress(day, puzzle);
      // A day finished on this device shows from its local copy; the chain
      // only confirms the record. A recorded day with no local copy opens read-only.
      const onChain = hasGameBit(bits.played, CONNECTIONS_GAME_ID);
      if (onChain && progress.complete) {
        progress.submission = "submitted";
      }
      alreadyRecorded = onChain && !progress.complete;
      statusMessage = "";
      renderGame();

      if (
        progress.complete
        && (progress.submission === "pending"
          || progress.submission === "deferred")
        && !alreadyRecorded
      ) {
        try {
          await submitConnectionsOnce(source, progress);
        } catch {
          // Reload recovery follows the local-first completion path.
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
        heading.textContent = "Puzzle unavailable";
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
      if (document.documentElement.dataset.game === "connections") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
