import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import { GLOBE_COUNTRIES, globeAnswer } from "./generate";
import {
  applyGlobeGuess,
  createGlobeProgress,
  hasStartedGlobe,
  loadGlobeProgress,
  saveGlobeProgress,
  submitGlobeOnce,
} from "./progress";

function sourceFor(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => 208,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
  };
}

function acceptGuess(
  progress: ReturnType<typeof createGlobeProgress>,
  guess: string,
) {
  const result = applyGlobeGuess(progress, guess);
  expect(result.accepted).toBe(true);
  if (!result.accepted) {
    throw new Error(result.message);
  }
  return result.progress;
}

describe("Globe progress", () => {
  it("rejects an unlisted country without consuming a guess", () => {
    const progress = createGlobeProgress(208, globeAnswer(208, "v1"));
    const result = applyGlobeGuess(progress, "Atlantis");

    expect(result.accepted).toBe(false);
    expect(result.progress).toBe(progress);
    expect(result.progress.guesses).toHaveLength(0);
    expect(result.progress.complete).toBe(false);
  });

  it("accepts a listed country case-insensitively", () => {
    const answer = globeAnswer(208, "v1");
    const guess = GLOBE_COUNTRIES.find((country) => country.iso !== answer.iso)!;
    const result = applyGlobeGuess(
      createGlobeProgress(208, answer),
      ` ${guess.name.toUpperCase()} `,
    );

    expect(result.accepted).toBe(true);
    expect(result.progress.guesses).toEqual([guess.iso]);
  });

  it("restores the accepted guess list after a mid-game reload", () => {
    const storage = new MemoryStorage();
    const answer = globeAnswer(208, "v1");
    const wrong = GLOBE_COUNTRIES.find((country) => country.iso !== answer.iso)!;
    const progress = acceptGuess(
      createGlobeProgress(208, answer),
      wrong.name,
    );
    saveGlobeProgress(progress, storage);

    expect(loadGlobeProgress(208, answer, storage)).toEqual(progress);
    expect(hasStartedGlobe(208, storage)).toBe(true);
  });

  it("records one gameId 3 result even when completion is submitted twice", async () => {
    const storage = new MemoryStorage();
    const answer = globeAnswer(208, "v1");
    const wrong = GLOBE_COUNTRIES.find((country) => country.iso !== answer.iso)!;
    let progress = acceptGuess(
      createGlobeProgress(208, answer),
      wrong.name,
    );
    progress = acceptGuess(progress, answer.name);
    saveGlobeProgress(progress, storage);
    const record = vi.fn<DataSource["record"]>(async () => undefined);

    await Promise.all([
      submitGlobeOnce(sourceFor(record), progress, storage),
      submitGlobeOnce(sourceFor(record), progress, storage),
    ]);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(3, 208, 2, true);
    expect(loadGlobeProgress(208, answer, storage).submission).toBe(
      "submitted",
    );
  });
});
