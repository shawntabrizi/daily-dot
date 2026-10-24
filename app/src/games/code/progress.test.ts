import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import {
  applyCodeGuess,
  createCodeProgress,
  hasStartedCode,
  loadCodeProgress,
  saveCodeProgress,
  submitCodeOnce,
} from "./progress";

const DAY = 208;
const ANSWER = "1234";

function sourceFor(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
  };
}

describe("Code progress", () => {
  it("refuses anything but four digits, and a repeat, without spending a guess", () => {
    const start = createCodeProgress(DAY, ANSWER);
    const short = applyCodeGuess(start, "123");
    expect(short.accepted).toBe(false);
    const first = applyCodeGuess(start, "5678");
    expect(first.accepted).toBe(true);
    const again = applyCodeGuess(first.progress, "5678");
    expect(again.accepted).toBe(false);
    expect(again.progress.guesses).toEqual(["5678"]);
    if (!again.accepted) expect(again.message).toBe("You already tried 5678.");
  });

  it("completes on the answer with no cap, the score the guess count", () => {
    let progress = createCodeProgress(DAY, ANSWER);
    for (const guess of ["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777"]) {
      progress = applyCodeGuess(progress, guess).progress;
    }
    expect(progress.complete).toBe(false);
    progress = applyCodeGuess(progress, ANSWER).progress;
    expect(progress.complete).toBe(true);
    expect(progress.guesses).toHaveLength(9);
    expect(progress.submission).toBe("pending");
  });

  it("restores a game in progress and refuses a stored shape that could not have happened", () => {
    const storage = new MemoryStorage();
    const progress = applyCodeGuess(createCodeProgress(DAY, ANSWER), "5678").progress;
    saveCodeProgress(progress, storage);
    expect(loadCodeProgress(DAY, ANSWER, storage)).toEqual(progress);
    expect(hasStartedCode(DAY, storage)).toBe(true);
    // Another day's code, or the answer before the last guess, starts fresh.
    expect(loadCodeProgress(DAY, "9999", storage).guesses).toEqual([]);
    storage.setItem(`daily-on-dot:code:v1:${DAY}`, JSON.stringify({ ...progress, guesses: [ANSWER, "5678"] }));
    expect(loadCodeProgress(DAY, ANSWER, storage).guesses).toEqual([]);
  });

  it("records gameId 6 once, even when the finish is submitted twice", async () => {
    const storage = new MemoryStorage();
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const progress = applyCodeGuess(applyCodeGuess(createCodeProgress(DAY, ANSWER), "5678").progress, ANSWER).progress;
    await Promise.all([
      submitCodeOnce(sourceFor(record), progress, storage),
      submitCodeOnce(sourceFor(record), progress, storage),
    ]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(6, DAY, 2, true);
    expect(loadCodeProgress(DAY, ANSWER, storage).submission).toBe("submitted");
  });
});
