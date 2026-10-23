import { afterEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { HostSignerUnavailableError } from "../../shared/host-signer";
import {
  createMiniProgress,
  hasStartedMini,
  loadMiniProgress,
  MINI_GAME_ID,
  miniFilled,
  miniSolved,
  prepareMiniSubmissionRetry,
  saveMiniProgress,
  setMiniLetter,
  submitMiniOnce,
} from "./progress";

const GRID = "#GET#" + "HEART" + "ANGER" + "DELAY" + "#SET#";

function sourceWith(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => 10,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
  };
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("mini progress", () => {
  it("starts empty with the blacks in place and marks started on the first letter", () => {
    const fresh = createMiniProgress(10, GRID);
    expect(fresh.letters).toBe("#...#" + "....." + "....." + "....." + "#...#");
    expect(fresh.started).toBe(false);
    const typed = setMiniLetter(fresh, 1, "G");
    expect(typed.letters[1]).toBe("G");
    expect(typed.started).toBe(true);
    expect(() => setMiniLetter(fresh, 0, "A")).toThrow(/black/);
    expect(() => setMiniLetter(fresh, 1, "g")).toThrow(/capital/);
  });

  it("is solved only when every square matches, not merely when every square is filled", () => {
    let progress = createMiniProgress(10, GRID);
    for (let index = 0; index < GRID.length; index += 1) {
      if (GRID[index] !== "#") {
        progress = setMiniLetter(progress, index, index === 1 ? "B" : GRID[index]!);
      }
    }
    expect(miniFilled(progress.letters)).toBe(true);
    expect(miniSolved(progress.letters, GRID)).toBe(false);
    progress = setMiniLetter(progress, 1, "G");
    expect(miniSolved(progress.letters, GRID)).toBe(true);
  });

  it("survives a reload, discards a blob for another grid shape, and flags started days", () => {
    const progress = setMiniLetter(createMiniProgress(10, GRID), 1, "G");
    progress.elapsedSeconds = 42;
    saveMiniProgress(progress);
    expect(loadMiniProgress(10, GRID)).toEqual(progress);
    expect(hasStartedMini(10)).toBe(true);
    expect(hasStartedMini(11)).toBe(false);

    const otherShape = "PAN##" + "ACORN" + "INDIE" + "NEEDS" + "##SET";
    expect(loadMiniProgress(10, otherShape).letters).toBe("...##" + "....." + "....." + "....." + "##...");
  });

  it("records gameId 4 once with the elapsed seconds and never for an unfinished grid", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source = sourceWith(record);
    const progress = createMiniProgress(10, GRID);
    await submitMiniOnce(source, progress);
    expect(record).not.toHaveBeenCalled();

    progress.complete = true;
    progress.submission = "pending";
    progress.elapsedSeconds = 95;
    await submitMiniOnce(source, progress);
    await submitMiniOnce(source, progress);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(MINI_GAME_ID, 10, 95, true);
    expect(MINI_GAME_ID).toBe(4);
    expect(progress.submission).toBe("submitted");
  });

  it("defers without a host signer, fails otherwise, and retries only from failed", async () => {
    const progress = createMiniProgress(10, GRID);
    progress.complete = true;
    progress.submission = "pending";
    await expect(
      submitMiniOnce(sourceWith(async () => {
        throw new HostSignerUnavailableError("no host");
      }), progress),
    ).rejects.toThrow();
    expect(progress.submission).toBe("deferred");

    progress.submission = "pending";
    await expect(
      submitMiniOnce(sourceWith(async () => {
        throw new Error("boom");
      }), progress),
    ).rejects.toThrow();
    expect(progress.submission).toBe("failed");
    prepareMiniSubmissionRetry(progress);
    expect(progress.submission).toBe("pending");
    expect(loadMiniProgress(10, GRID).submission).toBe("pending");
  });
});
