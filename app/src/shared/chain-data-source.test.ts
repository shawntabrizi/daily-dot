import { describe, expect, it, vi } from "vitest";

import {
  ChainDataSource,
  type ChainReadBindings,
  type ChainWriteBindings,
} from "./chain-data-source";

function success<T>(value: T): { success: true; value: T } {
  return { success: true, value };
}

function bindings(
  overrides: Partial<ChainReadBindings["scores"]> = {},
): { reads: ChainReadBindings; writes: ChainWriteBindings } {
  const reads: ChainReadBindings = {
    accountH160: "0x1111111111111111111111111111111111111111",
    scores: {
      currentDay: { query: vi.fn(async () => success(17n)) },
      getDay: {
        query: vi.fn(async () =>
          success({ played: 0n, solved: 0n, ontime: 0n }),
        ),
      },
      getDays: { query: vi.fn(async () => success([])) },
      histogram: {
        query: vi.fn(async () =>
          success({ total: 3n, buckets: [{ bucket: 2n, count: 1n }, { bucket: 4n, count: 2n }] }),
        ),
      },
      histograms: { query: vi.fn(async () => success([])) },
      getDetails: { query: vi.fn(async () => success([])) },
      ...overrides,
    },
    word: {
      wordForDay: { query: vi.fn(async () => success("planet")) },
    },
    chess: {
      puzzleForDay: {
        query: vi.fn(async () =>
          success({
            fen: "5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22",
            moves: "d1e2 d4b2 e2d3 b2c1",
          }),
        ),
      },
    },
    mini: {
      setId: 0,
      puzzleForDay: {
        query: vi.fn(async () =>
          success({ grid: "a".repeat(25), across: ["a", "b", "c", "d", "e"], down: ["a", "b", "c", "d", "e"] }),
        ),
      },
    },
    connections: {
      setId: 0,
      puzzleForDay: {
        query: vi.fn(async () => success({ groups: [] })),
      },
    },
  };
  return {
    reads,
    writes: {
      scores: {
        record: {
          tx: vi.fn(async () => ({ ok: true })),
        },
      },
    },
  };
}

describe("ChainDataSource", () => {
  it("reads a Connections puzzle from the seeded set", async () => {
    const live = bindings();
    const puzzleForDay = {
      query: vi.fn(async () =>
        success({
          groups: [
            { label: "Breads", words: ["roll", "loaf", "bun", "baguette"], tier: 0n },
            { label: "Things with keys", words: ["piano", "keyboard", "lock", "map"], tier: 1n },
            { label: "Ways to move on foot", words: ["walk", "skip", "hop", "jog"], tier: 2n },
            { label: "Ice ___", words: ["cream", "cube", "age", "berg"], tier: 3n },
          ],
        }),
      ),
    };
    const seeded = new ChainDataSource(
      { ...live.reads, connections: { setId: 5, puzzleForDay } },
      live.writes,
      0,
      0,
    );
    const puzzle = await seeded.connectionsPuzzle(17);
    expect(puzzleForDay.query).toHaveBeenCalledWith(5, 17);
    expect(puzzle.groups[3]).toEqual({ label: "Ice ___", words: ["cream", "cube", "age", "berg"], tier: 3 });

  });

  it("calls the deployed contract methods through the unchanged seam", async () => {
    const live = bindings();
    const source = new ChainDataSource(live.reads, live.writes, 9, 4);

    await expect(source.currentDay()).resolves.toBe(17);
    await expect(source.wordAnswer(17)).resolves.toBe("planet");
    await expect(source.chessPuzzle(17)).resolves.toEqual({
      fen: "5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22",
      moves: "d1e2 d4b2 e2d3 b2c1",
    });

    expect(live.reads.word.wordForDay.query).toHaveBeenCalledWith(9, 17);
    expect(live.reads.chess.puzzleForDay.query).toHaveBeenCalledWith(4, 17);
  });

  it("preserves bitmap bits 53 through 63 across uint64 to bigint", async () => {
    const highBits = ((1n << 11n) - 1n) << 53n;
    const live = bindings({
      getDay: {
        query: vi.fn(async () =>
          success({
            played: highBits,
            solved: 1n << 63n,
            ontime: 1n << 53n,
          }),
        ),
      },
      getDays: {
        query: vi.fn(async () =>
          success([
            {
              played: highBits,
              solved: 1n << 63n,
              ontime: 1n << 53n,
            },
          ]),
        ),
      },
    });
    const source = new ChainDataSource(live.reads, live.writes, 0, 0);

    await expect(source.dayBits(17)).resolves.toEqual({
      played: highBits,
      solved: 1n << 63n,
      ontime: 1n << 53n,
    });
    await expect(source.dayBitsRange(17, 1)).resolves.toEqual([
      {
        played: highBits,
        solved: 1n << 63n,
        ontime: 1n << 53n,
      },
    ]);
    expect(live.reads.scores.getDay.query).toHaveBeenCalledWith(
      live.reads.accountH160,
      17,
    );
    expect(live.reads.scores.getDays.query).toHaveBeenCalledWith(
      live.reads.accountH160,
      17,
      1,
    );
  });

  it("retries a transient contract read without retrying a transaction", async () => {
    const dropped = new Error("WebSocket connection dropped");
    const currentDay = vi
      .fn()
      .mockRejectedValueOnce(dropped)
      .mockResolvedValue(success(22n));
    const live = bindings({ currentDay: { query: currentDay } });
    const source = new ChainDataSource(live.reads, live.writes, 0, 0, {
      delays: [0],
      sleep: async () => undefined,
    });

    await expect(source.currentDay()).resolves.toBe(22);
    expect(currentDay).toHaveBeenCalledTimes(2);
  });

  it("waits for best-block inclusion and surfaces dispatch failure", async () => {
    const beforeRecord = vi.fn(async () => undefined);
    const tx = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, dispatchError: { type: "Rejected" } });
    const live = bindings();
    live.writes.scores.record = { tx };
    live.writes.beforeRecord = beforeRecord;
    const source = new ChainDataSource(live.reads, live.writes, 0, 0);

    await expect(source.record(0, 17, 5, true)).resolves.toBeUndefined();
    expect(beforeRecord).toHaveBeenCalledTimes(1);
    expect(tx).toHaveBeenCalledWith(0, 17, 5, true, {
      waitFor: "best-block",
    });

    await expect(source.record(0, 17, 4, false)).rejects.toThrow(
      "scores.record failed",
    );
  });

  it("does not construct signed bindings for reads", async () => {
    const live = bindings();
    const anonymousAccount = vi.fn(async () =>
      "0x0000000000000000000000000000000000000000" as const
    );
    live.reads.accountH160 = anonymousAccount;
    const writes = vi.fn(async () => live.writes);
    const source = new ChainDataSource(live.reads, writes, 0, 0);

    await expect(source.currentDay()).resolves.toBe(17);
    await expect(source.wordAnswer(17)).resolves.toBe("planet");
    await expect(source.dayBits(17)).resolves.toEqual({
      played: 0n,
      solved: 0n,
      ontime: 0n,
    });
    expect(anonymousAccount).toHaveBeenCalledOnce();
    expect(writes).not.toHaveBeenCalled();

    await source.record(0, 17, 5, true);
    expect(writes).toHaveBeenCalledOnce();
  });
});

