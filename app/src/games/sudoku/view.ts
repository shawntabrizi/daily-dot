import type { ViewHandle } from "../../home";
import type { DataSource } from "../../shared/data-source";
import { gameById, gameIdOf } from "../../shared/roster";
import { hasGameBit } from "../../shared/streaks";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import { generateSudoku, type Grid } from "./generate";
import {
  loadSudokuProgress,
  prepareSudokuSubmissionRetry,
  saveSudokuProgress,
  submitSudokuOnce,
  type SudokuProgress,
} from "./progress";

const GRID_SIZE = 9;

interface CellPosition {
  row: number;
  column: number;
}

function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function sudokuConflicts(values: Grid): Set<string> {
  const conflicts = new Set<string>();
  const units: CellPosition[][] = [
    ...Array.from({ length: GRID_SIZE }, (_, row) =>
      Array.from({ length: GRID_SIZE }, (_, column) => ({ row, column })),
    ),
    ...Array.from({ length: GRID_SIZE }, (_, column) =>
      Array.from({ length: GRID_SIZE }, (_, row) => ({ row, column })),
    ),
    ...Array.from({ length: GRID_SIZE }, (_, box) => {
      const firstRow = Math.floor(box / 3) * 3;
      const firstColumn = (box % 3) * 3;
      return Array.from({ length: GRID_SIZE }, (_, index) => ({
        row: firstRow + Math.floor(index / 3),
        column: firstColumn + (index % 3),
      }));
    }),
  ];

  for (const unit of units) {
    const positionsByValue = new Map<number, CellPosition[]>();
    for (const position of unit) {
      const value = values[position.row]?.[position.column] ?? 0;
      if (value === 0) {
        continue;
      }
      const positions = positionsByValue.get(value) ?? [];
      positions.push(position);
      positionsByValue.set(value, positions);
    }
    for (const positions of positionsByValue.values()) {
      if (positions.length > 1) {
        for (const position of positions) {
          conflicts.add(cellKey(position.row, position.column));
        }
      }
    }
  }
  return conflicts;
}

function gridsMatch(left: Grid, right: Grid): boolean {
  return left.every((row, rowIndex) =>
    row.every((value, columnIndex) => value === right[rowIndex]?.[columnIndex]),
  );
}

function clearPeerNotes(
  notes: Grid,
  row: number,
  column: number,
  value: number,
): void {
  const keepMask = ~(1 << (value - 1));
  for (let index = 0; index < GRID_SIZE; index += 1) {
    notes[row]![index] &= keepMask;
    notes[index]![column] &= keepMask;
  }
  const firstRow = Math.floor(row / 3) * 3;
  const firstColumn = Math.floor(column / 3) * 3;
  for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < 3; columnOffset += 1) {
      notes[firstRow + rowOffset]![firstColumn + columnOffset] &= keepMask;
    }
  }
}

function firstEditableCell(puzzle: Grid): CellPosition {
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      if (puzzle[row]?.[column] === 0) {
        return { row, column };
      }
    }
  }
  return { row: 0, column: 0 };
}

