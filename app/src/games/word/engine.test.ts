import { describe, expect, it } from "vitest";
import { scoreGuess, WORD_LENGTH } from "./engine";

describe("Daily Word", () => {
  it("is a 6-letter word (D16)", () => {
    expect(WORD_LENGTH).toBe(6);
  });
});

describe("scoreGuess", () => {
  it("reserves greens before assigning duplicate yellows", () => {
    expect(scoreGuess("apple", "allee")).toEqual([
      "correct",
      "present",
      "absent",
      "absent",
      "correct",
    ]);
  });

  it("never marks more copies present than the answer contains", () => {
    expect(scoreGuess("civic", "cacao")).toEqual([
      "correct",
      "absent",
      "present",
      "absent",
      "absent",
    ]);
  });
});
