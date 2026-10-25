import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import fixtures from "./fixtures/v1.json";
import globeConfig from "../../../../shared/countries/globe-countries.json";
import {
  answerPoolOn,
  createV1Answers,
  GLOBE_ANSWER_ENTRIES,
  GLOBE_COUNTRIES,
  GLOBE_PLACES,
  globeAnswer,
  type AnswerEntry,
  type Place,
} from "./generate";

const fake: Place = {
  id: "ZZZ",
  name: "Zedland",
  aliases: [],
  kind: "sovereign",
  owner: null,
  lat: 1,
  lng: 2,
  continent: "Nowhere",
};
const answersFor = (places: readonly Place[], entries: readonly AnswerEntry[]) => {
  const answer = createV1Answers(places, entries);
  return (from: number, to: number): string[] =>
    Array.from({ length: to - from }, (_, offset) => answer(from + offset).id);
};
const baseline = answersFor(GLOBE_PLACES, GLOBE_ANSWER_ENTRIES);

describe("Globe v1 generator", () => {
  it.each(Object.entries(fixtures))(
    "keeps day %s byte-identical to its committed fixture",
    (day, name) => {
      const first = globeAnswer(Number(day), "v1");
      const regenerated = globeAnswer(Number(day), "v1");

      expect(first.name).toBe(name);
      expect(JSON.stringify(regenerated)).toBe(JSON.stringify(first));
    },
  );

  it("uses every country once before a shuffled deck repeats", () => {
    const expected = new Set(GLOBE_COUNTRIES.map((country) => country.id));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const offset = cycle * GLOBE_COUNTRIES.length;
      const identities = Array.from(
        { length: GLOBE_COUNTRIES.length },
        (_, index) => globeAnswer(offset + index, "v1").id,
      );
      expect(new Set(identities)).toEqual(expected);
      expect(new Set(identities).size).toBe(GLOBE_COUNTRIES.length);
    }
  });

  it("starts with the 197 guessable countries as the answer pool from day 0", () => {
    expect(GLOBE_ANSWER_ENTRIES).toHaveLength(197);
    expect(GLOBE_ANSWER_ENTRIES.every((entry) => entry.since === 0 && entry.until === undefined))
      .toBe(true);
    const guessable = new Set(GLOBE_COUNTRIES.map((country) => country.id));
    expect(GLOBE_ANSWER_ENTRIES.every((entry) => guessable.has(entry.id))).toBe(true);
    expect(answerPoolOn(GLOBE_PLACES, GLOBE_ANSWER_ENTRIES, 0)).toEqual(GLOBE_COUNTRIES);
  });

  // Cycle 0 is days 0–196, cycle 1 days 197–393, cycle 2 from 394.
  it("never moves a past or running answer when an entry is added with a future since", () => {
    const since = 300;
    const added = answersFor([...GLOBE_PLACES, fake], [
      ...GLOBE_ANSWER_ENTRIES,
      { id: fake.id, since },
    ]);
    expect(added(0, 394)).toEqual(baseline(0, 394));
    expect(added(0, 394)).not.toContain(fake.id);
    // It enters the first cycle that begins on or after its since: 198 days.
    const next = added(394, 592);
    expect(next.filter((id) => id === fake.id)).toHaveLength(1);
    expect(new Set(next).size).toBe(198);
    expect(next).not.toEqual(baseline(394, 592));
  });

  it("never moves a past or running answer when an entry ends with a future until", () => {
    const removed = GLOBE_ANSWER_ENTRIES[0]!.id;
    const ended = answersFor(
      GLOBE_PLACES,
      GLOBE_ANSWER_ENTRIES.map((entry) =>
        entry.id === removed ? { ...entry, until: 300 } : entry,
      ),
    );
    expect(ended(0, 394)).toEqual(baseline(0, 394));
    const next = ended(394, 590);
    expect(next).not.toContain(removed);
    expect(new Set(next).size).toBe(196);
  });

  it("changes no answer when the superset grows, a place turns guessable or entries reorder", () => {
    const grown = answersFor(
      [...GLOBE_PLACES, fake],
      [...GLOBE_ANSWER_ENTRIES].reverse(),
    );
    expect(grown(0, 1200)).toEqual(baseline(0, 1200));
    // The guessable list is not an input at all: answers come from entries only.
    expect(globeConfig.guessable).toHaveLength(197);
    expect(createV1Answers.length).toBe(2);
  });

  it("walks cycles, not days, so a far day is cheap and the walk is cached", () => {
    const answer = createV1Answers(GLOBE_PLACES, GLOBE_ANSWER_ENTRIES);
    const started = performance.now();
    answer(197 * 2000 + 5);
    answer(3);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(answer(3)).toBe(globeAnswer(3, "v1"));
  });

  it("takes only day and version without ambient clock or RNG input", () => {
    const source = readFileSync("src/games/globe/generate.ts", "utf8");
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("ambient RNG leaked into the generator");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("wall clock leaked into the generator");
    });

    expect(globeAnswer.length).toBe(2);
    expect(source).not.toMatch(/Math\.random|\bDate\b/);
    expect(() => globeAnswer(208, "v1")).not.toThrow();
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it("rejects invalid days", () => {
    expect(() => globeAnswer(-1, "v1")).toThrow(
      "Day must be a non-negative safe integer",
    );
    expect(() => globeAnswer(0.5, "v1")).toThrow(
      "Day must be a non-negative safe integer",
    );
  });
});
