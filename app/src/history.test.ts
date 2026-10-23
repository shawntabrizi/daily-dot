import { expect, it, vi } from "vitest";

import { renderHistory } from "./history";
import type { DataSource, DayBits } from "./shared/data-source";
import { GAME_ROSTER } from "./shared/roster";
import { rosterMask } from "./shared/streaks";

const MASK = rosterMask(GAME_ROSTER.map((game) => game.gameId));

it("offers a retry when the initial archive read fails", async () => {
  const currentDay = vi
    .fn<() => Promise<number>>()
    .mockRejectedValueOnce(new Error("endpoint dropped"))
    .mockResolvedValue(40);
  const source: DataSource = {
    currentDay,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async (_from, count) =>
      Array.from({ length: count }, () => ({
        played: 0n,
        solved: 0n,
        ontime: 0n,
      })),
    record: async () => undefined,
  };

  const view = renderHistory(source);
  document.body.append(view.element);
  // Every game has a chip even before the read resolves.
  const chips = [...view.element.querySelectorAll("[data-game-chip]")].map((chip) => chip.textContent);
  expect(chips).toEqual(["All", "Word", "Sudoku", "Chess", "Globe", "Mini", "Connections"]);
  await vi.waitFor(() => {
    expect(view.element.textContent).toContain(
      "Calendar data could not be loaded.",
    );
  });

  view.element.querySelector<HTMLButtonElement>(".calendar-error button")?.click();
  await vi.waitFor(() => {
    expect(view.element.querySelector(".calendar-grid")).not.toBeNull();
  });
  expect(currentDay).toHaveBeenCalledTimes(2);
  view.dispose();
  view.element.remove();
});

it("opens on the all-games calendar: blue, gold and played-later days, lifetime counts", async () => {
  const today = 40;
  const first = 1n << BigInt(GAME_ROSTER[0]!.gameId);
  // Day 40 (today): every game on time. 39: one game on time. 38: played later only.
  const byDay = new Map<number, DayBits>([
    [40, { played: MASK, solved: MASK, ontime: MASK }],
    [39, { played: first, solved: first, ontime: first }],
    [38, { played: MASK, solved: MASK, ontime: 0n }],
  ]);
  const dayBitsRange = vi.fn(async (from: number, count: number) =>
    Array.from({ length: count }, (_, offset) =>
      byDay.get(from + offset) ?? { played: 0n, solved: 0n, ontime: 0n }),
  );
  const source: DataSource = {
    currentDay: async () => today,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange,
    record: async () => undefined,
  };

  const view = renderHistory(source);
  document.body.append(view.element);
  await vi.waitFor(() => {
    expect(view.element.querySelector(".calendar-grid")).not.toBeNull();
  });
  expect(view.element.querySelector('[data-game-chip="all"]')?.getAttribute("aria-pressed")).toBe("true");
  // One pass over every day since the epoch.
  expect(dayBitsRange).toHaveBeenCalledTimes(1);
  expect(dayBitsRange).toHaveBeenCalledWith(0, 41);

  const states = (day: number): string | undefined =>
    view.element.querySelector(`[href="#/day?day=${day}"]`)?.className;
  expect(states(40)).toContain("calendar-day--all");
  expect(states(39)).toContain("calendar-day--any");
  expect(states(38)).toContain("calendar-day--backfill");
  expect(view.element.querySelector(".calendar-day--all .calendar-day-dot")?.textContent).toBe("");
  expect(view.element.querySelector(".calendar-day--backfill .calendar-day-dot")?.textContent).toBe("✓");

  const hub = view.element.querySelector<HTMLElement>("[data-hub-stats]");
  expect(hub?.hidden).toBe(false);
  expect(hub?.querySelector("[data-finished]")?.textContent).toBe(String(GAME_ROSTER.length * 2 + 1));
  expect(hub?.querySelector("[data-perfect]")?.textContent).toBe("2");
  expect(hub?.querySelector("[data-longest-all]")?.textContent).toBe("1");
  expect(hub?.querySelector("[data-streak-any]")?.getAttribute("data-streak-any")).toBe("2");
  expect(hub?.querySelector("[data-streak-all]")?.getAttribute("data-streak-all")).toBe("1");
  expect(view.element.querySelector<HTMLElement>("[data-game-stats]")?.hidden).toBe(true);

  // Switching to one game restores its calendar and stats.
  // A chip tap, not a native <select>: the host web view does not open native pickers.
  view.element.querySelector<HTMLButtonElement>('[data-game-chip="word"]')!.click();
  await vi.waitFor(() => {
    expect(view.element.querySelector(`[href="#/g/word?day=40"]`)).not.toBeNull();
  });
  expect(view.element.querySelector<HTMLElement>("[data-game-stats]")?.hidden).toBe(false);
  // Word was on time on days 39 and 40.
  expect(view.element.querySelector("[data-streak]")?.textContent).toBe("2");
  view.dispose();
  view.element.remove();
});
