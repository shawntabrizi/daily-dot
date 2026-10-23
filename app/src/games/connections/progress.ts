import type {
  ConnectionsPuzzle,
  DataSource,
} from "../../shared/data-source";
import { submissionAfterError } from "../../shared/save-consent";
import type { StorageLike } from "../../shared/storage";
import {
  CONNECTIONS_GAME_ID,
  CONNECTIONS_GROUP_COUNT,
  CONNECTIONS_GROUP_SIZE,
  CONNECTIONS_WORD_COUNT,
  evaluateGuess,
  initialOrder,
  puzzleWords,
  selectionKey,
  shuffleWords,
  wordKey,
  type GuessOutcome,
} from "./engine";

const CONNECTIONS_PROGRESS_PREFIX = "daily-on-dot:connections:v1:";

export type ConnectionsSubmissionState =
  | "idle"
  | "pending"
  | "submitting"
  | "submitted"
  | "deferred"
  | "failed";

/**
 * Local-only state (D15). `order` is every word still on the board, in
 * board order; a found group leaves it and joins `found` (group indices in
 * the order they were found). `guesses` is each submitted set with the tier
 * of each word, oldest first: the share summary and the repeat check.
 * There is no loss state: `mistakes` counts up until all four are found.
 */
export interface ConnectionsProgress {
  version: 1;
  day: number;
  order: string[];
  selected: string[];
  found: number[];
  guesses: { words: string[]; tiers: number[] }[];
  mistakes: number;
  complete: boolean;
  submission: ConnectionsSubmissionState;
}

function progressKey(day: number): string {
  return `${CONNECTIONS_PROGRESS_PREFIX}${day}`;
}

function isSubmissionState(value: unknown): value is ConnectionsSubmissionState {
  return (
    value === "idle"
    || value === "pending"
    || value === "submitting"
    || value === "submitted"
    || value === "deferred"
    || value === "failed"
  );
}

function isWordList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((word) => typeof word === "string");
}

/** Stored state must describe this puzzle exactly, or it is discarded. */
function isProgress(
  value: unknown,
  day: number,
  puzzle: ConnectionsPuzzle,
): value is ConnectionsProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ConnectionsProgress>;
  if (
    candidate.version !== 1
    || candidate.day !== day
    || !isWordList(candidate.order)
    || !isWordList(candidate.selected)
    || !Array.isArray(candidate.found)
    || !Array.isArray(candidate.guesses)
    || !Number.isInteger(candidate.mistakes)
    || (candidate.mistakes ?? -1) < 0
    || typeof candidate.complete !== "boolean"
    || !isSubmissionState(candidate.submission)
  ) {
    return false;
  }
  const found = candidate.found;
  if (
    found.length > CONNECTIONS_GROUP_COUNT
    || new Set(found).size !== found.length
    || found.some(
      (group) =>
        !Number.isInteger(group) || group < 0 || group >= CONNECTIONS_GROUP_COUNT,
    )
  ) {
    return false;
  }
  const expectedOnBoard = new Set(
    puzzle.groups
      .flatMap((group, index) => (found.includes(index) ? [] : group.words))
      .map(wordKey),
  );
  const order = candidate.order.map(wordKey);
  if (
    order.length !== expectedOnBoard.size
    || new Set(order).size !== order.length
    || order.some((word) => !expectedOnBoard.has(word))
  ) {
    return false;
  }
  if (
    candidate.selected.length > CONNECTIONS_GROUP_SIZE
    || candidate.selected.some((word) => !order.includes(wordKey(word)))
  ) {
    return false;
  }
  if (
    candidate.guesses.some(
      (guess) =>
        !guess
        || typeof guess !== "object"
        || !isWordList(guess.words)
        || guess.words.length !== CONNECTIONS_GROUP_SIZE
        || !Array.isArray(guess.tiers)
        || guess.tiers.length !== CONNECTIONS_GROUP_SIZE,
    )
  ) {
    return false;
  }
  const complete = found.length === CONNECTIONS_GROUP_COUNT;
  return (
    candidate.complete === complete
    && (complete
      ? candidate.submission !== "idle"
      : candidate.submission === "idle")
  );
}

export function createConnectionsProgress(
  day: number,
  puzzle: ConnectionsPuzzle,
): ConnectionsProgress {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (puzzleWords(puzzle).length !== CONNECTIONS_WORD_COUNT) {
    throw new Error("A Connections puzzle has sixteen words");
  }
  return {
    version: 1,
    day,
    order: initialOrder(puzzle, day),
    selected: [],
    found: [],
    guesses: [],
    mistakes: 0,
    complete: false,
    submission: "idle",
  };
}

