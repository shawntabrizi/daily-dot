import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import countries from "../../shared/countries/core.json";
import shapes from "../../shared/countries/shapes.json";
import {
  checkNameTables,
  generateCountries,
  parseCountryList,
  renderCountries,
  selectFeatures,
} from "./generate-countries";

function feature(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "Feature",
    properties: { LABEL_X: 1, LABEL_Y: 2, CONTINENT: "Europe", ...properties },
    geometry: null,
  };
}

// TYPE is set to what Natural Earth really says, to prove it is never read.
const fixture = {
  type: "FeatureCollection",
  features: [
    feature({ NAME: "Cuba", NAME_LONG: "Cuba", SOVEREIGNT: "Cuba", TYPE: "Sovereignty", ISO_A3_EH: "CUB", LABEL_X: -79, LABEL_Y: 21.6, CONTINENT: "North America" }),
    feature({ NAME: "Kosovo", NAME_LONG: "Kosovo", SOVEREIGNT: "Kosovo", TYPE: "Disputed", ISO_A3_EH: "-99" }),
    feature({ NAME: "Bosnia and Herz.", NAME_LONG: "Bosnia and Herzegovina", SOVEREIGNT: "Bosnia and Herzegovina", TYPE: "Sovereign country", ISO_A3_EH: "BIH" }),
    feature({ NAME: "eSwatini", NAME_LONG: "Kingdom of eSwatini", SOVEREIGNT: "eSwatini", TYPE: "Sovereign country", ISO_A3_EH: "SWZ", CONTINENT: "Africa" }),
    feature({ NAME: "Maldives", NAME_LONG: "Maldives", SOVEREIGNT: "Maldives", TYPE: "Sovereign country", ISO_A3_EH: "MDV", CONTINENT: "Seven seas (open ocean)" }),
    feature({ NAME: "Australia", NAME_LONG: "Australia", SOVEREIGNT: "Australia", TYPE: "Country", ISO_A3_EH: "AUS" }),
    feature({ NAME: "Somalia", NAME_LONG: "Somalia", SOVEREIGNT: "Somalia", TYPE: "Sovereign country", ISO_A3_EH: "SOM" }),
    feature({ NAME: "Somaliland", NAME_LONG: "Somaliland", SOVEREIGNT: "Somaliland", TYPE: "Sovereign country", ISO_A3_EH: "-99" }),
    feature({ NAME: "Indian Ocean Ter.", NAME_LONG: "Indian Ocean Territories", SOVEREIGNT: "Australia", TYPE: "Dependency", ISO_A3_EH: "AUS" }),
    feature({ NAME: "Antarctica", NAME_LONG: "Antarctica", SOVEREIGNT: "Antarctica", TYPE: "Indeterminate", ISO_A3_EH: "ATA" }),
  ],
};
const list = ["Australia", "Bosnia and Herz.", "Cuba", "Kosovo", "Maldives", "Somalia", "eSwatini"];

describe("Natural Earth country selection (D26)", () => {
  it("selects the listed NAMEs whatever their TYPE, with label points and readable names", () => {
    expect(generateCountries(JSON.stringify(fixture), list)).toEqual([
      { name: "Australia", lat: 2, lng: 1, continent: "Europe", iso: "AUS", aliases: [] },
      {
        name: "Bosnia and Herzegovina",
        lat: 2,
        lng: 1,
        continent: "Europe",
        iso: "BIH",
        aliases: ["Bosnia and Herz.", "Bosnia"],
      },
      { name: "Cuba", lat: 21.6, lng: -79, continent: "North America", iso: "CUB", aliases: [] },
      {
        name: "Eswatini",
        lat: 2,
        lng: 1,
        continent: "Africa",
        iso: "SWZ",
        aliases: ["eSwatini", "Swaziland"],
      },
      { name: "Kosovo", lat: 2, lng: 1, continent: "Europe", iso: "Kosovo", aliases: [] },
      { name: "Maldives", lat: 2, lng: 1, continent: "Asia", iso: "MDV", aliases: [] },
      { name: "Somalia", lat: 2, lng: 1, continent: "Europe", iso: "SOM", aliases: [] },
    ]);
  });

  it("makes every other feature a territory of its owner, with unique identities", () => {
    const selection = selectFeatures(JSON.stringify(fixture), list);
    expect(
      selection.territories.map(({ iso, owner }) => ({ iso, owner })),
    ).toEqual([
      // Somaliland is Somalia's (override), not its own sovereignty.
      { iso: "Somaliland", owner: "SOM" },
      // Natural Earth reuses AUS; the name keeps the identity unique.
      { iso: "Indian Ocean Ter.", owner: "AUS" },
    ]);
  });

  it("fails loudly on a listed name the input lacks, or an unowned territory", () => {
    expect(() => generateCountries(JSON.stringify(fixture), [...list, "Atlantis"])).toThrow(
      "Listed countries missing from the input: Atlantis",
    );
    expect(() => selectFeatures(JSON.stringify(fixture), list.filter((name) => name !== "Somalia")))
      .toThrow("Territory Somalia has no guessable owner (Somalia)");
  });

  it("renders byte-identically on repeated runs", () => {
    const source = JSON.stringify(fixture);
    expect(renderCountries(generateCountries(source, list))).toBe(
      renderCountries(generateCountries(source, list)),
    );
  });
});

