import { describe, expect, it } from "vitest";

import type { ChessPuzzle } from "../../shared/data-source";
import { positionAfterMoves, prepareChessPuzzle } from "./engine";

const LIVE_PUZZLE: ChessPuzzle = {
  fen: "5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22",
  moves: "d1e2 d4b2 e2d3 b2c1",
};

describe("Chess puzzle engine", () => {
  it("auto-plays moves[0] before expecting moves[1] for today's live puzzle", () => {
    const prepared = prepareChessPuzzle(LIVE_PUZZLE);
    const afterAutoMove = positionAfterMoves(LIVE_PUZZLE, 1);

    expect(prepared.firstAutoMove).toBe("d1e2");
    expect(prepared.firstPlayerMove).toBe("d4b2");
    expect(afterAutoMove.get("e2")).toMatchObject({ type: "k", color: "w" });
    expect(afterAutoMove.turn()).toBe("b");
    expect(prepared.playerColor).toBe("b");
  });
});
