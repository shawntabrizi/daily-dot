import { seededPrng } from "../../shared/seeded";
import { ROUNDS, type Hsb } from "./engine";

const V1_SALT = 0x636f6c72;

/** The v1 draw's ranges: no washed-out greys and no near-blacks to remember. */
export const V1_SATURATION = { min: 25, max: 100 } as const;
export const V1_BRIGHTNESS = { min: 30, max: 100 } as const;

/**
 * The day's five colours. v1 is historical content once played (D11): any
 * change to the draw rewrites past days, so a new rule ships as a new
 * version from a future start day.
 */
export function colorAnswer(day: number, version: "v1"): Hsb[] {
  if (version !== "v1") {
    throw new RangeError(`Unsupported Color generator version: ${String(version)}`);
  }
  const prng = seededPrng(day, V1_SALT);
  const span = (range: { min: number; max: number }): number =>
    range.min + (prng() % (range.max - range.min + 1));
  return Array.from({ length: ROUNDS }, () => ({
    hue: prng() % 360,
    saturation: span(V1_SATURATION),
    brightness: span(V1_BRIGHTNESS),
  }));
}
