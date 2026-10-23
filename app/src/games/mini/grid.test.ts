import { describe, expect, it } from "vitest";

import { miniEntries, miniGridShapeError } from "./grid";

// Corners black: rows of 3,5,5,5,3 letters and the same columns.
const CORNERS = "#ABC#" + "DEFGH" + "IJKLM" + "NOPQR" + "#STU#";

describe("mini grid shape", () => {
  it("numbers entries in reading order and derives answers from the letters", () => {
    const layout = miniEntries(CORNERS);
    expect(layout.across.map((entry) => [entry.n, entry.answer])).toEqual([
      [1, "ABC"],
      [4, "DEFGH"],
      [6, "IJKLM"],
      [7, "NOPQR"],
      [8, "STU"],
    ]);
    expect(layout.down.map((entry) => [entry.n, entry.answer])).toEqual([
      [1, "AEJOS"],
      [2, "BFKPT"],
      [3, "CGLQU"],
      [4, "DIN"],
      [5, "HMR"],
    ]);
    expect(layout.numbers[1]).toBe(1);
    expect(layout.numbers[5]).toBe(4);
    expect(layout.numbers[6]).toBe(0);
  });

  it("rejects a two-letter entry even when every square is checked", () => {
    // A black square in the middle of row 3 splits it into two 2-letter runs.
    const grid = "#ABC#" + "DEFGH" + "IJ#LM" + "NOPQR" + "#STU#";
    expect(miniGridShapeError(grid)).toMatch(/run of 2/);
    expect(() => miniEntries(grid)).toThrow(/Invalid mini grid/);
  });

  it("rejects an isolated square, too few or too many blacks, and bad characters", () => {
    expect(miniGridShapeError("#A###" + "BCDEF" + "GHIJK" + "LMNOP" + "QRSTU")).toMatch(/run of 1/);
    expect(miniGridShapeError("ABCDE" + "FGHIJ" + "KLMNO" + "PQRST" + "UVWX#")).toMatch(/2–5 black/);
    expect(miniGridShapeError("###AB" + "#####" + "KLMNO" + "PQRST" + "UVWXY")).toMatch(/2–5 black/);
    expect(miniGridShapeError(CORNERS.toLowerCase())).toMatch(/only A–Z/);
    expect(miniGridShapeError("ABC")).toMatch(/25 characters/);
  });

  it("accepts the two-black diagonal layout with four-letter edges", () => {
    const grid = "#ABCD" + "EFGHI" + "JKLMN" + "OPQRS" + "TUVW#";
    expect(miniGridShapeError(grid)).toBeNull();
    const layout = miniEntries(grid);
    expect(layout.across).toHaveLength(5);
    expect(layout.down).toHaveLength(5);
    expect(layout.across[0]?.answer).toBe("ABCD");
    expect(layout.down[3]?.answer).toBe("DINS");
    expect(layout.down[4]?.answer).toBe("EJOT");
  });
});
