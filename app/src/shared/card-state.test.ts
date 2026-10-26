import { describe, expect, it, vi } from "vitest";

import {
  CARD_STATE_KEY,
  CardStateWriter,
  cardStateBits,
  parseCardState,
  storageCardStore,
  withCardState,
  withDayBits,
  withResult,
  withSummary,
} from "./card-state";
import { DAY_SECONDS, EPOCH_SECONDS } from "./day";
import { InMemoryDataSource } from "./data-source";
import { MemoryStorage } from "../test/memory-storage";

const TODAY = 100;
const now = () => EPOCH_SECONDS + DAY_SECONDS * TODAY;

function stored(storage: MemoryStorage) {
  const state = parseCardState(storage.getItem(CARD_STATE_KEY));
  if (!state) {
    throw new Error("No card state was written");
  }
  return { day: state.day, ...cardStateBits(state) };
}

describe("card state merge", () => {
  it("reflects a completion as the game's played bit, and solved only when solved", () => {
    const played = withResult(null, TODAY, 3, false);
    expect(cardStateBits(played)).toEqual({ played: 1n << 3n, solved: 0n });

    const solved = withResult(played, TODAY, 7, true);
    expect(cardStateBits(solved)).toEqual({
      played: (1n << 3n) | (1n << 7n),
      solved: 1n << 7n,
    });
  });

  it("replaces a stale day instead of carrying its games into the new day", () => {
    const yesterday = withResult(null, TODAY - 1, 0, true);
    const today = withResult(yesterday, TODAY, 4, true);
    expect(today.day).toBe(TODAY);
    expect(cardStateBits(today)).toEqual({ played: 1n << 4n, solved: 1n << 4n });
  });

  it("does not let an archive visit overwrite today's checklist", () => {
    const today = withResult(null, TODAY, 2, true);
    expect(withResult(today, TODAY - 5, 0, true)).toBe(today);
    expect(withDayBits(today, TODAY - 5, { played: 0n, solved: 0n })).toBe(today);
  });

  it("unions a same-day read so a lagging chain read cannot drop a completion", () => {
    const recorded = withResult(null, TODAY, 5, true);
    const merged = withDayBits(recorded, TODAY, { played: 1n, solved: 0n });
    expect(cardStateBits(merged)).toEqual({ played: 1n | (1n << 5n), solved: 1n << 5n });
  });

  it("serializes bitmaps as decimal strings and rejects anything else", () => {
    const state = withResult(null, TODAY, 63, true);
    expect(JSON.parse(JSON.stringify(state))).toEqual({
      version: 1,
      day: TODAY,
      played: (1n << 63n).toString(),
      solved: (1n << 63n).toString(),
    });
    expect(parseCardState(JSON.stringify(state))).toEqual(state);
    expect(parseCardState(null)).toBeNull();
    expect(parseCardState("not json")).toBeNull();
    expect(parseCardState(JSON.stringify({ ...state, version: 2 }))).toBeNull();
    expect(parseCardState(JSON.stringify({ ...state, played: 5 }))).toBeNull();
    expect(parseCardState(JSON.stringify({ ...state, played: "0x1f" }))).toBeNull();
  });
});

describe("card summary", () => {
  it("rides on the day's record and survives a same-day bits merge", () => {
    const streaks = withSummary(null, TODAY, { streakAny: 4 });
    expect(streaks).toEqual({ version: 1, day: TODAY, played: "0", solved: "0", streakAny: 4 });

    const withBits = withResult(streaks, TODAY, 1, true);
    expect(withBits).toMatchObject({ streakAny: 4, played: (1n << 1n).toString() });

    const done = withSummary(withBits, TODAY, { dayPercentile: 23 });
    expect(done).toMatchObject({ dayPercentile: 23, streakAny: 4 });
    expect(parseCardState(JSON.stringify(done))).toEqual(done);
  });

  it("drops the summary with the day it belongs to and ignores an older day's", () => {
    const yesterday = withSummary(null, TODAY - 1, { dayPercentile: 10, streakAny: 3 });
    const today = withDayBits(yesterday, TODAY, { played: 1n, solved: 1n });
    expect(today).toEqual({ version: 1, day: TODAY, played: "1", solved: "1" });
    expect(withSummary(today, TODAY - 1, { dayPercentile: 99 })).toBe(today);
  });

  it("parses only whole non-negative summary numbers", () => {
    const state = withSummary(null, TODAY, { dayPercentile: 50 });
    expect(parseCardState(JSON.stringify({ ...state, streakAny: -1 }))).toEqual(state);
    expect(parseCardState(JSON.stringify({ ...state, dayPercentile: "50" }))).toEqual({
      version: 1,
      day: TODAY,
      played: "0",
      solved: "0",
    });
  });

  it("writes the summary through the serialized writer", async () => {
    const storage = new MemoryStorage();
    const writer = new CardStateWriter(storageCardStore(storage));
    await writer.markRecorded(TODAY, 2, true);
    await writer.syncSummary(TODAY, { streakAny: 5 });
    await writer.syncSummary(TODAY, { dayPercentile: 12 });
    expect(parseCardState(storage.getItem(CARD_STATE_KEY))).toEqual({
      version: 1,
      day: TODAY,
      played: (1n << 2n).toString(),
      solved: (1n << 2n).toString(),
      streakAny: 5,
      dayPercentile: 12,
    });
  });
});

