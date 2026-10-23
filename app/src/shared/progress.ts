import type { LetterScore } from "../games/word/engine";
import { hasStartedAngle } from "../games/angle/progress";
import { hasStartedChess } from "../games/chess/progress";
import { hasStartedCode } from "../games/code/progress";
import { hasStartedColor } from "../games/color/progress";
import { hasStartedConnections } from "../games/connections/progress";
import { hasStartedGlobe } from "../games/globe/progress";
import { hasStartedMini } from "../games/mini/progress";
import { hasStartedSudoku } from "../games/sudoku/progress";
import type { DataSource } from "./data-source";
import type { StorageLike } from "./storage";
import { hasGameBit } from "./streaks";
import { GAME_ROSTER, type Game, type GameSlug } from "./roster";

/** Every game stores its day under `daily-on-dot:<id>:v1:<day>`. */
function gameProgressKey(slug: GameSlug, day: number): string {
  return `daily-on-dot:${slug}:v1:${day}`;
}

export type SubmissionState =
  | "idle"
  | "pending"
  | "submitting"
  | "submitted"
  | "deferred"
  | "failed";
export interface StoredGuess {
  word: string;
  scores: LetterScore[];
}

/**
 * One 6-letter word a day with no loss state: `complete` means the last guess
 * solved it, and the score is `guesses.length`.
 */
export interface WordProgress {
  version: 2;
  day: number;
  guesses: StoredGuess[];
  complete: boolean;
  submission: SubmissionState;
}

function progressKey(day: number): string {
  return gameProgressKey("word", day);
}

export function createWordProgress(day: number): WordProgress {
  return {
    version: 2,
    day,
    guesses: [],
    complete: false,
    submission: "idle",
  };
}

function isStoredGuess(value: unknown): value is StoredGuess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredGuess>;
  return (
    typeof candidate.word === "string" &&
    Array.isArray(candidate.scores) &&
    candidate.scores.every(
      (score) => score === "correct" || score === "present" || score === "absent",
    )
  );
}

function isProgress(value: unknown, day: number): value is WordProgress {
  if (!value || typeof value !== "object") {
    return false;
  }

  // Any other stored shape (version 1 was the pre-launch shape)
  // starts the day fresh; there is no migration.
  const candidate = value as Partial<WordProgress>;
  return (
    candidate.version === 2 &&
    candidate.day === day &&
    typeof candidate.complete === "boolean" &&
    Array.isArray(candidate.guesses) &&
    candidate.guesses.every(isStoredGuess) &&
    (candidate.submission === "idle" ||
      candidate.submission === "pending" ||
      candidate.submission === "submitting" ||
      candidate.submission === "submitted" ||
      candidate.submission === "deferred" ||
      candidate.submission === "failed")
  );
}

export function loadWordProgress(
  day: number,
  storage: StorageLike = window.localStorage,
): WordProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createWordProgress(day);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day)) {
      return createWordProgress(day);
    }

    if (parsed.submission === "submitting") {
      parsed.submission = "failed";
    }
    return parsed;
  } catch {
    return createWordProgress(day);
  }
}