export function renderSudoku(
  source: DataSource,
  requestedDay?: number,
): ViewHandle {
  const page = document.createElement("section");
  page.className = "page sudoku-page";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Nine by nine.</h1>
      </div>
    </div>
    <div class="sudoku-shell" data-sudoku-shell>
      <div class="game-loading">Generating today's grid…</div>
    </div>
  `;
  page.dataset.game = "sudoku";
  document.documentElement.dataset.game = "sudoku";
  const gameRule = createGameRule("Fill every row, column and box with 1 to 9.");
  page.append(gameRule);

  const shell = page.querySelector<HTMLElement>("[data-sudoku-shell]");
  if (!shell) {
    throw new Error("Sudoku shell failed to render");
  }

  let disposed = false;
  let loadRequest = 0;
  let puzzle: Grid = [];
  let solution: Grid = [];
  let progress: SudokuProgress | null = null;
  let selected: CellPosition = { row: 0, column: 0 };
  let alreadyRecorded = false;
  let today = 0;
  const resultPanel = createResultPanel(source, gameById("sudoku")!);
  let timer = 0;
  let timerStartedAt = 0;
  let timerBaseSeconds = 0;
  let lastSavedSecond = -1;

  const elapsedNow = (): number => {
    if (!progress) {
      return 0;
    }
    if (
      alreadyRecorded
      || progress.complete
      || !progress.started
      || timerStartedAt === 0
    ) {
      return progress.elapsedSeconds;
    }
    return Math.min(
      0xffff_ffff,
      timerBaseSeconds + Math.floor((Date.now() - timerStartedAt) / 1_000),
    );
  };

  const syncElapsed = (save = true): void => {
    if (!progress || alreadyRecorded || progress.complete) {
      return;
    }
    progress.elapsedSeconds = elapsedNow();
    if (save) {
      saveSudokuProgress(progress);
      lastSavedSecond = progress.elapsedSeconds;
    }
  };

  const updateTimer = (): void => {
    const elapsed = elapsedNow();
    const timerNode = shell.querySelector<HTMLElement>("[data-sudoku-timer]");
    if (timerNode) {
      timerNode.textContent = formatElapsed(elapsed);
      timerNode.setAttribute("aria-label", `${elapsed} seconds elapsed`);
    }
    if (progress && elapsed !== lastSavedSecond && !alreadyRecorded && !progress.complete) {
      progress.elapsedSeconds = elapsed;
      saveSudokuProgress(progress);
      lastSavedSecond = elapsed;
    }
  };

  const stopTimer = (): void => {
    window.clearInterval(timer);
    timer = 0;
  };

  const startTimer = (): void => {
    if (!progress || alreadyRecorded || progress.complete) {
      return;
    }
    progress.started = true;
    timerBaseSeconds = progress.elapsedSeconds;
    timerStartedAt = Date.now();
    lastSavedSecond = progress.elapsedSeconds;
    saveSudokuProgress(progress);
    stopTimer();
    timer = window.setInterval(updateTimer, 250);
  };

  const focusSelected = (): void => {
    shell
      .querySelector<HTMLButtonElement>(
        `[data-sudoku-cell="${selected.row}:${selected.column}"]`,
      )
      ?.focus();
  };

  const renderCell = (
    row: number,
    column: number,
    values: Grid,
    conflicts: Set<string>,
    readOnly: boolean,
  ): HTMLButtonElement => {
    const cell = document.createElement("button");
    const value = values[row]?.[column] ?? 0;
    const given = puzzle[row]?.[column] !== 0;
    const noteMask = progress?.notes[row]?.[column] ?? 0;
    const positionKey = cellKey(row, column);

    cell.type = "button";
    cell.className = "sudoku-cell";
    cell.dataset.sudokuCell = positionKey;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-rowindex", String(row + 1));
    cell.setAttribute("aria-colindex", String(column + 1));
    cell.tabIndex =
      row === selected.row && column === selected.column && !readOnly ? 0 : -1;
    cell.disabled = readOnly;
    cell.classList.toggle("sudoku-cell--given", given);
    cell.classList.toggle("sudoku-cell--entered", !given && value !== 0);
    cell.classList.toggle("sudoku-cell--conflict", conflicts.has(positionKey));
    cell.classList.toggle(
      "sudoku-cell--selected",
      row === selected.row && column === selected.column && !readOnly,
    );

    const kind = given ? "given" : value === 0 ? "empty" : "entered";
    const noteDigits = Array.from({ length: GRID_SIZE }, (_, index) => index + 1)
      .filter((digit) => (noteMask & (1 << (digit - 1))) !== 0)
      .join(" ");
    cell.setAttribute(
      "aria-label",
      `Row ${row + 1}, column ${column + 1}, ${kind}${
        value === 0 ? (noteDigits ? `, notes ${noteDigits}` : "") : ` ${value}`
      }`,
    );

    if (value !== 0) {
      cell.textContent = String(value);
    } else if (noteMask !== 0) {
      const notes = document.createElement("span");
      notes.className = "sudoku-notes";
      for (let digit = 1; digit <= GRID_SIZE; digit += 1) {
        const note = document.createElement("i");
        note.textContent = (noteMask & (1 << (digit - 1))) !== 0 ? String(digit) : "";
        notes.append(note);
      }
      cell.append(notes);
    }

    cell.addEventListener("click", () => {
      if (readOnly) {
        return;
      }
      selected = { row, column };
      renderGame();
      focusSelected();
    });
    return cell;
  };

  const renderStatus = (stage: HTMLElement): void => {
    if (!progress) {
      return;
    }
    const status = document.createElement("div");
    status.className = "sudoku-status";
    status.setAttribute("role", "status");

    if (alreadyRecorded) {
      status.replaceChildren(createPlayedNotice(gameById("sudoku")!, progress.day, today));
      stage.append(status);
      return;
    }
    if (!progress.complete) {
      const conflictCount = sudokuConflicts(progress.values).size;
      status.textContent =
        conflictCount > 0
          ? `${conflictCount} cells conflict in a row, column, or box.`
          : progress.pencil
            ? "Pencil marks on."
            : "No conflicts.";
      stage.append(status);
      return;
    }

    const heading = document.createElement("strong");
    heading.textContent = `Solved in ${formatElapsed(progress.elapsedSeconds)}`;
    const message = document.createElement("span");
    if (progress.submission === "submitted") {
      message.textContent = "Score recorded.";
    } else if (progress.submission === "submitting") {
      message.textContent = "Recording your score…";
    } else if (progress.submission === "deferred") {
      message.textContent =
        "Your grid is safe on this device. Open Daily on Dot in the Polkadot app to record your score.";
    } else if (progress.submission === "failed") {
      message.textContent = "Your grid is safe on this device. Recording failed.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button-link sudoku-retry";
      retry.textContent = "Try recording again";
      retry.addEventListener("click", () => {
        if (!progress) {
          return;
        }
        prepareSudokuSubmissionRetry(progress);
        renderGame();
        void submitSudokuOnce(source, progress)
          .catch(() => undefined)
          .finally(renderGame);
      });
      status.append(heading, message, retry);
      stage.append(status);
      return;
    } else {
      message.textContent = "Puzzle complete.";
    }
    status.append(heading, message);
    stage.append(status, resultPanel.element);
    // Save from the unsaved result (after Not now): the prompt opens again.
    const finished = progress;
    const onSave = progress.submission === "pending"
      ? () => {
        void submitSudokuOnce(source, finished)
          .catch(() => undefined)
          .finally(renderGame);
      }
      : undefined;
    const shown = showsResult(progress.submission);
    resultPanel.update({
      day: progress.day,
      score: progress.elapsedSeconds,
      recorded: progress.submission === "submitted",
      pendingSave: pendingSave(progress.submission),
      late: progress.day < today,
      onSave,
    });
    syncResultChrome(page, gameById("sudoku")!, progress.day, shown);
  };

  const renderGame = (): void => {
    if (!progress) {
      return;
    }

    const readOnly = alreadyRecorded || progress.complete;
    gameRule.hidden = readOnly;
    const values =
      alreadyRecorded && !progress.complete ? solution : progress.values;
    const conflicts = readOnly ? new Set<string>() : sudokuConflicts(values);
    const stage = document.createElement("div");
    stage.className = "sudoku-stage";
    // The solved grid earns the accent (decision 1).
    stage.innerHTML = `
      <div class="sudoku-toolbar">
        <span class="sudoku-timer" data-sudoku-timer>00:00</span>
        ${
          readOnly
            ? '<span class="sudoku-mode-label">DONE</span>'
            : ""
        }
      </div>
      <div class="sudoku-grid${readOnly ? " sudoku-grid--solved" : ""}" data-sudoku-grid role="grid" aria-label="Sudoku grid"></div>
    `;

    const grid = stage.querySelector<HTMLElement>("[data-sudoku-grid]");
    if (!grid) {
      throw new Error("Sudoku grid failed to render");
    }
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        grid.append(renderCell(row, column, values, conflicts, readOnly));
      }
    }

    const togglePencil = (): void => {
      if (!progress) {
        return;
      }
      progress.pencil = !progress.pencil;
      saveSudokuProgress(progress);
      renderGame();
    };

    renderStatus(stage);

    if (!readOnly) {
      const pad = document.createElement("div");
      pad.className = "sudoku-pad";
      pad.setAttribute("role", "group");
      pad.setAttribute("aria-label", "Number pad");
      for (let digit = 1; digit <= GRID_SIZE; digit += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.sudokuNumber = String(digit);
        button.textContent = String(digit);
        button.setAttribute("aria-label", `Enter ${digit}`);
        button.addEventListener("click", () => void handleDigit(digit));
        pad.append(button);
      }
      const erase = document.createElement("button");
      erase.type = "button";
      erase.className = "sudoku-erase";
      erase.dataset.sudokuErase = "";
      erase.setAttribute("aria-label", "Erase selected cell");
      erase.textContent = "ERASE";
      erase.addEventListener("click", handleErase);
      pad.append(erase);
      // Pencil sits with the digits it changes: a full-width row under the pad.
      const pencilToggle = document.createElement("button");
      pencilToggle.type = "button";
      pencilToggle.className = "pencil-toggle";
      pencilToggle.dataset.pencil = "";
      pencilToggle.setAttribute("aria-pressed", String(progress.pencil));
      pencilToggle.innerHTML = '<span aria-hidden="true">✎</span> Pencil';
      pencilToggle.addEventListener("click", togglePencil);
      pad.append(pencilToggle);
      stage.append(pad);
    }

    shell.replaceChildren(stage);
    updateTimer();
  };

  const completeIfSolved = async (): Promise<void> => {
    if (!progress || progress.complete || !gridsMatch(progress.values, solution)) {
      return;
    }

    syncElapsed(false);
    progress.complete = true;
    progress.submission = "pending";
    stopTimer();
    saveSudokuProgress(progress);
    renderGame();

    try {
      await submitSudokuOnce(source, progress);
    } catch {
      // The solved grid remains local and exposes the same explicit retry path.
    }
    if (!disposed) {
      renderGame();
    }
  };

  async function handleDigit(digit: number): Promise<void> {
    if (!progress || alreadyRecorded || progress.complete) {
      return;
    }
    const { row, column } = selected;
    if (puzzle[row]?.[column] !== 0) {
      return;
    }

    if (progress.pencil) {
      if (progress.values[row]?.[column] !== 0) {
        return;
      }
      progress.notes[row]![column] ^= 1 << (digit - 1);
    } else {
      progress.values[row]![column] = digit;
      progress.notes[row]![column] = 0;
      clearPeerNotes(progress.notes, row, column, digit);
    }
    syncElapsed(false);
    saveSudokuProgress(progress);
    renderGame();
    await completeIfSolved();
  }

  function handleErase(): void {
    if (!progress || alreadyRecorded || progress.complete) {
      return;
    }
    const { row, column } = selected;
    if (puzzle[row]?.[column] !== 0) {
      return;
    }
    progress.values[row]![column] = 0;
    progress.notes[row]![column] = 0;
    syncElapsed(false);
    saveSudokuProgress(progress);
    renderGame();
  }

  const moveSelection = (rowDelta: number, columnDelta: number): void => {
    selected = {
      row: (selected.row + rowDelta + GRID_SIZE) % GRID_SIZE,
      column: (selected.column + columnDelta + GRID_SIZE) % GRID_SIZE,
    };
    renderGame();
    focusSelected();
  };

  const onPhysicalKey = (event: KeyboardEvent): void => {
    if (
      !progress
      || alreadyRecorded
      || progress.complete
      || event.metaKey
      || event.ctrlKey
      || event.altKey
    ) {
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      void handleDigit(Number(event.key));
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      handleErase();
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
    } else if (event.key.toLowerCase() === "p") {
      event.preventDefault();
      progress.pencil = !progress.pencil;
      saveSudokuProgress(progress);
      renderGame();
    }
  };
  window.addEventListener("keydown", onPhysicalKey);

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    stopTimer();
    gameRule.hidden = true;
    shell.innerHTML = '<div class="game-loading">Generating today\'s grid…</div>';

    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      setHeaderGame(gameById("sudoku")!, day);
      const generated = generateSudoku(day, "v1");
      const bits = await source.dayBits(day);
      if (disposed || request !== loadRequest) {
        return;
      }

      puzzle = generated.puzzle;
      solution = generated.solution;
      progress = loadSudokuProgress(day, puzzle);
      selected = firstEditableCell(puzzle);
      // A day finished on this device shows from its local copy; the chain
      // only confirms the record. A recorded day with no local copy opens read-only.
      const onChain = hasGameBit(bits.played, gameIdOf("sudoku"));
      if (onChain && progress.complete) {
        progress.submission = "submitted";
      }
      alreadyRecorded = onChain && !progress.complete;

      if (!alreadyRecorded && !progress.complete) {
        startTimer();
      }
      renderGame();

      if (
        progress.complete
        && (progress.submission === "pending" || progress.submission === "deferred")
        && !alreadyRecorded
      ) {
        try {
          await submitSudokuOnce(source, progress);
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
      if (document.documentElement.dataset.game === "sudoku") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
