/**
 * Daily Sound (D25): five tones by ear, each scored by how close the found
 * pitch is to the heard one on the Glasberg & Moore ERB-rate scale, so a
 * miss weighs about the same low and high.
 */
export const ROUNDS = 5;
/** The tones' range, A2 to A5: three octaves. */
export const MIN_HZ = 110;
export const MAX_HZ = 880;
/** The pitch control's range in whole cents above MIN_HZ (three octaves). */
export const MAX_CENTS = 3600;
/** A ΔERB at or beyond this scores nothing (a round choice; tune before first play). */
export const ZERO_AT_ERB = 0.5;
/** A round's best score, in hundredths of a point (10.00 points). */
export const ROUND_MAX_HUNDREDTHS = 1000;

/** ERB-rate of a frequency: E(f) = 21.4 · log10(1 + 0.00437 · f). */
export function erbRate(hz: number): number {
  if (!Number.isFinite(hz) || hz < 0) {
    throw new RangeError("A frequency is a non-negative number of Hz");
  }
  return 21.4 * Math.log10(1 + 0.00437 * hz);
}

/** The distance between two pitches in ERB-rate. */
export function erbDelta(target: number, guess: number): number {
  return Math.abs(erbRate(target) - erbRate(guess));
}

/** A tone's score, unrounded: 10 × max(0, 1 − ΔERB / 0.5). */
export function scoreForErb(deltaErb: number): number {
  if (!Number.isFinite(deltaErb) || deltaErb < 0) {
    throw new RangeError("ΔERB is a non-negative distance");
  }
  return 10 * Math.max(0, 1 - deltaErb / ZERO_AT_ERB);
}

/** A frequency in Hz to the hundredth: the precision every tone is shown and scored at. */
export function roundHz(hz: number): number {
  return Math.round(hz * 100) / 100;
}

export function isHz(value: unknown): value is number {
  return (
    typeof value === "number"
    && Number.isFinite(value)
    && value >= MIN_HZ
    && value <= MAX_HZ
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}

/** One tone's score in hundredths of a point (0–1000), rounded half up, as the reveal shows it. */
export function toneScore(target: number, guess: number): number {
  if (!isHz(target) || !isHz(guess)) {
    throw new RangeError(`Tones are ${MIN_HZ}–${MAX_HZ} Hz to the hundredth`);
  }
  return Math.round(100 * scoreForErb(erbDelta(target, guess)));
}

/** The tones' shown scores so far, summed, in hundredths. */
export function totalHundredths(targets: readonly number[], guesses: readonly number[]): number {
  return guesses.reduce((sum, guess, index) => sum + toneScore(targets[index]!, guess), 0);
}

/**
 * The day's recorded score in tenths (0–500): the tones' shown hundredths
 * summed, then rounded half up to the tenth. Summing the shown scores keeps
 * the total the one the reveals added up to.
 */
export function totalScore(targets: readonly number[], guesses: readonly number[]): number {
  return Math.floor((totalHundredths(targets, guesses) + 5) / 10);
}

export function clampCents(cents: number): number {
  return Math.min(MAX_CENTS, Math.max(0, Math.round(cents)));
}

/** The pitch control's position (whole cents above 110 Hz) as Hz, to the hundredth. */
export function centsToHz(cents: number): number {
  return roundHz(MIN_HZ * 2 ** (clampCents(cents) / 1200));
}

/** The nearest whole cent above 110 Hz for a frequency, within the range. */
export function hzToCents(hz: number): number {
  return clampCents(1200 * Math.log2(hz / MIN_HZ));
}

/**
 * The drag: a vertical position (0 at the top of the board, 1 at the
 * bottom) as whole cents. Pitch is log-scale up the board: 880 Hz at the
 * top, 110 Hz at the bottom, so each octave is a third of the height.
 */
export function positionToCents(fromTop: number): number {
  return clampCents((1 - Math.min(1, Math.max(0, fromTop))) * MAX_CENTS);
}

/** "220.00 Hz". */
export function formatHz(hz: number): string {
  return `${hz.toFixed(2)} Hz`;
}

/** Hundredths of a point as "2.52". */
export function formatHundredths(hundredths: number): string {
  return (hundredths / 100).toFixed(2);
}

/** The reveal's line under the score. */
export function verdictFor(hundredths: number): string {
  if (hundredths >= 950) return "Perfect pitch.";
  if (hundredths >= 800) return "So close.";
  if (hundredths >= 600) return "Close.";
  if (hundredths >= 300) return "In the neighborhood.";
  if (hundredths > 0) return "A way off.";
  return "Not this time.";
}
