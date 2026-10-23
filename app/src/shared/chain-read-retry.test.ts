import { describe, expect, it, vi } from "vitest";

import {
  isTransientChainReadError,
  retryChainRead,
} from "./chain-read-retry";

function disjointError(cause?: unknown): Error {
  const error = new Error(
    "ChainHead follower replaced",
    cause === undefined ? undefined : { cause },
  );
  error.name = "DisjointError";
  return error;
}

describe("chain read retry", () => {
  it("recognizes nested follower and dropped-endpoint failures", () => {
    expect(
      isTransientChainReadError(new Error("outer", { cause: disjointError() })),
    ).toBe(true);
    expect(isTransientChainReadError(new Error("WebSocket connection dropped"))).toBe(
      true,
    );
    expect(isTransientChainReadError(new Error("Contract reverted"))).toBe(false);
  });

  it("backs off only for a bounded number of transient failures", async () => {
    const failure = disjointError();
    const read = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(7);
    const waits: number[] = [];

    await expect(
      retryChainRead(read, {
        delays: [10, 20],
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
        },
      }),
    ).resolves.toBe(7);

    expect(read).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([10, 20]);
  });

  it("does not retry a contract failure", async () => {
    const read = vi.fn(async () => {
      throw new Error("Contract reverted");
    });

    await expect(
      retryChainRead(read, { delays: [0], sleep: async () => undefined }),
    ).rejects.toThrow("Contract reverted");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
