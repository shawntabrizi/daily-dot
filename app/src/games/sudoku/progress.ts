import { submissionAfterError } from "../../shared/save-consent";
import type { DataSource } from "../../shared/data-source";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import type { Grid } from "./generate";

const SUDOKU_PROGRESS_PREFIX = "daily-on-dot:sudoku:v1:";
const MAX_U32 = 0xffff_ffff;

export type SudokuSubmissionState =
  | "idle"
  | "pending"
  | "submitting"
  | "submitted"
  | "deferred"
  | "failed";

export interface SudokuProgress {
  version: 1;
  day: number;
  values: Grid;
  notes: Grid;
  pencil: boolean;
  started: boolean;
  elapsedSeconds: number;
  complete: boolean;
  submission: SudokuSubmissionState;
}

function progressKey(day: number): string {
  return `${SUDOKU_PROGRESS_PREFIX}${day}`;
}

function emptyGrid(): Grid {
  return Array.from({ length: 9 }, () => Array<number>(9).fill(0));
}

function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

function isGrid(value: unknown, maximum: number): value is Grid {
  return (
    Array.isArray(value)
    && value.length === 9
    && value.every(
      (row) =>
        Array.isArray(row)
        && row.length === 9
        && row.every(
          (cell) =>
            Number.isInteger(cell)
            && (cell as number) >= 0
            && (cell as number) <= maximum,
        ),
    )
  );
}

function isProgress(
  value: unknown,
  day: number,
  puzzle: Grid,
): value is SudokuProgress {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SudokuProgress>;
  return (
    candidate.version === 1
    && candidate.day === day
    && isGrid(candidate.values, 9)
    && isGrid(candidate.notes, 0x1ff)
    && candidate.values.every((row, rowIndex) =>
      row.every((cell, columnIndex) => {
        const given = puzzle[rowIndex]?.[columnIndex] ?? 0;
        return given === 0 || cell === given;
      }),
    )
    && typeof candidate.pencil === "boolean"
    && typeof candidate.started === "boolean"
    && Number.isInteger(candidate.elapsedSeconds)
    && (candidate.elapsedSeconds ?? -1) >= 0
    && (candidate.elapsedSeconds ?? MAX_U32 + 1) <= MAX_U32
    && typeof candidate.complete === "boolean"
    && (
      candidate.submission === "idle"
      || candidate.submission === "pending"
      || candidate.submission === "submitting"
      || candidate.submission === "submitted"
      || candidate.submission === "deferred"
      || candidate.submission === "failed"
    )
  );
}

export function createSudokuProgress(day: number, puzzle: Grid): SudokuProgress {
  return {
    version: 1,
    day,
    values: cloneGrid(puzzle),
    notes: emptyGrid(),
    pencil: false,
    started: false,
    elapsedSeconds: 0,
    complete: false,
    submission: "idle",
  };
}

export function loadSudokuProgress(
  day: number,
  puzzle: Grid,
  storage: StorageLike = window.localStorage,
): SudokuProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createSudokuProgress(day, puzzle);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, puzzle)) {
      return createSudokuProgress(day, puzzle);
    }
    const progress: SudokuProgress = {
      ...parsed,
      values: cloneGrid(parsed.values),
      notes: cloneGrid(parsed.notes),
    };
    if (progress.submission === "submitting") {
      progress.submission = "failed";
    }
    return progress;
  } catch {
    return createSudokuProgress(day, puzzle);
  }
}

export function saveSudokuProgress(
  progress: SudokuProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedSudoku(
  day: number,
  storage: StorageLike = window.localStorage,
): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SudokuProgress>;
    return (
      parsed.version === 1
      && parsed.day === day
      && parsed.started === true
      && parsed.complete === false
    );
  } catch {
    return false;
  }
}

export async function submitSudokuOnce(
  source: DataSource,
  progress: SudokuProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }

  progress.submission = "submitting";
  saveSudokuProgress(progress, storage);

  try {
    await source.record(gameIdOf("sudoku"), progress.day, progress.elapsedSeconds, true);
    progress.submission = "submitted";
    saveSudokuProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveSudokuProgress(progress, storage);
    throw error;
  }
}

export function prepareSudokuSubmissionRetry(
  progress: SudokuProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveSudokuProgress(progress, storage);
  }
}
