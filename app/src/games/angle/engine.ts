/** Daily Angle (D23): a whole-degree angle of 1°–359°, found with Angledle's hints. */
export const MIN_ANGLE = 1;
export const MAX_ANGLE = 359;

export type Heat = "exact" | "close" | "hot" | "warm" | "cold";

export interface AngleHint {
  heat: Heat;
  /** Where the answer lies from the guess: "up" larger, "down" smaller; null when exact. */
  direction: "up" | "down" | null;
}

/** The hint words, as Angledle reads them. */
export const HEAT_WORDS: Record<Heat, string> = {
  exact: "Got it!",
  close: "So close!",
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const HEAT_MARKS: Record<Heat, string> = {
  exact: "🎯",
  close: "🤏",
  hot: "🔥",
  warm: "🌡️",
  cold: "☃️",
};

export function isAngle(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_ANGLE && value <= MAX_ANGLE;
}

/**
 * Within 5° is So close, 15° Hot, 30° Warm, beyond Cold. The distance is
 * along the 1–359 scale, not around the circle: 2° and 358° are 356 apart,
 * as the arrow (up or down) says.
 */
export function hintFor(guess: number, answer: number): AngleHint {
  if (!isAngle(guess) || !isAngle(answer)) {
    throw new RangeError("Angles are whole degrees from 1 to 359");
  }
  const off = Math.abs(answer - guess);
  const direction = off === 0 ? null : answer > guess ? "up" : "down";
  const heat: Heat = off === 0 ? "exact" : off <= 5 ? "close" : off <= 15 ? "hot" : off <= 30 ? "warm" : "cold";
  return { heat, direction };
}
