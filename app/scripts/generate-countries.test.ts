import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import places from "../../shared/countries/core.json";
import shapes from "../../shared/countries/shapes.json";
import {
  checkNameTables,
  generatePlaces,
  parseGlobeConfig,
  renderPlaces,
  type Place,
} from "./generate-countries";

function feature(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "Feature",
    properties: { LABEL_X: 1, LABEL_Y: 2, CONTINENT: "Europe", ...properties },
    geometry: null,
  };
}

// TYPE is set to what Natural Earth really says: the list overrides it.
const fixture = {
  type: "FeatureCollection",
  features: [
    feature({ NAME: "Cuba", NAME_LONG: "Cuba", SOVEREIGNT: "Cuba", TYPE: "Sovereignty", ISO_A3_EH: "CUB", ADM0_A3: "CUB", LABEL_X: -79, LABEL_Y: 21.6, CONTINENT: "North America" }),
    feature({ NAME: "Kosovo", NAME_LONG: "Kosovo", SOVEREIGNT: "Kosovo", TYPE: "Disputed", ISO_A3_EH: "-99", ADM0_A3: "KOS" }),
    feature({ NAME: "Bosnia and Herz.", NAME_LONG: "Bosnia and Herzegovina", SOVEREIGNT: "Bosnia and Herzegovina", TYPE: "Sovereign country", ISO_A3_EH: "BIH", ADM0_A3: "BIH" }),
    feature({ NAME: "eSwatini", NAME_LONG: "Kingdom of eSwatini", SOVEREIGNT: "eSwatini", TYPE: "Sovereign country", ISO_A3_EH: "SWZ", ADM0_A3: "SWZ", CONTINENT: "Africa" }),
    feature({ NAME: "Maldives", NAME_LONG: "Maldives", SOVEREIGNT: "Maldives", TYPE: "Sovereign country", ISO_A3_EH: "MDV", ADM0_A3: "MDV", CONTINENT: "Seven seas (open ocean)" }),
    feature({ NAME: "Australia", NAME_LONG: "Australia", SOVEREIGNT: "Australia", TYPE: "Country", ISO_A3_EH: "AUS", ADM0_A3: "AUS" }),
    feature({ NAME: "Somalia", NAME_LONG: "Somalia", SOVEREIGNT: "Somalia", TYPE: "Sovereign country", ISO_A3_EH: "SOM", ADM0_A3: "SOM" }),
    feature({ NAME: "Somaliland", NAME_LONG: "Somaliland", SOVEREIGNT: "Somaliland", TYPE: "Sovereign country", ISO_A3_EH: "-99", ADM0_A3: "SOL" }),
    feature({ NAME: "Indian Ocean Ter.", NAME_LONG: "Indian Ocean Territories", SOVEREIGNT: "Australia", TYPE: "Dependency", ISO_A3_EH: "AUS", ADM0_A3: "IOA" }),
    feature({ NAME: "Antarctica", NAME_LONG: "Antarctica", SOVEREIGNT: "Antarctica", TYPE: "Indeterminate", ISO_A3_EH: "ATA", ADM0_A3: "ATA" }),
  ],
};
const list = ["Australia", "Bosnia and Herz.", "Cuba", "Kosovo", "Maldives", "Somalia", "eSwatini"];
const at = { lat: 2, lng: 1, continent: "Europe" };

describe("Natural Earth place superset (D26)", () => {
  it("keeps every feature but the dropped ones, with kinds, owners and readable names", () => {
    expect(generatePlaces(JSON.stringify(fixture), list)).toEqual<Place[]>([
      { id: "AUS", name: "Australia", aliases: [], kind: "sovereign", owner: null, ...at },
      {
        id: "BIH",
        name: "Bosnia and Herzegovina",
        aliases: ["Bosnia and Herz.", "Bosnia"],
        kind: "sovereign",
        owner: null,
        ...at,
      },
      { id: "CUB", name: "Cuba", aliases: [], kind: "sovereign", owner: null, lat: 21.6, lng: -79, continent: "North America" },
      // Natural Earth reuses AUS; the place ADM0_A3 does not name keeps its NAME.
      { id: "Indian Ocean Ter.", name: "Indian Ocean Territories", aliases: ["Indian Ocean Ter."], kind: "territory", owner: "AUS", ...at },
      { id: "Kosovo", name: "Kosovo", aliases: [], kind: "sovereign", owner: null, ...at },
      { id: "MDV", name: "Maldives", aliases: [], kind: "sovereign", owner: null, ...at, continent: "Asia" },
      { id: "SOM", name: "Somalia", aliases: [], kind: "sovereign", owner: null, ...at },
      { id: "SWZ", name: "Eswatini", aliases: ["eSwatini", "Swaziland"], kind: "sovereign", owner: null, ...at, continent: "Africa" },
      // Somaliland is Somalia's (override), not its own sovereignty.
      { id: "Somaliland", name: "Somaliland", aliases: [], kind: "disputed", owner: "SOM", ...at },
    ]);
  });

  it("gives a place the same id whatever the sovereign list says", () => {
    const ids = (sovereign: string[]) =>
      generatePlaces(JSON.stringify(fixture), sovereign).map((place) => place.id);
    expect(ids(list)).toEqual(ids([...list].reverse()));
  });

  it("fails loudly on a listed name the input lacks, or an unowned place", () => {
    expect(() => generatePlaces(JSON.stringify(fixture), [...list, "Atlantis"])).toThrow(
      "Listed countries missing from the input: Atlantis",
    );
    expect(() => generatePlaces(JSON.stringify(fixture), list.filter((name) => name !== "Somalia")))
      .toThrow("Territory Somalia has no sovereign owner (Somalia)");
  });

  it("renders byte-identically on repeated runs", () => {
    const source = JSON.stringify(fixture);
    expect(renderPlaces(generatePlaces(source, list))).toBe(
      renderPlaces(generatePlaces(source, list)),
    );
  });

  it("parses answer entries with since and until, and rejects bad days", () => {
    const config = (answers: unknown) =>
      JSON.stringify({ countries: ["A"], guessable: ["A"], answers });
    expect(parseGlobeConfig(config([{ id: "A", since: 0 }, { id: "B", since: 5, until: 9 }])).answers)
      .toEqual([{ id: "A", since: 0 }, { id: "B", since: 5, until: 9 }]);
    expect(() => parseGlobeConfig(config([{ id: "A", since: -1 }]))).toThrow("Invalid answers entry");
    expect(() => parseGlobeConfig(config([{ id: "A", since: 5, until: 5 }]))).toThrow("Invalid answers entry");
  });
});

