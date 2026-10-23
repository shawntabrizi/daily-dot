import { describe, expect, it } from "vitest";

import {
  MAX_RATING,
  MIN_PLAYS,
  MIN_POPULARITY,
  MIN_RATING,
  parseLichessRow,
  ratingDistribution,
  selectLichessRows,
  type LichessRow,
} from "./import-lichess";

function row(
  puzzleId: string,
  overrides: Partial<LichessRow> = {},
): LichessRow {
  return {
    puzzleId,
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    moves: "e2e4 e7e5",
    rating: MIN_RATING,
    popularity: MIN_POPULARITY,
    plays: MIN_PLAYS,
    gameUrl: `https://lichess.org/${puzzleId}`,
    ...overrides,
  };
}

describe("Lichess import", () => {
  it("applies every inclusive filter and keeps the lowest PuzzleIds", () => {
    const rows = [
      row("zzz"),
      row("aaa", { rating: MIN_RATING - 1 }),
      row("aab", { rating: MAX_RATING + 1 }),
      row("aac", { popularity: MIN_POPULARITY - 1 }),
      row("aad", { plays: MIN_PLAYS - 1 }),
      row("aae", { moves: "a1a2 a2a3 a3a4 a4a5 a5a6" }),
      row("ccc", { rating: MAX_RATING }),
      row("bbb"),
      row("ddd"),
    ];

    const result = selectLichessRows(rows, 3);

    expect(result.counts).toEqual({
      rows: 9,
      ratingBand: 7,
      popularity: 6,
      plays: 5,
      solutionLength: 4,
    });
    expect(result.selected.map(({ puzzleId }) => puzzleId)).toEqual([
      "bbb",
      "ccc",
      "ddd",
    ]);
  });

  it("parses the documented ten-column CSV schema", () => {
    const parsed = parseLichessRow(
      "abc,8/8/8/8/8/8/8/8 w - - 0 1,e2e4 e7e5,1500,70,90,600,"
        + "short,https://lichess.org/abc,",
      2,
    );

    expect(parsed).toEqual(row("abc", {
      rating: 1500,
      popularity: 90,
      plays: 600,
    }));
  });

  it("reports exact rating buckets including the 1800 boundary", () => {
    expect(
      ratingDistribution([
        row("a", { rating: 1200 }),
        row("b", { rating: 1299 }),
        row("c", { rating: 1800 }),
        row("d", { rating: 1700 }),
      ]),
    ).toEqual({
      min: 1200,
      max: 1800,
      mean: 1499.75,
      median: 1499.5,
      buckets: [
        { range: "1200-1299", count: 2 },
        { range: "1300-1399", count: 0 },
        { range: "1400-1499", count: 0 },
        { range: "1500-1599", count: 0 },
        { range: "1600-1699", count: 0 },
        { range: "1700-1799", count: 1 },
        { range: "1800", count: 1 },
      ],
    });
  });
});
