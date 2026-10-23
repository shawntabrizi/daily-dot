import type { DataSource } from "../../shared/data-source";
import { submissionAfterError } from "../../shared/save-consent";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import { isAngle } from "./engine";

const ANGLE_PROGRESS_PREFIX = "daily-on-dot:angle:v1:";

export type AngleSubmissionState =
  "idle" | "pending" | "submitting" | "submitted" | "deferred" | "failed";

/** One day of Daily Angle: the guesses in order; the last one hit it when `complete`. */
export interface AngleProgress {
  version: 1;
  day: number;
  answer: number;
  guesses: number[];
  complete: boolean;
  submission: AngleSubmissionState;
}

export type AngleGuessResult =
  | { accepted: true; progress: AngleProgress }
  | { accepted: false; progress: AngleProgress; message: string };

function progressKey(day: number): string {
  return `${ANGLE_PROGRESS_PREFIX}${day}`;
}

function isSubmissionState(value: unknown): value is AngleSubmissionState {
  return (
    value === "idle"
    || value === "pending"
    || value === "submitting"
    || value === "submitted"
    || value === "deferred"
    || value === "failed"
  );
}

function isProgress(value: unknown, day: number, answer: number): value is AngleProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<AngleProgress>;
  if (
    candidate.version !== 1
    || candidate.day !== day
    || candidate.answer !== answer
    || !Array.isArray(candidate.guesses)
    || !candidate.guesses.every((guess) => typeof guess === "number" && isAngle(guess))
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

export function createAngleProgress(day: number, answer: number): AngleProgress {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (!isAngle(answer)) {
    throw new RangeError("The answer must be a whole degree from 1 to 359");
  }
  return { version: 1, day, answer, guesses: [], complete: false, submission: "idle" };
}

export function loadAngleProgress(
  day: number,
  answer: number,
  storage: StorageLike = window.localStorage,
): AngleProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createAngleProgress(day, answer);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, answer)) {
      return createAngleProgress(day, answer);
    }
    if (parsed.submission === "submitting") {
      parsed.submission = "failed";
    }
    return parsed;
  } catch {
    return createAngleProgress(day, answer);
  }
}

export function saveAngleProgress(
  progress: AngleProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedAngle(day: number, storage: StorageLike = window.localStorage): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const stored = JSON.parse(raw) as Partial<AngleProgress>;
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

export function applyAngleGuess(progress: AngleProgress, guess: number): AngleGuessResult {
  if (progress.complete) {
    throw new Error("This Angle is already found");
  }
  if (!isAngle(guess)) {
    return { accepted: false, progress, message: "Enter a whole degree from 1 to 359." };
  }
  // A repeat tells the player nothing new, so it must not cost a guess.
  if (progress.guesses.includes(guess)) {
    return { accepted: false, progress, message: `You already tried ${guess}°.` };
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

export async function submitAngleOnce(
  source: DataSource,
  progress: AngleProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }
  progress.submission = "submitting";
  saveAngleProgress(progress, storage);
  try {
    await source.record(gameIdOf("angle"), progress.day, progress.guesses.length, true);
    progress.submission = "submitted";
    saveAngleProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveAngleProgress(progress, storage);
    throw error;
  }
}

export function prepareAngleSubmissionRetry(
  progress: AngleProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveAngleProgress(progress, storage);
  }
}
