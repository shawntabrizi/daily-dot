import type { DataSource } from "../../shared/data-source";
import { submissionAfterError } from "../../shared/save-consent";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import { isCode } from "./engine";

const CODE_PROGRESS_PREFIX = "daily-on-dot:code:v1:";

export type CodeSubmissionState =
  "idle" | "pending" | "submitting" | "submitted" | "deferred" | "failed";

/** One day of Daily Code: the guesses in order; the last one cracked it when `complete`. */
export interface CodeProgress {
  version: 1;
  day: number;
  answer: string;
  guesses: string[];
  complete: boolean;
  submission: CodeSubmissionState;
}

export type CodeGuessResult =
  | { accepted: true; progress: CodeProgress }
  | { accepted: false; progress: CodeProgress; message: string };

function progressKey(day: number): string {
  return `${CODE_PROGRESS_PREFIX}${day}`;
}

function isSubmissionState(value: unknown): value is CodeSubmissionState {
  return (
    value === "idle"
    || value === "pending"
    || value === "submitting"
    || value === "submitted"
    || value === "deferred"
    || value === "failed"
  );
}

function isProgress(value: unknown, day: number, answer: string): value is CodeProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CodeProgress>;
  if (
    candidate.version !== 1
    || candidate.day !== day
    || candidate.answer !== answer
    || !Array.isArray(candidate.guesses)
    || !candidate.guesses.every((guess) => typeof guess === "string" && isCode(guess))
    || new Set(candidate.guesses).size !== candidate.guesses.length
    || typeof candidate.complete !== "boolean"
    || !isSubmissionState(candidate.submission)
  ) {
    return false;
  }
  // Only the last guess may be the answer, and then the day is complete.
  const cracked = candidate.guesses.indexOf(answer);
  const complete = cracked >= 0 && cracked === candidate.guesses.length - 1;
  if (cracked >= 0 && !complete) {
    return false;
  }
  return (
    candidate.complete === complete
    && (complete ? candidate.submission !== "idle" : candidate.submission === "idle")
  );
}

export function createCodeProgress(day: number, answer: string): CodeProgress {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (!isCode(answer)) {
    throw new RangeError("The answer must be a four-digit code");
  }
  return { version: 1, day, answer, guesses: [], complete: false, submission: "idle" };
}

export function loadCodeProgress(
  day: number,
  answer: string,
  storage: StorageLike = window.localStorage,
): CodeProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createCodeProgress(day, answer);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, answer)) {
      return createCodeProgress(day, answer);
    }
    if (parsed.submission === "submitting") {
      parsed.submission = "failed";
    }
    return parsed;
  } catch {
    return createCodeProgress(day, answer);
  }
}

export function saveCodeProgress(
  progress: CodeProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedCode(day: number, storage: StorageLike = window.localStorage): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const stored = JSON.parse(raw) as Partial<CodeProgress>;
    return (
      stored.version === 1
      && stored.day === day
      && Array.isArray(stored.guesses)
      && stored.guesses.length > 0
      && stored.complete === false
    );
  } catch {
    return false;
  }
}

export function applyCodeGuess(progress: CodeProgress, guess: string): CodeGuessResult {
  if (progress.complete) {
    throw new Error("This Code is already cracked");
  }
  if (!isCode(guess)) {
    return { accepted: false, progress, message: "Enter four digits." };
  }
  // A repeat tells the player nothing new, so it must not cost a guess.
  if (progress.guesses.includes(guess)) {
    return { accepted: false, progress, message: `You already tried ${guess}.` };
  }
  const complete = guess === progress.answer;
  return {
    accepted: true,
    progress: {
      ...progress,
      guesses: [...progress.guesses, guess],
      complete,
      submission: complete ? "pending" : "idle",
    },
  };
}

export async function submitCodeOnce(
  source: DataSource,
  progress: CodeProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }
  progress.submission = "submitting";
  saveCodeProgress(progress, storage);
  try {
    await source.record(gameIdOf("code"), progress.day, progress.guesses.length, true);
    progress.submission = "submitted";
    saveCodeProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveCodeProgress(progress, storage);
    throw error;
  }
}

export function prepareCodeSubmissionRetry(
  progress: CodeProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveCodeProgress(progress, storage);
  }
}
