import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderDayPage } from "./day-page";
import type { DataSource } from "./shared/data-source";
import { dateFromDayIndex } from "./shared/day";
import { GAME_ROSTER, gameById } from "./shared/roster";
import { pickSixGames } from "./test/picks";

vi.mock("./shared/day-summary", () => ({
  dayComplete: () => false,
  loadDaySummary: async () => ({ games: [], complete: false, dayPercentile: null }),
  loadHubStreaks: async () => ({ any: 0, all: 0 }),
  renderDaySummary: () => document.createElement("div"),
}));

const TODAY = 50;
const chess = gameById("chess")!;

function sourceOn(today = TODAY): DataSource {
  return {
    currentDay: async () => today,
    dayBits: async () => ({ played: 1n << BigInt(chess.gameId), solved: 0n, ontime: 0n }),
  } as unknown as DataSource;
}

describe("day page (a past day's hub)", () => {
  beforeEach(() => {
    pickSixGames();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(dateFromDayIndex(TODAY).getTime() + 12 * 3_600_000));
  });
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("shows the home rows for that day, each opening that day's puzzle, so any past day can be played out", async () => {
    const view = renderDayPage(sourceOn(), 42);
    await vi.waitFor(() => {
      expect(view.element.querySelector('[data-done-games] [data-game-row="chess"]')).not.toBeNull();
    });
    const rows = [...view.element.querySelectorAll<HTMLAnchorElement>("[data-game-row]")];
    expect(rows).toHaveLength(GAME_ROSTER.length);
    for (const row of rows) {
      expect(row.getAttribute("href")).toBe(`${gameById(row.dataset.gameRow!)!.route}?day=42`);
    }
    // The day's own count, not today's: one of six done leaves five.
    expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("Five to go.");
    expect(view.element.querySelector(".home-done-heading")?.textContent).toBe("Done that day");
    // Late plays never feed the streak; the page says so.
    expect(view.element.querySelector(".past-note")?.textContent).toBe(
      "Past days fill your calendar, not your streak.",
    );
    // No greeting and no countdown: those belong to today.
    expect(view.element.querySelector("[data-countdown]")).toBeNull();
    expect(view.element.querySelector("[data-home-greeting]")).toBeNull();
    view.dispose();
  });

  it("steps one day back and forward; › from yesterday is today's hub and there is no ‹ before day 0", () => {
    const steps = (day: number) => {
      const view = renderDayPage(sourceOn(), day);
      const href = (kind: string) =>
        view.element.querySelector(`[data-day-step="${kind}"]`)?.getAttribute("href") ?? null;
      const result = { back: href("back"), forward: href("forward") };
      view.dispose();
      return result;
    };
    expect(steps(42)).toEqual({ back: "#/day?day=41", forward: "#/day?day=43" });
    expect(steps(TODAY - 1)).toEqual({ back: `#/day?day=${TODAY - 2}`, forward: "#/" });
    expect(steps(0)).toEqual({ back: null, forward: "#/day?day=1" });
    const view = renderDayPage(sourceOn(), 42);
    expect(view.element.querySelector(".today-chip")?.getAttribute("href")).toBe("#/");
    view.dispose();
  });

  it("sends today to the live hub, so there is one page per day", async () => {
    window.location.hash = `#/day?day=${TODAY}`;
    const view = renderDayPage(sourceOn(), TODAY);
    await vi.waitFor(() => {
      expect(window.location.hash).toBe("#/");
    });
    view.dispose();
  });
});
