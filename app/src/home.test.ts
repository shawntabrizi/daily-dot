import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGuess } from "./games/word/session";
import type { DataSource, DayBits } from "./shared/data-source";
import { PICKS_KEY, savePicks } from "./shared/picks";
import { createWordProgress, saveWordProgress } from "./shared/progress";
import { GAME_ROSTER } from "./shared/roster";
import { rosterMask } from "./shared/streaks";
import { greetingFor, headlineFor, MORE_OPEN_KEY, renderHome } from "./home";
import { pickSixGames } from "./test/picks";

const MASK = rosterMask(GAME_ROSTER.map((game) => game.gameId));
const FULL: DayBits = { played: MASK, solved: MASK, ontime: MASK };
const EMPTY: DayBits = { played: 0n, solved: 0n, ontime: 0n };
const DAY = 10;

function stubSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => EMPTY,
    dayBitsRange: async () => [],
    record: async () => undefined,
    ...overrides,
  };
}

/** Only the fields `hasStarted` / `finishedUnrecorded` read; the games own the rest. */
function storeProgress(slug: string, fields: Record<string, unknown>): void {
  window.localStorage.setItem(
    `daily-on-dot:${slug}:v1:${DAY}`,
    JSON.stringify({ version: 1, day: DAY, ...fields }),
  );
}

function rowIds(root: Element, group: string): string[] {
  return [...root.querySelectorAll(`[${group}] [data-game-row]`)].map(
    (row) => row.getAttribute("data-game-row"),
  ) as string[];
}

function actions(root: Element, group?: string): string[] {
  return [...root.querySelectorAll(group ? `[${group}] [data-row-action]` : "[data-row-action]")].map(
    (action) => action.textContent?.trim() ?? "",
  );
}

