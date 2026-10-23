import { headerTitle } from "../../shared/ui/header";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { PUZZLE } from "./engine.test";
import {
  createConnectionsProgress,
  loadConnectionsProgress,
  saveConnectionsProgress,
  submitConnectionsGuess,
  toggleConnectionsWord,
} from "./progress";
import { renderConnections } from "./view";
import { pickSixGames } from "../../test/picks";

// The six original games picked: the share text counts all six (D21).
beforeEach(() => {
  pickSixGames();
});

function sourceFor(
  day: number,
  played = 0n,
  record: DataSource["record"] = async () => undefined,
): DataSource {
  return {
    currentDay: async () => day,
    wordAnswer: async () => "planet",
    connectionsPuzzle: async () => structuredClone(PUZZLE),
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
    // Three finishers today: two clean boards and one with two mistakes.
    histogram: async () => ({ total: 3, buckets: [{ bucket: 1, count: 2 }, { bucket: 2, count: 1 }] }),
  };
}

function tap(root: Element, word: string): void {
  const tile = root.querySelector<HTMLButtonElement>(
    `[data-connections-word="${word}"]`,
  );
  if (!tile) throw new Error(`no tile ${word}`);
  tile.click();
}

function submit(root: Element): void {
  root.querySelector<HTMLButtonElement>("[data-connections-submit]")?.click();
}

function guess(root: Element, words: readonly string[]): void {
  // A wrong set stays selected so one word can be swapped; start clean here.
  root.querySelector<HTMLButtonElement>("[data-connections-clear]")?.click();
  for (const word of words) tap(root, word);
  submit(root);
}