describe("withCardState", () => {
  it("writes today's checklist after the home reads it", async () => {
    const storage = new MemoryStorage();
    const source = new InMemoryDataSource(storage, now);
    await source.record(1, TODAY, 30, true);
    const writer = new CardStateWriter(storageCardStore(storage));
    const wrapped = withCardState(source, writer);

    const bits = await wrapped.dayBits(TODAY);
    expect(bits.played).toBe(1n << 1n);
    expect(stored(storage)).toEqual({ day: TODAY, played: 1n << 1n, solved: 1n << 1n });
  });

  it("writes the card right after a successful record, before the home is revisited", async () => {
    const storage = new MemoryStorage();
    const writer = new CardStateWriter(storageCardStore(storage));
    const wrapped = withCardState(new InMemoryDataSource(storage, now), writer);

    await wrapped.record(8, TODAY, 42, true);
    await wrapped.record(0, TODAY, 3, false);
    expect(stored(storage)).toEqual({
      day: TODAY,
      played: (1n << 8n) | 1n,
      solved: 1n << 8n,
    });
  });

  it("tells the record hook which day landed, so the card can be given that day's streaks", async () => {
    // Why: the card used to get streaks only when the home page ran; a player
    // who goes game -> Pocket never saw them.
    const storage = new MemoryStorage();
    const writer = new CardStateWriter(storageCardStore(storage));
    const recorded: number[] = [];
    const wrapped = withCardState(new InMemoryDataSource(storage, now), writer, (day) => {
      recorded.push(day);
    });
    await wrapped.record(2, TODAY, 1, true);
    expect(recorded).toEqual([TODAY]);
  });

  it("writes nothing when the chain write fails", async () => {
    const storage = new MemoryStorage();
    const source = new InMemoryDataSource(storage, now);
    await source.record(2, TODAY, 1, true);
    const writer = new CardStateWriter(storageCardStore(storage));
    const wrapped = withCardState(source, writer);

    await expect(wrapped.record(2, TODAY, 1, true)).rejects.toThrow(/already recorded/);
    expect(storage.getItem(CARD_STATE_KEY)).toBeNull();
  });

  it("drops yesterday's record when today's bits arrive", async () => {
    const storage = new MemoryStorage();
    const writer = new CardStateWriter(storageCardStore(storage));
    const wrapped = withCardState(new InMemoryDataSource(storage, now), writer);

    await wrapped.record(6, TODAY - 1, 2, true);
    expect(stored(storage).day).toBe(TODAY - 1);
    await wrapped.dayBits(TODAY);
    expect(stored(storage)).toEqual({ day: TODAY, played: 0n, solved: 0n });
  });

  it("tells the app a game was recorded only after the chain write succeeded", async () => {
    const storage = new MemoryStorage();
    const source = new InMemoryDataSource(storage, now);
    await source.record(3, TODAY, 1, true);
    const recorded: number[] = [];
    const wrapped = withCardState(
      source,
      new CardStateWriter(storageCardStore(storage)),
      () => recorded.push(1),
    );

    await expect(wrapped.record(3, TODAY, 1, true)).rejects.toThrow();
    expect(recorded).toEqual([]);
    await wrapped.record(4, TODAY, 1, true);
    expect(recorded).toEqual([1]);
  });

  it("keeps serving the game even when the card store is broken", async () => {
    const storage = new MemoryStorage();
    const writer = new CardStateWriter({
      read: async () => null,
      write: async () => {
        throw new Error("KV unavailable");
      },
    });
    const wrapped = withCardState(new InMemoryDataSource(storage, now), writer);

    await expect(wrapped.record(9, TODAY, 70, true)).resolves.toBeUndefined();
    expect((await wrapped.dayBits(TODAY)).played).toBe(1n << 9n);
  });
});

describe("withCardState content passthrough", () => {
  it("forwards connectionsPuzzle so the wrapped stub can serve Daily Connections", async () => {
    const puzzle = { groups: [] };
    const source = {
      currentDay: async () => 0,
      wordAnswer: async () => "planet",
      connectionsPuzzle: vi.fn(async () => puzzle),
      dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
      dayBitsRange: async () => [],
      record: async () => undefined,
    };
    const wrapped = withCardState(
      source,
      new CardStateWriter(storageCardStore(new MemoryStorage())),
      () => undefined,
    );
    await expect(wrapped.connectionsPuzzle!(7)).resolves.toBe(puzzle);
    expect(source.connectionsPuzzle).toHaveBeenCalledWith(7);
  });
});
