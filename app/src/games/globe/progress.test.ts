import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { MemoryStorage } from "../../test/memory-storage";
import { GLOBE_COUNTRIES, globeAnswer } from "./generate";
import { foldCountryName } from "./names";
import {
  applyGlobeGuess,
  countryFromGuess,
  createGlobeProgress,
  hasStartedGlobe,
  loadGlobeProgress,
  matchCountries,
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
    const guess = GLOBE_COUNTRIES.find((country) => country.id !== answer.id)!;
    const result = applyGlobeGuess(
      createGlobeProgress(208, answer),
      ` ${guess.name.toUpperCase()} `,
    );

    expect(result.accepted).toBe(true);
    expect(result.progress.guesses).toEqual([guess.id]);
  });

  it("rejects a repeated country without consuming a guess", () => {
    const answer = globeAnswer(208, "v1");
    const guess = GLOBE_COUNTRIES.find((country) => country.id !== answer.id)!;
    const first = applyGlobeGuess(createGlobeProgress(208, answer), guess.name);
    const repeat = applyGlobeGuess(first.progress, guess.name.toLowerCase());

    expect(repeat.accepted).toBe(false);
    expect(repeat.progress.guesses).toEqual([guess.id]);
    if (!repeat.accepted) {
      expect(repeat.message).toBe(`You already guessed ${guess.name}.`);
    }
  });

  it("lists every country for an empty query, alphabetically", () => {
    const names = matchCountries("  ").map((country) => country.name);
    expect(names).toHaveLength(GLOBE_COUNTRIES.length);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, "en")),
    );
  });

  it("filters by the typed text, prefix matches first", () => {
    const query = "an";
    const matches = matchCountries(query.toUpperCase());
    // A country matches by its name or any alternate name ("Swaziland").
    const labels = matches.map((country) =>
      [country.name, ...country.aliases].map(foldCountryName),
    );
    const firstContainsOnly = labels.findIndex(
      (names) => !names.some((name) => name.startsWith(query)),
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(GLOBE_COUNTRIES.length);
    expect(labels.every((names) => names.some((name) => name.includes(query)))).toBe(true);
    expect(firstContainsOnly).toBeGreaterThan(0);
    expect(
      labels.slice(firstContainsOnly).every(
        (names) => !names.some((name) => name.startsWith(query)),
      ),
    ).toBe(true);
    expect(matchCountries("zzzz")).toEqual([]);
  });

  it("finds a country by its alternate names (D26), accents and case aside", () => {
    const cases: [string, string][] = [
      ["Burma", "Myanmar"],
      ["Ivory Coast", "Côte d'Ivoire"],
      ["cote d'ivoire", "Côte d'Ivoire"],
      ["COTE D’IVOIRE", "Côte d'Ivoire"],
      ["Holy See", "Vatican"],
      ["Vatican City", "Vatican"],
      ["UK", "United Kingdom"],
      ["Great Britain", "United Kingdom"],
      ["USA", "United States of America"],
      ["us", "United States of America"],
      ["Czech Republic", "Czechia"],
      ["Swaziland", "Eswatini"],
      ["Macedonia", "North Macedonia"],
      ["DR Congo", "Democratic Republic of the Congo"],
      ["Congo-Kinshasa", "Democratic Republic of the Congo"],
      ["Congo-Brazzaville", "Congo"],
      ["Cape Verde", "Cabo Verde"],
      ["Turkiye", "Turkey"],
      ["East Timor", "Timor-Leste"],
      ["UAE", "United Arab Emirates"],
      ["Bosnia", "Bosnia and Herzegovina"],
      ["Sao Tome and Principe", "São Tomé and Principe"],
      ["South Korea", "South Korea"],
    ];
    for (const [typed, name] of cases) {
      expect(countryFromGuess(typed)?.name, typed).toBe(name);
    }
    expect(countryFromGuess("Greenland")).toBeUndefined();
    expect(countryFromGuess("Somaliland")).toBeUndefined();
  });

  it("records an alias guess as the country and lists it under its own name", () => {
    const answer = globeAnswer(208, "v1");
    const myanmar = countryFromGuess("Myanmar")!;
    const progress = acceptGuess(createGlobeProgress(208, answer), "burma");
    expect(progress.guesses).toEqual([myanmar.id]);
    const repeat = applyGlobeGuess(progress, "Myanmar");
    expect(repeat.accepted).toBe(false);
    expect(matchCountries("burm").map((country) => country.name)).toEqual(["Myanmar"]);
    expect(matchCountries("ivory").map((country) => country.name)).toEqual(["Côte d'Ivoire"]);
    expect(matchCountries("cote").map((country) => country.name)).toEqual(["Côte d'Ivoire"]);
    expect(matchCountries("holy").map((country) => country.name)).toEqual(["Vatican"]);
  });

  it("restores the accepted guess list after a mid-game reload", () => {
    const storage = new MemoryStorage();
    const answer = globeAnswer(208, "v1");
    const wrong = GLOBE_COUNTRIES.find((country) => country.id !== answer.id)!;
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
    const wrong = GLOBE_COUNTRIES.find((country) => country.id !== answer.id)!;
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
