import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataSource, DayBits } from "../data-source";
import type { Histogram } from "../percentile";
import { savePicks } from "../picks";
import { GAME_ROSTER, gameById } from "../roster";
import type { HubStreaks } from "../streaks";
import { headerTitle } from "./header";
import {
  createResultPanel,
  headlineFor,
  nextGame,
  renderResultPanel,
  syncResultChrome,
} from "./result-panel";
import { pickSixGames } from "../../test/picks";

// The six original games picked, except where a test picks its own (D21).
beforeEach(() => {
  pickSixGames();
});

afterEach(() => {
  window.localStorage.clear();
});

const WORD = gameById("word")!;

function histogram(entries: [bucket: number, count: number][]): Histogram {
  return {
    total: entries.reduce((sum, [, count]) => sum + count, 0),
    buckets: entries.map(([bucket, count]) => ({ bucket, count })),
  };
}

function streaks(any: number): HubStreaks {
  return { any, longestAny: any, finished: any };
}

/**
 * Ten finishers; the player's bucket and the better ones set the percentile.
 * Word's buckets start at 0: bucket 0 is one guess.
 */
const TOP_10 = histogram([[0, 1], [2, 9]]);
const TOP_40 = histogram([[0, 3], [3, 1], [4, 6]]);
const TOP_41 = histogram([[0, 40], [1, 1], [2, 59]]);
const ALONE = histogram([[0, 1]]);

function text(element: HTMLElement, selector: string): string | null {
  return element.querySelector(selector)?.textContent ?? null;
}

const rank = (element: HTMLElement): string | null =>
  text(element, "[data-result-rank-tile] .result-tile-value");

describe("headlineFor", () => {
  it.each([
    [10, 10, false, "Splendid."],
    [40, 10, false, "Nice."],
    [41, 100, false, "Done."],
    [100, 1, false, "First today."],
    [10, 10, true, "Done."],
    [null, 0, false, "Done."],
  ])("percentile %s of %s finishers, late %s reads %s", (percentile, finishers, late, expected) => {
    expect(headlineFor({ percentile, finishers, late })).toBe(expected);
  });
});

