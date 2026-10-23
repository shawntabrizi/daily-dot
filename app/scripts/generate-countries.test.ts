import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import countries from "../../shared/countries/core.json";
import {
  generateCountries,
  renderCountries,
} from "./generate-countries";

const fixture = {
  type: "FeatureCollection",
  features: [
    {
      properties: {
        TYPE: "Dependency",
        NAME: "Skip me",
        ISO_A3_EH: "SKP",
        LABEL_X: 1,
        LABEL_Y: 2,
        CONTINENT: "Nowhere",
      },
    },
    {
      properties: {
        TYPE: "Country",
        NAME: "Zulu",
        ISO_A3_EH: "-99",
        LABEL_X: 30,
        LABEL_Y: 20,
        CONTINENT: "Africa",
      },
    },
    {
      properties: {
        TYPE: "Sovereign country",
        NAME: "Alpha",
        ISO_A3_EH: "ALP",
        LABEL_X: 10,
        LABEL_Y: 5,
        CONTINENT: "Europe",
      },
    },
  ],
};

describe("Natural Earth country generation", () => {
  it("keeps only countries, uses label points, and falls back from -99", () => {
    expect(generateCountries(JSON.stringify(fixture))).toEqual([
      {
        name: "Alpha",
        lat: 5,
        lng: 10,
        continent: "Europe",
        iso: "ALP",
      },
      {
        name: "Zulu",
        lat: 20,
        lng: 30,
        continent: "Africa",
        iso: "Zulu",
      },
    ]);
  });

  it("renders byte-identically on repeated runs", () => {
    const source = JSON.stringify(fixture);
    expect(renderCountries(generateCountries(source))).toBe(
      renderCountries(generateCountries(source)),
    );
  });

  it("commits at least 160 unique countries without a -99 identity", () => {
    const names = countries.map((country) => country.name);
    expect(countries.length).toBeGreaterThanOrEqual(160);
    expect(countries.some((country) => country.iso === "-99")).toBe(false);
    expect(new Set(names).size).toBe(names.length);
    expect(countries.find((country) => country.name === "France")?.iso).toBe(
      "FRA",
    );
    expect(
      readFileSync("../shared/countries/core.json", "utf8"),
    ).toBe(`${JSON.stringify(countries, null, 2)}\n`);
  });

  it("rejects duplicate country names", () => {
    const duplicate = {
      ...fixture,
      features: [...fixture.features, fixture.features[1]],
    };
    expect(() => generateCountries(JSON.stringify(duplicate))).toThrow(
      "Duplicate country name: Zulu",
    );
  });
});
