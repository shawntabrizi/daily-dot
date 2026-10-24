import type { DataSource } from "../../shared/data-source";
import { submissionAfterError } from "../../shared/save-consent";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import { isHsb, ROUNDS, totalScore, type Hsb } from "./engine";

const COLOR_PROGRESS_PREFIX = "daily-on-dot:color:v1:";

export type ColorSubmissionState =
  "idle" | "pending" | "submitting" | "submitted" | "deferred" | "failed";

/**
 * One day of Daily Color: the guesses for the colours done so far, in order.
 * The round in hand (its 5-second look, its sliders) is not stored: a reload
 * starts that colour's look again (D1, casual trust).
 */
export interface ColorProgress {
  version: 1;
  day: number;
  targets: Hsb[];
  guesses: Hsb[];
  complete: boolean;
  submission: ColorSubmissionState;
}

function progressKey(day: number): string {
  return `${COLOR_PROGRESS_PREFIX}${day}`;
}

function isSubmissionState(value: unknown): value is ColorSubmissionState {
  return (
    value === "idle"
    || value === "pending"
    || value === "submitting"
    || value === "submitted"
    || value === "deferred"
    || value === "failed"
  );
}

function sameColour(a: Hsb, b: Hsb): boolean {
  return a.hue === b.hue && a.saturation === b.saturation && a.brightness === b.brightness;
}

function isProgress(value: unknown, day: number, targets: readonly Hsb[]): value is ColorProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ColorProgress>;
  if (
    candidate.version !== 1
    || candidate.day !== day
    || !Array.isArray(candidate.targets)
    || candidate.targets.length !== targets.length
    || !candidate.targets.every((target, index) => isHsb(target) && sameColour(target, targets[index]!))
    || !Array.isArray(candidate.guesses)
    || candidate.guesses.length > ROUNDS
    || !candidate.guesses.every(isHsb)
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

export function createColorProgress(day: number, targets: readonly Hsb[]): ColorProgress {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (targets.length !== ROUNDS || !targets.every(isHsb)) {
    throw new RangeError(`A day is ${ROUNDS} colours`);
  }
  return {
    version: 1,
    day,
    targets: targets.map((target) => ({ ...target })),
    guesses: [],
    complete: false,
    submission: "idle",
  };
}

export function loadColorProgress(
  day: number,
  targets: readonly Hsb[],
  storage: StorageLike = window.localStorage,
): ColorProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createColorProgress(day, targets);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, targets)) {
      return createColorProgress(day, targets);
    }
    if (parsed.submission === "submitting") {
      parsed.submission = "failed";
    }
    return parsed;
  } catch {
    return createColorProgress(day, targets);
  }
}

export function saveColorProgress(
  progress: ColorProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedColor(day: number, storage: StorageLike = window.localStorage): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const stored = JSON.parse(raw) as Partial<ColorProgress>;
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

/** The next colour's guess; the fifth completes the day and queues its one write. */
export function applyColorGuess(progress: ColorProgress, guess: Hsb): ColorProgress {
  if (progress.complete) {
    throw new Error("Today's colours are all done");
  }
  if (!isHsb(guess)) {
    throw new RangeError("A guess is whole hue 0–359, saturation and brightness 0–100");
  }
  const guesses = [...progress.guesses, { hue: guess.hue, saturation: guess.saturation, brightness: guess.brightness }];
  const complete = guesses.length === ROUNDS;
  return { ...progress, guesses, complete, submission: complete ? "pending" : "idle" };
}

/** The day's score so far, in tenths of a point. */
export function colorScore(progress: ColorProgress): number {
  return totalScore(progress.targets, progress.guesses);
}

export async function submitColorOnce(
  source: DataSource,
  progress: ColorProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }
  progress.submission = "submitting";
  saveColorProgress(progress, storage);
  try {
    await source.record(gameIdOf("color"), progress.day, colorScore(progress), true);
    progress.submission = "submitted";
    saveColorProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveColorProgress(progress, storage);
    throw error;
  }
}

export function prepareColorSubmissionRetry(
  progress: ColorProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveColorProgress(progress, storage);
  }
}
