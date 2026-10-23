import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateConnectionsFile,
  validateConnectionsGroups,
} from "./content-validation";

// Vitest runs from app/ (the config directory); jsdom gives no file: URLs.
const corePath = join(process.cwd(), "..", "shared", "connections", "core.json");

function groups(): unknown[] {
  return [
    { label: "Breads", words: ["roll", "loaf", "bun", "baguette"], tier: 0 },
    { label: "Things with keys", words: ["piano", "keyboard", "lock", "map"], tier: 1 },
    { label: "Ways to move on foot", words: ["walk", "skip", "hop", "jog"], tier: 2 },
    { label: "Ice ___", words: ["cream", "cube", "age", "berg"], tier: 3 },
  ];
}

describe("Connections content rules", () => {
  it("accepts four labelled, tiered groups of four distinct words", () => {
    expect(validateConnectionsGroups(groups(), "g")).toHaveLength(4);
  });

  it("rejects a word that appears in two groups, ignoring case", () => {
    const bad = groups() as { words: string[] }[];
    bad[2]!.words[0] = "Roll";
    expect(() => validateConnectionsGroups(bad, "g")).toThrow(/repeats the word/);
  });

  it("rejects anything but exactly four groups of four", () => {
    expect(() => validateConnectionsGroups(groups().slice(0, 3), "g")).toThrow(/four groups/);
    const five = groups() as { words: string[] }[];
    five[0]!.words.push("naan");
    expect(() => validateConnectionsGroups(five, "g")).toThrow(/four words/);
  });

  it("requires each tier 0-3 exactly once", () => {
    const dup = groups() as { tier: number }[];
    dup[1]!.tier = 0;
    expect(() => validateConnectionsGroups(dup, "g")).toThrow(/tier 0 twice/);
    const high = groups() as { tier: number }[];
    high[3]!.tier = 4;
    expect(() => validateConnectionsGroups(high, "g")).toThrow(/must be 0, 1, 2, or 3/);
  });

  it("caps labels at 40 bytes and words at 24 bytes", () => {
    const label = groups() as { label: string }[];
    label[0]!.label = "A label that runs past the forty byte limit";
    expect(() => validateConnectionsGroups(label, "g")).toThrow(/at most 40/);
    const word = groups() as { words: string[] }[];
    word[0]!.words[0] = "abcdefghijklmnopqrstuvwxy";
    expect(() => validateConnectionsGroups(word, "g")).toThrow(/at most 24/);
  });

  it("requires day_index 0..n-1 in order and no group reused across days", () => {
    const file = (puzzles: unknown[]) => ({
      name: "t",
      emoji: "x",
      startDay: 0,
      puzzles,
    });
    expect(() =>
      validateConnectionsFile(file([{ day_index: 1, groups: groups() }]), "f"),
    ).toThrow(/day_index must be 0/);
    const second = groups() as { words: string[] }[];
    second[0]!.words = ["cream", "cube", "age", "berg"];
    second[3]!.words = ["bun", "roll", "baguette", "loaf"];
    expect(() =>
      validateConnectionsFile(
        file([
          { day_index: 0, groups: groups() },
          { day_index: 1, groups: second },
        ]),
        "f",
      ),
    ).toThrow(/reuses the group/);
  });
});

describe("shared/connections/core.json", () => {
  it("holds at least a year of puzzles, every day present once, all rules met", () => {
    const content = validateConnectionsFile(
      JSON.parse(readFileSync(corePath, "utf8")) as unknown,
      corePath,
    );
    expect(content.puzzles.length).toBeGreaterThanOrEqual(365);
    expect(content.puzzles.map((puzzle) => puzzle.day_index))
      .toEqual(content.puzzles.map((_, index) => index));
    for (const puzzle of content.puzzles) {
      expect(new Set(puzzle.groups.flatMap((group) => group.words.map((w) => w.toLowerCase()))).size).toBe(16);
      expect([...puzzle.groups].map((group) => group.tier).sort()).toEqual([0, 1, 2, 3]);
    }
  });
});