describe("committed Daily Globe countries", () => {
  const listed = parseCountryList(
    readFileSync("../shared/countries/globe-countries.json", "utf8"),
  );
  const byName = new Map(countries.map((country) => [country.name, country]));
  const territories = shapes.filter(
    (shape): shape is typeof shape & { owner: string } => "owner" in shape,
  );
  const ownerOf = (iso: string): string | undefined =>
    territories.find((shape) => shape.iso === iso)?.owner;

  it("has exactly the 197 listed countries, each identity and name once", () => {
    expect(listed).toHaveLength(197);
    expect(countries).toHaveLength(197);
    expect(new Set(countries.map((country) => country.iso)).size).toBe(197);
    expect(new Set(countries.map((country) => country.name)).size).toBe(197);
    expect(countries.some((country) => country.iso === "-99")).toBe(false);
    expect(byName.get("France")?.iso).toBe("FRA");
    expect(() => checkNameTables(listed)).not.toThrow();
    expect(
      readFileSync("../shared/countries/core.json", "utf8"),
    ).toBe(renderCountries(countries));
  });

  it("can guess the countries the old TYPE filter and the 1:110m map lost", () => {
    for (const name of [
      "Cuba",
      "Kazakhstan",
      "Israel",
      "Kosovo",
      "Palestine",
      "Singapore",
      "Vatican",
      "Taiwan",
      "Malta",
      "Bahrain",
    ]) {
      expect(byName.has(name), name).toBe(true);
    }
  });

  it("never makes a territory guessable", () => {
    for (const name of ["Greenland", "Hong Kong", "Somaliland", "Puerto Rico", "W. Sahara", "Western Sahara", "Antarctica"]) {
      expect(byName.has(name), name).toBe(false);
    }
    const guessable = new Set(countries.map((country) => country.iso));
    for (const territory of territories) {
      expect(guessable.has(territory.iso), territory.iso).toBe(false);
      expect(guessable.has(territory.owner), territory.iso).toBe(true);
    }
  });

  it("gives each territory its owner, with the three D26 overrides and two drops", () => {
    expect(territories).toHaveLength(43);
    expect(ownerOf("GRL")).toBe("DNK");
    expect(ownerOf("HKG")).toBe("CHN");
    expect(ownerOf("PRI")).toBe("USA");
    expect(ownerOf("Somaliland")).toBe("SOM");
    expect(ownerOf("N. Cyprus")).toBe("CYP");
    expect(ownerOf("ESH")).toBe("MAR");
    expect(ownerOf("Indian Ocean Ter.")).toBe("AUS");
    expect(ownerOf("ATA")).toBeUndefined();
    expect(ownerOf("Siachen Glacier")).toBeUndefined();
    const identities = shapes.map((shape) => shape.iso);
    expect(new Set(identities).size).toBe(identities.length);
    expect(identities).not.toContain("ATA");
    expect(identities).not.toContain("Antarctica");
    expect(identities).not.toContain("Siachen Glacier");
  });

  it("shows readable names, never a Natural Earth abbreviation", () => {
    for (const name of [
      "Bosnia and Herzegovina",
      "Eswatini",
      "Central African Republic",
      "Democratic Republic of the Congo",
      "South Sudan",
      "Saint Vincent and the Grenadines",
      "Antigua and Barbuda",
      "Dominican Republic",
    ]) {
      expect(byName.has(name), name).toBe(true);
    }
    expect(countries.filter((country) => country.name.includes("."))).toEqual([]);
    expect(byName.has("eSwatini")).toBe(false);
    expect(countries.some((country) => country.continent.startsWith("Seven seas"))).toBe(false);
  });
});
