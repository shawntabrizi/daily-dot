import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataSource, DayBits } from "./shared/data-source";
import { GAME_ROSTER } from "./shared/roster";
import { rosterMask } from "./shared/streaks";
import { monthLine, renderStreaks } from "./streaks";
import { pickSixGames } from "./test/picks";

// The six original games picked: blue here means all six (D17c, D21).
beforeEach(() => {
  pickSixGames();
});

afterEach(() => {
  window.localStorage.clear();
});

const MASK = rosterMask(GAME_ROSTER.map((game) => game.gameId));
const FIRST = 1n << BigInt(GAME_ROSTER[0]!.gameId);
const EMPTY: DayBits = { played: 0n, solved: 0n, ontime: 0n };
const ONE: DayBits = { played: FIRST, solved: FIRST, ontime: FIRST };
const ALL: DayBits = { played: MASK, solved: MASK, ontime: MASK };
const BACKFILL: DayBits = { played: FIRST, solved: FIRST, ontime: 0n };

/** Day 50 is 2026-02-20, a Friday. */
const TODAY = 50;

/**
 * Days 10–34 any game (25 days, the best), 35 nothing, 36 backfilled, 37–50
 * any game (14 days, live), 49 and 50 all six. Weeks run Monday to Sunday
 * from day 4 (2026-01-05); the perfect weeks are days 11–17, 18–24, 25–31
 * (January 26 to February 1) and 39–45 (February 9–15).
 */
function bitsFor(day: number): DayBits {
  if (day === 49 || day === 50) return ALL;
  if (day === 36) return BACKFILL;
  if (day === 35 || day < 10) return EMPTY;
  return ONE;
}

function stubSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    currentDay: async () => TODAY,
    wordAnswer: async () => "planet",
    dayBits: async (day) => bitsFor(day),
    dayBitsRange: async (from, count) =>
      Array.from({ length: count }, (_, offset) => bitsFor(from + offset)),
    record: async () => undefined,
    ...overrides,
  };
}

async function mount(source: DataSource = stubSource()) {
  const view = renderStreaks(source);
  document.body.append(view.element);
  await vi.waitFor(() => {
    expect(view.element.querySelector(".calendar-grid")).not.toBeNull();
  });
  return view;
}

const cell = (root: Element, day: number): Element | null =>
  root.querySelector(`[href="#/day?day=${day}"]`);

const text = (root: Element, selector: string): string =>
  root.querySelector(selector)?.textContent?.trim() ?? "";

