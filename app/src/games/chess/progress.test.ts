import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChessPuzzle, DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import {
  applyOpponentReply,
  applyPlayerAttempt,
  createChessProgress,
  loadChessProgress,
  saveChessProgress,
  submitChessOnce,
} from "./progress";

const LIVE_PUZZLE: ChessPuzzle = {
  fen: "5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22",
  moves: "d1e2 d4b2 e2d3 b2c1",
};

function sourceFor(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => 208,
    wordAnswer: async () => "planet",
    chessPuzzle: async () => LIVE_PUZZLE,
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
  };
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Chess progress", () => {
  it("charges a wrong move without ending or advancing the puzzle", () => {
    let progress = createChessProgress(208, LIVE_PUZZLE);
    progress = applyOpponentReply(progress, LIVE_PUZZLE);

    const result = applyPlayerAttempt(progress, LIVE_PUZZLE, "d4c5");

    expect(result.correct).toBe(false);
    expect(result.progress.attempts).toBe(1);
    expect(result.progress.nextMoveIndex).toBe(1);
    expect(result.progress.complete).toBe(false);
  });

  it("restores the exact line position and attempt count", () => {
    const storage = new MemoryStorage();
    let progress = createChessProgress(208, LIVE_PUZZLE);
    progress = applyOpponentReply(progress, LIVE_PUZZLE);
    progress = applyPlayerAttempt(progress, LIVE_PUZZLE, "d4c5").progress;
    progress = applyPlayerAttempt(progress, LIVE_PUZZLE, "d4b2").progress;
    saveChessProgress(progress, storage);

    expect(loadChessProgress(208, LIVE_PUZZLE, storage)).toEqual(progress);
    expect(progress.nextMoveIndex).toBe(2);
    expect(progress.attempts).toBe(2);
  });

  it("records one gameId 2 result even when submitted twice", async () => {
    let progress = createChessProgress(208, LIVE_PUZZLE);
    progress = applyOpponentReply(progress, LIVE_PUZZLE);
    progress = applyPlayerAttempt(progress, LIVE_PUZZLE, "d4b2").progress;
    progress = applyOpponentReply(progress, LIVE_PUZZLE);
    progress = applyPlayerAttempt(progress, LIVE_PUZZLE, "b2c1").progress;

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    await Promise.all([
      submitChessOnce(sourceFor(record), progress),
      submitChessOnce(sourceFor(record), progress),
    ]);

    expect(progress.complete).toBe(true);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(2, 208, 2, true);
  });
});