// The six original games picked, except in "home with picks": these tests are about the rows.
beforeEach(() => {
  pickSixGames();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("home", () => {
  it("paints six rows with no button and no state text before the day's bits resolve", () => {
    const never = new Promise<number>(() => undefined);
    const view = renderHome(stubSource({ currentDay: () => never }));

    expect(view.element.querySelectorAll("[data-game-row]")).toHaveLength(GAME_ROSTER.length);
    expect(rowIds(view.element, "data-open-games")).toEqual(GAME_ROSTER.slice(0, 6).map((game) => game.id));
    expect(view.element.querySelector("[data-row-action]")).toBeNull();
    expect(view.element.textContent).not.toContain("Play");
    expect(view.element.querySelector('[data-game-row="sudoku"]')?.getAttribute("href")).toBe("#/g/sudoku");
    expect(view.element.querySelector('[data-game-row="globe"]')?.getAttribute("href")).toBe("#/g/globe");
    expect(view.element.querySelector<HTMLElement>("[data-home-done]")?.hidden).toBe(true);
    expect(view.element.textContent).toContain("New set in");
    expect(view.element.querySelector("[data-home-date]")?.textContent).toMatch(/^[A-Z][a-z]+ \d{1,2} [A-Z][a-z]+$/);
    expect(view.element.querySelector("[data-home-greeting]")?.textContent).toMatch(/^Good (morning|afternoon|evening)\.$/);
    // The card page moved to the drawer: no bottom link on the hub.
    expect(view.element.querySelector(".home-card-link")).toBeNull();
    view.dispose();
  });

  it("orders rows in progress, then open, then the done group, roster order within", async () => {
    storeProgress("sudoku", { started: true, complete: false, elapsedSeconds: 190 });
    storeProgress("mini", { complete: true, submission: "failed" });
    const bits: DayBits = { played: 0b101n, solved: 0b101n, ontime: 0b101n };
    const source = stubSource({
      dayBits: async () => bits,
      histograms: async (_day, ids) =>
        ids.map(() => ({ total: 5, buckets: [{ bucket: 1, count: 3 }, { bucket: 3, count: 2 }] })),
      details: async (_day, ids) => ids.map((id) => ({ score: id === 0 ? 4 : 1, solved: true })),
    });

    const view = renderHome(source);
    await vi.waitFor(() => {
      expect(view.element.querySelector('[data-game-row="word"] [data-row-line]')?.textContent).toContain("Top");
    });

    expect(rowIds(view.element, "data-open-games")).toEqual(["sudoku", "mini", "globe", "connections"]);
    expect(rowIds(view.element, "data-done-games")).toEqual(["word", "chess"]);
    expect(view.element.querySelector<HTMLElement>("[data-home-done]")?.hidden).toBe(false);
    expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("Four to go.");

    // In progress → Resume and "hook · progress"; finished on this device but not saved → Save (never Play), with the save deadline for today's streak.
    expect(view.element.querySelector('[data-game-row="sudoku"] [data-row-action]')?.textContent).toBe("Resume");
    expect(view.element.querySelector('[data-game-row="sudoku"] [data-row-line]')?.textContent).toBe("Fill the grid · about 6 min · 3:10 in");
    expect(view.element.querySelector('[data-game-row="mini"] [data-row-action]')?.textContent).toBe("Save");
    expect(view.element.querySelector('[data-game-row="mini"] [data-row-line]')?.textContent).toBe("Not saved yet · save by 00:00 UTC");
    expect(view.element.querySelector('[data-game-row="globe"] [data-row-action]')?.textContent).toBe("Play");
    expect(actions(view.element, "data-open-games")).toEqual(["Resume", "Save", "Play", "Play"]);

    // A done row: the score in the accent after the name, the percentile sentence below, never Play.
    expect(view.element.querySelector('[data-game-row="word"] [data-row-score]')?.textContent).toBe("· 4 guesses");
    expect(view.element.querySelector('[data-game-row="word"] [data-row-line]')?.textContent).toBe("Top 80% of 5 today");
    // Chess in one move is "first try" (the board).
    expect(view.element.querySelector('[data-game-row="chess"] [data-row-score]')?.textContent).toBe("· first try");
    expect(view.element.querySelector('[data-game-row="chess"] [data-row-line]')?.textContent).toBe("Top 17% of 5 today");
    expect(view.element.querySelector("[data-done-games] [data-row-action]")).toBeNull();
    // Every done row has the same shape: no game gets extra marks on the right.
    expect(view.element.querySelector("[data-done-games] .game-row-squares")).toBeNull();

    // The bar: six segments, the done ones marked per game.
    const segments = view.element.querySelectorAll("[data-day-bar] [data-segment]");
    expect(segments).toHaveLength(6);
    expect([...segments].map((segment) => segment.getAttribute("data-done")))
      .toEqual(["true", "false", "true", "false", "false", "false"]);
    expect(view.element.querySelector<HTMLElement>("[data-home-day-summary]")?.hidden).toBe(true);
    view.dispose();
  });

  it("shows the score alone when the source has no histograms", async () => {
    const view = renderHome(
      stubSource({
        dayBits: async () => ({ played: 1n, solved: 1n, ontime: 1n }),
        details: async (_day, ids) => ids.map(() => ({ score: 3, solved: true })),
      }),
    );
    await vi.waitFor(() => {
      expect(view.element.querySelector('[data-game-row="word"] [data-row-score]')?.textContent).toBe("· 3 guesses");
    });
    expect(view.element.querySelector('[data-game-row="word"] [data-row-line]')?.textContent).toBe("");
    view.dispose();
  });

  it("states the day in the headline", () => {
    expect(headlineFor(0, 6)).toBe("Six to play.");
    expect(headlineFor(3, 6)).toBe("Three to go.");
    expect(headlineFor(5, 6)).toBe("One to go.");
    expect(headlineFor(6, 6)).toBe("All six done.");
    expect(headlineFor(0, 8)).toBe("Eight to play.");
    expect(headlineFor(3, 3)).toBe("All three done.");
    expect(headlineFor(2, 2)).toBe("Both done.");
    expect(headlineFor(1, 1)).toBe("All done.");
    expect(headlineFor(0, 1)).toBe("One to play.");
  });

  it("greets by the local clock: 05–12 morning, 12–18 afternoon, else evening", () => {
    expect(greetingFor(5)).toBe("Good morning.");
    expect(greetingFor(11)).toBe("Good morning.");
    expect(greetingFor(12)).toBe("Good afternoon.");
    expect(greetingFor(17)).toBe("Good afternoon.");
    expect(greetingFor(18)).toBe("Good evening.");
    expect(greetingFor(4)).toBe("Good evening.");
  });

  it("shows Resume for a Word with guesses and Play once nothing is stored", async () => {
    saveWordProgress(applyGuess(createWordProgress(DAY), "planet", "garden"), window.localStorage);
    const view = renderHome(stubSource());
    await vi.waitFor(() => {
      expect(view.element.querySelector('[data-game-row="word"] [data-row-action]')?.textContent).toBe("Resume");
    });
    expect(view.element.querySelector('[data-game-row="word"] [data-row-line]')?.textContent)
      .toBe("Six letters, fewest guesses · 1 guess in");
    expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("Six to play.");
    expect(rowIds(view.element, "data-open-games")[0]).toBe("word");
    expect(actions(view.element, "data-open-games").filter((label) => label === "Play")).toHaveLength(5);
    view.dispose();
  });

  it("shows a loading headline, not a guessed count, until the day is read", async () => {
    let resolveBits: (bits: { played: bigint; solved: bigint; ontime: bigint }) => void = () => undefined;
    const dayBits = vi.fn(
      () => new Promise<{ played: bigint; solved: bigint; ontime: bigint }>((resolve) => {
        resolveBits = resolve;
      }),
    );
    const view = renderHome(stubSource({ dayBits }), DAY - 3);
    const headline = view.element.querySelector<HTMLElement>("[data-home-headline]")!;

    expect(headline.textContent).toBe("Loading…");
    expect(headline.hasAttribute("data-loading")).toBe(true);
    await vi.waitFor(() => {
      expect(dayBits).toHaveBeenCalled();
    });
    expect(headline.textContent).toBe("Loading…");

    resolveBits({ played: 3n, solved: 3n, ontime: 3n });
    await vi.waitFor(() => {
      expect(headline.textContent).toBe("Four to go.");
    });
    expect(headline.hasAttribute("data-loading")).toBe(false);
    view.dispose();
  });

  it("keeps the rows and offers a retry after a failed read", async () => {
    const currentDay = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("endpoint dropped"))
      .mockResolvedValue(DAY);
    const dayBits = vi.fn(async () => ({ played: 1n, solved: 1n, ontime: 1n }));
    const view = renderHome(stubSource({ currentDay, dayBits }));

    await vi.waitFor(() => {
      expect(view.element.querySelector<HTMLElement>("[data-home-read-error]")?.hidden).toBe(false);
    });
    expect(view.element.querySelectorAll("[data-game-row]")).toHaveLength(GAME_ROSTER.length);
    expect(view.element.querySelector("[data-row-action]")).toBeNull();
    // A failed read shows no count rather than a guessed one.
    expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("Six games.");

    view.element.querySelector<HTMLButtonElement>("[data-home-read-error] button")?.click();
    await vi.waitFor(() => {
      expect(view.element.querySelector<HTMLElement>("[data-home-read-error]")?.hidden).toBe(true);
      expect(rowIds(view.element, "data-done-games")).toEqual(["word"]);
    });
    expect(currentDay).toHaveBeenCalledTimes(2);
    expect(dayBits).toHaveBeenCalledWith(DAY);
    view.dispose();
  });

  it("puts the day summary below the bar and announces the streaks at 6/6", async () => {
    const histograms = vi.fn(async (_day: number, ids: readonly number[]) =>
      ids.map(() => ({ total: 5, buckets: [{ bucket: 1, count: 5 }] })),
    );
    const source = stubSource({
      dayBits: async () => FULL,
      // Days 0..10: all games on time every day.
      dayBitsRange: async (_from, count) => Array.from({ length: count }, () => FULL),
      histograms,
      // Color and Sound (gameIds 8, 9) score points, higher better: 0.7 points is their bucket 1.
      // Connections (gameId 5) buckets from 0 mistakes, so 1 mistake is its bucket 1.
      details: async (_day, ids) =>
        ids.map((id) => ({ score: id === 8 || id === 9 ? 7 : id === 5 ? 1 : 2, solved: true })),
    });
    const announced: unknown[] = [];
    const onSummary = (event: Event): void => {
      announced.push((event as CustomEvent).detail);
    };
    window.addEventListener("daily-day-summary", onSummary);

    const view = renderHome(source);
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-day-summary]")).not.toBeNull();
    });
    expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("All six done.");
    // The bar stays, all six segments lit; the summary follows it.
    expect(view.element.querySelector<HTMLElement>("[data-day-bar]")?.hidden).toBe(false);
    expect(view.element.querySelectorAll('[data-day-bar] [data-done="true"]')).toHaveLength(6);
    expect(
      view.element.querySelector("[data-day-bar]")?.compareDocumentPosition(
        view.element.querySelector("[data-day-summary]")!,
      ) && Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(rowIds(view.element, "data-open-games")).toEqual([]);
    expect(rowIds(view.element, "data-done-games")).toEqual(GAME_ROSTER.map((game) => game.id));
    expect(view.element.textContent).not.toContain("Play");
    // Count games score 2 (bucket 1), tied with all five: 20%, and so do Color's and
    // Sound's 0.7 points. Seconds games at 2 s sit in bucket 0, ahead of all five: 17%.
    // Mean of eight 20s and two 17s.
    expect(view.element.querySelector("[data-day-rank]")?.textContent).toBe("Top 19% today");
    expect(histograms).toHaveBeenCalledTimes(1);
    expect(announced).toEqual([
      { day: DAY, streakAny: 11 },
      { day: DAY, dayPercentile: 19 },
    ]);
    window.removeEventListener("daily-day-summary", onSummary);
    view.dispose();
  });
});