describe("ChainDataSource.record failures", () => {
  it("names the SDK's decoded failure and logs it for the device console", async () => {
    // The pool refused the transaction (a product account on pipeline 0 pays
    // fees in PAS it does not hold). The game screen only says "Recording
    // failed."; the thrown message and the console must carry the cause.
    const live = bindings();
    const refused = Object.assign(
      new Error("Transaction failed before inclusion: Invalid.Payment"),
      { reason: { type: "Invalid", value: { type: "Payment" } } },
    );
    live.writes.scores.record = {
      tx: vi.fn(async () => ({ ok: false, error: refused })),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const source = new ChainDataSource(live.reads, live.writes, 0, 0);

    await expect(source.record(7, 293, 1, true)).rejects.toThrow(
      'scores.record failed: Transaction failed before inclusion: Invalid.Payment {"type":"Invalid","value":{"type":"Payment"}}',
    );
    expect(error).toHaveBeenCalledWith(
      "[daily-on-dot] record(game 7, day 293) failed",
      expect.objectContaining({ message: expect.stringContaining("Invalid.Payment") }),
    );
    error.mockRestore();
  });

  it("logs a failure of the pre-write step (allowance, PGAS, mapping) the same way", async () => {
    const live = bindings();
    live.writes.beforeRecord = vi.fn(async () => {
      throw new Error("Account mapping failed: Revive.AccountAlreadyMapped");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const source = new ChainDataSource(live.reads, live.writes, 0, 0);

    await expect(source.record(0, 293, 1, true)).rejects.toThrow(
      "Account mapping failed: Revive.AccountAlreadyMapped",
    );
    expect(error).toHaveBeenCalledWith(
      "[daily-on-dot] record(game 0, day 293) failed",
      expect.objectContaining({ message: expect.stringContaining("AccountAlreadyMapped") }),
    );
    error.mockRestore();
  });

  it("decodes a histogram's uint values into numbers", async () => {
    const live = bindings();
    const source = new ChainDataSource(live.reads, live.writes, 0, 0);

    await expect(source.histogram(0, 17)).resolves.toEqual({
      total: 3,
      buckets: [
        { bucket: 2, count: 1 },
        { bucket: 4, count: 2 },
      ],
    });
    expect(live.reads.scores.histogram.query).toHaveBeenCalledWith(0, 17);
  });

  it("reads several histograms and the account's details in one call each", async () => {
    const live = bindings({
      histograms: {
        query: vi.fn(async () =>
          success([
            { total: 1n, buckets: [{ bucket: 13n, count: 1n }] },
            { total: 0n, buckets: [] },
          ]),
        ),
      },
      getDetails: {
        query: vi.fn(async () =>
          success([{ score: 205n, solved: true }, { score: 0n, solved: false }]),
        ),
      },
    });
    const source = new ChainDataSource(live.reads, live.writes, 0, 0);

    await expect(source.histograms(17, [1, 0])).resolves.toEqual([
      { total: 1, buckets: [{ bucket: 13, count: 1 }] },
      { total: 0, buckets: [] },
    ]);
    expect(live.reads.scores.histograms.query).toHaveBeenCalledWith(17, [1, 0]);
    await expect(source.details(17, [1, 0])).resolves.toEqual([
      { score: 205, solved: true },
      { score: 0, solved: false },
    ]);
    expect(live.reads.scores.getDetails.query).toHaveBeenCalledWith(
      live.reads.accountH160,
      17,
      [1, 0],
    );
  });

  it("rejects a histogram batch whose length disagrees with the request", async () => {
    const live = bindings({
      histograms: { query: vi.fn(async () => success([{ total: 0n, buckets: [] }])) },
    });
    const source = new ChainDataSource(live.reads, live.writes, 0, 0, { delays: [] });

    await expect(source.histograms(17, [1, 0])).rejects.toThrow(/expected 2/);
    await expect(source.histograms(17, [])).rejects.toThrow(RangeError);
  });
});
