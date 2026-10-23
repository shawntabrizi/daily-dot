import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { isAllowedGuess, loadGuessList } from "./dictionary";
import { WORD_LENGTH } from "./engine";

const sharedPath = join(process.cwd(), "..", "shared");

function sourceLines(filename: string): string[] {
  return readFileSync(join(sharedPath, "sources", filename), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());
}

function answers(): { startDay: number; words: string[] } {
  return JSON.parse(
    readFileSync(join(sharedPath, "wordlists", "core.json"), "utf8"),
  ) as { startDay: number; words: string[] };
}

// Why: the answer list is on chain for the life of the list. A proper noun,
// a British spelling or a slur as the day's word is a product incident that
// no later edit can take back.
describe("Daily Word answers v2", () => {
  it("holds 1,022 distinct six-letter words with a start day", () => {
    const content = answers();
    expect(content.words).toHaveLength(1022);
    expect(new Set(content.words).size).toBe(content.words.length);
    expect(Number.isInteger(content.startDay) && content.startDay >= 0).toBe(true);
    for (const word of content.words) {
      expect(word).toMatch(/^[a-z]{6}$/);
    }
  });

  it("has no proper nouns: every answer is a lowercase SCOWL-60 entry", () => {
    const scowl = new Set(sourceLines("scowl-60-us.txt"));
    const outside = answers().words.filter((word) => !scowl.has(word));
    expect(outside).toEqual([]);
    // Capitalised in SCOWL, so never an answer: a place, a name, a brand.
    expect(scowl.has("london")).toBe(false);
    expect(scowl.has("robert")).toBe(false);
    expect(scowl.has("iphone")).toBe(false);
  });

  it("has no LDNOOBW word", () => {
    const obscenities = new Set(sourceLines("obscenity-en.txt").map((w) => w.toLowerCase()));
    expect(answers().words.filter((word) => obscenities.has(word))).toEqual([]);
  });

  it("has none of the hand-curated exclusions (names, slurs, slang)", () => {
    // Why: LDNOOBW missed "fucked" and SCOWL lists "batman" in lowercase; the
    // first seeded list shipped both. The exclusions file is the fix.
    const excluded = readFileSync(join(sharedPath, "wordlists", "answer-exclusions.txt"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean);
    expect(excluded.length).toBeGreaterThan(30);
    expect(answers().words.filter((word) => excluded.includes(word))).toEqual([]);
  });
});

// Why: players type real words ("not in the word list" on a phone,
// 2026-10-22). The guess check must accept every list word, and the answer
// itself even when the list lacks it or never loaded.
describe("isAllowedGuess", () => {
  it("accepts the day's answer even when it is not in the guess list", () => {
    expect(isAllowedGuess("zzzzzz", "zzzzzz")).toBe(true);
    expect(isAllowedGuess("ZZZZZZ", "zzzzzz")).toBe(true);
    expect(isAllowedGuess("zzzzzy", "zzzzzz")).toBe(false);
  });

  it("accepts every guess-list word once the chunk is loaded, and nothing else", async () => {
    const list = await loadGuessList();
    expect(list.size).toBeGreaterThan(15_000);
    for (const word of list) {
      expect(word).toHaveLength(WORD_LENGTH);
    }
    expect(list.has("quartz")).toBe(true);
    expect(isAllowedGuess("QUARTZ", "planet")).toBe(true);
    expect(isAllowedGuess("qzzzzz", "planet")).toBe(false);
    expect(isAllowedGuess("plane", "planet")).toBe(false);
  });

  it("accepts every answer as a guess", async () => {
    await loadGuessList();
    const refused = answers().words.filter((word) => !isAllowedGuess(word, "zzzzzz"));
    expect(refused).toEqual([]);
  });
});
