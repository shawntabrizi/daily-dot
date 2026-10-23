import { afterEach, describe, expect, it, vi } from "vitest";
import { headerTitle } from "../../shared/ui/header";

import type { DataSource, MiniPuzzle } from "../../shared/data-source";
import { loadMiniProgress, saveMiniProgress } from "./progress";
import { renderMini } from "./view";

const PUZZLE: MiniPuzzle = {
  grid: "#GET#" + "HEART" + "ANGER" + "DELAY" + "#SET#",
  across: ["Obtain", "Valentine symbol", "Fury", "Hold up", "Tennis unit"],
  down: ["Possessed", "DNA units", "Bird on the US seal", "Halloween request", "Give it a go"],
};

function sourceFor(
  day: number,
  played = 0n,
  record: DataSource["record"] = async () => undefined,
): DataSource {
  return {
    currentDay: async () => day,
    wordAnswer: async () => "planet",
    miniPuzzle: async () => ({ ...PUZZLE, across: [...PUZZLE.across], down: [...PUZZLE.down] }),
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
    histogram: async () => ({ total: 3, buckets: [{ bucket: 1, count: 3 }] }),
  };
}

function key(name: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: name }));
}

function cell(root: HTMLElement, index: number): HTMLButtonElement {
  const node = root.querySelector<HTMLButtonElement>(`[data-mini-cell="${index}"]`);
  if (!node) throw new Error(`no cell ${index}`);
  return node;
}

async function ready(root: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(root.querySelector(".mini-grid")).not.toBeNull();
  });
}

function solve(root: HTMLElement, wrongAt = -1): void {
  for (let index = 0; index < PUZZLE.grid.length; index += 1) {
    const letter = PUZZLE.grid[index]!;
    if (letter === "#") continue;
    cell(root, index).click();
    key(index === wrongAt ? (letter === "Z" ? "q" : "z") : letter.toLowerCase());
  }
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Mini view", () => {
  it("numbers the grid, shows the active clue, types along the entry and flips direction on a second tap", async () => {
    const view = renderMini(sourceFor(10), 10);
    document.body.append(view.element);
    await ready(view.element);

    expect(view.element.querySelectorAll("[data-mini-cell]")).toHaveLength(21);
    expect(view.element.querySelectorAll(".mini-cell--black")).toHaveLength(4);
    expect(cell(view.element, 1).querySelector(".mini-cell-number")?.textContent).toBe("1");
    expect(cell(view.element, 5).querySelector(".mini-cell-number")?.textContent).toBe("4");
    expect(view.element.querySelector("[data-mini-cluebar-number]")?.textContent).toBe("1A");
    expect(view.element.querySelector("[data-mini-cluebar-clue]")?.textContent).toBe("Obtain");

    key("g");
    key("e");
    expect(cell(view.element, 1).textContent).toContain("G");
    expect(cell(view.element, 2).textContent).toContain("E");
    expect(cell(view.element, 3).classList.contains("mini-cell--selected")).toBe(true);

    cell(view.element, 3).click();
    expect(view.element.querySelector("[data-mini-cluebar-number]")?.textContent).toBe("3D");
    expect(view.element.querySelector("[data-mini-cluebar-clue]")?.textContent).toBe("Bird on the US seal");

    key("Backspace");
    expect(cell(view.element, 3).textContent).not.toContain("E");
    view.dispose();
  });

  it("records exactly one gameId 4 completion with elapsed seconds, and nothing while a square is wrong", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderMini(sourceFor(10, 0n, record), 10);
    document.body.append(view.element);
    await ready(view.element);

    solve(view.element, 7);
    expect(view.element.textContent).toContain("something is off");
    expect(record).not.toHaveBeenCalled();

    cell(view.element, 7).click();
    key("a");
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(4, 10, expect.any(Number), true);
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("25%");
    });
    expect(view.element.querySelector("[data-distribution-total]")?.textContent).toBe("4 finished today");
    await vi.waitFor(() => {
      expect(view.element.querySelector(".game-heading")?.hasAttribute("hidden")).toBe(true);
    });
    expect(view.element.querySelector(".keyboard")).toBeNull();

    key("z");
    cell(view.element, 1).click();
    expect(record).toHaveBeenCalledOnce();
    view.dispose();
  });

  it("restores letters and elapsed time after a reload", async () => {
    const source = sourceFor(10);
    const first = renderMini(source, 10);
    document.body.append(first.element);
    await ready(first.element);
    key("g");
    key("e");
    first.dispose();
    first.element.remove();

    const stored = loadMiniProgress(10, PUZZLE.grid);
    expect(stored.letters.slice(1, 3)).toBe("GE");
    stored.elapsedSeconds = 37;
    saveMiniProgress(stored);

    const reloaded = renderMini(source, 10);
    document.body.append(reloaded.element);
    await ready(reloaded.element);
    expect(cell(reloaded.element, 1).textContent).toContain("G");
    expect(reloaded.element.querySelector("[data-mini-timer]")?.textContent).toBe("00:37");
    reloaded.dispose();
  });

  it("opens a recorded archive day read-only with the solution and no write", async () => {
    const record = vi.fn<DataSource["record"]>(async () => {
      throw new Error("record must not be called");
    });
    const view = renderMini(sourceFor(208, 1n << 4n, record), 100);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("You already played this");
    });
    expect(headerTitle()).toBe("Mini · Day 100");
    expect(cell(view.element, 5).textContent).toContain("H");
    expect(view.element.querySelectorAll("[data-mini-cell]:disabled")).toHaveLength(21);
    expect(view.element.querySelector(".keyboard")).toBeNull();
    key("z");
    expect(record).not.toHaveBeenCalled();
    view.dispose();
  });

  it("keeps a solved grid after a write failure and records once on retry", async () => {
    const record = vi
      .fn<DataSource["record"]>()
      .mockRejectedValueOnce(new Error("rpc down"))
      .mockResolvedValue(undefined);
    const view = renderMini(sourceFor(10, 0n, record), 10);
    document.body.append(view.element);
    await ready(view.element);

    solve(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Recording failed.");
    });
    expect(loadMiniProgress(10, PUZZLE.grid).complete).toBe(true);
    view.element.querySelector<HTMLButtonElement>("[data-submission-retry]")?.click();
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(record).toHaveBeenCalledTimes(2);
    view.dispose();
  });

  it("explains a data source without minis instead of hanging", async () => {
    const source = sourceFor(10);
    delete source.miniPuzzle;
    const view = renderMini(source, 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Mini unavailable");
    });
    view.dispose();
  });

  it("carries data-game, names the game on <html>, and ends with the rule line", async () => {
    const view = renderMini(sourceFor(208), 208);
    document.body.append(view.element);
    expect(view.element.dataset.game).toBe("mini");
    // The header reads the open game from <html> (decision 9); dispose clears it.
    expect(document.documentElement.dataset.game).toBe("mini");
    await vi.waitFor(() => {
      expect(view.element.querySelector(".mini-grid")).not.toBeNull();
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
