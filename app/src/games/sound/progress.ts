import type { DataSource } from "../../shared/data-source";
import { submissionAfterError } from "../../shared/save-consent";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import { isHz, ROUNDS, totalHundredths, totalScore } from "./engine";

const SOUND_PROGRESS_PREFIX = "daily-on-dot:sound:v1:";

export type SoundSubmissionState =
  "idle" | "pending" | "submitting" | "submitted" | "deferred" | "failed";

/**
 * One day of Daily Sound: the found pitches (Hz, to the hundredth) for the
 * tones done so far, in order. The round in hand (its one listen, the
 * pitch being dragged) is not stored: a reload starts that tone's listen
 * again (D1, casual trust).
 */
export interface SoundProgress {
  version: 1;
  day: number;
  targets: number[];
  guesses: number[];
  complete: boolean;
  submission: SoundSubmissionState;
}

function progressKey(day: number): string {
  return `${SOUND_PROGRESS_PREFIX}${day}`;
}

function isSubmissionState(value: unknown): value is SoundSubmissionState {
  return (
    value === "idle"
    || value === "pending"
    || value === "submitting"
    || value === "submitted"
    || value === "deferred"
    || value === "failed"
  );
}

function isProgress(value: unknown, day: number, targets: readonly number[]): value is SoundProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SoundProgress>;
  if (
    candidate.version !== 1
    || candidate.day !== day
    || !Array.isArray(candidate.targets)
    || candidate.targets.length !== targets.length
    || !candidate.targets.every((target, index) => target === targets[index])
    || !Array.isArray(candidate.guesses)
    || candidate.guesses.length > ROUNDS
    || !candidate.guesses.every(isHz)
    || typeof candidate.complete !== "boolean"
    || !isSubmissionState(candidate.submission)
  ) {
    return false;
  }
  const complete = candidate.guesses.length === ROUNDS;
  return (
    candidate.complete === complete
    && (complete ? candidate.submission !== "idle" : candidate.submission === "idle")
  );
}

export function createSoundProgress(day: number, targets: readonly number[]): SoundProgress {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (targets.length !== ROUNDS || !targets.every(isHz)) {
    throw new RangeError(`A day is ${ROUNDS} tones`);
  }
  return {
    version: 1,
    day,
    targets: [...targets],
    guesses: [],
    complete: false,
    submission: "idle",
  };
}

export function loadSoundProgress(
  day: number,
  targets: readonly number[],
  storage: StorageLike = window.localStorage,
): SoundProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createSoundProgress(day, targets);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, targets)) {
      return createSoundProgress(day, targets);
    }
    if (parsed.submission === "submitting") {
      parsed.submission = "failed";
    }
    return parsed;
  } catch {
    return createSoundProgress(day, targets);
  }
}

export function saveSoundProgress(
  progress: SoundProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedSound(day: number, storage: StorageLike = window.localStorage): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const stored = JSON.parse(raw) as Partial<SoundProgress>;
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

/** The next tone's found pitch; the fifth completes the day and queues its one write. */
export function applySoundGuess(progress: SoundProgress, guess: number): SoundProgress {
  if (progress.complete) {
    throw new Error("Today's tones are all done");
  }
  if (!isHz(guess)) {
    throw new RangeError("A guess is 110–880 Hz to the hundredth");
  }
  const guesses = [...progress.guesses, guess];
  const complete = guesses.length === ROUNDS;
  return { ...progress, guesses, complete, submission: complete ? "pending" : "idle" };
}

/** The day's recorded score so far, in tenths of a point. */
export function soundScore(progress: SoundProgress): number {
  return totalScore(progress.targets, progress.guesses);
}

/** The day's shown score so far, in hundredths of a point. */
export function soundHundredths(progress: SoundProgress): number {
  return totalHundredths(progress.targets, progress.guesses);
}

export async function submitSoundOnce(
  source: DataSource,
  progress: SoundProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }
  progress.submission = "submitting";
  saveSoundProgress(progress, storage);
  try {
    await source.record(gameIdOf("sound"), progress.day, soundScore(progress), true);
    progress.submission = "submitted";
    saveSoundProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveSoundProgress(progress, storage);
    throw error;
  }
}

export function prepareSoundSubmissionRetry(
  progress: SoundProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveSoundProgress(progress, storage);
  }
}