describe("streaks page", () => {
  it("shows the streak with its best and the games finished, number before label", async () => {
    const view = await mount();
    expect(text(view.element, "[data-streak-any]")).toBe("14");
    expect(text(view.element, "[data-longest-any]")).toBe("25");
    // One game on each of days 10–34, 36 and 37–48, all six on 49 and 50.
    expect(text(view.element, "[data-finished]")).toBe(String(25 + 1 + 12 + 2 * GAME_ROSTER.length));
    // The board's order inside a tile: mark, number, label, note.
    const order = [...view.element.querySelector("[data-tile-any]")!.children].map(
      (child) => child.className,
    );
    expect(order).toEqual([
      "streak-tile-mark",
      "streak-tile-count",
      "streak-tile-label",
      "streak-tile-note",
    ]);
    expect(text(view.element, "[data-tile-any] .streak-tile-label")).toBe("Day streak");
    expect(text(view.element, "[data-tile-finished] .streak-tile-label")).toBe("Games finished");
    expect(view.element.textContent).toContain("Any one game, any day. Best 25.");
    expect(view.element.querySelector("[data-streak-all]")).toBeNull();
    view.dispose();
    view.element.remove();
  });

  it("keeps the same tint at a streak of 0: the tile never lights", async () => {
    const view = await mount(
      stubSource({
        dayBitsRange: async (from, count) =>
          Array.from({ length: count }, (_, offset) => (from + offset === TODAY ? ONE : EMPTY)),
      }),
    );
    expect(text(view.element, "[data-streak-any]")).toBe("1");
    for (const tile of view.element.querySelectorAll(".streak-tile")) {
      expect(tile.getAttribute("data-lit")).toBeNull();
      expect(tile.className).not.toMatch(/lit/);
    }
    view.dispose();
    view.element.remove();
  });

  it("opens on today's month, named without the year, with the played count on one line", async () => {
    const view = await mount();
    expect(text(view.element, "[data-month-label]")).toBe("February");
    // February 1–20: 19 days with a game (the 5th has none).
    expect(text(view.element, "[data-month-line]")).toBe("19 played");
    expect(
      view.element.querySelector(".streak-month-head")?.contains(
        view.element.querySelector("[data-month-line]"),
      ),
    ).toBe(true);
    view.dispose();
    view.element.remove();
  });

  it("colors cells by state: every pick blue, any gold, a backfilled day gold with a tick", async () => {
    const view = await mount();
    expect(cell(view.element, 50)?.className).toContain("calendar-day--complete");
    expect(cell(view.element, 40)?.className).toContain("calendar-day--any");
    const backfilled = cell(view.element, 36);
    expect(backfilled?.className).toContain("calendar-day--backfill");
    expect(backfilled?.className).not.toContain("calendar-day--any");
    expect(backfilled?.querySelector(".calendar-day-dot")?.textContent).toBe("✓");
    // Day 35 had nothing: no link, empty.
    expect(cell(view.element, 35)).toBeNull();
    expect(
      view.element.querySelector('[aria-label="February 5, 2026: no activity"]')?.className,
    ).toContain("calendar-day--empty");
    view.dispose();
    view.element.remove();
  });

  it("rings today and numbers future days without exposing them", async () => {
    const view = await mount();
    const today = cell(view.element, 50);
    expect(today?.className).toContain("calendar-day--today");
    expect(today?.getAttribute("aria-current")).toBe("date");
    // February 21–28 have not happened: a dim number, hidden from assistive tech, no link.
    const blanks = view.element.querySelectorAll(".calendar-day--blank");
    expect(blanks).toHaveLength(8);
    expect([...blanks].map((blank) => blank.textContent?.trim())).toEqual(
      ["21", "22", "23", "24", "25", "26", "27", "28"],
    );
    for (const blank of blanks) {
      expect(blank.getAttribute("aria-hidden")).toBe("true");
      expect(blank.tagName).toBe("SPAN");
    }
    // 20 past cells + 8 blanks: the whole month, and nothing links beyond today.
    expect(view.element.querySelectorAll(".calendar-day")).toHaveLength(28);
    expect(view.element.querySelector('[href="#/day?day=51"]')).toBeNull();
    view.dispose();
    view.element.remove();
  });

  it("starts the week on Monday, as the board does", async () => {
    const view = await mount();
    // 2026-02-01 is a Sunday: six leading spacers.
    expect(view.element.querySelectorAll(".calendar-spacer")).toHaveLength(6);
    expect(
      [...view.element.querySelectorAll(".calendar-weekdays span")].map((span) => span.textContent),
    ).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    view.dispose();
    view.element.remove();
  });

  it("draws a Monday-to-Sunday week with every day played as one gold bar", async () => {
    const view = await mount();
    // February 9–15 (days 39–45) is the one full week inside the month with a game every day.
    const bars = view.element.querySelectorAll(".calendar-week--perfect");
    expect(bars).toHaveLength(1);
    const bar = bars[0]!;
    expect(bar.getAttribute("aria-label")).toBe("Perfect week, 9 to 15 February");
    expect([...bar.querySelectorAll(".calendar-day-number")].map((n) => n.textContent)).toEqual(
      ["9", "10", "11", "12", "13", "14", "15"],
    );
    expect(bar.contains(cell(view.element, 39))).toBe(true);
    expect(bar.contains(cell(view.element, 45))).toBe(true);
    // February 2–8 has the 5th unplayed, and 16–22 runs past today: plain rows.
    expect(bar.contains(cell(view.element, 36))).toBe(false);
    expect(bar.contains(cell(view.element, 50))).toBe(false);
    // The bar sits inside the grid as a whole row: 21 loose cells + 6 spacers + the bar.
    expect(view.element.querySelector(".calendar-grid")?.children).toHaveLength(28);
    view.dispose();
    view.element.remove();
  });

  it("keeps complete days blue inside a perfect week", async () => {
    // Days 39–45 all six on 42 (February 12).
    const view = await mount(
      stubSource({
        dayBitsRange: async (from, count) =>
          Array.from({ length: count }, (_, offset) =>
            from + offset === 42 ? ALL : bitsFor(from + offset),
          ),
      }),
    );
    const bar = view.element.querySelector(".calendar-week--perfect")!;
    const blue = cell(view.element, 42)!;
    expect(bar.contains(blue)).toBe(true);
    expect(blue.className).toContain("calendar-day--complete");
    expect(text(view.element, "[data-month-line]")).toBe("19 played");
    view.dispose();
    view.element.remove();
  });

  it("walks months back to January 2026 and no further, and never past today", async () => {
    const view = await mount();
    const previous = view.element.querySelector<HTMLButtonElement>("[data-previous]")!;
    const next = view.element.querySelector<HTMLButtonElement>("[data-next]")!;
    expect(next.disabled).toBe(true);
    expect(previous.disabled).toBe(false);

    previous.click();
    expect(text(view.element, "[data-month-label]")).toBe("January");
    // Days 10–30 are January 11–31, any game: 21 played; 2026-01-01 is a Thursday.
    expect(text(view.element, "[data-month-line]")).toBe("21 played");
    expect(view.element.querySelectorAll(".calendar-spacer")).toHaveLength(3);
    expect(view.element.querySelector(".calendar-day--blank")).toBeNull();
    // January 12–18 and 19–25 are bars; January 26 to February 1 straddles the month, so it is not.
    expect(
      [...view.element.querySelectorAll(".calendar-week--perfect")].map((bar) =>
        bar.getAttribute("aria-label"),
      ),
    ).toEqual(["Perfect week, 12 to 18 January", "Perfect week, 19 to 25 January"]);
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    next.click();
    expect(text(view.element, "[data-month-label]")).toBe("February");
    expect(next.disabled).toBe(true);
    view.dispose();
    view.element.remove();
  });

  it("names the month with its year once the view leaves today's year", async () => {
    // Day 370 is 2027-01-06.
    const view = await mount(
      stubSource({
        currentDay: async () => 370,
        dayBitsRange: async (_from, count) => Array.from({ length: count }, () => ONE),
      }),
    );
    expect(text(view.element, "[data-month-label]")).toBe("January");
    view.element.querySelector<HTMLButtonElement>("[data-previous]")!.click();
    expect(text(view.element, "[data-month-label]")).toBe("December 2026");
    view.dispose();
    view.element.remove();
  });

  it("derives the next badge from the day streak: 14 → 30-day streak at 14 / 30", async () => {
    const view = await mount();
    const milestone = view.element.querySelector<HTMLElement>("[data-milestone]")!;
    expect(milestone.hidden).toBe(false);
    expect(text(milestone, ".streak-next-eyebrow")).toBe("Next badge");
    expect(text(milestone, "[data-milestone-label]")).toBe("30-day streak");
    expect(text(milestone, "[data-milestone-count]")).toBe("14 / 30");
    const bar = milestone.querySelector<HTMLElement>("[data-progress]")!;
    expect(bar.getAttribute("aria-valuenow")).toBe("14");
    expect(bar.getAttribute("aria-valuemax")).toBe("30");
    expect(milestone.querySelector<HTMLElement>("[data-progress-fill]")?.style.width).toBe(
      `${(14 / 30) * 100}%`,
    );
    expect(text(view.element, ".streak-rule")).toBe(
      "A day counts until the next set drops. Past days you fill in later count for the calendar, not the streak.",
    );
    view.dispose();
    view.element.remove();
  });

  it("hides the badge once 365 days are reached", async () => {
    // Day 400: every day on time since the epoch.
    const view = await mount(
      stubSource({
        currentDay: async () => 400,
        dayBitsRange: async (_from, count) => Array.from({ length: count }, () => ONE),
      }),
    );
    expect(text(view.element, "[data-streak-any]")).toBe("401");
    expect(view.element.querySelector<HTMLElement>("[data-milestone]")?.hidden).toBe(true);
    view.dispose();
    view.element.remove();
  });

  it("offers a retry when the read fails", async () => {
    const currentDay = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("endpoint dropped"))
      .mockResolvedValue(TODAY);
    const view = renderStreaks(stubSource({ currentDay }));
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Streaks could not be loaded.");
    });
    expect(text(view.element, "[data-streak-any]")).toBe("–");

    view.element.querySelector<HTMLButtonElement>(".calendar-error button")?.click();
    await vi.waitFor(() => {
      expect(view.element.querySelector(".calendar-grid")).not.toBeNull();
    });
    expect(text(view.element, "[data-streak-any]")).toBe("14");
    expect(currentDay).toHaveBeenCalledTimes(2);
    view.dispose();
    view.element.remove();
  });
});

describe("monthLine", () => {
  it("counts days with a game, on time or later, as the board words it", () => {
    expect(monthLine([ONE, BACKFILL, ALL, EMPTY, { played: MASK, solved: MASK, ontime: 0n }])).toBe(
      "4 played",
    );
    expect(monthLine([ALL])).toBe("1 played");
    expect(monthLine([])).toBe("0 played");
  });
});
