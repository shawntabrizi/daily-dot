import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MINI_REPEAT_WINDOW,
  validateChessFile,
  validateMiniFile,
  validateWordlistFile,
} from "./content-validation";

function fixture(relative: string): unknown {
  const path = join(process.cwd(), "..", "shared", relative);
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

describe("Word content validation", () => {
  it("accepts the fixture and rejects wrong lengths, uppercase and repeats", () => {
    const valid = fixture("wordlists/fixtures/sample.json");
    expect(validateWordlistFile(valid).words).toHaveLength(2);

    // Daily Word is one six-letter word a day (D16): a five-letter word
    // would render a grid the engine cannot score against the day's answer.
    const wrongLength = structuredClone(valid) as { words: string[] };
    wrongLength.words[0] = "grape";
    expect(() => validateWordlistFile(wrongLength)).toThrow(
      "must be 6 letters",
    );

    const uppercase = structuredClone(valid) as { words: string[] };
    uppercase.words[0] = "Planet";
    expect(() => validateWordlistFile(uppercase)).toThrow("lowercase ASCII");

    const repeated = structuredClone(valid) as { words: string[] };
    repeated.words[1] = repeated.words[0]!;
    expect(() => validateWordlistFile(repeated)).toThrow("must not repeat");
  });
});

describe("Chess content validation", () => {
  it("accepts the fixture and rejects malformed FEN and UCI", () => {
    const valid = fixture("chess/fixtures/sample.json");
    expect(validateChessFile(valid).puzzles).toHaveLength(2);

    const fiveFields = structuredClone(valid) as {
      puzzles: Array<{ fen: string; moves: string }>;
    };
    fiveFields.puzzles[0]!.fen =
      "8/8/8/8/8/8/8/8 w - - 0";
    expect(() => validateChessFile(fiveFields)).toThrow(
      "exactly six",
    );

    const shortRank = structuredClone(valid) as {
      puzzles: Array<{ fen: string; moves: string }>;
    };
    shortRank.puzzles[0]!.fen =
      "7/8/8/8/8/8/8/8 w - - 0 1";
    expect(() => validateChessFile(shortRank)).toThrow(
      "sums to 7, not 8",
    );

    const shortMove = structuredClone(valid) as {
      puzzles: Array<{ fen: string; moves: string }>;
    };
    shortMove.puzzles[0]!.moves = "e2e";
    expect(() => validateChessFile(shortMove)).toThrow(
      "invalid UCI",
    );
  });
});

describe("Daily Mini content validation", () => {
  const valid = () =>
    structuredClone(fixture("mini/fixtures/sample.json")) as {
      name: string;
      emoji: string;
      startDay: number;
      puzzles: { grid: string; across: string[]; down: string[] }[];
    };
  // Shares SET with the fixture's first puzzle.
  const panGrid = {
    grid: "PAN##ACORNINDIENEEDS##SET",
    across: ["Frying vessel", "Oak's seed", "Small-label music genre", "Requirements", "Tennis unit"],
    down: ["Ache", "Teen skin woe", "Network points", "Carnival attraction", "Bird's home"],
  };

  it("accepts the fixture and derives ten clues per grid from the blacks", () => {
    expect(validateMiniFile(valid()).puzzles).toHaveLength(2);
  });

  it("rejects a two-letter entry, a wrong clue count, and an unfilled square", () => {
    const short = valid();
    short.puzzles[0]!.grid = "#GET#HEARTAN#ERDELAY#SET#";
    expect(() => validateMiniFile(short)).toThrow(/run of 2/);

    const count = valid();
    count.puzzles[0]!.down.pop();
    expect(() => validateMiniFile(count)).toThrow(/must list 5 clues/);

    const hole = valid();
    hole.puzzles[0]!.grid = "#GET#HEARTANGERDELAY#SE.#";
    expect(() => validateMiniFile(hole)).toThrow(/completely filled/);
  });

  it("rejects a clue that contains its answer, as a word or a longer substring", () => {
    const word = valid();
    word.puzzles[0]!.across[0] = "Get hold of";
    expect(() => validateMiniFile(word)).toThrow(/contains its answer GET/);

    const substring = valid();
    substring.puzzles[0]!.across[1] = "Sweetheart's organ";
    expect(() => validateMiniFile(substring)).toThrow(/contains its answer HEART/);

    const long = valid();
    long.puzzles[0]!.across[1] = "x".repeat(51);
    expect(() => validateMiniFile(long)).toThrow(/at most 50/);
  });

  it("rejects an answer that recurs inside the window and allows it at the boundary", () => {
    expect(MINI_REPEAT_WINDOW).toBe(120);
    const [first, filler] = valid().puzzles;
    const adjacent = { ...valid(), puzzles: [first!, panGrid] };
    expect(() => validateMiniFile(adjacent)).toThrow(/repeats SET from puzzle 0/);

    // The rule is `distance < window`; probe the boundary with window 2.
    const spaced = { ...valid(), puzzles: [first!, filler!, panGrid] };
    expect(validateMiniFile(spaced, "mini", 2).puzzles).toHaveLength(3);
    expect(() => validateMiniFile(spaced, "mini", 3)).toThrow(/repeats SET from puzzle 0/);
  });
});