export function saveWordProgress(
  progress: WordProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

/** "m:ss" of elapsed seconds. */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The hub's progress phrase for a game in progress, read from the game's
 * stored day without its puzzle: "2 guesses in", "41 cells left", "3:10 in",
 * "2 attempts", "3 guesses", "9 of 21 squares", "2 of 4 found", "2 of 5 colours". "started"
 * when the stored shape says nothing more.
 */
export function progressLine(
  game: Game,
  day: number,
  storage: StorageLike = window.localStorage,
): string {
  const raw = storage.getItem(gameProgressKey(game.id, day));
  if (!raw) {
    return "started";
  }
  let stored: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return "started";
    }
    stored = parsed as Record<string, unknown>;
  } catch {
    return "started";
  }
  const count = (value: unknown): number | null =>
    Array.isArray(value) ? value.length : null;
  switch (game.id) {
    case "word": {
      const guesses = count(stored.guesses);
      return guesses ? `${plural(guesses, "guess", "guesses")} in` : "started";
    }
    case "sudoku": {
      const values = stored.values;
      if (Array.isArray(values)) {
        const left = values
          .flat()
          .filter((cell) => cell === 0).length;
        return `${plural(left, "cell", "cells")} left`;
      }
      const elapsed = stored.elapsedSeconds;
      return typeof elapsed === "number" && elapsed > 0 ? `${clock(elapsed)} in` : "started";
    }
    case "chess": {
      const attempts = stored.attempts;
      return typeof attempts === "number" && attempts > 0
        ? plural(attempts, "attempt", "attempts")
        : "started";
    }
    case "globe": {
      const guesses = count(stored.guesses);
      return guesses ? plural(guesses, "guess", "guesses") : "started";
    }
    case "mini": {
      const letters = stored.letters;
      if (typeof letters !== "string") {
        return "started";
      }
      const total = letters.replace(/#/g, "").length;
      const filled = letters.replace(/[^A-Z]/g, "").length;
      return `${filled} of ${total} squares`;
    }
    case "connections": {
      const found = count(stored.found);
      return found === null ? "started" : `${found} of 4 found`;
    }
    case "code":
    case "angle": {
      const guesses = count(stored.guesses);
      return guesses ? plural(guesses, "guess", "guesses") : "started";
    }
    case "color": {
      const done = count(stored.guesses);
      return done === null ? "started" : `${done} of 5 colours`;
    }
  }
}

const STARTED_BY_SLUG: Record<GameSlug, (day: number, storage: StorageLike) => boolean> = {
  word: (day, storage) => {
    const progress = loadWordProgress(day, storage);
    return !progress.complete && progress.guesses.length > 0;
  },
  sudoku: hasStartedSudoku,
  chess: hasStartedChess,
  globe: hasStartedGlobe,
  mini: hasStartedMini,
  connections: hasStartedConnections,
  code: hasStartedCode,
  angle: hasStartedAngle,
  color: hasStartedColor,
};

export function hasStarted(
  gameId: number,
  day: number,
  storage: StorageLike = window.localStorage,
): boolean {
  const game = GAME_ROSTER.find((entry) => entry.gameId === gameId);
  return game ? STARTED_BY_SLUG[game.id](day, storage) : false;
}

/**
 * The game is finished on this device but the chain has no record of it:
 * the stored day is `complete` and its submission never reached
 * `submitted` (failed, deferred by a missing signer, or interrupted). The
 * hub shows such a day as "Finished · not recorded" with a Retry; the
 * game's own retry flow records it.
 */
export function finishedUnrecorded(
  gameId: number,
  day: number,
  storage: StorageLike = window.localStorage,
): boolean {
  const game = GAME_ROSTER.find((entry) => entry.gameId === gameId);
  if (!game) {
    return false;
  }
  const raw = storage.getItem(gameProgressKey(game.id, day));
  if (!raw) {
    return false;
  }
  try {
    const stored = JSON.parse(raw) as { day?: unknown; complete?: unknown; submission?: unknown };
    return stored.day === day && stored.complete === true && stored.submission !== "submitted";
  } catch {
    return false;
  }
}

/** The chain read the save overlay waits for before it counts from this device alone. */
const FINISHED_READ_MS = 1500;

/**
 * The day's finished games for the save overlay's headline and squares:
 * played on chain, or complete on this device (saved or not). A slow or
 * failed chain read falls back to this device.
 */
export function finishedGamesReader(
  source: Pick<DataSource, "dayBits">,
  storage: StorageLike = window.localStorage,
  timeoutMs = FINISHED_READ_MS,
): (day: number) => Promise<GameSlug[]> {
  return async (day) => {
    const played = await Promise.race([
      source.dayBits(day).then((bits) => bits.played),
      new Promise<bigint>((resolve) => setTimeout(() => resolve(0n), timeoutMs)),
    ]).catch(() => 0n);
    return GAME_ROSTER.filter(
      (game) => hasGameBit(played, game.gameId) || completeOnDevice(game, day, storage),
    ).map((game) => game.id);
  };
}

function completeOnDevice(game: Game, day: number, storage: StorageLike): boolean {
  try {
    const raw = storage.getItem(gameProgressKey(game.id, day));
    const stored = raw ? (JSON.parse(raw) as { day?: unknown; complete?: unknown }) : null;
    return stored?.day === day && stored.complete === true;
  } catch {
    return false;
  }
}
