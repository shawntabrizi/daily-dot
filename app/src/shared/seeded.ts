/**
 * The procedural games' shared PRNG: a 32-bit mix seeded from the day and a
 * per-game salt. Frozen with each generator that uses it (D11): change it and
 * every past puzzle of those games changes too.
 */
export function seededPrng(day: number, salt: number): () => number {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  const high = Math.floor(day / 0x1_0000_0000);
  let state = ((day >>> 0) ^ (high >>> 0) ^ salt) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}
