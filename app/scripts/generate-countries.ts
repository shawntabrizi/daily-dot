import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { foldCountryName } from "../src/games/globe/names";

export type PlaceKind = "sovereign" | "territory" | "disputed";

/**
 * One Natural Earth admin-0 place: the superset the globe draws. Which
 * places can be guessed and which can be an answer is editorial config
 * (`globe-countries.json`), never this data.
 */
export interface Place {
  /** Stable identity: never changes once the game is live. */
  id: string;
  /** The readable name the picker, the guess rows and the result show. */
  name: string;
  /** Other names that find the place in the picker; never shown as its name. */
  aliases: string[];
  kind: PlaceKind;
  /** The sovereign place that owns a territory or disputed place; null for a sovereign. */
  owner: string | null;
  lat: number;
  lng: number;
  continent: string;
}

/** `globe-countries.json`: the sovereign names and the two editorial subsets. */
export interface GlobeConfig {
  /** Natural Earth `NAME`s of the sovereign places (D26: the 197). */
  countries: string[];
  /** Place ids the picker accepts. */
  guessable: string[];
  /** The v1 answer pool: a place id from day `since` until (not on) day `until`. */
  answers: AnswerEntry[];
}

export interface AnswerEntry {
  id: string;
  since: number;
  until?: number;
}

export interface NaturalEarthProperties {
  NAME?: unknown;
  NAME_LONG?: unknown;
  SOVEREIGNT?: unknown;
  TYPE?: unknown;
  ISO_A3_EH?: unknown;
  ADM0_A3?: unknown;
  LABEL_X?: unknown;
  LABEL_Y?: unknown;
  CONTINENT?: unknown;
}

export interface NaturalEarthFeature {
  properties?: NaturalEarthProperties;
  geometry?: unknown;
}

interface NaturalEarthCollection {
  type?: unknown;
  features?: unknown;
}

/** A kept feature with its identity and place record. */
export interface SelectedFeature {
  feature: NaturalEarthFeature;
  place: Place;
}

/**
 * D26 owners Natural Earth gives a sovereignty of their own, keyed by
 * Natural Earth `NAME` (Globle's choices, rebuilt from public-domain data).
 */
export const TERRITORY_OWNER_OVERRIDES: Readonly<Record<string, string>> = {
  Somaliland: "Somalia",
  "N. Cyprus": "Cyprus",
  "W. Sahara": "Morocco",
};

/** Features drawn by nobody: no owner to reveal them with. */
export const DROPPED_FEATURES: readonly string[] = ["Antarctica", "Siachen Glacier"];

/**
 * Readable names where Natural Earth's `NAME` and `NAME_LONG` are both wrong
 * for a player. Any other `NAME` with an abbreviation point falls back to
 * `NAME_LONG` ("Bosnia and Herz." → "Bosnia and Herzegovina").
 */
export const DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  eSwatini: "Eswatini",
  "Heard I. and McDonald Is.": "Heard Island and McDonald Islands",
};

/**
 * Natural Earth files three island states under "Seven seas (open ocean)";
 * the guess row shows the continent players expect.
 */
export const CONTINENT_OVERRIDES: Readonly<Record<string, string>> = {
  Maldives: "Asia",
  Mauritius: "Africa",
  Seychelles: "Africa",
};

/**
 * D26 alternate names, keyed by Natural Earth `NAME`. Accents, case and
 * apostrophes are folded when matching, so "Cote d'Ivoire" needs no entry.
 * A place's Natural Earth `NAME` is added when it differs from the shown one.
 */
export const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Myanmar: ["Burma"],
  eSwatini: ["Swaziland"],
  "North Macedonia": ["Macedonia"],
  Congo: ["Congo-Brazzaville", "Republic of the Congo"],
  "Dem. Rep. Congo": ["DR Congo", "Congo-Kinshasa", "Democratic Republic of Congo"],
  Vatican: ["Holy See", "Vatican City"],
  "Cabo Verde": ["Cape Verde"],
  "Côte d'Ivoire": ["Ivory Coast"],
  "Bosnia and Herz.": ["Bosnia"],
  Turkey: ["Türkiye"],
  Czechia: ["Czech Republic"],
  "Timor-Leste": ["East Timor"],
  "United States of America": ["United States", "USA", "US", "America"],
  "United Kingdom": ["UK", "Britain", "Great Britain"],
  "United Arab Emirates": ["UAE"],
};

function stringProperty(
  properties: NaturalEarthProperties,
  key: keyof NaturalEarthProperties,
): string {
  const value = properties[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`Natural Earth feature has no valid ${key}`);
  }
  return value;
}