async function ready(root: Element): Promise<void> {
  await vi.waitFor(() => {
    expect(root.querySelectorAll("[data-connections-word]")).toHaveLength(16);
  });
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Connections view", () => {
  it("selects four tiles, submits, and collapses a found group into a bar", async () => {
    const view = renderConnections(sourceFor(208), 208);
    document.body.append(view.element);
    await ready(view.element);

    // Submit stays tinted and disabled until exactly four words are selected (the board).
    const submitButton = view.element.querySelector<HTMLButtonElement>("[data-connections-submit]")!;
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.classList.contains("connections-action--ready")).toBe(false);
    tap(view.element, "roll");
    tap(view.element, "loaf");
    tap(view.element, "bun");
    expect(view.element.querySelectorAll(".connections-tile--selected")).toHaveLength(3);
    // The status line reads the count and sits below the grid.
    const message = view.element.querySelector(".connections-message")!;
    expect(message.textContent).toBe("3 of 4 selected.");
    const grid = view.element.querySelector(".connections-grid")!;
    expect(grid.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tinted = view.element.querySelector<HTMLButtonElement>("[data-connections-submit]")!;
    expect(tinted.disabled).toBe(true);
    expect(tinted.classList.contains("connections-action--ready")).toBe(false);
    tap(view.element, "baguette");
    const readyButton = view.element.querySelector<HTMLButtonElement>("[data-connections-submit]")!;
    expect(readyButton.disabled).toBe(false);
    expect(readyButton.classList.contains("connections-action--ready")).toBe(true);
    expect(view.element.querySelector(".connections-message")?.textContent).toBe("4 of 4 selected.");
    submit(view.element);

    expect(view.element.querySelectorAll("[data-connections-bar]")).toHaveLength(1);
    expect(view.element.querySelector('[data-connections-bar="0"]')?.textContent).toContain("Breads");
    expect(view.element.querySelector('[data-connections-bar="0"] span')?.textContent).toBe("roll · loaf · bun · baguette");
    expect(view.element.querySelectorAll("[data-connections-word]")).toHaveLength(12);
    // The four dots by the h1 carry the count in their label; none is filled yet.
    expect(view.element.querySelector("[data-mistake-dots]")?.getAttribute("aria-label")).toBe("0 mistakes");
    expect(view.element.querySelector<HTMLElement>("[data-mistake-dots]")?.dataset.mistakeDots).toBe("0");
    expect(view.element.querySelectorAll("[data-mistake-dots] i")).toHaveLength(4);
    expect(view.element.querySelectorAll("[data-mistake-dots] i.is-filled")).toHaveLength(0);
    view.dispose();
  });

  it("hints one away, counts mistakes without a limit, and offers shuffle and clear", async () => {
    const view = renderConnections(sourceFor(208), 208);
    document.body.append(view.element);
    await ready(view.element);

    guess(view.element, ["roll", "loaf", "bun", "hop"]);
    expect(view.element.querySelector(".connections-message")?.textContent).toContain("One away");
    expect(view.element.querySelector("[data-mistake-dots]")?.getAttribute("aria-label")).toBe("1 mistake");
    expect(view.element.querySelector<HTMLElement>("[data-mistake-dots]")?.dataset.mistakeDots).toBe("1");
    expect(view.element.querySelectorAll("[data-mistake-dots] i.is-filled")).toHaveLength(1);

    for (const set of [
      ["roll", "piano", "walk", "cream"],
      ["loaf", "keyboard", "skip", "cube"],
      ["bun", "lock", "hop", "age"],
      ["baguette", "map", "jog", "berg"],
    ]) {
      guess(view.element, set);
    }
    // The dots cap at four; the label carries the count (colour is never the only signal).
    expect(view.element.querySelector("[data-mistake-dots]")?.getAttribute("aria-label")).toBe("5 mistakes");
    expect(view.element.querySelector<HTMLElement>("[data-mistake-dots]")?.dataset.mistakeDots).toBe("4");
    expect(view.element.querySelectorAll("[data-mistake-dots] i.is-filled")).toHaveLength(4);
    // Still playing: all sixteen tiles on the board and the controls live.
    expect(view.element.querySelectorAll("[data-connections-word]:not(:disabled)")).toHaveLength(16);
    expect(view.element.querySelector(".connections-result")).toBeNull();

    tap(view.element, "walk");
    tap(view.element, "skip");
    view.element.querySelector<HTMLButtonElement>("[data-connections-clear]")!.click();
    expect(view.element.querySelectorAll(".connections-tile--selected")).toHaveLength(0);
    expect(view.element.querySelector(".connections-message")?.textContent).toBe("Selection cleared.");

    const before = [...view.element.querySelectorAll<HTMLElement>("[data-connections-word]")]
      .map((tile) => tile.dataset.connectionsWord);
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    view.element.querySelector<HTMLButtonElement>("[data-connections-shuffle]")!.click();
    const after = [...view.element.querySelectorAll<HTMLElement>("[data-connections-word]")]
      .map((tile) => tile.dataset.connectionsWord);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after).not.toEqual(before);
    expect(loadConnectionsProgress(208, PUZZLE).order).toEqual(after);
    view.dispose();
  });

  it("restores the board after a reload", async () => {
    let progress = createConnectionsProgress(208, PUZZLE);
    progress = submitConnectionsGuess(
      ["cream", "cube", "age", "berg"].reduce(toggleConnectionsWord, progress),
      PUZZLE,
    ).progress;
    progress = toggleConnectionsWord(progress, "walk");
    progress.mistakes = 2;
    saveConnectionsProgress(progress);

    const view = renderConnections(sourceFor(208), 208);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelectorAll("[data-connections-word]")).toHaveLength(12);
    });
    expect(view.element.querySelectorAll("[data-connections-bar]")).toHaveLength(1);
    expect(view.element.querySelector(".connections-tile--selected")?.textContent).toBe("walk");
    expect(view.element.querySelector("[data-mistake-dots]")?.getAttribute("aria-label")).toBe("2 mistakes");
    expect(view.element.querySelector<HTMLElement>("[data-mistake-dots]")?.dataset.mistakeDots).toBe("2");
    expect(view.element.querySelectorAll("[data-mistake-dots] i.is-filled")).toHaveLength(2);
    view.dispose();
  });

  it("records once at the finish with the mistake count, then shares the tier rows", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderConnections(sourceFor(208, 0n, record), 208);
    document.body.append(view.element);
    await ready(view.element);

    guess(view.element, ["roll", "loaf", "bun", "hop"]);
    for (const group of PUZZLE.groups) {
      guess(view.element, group.words);
    }
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(5, 208, 1, true);
    // One mistake: bucket 1, tied with one other for best of three.
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("33%");
    });
    expect(view.element.querySelector("[data-distribution-total]")?.textContent).toBe("3 finished today");
    expect(view.element.querySelector("[data-result-subline]")?.textContent).toBe(
      "1 mistake · 4 groups",
    );
    expect(view.element.querySelector(".connections-heading")?.hasAttribute("hidden")).toBe(true);
    expect(view.element.querySelectorAll("[data-connections-bar]")).toHaveLength(4);
    expect(view.element.querySelector("[data-connections-word]")).toBeNull();
    expect(view.element.querySelector(".connections-result")?.textContent)
      .toContain("Finished with 1 mistake.");
    // The share text carries the tier rows under the Connections line, no words.
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    view.element.querySelector<HTMLButtonElement>("[data-result-share]")!.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
    });
    const shared = writeText.mock.calls[0]![0];
    expect(shared).toContain("Daily on Dot #208 · 1/6");
    expect(shared).toContain("Connections 1 mistake · Top 33%\n🟨🟨🟨🟦\n🟨🟨🟨🟨\n🟩🟩🟩🟩\n🟦🟦🟦🟦\n🟪🟪🟪🟪");
    for (const word of PUZZLE.groups.flatMap((group) => group.words)) {
      expect(shared.toLowerCase()).not.toContain(word);
    }
    expect(view.element.querySelector("[data-connections-submit]")).toBeNull();
    expect(record).toHaveBeenCalledOnce();
    view.dispose();
  });

  it("keeps the result local with a retry when recording fails", async () => {
    const record = vi.fn<DataSource["record"]>(async () => {
      throw new Error("pool refused");
    });
    const view = renderConnections(sourceFor(208, 0n, record), 208);
    document.body.append(view.element);
    await ready(view.element);
    for (const group of PUZZLE.groups) {
      guess(view.element, group.words);
    }
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Recording failed.");
    });
    expect(loadConnectionsProgress(208, PUZZLE).submission).toBe("failed");
    const retry = [...view.element.querySelectorAll("button")]
      .find((button) => button.textContent === "Try recording again");
    expect(retry).toBeDefined();
    record.mockImplementation(async () => undefined);
    retry!.click();
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(record).toHaveBeenCalledTimes(2);
    view.dispose();
  });

  it("reopens a day finished on this device with its result, though the chain says recorded", async () => {
    const first = renderConnections(sourceFor(208), 208);
    document.body.append(first.element);
    await ready(first.element);
    for (const group of PUZZLE.groups) {
      guess(first.element, group.words);
    }
    await vi.waitFor(() => {
      expect(first.element.textContent).toContain("Score recorded.");
    });
    first.dispose();

    // The local copy is the history: the reopened day shows the result and the found order.
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const reopened = renderConnections(sourceFor(208, 1n << 5n, record), 208);
    document.body.append(reopened.element);
    await vi.waitFor(() => {
      expect(reopened.element.querySelector("[data-result-headline]")).not.toBeNull();
    });
    expect(reopened.element.classList.contains("page--result")).toBe(true);
    expect(record).not.toHaveBeenCalled();
    reopened.dispose();
  });

  it("opens a recorded archive day solved and read-only", async () => {
    const record = vi.fn<DataSource["record"]>(async () => {
      throw new Error("record must not be called");
    });
    const view = renderConnections(sourceFor(208, 1n << 5n, record), 100);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("You already played this");
    });
    expect(headerTitle()).toBe("Connections · Day 100");
    // No local history on a recorded day, so no mistake dots.
    expect(view.element.querySelector("[data-mistake-dots]")).toBeNull();
    const bars = [...view.element.querySelectorAll<HTMLElement>("[data-connections-bar]")];
    expect(bars.map((bar) => bar.dataset.connectionsBar)).toEqual(["0", "1", "2", "3"]);
    expect(bars[3]?.textContent).toContain("Ice ___");
    expect(view.element.querySelector("[data-connections-word]")).toBeNull();
    expect(view.element.querySelector("[data-connections-submit]")).toBeNull();
    expect(record).not.toHaveBeenCalled();
    view.dispose();
  });

  it("reports a source without Connections content instead of hanging", async () => {
    const source = sourceFor(208);
    delete source.connectionsPuzzle;
    const view = renderConnections(source, 208);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Puzzle unavailable");
    });
    view.dispose();
  });

  it("carries data-game, names the game on <html>, and ends with the rule line", async () => {
    const view = renderConnections(sourceFor(208), 208);
    document.body.append(view.element);
    expect(view.element.dataset.game).toBe("connections");
    // The header reads the open game from <html> (decision 9); dispose clears it.
    expect(document.documentElement.dataset.game).toBe("connections");
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-connections-word]")).not.toBeNull();
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
