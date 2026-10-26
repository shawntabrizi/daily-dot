/** Daily Angle (D23): a whole-degree angle of 1°–359°, found with Angledle's hints. */
export const MIN_ANGLE = 1;
export const MAX_ANGLE = 359;

export type Heat = "exact" | "burning" | "hot" | "warm" | "cold";

export interface AngleHint {
  heat: Heat;
  /** Where the answer lies from the guess: "up" larger, "down" smaller; null when exact. */
  direction: "up" | "down" | null;
}

/** The hint words: one heat scale, so a nearer hint always reads hotter. */
export const HEAT_WORDS: Record<Heat, string> = {
  exact: "Got it!",
  burning: "Burning!",
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const HEAT_MARKS: Record<Heat, string> = {
  exact: "🎯",
  burning: "🔥",
  hot: "🌶️",
  warm: "🌡️",
  cold: "☃️",
};

/** The widest miss, in degrees, each hint covers; beyond Warm is Cold. */
export const HEAT_BANDS = { burning: 3, hot: 10, warm: 25 } as const;

export function isAngle(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_ANGLE && value <= MAX_ANGLE;
}

/**
 * Within 3° is Burning, 10° Hot, 25° Warm, beyond Cold: tighter than
 * Angledle's 5/15/30, where 14° off still read Hot. The distance is
 * along the 1–359 scale, not around the circle: 2° and 358° are 356 apart,
 * as the arrow (up or down) says.
 */
export function hintFor(guess: number, answer: number): AngleHint {
  if (!isAngle(guess) || !isAngle(answer)) {
    throw new RangeError("Angles are whole degrees from 1 to 359");
  }
  const off = Math.abs(answer - guess);
  const direction = off === 0 ? null : answer > guess ? "up" : "down";
  const heat: Heat = off === 0 ? "exact" : off <= HEAT_BANDS.burning
      ? "burning"
      : off <= HEAT_BANDS.hot
        ? "hot"
        : off <= HEAT_BANDS.warm
          ? "warm"
          : "cold";
  return { heat, direction };
}