function numberProperty(
  properties: NaturalEarthProperties,
  key: keyof NaturalEarthProperties,
): number {
  const value = properties[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Natural Earth feature has no valid ${key}`);
  }
  return value;
}

/** `ISO_A3_EH` is `-99` for a few places; their name is the identity. */
export function countryIdentity(properties: NaturalEarthProperties): string {
  const naturalEarthIso = properties.ISO_A3_EH;
  return typeof naturalEarthIso === "string"
    && naturalEarthIso.trim() !== ""
    && naturalEarthIso !== "-99"
    ? naturalEarthIso
    : stringProperty(properties, "NAME");
}

function stringList(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item !== "")) {
    throw new TypeError(`globe-countries.json ${key} must be a list of strings`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`globe-countries.json ${key} repeats an entry`);
  }
  return value as string[];
}

function answerEntries(value: unknown): AnswerEntry[] {
  if (!Array.isArray(value)) {
    throw new TypeError("globe-countries.json answers must be a list");
  }
  const day = (candidate: unknown): boolean =>
    Number.isSafeInteger(candidate) && (candidate as number) >= 0;
  return value.map((entry: unknown): AnswerEntry => {
    const { id, since, until } = (entry ?? {}) as Record<string, unknown>;
    if (
      typeof id !== "string"
      || !day(since)
      || (until !== undefined && (!day(until) || (until as number) <= (since as number)))
    ) {
      throw new TypeError(`Invalid answers entry: ${JSON.stringify(entry)}`);
    }
    return until === undefined
      ? { id, since: since as number }
      : { id, since: since as number, until: until as number };
  });
}

export function parseGlobeConfig(text: string): GlobeConfig {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return {
    countries: stringList(parsed.countries, "countries"),
    guessable: stringList(parsed.guessable, "guessable"),
    answers: answerEntries(parsed.answers),
  };
}

function parseCollection(geojsonText: string): NaturalEarthFeature[] {
  const parsed = JSON.parse(geojsonText) as NaturalEarthCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new TypeError("Natural Earth input must be a GeoJSON FeatureCollection");
  }
  return parsed.features as NaturalEarthFeature[];
}

export function displayName(properties: NaturalEarthProperties): string {
  const name = stringProperty(properties, "NAME");
  const shown = DISPLAY_NAME_OVERRIDES[name]
    ?? (name.includes(".") ? stringProperty(properties, "NAME_LONG") : name);
  if (shown.includes(".")) {
    throw new Error(`${name} still has no readable name (${shown})`);
  }
  return shown;
}

/**
 * Identity from the data alone, so editing the config never renames a
 * place: `ISO_A3_EH`, or `NAME` where that is `-99`, or where several
 * features share it and this one is not the place `ADM0_A3` says owns the
 * code (Natural Earth gives two Australian territories `AUS`).
 */
function identities(features: readonly NaturalEarthFeature[]): string[] {
  const counts = new Map<string, number>();
  for (const feature of features) {
    const iso = countryIdentity(feature.properties!);
    counts.set(iso, (counts.get(iso) ?? 0) + 1);
  }
  const ids = features.map((feature) => {
    const properties = feature.properties!;
    const iso = countryIdentity(properties);
    return counts.get(iso)! > 1 && properties.ADM0_A3 !== iso
      ? stringProperty(properties, "NAME")
      : iso;
  });
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate place identity: ${id}`);
    }
    seen.add(id);
  }
  return ids;
}

/**
 * D26 superset: every Natural Earth feature but the dropped ones. A listed
 * sovereign `NAME` is "sovereign" whatever its `TYPE` (Cuba is
 * "Sovereignty", Kosovo "Disputed"); any other place is "disputed" when
 * Natural Earth types it so or D26 reassigns it (Somaliland), else a
 * "territory", and belongs to its `SOVEREIGNT` or the D26 override.
 */
