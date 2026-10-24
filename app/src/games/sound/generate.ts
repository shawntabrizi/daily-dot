import { seededPrng } from "../../shared/seeded";
import { MAX_HZ, MIN_HZ, ROUNDS, roundHz } from "./engine";

const V1_SALT = 0x736f6e64;

/**
 * The day's five tones, log-uniform over 110–880 Hz, to the hundredth of a
 * Hz. v1 is historical content once played (D11): any change to the draw
 * rewrites past days, so a new rule ships as a new version from a future
 * start day.
 */
export function soundAnswer(day: number, version: "v1"): number[] {
  if (version !== "v1") {
    throw new RangeError(`Unsupported Sound generator version: ${String(version)}`);
  }
  const prng = seededPrng(day, V1_SALT);
  const octaves = Math.log2(MAX_HZ / MIN_HZ);
  return Array.from({ length: ROUNDS }, () => roundHz(MIN_HZ * 2 ** ((prng() / 0x1_0000_0000) * octaves)));
}
