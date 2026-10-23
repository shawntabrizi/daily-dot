import { afterEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { HostSignerUnavailableError } from "../../shared/host-signer";
import { PUZZLE } from "./engine.test";
import {
  createConnectionsProgress,
  hasStartedConnections,
  loadConnectionsProgress,
  saveConnectionsProgress,
  shuffleConnections,
  submitConnectionsGuess,
  submitConnectionsOnce,
  toggleConnectionsWord,
  type ConnectionsProgress,
} from "./progress";

function select(
  progress: ConnectionsProgress,
  words: readonly string[],
): ConnectionsProgress {
  return words.reduce<ConnectionsProgress>(
    (current, word) => toggleConnectionsWord(current, word),
    { ...progress, selected: [] },
  );
}

function sourceWith(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => 208,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
  };
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Connections progress", () => {
  it("selects up to four words and toggles them off again", () => {
    let progress = createConnectionsProgress(208, PUZZLE);
    progress = select(progress, ["roll", "loaf", "bun", "hop", "jog"]);
    expect(progress.selected).toEqual(["roll", "loaf", "bun", "hop"]);
    progress = toggleConnectionsWord(progress, "hop");
    expect(progress.selected).toEqual(["roll", "loaf", "bun"]);
    expect(() => toggleConnectionsWord(progress, "zebra")).toThrow();
  });

  it("collapses a correct set out of the board and keeps the mistakes", () => {
    let progress = select(createConnectionsProgress(208, PUZZLE), ["roll", "loaf", "bun", "hop"]);
    let result = submitConnectionsGuess(progress, PUZZLE);
    expect(result.outcome).toEqual({ kind: "one-away" });
    expect(result.progress.mistakes).toBe(1);
    expect(result.progress.order).toHaveLength(16);

    progress = select(result.progress, ["roll", "loaf", "bun", "baguette"]);
    result = submitConnectionsGuess(progress, PUZZLE);
    expect(result.outcome).toEqual({ kind: "correct", group: 0 });
    expect(result.progress.found).toEqual([0]);
    expect(result.progress.order).toHaveLength(12);
    expect(result.progress.order).not.toContain("roll");
    expect(result.progress.selected).toEqual([]);
    expect(result.progress.mistakes).toBe(1);
    expect(result.progress.complete).toBe(false);
  });

  it("has no loss state: mistakes count up past four and play continues", () => {
    let progress = createConnectionsProgress(208, PUZZLE);
    const wrongSets = [
      ["roll", "piano", "walk", "cream"],
      ["loaf", "keyboard", "skip", "cube"],
      ["bun", "lock", "hop", "age"],
      ["baguette", "map", "jog", "berg"],
      ["roll", "keyboard", "hop", "berg"],
      ["loaf", "lock", "jog", "cream"],
    ];
    for (const set of wrongSets) {
      const result = submitConnectionsGuess(select(progress, set), PUZZLE);
      expect(result.outcome.kind).toBe("wrong");
      progress = result.progress;
    }
    expect(progress.mistakes).toBe(6);
    expect(progress.complete).toBe(false);
    expect(progress.order).toHaveLength(16);
    const result = submitConnectionsGuess(
      select(progress, ["cream", "cube", "age", "berg"]),
      PUZZLE,
    );
    expect(result.outcome).toEqual({ kind: "correct", group: 3 });
  });

  it("does not charge a repeated set a second time", () => {
    const first = submitConnectionsGuess(
      select(createConnectionsProgress(208, PUZZLE), ["roll", "loaf", "bun", "hop"]),
      PUZZLE,
    );
    const again = submitConnectionsGuess(
      select(first.progress, ["hop", "bun", "loaf", "roll"]),
      PUZZLE,
    );
    expect(again.outcome).toEqual({ kind: "repeat" });
    expect(again.progress.mistakes).toBe(1);
    expect(again.progress.guesses).toHaveLength(1);
  });

  it("completes when the fourth group is found and moves to pending", () => {
    let progress = createConnectionsProgress(208, PUZZLE);
    for (const group of PUZZLE.groups) {
      progress = submitConnectionsGuess(select(progress, group.words), PUZZLE).progress;
    }
    expect(progress.complete).toBe(true);
    expect(progress.found).toEqual([0, 1, 2, 3]);
    expect(progress.order).toEqual([]);
    expect(progress.submission).toBe("pending");
    expect(() => submitConnectionsGuess(progress, PUZZLE)).toThrow();
  });

  it("survives a reload: order, selection, found groups and mistakes", () => {
    let progress = submitConnectionsGuess(
      select(createConnectionsProgress(208, PUZZLE), ["roll", "loaf", "bun", "hop"]),
      PUZZLE,
    ).progress;
    progress = submitConnectionsGuess(
      select(progress, ["cream", "cube", "age", "berg"]),
      PUZZLE,
    ).progress;
    progress = shuffleConnections(select(progress, ["walk", "skip"]), () => 0.3);
    saveConnectionsProgress(progress);

    const restored = loadConnectionsProgress(208, PUZZLE);
    expect(restored).toEqual(progress);
    expect(hasStartedConnections(208)).toBe(true);
    expect(hasStartedConnections(209)).toBe(false);
  });

  it("discards stored state that does not describe this puzzle", () => {
    const progress = createConnectionsProgress(208, PUZZLE);
    saveConnectionsProgress({ ...progress, order: [...progress.order.slice(1), "zebra"] });
    expect(loadConnectionsProgress(208, PUZZLE).order).toEqual(progress.order);
    saveConnectionsProgress({ ...progress, found: [0] });
    expect(loadConnectionsProgress(208, PUZZLE).found).toEqual([]);
  });

  it("records (5, day, mistakes, true) exactly once", async () => {
    let progress = createConnectionsProgress(208, PUZZLE);
    progress = submitConnectionsGuess(
      select(progress, ["roll", "loaf", "bun", "hop"]),
      PUZZLE,
    ).progress;
    for (const group of PUZZLE.groups) {
      progress = submitConnectionsGuess(select(progress, group.words), PUZZLE).progress;
    }
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source = sourceWith(record);
    await submitConnectionsOnce(source, progress);
    await submitConnectionsOnce(source, progress);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(5, 208, 1, true);
    expect(progress.submission).toBe("submitted");
  });

  it("defers when there is no host signer and fails otherwise, keeping the result", async () => {
    let progress = createConnectionsProgress(208, PUZZLE);
    for (const group of PUZZLE.groups) {
      progress = submitConnectionsGuess(select(progress, group.words), PUZZLE).progress;
    }
    await expect(
      submitConnectionsOnce(
        sourceWith(async () => {
          throw new HostSignerUnavailableError("no host");
        }),
        progress,
      ),
    ).rejects.toThrow();
    expect(progress.submission).toBe("deferred");
    expect(loadConnectionsProgress(208, PUZZLE).complete).toBe(true);

    await expect(
      submitConnectionsOnce(
        sourceWith(async () => {
          throw new Error("pool refused");
        }),
        progress,
      ),
    ).rejects.toThrow();
    expect(progress.submission).toBe("failed");
  });
});