describe("renderResultPanel", () => {
  it("draws the board: headline, score · answer subline, three tiles and the distribution card", () => {
    const splendid = renderResultPanel(WORD, 1, TOP_10, {
      unit: "guess",
      streaks: streaks(3),
      detail: "the word was PLANET",
    });
    expect(splendid.tagName).toBe("SECTION");
    expect(splendid.querySelector("h1")?.textContent).toBe("Splendid.");
    expect(text(splendid, "[data-result-subline]")).toBe("1 guess · the word was PLANET");
    expect(splendid.dataset.game).toBe("word");
    const tiles = [...splendid.querySelectorAll(".result-tile")].map((tile) => [
      tile.querySelector(".result-tile-value")?.textContent,
      tile.querySelector(".result-tile-label")?.textContent,
    ]);
    expect(tiles).toEqual([
      ["1", "guess"],
      ["10%", "top today"],
      ["3", "day streak"],
    ]);
    expect(splendid.querySelector("[data-result-streak-tile] svg")).not.toBeNull();
    expect(text(splendid, "[data-distribution-total]")).toBe("10 finished today");
    expect(text(splendid, "[data-distribution-you]")).toBe("you are here");
    expect(splendid.querySelector("[data-share-preview]")).toBeNull();

    expect(text(renderResultPanel(WORD, 4, TOP_40), "[data-result-headline]")).toBe("Nice.");
    expect(text(renderResultPanel(WORD, 2, TOP_41), "[data-result-headline]")).toBe("Done.");

    const first = renderResultPanel(WORD, 1, ALONE);
    expect(text(first, "[data-result-headline]")).toBe("First today.");
    expect(text(first, "[data-distribution-total]")).toBe("1 finished today");
  });

  it("formats a seconds score as a time tile and a large finisher count with a separator", () => {
    const sudoku = gameById("sudoku")!;
    const crowd = histogram([[4, 300], [12, 1204]]);
    const panel = renderResultPanel(sudoku, 185, crowd);
    expect(text(panel, "[data-result-subline]")).toBe("3:05");
    expect(text(panel, "[data-result-score-tile] .result-tile-value")).toBe("3:05");
    expect(text(panel, "[data-result-score-tile] .result-tile-label")).toBe("time");
    expect(rank(panel)).toBe("20%");
    expect(text(panel, "[data-distribution-total]")).toBe("1,504 finished today");
  });

  it("gives a late play a plain Done, 'on the day', and no streak tile", () => {
    const panel = renderResultPanel(WORD, 1, TOP_10, { late: true, pastDay: 9, streaks: streaks(30) });
    expect(text(panel, "[data-result-headline]")).toBe("Done.");
    expect(rank(panel)).toBe("9%");
    expect(text(panel, "[data-result-rank-tile] .result-tile-label")).toBe("on the day");
    // The chain never counts a late record; the player is added here.
    expect(text(panel, "[data-distribution-total]")).toBe("11 finished on the day");
    expect(panel.querySelector("[data-result-streak-tile]")).toBeNull();
    expect(panel.querySelector("[data-result-milestone]")).toBeNull();
  });

  // Why: a saved past-day play read "0 finished on the day" with the player
  // marked in an empty bar: the contract never counts late records, so the
  // player must be added locally to the count and their own bar.
  it("counts a saved past-day play as a finisher in the head and its own bar", () => {
    const panel = renderResultPanel(WORD, 3, histogram([]), { late: true, pastDay: 9 });
    expect(text(panel, "[data-distribution-total]")).toBe("1 finished on the day");
    expect(panel.querySelector("[data-player-marker]")?.getAttribute("data-player-marker")).toBe("2");
    expect(panel.querySelector("[data-distribution]")?.getAttribute("aria-label")).toBe(
      "You are in the top 100% of 1 finisher on the day",
    );
  });

  it("ranks a higher-better points game from the top and writes its points", () => {
    // Daily Color's shape (D24) on a stand-in game: more points rank first.
    const color = { ...WORD, kind: "points" as const, better: "higher" as const, buckets: { min: 0, max: 500, buckets: 100 } };
    const day = histogram([[90, 1], [60, 8], [20, 1]]);
    const top = renderResultPanel(color, 426, day);
    expect(text(top, "[data-result-subline]")).toBe("42.6 points");
    expect(text(top, "[data-result-score-tile] .result-tile-value")).toBe("42.6");
    expect(text(top, "[data-result-score-tile] .result-tile-label")).toBe("points");
    // Bucket 85: only the 45-pointer ranks ahead; inserted, 2 of 11.
    expect(rank(top)).toBe("18%");
    expect(top.querySelector("[data-distribution]")?.getAttribute("aria-label")).toBe(
      "You are in the top 18% of 11 finishers",
    );
    // A 30-pointer read on time already sits in bucket 60: behind the one 45-pointer only.
    expect(rank(renderResultPanel(color, 300, day))).toBe("20%");
  });

  it("keeps a past day's result inside that day: Next is its next unplayed game, the second button its hub", () => {
    // Why: a player working through an old day wants its other games, not today.
    const bit = (id: string): bigint => 1n << BigInt(gameById(id)!.gameId);
    const panel = renderResultPanel(WORD, 1, TOP_10, {
      late: true,
      pastDay: 9,
      next: nextGame(WORD, bit("sudoku")),
    });
    const main = panel.querySelector<HTMLAnchorElement>("[data-result-next]")!;
    expect(main.getAttribute("href")).toBe("#/g/chess?day=9");
    expect(text(main, ".result-primary-label")).toBe("Next: Chess");
    expect(text(main, ".result-primary-count")).toBe("Day 9 · 2 of 6");
    const day = [...panel.querySelectorAll<HTMLAnchorElement>(".result-secondary a")].at(-1)!;
    expect(day.textContent).toBe("Day 9");
    expect(day.getAttribute("href")).toBe("#/day?day=9");
    expect(text(panel, "[data-result-past-note]")).toBe(
      "Day 9 is on your calendar now. Your streak counts today only.",
    );

    // All six done that day: the main button goes back to the day's hub.
    const all = GAME_ROSTER.reduce((bits, game) => bits | (1n << BigInt(game.gameId)), 0n);
    const done = renderResultPanel(WORD, 1, TOP_10, { late: true, pastDay: 9, next: nextGame(WORD, all) });
    const doneMain = done.querySelector<HTMLAnchorElement>("[data-result-next]")!;
    expect(doneMain.getAttribute("href")).toBe("#/day?day=9");
    expect(text(doneMain, ".result-primary-label")).toBe("Day 9");
  });

  it("keeps the score and shows a dash for the rank when the distribution is unavailable", () => {
    const panel = renderResultPanel(WORD, 4, null, { unit: "guess" });
    expect(text(panel, "[data-result-headline]")).toBe("Done.");
    expect(text(panel, "[data-result-subline]")).toBe("4 guesses");
    expect(rank(panel)).toBe("—");
    expect(text(panel, "[data-result-rank-tile] .result-tile-label")).toBe("top today");
    expect(panel.querySelector("[data-distribution]")).toBeNull();
  });

  it("adds the milestone line at 30 days and not at 29", () => {
    const thirty = renderResultPanel(WORD, 1, TOP_10, { streaks: streaks(30) });
    expect(text(thirty, "[data-result-milestone]")).toBe("30 days. Keep it.");
    expect(renderResultPanel(WORD, 1, TOP_10, { streaks: streaks(29) }).querySelector("[data-result-milestone]")).toBeNull();
    expect(text(renderResultPanel(WORD, 1, TOP_10, { streaks: streaks(7) }), "[data-result-milestone]")).toBe("7 days. Keep it.");
  });

  it("names the next game on the main button in that game's colour, with the day count, then Share and Today", () => {
    const panel = renderResultPanel(WORD, 1, TOP_10, {
      next: nextGame(WORD, 0n),
      onShare: () => undefined,
    });
    const main = panel.querySelector<HTMLAnchorElement>("[data-result-next]")!;
    expect(text(main, ".result-primary-label")).toBe("Next: Sudoku");
    expect(text(main, ".result-primary-count")).toBe("1 of 6 done");
    expect(main.dataset.game).toBe("sudoku");
    expect(main.getAttribute("href")).toBe("#/g/sudoku");
    const actions = [...panel.querySelectorAll(".result-secondary > *")];
    expect(actions.map((action) => action.textContent)).toEqual(["Share", "Today"]);
    expect(actions[1]?.getAttribute("href")).toBe("#/");
  });
});