describe("home with picks (D21)", () => {
  const bit = (gameId: number): bigint => 1n << BigInt(gameId);
  const moreToggle = (root: Element) => root.querySelector<HTMLButtonElement>("[data-more-toggle]")!;
  const moreRows = (root: Element) => root.querySelector<HTMLElement>("[data-more-games]")!;

  it("leads a fresh device with the starter games and keeps the rest under a closed More games", async () => {
    window.localStorage.removeItem(PICKS_KEY);
    const view = renderHome(stubSource());
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("Four to play.");
    });

    expect(rowIds(view.element, "data-open-games")).toEqual(["word", "mini", "connections", "code"]);
    expect(rowIds(view.element, "data-more-games")).toEqual(["sudoku", "chess", "globe", "angle", "color", "sound"]);
    expect(view.element.querySelector<HTMLElement>("[data-home-more]")?.hidden).toBe(false);
    expect(moreToggle(view.element).getAttribute("aria-expanded")).toBe("false");
    expect(moreRows(view.element).hidden).toBe(true);
    expect(view.element.querySelector("[data-more-count]")?.textContent).toBe("6");
    // The bar has a segment per pick only.
    expect(
      [...view.element.querySelectorAll("[data-day-bar] [data-segment]")].map((segment) =>
        segment.getAttribute("data-segment"),
      ),
    ).toEqual(["word", "mini", "connections", "code"]);
    // The unpicked games stay playable from the hub.
    expect(view.element.querySelector('[data-more-games] [data-game-row="globe"]')?.getAttribute("href")).toBe("#/g/globe");
    view.dispose();
  });

  it("opens More games on a tap and remembers it on this device", async () => {
    savePicks([0]);
    const view = renderHome(stubSource());
    moreToggle(view.element).click();
    expect(moreRows(view.element).hidden).toBe(false);
    expect(moreToggle(view.element).getAttribute("aria-expanded")).toBe("true");
    expect(window.localStorage.getItem(MORE_OPEN_KEY)).toBe("1");
    view.dispose();

    const again = renderHome(stubSource());
    expect(moreRows(again.element).hidden).toBe(false);
    moreToggle(again.element).click();
    expect(moreRows(again.element).hidden).toBe(true);
    expect(window.localStorage.getItem(MORE_OPEN_KEY)).toBeNull();
    again.dispose();
  });

  it("has no More games when every game is picked", async () => {
    savePicks(GAME_ROSTER.map((game) => game.gameId));
    const view = renderHome(stubSource());
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("Ten to play.");
    });
    expect(view.element.querySelector<HTMLElement>("[data-home-more]")?.hidden).toBe(true);
    view.dispose();
  });

  it("moves a finished unpicked game to Done without counting it toward the picks", async () => {
    savePicks([0, 4]);
    const view = renderHome(stubSource({
      dayBits: async () => ({ played: bit(0) | bit(3), solved: bit(0) | bit(3), ontime: bit(0) | bit(3) }),
    }));
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("One to go.");
    });
    expect(rowIds(view.element, "data-open-games")).toEqual(["mini"]);
    expect(rowIds(view.element, "data-done-games")).toEqual(["word", "globe"]);
    expect(rowIds(view.element, "data-more-games")).toEqual(["sudoku", "chess", "connections", "code", "angle", "color", "sound"]);
    expect(view.element.querySelector("[data-day-bar]")?.getAttribute("aria-label")).toBe("Today: 1 of 2 done");
    view.dispose();
  });

  it("calls the day done once every pick is in, with other games still open", async () => {
    savePicks([0, 4]);
    const both = bit(0) | bit(4);
    const view = renderHome(stubSource({
      dayBits: async () => ({ played: both, solved: both, ontime: both }),
      dayBitsRange: async (_from, count) =>
        Array.from({ length: count }, () => ({ played: both, solved: both, ontime: both })),
      histograms: async (_day, ids) => ids.map(() => ({ total: 5, buckets: [{ bucket: 2, count: 5 }] })),
      details: async (_day, ids) => ids.map(() => ({ score: 2, solved: true })),
    }));
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-day-summary]")).not.toBeNull();
    });
    expect(view.element.querySelector("[data-home-headline]")?.textContent).toBe("Both done.");
    expect(rowIds(view.element, "data-more-games")).toEqual(["sudoku", "chess", "globe", "connections", "code", "angle", "color", "sound"]);
    view.dispose();
  });
});