export function selectPlaces(
  geojsonText: string,
  sovereignNames: readonly string[],
): SelectedFeature[] {
  const features = parseCollection(geojsonText).filter((feature) => {
    if (!feature.properties) {
      throw new TypeError("Natural Earth feature has no properties");
    }
    return !DROPPED_FEATURES.includes(stringProperty(feature.properties, "NAME"));
  });
  const ids = identities(features);
  const sovereign = new Set(sovereignNames);
  const sovereignIds = new Map<string, string>();
  features.forEach((feature, index) => {
    const name = stringProperty(feature.properties!, "NAME");
    if (sovereign.has(name)) {
      if (sovereignIds.has(name)) {
        throw new Error(`Duplicate Natural Earth NAME: ${name}`);
      }
      sovereignIds.set(name, ids[index]!);
    }
  });
  const missing = sovereignNames.filter((name) => !sovereignIds.has(name));
  if (missing.length > 0) {
    throw new Error(`Listed countries missing from the input: ${missing.join(", ")}`);
  }

  const selected = features.map((feature, index): SelectedFeature => {
    const properties = feature.properties!;
    const naturalEarthName = stringProperty(properties, "NAME");
    const isSovereign = sovereign.has(naturalEarthName);
    let owner: string | null = null;
    let kind: PlaceKind = "sovereign";
    if (!isSovereign) {
      const ownerName = TERRITORY_OWNER_OVERRIDES[naturalEarthName]
        ?? stringProperty(properties, "SOVEREIGNT");
      owner = sovereignIds.get(ownerName) ?? null;
      if (owner === null) {
        throw new Error(`Territory ${naturalEarthName} has no sovereign owner (${ownerName})`);
      }
      const type = properties.TYPE;
      kind = type === "Disputed"
        || type === "Indeterminate"
        || naturalEarthName in TERRITORY_OWNER_OVERRIDES
        ? "disputed"
        : "territory";
    }
    const name = displayName(properties);
    return {
      feature,
      place: {
        id: ids[index]!,
        name,
        aliases: [
          ...(naturalEarthName === name ? [] : [naturalEarthName]),
          ...(COUNTRY_ALIASES[naturalEarthName] ?? []),
        ],
        kind,
        owner,
        lat: numberProperty(properties, "LABEL_Y"),
        lng: numberProperty(properties, "LABEL_X"),
        continent: CONTINENT_OVERRIDES[naturalEarthName]
          ?? stringProperty(properties, "CONTINENT"),
      },
    };
  });
  return selected.sort((left, right) =>
    left.place.id < right.place.id ? -1 : left.place.id > right.place.id ? 1 : 0,
  );
}

/** A name-keyed table entry that misses the list is a typo, not a rule. */
export function checkNameTables(sovereignNames: readonly string[]): void {
  for (const table of [COUNTRY_ALIASES, CONTINENT_OVERRIDES]) {
    for (const name of Object.keys(table)) {
      if (!sovereignNames.includes(name)) {
        throw new Error(`${name} is not on the country list`);
      }
    }
  }
  for (const [territory, owner] of Object.entries(TERRITORY_OWNER_OVERRIDES)) {
    if (sovereignNames.includes(territory) || !sovereignNames.includes(owner)) {
      throw new Error(`${territory} → ${owner} is not a territory of a listed country`);
    }
  }
}

export function generatePlaces(
  geojsonText: string,
  sovereignNames: readonly string[],
): Place[] {
  const places = selectPlaces(geojsonText, sovereignNames).map(({ place }) => place);
  // A folded name or alias names one place only, or a guess would be ambiguous.
  const owners = new Map<string, string>();
  for (const place of places) {
    for (const label of new Set([place.name, ...place.aliases].map(foldCountryName))) {
      const other = owners.get(label);
      if (other !== undefined) {
        throw new Error(`"${label}" names both ${other} and ${place.name}`);
      }
      owners.set(label, place.name);
    }
  }
  return places;
}

export function renderPlaces(places: readonly Place[]): string {
  return `${JSON.stringify(places, null, 2)}\n`;
}

export function modulePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

export const DEFAULT_CONFIG_PATH = modulePath("../../shared/countries/globe-countries.json");

interface GeneratorOptions {
  inputPath: string;
  configPath: string;
  outputPath: string;
}

function options(args: readonly string[]): GeneratorOptions {
  const parsed = parseArgs({
    args,
    options: {
      input: { type: "string" },
      list: { type: "string" },
      output: { type: "string" },
    },
    strict: true,
  });
  const input = parsed.values.input ?? process.env.NE_GEOJSON;
  if (!input) {
    throw new Error("Pass Natural Earth GeoJSON with --input or NE_GEOJSON");
  }
  return {
    inputPath: resolve(input),
    configPath: resolve(parsed.values.list ?? DEFAULT_CONFIG_PATH),
    outputPath: resolve(
      parsed.values.output ?? modulePath("../../shared/countries/core.json"),
    ),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const paths = options(args);
  const source = await readFile(paths.inputPath, "utf8");
  const config = parseGlobeConfig(await readFile(paths.configPath, "utf8"));
  checkNameTables(config.countries);
  const places = generatePlaces(source, config.countries);
  const ids = new Set(places.map((place) => place.id));
  const unknown = [...config.guessable, ...config.answers.map((entry) => entry.id)]
    .filter((id) => !ids.has(id));
  if (unknown.length > 0) {
    throw new Error(`Config ids not in the superset: ${[...new Set(unknown)].join(", ")}`);
  }
  await writeFile(paths.outputPath, renderPlaces(places));
  console.log(`Wrote ${places.length} places to ${paths.outputPath}.`);
}

if (process.argv[1]?.endsWith("generate-countries.ts")) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