describe("syncResultChrome", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the game header on a past day's result, so the day switcher stays in reach", () => {
    const page = document.createElement("section");
    syncResultChrome(page, WORD, 293, true);
    expect(headerTitle()).toBe("Word · Day 293");
  });

  it("hides the game heading and shows the result eyebrow, then gives the header back to the game", () => {
    const page = document.createElement("section");
    page.innerHTML = '<div class="game-heading"><h1>One word a day.</h1></div>';
    const heading = page.querySelector<HTMLElement>(".game-heading")!;
    syncResultChrome(page, WORD, 294, true);
    expect(heading.hidden).toBe(true);
    // The Result board's eyebrow; CSS sets the caps.
    expect(headerTitle()).toBe("Daily Word · Day 294");
    syncResultChrome(page, WORD, 294, false);
    expect(heading.hidden).toBe(false);
    // The Game board's header: the short name with the day pill.
    expect(headerTitle()).toBe("Word · Day 294");
  });
});

describe("nextGame", () => {
  const bit = (id: string): bigint => 1n << BigInt(gameById(id)!.gameId);

  it("picks the first unplayed game after the current one in roster order", () => {
    const next = nextGame(gameById("chess")!, bit("word") | bit("globe"));
    expect(next.game?.id).toBe("mini");
    expect(next.done).toBe(3);
    expect(next.total).toBe(6);
  });

  it("wraps from the last game to the first unplayed one", () => {
    const next = nextGame(gameById("connections")!, bit("word"));
    expect(next.game?.id).toBe("sudoku");
    expect(next.done).toBe(2);
  });

  it("counts the current game as done even when the read lags, and reads Today at 6/6", () => {
    const others = GAME_ROSTER.filter((game) => game.id !== "mini").reduce((mask, game) => mask | bit(game.id), 0n);
    const next = nextGame(gameById("mini")!, others);
    expect(next.game).toBeNull();
    expect(next.done).toBe(6);
    const panel = renderResultPanel(gameById("mini")!, 61, TOP_10, { next });
    const main = panel.querySelector<HTMLAnchorElement>("[data-result-next]")!;
    expect(text(main, ".result-primary-label")).toBe("Today");
    expect(text(main, ".result-primary-count")).toBe("6 of 6 done");
    expect(main.dataset.game).toBeUndefined();
    expect(main.getAttribute("href")).toBe("#/");
  });

  it("steps through the picks only and counts them alone", () => {
    savePicks([0, 4, 5]);
    // From Word with Mini done: Connections next; Sudoku, Chess and Globe are not asked for.
    const next = nextGame(gameById("word")!, bit("mini") | bit("chess"));
    expect(next.game?.id).toBe("connections");
    expect(next.done).toBe(2);
    expect(next.total).toBe(3);
  });

  it("from an unpicked game sends the player to the first unplayed pick, its own finish not counted", () => {
    savePicks([0, 4, 5]);
    const next = nextGame(gameById("globe")!, bit("word"));
    expect(next.game?.id).toBe("mini");
    expect(next.done).toBe(1);
    expect(next.total).toBe(3);
  });
});

