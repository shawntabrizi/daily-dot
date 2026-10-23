import { getHostLocalStorage } from "@parity/product-sdk-host";

import type { DataSource, DayBits } from "./data-source";
import type { StorageLike } from "./storage";

/**
 * The day's checklist, written where the Pocket card worker can read it.
 *
 * The app and the card worker share no runtime: the only channel between them
 * is the product's host KV store. The app writes today's bits here whenever it
 * learns them (the home's hydrate, and every successful `record`), and the
 * worker polls the key while the card is on screen. Bitmaps travel as decimal
 * u64 strings because JSON has no bigint.
 */
export const CARD_STATE_KEY = "daily-on-dot:card:v1";

/** The card's id in the worker manifest's `pocket.cards`. */
export const CARD_ID = "daily";
/**
 * Set by the worker the first time the host draws the card on this device.
 * The one sure sign the card is in the Pocket: `subscribeCards` can be slow or
 * silent, and the app must not offer a card the user already holds.
 */
export const CARD_DRAWN_KEY = "daily-on-dot:card:drawn";

export interface CardState {
  version: 1;
  day: number;
  played: string;
  solved: string;
  /** The day's overall percentile once every roster game is recorded (WP34). */
  dayPercentile?: number;
  /** The hub streak (D17b), whenever the app derives it. */
  streakAny?: number;
}

export type CardSummary = Partial<Pick<CardState, "dayPercentile" | "streakAny">>;

export type CardBits = Pick<DayBits, "played" | "solved">;

const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_U32 = 0xffff_ffff;

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_U32;
}

function summaryOf(state: Partial<CardState>): CardSummary {
  const summary: CardSummary = {};
  if (isCount(state.dayPercentile)) {
    summary.dayPercentile = state.dayPercentile;
  }
  if (isCount(state.streakAny)) {
    summary.streakAny = state.streakAny;
  }
  return summary;
}

function parseBitmap(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const bitmap = BigInt(value);
  return bitmap <= MAX_U64 ? bitmap : null;
}

export function parseCardState(raw: string | null | undefined): CardState | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const candidate = parsed as Partial<CardState>;
  if (
    candidate.version !== 1
    || !Number.isInteger(candidate.day)
    || (candidate.day as number) < 0
    || (candidate.day as number) > MAX_U32
    || parseBitmap(candidate.played) === null
    || parseBitmap(candidate.solved) === null
  ) {
    return null;
  }
  return {
    version: 1,
    day: candidate.day as number,
    played: candidate.played as string,
    solved: candidate.solved as string,
    ...summaryOf(candidate),
  };
}

export function cardStateBits(state: CardState): CardBits {
  return { played: BigInt(state.played), solved: BigInt(state.solved) };
}

function cardStateFrom(day: number, bits: CardBits, summary: CardSummary = {}): CardState {
  return {
    version: 1,
    day,
    played: bits.played.toString(),
    solved: bits.solved.toString(),
    ...summaryOf(summary),
  };
}

/**
 * Merge, never clear. A newer day replaces the record; the same day unions in
 * (a lagging read must not drop a completion already recorded); an older day
 * is ignored so an archive visit cannot overwrite today's checklist.
 */
export function withDayBits(
  current: CardState | null,
  day: number,
  bits: CardBits,
): CardState {
  if (current === null || current.day < day) {
    return cardStateFrom(day, bits);
  }
  if (current.day > day) {
    return current;
  }
  const stored = cardStateBits(current);
  return cardStateFrom(
    day,
    {
      played: stored.played | bits.played,
      solved: stored.solved | bits.solved,
    },
    summaryOf(current),
  );
}

/**
 * The day's percentile and the hub streak ride on the same record. Same
 * rules as the bits: a newer day replaces, the same day merges, an older
 * day is ignored.
 */
export function withSummary(
  current: CardState | null,
  day: number,
  summary: CardSummary,
): CardState {
  if (current === null || current.day < day) {
    return cardStateFrom(day, { played: 0n, solved: 0n }, summary);
  }
  if (current.day > day) {
    return current;
  }
  return cardStateFrom(day, cardStateBits(current), { ...summaryOf(current), ...summaryOf(summary) });
}

