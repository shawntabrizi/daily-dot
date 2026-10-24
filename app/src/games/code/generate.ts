import { seededPrng } from "../../shared/seeded";
import { CODE_LENGTH } from "./engine";

const V1_SALT = 0x636f6465;

/**
 * The day's code. v1 is historical content once played (D11): any change to
 * the draw rewrites past codes, so a new rule ships as a new version from a
 * future start day.
 */
export function codeAnswer(day: number, version: "v1"): string {
  if (version !== "v1") {
    throw new RangeError(`Unsupported Code generator version: ${String(version)}`);
  }
  const prng = seededPrng(day, V1_SALT);
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += String(prng() % 10);
  }
  return code;
}
