import { afterEach, describe, expect, it, vi } from "vitest";
import { applyGuess } from "./games/word/session";
import type { DataSource, DayBits } from "./shared/data-source";
import { createWordProgress, saveWordProgress } from "./shared/progress";
import { GAME_ROSTER } from "./shared/roster";
import { rosterMask } from "./shared/streaks";
import { greetingFor, headlineFor, renderHome } from "./home";

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

function actions(root: Element): string[] {
  return [...root.querySelectorAll("[data-row-action]")].map(
    (action) => action.textContent?.trim() ?? "",
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("home", () => {
  it("paints six rows with no button and no state text before the day's bits resolve", () => {
    const never = new Promise<number>(() => undefined);
    const view = renderHome(stubSource({ currentDay: () => never }));

    expect(view.element.querySelectorAll("[data-game-row]")).toHaveLength(GAME_ROSTER.length);
    expect(rowIds(view.element, "data-open-games")).toEqual(GAME_ROSTER.map((game) => game.id));
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
        ids.map(() => ({ total: 5, buckets: [{ bucket: 2, count: 3 }, { bucket: 4, count: 2 }] })),
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
    expect(actions(view.element)).toEqual(["Resume", "Save", "Play", "Play"]);

    // A done row: the score in the accent after the name, the percentile sentence below, never Play.
    expect(view.element.querySelector('[data-game-row="word"] [data-row-score]')?.textContent).toBe("· 4 guesses");
    expect(view.element.querySelector('[data-game-row="word"] [data-row-line]')?.textContent).toBe("Top 80% of 5 today");
    // Chess in one attempt is "first try" (the board).
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
    expect(headlineFor(0)).toBe("Six to play.");
    expect(headlineFor(3)).toBe("Three to go.");
    expect(headlineFor(5)).toBe("One to go.");
    expect(headlineFor(6)).toBe("All six done.");
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
    expect(actions(view.element).filter((label) => label === "Play")).toHaveLength(5);
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
      ids.map(() => ({ total: 5, buckets: [{ bucket: 2, count: 5 }] })),
    );
    const source = stubSource({
      dayBits: async () => FULL,
      // Days 0..10: all games on time every day.
      dayBitsRange: async (_from, count) => Array.from({ length: count }, () => FULL),
      histograms,
      details: async (_day, ids) => ids.map(() => ({ score: 2, solved: true })),
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
    // Count games score 2 in the one bucket of five: 20%. Seconds games at 2 s
    // sit in bucket 0, ahead of all five: 17%. Mean of 20, 17, 20, 20, 17.
    expect(view.element.querySelector("[data-day-rank]")?.textContent).toBe("Top 19% today");
    expect(histograms).toHaveBeenCalledTimes(1);
    expect(announced).toEqual([
      { day: DAY, streakAny: 11, streakAll: 11 },
      { day: DAY, dayPercentile: 19 },
    ]);
    window.removeEventListener("daily-day-summary", onSummary);
    view.dispose();
  });
});
