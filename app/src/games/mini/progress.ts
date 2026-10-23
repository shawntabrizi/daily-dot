import { submissionAfterError } from "../../shared/save-consent";
import type { DataSource } from "../../shared/data-source";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import { MINI_CELLS, MINI_SIZE } from "./grid";

const MINI_PROGRESS_PREFIX = "daily-on-dot:mini:v1:";
const MAX_U32 = 0xffff_ffff;
export const MINI_GAME_ID = gameIdOf("mini");

export type MiniSubmissionState =
  | "idle"
  | "pending"
  | "submitting"
  | "submitted"
  | "deferred"
  | "failed";

/**
 * Local-only state (D15). `letters` is 25 characters: the player's letter,
 * "." for an empty white square, "#" for a black one. `started` turns on
 * with the first letter; `complete` when every square matched the answer.
 */
export interface MiniProgress {
  version: 1;
  day: number;
  letters: string;
  started: boolean;
  elapsedSeconds: number;
  complete: boolean;
  submission: MiniSubmissionState;
}

function progressKey(day: number): string {
  return `${MINI_PROGRESS_PREFIX}${day}`;
}

/** The empty player grid for a puzzle grid: blacks kept, letters cleared. */
export function emptyLetters(grid: string): string {
  return grid.replace(/[A-Z]/g, ".");
}

function isProgress(
  value: unknown,
  day: number,
  grid: string,
): value is MiniProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<MiniProgress>;
  return (
    candidate.version === 1
    && candidate.day === day
    && typeof candidate.letters === "string"
    && candidate.letters.length === MINI_CELLS
    && /^[A-Z.#]+$/.test(candidate.letters)
    // Blacks must sit where the puzzle has them: a stale blob from another
    // puzzle shape is discarded.
    && [...candidate.letters].every(
      (cell, index) => (cell === "#") === (grid[index] === "#"),
    )
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

export function createMiniProgress(day: number, grid: string): MiniProgress {
  return {
    version: 1,
    day,
    letters: emptyLetters(grid),
    started: false,
    elapsedSeconds: 0,
    complete: false,
    submission: "idle",
  };
}

export function loadMiniProgress(
  day: number,
  grid: string,
  storage: StorageLike = window.localStorage,
): MiniProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createMiniProgress(day, grid);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, grid)) {
      return createMiniProgress(day, grid);
    }
    const progress: MiniProgress = { ...parsed };
    if (progress.submission === "submitting") {
      progress.submission = "failed";
    }
    return progress;
  } catch {
    return createMiniProgress(day, grid);
  }
}

export function saveMiniProgress(
  progress: MiniProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedMini(
  day: number,
  storage: StorageLike = window.localStorage,
): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MiniProgress>;
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

/** Every white square filled, whether or not the letters are right. */
export function miniFilled(letters: string): boolean {
  return !letters.includes(".");
}

/** The win condition: every square matches the answer grid. */
export function miniSolved(letters: string, grid: string): boolean {
  return letters.length === grid.length && letters === grid;
}

export function setMiniLetter(
  progress: MiniProgress,
  index: number,
  letter: string,
): MiniProgress {
  if (!Number.isInteger(index) || index < 0 || index >= MINI_CELLS) {
    throw new RangeError("Cell index out of range");
  }
  if (progress.letters[index] === "#") {
    throw new Error("Cannot write on a black square");
  }
  if (!/^[A-Z.]$/.test(letter)) {
    throw new Error("A cell holds one capital letter or nothing");
  }
  const letters =
    progress.letters.slice(0, index) + letter + progress.letters.slice(index + 1);
  return { ...progress, letters, started: progress.started || letter !== "." };
}

export async function submitMiniOnce(
  source: DataSource,
  progress: MiniProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }

  progress.submission = "submitting";
  saveMiniProgress(progress, storage);

  try {
    // D13: score = seconds to solve, like Sudoku; a mini is only ever solved.
    await source.record(MINI_GAME_ID, progress.day, progress.elapsedSeconds, true);
    progress.submission = "submitted";
    saveMiniProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveMiniProgress(progress, storage);
    throw error;
  }
}

export function prepareMiniSubmissionRetry(
  progress: MiniProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveMiniProgress(progress, storage);
  }
}

export { MINI_SIZE };
