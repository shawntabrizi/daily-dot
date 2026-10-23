import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../test/memory-storage";
import { GAME_ROSTER } from "./roster";
import {
  applyOpponentReply,
  applyPlayerAttempt,
  createChessProgress,
  saveChessProgress,
} from "../games/chess/progress";
import { colorAnswer } from "../games/color/generate";
import { applyColorGuess, createColorProgress, saveColorProgress } from "../games/color/progress";
import { GLOBE_COUNTRIES, globeAnswer } from "../games/globe/generate";
import {
  applyGlobeGuess,
  createGlobeProgress,
  saveGlobeProgress,
} from "../games/globe/progress";
import { generateSudoku } from "../games/sudoku/generate";
import {
  createSudokuProgress,
  saveSudokuProgress,
} from "../games/sudoku/progress";
import { applyGuess } from "../games/word/session";
import {
  createWordProgress,
  finishedUnrecorded,
  hasStarted,
  loadWordProgress,
  progressLine,
  saveWordProgress,
} from "./progress";

describe("Word progress", () => {
  it("restores an unfinished word after reload", () => {
    const storage = new MemoryStorage();
    const progress = applyGuess(createWordProgress(42), "planet", "garden");
    saveWordProgress(progress, storage);

    const restored = loadWordProgress(42, storage);
    expect(restored.guesses).toEqual(progress.guesses);
    expect(restored.complete).toBe(false);
    expect(hasStarted(0, 42, storage)).toBe(true);
  });

  it("starts fresh from a stored shape it does not recognise: no migration", () => {
    // The pre-launch version 1 blob (a ladder of tiers) under the same key.
    const storage = new MemoryStorage();
    storage.setItem(
      "daily-on-dot:word:v1:42",
      JSON.stringify({
        version: 1,
        day: 42,
        activeTier: 2,
        tierState: "solved",
        guesses: [[], [], [{ word: "planet", scores: Array(6).fill("correct") }], [], []],
        solvedTiers: 1,
        complete: true,
        submission: "submitted",
      }),
    );

    const restored = loadWordProgress(42, storage);
    expect(restored).toEqual(createWordProgress(42));
    expect(hasStarted(0, 42, storage)).toBe(false);
  });

  it("reports an unfinished Sudoku grid to archive history", () => {
    const storage = new MemoryStorage();
    const { puzzle } = generateSudoku(42, "v1");
    const progress = createSudokuProgress(42, puzzle);
    progress.started = true;
    saveSudokuProgress(progress, storage);

    expect(hasStarted(1, 42, storage)).toBe(true);
    progress.complete = true;
    saveSudokuProgress(progress, storage);
    expect(hasStarted(1, 42, storage)).toBe(false);
  });

  it("reports an attempted Chess puzzle to archive history", () => {
    const storage = new MemoryStorage();
    const puzzle = {
      fen: "5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22",
      moves: "d1e2 d4b2 e2d3 b2c1",
    };
    let progress = createChessProgress(208, puzzle);
    progress = applyOpponentReply(progress, puzzle);
    progress = applyPlayerAttempt(progress, puzzle, "d4c5").progress;
    saveChessProgress(progress, storage);

    expect(hasStarted(2, 208, storage)).toBe(true);
    progress.complete = true;
    saveChessProgress(progress, storage);
    expect(hasStarted(2, 208, storage)).toBe(false);
  });

  it("reports an unfinished Globe guess list to archive history", () => {
    const storage = new MemoryStorage();
    const answer = globeAnswer(208, "v1");
    const wrong = GLOBE_COUNTRIES.find(
      (country) => country.iso !== answer.iso,
    )!;
    const result = applyGlobeGuess(
      createGlobeProgress(208, answer),
      wrong.name,
    );
    if (!result.accepted) {
      throw new Error(result.message);
    }
    saveGlobeProgress(result.progress, storage);

    expect(hasStarted(3, 208, storage)).toBe(true);
    const solved = applyGlobeGuess(result.progress, answer.name);
    if (!solved.accepted) {
      throw new Error(solved.message);
    }
    saveGlobeProgress(solved.progress, storage);
    expect(hasStarted(3, 208, storage)).toBe(false);
  });
});

