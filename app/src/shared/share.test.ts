import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { globeAnswer } from "../games/globe/generate";
import { InMemoryDataSource } from "./data-source";
import { GAME_ROSTER } from "./roster";
import { connectionsRows, shareText, type ShareGame } from "./share";
import { pickSixGames } from "../test/picks";

// The six original games picked, except where a test passes its own (D21).
beforeEach(() => {
  pickSixGames();
});

afterEach(() => {
  window.localStorage.clear();
});

const DAY = 208;

function game(
  id: ShareGame["id"],
  overrides: Partial<ShareGame> = {},
): ShareGame {
  const entry = GAME_ROSTER.find((item) => item.id === id)!;
  return {
    id,
    played: true,
    score: entry.kind === "seconds" ? 185 : 4,
    kind: entry.kind,
    percentile: 18,
    ...overrides,
  };
}

const ALL_PLAYED: ShareGame[] = [
  game("word", { score: 4 }),
  game("sudoku", { score: 185, percentile: 20 }),
  game("chess", { score: 1, percentile: 5 }),
  game("globe", { score: 3, percentile: 44 }),
  game("mini", { score: 61, percentile: 9 }),
  game("connections", { score: 0, percentile: 12, lines: connectionsRows([[0, 0, 0, 0], [1, 1, 1, 1]]) }),
];

describe("shareText", () => {
  it("slots and counts the picks, with a line for an unpicked game that was finished too", () => {
    const picks = ["word", "mini", "connections"].map((id) => GAME_ROSTER.find((entry) => entry.id === id)!);
    const text = shareText(
      {
        day: DAY,
        games: [game("word", { score: 4 }), game("globe", { score: 3, percentile: 44 })],
        streaks: { any: 3 },
        dayPercentile: 31,
      },
      picks,
    );
    expect(text).toBe(
      [
        "Daily on Dot #208 · 1/3",
        "✅⬜⬜",
        "Word 4 guesses · Top 18%",
        "Globe 3 guesses · Top 44%",
        "✦ 3",
      ].join("\n"),
    );

    // Every pick played: the day percentile joins the footer, whatever else is unplayed.
    const done = shareText(
      { day: DAY, games: ALL_PLAYED.filter((entry) => ["word", "mini", "connections"].includes(entry.id)), streaks: null, dayPercentile: 9 },
      picks,
    );
    expect(done.split("\n")[0]).toBe("Daily on Dot #208 · 3/3");
    expect(done.split("\n").at(-1)).toBe("Top 9% today");
  });

  it("never contains any game's answer for a day it knows", async () => {
    const source = new InMemoryDataSource();
    const word = await source.wordAnswer(DAY);
    const chess = await source.chessPuzzle(DAY);
    const mini = await source.miniPuzzle(DAY);
    const connections = await source.connectionsPuzzle(DAY);
    const globe = globeAnswer(DAY, "v1");
    const answers = [
      word,
      globe.name,
      ...connections.groups.flatMap((group) => [group.label, ...group.words]),
      ...chess.moves.split(" "),
      ...mini.across,
      ...mini.down,
    ].filter((answer) => answer.length >= 3);
    const miniLetters = mini.grid.replace(/#/g, "");
    expect(miniLetters.length).toBeGreaterThan(10);

    const text = shareText({
      day: DAY,
      games: ALL_PLAYED,
      streaks: { any: 14 },
      dayPercentile: 18,
    });
    const lower = text.toLowerCase();
    for (const answer of answers) {
      expect(lower).not.toContain(answer.toLowerCase());
    }
    expect(lower).not.toContain(miniLetters.toLowerCase());
    expect(text).not.toMatch(/[🟩🟨⬛]{6}/u);
  });

  it("writes the day, six slots in roster order, one line per played game and the streak", () => {
    const text = shareText({
      day: DAY,
      games: [game("word", { score: 4 }), game("globe", { score: 3, percentile: 44 })],
      streaks: { any: 14 },
      dayPercentile: 31,
    });
    expect(text).toBe(
      [
        "Daily on Dot #208 · 2/6",
        "✅⬜⬜✅⬜⬜",
        "Word 4 guesses · Top 18%",
        "Globe 3 guesses · Top 44%",
        "✦ 14",
      ].join("\n"),
    );
  });

  it("counts a slot per played game, no more", () => {
    for (const count of [0, 1, 3, 6]) {
      const text = shareText({
        day: DAY,
        games: ALL_PLAYED.slice(0, count),
        streaks: null,
        dayPercentile: null,
      });
      const slots = text.split("\n")[1]!;
      expect([...slots].filter((slot) => slot === "✅")).toHaveLength(count);
      expect([...slots]).toHaveLength(6);
      expect(text.split("\n")[0]).toBe(`Daily on Dot #208 · ${count}/6`);
    }
  });

  it("adds the day percentile only at 6/6", () => {
    const five = shareText({
      day: DAY,
      games: ALL_PLAYED.slice(0, 5),
      streaks: { any: 2 },
      dayPercentile: 18,
    });
    expect(five).not.toContain("today");
    expect(five.split("\n").at(-1)).toBe("✦ 2");

    const six = shareText({
      day: DAY,
      games: ALL_PLAYED,
      streaks: { any: 2 },
      dayPercentile: 18,
    });
    expect(six.split("\n").at(-1)).toBe("✦ 2 · Top 18% today");
    expect(six).toContain("Connections 0 mistakes · Top 12%\n🟨🟨🟨🟨\n🟩🟩🟩🟩");
    expect(six).toContain("Sudoku 3:05 · Top 20%");
    expect(six).toContain("Chess 1 move · Top 5%");
  });

  it("omits a zero streak and the footer when there is nothing to say", () => {
    const text = shareText({
      day: DAY,
      games: [game("word")],
      streaks: { any: 0 },
      dayPercentile: 50,
    });
    expect(text.split("\n")).toHaveLength(3);
    expect(text).not.toContain("✦");

    const anyOnly = shareText({
      day: DAY,
      games: [game("word")],
      streaks: { any: 7 },
      dayPercentile: null,
    });
    expect(anyOnly.split("\n").at(-1)).toBe("✦ 7");
  });

  it("drops the percentile when the day has none", () => {
    const text = shareText({
      day: DAY,
      games: [game("word", { percentile: null })],
      streaks: null,
      dayPercentile: null,
    });
    expect(text.split("\n")[2]).toBe("Word 4 guesses");
  });
});

describe("connectionsRows", () => {
  it("writes one row of tier squares per guess, in play order", () => {
    expect(connectionsRows([[0, 0, 0, 2], [0, 0, 0, 0]])).toEqual(["🟨🟨🟨🟦", "🟨🟨🟨🟨"]);
    expect(connectionsRows([])).toEqual([]);
  });
});
