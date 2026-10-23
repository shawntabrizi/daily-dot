import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import {
  applyAngleGuess,
  createAngleProgress,
  loadAngleProgress,
  saveAngleProgress,
  submitAngleOnce,
} from "./progress";

const DAY = 208;

describe("Angle progress", () => {
  it("refuses a degree outside 1–359, a fraction and a repeat, without spending a guess", () => {
    const start = createAngleProgress(DAY, 137);
    for (const bad of [0, 360, 45.5, Number.NaN]) {
      expect(applyAngleGuess(start, bad).accepted).toBe(false);
    }
    const first = applyAngleGuess(start, 180).progress;
    const again = applyAngleGuess(first, 180);
    expect(again.accepted).toBe(false);
    expect(again.progress.guesses).toEqual([180]);
    if (!again.accepted) expect(again.message).toBe("You already tried 180°.");
  });

  it("has no cap: a seventh guess still counts, and the exact degree completes it", () => {
    let progress = createAngleProgress(DAY, 137);
    for (const guess of [180, 90, 150, 140, 130, 138]) {
      progress = applyAngleGuess(progress, guess).progress;
    }
    expect(progress.complete).toBe(false);
    progress = applyAngleGuess(progress, 137).progress;
    expect(progress.complete).toBe(true);
    expect(progress.guesses).toHaveLength(7);
  });

  it("restores the guesses and records gameId 7 once", async () => {
    const storage = new MemoryStorage();
    const progress = applyAngleGuess(applyAngleGuess(createAngleProgress(DAY, 137), 180).progress, 137).progress;
    saveAngleProgress(progress, storage);
    expect(loadAngleProgress(DAY, 137, storage)).toEqual(progress);
    expect(loadAngleProgress(DAY, 138, storage).guesses).toEqual([]);

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source = {
      currentDay: async () => DAY,
      wordAnswer: async () => "planet",
      dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
      dayBitsRange: async () => [],
      record,
    } satisfies DataSource;
    await Promise.all([submitAngleOnce(source, progress, storage), submitAngleOnce(source, progress, storage)]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(7, DAY, 2, true);
  });
});
