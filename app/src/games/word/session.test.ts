import { describe, expect, it, vi } from "vitest";
import type { DataSource } from "../../shared/data-source";
import { createWordProgress } from "../../shared/progress";
import { MemoryStorage } from "../../test/memory-storage";
import { HostSignerUnavailableError } from "../../shared/host-signer";
import { applyGuess, submitResultOnce, wordScore } from "./session";

const ANSWER = "planet";

function fakeSource(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => 10,
    wordAnswer: async () => ANSWER,
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async (_from, count) =>
      Array.from({ length: count }, () => ({ played: 0n, solved: 0n, ontime: 0n })),
    record,
  };
}

describe("Word session", () => {
  it("solving the word in one completes the day and records score 1 exactly once", async () => {
    const progress = applyGuess(createWordProgress(10), ANSWER, ANSWER);
    expect(progress.complete).toBe(true);

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source = fakeSource(record);
    const storage = new MemoryStorage();

    await Promise.all([
      submitResultOnce(source, progress, storage),
      submitResultOnce(source, progress, storage),
    ]);
    await submitResultOnce(source, progress, storage);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(0, 10, 1, true);
  });

  it("has no loss state: the word stays open past six misses and records the guess count", async () => {
    let progress = createWordProgress(10);
    for (let guess = 0; guess < 9; guess += 1) {
      progress = applyGuess(progress, ANSWER, "garden");
      expect(progress.complete).toBe(false);
      expect(progress.submission).toBe("idle");
    }
    progress = applyGuess(progress, ANSWER, ANSWER);
    expect(progress.complete).toBe(true);
    expect(wordScore(progress)).toBe(10);

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    await submitResultOnce(fakeSource(record), progress, new MemoryStorage());
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(0, 10, 10, true);
  });

  it("takes no guess after the word is solved: the recorded score cannot change", () => {
    const progress = applyGuess(createWordProgress(10), ANSWER, ANSWER);
    expect(() => applyGuess(progress, ANSWER, "garden")).toThrow();
    expect(wordScore(progress)).toBe(1);
  });

  it("retains a hostless completion for one later host submission", async () => {
    const progress = applyGuess(createWordProgress(10), ANSWER, ANSWER);
    const storage = new MemoryStorage();
    const record = vi
      .fn<DataSource["record"]>()
      .mockRejectedValueOnce(new HostSignerUnavailableError("not in host"))
      .mockResolvedValue(undefined);
    const source = fakeSource(record);

    await expect(
      submitResultOnce(source, progress, storage),
    ).rejects.toBeInstanceOf(HostSignerUnavailableError);
    expect(progress.submission).toBe("deferred");

    await submitResultOnce(source, progress, storage);
    expect(progress.submission).toBe("submitted");
    expect(record).toHaveBeenCalledTimes(2);

    await submitResultOnce(source, progress, storage);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("never submits an unsolved word", async () => {
    const progress = applyGuess(createWordProgress(10), ANSWER, "garden");
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    await submitResultOnce(fakeSource(record), progress, new MemoryStorage());
    expect(record).not.toHaveBeenCalled();
  });
});
