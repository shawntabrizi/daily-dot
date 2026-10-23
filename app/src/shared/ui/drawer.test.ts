import { describe, expect, it, vi } from "vitest";
import type { DataSource, DayBits } from "../data-source";
import { createDrawer } from "./drawer";

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

  it("colours a day blue only when every game was finished on the day itself", async () => {
    const all = (1n << 6n) - 1n;
    // 38 and 39: every game on time (blue). 37: every game, but one late (gold).
    // 40: one game (gold).
    const bitsFor = (day: number): DayBits => {
      if (day === 38 || day === 39) {
        return { played: all, solved: all, ontime: all };
      }
      if (day === 37) {
        return { played: all, solved: all, ontime: all & ~1n };
      }
      if (day === 40) {
        return { played: 1n, solved: 1n, ontime: 1n };
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
    ).toContain("every game finished");
    // Blue joins blue; a blue day next to a gold one keeps the gold link.
    expect(drawer.element.querySelectorAll(".activity-connector--complete")).toHaveLength(1);
    expect(drawer.element.querySelectorAll(".activity-connector--played")).toHaveLength(2);
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
