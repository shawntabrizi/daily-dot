import { describe, expect, it } from "vitest";
import testVectorsJson from "../../../shared/day-test-vectors.json";
import {
  DAY_SECONDS,
  EPOCH_SECONDS,
  dayIndexFromTimestamp,
  indexForDay,
} from "./day";

type ExpectedVector = { name: string; expected: number };
type ErrorVector = { name: string; error: string };
type DayIndexVector = { nowSeconds: number } & (ExpectedVector | ErrorVector);
type IndexForDayVector = {
  day: number;
  startDay: number;
  count: number;
} & (ExpectedVector | ErrorVector);

const testVectors = testVectorsJson as {
  dayIndex: DayIndexVector[];
  indexForDay: IndexForDayVector[];
};

describe("dayIndexFromTimestamp", () => {
  it("changes day only at the UTC epoch boundary", () => {
    expect(dayIndexFromTimestamp(EPOCH_SECONDS)).toBe(0);
    expect(dayIndexFromTimestamp(EPOCH_SECONDS + DAY_SECONDS - 0.001)).toBe(0);
    expect(dayIndexFromTimestamp(EPOCH_SECONDS + DAY_SECONDS)).toBe(1);
  });

  it("rejects timestamps before the epoch instead of producing negative days", () => {
    expect(() => dayIndexFromTimestamp(EPOCH_SECONDS - 0.001)).toThrow(RangeError);
  });
});

describe("shared Rust and TypeScript day vectors", () => {
  for (const vector of testVectors.dayIndex) {
    it(`day index: ${vector.name}`, () => {
      if ("error" in vector) {
        expect(() => dayIndexFromTimestamp(vector.nowSeconds)).toThrow(
          RangeError,
        );
      } else {
        expect(dayIndexFromTimestamp(vector.nowSeconds)).toBe(vector.expected);
      }
    });
  }

  for (const vector of testVectors.indexForDay) {
    it(`content index: ${vector.name}`, () => {
      if ("error" in vector) {
        expect(() =>
          indexForDay(vector.day, vector.startDay, vector.count),
        ).toThrow(RangeError);
      } else {
        expect(indexForDay(vector.day, vector.startDay, vector.count)).toBe(
          vector.expected,
        );
      }
    });
  }
});
