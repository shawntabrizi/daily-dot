import { afterEach, describe, expect, it, vi } from "vitest";
import { headerTitle } from "../../shared/ui/header";

import type { DataSource } from "../../shared/data-source";
import { generateSudoku } from "./generate";
import {
  loadSudokuProgress,
  saveSudokuProgress,
} from "./progress";
import { renderSudoku, sudokuConflicts } from "./view";

function sourceFor(
  day: number,
  played = 0n,
  record: DataSource["record"] = async () => undefined,
): DataSource {
  return {
    currentDay: async () => day,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
    histogram: async () => ({ total: 3, buckets: [{ bucket: 1, count: 3 }] }),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("Sudoku view", () => {
  it("renders distinct immutable givens and restores a mid-puzzle reload", async () => {
    const day = 208;
    const { puzzle } = generateSudoku(day, "v1");
    const emptyIndex = puzzle.flat().findIndex((value) => value === 0);
    const row = Math.floor(emptyIndex / 9);
    const column = emptyIndex % 9;
    const source = sourceFor(day);
    const first = renderSudoku(source, day);
    document.body.append(first.element);

    await vi.waitFor(() => {
      expect(first.element.querySelectorAll(".sudoku-cell")).toHaveLength(81);
    });
    expect(first.element.querySelectorAll(".sudoku-cell--given")).toHaveLength(30);
    expect(
      first.element.querySelectorAll(".sudoku-cell--given.sudoku-cell--entered"),
    ).toHaveLength(0);
    const firstGivenIndex = puzzle.flat().findIndex((value) => value !== 0);
    const givenRow = Math.floor(firstGivenIndex / 9);
    const givenColumn = firstGivenIndex % 9;
    const givenValue = puzzle[givenRow]?.[givenColumn];
    first.element
      .querySelector<HTMLButtonElement>(
        `[data-sudoku-cell="${givenRow}:${givenColumn}"]`,
      )
      ?.click();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: givenValue === 9 ? "1" : "9" }),
    );
    expect(
      first.element.querySelector(
        `[data-sudoku-cell="${givenRow}:${givenColumn}"]`,
      )?.textContent,
    ).toBe(String(givenValue));

    first.element.querySelector<HTMLButtonElement>("[data-pencil]")?.click();
    first.element
      .querySelector<HTMLButtonElement>(`[data-sudoku-cell="${row}:${column}"]`)
      ?.click();
    first.element
      .querySelector<HTMLButtonElement>('[data-sudoku-number="3"]')
      ?.click();
    first.dispose();
    first.element.remove();

    const stored = loadSudokuProgress(day, puzzle);
    stored.elapsedSeconds = 37;
    saveSudokuProgress(stored);

    const reloaded = renderSudoku(source, day);
    document.body.append(reloaded.element);
    await vi.waitFor(() => {
      expect(reloaded.element.querySelector(".sudoku-grid")).not.toBeNull();
    });

    expect(
      reloaded.element.querySelector<HTMLButtonElement>("[data-pencil]")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      reloaded.element.querySelector(
        `[data-sudoku-cell="${row}:${column}"] .sudoku-notes`,
      )?.textContent,
    ).toContain("3");
    expect(
      reloaded.element.querySelector("[data-sudoku-timer]")?.textContent,
    ).toBe("00:37");
    reloaded.dispose();
  });

  it("supports physical numbers and arrow navigation while highlighting conflicts", async () => {
    const view = renderSudoku(sourceFor(208), 208);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".sudoku-grid")).not.toBeNull();
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));

    const left = view.element.querySelector('[data-sudoku-cell="0:0"]');
    const right = view.element.querySelector('[data-sudoku-cell="0:1"]');
    expect(left?.textContent).toBe("5");
    expect(right?.textContent).toBe("5");
    expect(left?.classList.contains("sudoku-cell--conflict")).toBe(true);
    expect(right?.classList.contains("sudoku-cell--conflict")).toBe(true);
    expect(view.element.textContent).toContain("cells conflict");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(
      view.element.querySelector('[data-sudoku-cell="0:1"]')?.textContent,
    ).toBe("");
    expect(
      view.element
        .querySelector('[data-sudoku-cell="0:0"]')
        ?.classList.contains("sudoku-cell--conflict"),
    ).toBe(false);
    view.dispose();
  });

  it("detects duplicates independently in rows, columns, and boxes", () => {
    const values = Array.from({ length: 9 }, () => Array<number>(9).fill(0));
    values[0]![0] = 1;
    values[0]![8] = 1;
    values[8]![0] = 1;
    values[3]![3] = 2;
    values[4]![4] = 2;

    expect([...sudokuConflicts(values)].sort()).toEqual(
      ["0:0", "0:8", "3:3", "4:4", "8:0"].sort(),
    );
  });

  it("records exactly one gameId 1 completion with elapsed seconds", async () => {
    const day = 208;
    const { puzzle, solution } = generateSudoku(day, "v1");
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderSudoku(sourceFor(day, 0n, record), day);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".sudoku-grid")).not.toBeNull();
    });

    for (let row = 0; row < 9; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        if (puzzle[row]?.[column] !== 0) {
          continue;
        }
        view.element
          .querySelector<HTMLButtonElement>(
            `[data-sudoku-cell="${row}:${column}"]`,
          )
          ?.click();
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: String(solution[row]?.[column]),
          }),
        );
      }
    }

    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(1, day, expect.any(Number), true);
    // Solved in under 15 s in jsdom: bucket 0, ahead of three finishers at 0:15.
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("25%");
    });
    expect(view.element.querySelector("[data-distribution-total]")?.textContent).toBe("4 finished today");
    await vi.waitFor(() => {
      expect(view.element.querySelector(".game-heading")?.hasAttribute("hidden")).toBe(true);
    });
    expect(view.element.querySelector("[data-distribution]")?.getAttribute("aria-label")).toBe("4 finishers today by minutes");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "9" }));
    expect(record).toHaveBeenCalledOnce();
    view.dispose();
  });

  it("reopens a day finished on this device with its result, from the local copy", async () => {
    // The chain says the day is recorded; the local copy says it was solved here.
    const day = 208;
    const { solution } = generateSudoku(day, "v1");
    const stored = loadSudokuProgress(day, generateSudoku(day, "v1").puzzle);
    stored.values = solution.map((row) => [...row]);
    stored.complete = true;
    stored.submission = "submitted";
    stored.elapsedSeconds = 95;
    saveSudokuProgress(stored);
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderSudoku(sourceFor(day, 1n << 1n, record), day);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-headline]")).not.toBeNull();
    });
    expect(view.element.textContent).not.toContain("You already played this");
    // The Result board state: the page scrolls as one, so the stats are never cut off.
    expect(view.element.classList.contains("page--result")).toBe(true);
    expect(record).not.toHaveBeenCalled();
    view.dispose();
  });

  it("opens a recorded archive day read-only without attempting another write", async () => {
    const record = vi.fn<DataSource["record"]>(async () => {
      throw new Error("record must not be called");
    });
    const view = renderSudoku(sourceFor(208, 1n << 1n, record), 100);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("You already played this");
    });

    expect(headerTitle()).toBe("Sudoku · Day 100");
    expect(view.element.querySelectorAll(".sudoku-cell")).toHaveLength(81);
    expect(view.element.querySelectorAll(".sudoku-cell:disabled")).toHaveLength(81);
    expect(view.element.querySelector(".sudoku-pad")).toBeNull();
    expect(record).not.toHaveBeenCalled();
    view.dispose();
  });

  it("carries data-game, names the game on <html>, and ends with the rule line", async () => {
    const view = renderSudoku(sourceFor(208), 208);
    document.body.append(view.element);
    expect(view.element.dataset.game).toBe("sudoku");
    // The header reads the open game from <html> (decision 9); dispose clears it.
    expect(document.documentElement.dataset.game).toBe("sudoku");
    await vi.waitFor(() => {
      expect(view.element.querySelector(".sudoku-cell")).not.toBeNull();
    });
    const rule = view.element.querySelector<HTMLElement>(".game-rule");
    expect(rule?.hidden).toBe(false);
    expect(rule?.querySelector("svg")).not.toBeNull();
    expect(view.element.lastElementChild).toBe(rule);
    view.dispose();
    expect(document.documentElement.dataset.game).toBeUndefined();
    view.element.remove();
  });
});