export function loadConnectionsProgress(
  day: number,
  puzzle: ConnectionsPuzzle,
  storage: StorageLike = window.localStorage,
): ConnectionsProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createConnectionsProgress(day, puzzle);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, puzzle)) {
      return createConnectionsProgress(day, puzzle);
    }
    const progress: ConnectionsProgress = {
      ...parsed,
      order: [...parsed.order],
      selected: [...parsed.selected],
      found: [...parsed.found],
      guesses: parsed.guesses.map((guess) => ({
        words: [...guess.words],
        tiers: [...guess.tiers],
      })),
    };
    if (progress.submission === "submitting") {
      progress.submission = "failed";
    }
    return progress;
  } catch {
    return createConnectionsProgress(day, puzzle);
  }
}

export function saveConnectionsProgress(
  progress: ConnectionsProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedConnections(
  day: number,
  storage: StorageLike = window.localStorage,
): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConnectionsProgress>;
    return (
      parsed.version === 1
      && parsed.day === day
      && parsed.complete === false
      && Array.isArray(parsed.guesses)
      && parsed.guesses.length > 0
    );
  } catch {
    return false;
  }
}

export function toggleConnectionsWord(
  progress: ConnectionsProgress,
  word: string,
): ConnectionsProgress {
  if (progress.complete) {
    throw new Error("This Connections is already complete");
  }
  if (!progress.order.includes(word)) {
    throw new RangeError("That word is not on the board");
  }
  const selected = progress.selected.includes(word)
    ? progress.selected.filter((candidate) => candidate !== word)
    : progress.selected.length < CONNECTIONS_GROUP_SIZE
      ? [...progress.selected, word]
      : progress.selected;
  return { ...progress, selected };
}

export function deselectConnections(
  progress: ConnectionsProgress,
): ConnectionsProgress {
  return { ...progress, selected: [] };
}

export function shuffleConnections(
  progress: ConnectionsProgress,
  random: () => number = Math.random,
): ConnectionsProgress {
  return { ...progress, order: shuffleWords(progress.order, random) };
}

/**
 * Submit the four selected words. A correct set collapses into `found` and
 * leaves the board; a wrong set (one away or not) adds a mistake; a repeat
 * changes nothing. The puzzle completes when the fourth group is found.
 */
export function submitConnectionsGuess(
  progress: ConnectionsProgress,
  puzzle: ConnectionsPuzzle,
): { progress: ConnectionsProgress; outcome: GuessOutcome } {
  if (progress.complete) {
    throw new Error("This Connections is already complete");
  }
  if (progress.selected.length !== CONNECTIONS_GROUP_SIZE) {
    throw new RangeError("Select four words first");
  }
  const previous = progress.guesses.map((guess) => guess.words);
  const result = evaluateGuess(puzzle, progress.selected, previous);
  if (result.outcome.kind === "repeat") {
    return { progress, outcome: result.outcome };
  }

  const guesses = [
    ...progress.guesses,
    { words: [...progress.selected], tiers: result.tiers },
  ];
  if (result.outcome.kind !== "correct") {
    return {
      progress: { ...progress, guesses, mistakes: progress.mistakes + 1 },
      outcome: result.outcome,
    };
  }

  const key = selectionKey(progress.selected);
  const found = [...progress.found, result.outcome.group];
  const order = progress.order.filter(
    (word) => !key.split("\u0000").includes(wordKey(word)),
  );
  const complete = found.length === CONNECTIONS_GROUP_COUNT;
  return {
    progress: {
      ...progress,
      order,
      selected: [],
      found,
      guesses,
      complete,
      submission: complete ? "pending" : "idle",
    },
    outcome: result.outcome,
  };
}

export async function submitConnectionsOnce(
  source: DataSource,
  progress: ConnectionsProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }

  progress.submission = "submitting";
  saveConnectionsProgress(progress, storage);
  try {
    // D13: score = mistakes made; every finished board is solved (no loss state).
    await source.record(CONNECTIONS_GAME_ID, progress.day, progress.mistakes, true);
    progress.submission = "submitted";
    saveConnectionsProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveConnectionsProgress(progress, storage);
    throw error;
  }
}

export function prepareConnectionsSubmissionRetry(
  progress: ConnectionsProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveConnectionsProgress(progress, storage);
  }
}
