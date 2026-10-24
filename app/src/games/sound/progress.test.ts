import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import { toneScore } from "./engine";
import { soundAnswer } from "./generate";
import {
  applySoundGuess,
  createSoundProgress,
  hasStartedSound,
  loadSoundProgress,
  saveSoundProgress,
  soundHundredths,
  soundScore,
  submitSoundOnce,
} from "./progress";

const DAY = 208;
const TARGETS = soundAnswer(DAY, "v1");
const KEY = `daily-on-dot:sound:v1:${DAY}`;

function sourceWith(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
  };
}

describe("Sound progress", () => {
  it("takes one pitch per tone and completes on the fifth, with no loss state", () => {
    let progress = createSoundProgress(DAY, TARGETS);
    for (let round = 0; round < 4; round += 1) {
      progress = applySoundGuess(progress, 300);
      expect(progress.complete).toBe(false);
      expect(progress.submission).toBe("idle");
    }
    progress = applySoundGuess(progress, 110);
    expect(progress.complete).toBe(true);
    expect(progress.submission).toBe("pending");
    expect(() => applySoundGuess(progress, 300)).toThrow();
    expect(() => applySoundGuess(createSoundProgress(DAY, TARGETS), 1000)).toThrow(RangeError);
    expect(() => applySoundGuess(createSoundProgress(DAY, TARGETS), 300.001)).toThrow(RangeError);
  });

  it("scores the day in tenths from the tones' shown hundredths", () => {
    let progress = createSoundProgress(DAY, TARGETS);
    const guesses = [416.48, 140, 126.14, 130, 700];
    for (const guess of guesses) progress = applySoundGuess(progress, guess);
    const hundredths = TARGETS.reduce((sum, target, index) => sum + toneScore(target, guesses[index]!), 0);
    expect(soundHundredths(progress)).toBe(hundredths);
    expect(soundScore(progress)).toBe(Math.floor((hundredths + 5) / 10));
    // Two exact tones: at least 20 points, short of 50.
    expect(soundScore(progress)).toBeGreaterThanOrEqual(200);
    expect(soundScore(progress)).toBeLessThan(500);
  });

  it("restores the tones done and refuses a stored day that does not fit", () => {
    const storage = new MemoryStorage();
    const progress = applySoundGuess(applySoundGuess(createSoundProgress(DAY, TARGETS), TARGETS[0]!), 200);
    saveSoundProgress(progress, storage);
    expect(loadSoundProgress(DAY, TARGETS, storage)).toEqual(progress);
    expect(hasStartedSound(DAY, storage)).toBe(true);
    expect(hasStartedSound(DAY + 1, storage)).toBe(false);
    // Another day's tones, an out-of-range guess, or a "complete" with two guesses: start fresh.
    expect(loadSoundProgress(DAY, soundAnswer(DAY + 1, "v1"), storage).guesses).toEqual([]);
    const stored = JSON.parse(storage.getItem(KEY)!) as Record<string, unknown>;
    storage.setItem(KEY, JSON.stringify({ ...stored, guesses: [2000] }));
    expect(loadSoundProgress(DAY, TARGETS, storage).guesses).toEqual([]);
    storage.setItem(KEY, JSON.stringify({ ...stored, complete: true, submission: "pending" }));
    expect(loadSoundProgress(DAY, TARGETS, storage).guesses).toEqual([]);
    storage.setItem(KEY, "{not json");
    expect(loadSoundProgress(DAY, TARGETS, storage).guesses).toEqual([]);
  });

  it("records gameId 9 once, with the total in tenths and solved true", async () => {
    const storage = new MemoryStorage();
    let progress = createSoundProgress(DAY, TARGETS);
    for (const target of TARGETS) progress = applySoundGuess(progress, target);
    saveSoundProgress(progress, storage);
    expect(hasStartedSound(DAY, storage)).toBe(false);

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source = sourceWith(record);
    await Promise.all([submitSoundOnce(source, progress, storage), submitSoundOnce(source, progress, storage)]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(9, DAY, 500, true);
    expect(loadSoundProgress(DAY, TARGETS, storage).submission).toBe("submitted");
    await submitSoundOnce(source, progress, storage);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("does not record an unfinished day, and a reload mid-write retries rather than writing twice", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const progress = applySoundGuess(createSoundProgress(DAY, TARGETS), TARGETS[0]!);
    await submitSoundOnce(sourceWith(record), progress, new MemoryStorage());
    expect(record).not.toHaveBeenCalled();

    const storage = new MemoryStorage();
    let done = createSoundProgress(DAY, TARGETS);
    for (const target of TARGETS) done = applySoundGuess(done, target);
    saveSoundProgress({ ...done, submission: "submitting" }, storage);
    expect(loadSoundProgress(DAY, TARGETS, storage).submission).toBe("failed");
  });
});
