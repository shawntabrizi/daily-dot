import { describe, expect, it } from "vitest";
import { DAY_SECONDS, EPOCH_SECONDS } from "./day";
import { InMemoryDataSource } from "./data-source";
import { MemoryStorage } from "../test/memory-storage";

describe("InMemoryDataSource", () => {
  it("persists newly recorded completion bits across instances", async () => {
    const storage = new MemoryStorage();
    const now = () => EPOCH_SECONDS + DAY_SECONDS * 100;
    const first = new InMemoryDataSource(storage, now);
    await first.record(0, 100, 4, false);

    const reloaded = new InMemoryDataSource(storage, now);
    expect(await reloaded.dayBits(100)).toEqual({
      played: 1n,
      solved: 0n,
      ontime: 1n,
    });
  });
});

describe("InMemoryDataSource histograms", () => {
  const now = () => EPOCH_SECONDS + DAY_SECONDS * 100;

  it("counts an on-time finish in the day's distribution and a backfill never", async () => {
    const source = new InMemoryDataSource(new MemoryStorage(), now);
    const beforeToday = await source.histogram(0, 100);
    // Day 95 is one the stub's seeded history leaves unplayed for Word.
    const beforeArchive = await source.histogram(0, 95);

    await source.record(0, 100, 7, true);
    await source.record(0, 95, 2, true);

    const today = await source.histogram(0, 100);
    expect(today.total).toBe(beforeToday.total + 1);
    expect(today.buckets.find((entry) => entry.bucket === 6)?.count).toBe(
      (beforeToday.buckets.find((entry) => entry.bucket === 6)?.count ?? 0) + 1,
    );
    expect(await source.histogram(0, 95)).toEqual(beforeArchive);
  });

  it("buckets seconds games by 15-second steps and answers several games at once", async () => {
    const source = new InMemoryDataSource(new MemoryStorage(), now);
    const [before] = await source.histograms(100, [1]);
    await source.record(1, 100, 200, true);
    const [sudoku, word] = await source.histograms(100, [1, 0]);
    expect(sudoku!.buckets.find((entry) => entry.bucket === 13)?.count).toBe(
      (before!.buckets.find((entry) => entry.bucket === 13)?.count ?? 0) + 1,
    );
    expect(word).toEqual(await source.histogram(0, 100));
    expect(sudoku!.buckets.map((entry) => entry.bucket)).toEqual(
      [...sudoku!.buckets.map((entry) => entry.bucket)].sort((a, b) => a - b),
    );
  });

  it("returns the recorded score as the day's detail and zeros for an unplayed game", async () => {
    const source = new InMemoryDataSource(new MemoryStorage(), now);
    await source.record(2, 100, 3, true);
    expect(await source.details(100, [2, 0])).toEqual([
      { score: 3, solved: true },
      { score: 0, solved: false },
    ]);
  });
});
