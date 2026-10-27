import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import { roundScore, type Hsb } from "./engine";
import { colorAnswer } from "./generate";
import {
  applyColorGuess,
  colorScore,
  createColorProgress,
  hasStartedColor,
  loadColorProgress,
  saveColorProgress,
  submitColorOnce,
} from "./progress";

const DAY = 208;
const TARGETS = colorAnswer(DAY, "v1");
const KEY = `daily-on-dot:color:v1:${DAY}`;

function sourceWith(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
  };
}

function nudge(color: Hsb, by: number): Hsb {
  return { ...color, hue: (color.hue + by) % 360 };
}

describe("Color progress", () => {
  it("takes one guess per color and completes on the fifth, with no loss state", () => {
    let progress = createColorProgress(DAY, TARGETS);
    for (let round = 0; round < 4; round += 1) {
      progress = applyColorGuess(progress, nudge(TARGETS[round]!, 20));
      expect(progress.complete).toBe(false);
      expect(progress.submission).toBe("idle");
    }
    progress = applyColorGuess(progress, { hue: 0, saturation: 0, brightness: 0 });
    expect(progress.complete).toBe(true);
    expect(progress.submission).toBe("pending");
    expect(() => applyColorGuess(progress, TARGETS[0]!)).toThrow();
    expect(() => applyColorGuess(createColorProgress(DAY, TARGETS), { hue: 360, saturation: 0, brightness: 0 })).toThrow(RangeError);
  });

  it("scores the day as the sum of each color's rounded score, in tenths", () => {
    let progress = createColorProgress(DAY, TARGETS);
    const guesses = TARGETS.map((target, index) => nudge(target, index * 7));
    for (const guess of guesses) progress = applyColorGuess(progress, guess);
    const expected = TARGETS.reduce((sum, target, index) => sum + roundScore(target, guesses[index]!), 0);
    expect(colorScore(progress)).toBe(expected);
    // The first guess is exact: a full 10 points.
    expect(roundScore(TARGETS[0]!, guesses[0]!)).toBe(100);
    expect(colorScore(progress)).toBeLessThan(500);
  });

  it("restores the rounds done and refuses a stored day that does not fit", () => {
    const storage = new MemoryStorage();
    const progress = applyColorGuess(applyColorGuess(createColorProgress(DAY, TARGETS), TARGETS[0]!), TARGETS[1]!);
    saveColorProgress(progress, storage);
    expect(loadColorProgress(DAY, TARGETS, storage)).toEqual(progress);
    expect(hasStartedColor(DAY, storage)).toBe(true);
    // Another day's colors, a bad guess, or a "complete" with four guesses: start fresh.
    expect(loadColorProgress(DAY, colorAnswer(DAY + 1, "v1"), storage).guesses).toEqual([]);
    const stored = JSON.parse(storage.getItem(KEY)!) as Record<string, unknown>;
    storage.setItem(KEY, JSON.stringify({ ...stored, guesses: [{ hue: 400, saturation: 1, brightness: 1 }] }));
    expect(loadColorProgress(DAY, TARGETS, storage).guesses).toEqual([]);
    storage.setItem(KEY, JSON.stringify({ ...stored, complete: true, submission: "pending" }));
    expect(loadColorProgress(DAY, TARGETS, storage).guesses).toEqual([]);
  });

  it("records gameId 8 once, with the total in tenths and solved true", async () => {
    const storage = new MemoryStorage();
    let progress = createColorProgress(DAY, TARGETS);
    for (const target of TARGETS) progress = applyColorGuess(progress, target);
    saveColorProgress(progress, storage);
    expect(hasStartedColor(DAY, storage)).toBe(false);

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source = sourceWith(record);
    await Promise.all([submitColorOnce(source, progress, storage), submitColorOnce(source, progress, storage)]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(8, DAY, 500, true);
    expect(loadColorProgress(DAY, TARGETS, storage).submission).toBe("submitted");
  });

  it("does not record an unfinished day", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const progress = applyColorGuess(createColorProgress(DAY, TARGETS), TARGETS[0]!);
    await submitColorOnce(sourceWith(record), progress, new MemoryStorage());
    expect(record).not.toHaveBeenCalled();
  });
});