describe("createResultPanel", () => {
  const bits = (played: bigint, ontime = played): DayBits => ({ played, solved: played, ontime });

  function sourceWith(overrides: Partial<DataSource> = {}): DataSource {
    // Two days on time before today; today shows Word not yet (a lagging read).
    return {
      currentDay: async () => 10,
      wordAnswer: async () => "planet",
      dayBits: async () => bits(1n << 1n),
      dayBitsRange: async (from, count) =>
        Array.from({ length: count }, (_, offset) =>
          from + offset >= 8 && from + offset < 10 ? bits(1n) : bits(0n),
        ),
      record: async () => undefined,
      histogram: async () => TOP_10,
      histograms: async (_day, gameIds) => gameIds.map(() => TOP_10),
      details: async (_day, gameIds) =>
        gameIds.map((gameId) => (gameId === 1 ? { score: 120, solved: true } : { score: 0, solved: false })),
      ...overrides,
    };
  }

  // Why: after Not now the score is not on chain, so the panel must not claim
  // a rank, a streak or "you are here"; it keeps the result layout and puts
  // Save above Next.
  it("shows an unsaved result in the result layout with Save above Next, no rank and no streak", async () => {
    const handle = createResultPanel(sourceWith(), WORD, { unit: "guess" });
    document.body.append(handle.element);
    const onSave = vi.fn();
    handle.update({
      day: 10, score: 1, recorded: false, late: false, detail: "the word was PLANET",
      pendingSave: "unsaved", onSave,
    });
    await vi.waitFor(() => {
      expect(handle.element.querySelector("[data-result-unsaved]")).not.toBeNull();
    });
    const panel = handle.element.querySelector<HTMLElement>("[data-result-panel]")!;
    expect(text(panel, "[data-result-headline]")).toBe("Done.");
    expect(panel.querySelector("[data-distribution]")).not.toBeNull();
    expect(panel.querySelector("[data-distribution-you]")).toBeNull();
    expect(panel.querySelector("[data-result-rank-tile], [data-result-streak-tile]")).toBeNull();
    const bar = panel.querySelector<HTMLElement>("[data-result-unsaved]")!;
    const next = panel.querySelector<HTMLElement>("[data-result-next]")!;
    expect(bar.textContent).toContain("Not saved yet");
    expect(bar.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    bar.querySelector<HTMLButtonElement>("[data-result-save]")!.click();
    expect(onSave).toHaveBeenCalledTimes(1);

    // After Save the bar says the write is in flight, in place, with no Save button.
    handle.update({ day: 10, score: 1, recorded: false, late: false, pendingSave: "saving" });
    await vi.waitFor(() => {
      expect(handle.element.querySelector("[data-result-unsaved=saving]")?.textContent).toBe("Recording your score…");
    });
    expect(handle.element.querySelector("[data-result-save]")).toBeNull();
    expect(handle.element.querySelector("[data-save-status]")).not.toBeNull();
    handle.element.remove();
  });

  // Why: right after the write the read can lag the best block; the result
  // must still count the player, then take the chain's own count once it lands.
  it("counts the player in a lagging read, then redraws from one re-read that holds them", async () => {
    const reads = [histogram([[2, 9]]), histogram([[0, 4], [2, 9]])];
    const read = vi.fn(async () => reads.shift() ?? histogram([[0, 4], [2, 9]]));
    const handle = createResultPanel(sourceWith({ histogram: read }), WORD, { unit: "guess" });
    document.body.append(handle.element);
    handle.update({ day: 10, score: 1, recorded: true, late: false });
    await vi.waitFor(() => {
      expect(text(handle.element, "[data-distribution-total]")).toBe("10 finished today");
    });
    await vi.waitFor(() => {
      expect(text(handle.element, "[data-distribution-total]")).toBe("13 finished today");
    }, { timeout: 4000 });
    expect(read).toHaveBeenCalledTimes(2);
    handle.element.remove();
  });

  it("shows the loading line, then the panel with the streak, the next game and the day's preview", async () => {
    const handle = createResultPanel(sourceWith(), WORD, { unit: "guess" });
    document.body.append(handle.element);
    handle.update({ day: 10, score: 1, recorded: true, late: false, detail: "the word was PLANET" });
    expect(handle.element.hidden).toBe(false);
    expect(handle.element.textContent).toContain("Reading today's distribution…");
    await vi.waitFor(() => {
      expect(text(handle.element, "[data-result-headline]")).toBe("Splendid.");
    });
    expect(text(handle.element, "[data-result-subline]")).toBe("1 guess · the word was PLANET");
    expect(text(handle.element, "[data-result-streak-tile] .result-tile-value")).toBe("3");
    const main = handle.element.querySelector<HTMLElement>("[data-result-next]")!;
    expect(text(main, ".result-primary-label")).toBe("Next: Chess");
    expect(text(main, ".result-primary-count")).toBe("2 of 6 done");
    expect(main.dataset.game).toBe("chess");
    expect(handle.element.querySelector(".result")?.getAttribute("data-game")).toBe("word");
    handle.element.remove();
  });

  it("shares the colour-free day text through the clipboard when there is no share sheet", async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const toasts: string[] = [];
    const onToast = (event: Event): void => {
      toasts.push(String((event as CustomEvent<string>).detail));
    };
    window.addEventListener("daily-toast", onToast);
    const handle = createResultPanel(sourceWith(), WORD, { unit: "guess" });
    document.body.append(handle.element);
    handle.update({ day: 10, score: 1, recorded: true, late: false, detail: "the word was PLANET" });
    await vi.waitFor(() => {
      expect(handle.element.querySelector("[data-result-share]")).not.toBeNull();
    });
    handle.element.querySelector<HTMLButtonElement>("[data-result-share]")!.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
    });
    expect(writeText.mock.calls[0]![0]).toBe(
      ["Daily on Dot #10 · 2/6", "✅✅⬜⬜⬜⬜", "Word 1 guess · Top 10%", "Sudoku 2:00 · Top 100%", "✦ 3"].join("\n"),
    );
    expect(writeText.mock.calls[0]![0]).not.toContain("PLANET");
    expect(toasts).toEqual(["Copied."]);
    window.removeEventListener("daily-toast", onToast);
    handle.element.remove();
  });

  it("hides again when the record is withdrawn and draws no streak tile late", async () => {
    const handle = createResultPanel(sourceWith(), WORD);
    handle.update({ day: 9, score: 1, recorded: true, late: true });
    await vi.waitFor(() => {
      expect(text(handle.element, "[data-result-headline]")).toBe("Done.");
    });
    expect(handle.element.querySelector("[data-result-streak-tile]")).toBeNull();
    expect(text(handle.element, "[data-result-next] .result-primary-label")).toBe("Next: Chess");
    handle.update({ day: 9, score: 1, recorded: false, late: true });
    expect(handle.element.hidden).toBe(true);
    expect(handle.element.childElementCount).toBe(0);
  });
});