describe("finishedUnrecorded", () => {
  it("is false for an unplayed, an unfinished and a submitted day", () => {
    const storage = new MemoryStorage();
    expect(finishedUnrecorded(0, 10, storage)).toBe(false);

    const started = applyGuess(createWordProgress(10), "planet", "garden");
    saveWordProgress(started, storage);
    expect(finishedUnrecorded(0, 10, storage)).toBe(false);

    const solved = applyGuess(started, "planet", "planet");
    saveWordProgress({ ...solved, submission: "submitted" }, storage);
    expect(finishedUnrecorded(0, 10, storage)).toBe(false);
  });

  it("is true when the day is complete and the record failed or was deferred", () => {
    const storage = new MemoryStorage();
    const solved = applyGuess(createWordProgress(10), "planet", "planet");
    saveWordProgress({ ...solved, submission: "failed" }, storage);
    expect(finishedUnrecorded(0, 10, storage)).toBe(true);
    // Another day's record says nothing about this one.
    expect(finishedUnrecorded(0, 11, storage)).toBe(false);

    const sudoku = createSudokuProgress(10, generateSudoku(10, "v1").puzzle);
    saveSudokuProgress({ ...sudoku, complete: true, submission: "deferred" }, storage);
    expect(finishedUnrecorded(1, 10, storage)).toBe(true);
  });
});

describe("progressLine", () => {
  const game = (id: string) => GAME_ROSTER.find((entry) => entry.id === id)!;
  const stored = (storage: MemoryStorage, slug: string, fields: Record<string, unknown>) =>
    storage.setItem(`daily-on-dot:${slug}:v1:42`, JSON.stringify({ version: 1, day: 42, ...fields }));

  it("phrases each game's stored progress for the hub row", () => {
    const storage = new MemoryStorage();
    saveWordProgress(applyGuess(createWordProgress(42), "planet", "garden"), storage);
    expect(progressLine(game("word"), 42, storage)).toBe("1 guess in");
    saveWordProgress(
      applyGuess(applyGuess(createWordProgress(42), "planet", "garden"), "planet", "silver"),
      storage,
    );
    expect(progressLine(game("word"), 42, storage)).toBe("2 guesses in");

    const { puzzle } = generateSudoku(42, "v1");
    const sudoku = createSudokuProgress(42, puzzle);
    sudoku.started = true;
    saveSudokuProgress(sudoku, storage);
    const empty = puzzle.flat().filter((cell) => cell === 0).length;
    expect(progressLine(game("sudoku"), 42, storage)).toBe(`${empty} cells left`);
    stored(storage, "sudoku", { started: true, elapsedSeconds: 190 });
    expect(progressLine(game("sudoku"), 42, storage)).toBe("3:10 in");

    stored(storage, "chess", { started: true, attempts: 2 });
    expect(progressLine(game("chess"), 42, storage)).toBe("2 attempts");
    stored(storage, "chess", { started: true, attempts: 1 });
    expect(progressLine(game("chess"), 42, storage)).toBe("1 attempt");

    stored(storage, "globe", { guesses: ["FRA", "ESP", "PRT"] });
    expect(progressLine(game("globe"), 42, storage)).toBe("3 guesses");

    stored(storage, "mini", { started: true, letters: "AB..#C....#...........#.." });
    expect(progressLine(game("mini"), 42, storage)).toBe("3 of 22 squares");

    stored(storage, "connections", { found: [0, 2] });
    expect(progressLine(game("connections"), 42, storage)).toBe("2 of 4 found");

    const pick = { hue: 10, saturation: 50, brightness: 50 };
    const color = applyColorGuess(applyColorGuess(createColorProgress(42, colorAnswer(42, "v1")), pick), pick);
    saveColorProgress(color, storage);
    expect(progressLine(game("color"), 42, storage)).toBe("2 of 5 colours");
    expect(hasStarted(8, 42, storage)).toBe(true);
  });

  it("says 'started' when the stored shape tells nothing more", () => {
    const storage = new MemoryStorage();
    expect(progressLine(game("chess"), 42, storage)).toBe("started");
    stored(storage, "chess", { started: true, attempts: 0 });
    expect(progressLine(game("chess"), 42, storage)).toBe("started");
    storage.setItem("daily-on-dot:globe:v1:42", "{not json");
    expect(progressLine(game("globe"), 42, storage)).toBe("started");
    stored(storage, "word", { guesses: [] });
    expect(progressLine(game("word"), 42, storage)).toBe("started");
  });
});
