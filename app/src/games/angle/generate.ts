import { seededPrng } from "../../shared/seeded";
import { MAX_ANGLE, MIN_ANGLE } from "./engine";

const V1_SALT = 0x616e676c;

export interface AnglePuzzle {
  /** The marked angle, whole degrees. */
  degrees: number;
  /** Where the first ray points, degrees counterclockwise from east; the drawing turns daily. */
  rotation: number;
}

/**
 * The day's angle. v1 is historical content once played (D11): any change to
 * the draw rewrites past puzzles, so a new rule ships as a new version from a
 * future start day.
 */
export function angleAnswer(day: number, version: "v1"): AnglePuzzle {
  if (version !== "v1") {
    throw new RangeError(`Unsupported Angle generator version: ${String(version)}`);
  }
  const prng = seededPrng(day, V1_SALT);
  return {
    degrees: MIN_ANGLE + (prng() % (MAX_ANGLE - MIN_ANGLE + 1)),
    rotation: prng() % 360,
  };
}
