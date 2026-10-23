import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import { generateSudoku } from "./generate";
import {
  createSudokuProgress,
  hasStartedSudoku,
  loadSudokuProgress,
  saveSudokuProgress,
  submitSudokuOnce,
} from "./progress";

describe("Sudoku progress", () => {
  it("restores entered values, pencil marks, mode, and elapsed seconds", () => {
    const storage = new MemoryStorage();
    const { puzzle } = generateSudoku(42, "v1");
    const progress = createSudokuProgress(42, puzzle);
    const empty = progress.values
      .flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => ({ value, rowIndex, columnIndex })),
      )
      .find((cell) => cell.value === 0)!;

    progress.values[empty.rowIndex]![empty.columnIndex] = 7;
    progress.notes[empty.rowIndex]![empty.columnIndex] = 1 << 2;
    progress.pencil = true;
    progress.started = true;
    progress.elapsedSeconds = 83;
    saveSudokuProgress(progress, storage);

    const restored = loadSudokuProgress(42, puzzle, storage);
    expect(restored.values).toEqual(progress.values);
    expect(restored.notes).toEqual(progress.notes);
    expect(restored.pencil).toBe(true);
    expect(restored.elapsedSeconds).toBe(83);
    expect(hasStartedSudoku(42, storage)).toBe(true);
  });

  it("records a completed day exactly once", async () => {
    const storage = new MemoryStorage();
    const { puzzle, solution } = generateSudoku(42, "v1");
    const progress = createSudokuProgress(42, puzzle);
    progress.values = solution;
    progress.elapsedSeconds = 127;
    progress.complete = true;
    progress.submission = "pending";
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source: DataSource = {
      currentDay: async () => 42,
      wordAnswer: async () => "planet",
      dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
      dayBitsRange: async () => [],
      record,
    };

    await submitSudokuOnce(source, progress, storage);
    await submitSudokuOnce(source, progress, storage);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(1, 42, 127, true);
    expect(loadSudokuProgress(42, puzzle, storage).submission).toBe("submitted");
  });
});
