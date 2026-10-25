import placeData from "../../../../shared/countries/core.json";
import globeConfig from "../../../../shared/countries/globe-countries.json";

export type PlaceKind = "sovereign" | "territory" | "disputed";

/**
 * One Natural Earth admin-0 place (D26 superset). Which places the picker
 * accepts and which can be the answer come from `globe-countries.json`.
 */
export interface Place {
  /** Stable identity: never changes once the game is live. */
  id: string;
  name: string;
  /** Alternate names that find the place in the picker (D26). */
  aliases: readonly string[];
  kind: PlaceKind;
  /** The owning sovereign place's id; null for a sovereign. */
  owner: string | null;
  lat: number;
  lng: number;
  continent: string;
}

/** A place a player can guess. */
export type Country = Place;

function freezePlace(place: Place): Place {
  return Object.freeze({ ...place, aliases: Object.freeze([...place.aliases]) });
}

export const GLOBE_PLACES: readonly Place[] = Object.freeze(
  (placeData as Place[]).map(freezePlace),
);

function byId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Ids to places in id order, so a list's order in the config never matters. */
export function placesForIds(
  places: readonly Place[],
  ids: readonly string[],
): readonly Place[] {
  const index = new Map(places.map((place) => [place.id, place]));
  return Object.freeze(
    [...new Set(ids)].sort(byId).map((id) => {
      const place = index.get(id);
      if (!place) {
        throw new Error(`Unknown Globe place id: ${id}`);
      }
      return place;
    }),
  );
}

/** The places the picker accepts. */
export const GLOBE_COUNTRIES: readonly Country[] = placesForIds(
  GLOBE_PLACES,
  globeConfig.guessable,
);

/** One v1 answer-pool entry: place `id` from day `since` until (not on) `until`. */
export interface AnswerEntry {
  id: string;
  since: number;
  until?: number;
}

export const GLOBE_ANSWER_ENTRIES: readonly AnswerEntry[] = Object.freeze(
  (globeConfig.answers as AnswerEntry[]).map((entry) => Object.freeze({ ...entry })),
);

/** The pool on `day`: entries with `since <= day < until`, as places in id order. */
export function answerPoolOn(
  places: readonly Place[],
  entries: readonly AnswerEntry[],
  day: number,
): readonly Place[] {
  return placesForIds(
    places,
    entries
      .filter((entry) => entry.since <= day && (entry.until === undefined || day < entry.until))
      .map((entry) => entry.id),
  );
}

const V1_SEED_SALT = 0x676c6f62;

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

interface Cycle {
  /** The cycle's index: its PRNG seed. */
  index: number;
  start: number;
  pool: readonly Place[];
}

/**
 * The v1 rule. Days run in cycles: cycle `k` begins on its start day, takes
 * the answer pool as it stands that day (in id order), shuffles it with the
 * seeded PRNG for `k`, and lasts one day per answer; the next cycle begins
 * the day after. Every answer appears once per cycle, and an entry whose
 * `since` or `until` is in the future enters or leaves only cycles that begin
 * on or after that day, so no past answer, nor one in the running cycle,
 * ever moves. Only the answer entries are input: adding a place or a
 * guessable id changes nothing. Cycle starts are walked from day 0 once and
 * kept, so a lookup costs the number of cycles, not days × pool.
 *
 * v1 is historical content. Any algorithm change, or an answer entry edited
 * into the past, rewrites past answers: introduce a new version instead.
 */
export function createV1Answers(
  places: readonly Place[],
  entries: readonly AnswerEntry[],
): (day: number) => Place {
  const cycles: Cycle[] = [];
  let deckCycle = -1;
  let deck: Place[] = [];
  const cycleFor = (day: number): Cycle => {
    if (cycles.length === 0) {
      cycles.push({ index: 0, start: 0, pool: answerPoolOn(places, entries, 0) });
    }
    let last = cycles[cycles.length - 1]!;
    while (day >= last.start + last.pool.length) {
      if (last.pool.length === 0) {
        throw new Error(`The Globe answer pool is empty on day ${last.start}`);
      }
      const start = last.start + last.pool.length;
      last = { index: last.index + 1, start, pool: answerPoolOn(places, entries, start) };
      cycles.push(last);
    }
    if (last.pool.length === 0) {
      throw new Error(`The Globe answer pool is empty on day ${last.start}`);
    }
    // Binary search the known cycles: a past day needs no new walk.
    let low = 0;
    let high = cycles.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (cycles[middle]!.start <= day) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return cycles[low]!;
  };
  return (day) => {
    const cycle = cycleFor(day);
    if (cycle.index !== deckCycle) {
      deck = [...cycle.pool];
      const prng = createV1Prng(cycle.index);
      for (let index = deck.length - 1; index > 0; index -= 1) {
        const swapIndex = prng() % (index + 1);
        [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
      }
      deckCycle = cycle.index;
    }
    return deck[day - cycle.start]!;
  };
}

const v1Answer = createV1Answers(GLOBE_PLACES, GLOBE_ANSWER_ENTRIES);

export function globeAnswer(day: number, version: "v1"): Country {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (version !== "v1") {
    throw new RangeError(
      `Unsupported Globe generator version: ${String(version)}`,
    );
  }
  return v1Answer(day);
}
