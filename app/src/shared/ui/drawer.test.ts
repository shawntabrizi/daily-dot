import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSource, DayBits } from "../data-source";
import { savePicks } from "../picks";
import { pickSixGames } from "../../test/picks";
import { createDrawer } from "./drawer";

beforeEach(() => {
  pickSixGames();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("drawer", () => {
  it("renders completion checks and a bounded connected activity run", async () => {
    const playedDays = new Set([31, 32, 33, 34, 37, 39, 40]);
    const dayBitsRange = vi.fn(async (from: number, count: number) =>
      Array.from({ length: count }, (_, offset): DayBits => {
        const day = from + offset;
        return {
          played: playedDays.has(day) ? (day === 40 ? 5n : 1n) : 0n,
          solved: 0n,
          ontime: 0n,
        };
      }),
    );
    const source: DataSource = {
      currentDay: async () => 40,
      wordAnswer: async () => "planet",
      dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
      dayBitsRange,
      record: async () => undefined,
    };

    const drawer = createDrawer(source);
    document.body.append(drawer.element);
    drawer.open();

    await vi.waitFor(() => {
      expect(
        drawer.element.querySelector("[data-activity-label]")?.textContent,
      ).toBe("FEBRUARY ACTIVITY");
    });

    expect(dayBitsRange).toHaveBeenCalledWith(11, 30);
    expect(drawer.element.querySelectorAll(".activity-day")).toHaveLength(13);
    expect(
      drawer.element.querySelector(".activity-day:last-child")?.textContent,
    ).toBe("10");
    // A past day is a way back into that day's games: each circle opens its day page.
    expect(
      drawer.element.querySelector(".activity-day:last-child")?.getAttribute("href"),
    ).toBe("#/day?day=40");
    expect(
      drawer.element.querySelectorAll(".activity-connector--played"),
    ).toHaveLength(4);
    expect(
      drawer.element.querySelector<HTMLElement>(
        '[data-drawer-game-check="word"]',
      )?.hidden,
    ).toBe(false);
    expect(
      drawer.element.querySelector<HTMLElement>(
        '[data-drawer-game-check="sudoku"]',
      )?.hidden,
    ).toBe(true);
    expect(
      drawer.element.querySelector<HTMLElement>(
        '[data-drawer-game-check="chess"]',
      )?.hidden,
    ).toBe(false);
    expect(
      drawer.element.querySelector<HTMLElement>(
        '[data-drawer-game-check="globe"]',
      )?.hidden,
    ).toBe(true);
    expect(
      drawer.element.querySelector("[data-drawer-countdown]")?.textContent,
    ).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(drawer.element.textContent).toContain(
      "Play a game to keep the streak alive!",
    );

    drawer.close();
    drawer.element.remove();
  });

  it("colours a day blue when every picked game is finished, on time or later", async () => {
    // Picks: Word (0) and Mini (4).
    savePicks([0, 4]);
    const picks = (1n << 0n) | (1n << 4n);
    const globe = 1n << 3n;
    // 38: both picks on time (blue). 39: both, Mini late (still blue).
    // 37: Word only (gold). 40: Globe only, not a pick (gold, never blue).
    const bitsFor = (day: number): DayBits => {
      if (day === 38) {
        return { played: picks, solved: picks, ontime: picks };
      }
      if (day === 39) {
        return { played: picks, solved: picks, ontime: 1n };
      }
      if (day === 37) {
        return { played: 1n, solved: 1n, ontime: 1n };
      }
      if (day === 40) {
        return { played: globe, solved: globe, ontime: globe };
      }
      return { played: 0n, solved: 0n, ontime: 0n };
    };
    const source: DataSource = {
      currentDay: async () => 40,
      wordAnswer: async () => "planet",
      dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
      dayBitsRange: async (from: number, count: number) =>
        Array.from({ length: count }, (_, offset) => bitsFor(from + offset)),
      record: async () => undefined,
    };

    const drawer = createDrawer(source);
    document.body.append(drawer.element);
    drawer.open();
    await vi.waitFor(() => {
      expect(drawer.element.querySelector(".activity-track")).not.toBeNull();
    });

    const dayClass = (day: number): string =>
      [...drawer.element.querySelector<HTMLElement>(`[href="#/day?day=${day}"]`)!.classList]
        .find((name) => name.startsWith("activity-day--") && name !== "activity-day--today")!;
    expect(dayClass(37)).toBe("activity-day--played");
    expect(dayClass(38)).toBe("activity-day--complete");
    expect(dayClass(39)).toBe("activity-day--complete");
    expect(dayClass(40)).toBe("activity-day--played");
    expect(
      drawer.element.querySelector(`[href="#/day?day=38"]`)?.getAttribute("aria-label"),
    ).toContain("all your games finished");
    // Blue joins blue; a blue day next to a gold one keeps the gold link.
    expect(drawer.element.querySelectorAll(".activity-connector--complete")).toHaveLength(1);
    expect(drawer.element.querySelectorAll(".activity-connector--played")).toHaveLength(2);
    drawer.close();

    // Picking Globe re-reads every day against the new picks: 38 and 39 turn gold.
    savePicks([0, 3, 4]);
    drawer.open();
    await vi.waitFor(() => {
      expect(dayClass(38)).toBe("activity-day--played");
    });
    expect(dayClass(39)).toBe("activity-day--played");
    drawer.close();
    drawer.element.remove();
  });

  it("lists the picked games only, with a Customize link, and redraws them on each open", async () => {
    savePicks([0, 5]);
    const source: DataSource = {
      currentDay: async () => 40,
      wordAnswer: async () => "planet",
      dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
      dayBitsRange: async (_from, count) =>
        Array.from({ length: count }, () => ({ played: 1n, solved: 1n, ontime: 1n })),
      record: async () => undefined,
    };
    const drawer = createDrawer(source);
    document.body.append(drawer.element);
    drawer.open();
    const games = (): string[] =>
      [...drawer.element.querySelectorAll<HTMLAnchorElement>(".drawer-game-link")].map((link) =>
        link.getAttribute("href")!,
      );
    expect(games()).toEqual(["#/g/word", "#/g/connections"]);
    expect(drawer.element.querySelector(".drawer-customize")?.getAttribute("href")).toBe("#/customize");
    await vi.waitFor(() => {
      expect(drawer.element.querySelector<HTMLElement>('[data-drawer-game-check="word"]')?.hidden).toBe(false);
    });
    drawer.close();

    savePicks([2]);
    drawer.open();
    expect(games()).toEqual(["#/g/chess"]);
    drawer.close();
    drawer.element.remove();
  });

  it("offers an in-place retry when activity cannot be read", async () => {
    const currentDay = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("offline"))
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

    const drawer = createDrawer(source);
    document.body.append(drawer.element);
    drawer.open();
    await vi.waitFor(() => {
      expect(drawer.element.textContent).toContain("Activity unavailable.");
    });

    drawer.element.querySelector<HTMLButtonElement>(".read-retry")?.click();
    await vi.waitFor(() => {
      expect(drawer.element.querySelector(".activity-track")).not.toBeNull();
    });
    expect(currentDay).toHaveBeenCalledTimes(2);
    drawer.close();
    drawer.element.remove();
  });
});