describe("committed Daily Globe places and config", () => {
  const config = parseGlobeConfig(
    readFileSync("../shared/countries/globe-countries.json", "utf8"),
  );
  const guessable = new Set(config.guessable);
  const byId = new Map(places.map((place) => [place.id, place]));
  const guessableByName = new Map(
    places.filter((place) => guessable.has(place.id)).map((place) => [place.name, place]),
  );
  const ownerOf = (id: string): string | null | undefined => byId.get(id)?.owner;

  it("is the 240-place superset, every id and name once, every place with a shape", () => {
    expect(places).toHaveLength(240);
    expect(new Set(places.map((place) => place.id)).size).toBe(240);
    expect(new Set(places.map((place) => place.name)).size).toBe(240);
    expect(places.some((place) => place.id === "-99")).toBe(false);
    expect(shapes.map((shape) => shape.id)).toEqual(places.map((place) => place.id));
    expect(byId.get("FRA")?.name).toBe("France");
    expect(() => checkNameTables(config.countries)).not.toThrow();
    expect(
      readFileSync("../shared/countries/core.json", "utf8"),
    ).toBe(renderPlaces(places as Place[]));
  });

  it("marks exactly the 197 listed countries sovereign, and those are the guessable and answers", () => {
    const sovereign = places.filter((place) => place.kind === "sovereign").map((place) => place.id);
    expect(config.countries).toHaveLength(197);
    expect(sovereign).toHaveLength(197);
    expect([...config.guessable].sort()).toEqual([...sovereign].sort());
    expect(config.answers.map((entry) => entry.id).sort()).toEqual([...sovereign].sort());
    expect(places.filter((place) => place.kind === "territory")).toHaveLength(38);
    expect(places.filter((place) => place.kind === "disputed").map((place) => place.id).sort())
      .toEqual(["ESH", "FLK", "IOT", "N. Cyprus", "Somaliland"]);
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
      expect(guessableByName.has(name), name).toBe(true);
    }
  });

  it("draws territories but never makes them guessable", () => {
    for (const name of ["Greenland", "Hong Kong", "Somaliland", "Puerto Rico", "Western Sahara"]) {
      expect(guessableByName.has(name), name).toBe(false);
      expect(places.some((place) => place.name === name), name).toBe(true);
    }
    for (const place of places.filter((candidate) => candidate.kind !== "sovereign")) {
      expect(guessable.has(place.id), place.id).toBe(false);
      expect(byId.get(place.owner!)?.kind, place.id).toBe("sovereign");
    }
  });

  it("gives each place its owner, with the three D26 overrides and two drops", () => {
    expect(ownerOf("GRL")).toBe("DNK");
    expect(ownerOf("HKG")).toBe("CHN");
    expect(ownerOf("PRI")).toBe("USA");
    expect(ownerOf("Somaliland")).toBe("SOM");
    expect(ownerOf("N. Cyprus")).toBe("CYP");
    expect(ownerOf("ESH")).toBe("MAR");
    expect(ownerOf("Indian Ocean Ter.")).toBe("AUS");
    expect(ownerOf("PSE")).toBeNull();
    for (const dropped of ["ATA", "Antarctica", "Siachen Glacier"]) {
      expect(byId.has(dropped), dropped).toBe(false);
    }
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
      expect(guessableByName.has(name), name).toBe(true);
    }
    expect(places.filter((place) => place.name.includes("."))).toEqual([]);
    // Only guessable places reach a guess row, so only they need a continent players know.
    expect([...guessableByName.values()].some((place) => place.continent.startsWith("Seven seas")))
      .toBe(false);
  });
});
