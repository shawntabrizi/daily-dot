import { describe, expect, it } from "vitest";

import { selectedDataSource } from "./source-selection";

describe("app data source selection", () => {
  it("defaults builds to chain and the test runner to stub", () => {
    expect(selectedDataSource({}, "production")).toBe("chain");
    expect(selectedDataSource({}, "development")).toBe("chain");
    expect(selectedDataSource({}, "test")).toBe("stub");
  });

  it("accepts an explicit stub override and refuses typos", () => {
    expect(selectedDataSource({ DAILY_SOURCE: "stub" }, "development")).toBe(
      "stub",
    );
    expect(() =>
      selectedDataSource({ DAILY_SOURCE: "memory" }, "development"),
    ).toThrow('DAILY_SOURCE must be either "stub" or "chain"');
  });
});
