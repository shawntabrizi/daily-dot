import { describe, expect, it } from "vitest";

import type { ConnectionsPuzzle } from "../../shared/data-source";
import {
  assertConnectionsPuzzle,
  CONNECTIONS_GAME_ID,
  evaluateGuess,
  initialOrder,
  puzzleWords,
  shuffleWords,
} from "./engine";

export const PUZZLE: ConnectionsPuzzle = {
  groups: [
    { label: "Breads", words: ["roll", "loaf", "bun", "baguette"], tier: 0 },
    { label: "Things with keys", words: ["piano", "keyboard", "lock", "map"], tier: 1 },
    { label: "Ways to move on foot", words: ["walk", "skip", "hop", "jog"], tier: 2 },
    { label: "Ice ___", words: ["cream", "cube", "age", "berg"], tier: 3 },
  ],
};

describe("Connections engine", () => {
  it("is gameId 5, the roster bit after Mini", () => {
    expect(CONNECTIONS_GAME_ID).toBe(5);
  });

  it("scores a full group as correct with the group's index", () => {
    const result = evaluateGuess(PUZZLE, ["map", "lock", "piano", "keyboard"], []);
    expect(result.outcome).toEqual({ kind: "correct", group: 1 });
    expect(result.tiers).toEqual([1, 1, 1, 1]);
  });

  it("says one away when exactly three of four share a group", () => {
    const result = evaluateGuess(PUZZLE, ["roll", "loaf", "bun", "hop"], []);
    expect(result.outcome).toEqual({ kind: "one-away" });
    expect(result.tiers).toEqual([0, 0, 0, 2]);
  });

  it("scores two-and-two as wrong, not one away", () => {
    expect(evaluateGuess(PUZZLE, ["roll", "loaf", "hop", "jog"], []).outcome)
      .toEqual({ kind: "wrong" });
  });

  it("treats a resubmitted set as a repeat in any order and case", () => {
    const previous = [["roll", "loaf", "bun", "hop"]];
    expect(evaluateGuess(PUZZLE, ["HOP", "bun", "loaf", "roll"], previous).outcome)
      .toEqual({ kind: "repeat" });
  });

  it("rejects a guess that is not four distinct puzzle words", () => {
    expect(() => evaluateGuess(PUZZLE, ["roll", "loaf", "bun"], [])).toThrow();
    expect(() => evaluateGuess(PUZZLE, ["roll", "roll", "bun", "loaf"], [])).toThrow();
    expect(() => evaluateGuess(PUZZLE, ["roll", "loaf", "bun", "zebra"], [])).toThrow();
  });

  it("derives the first board order from the day alone, as a permutation", () => {
    const first = initialOrder(PUZZLE, 208);
    expect(initialOrder(PUZZLE, 208)).toEqual(first);
    expect(initialOrder(PUZZLE, 209)).not.toEqual(first);
    expect([...first].sort()).toEqual([...puzzleWords(PUZZLE)].sort());
  });

  it("shuffles into a permutation of the same words", () => {
    const words = puzzleWords(PUZZLE);
    const shuffled = shuffleWords(words, () => 0.5);
    expect([...shuffled].sort()).toEqual([...words].sort());
  });

  it("refuses a puzzle the registry would refuse", () => {
    expect(() => assertConnectionsPuzzle(PUZZLE)).not.toThrow();
    const repeated = structuredClone(PUZZLE);
    repeated.groups[2]!.words[0] = "Roll";
    expect(() => assertConnectionsPuzzle(repeated)).toThrow(/repeats/);
    const twoTierOne = structuredClone(PUZZLE);
    twoTierOne.groups[0]!.tier = 1;
    expect(() => assertConnectionsPuzzle(twoTierOne)).toThrow(/tier once/);
    const threeGroups = { groups: PUZZLE.groups.slice(0, 3) };
    expect(() => assertConnectionsPuzzle(threeGroups)).toThrow(/four groups/);
  });
});
