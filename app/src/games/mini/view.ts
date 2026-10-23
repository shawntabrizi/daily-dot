import type { ViewHandle } from "../../home";
import type { DataSource, MiniPuzzle } from "../../shared/data-source";
import { gameById } from "../../shared/roster";
import { hasGameBit } from "../../shared/streaks";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import { createKeyboard } from "../../shared/ui/keyboard";
import {
  MINI_CELLS,
  MINI_SIZE,
  miniEntries,
  miniGridFilled,
  miniGridShapeError,
  type MiniDirection,
  type MiniEntry,
  type MiniLayout,
} from "./grid";
import {
  loadMiniProgress,
  MINI_GAME_ID,
  miniFilled,
  miniSolved,
  prepareMiniSubmissionRetry,
  saveMiniProgress,
  setMiniLetter,
  submitMiniOnce,
  type MiniProgress,
} from "./progress";

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/** Entries in numbering order, across before down, for next/previous. */
function entrySequence(layout: MiniLayout): MiniEntry[] {
  return [...layout.across, ...layout.down];
}

function entryContaining(
  layout: MiniLayout,
  cell: number,
  dir: MiniDirection,
): MiniEntry | undefined {
  return layout[dir].find((entry) => entry.cells.includes(cell));
}

export function renderMini(
  source: DataSource,
  requestedDay?: number,
): ViewHandle {
  const page = document.createElement("section");
  page.className = "page mini-page";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Five by five.</h1>
      </div>
    </div>
    <div class="mini-shell" data-mini-shell>
      <div class="game-loading">Loading today's mini…</div>
    </div>
  `;
  page.dataset.game = "mini";
  document.documentElement.dataset.game = "mini";
  const gameRule = createGameRule("Tap a square and type. Tap again to change direction.");
  page.append(gameRule);

  const shell = page.querySelector<HTMLElement>("[data-mini-shell]");
  if (!shell) {
    throw new Error("Mini shell failed to render");
  }

  let disposed = false;
  let loadRequest = 0;
  let puzzle: MiniPuzzle | null = null;
  let layout: MiniLayout | null = null;
  let progress: MiniProgress | null = null;
  let alreadyRecorded = false;
  let today = 0;
  const resultPanel = createResultPanel(source, gameById("mini")!);
  let selected = 0;
  let direction: MiniDirection = "across";
  let cluesOpen = false;
  let timer = 0;
  let timerStartedAt = 0;
  let timerBaseSeconds = 0;
  let lastSavedSecond = -1;

  const isReadOnly = (): boolean =>
    alreadyRecorded || (progress?.complete ?? false);

  const elapsedNow = (): number => {
    if (!progress) {
      return 0;
    }
    if (isReadOnly() || timerStartedAt === 0) {
      return progress.elapsedSeconds;
    }
    return Math.min(
      0xffff_ffff,
      timerBaseSeconds + Math.floor((Date.now() - timerStartedAt) / 1_000),
    );
  };

  const syncElapsed = (save = true): void => {
    if (!progress || isReadOnly()) {
      return;
    }
    progress.elapsedSeconds = elapsedNow();
    if (save) {
      saveMiniProgress(progress);
      lastSavedSecond = progress.elapsedSeconds;
    }
  };

  const updateTimer = (): void => {
    const elapsed = elapsedNow();
    const node = shell.querySelector<HTMLElement>("[data-mini-timer]");
    if (node) {
      node.textContent = formatElapsed(elapsed);
      node.setAttribute("aria-label", `${elapsed} seconds elapsed`);
    }
    if (progress && elapsed !== lastSavedSecond && !isReadOnly()) {
      progress.elapsedSeconds = elapsed;
      saveMiniProgress(progress);
      lastSavedSecond = elapsed;
    }
  };

  const stopTimer = (): void => {
    window.clearInterval(timer);
    timer = 0;
  };

  const startTimer = (): void => {
    if (!progress || isReadOnly()) {
      return;
    }
    timerBaseSeconds = progress.elapsedSeconds;
    timerStartedAt = Date.now();
    lastSavedSecond = progress.elapsedSeconds;
    stopTimer();
    timer = window.setInterval(updateTimer, 250);
  };

  const activeEntry = (): MiniEntry | undefined =>
    layout ? entryContaining(layout, selected, direction) : undefined;

  const clueFor = (entry: MiniEntry): string => {
    if (!puzzle || !layout) {
      return "";
    }
    const index = layout[entry.dir].indexOf(entry);
    return puzzle[entry.dir][index] ?? "";
  };

  const selectCell = (cell: number, flip: boolean): void => {
    if (!layout || progress?.letters[cell] === "#") {
      return;
    }
    if (flip && cell === selected) {
      const other: MiniDirection = direction === "across" ? "down" : "across";
      if (entryContaining(layout, cell, other)) {
        direction = other;
      }
    } else if (!entryContaining(layout, cell, direction)) {
      direction = direction === "across" ? "down" : "across";
    }
    selected = cell;
  };

  const selectEntry = (entry: MiniEntry): void => {
    direction = entry.dir;
    const firstEmpty = entry.cells.find((cell) => progress?.letters[cell] === ".");
    selected = firstEmpty ?? entry.cells[0]!;
  };

  const stepEntry = (delta: number): void => {
    if (!layout) {
      return;
    }
    const sequence = entrySequence(layout);
    const current = activeEntry();
    const index = current ? sequence.indexOf(current) : -1;
    const next = sequence[(index + delta + sequence.length) % sequence.length]!;
    selectEntry(next);
  };

  const focusSelected = (): void => {
    shell
      .querySelector<HTMLButtonElement>(`[data-mini-cell="${selected}"]`)
      ?.focus();
  };

  const renderStatus = (): HTMLElement => {
    const status = document.createElement("div");
    status.className = "mini-status";
    status.setAttribute("role", "status");
    status.dataset.miniStatus = "";
    if (!progress) {
      return status;
    }
    if (alreadyRecorded && !progress.complete) {
      status.replaceChildren(createPlayedNotice(gameById("mini")!, progress.day, today));
      return status;
    }
    if (!progress.complete) {
      status.textContent = miniFilled(progress.letters)
        ? "Every square is filled, but something is off."
        : "";
      return status;
    }
    const heading = document.createElement("strong");
    heading.textContent = `Solved in ${formatElapsed(progress.elapsedSeconds)}.`;
    const message = document.createElement("span");
    if (progress.submission === "submitted") {
      message.textContent = "Score recorded.";
    } else if (progress.submission === "submitting") {
      message.textContent = "Recording your score…";
    } else if (progress.submission === "deferred") {
      message.textContent =
        "Your grid is safe on this device. Open Daily on Dot in the Polkadot app to record it.";
    } else if (progress.submission === "failed") {
      message.textContent = "Your grid is safe on this device. Recording failed.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button-link mini-retry";
      retry.dataset.submissionRetry = "";
      retry.textContent = "Try recording again";
      retry.addEventListener("click", () => {
        if (!progress) {
          return;
        }
        prepareMiniSubmissionRetry(progress);
        renderGame();
        void submitMiniOnce(source, progress)
          .catch(() => undefined)
          .finally(renderGame);
      });
      status.append(heading, message, retry);
      return status;
    } else {
      message.textContent = "Puzzle complete.";
    }
    status.append(heading, message);
    return status;
  };

  const renderClueList = (dir: MiniDirection, readOnly: boolean): HTMLElement => {
    const section = document.createElement("section");
    section.className = "mini-clue-list";
    const heading = document.createElement("h3");
    heading.textContent = dir === "across" ? "Across" : "Down";
    const list = document.createElement("ol");
    const current = activeEntry();
    for (const entry of layout?.[dir] ?? []) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-clue";
      button.dataset.miniClue = `${entry.n}${dir === "across" ? "A" : "D"}`;
      button.disabled = readOnly;
      button.classList.toggle("mini-clue--active", entry === current);
      button.innerHTML = `<b>${entry.n}</b><span></span>`;
      button.querySelector("span")!.textContent = clueFor(entry);
      button.addEventListener("click", () => {
        selectEntry(entry);
        cluesOpen = false;
        renderGame();
        focusSelected();
      });
      item.append(button);
      list.append(item);
    }
    section.append(heading, list);
    return section;
  };

  const renderGame = (): void => {
    if (!progress || !layout || !puzzle) {
      return;
    }
    const readOnly = isReadOnly();
    gameRule.hidden = readOnly;
    const letters =
      alreadyRecorded && !progress.complete ? puzzle.grid : progress.letters;
    const current = readOnly ? undefined : activeEntry();

    const stage = document.createElement("div");
    stage.className = "mini-stage";
    stage.innerHTML = `
      <div class="mini-toolbar">
        <span class="mini-timer" data-mini-timer>00:00</span>
        ${
          readOnly
            ? '<span class="mini-mode-label">DONE</span>'
            : `<button class="mini-clues-toggle" type="button" data-mini-clues-toggle aria-expanded="${cluesOpen}">Clues</button>`
        }
      </div>
      <div class="mini-board">
        <div class="mini-grid${readOnly ? " mini-grid--solved" : ""}" data-mini-grid role="grid" aria-label="Crossword grid"></div>
        <div class="mini-clues${cluesOpen ? " mini-clues--open" : ""}" data-mini-clues></div>
      </div>
      <div class="mini-cluebar" data-mini-cluebar hidden>
        <button type="button" class="mini-cluebar-step" data-mini-previous aria-label="Previous clue">‹</button>
        <span class="mini-cluebar-text"><b data-mini-cluebar-number></b><span data-mini-cluebar-clue></span></span>
        <button type="button" class="mini-cluebar-step" data-mini-next aria-label="Next clue">›</button>
      </div>
      <div data-keyboard></div>
    `;

    const grid = stage.querySelector<HTMLElement>("[data-mini-grid]");
    const clues = stage.querySelector<HTMLElement>("[data-mini-clues]");
    const cluebar = stage.querySelector<HTMLElement>("[data-mini-cluebar]");
    const keyboardTarget = stage.querySelector<HTMLElement>("[data-keyboard]");
    if (!grid || !clues || !cluebar || !keyboardTarget) {
      throw new Error("Mini stage failed to render");
    }

    for (let index = 0; index < MINI_CELLS; index += 1) {
      const row = Math.floor(index / MINI_SIZE);
      const column = index % MINI_SIZE;
      if (puzzle.grid[index] === "#") {
        const black = document.createElement("span");
        black.className = "mini-cell mini-cell--black";
        black.setAttribute("role", "gridcell");
        black.setAttribute("aria-hidden", "true");
        grid.append(black);
        continue;
      }
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mini-cell";
      cell.dataset.miniCell = String(index);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-rowindex", String(row + 1));
      cell.setAttribute("aria-colindex", String(column + 1));
      cell.disabled = readOnly;
      cell.tabIndex = index === selected && !readOnly ? 0 : -1;
      const inEntry = current?.cells.includes(index) ?? false;
      cell.classList.toggle("mini-cell--selected", !readOnly && index === selected);
      cell.classList.toggle("mini-cell--entry", inEntry && index !== selected);
      cell.classList.toggle("mini-cell--solved", readOnly);
      const number = layout.numbers[index];
      const letter = letters[index] === "." ? "" : letters[index]!;
      cell.setAttribute(
        "aria-label",
        `Row ${row + 1}, column ${column + 1}${number ? `, clue ${number}` : ""}${letter ? `, ${letter}` : ", empty"}`,
      );
      if (number) {
        const badge = document.createElement("i");
        badge.className = "mini-cell-number";
        badge.textContent = String(number);
        cell.append(badge);
      }
      const text = document.createElement("span");
      text.className = "mini-cell-letter";
      text.textContent = letter;
      cell.append(text);
      cell.addEventListener("click", () => {
        if (readOnly) {
          return;
        }
        selectCell(index, true);
        renderGame();
        focusSelected();
      });
      grid.append(cell);
    }

    clues.append(renderClueList("across", readOnly), renderClueList("down", readOnly));

    if (!readOnly && current) {
      cluebar.hidden = false;
      const number = cluebar.querySelector<HTMLElement>("[data-mini-cluebar-number]");
      const text = cluebar.querySelector<HTMLElement>("[data-mini-cluebar-clue]");
      if (number && text) {
        number.textContent = `${current.n}${current.dir === "across" ? "A" : "D"}`;
        text.textContent = clueFor(current);
      }
      cluebar.querySelector("[data-mini-previous]")?.addEventListener("click", () => {
        stepEntry(-1);
        renderGame();
        focusSelected();
      });
      cluebar.querySelector("[data-mini-next]")?.addEventListener("click", () => {
        stepEntry(1);
        renderGame();
        focusSelected();
      });
    }

    stage.querySelector("[data-mini-clues-toggle]")?.addEventListener("click", () => {
      cluesOpen = !cluesOpen;
      renderGame();
    });

    stage.append(renderStatus(), resultPanel.element);
    // Save from the unsaved result (after Not now): the prompt opens again.
    const finished = progress;
    const onSave = progress.complete && progress.submission === "pending"
      ? () => {
        void submitMiniOnce(source, finished)
          .catch(() => undefined)
          .finally(renderGame);
      }
      : undefined;
    const shown = progress.complete && showsResult(progress.submission);
    resultPanel.update({
      day: progress.day,
      score: progress.elapsedSeconds,
      recorded: shown && progress.submission === "submitted",
      pendingSave: shown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      onSave,
    });
    syncResultChrome(page, gameById("mini")!, progress.day, shown);

    if (!readOnly) {
      keyboardTarget.append(createKeyboard((key) => void handleKey(key), new Map()));
    } else {
      keyboardTarget.remove();
    }

    shell.replaceChildren(stage);
    updateTimer();
  };

  const completeIfSolved = async (): Promise<void> => {
    if (!progress || !puzzle || progress.complete || !miniSolved(progress.letters, puzzle.grid)) {
      return;
    }
    syncElapsed(false);
    progress.complete = true;
    progress.submission = "pending";
    stopTimer();
    saveMiniProgress(progress);
    renderGame();

    try {
      await submitMiniOnce(source, progress);
    } catch {
      // The solved grid stays local and offers the explicit retry.
    }
    if (!disposed) {
      renderGame();
    }
  };

  const typeLetter = async (letter: string): Promise<void> => {
    if (!progress || !layout || isReadOnly()) {
      return;
    }
    const entry = activeEntry();
    progress = setMiniLetter(progress, selected, letter);
    syncElapsed(false);
    saveMiniProgress(progress);
    if (entry) {
      const position = entry.cells.indexOf(selected);
      if (position < entry.cells.length - 1) {
        selected = entry.cells[position + 1]!;
      } else if (!miniFilled(progress.letters)) {
        stepEntry(1);
      }
    }
    renderGame();
    focusSelected();
    await completeIfSolved();
  };

  const erase = (): void => {
    if (!progress || !layout || isReadOnly()) {
      return;
    }
    const entry = activeEntry();
    if (progress.letters[selected] === "." && entry) {
      const position = entry.cells.indexOf(selected);
      if (position > 0) {
        selected = entry.cells[position - 1]!;
      }
    }
    progress = setMiniLetter(progress, selected, ".");
    syncElapsed(false);
    saveMiniProgress(progress);
    renderGame();
    focusSelected();
  };

  const moveSelection = (rowDelta: number, columnDelta: number): void => {
    if (!progress) {
      return;
    }
    direction = rowDelta !== 0 ? "down" : "across";
    let row = Math.floor(selected / MINI_SIZE);
    let column = selected % MINI_SIZE;
    for (let step = 0; step < MINI_SIZE; step += 1) {
      row = (row + rowDelta + MINI_SIZE) % MINI_SIZE;
      column = (column + columnDelta + MINI_SIZE) % MINI_SIZE;
      const index = row * MINI_SIZE + column;
      if (progress.letters[index] !== "#") {
        selectCell(index, false);
        break;
      }
    }
    renderGame();
    focusSelected();
  };

  const handleKey = async (key: string): Promise<void> => {
    if (key === "enter") {
      stepEntry(1);
      renderGame();
      focusSelected();
    } else if (key === "backspace") {
      erase();
    } else if (/^[a-z]$/.test(key)) {
      await typeLetter(key.toUpperCase());
    }
  };

  const onPhysicalKey = (event: KeyboardEvent): void => {
    if (!progress || isReadOnly() || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (/^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      void handleKey(event.key.toLowerCase());
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      erase();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      stepEntry(event.shiftKey ? -1 : 1);
      renderGame();
      focusSelected();
    } else if (event.key === " ") {
      event.preventDefault();
      selectCell(selected, true);
      renderGame();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1, 0);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1, 0);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(0, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(0, 1);
    }
  };
  window.addEventListener("keydown", onPhysicalKey);

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    stopTimer();
    gameRule.hidden = true;
    shell.innerHTML = '<div class="game-loading">Loading today\'s mini…</div>';

    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      setHeaderGame(gameById("mini")!, day);
      if (!source.miniPuzzle) {
        throw new Error("This data source does not provide mini crosswords.");
      }
      const [loaded, bits] = await Promise.all([
        source.miniPuzzle(day),
        source.dayBits(day),
      ]);
      const shape = miniGridShapeError(loaded.grid);
      if (shape || !miniGridFilled(loaded.grid)) {
        throw new Error("The puzzle data is invalid.");
      }
      const entries = miniEntries(loaded.grid);
      if (
        loaded.across.length !== entries.across.length
        || loaded.down.length !== entries.down.length
      ) {
        throw new Error("The puzzle data is invalid.");
      }
      if (disposed || request !== loadRequest) {
        return;
      }

      puzzle = loaded;
      layout = entries;
      progress = loadMiniProgress(day, loaded.grid);
      alreadyRecorded = hasGameBit(bits.played, MINI_GAME_ID);
      direction = "across";
      selected = entries.across[0]?.cells[0] ?? 0;
      selectEntry(entries.across[0]!);
      cluesOpen = false;

      if (!isReadOnly()) {
        startTimer();
      }
      renderGame();

      if (
        progress.complete
        && (progress.submission === "pending" || progress.submission === "deferred")
        && !alreadyRecorded
      ) {
        try {
          await submitMiniOnce(source, progress);
        } catch {
          // Recovery stays local-first if the signer is still unavailable.
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
        heading.textContent = "Mini unavailable";
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

  const onPageHide = (): void => syncElapsed();
  window.addEventListener("pagehide", onPageHide);
  void loadGame();

  return {
    element: page,
    dispose() {
      syncElapsed();
      disposed = true;
      loadRequest += 1;
      stopTimer();
      window.removeEventListener("keydown", onPhysicalKey);
      window.removeEventListener("pagehide", onPageHide);
      if (document.documentElement.dataset.game === "mini") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
