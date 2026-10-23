import { afterEach, describe, expect, it, vi } from "vitest";
import { headerTitle } from "../../shared/ui/header";

import type { ChessPuzzle, DataSource } from "../../shared/data-source";
import { renderChess } from "./view";

const LIVE_PUZZLE: ChessPuzzle = {
  fen: "5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22",
  moves: "d1e2 d4b2 e2d3 b2c1",
};

const PROMOTION_PUZZLE: ChessPuzzle = {
  fen: "1r4k1/4Ppbp/p5p1/2q5/p2n4/P2Q2B1/r2N1PPP/3KR2R b - - 0 27",
  moves: "g7h6 e7e8q b8e8 e1e8",
};

function sourceFor(
  puzzle: ChessPuzzle = LIVE_PUZZLE,
  played = 0n,
  record: DataSource["record"] = async () => undefined,
): DataSource {
  return {
    currentDay: async () => 208,
    wordAnswer: async () => "planet",
    chessPuzzle: async () => puzzle,
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
    histogram: async () => ({ total: 4, buckets: [{ bucket: 2, count: 2 }, { bucket: 5, count: 2 }] }),
  };
}

function clickMove(view: HTMLElement, from: string, to: string): void {
  view.querySelector<HTMLButtonElement>(`[data-chess-square="${from}"]`)?.click();
  view.querySelector<HTMLButtonElement>(`[data-chess-square="${to}"]`)?.click();
}

async function waitForPlayer(view: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(view.querySelector("[data-chess-phase='player']")).not.toBeNull();
  });
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Chess view", () => {
  it("orients the player to move at the bottom", async () => {
    const view = renderChess(sourceFor(), 208);
    document.body.append(view.element);
    await waitForPlayer(view.element);

    const board = view.element.querySelector("[data-chess-board]");
    const squares = board?.querySelectorAll("[data-chess-square]");
    expect(board?.getAttribute("aria-label")).toContain("Black to move at the bottom");
    expect(squares?.[0]?.getAttribute("data-chess-square")).toBe("h1");
    expect(squares?.[63]?.getAttribute("data-chess-square")).toBe("a8");
    view.dispose();
  });

  it("rejects a wrong move, increments attempts, and keeps the puzzle active", async () => {
    const view = renderChess(sourceFor(), 208);
    document.body.append(view.element);
    await waitForPlayer(view.element);

    clickMove(view.element, "d4", "c5");

    expect(view.element.textContent).toContain("Not the move. Try again.");
    expect(view.element.querySelector("[data-chess-attempts]")?.textContent).toBe(
      "1 ATTEMPT",
    );
    expect(view.element.querySelector("[data-chess-phase='player']")).not.toBeNull();
    expect(view.element.textContent).not.toContain("SOLVED");
    view.dispose();
  });

  it("solves the line and records exactly once", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderChess(sourceFor(LIVE_PUZZLE, 0n, record), 208);
    document.body.append(view.element);
    await waitForPlayer(view.element);

    clickMove(view.element, "d4", "b2");
    await waitForPlayer(view.element);
    clickMove(view.element, "b2", "c1");

    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    view.element
      .querySelector<HTMLButtonElement>('[data-chess-square="c1"]')
      ?.click();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(2, 208, 2, true);
    // Two attempts, tied with one other finisher for best: top 25% of four.
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("25%");
    });
    expect(view.element.querySelector("[data-distribution-total]")?.textContent).toBe("4 finished today");
    await vi.waitFor(() => {
      expect(view.element.querySelector(".game-heading")?.hasAttribute("hidden")).toBe(true);
    });
    expect(view.element.querySelector("[data-result-subline]")?.textContent).toBe(
      "2 attempts · the moves were Qb2+ Qxc1",
    );
    view.dispose();
  });

  it("never ends the puzzle on wrong moves: twelve misses still record one write with the attempt count", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderChess(sourceFor(LIVE_PUZZLE, 0n, record), 208);
    document.body.append(view.element);
    await waitForPlayer(view.element);

    for (let miss = 0; miss < 12; miss += 1) {
      clickMove(view.element, "d4", "c5");
      await waitForPlayer(view.element);
    }
    expect(view.element.querySelector("[data-chess-attempts]")?.textContent).toBe("12 ATTEMPTS");
    expect(record).not.toHaveBeenCalled();

    clickMove(view.element, "d4", "b2");
    await waitForPlayer(view.element);
    clickMove(view.element, "b2", "c1");
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(2, 208, 14, true);
    view.dispose();
  });

  it("restores a mid-puzzle board and attempt count after reload", async () => {
    const source = sourceFor();
    const first = renderChess(source, 208);
    document.body.append(first.element);
    await waitForPlayer(first.element);
    clickMove(first.element, "d4", "c5");
    first.dispose();
    first.element.remove();

    const reloaded = renderChess(source, 208);
    document.body.append(reloaded.element);
    await waitForPlayer(reloaded.element);

    expect(
      reloaded.element.querySelector("[data-chess-attempts]")?.textContent,
    ).toBe("1 ATTEMPT");
    expect(
      reloaded.element.querySelector('[data-chess-square="d4"] [data-piece]')?.getAttribute("data-piece"),
    ).toBe("bq");
    expect(
      reloaded.element.querySelector('[data-chess-square="e2"] [data-piece]')?.getAttribute("data-piece"),
    ).toBe("wk");
    reloaded.dispose();
  });

  it("shows the promotion picker before submitting a promotion move", async () => {
    const view = renderChess(sourceFor(PROMOTION_PUZZLE), 59);
    document.body.append(view.element);
    await waitForPlayer(view.element);

    clickMove(view.element, "e7", "e8");

    expect(view.element.querySelector("[data-chess-promotion]")).not.toBeNull();
    expect(view.element.querySelectorAll("[data-chess-promote]")).toHaveLength(4);
    expect(view.element.textContent).toContain("Choose a promotion piece.");
    view.dispose();
  });

  it("opens a recorded day read-only without attempting another write", async () => {
    const record = vi.fn<DataSource["record"]>(async () => {
      throw new Error("record must not be called");
    });
    const view = renderChess(sourceFor(LIVE_PUZZLE, 1n << 2n, record), 100);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("You already played this");
    });

    expect(headerTitle()).toBe("Chess · Day 100");
    expect(view.element.querySelectorAll(".chess-square")).toHaveLength(64);
    expect(view.element.querySelectorAll(".chess-square:disabled")).toHaveLength(64);
    expect(view.element.querySelector("[data-chess-phase='readonly']")).not.toBeNull();
    expect(record).not.toHaveBeenCalled();
    view.dispose();
  });

  it("carries data-game, names the game on <html>, and ends with the rule line", async () => {
    const view = renderChess(sourceFor(), 208);
    document.body.append(view.element);
    expect(view.element.dataset.game).toBe("chess");
    // The header reads the open game from <html> (decision 9); dispose clears it.
    expect(document.documentElement.dataset.game).toBe("chess");
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-chess-square]")).not.toBeNull();
    });
    const rule = view.element.querySelector<HTMLElement>(".game-rule");
    expect(rule?.hidden).toBe(false);
    expect(rule?.querySelector("svg")).not.toBeNull();
    expect(view.element.lastElementChild).toBe(rule);
    view.dispose();
    expect(document.documentElement.dataset.game).toBeUndefined();
    view.element.remove();
  });
});