export function withResult(
  current: CardState | null,
  day: number,
  gameId: number,
  solved: boolean,
): CardState {
  const bit = 1n << BigInt(gameId);
  return withDayBits(current, day, {
    played: bit,
    solved: solved ? bit : 0n,
  });
}

/** The one key, behind whichever store this runtime has. */
export interface CardStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export function storageCardStore(storage: StorageLike): CardStore {
  return {
    async read() {
      return storage.getItem(CARD_STATE_KEY);
    },
    async write(value) {
      storage.setItem(CARD_STATE_KEY, value);
    },
  };
}

/**
 * Host KV inside a host container, `localStorage` outside it so the dev
 * preview still writes something the worker-shaped code can read back.
 */
export async function detectCardStore(
  fallback?: StorageLike,
): Promise<CardStore> {
  try {
    const host = await getHostLocalStorage();
    if (host) {
      return {
        async read() {
          const value = await host.readString(CARD_STATE_KEY);
          return value === "" ? null : value;
        },
        write: (value) => host.writeString(CARD_STATE_KEY, value),
      };
    }
  } catch {
    // Not a host: fall through.
  }
  // Resolved late: a worker or a Node tool has no window at all.
  return storageCardStore(fallback ?? window.localStorage);
}

/**
 * Serialises read-modify-write so a `record` landing during the home's hydrate
 * cannot lose either update.
 */
export class CardStateWriter {
  readonly #store: Promise<CardStore>;
  #queue: Promise<void> = Promise.resolve();

  constructor(store: CardStore | Promise<CardStore>) {
    this.#store = Promise.resolve(store);
  }

  syncDay(day: number, bits: CardBits): Promise<void> {
    return this.#update((current) => withDayBits(current, day, bits));
  }

  markRecorded(day: number, gameId: number, solved: boolean): Promise<void> {
    return this.#update((current) => withResult(current, day, gameId, solved));
  }

  syncSummary(day: number, summary: CardSummary): Promise<void> {
    return this.#update((current) => withSummary(current, day, summary));
  }

  #update(next: (current: CardState | null) => CardState): Promise<void> {
    const run = this.#queue.then(async () => {
      const store = await this.#store;
      const current = parseCardState(await store.read());
      const updated = next(current);
      if (current && JSON.stringify(current) === JSON.stringify(updated)) {
        return;
      }
      await store.write(JSON.stringify(updated));
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }
}

/**
 * The one hook: every `dayBits` read and every successful `record` on the
 * returned source also lands in the card store. A failed card write is logged,
 * not thrown: the chain write already happened and the game must not report
 * it as lost.
 */
export function withCardState(
  source: DataSource,
  writer: CardStateWriter,
  onRecorded: (day: number) => void = () => undefined,
): DataSource {
  const mirror = (work: Promise<void>): Promise<void> =>
    work.catch((error: unknown) => {
      console.warn("[daily-on-dot] card state write failed", error);
    });

  const wrapped: DataSource = {
    currentDay: () => source.currentDay(),
    wordAnswer: (day) => source.wordAnswer(day),
    dayBitsRange: (from, count) => source.dayBitsRange(from, count),
    async dayBits(day) {
      const bits = await source.dayBits(day);
      await mirror(writer.syncDay(day, bits));
      return bits;
    },
    async record(gameId, day, score, solved) {
      await source.record(gameId, day, score, solved);
      await mirror(writer.markRecorded(day, gameId, solved));
      onRecorded(day);
    },
  };
  if (source.miniPuzzle) {
    wrapped.miniPuzzle = (day) => source.miniPuzzle!(day);
  }
  if (source.connectionsPuzzle) {
    wrapped.connectionsPuzzle = (day) => source.connectionsPuzzle!(day);
  }
  if (source.chessPuzzle) {
    wrapped.chessPuzzle = (day) => source.chessPuzzle!(day);
  }
  if (source.histogram) {
    wrapped.histogram = (gameId, day) => source.histogram!(gameId, day);
  }
  if (source.histograms) {
    wrapped.histograms = (day, gameIds) => source.histograms!(day, gameIds);
  }
  if (source.details) {
    wrapped.details = (day, gameIds) => source.details!(day, gameIds);
  }
  return wrapped;
}
