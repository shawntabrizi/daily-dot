import { submissionAfterError } from "../../shared/save-consent";
import type { ChessPuzzle, DataSource } from "../../shared/data-source";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import {
  moveToUci,
  playUciMove,
  positionAfterMoves,
  prepareChessPuzzle,
} from "./engine";

const CHESS_PROGRESS_PREFIX = "daily-on-dot:chess:v1:";
const MAX_U32 = 0xffff_ffff;

export type ChessSubmissionState =
  | "idle"
  | "pending"
  | "submitting"
  | "submitted"
  | "deferred"
  | "failed";

export interface ChessProgress {
  version: 1;
  day: number;
  puzzleKey: string;
  nextMoveIndex: number;
  attempts: number;
  started: boolean;
  complete: boolean;
  submission: ChessSubmissionState;
}

export interface PlayerAttempt {
  progress: ChessProgress;
  correct: boolean;
}

function progressKey(day: number): string {
  return `${CHESS_PROGRESS_PREFIX}${day}`;
}

function puzzleKey(puzzle: ChessPuzzle): string {
  return `${puzzle.fen}\n${puzzle.moves}`;
}

function isSubmissionState(value: unknown): value is ChessSubmissionState {
  return (
    value === "idle"
    || value === "pending"
    || value === "submitting"
    || value === "submitted"
    || value === "deferred"
    || value === "failed"
  );
}

function isProgress(
  value: unknown,
  day: number,
  puzzle: ChessPuzzle,
): value is ChessProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const moves = prepareChessPuzzle(puzzle).moves;
  const candidate = value as Partial<ChessProgress>;
  return (
    candidate.version === 1
    && candidate.day === day
    && candidate.puzzleKey === puzzleKey(puzzle)
    && Number.isInteger(candidate.nextMoveIndex)
    && (candidate.nextMoveIndex ?? -1) >= 0
    && (candidate.nextMoveIndex ?? moves.length + 1) <= moves.length
    && Number.isInteger(candidate.attempts)
    && (candidate.attempts ?? -1) >= 0
    && (candidate.attempts ?? MAX_U32 + 1) <= MAX_U32
    && typeof candidate.started === "boolean"
    && typeof candidate.complete === "boolean"
    && candidate.complete === (candidate.nextMoveIndex === moves.length)
    && isSubmissionState(candidate.submission)
  );
}

export function createChessProgress(
  day: number,
  puzzle: ChessPuzzle,
): ChessProgress {
  prepareChessPuzzle(puzzle);
  return {
    version: 1,
    day,
    puzzleKey: puzzleKey(puzzle),
    nextMoveIndex: 0,
    attempts: 0,
    started: false,
    complete: false,
    submission: "idle",
  };
}

export function loadChessProgress(
  day: number,
  puzzle: ChessPuzzle,
  storage: StorageLike = window.localStorage,
): ChessProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createChessProgress(day, puzzle);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, puzzle)) {
      return createChessProgress(day, puzzle);
    }
    if (parsed.submission === "submitting") {
      parsed.submission = "failed";
    }
    return parsed;
  } catch {
    return createChessProgress(day, puzzle);
  }
}

export function saveChessProgress(
  progress: ChessProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedChess(
  day: number,
  storage: StorageLike = window.localStorage,
): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const stored = JSON.parse(raw) as Partial<ChessProgress>;
    return (
      stored.version === 1
      && stored.day === day
      && stored.started === true
      && stored.complete === false
    );
  } catch {
    return false;
  }
}

export function applyOpponentReply(
  progress: ChessProgress,
  puzzle: ChessPuzzle,
): ChessProgress {
  const prepared = prepareChessPuzzle(puzzle);
  if (
    progress.complete
    || progress.nextMoveIndex >= prepared.moves.length
    || progress.nextMoveIndex % 2 !== 0
  ) {
    throw new Error("No opponent reply is pending");
  }
  const chess = positionAfterMoves(puzzle, progress.nextMoveIndex);
  const expected = prepared.moves[progress.nextMoveIndex]!;
  const played = moveToUci(playUciMove(chess, expected));
  if (played !== expected) {
    throw new Error(`Puzzle line changed move "${expected}"`);
  }
  return {
    ...progress,
    nextMoveIndex: progress.nextMoveIndex + 1,
  };
}

export function applyPlayerAttempt(
  progress: ChessProgress,
  puzzle: ChessPuzzle,
  uci: string,
): PlayerAttempt {
  const prepared = prepareChessPuzzle(puzzle);
  if (
    progress.complete
    || progress.nextMoveIndex >= prepared.moves.length
    || progress.nextMoveIndex % 2 !== 1
  ) {
    throw new Error("It is not the player's turn");
  }

  const chess = positionAfterMoves(puzzle, progress.nextMoveIndex);
  const legal = chess
    .moves({ verbose: true })
    .some((move) => moveToUci(move) === uci);
  if (!legal) {
    throw new Error(`Move "${uci}" is not legal in this position`);
  }

  const attempts = Math.min(MAX_U32, progress.attempts + 1);
  const correct = uci === prepared.moves[progress.nextMoveIndex];
  if (!correct) {
    return {
      correct: false,
      progress: { ...progress, attempts, started: true },
    };
  }

  const nextMoveIndex = progress.nextMoveIndex + 1;
  const complete = nextMoveIndex === prepared.moves.length;
  return {
    correct: true,
    progress: {
      ...progress,
      nextMoveIndex,
      attempts,
      started: true,
      complete,
      submission: complete ? "pending" : progress.submission,
    },
  };
}

export async function submitChessOnce(
  source: DataSource,
  progress: ChessProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }

  progress.submission = "submitting";
  saveChessProgress(progress, storage);
  try {
    await source.record(gameIdOf("chess"), progress.day, progress.attempts, true);
    progress.submission = "submitted";
    saveChessProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveChessProgress(progress, storage);
    throw error;
  }
}

export function prepareChessSubmissionRetry(
  progress: ChessProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveChessProgress(progress, storage);
  }
}
