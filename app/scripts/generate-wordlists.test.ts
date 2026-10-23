import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  alignToAnchor,
  ANCHOR_DAY,
  ANSWER_LIST_NAME,
  ANSWER_ZIPF_MIN,
  buildWordlist,
  generateAnswers,
  seededShuffle,
  SHUFFLE_SEED,
  withExclusions,
} from "./generate-wordlists";

const sharedPath = join(process.cwd(), "..", "shared");

function source(relative: string): string {
  return readFileSync(join(sharedPath, relative), "utf8");
}

const SCOWL = "---\nLondon\nplanet\ngarden\nsilver\nescort\nbridge\n";
const CANDIDATES = [
  "# header",
  "planet\t5.10",
  "london\t5.00",
  "garden\t4.50",
  "escort\t4.20",
  "silver\t4.00",
  "bridge\t3.99",
  "colour\t4.80",
  "plane\t5.00",
].join("\n");

describe("Daily Word answer generation", () => {
  it("keeps common lowercase SCOWL-60 words and drops the rest, with the reason counted", () => {
    const generated = generateAnswers(CANDIDATES, SCOWL, "escort\n", 1);

    // london: capitalised in SCOWL (proper noun). colour: British, absent
    // from the US list. bridge: Zipf 3.99 is below the threshold. escort:
    // LDNOOBW. plane: five letters, not a candidate at all.
    expect([...generated.words].sort()).toEqual(["garden", "planet", "silver"]);
    expect(generated.counts).toEqual({
      candidates: 7,
      belowThreshold: 1,
      notInScowl: 2,
      obscenity: 1,
    });
    expect(generated.zipf.get("silver")).toBe(ANSWER_ZIPF_MIN);
  });

  it("orders days by the seed, not by frequency, and the same seed gives the same order", () => {
    const ordered = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], SHUFFLE_SEED);
    expect(ordered).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...ordered].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], SHUFFLE_SEED)).toEqual(ordered);
    expect(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], SHUFFLE_SEED + 1)).not.toEqual(ordered);
  });

  it("reproduces the committed list from the committed sources and seed", () => {
    // Why: the list is on chain; a regenerated core.json that silently
    // differed would desynchronise the review file and the next list.
    const generated = generateAnswers(
      source("sources/wordfreq-en-six.txt"),
      source("sources/scowl-60-us.txt"),
      withExclusions(source("sources/obscenity-en.txt"), source("wordlists/answer-exclusions.txt")),
    );
    const committed = JSON.parse(source("wordlists/core.json")) as {
      name: string;
      startDay: number;
      words: string[];
    };
    expect(committed.name).toBe(ANSWER_LIST_NAME);
    expect(alignToAnchor(generated.words, committed.startDay)).toEqual(committed.words);
    expect(generated.words).toHaveLength(1022);
  });

  it("starts the list at day 0 without changing the word of any day from the anchor on", () => {
    // Why: players finished the anchor day's word under v2; past days need
    // words, but no day that was already live may get a different answer.
    const words = ["a", "b", "c", "d", "e"];
    const fromZero = alignToAnchor(words, 0);
    const wordFor = (list: string[], startDay: number, day: number) =>
      list[(day - startDay) % list.length];
    for (let day = ANCHOR_DAY; day < ANCHOR_DAY + 12; day += 1) {
      expect(wordFor(fromZero, 0, day)).toBe(wordFor(words, ANCHOR_DAY, day));
    }
    expect([...fromZero].sort()).toEqual(words);
    expect(alignToAnchor(words, ANCHOR_DAY)).toEqual(words);
  });

  it("builds a validated list with the given start day", () => {
    const wordlist = buildWordlist(["planet", "garden"], 294);
    expect(wordlist).toEqual({
      name: ANSWER_LIST_NAME,
      emoji: "🟩",
      startDay: 294,
      words: ["planet", "garden"],
    });
    expect(() => buildWordlist(["planet", "planet"], 294)).toThrow("must not repeat");
  });
});
