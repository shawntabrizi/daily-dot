import countryData from "../../../../shared/countries/core.json";

export interface Country {
  name: string;
  lat: number;
  lng: number;
  continent: string;
  iso: string;
}

export const GLOBE_COUNTRIES: readonly Country[] = Object.freeze(
  countryData.map((country) => Object.freeze({ ...country })),
);

const V1_SEED_SALT = 0x676c6f62;
let cachedCycle = -1;
let cachedDeck: readonly Country[] = [];

function createV1Prng(cycle: number): () => number {
  const high = Math.floor(cycle / 0x1_0000_0000);
  let state = ((cycle >>> 0) ^ (high >>> 0) ^ V1_SEED_SALT) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}

function deckForV1Cycle(cycle: number): readonly Country[] {
  if (cycle === cachedCycle) {
    return cachedDeck;
  }

  const deck = [...GLOBE_COUNTRIES];
  const prng = createV1Prng(cycle);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = prng() % (index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }
  cachedCycle = cycle;
  cachedDeck = Object.freeze(deck);
  return cachedDeck;
}

/**
 * Natural Earth's 166-country table necessarily recycles about 2.2 times per
 * year. v1 uses a complete shuffled deck before starting a cycle-specific
 * reshuffle, so recycling never repeats a country early within a cycle.
 *
 * v1 is historical content. Any algorithm or country-table change rewrites
 * past answers, so introduce a new version with a future start day instead.
 */
export function globeAnswer(day: number, version: "v1"): Country {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (version !== "v1") {
    throw new RangeError(
      `Unsupported Globe generator version: ${String(version)}`,
    );
  }

  const cycle = Math.floor(day / GLOBE_COUNTRIES.length);
  const index = day % GLOBE_COUNTRIES.length;
  return deckForV1Cycle(cycle)[index]!;
}
