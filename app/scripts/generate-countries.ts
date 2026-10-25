import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { foldCountryName } from "../src/games/globe/names";

export interface Country {
  /** The readable name the picker, the guess rows and the result show. */
  name: string;
  lat: number;
  lng: number;
  continent: string;
  iso: string;
  /** Other names that find the country in the picker; never shown as its name. */
  aliases: string[];
}

export interface NaturalEarthProperties {
  NAME?: unknown;
  NAME_LONG?: unknown;
  SOVEREIGNT?: unknown;
  ISO_A3_EH?: unknown;
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

/** A feature picked for the globe: a guessable country, or a territory of one. */
export interface SelectedFeature {
  feature: NaturalEarthFeature;
  properties: NaturalEarthProperties;
  iso: string;
  /** Set for a territory: the `iso` of the guessable country that owns it. */
  owner?: string;
}

export interface Selection {
  countries: SelectedFeature[];
  territories: SelectedFeature[];
}

/**
 * D26 territory owners Natural Earth gives a sovereignty of their own, keyed
 * by Natural Earth `NAME` (Globle's choices, rebuilt from public-domain data).
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
 * A country's Natural Earth `NAME` is added when it differs from the shown one.
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

/** `ISO_A3_EH` is `-99` for a few countries; their name is the identity. */
export function countryIdentity(properties: NaturalEarthProperties): string {
  const naturalEarthIso = properties.ISO_A3_EH;
  return typeof naturalEarthIso === "string"
    && naturalEarthIso.trim() !== ""
    && naturalEarthIso !== "-99"
    ? naturalEarthIso
    : stringProperty(properties, "NAME");
}

export function parseCountryList(text: string): string[] {
  const parsed = JSON.parse(text) as { countries?: unknown };
  if (
    !Array.isArray(parsed.countries)
    || !parsed.countries.every((name) => typeof name === "string" && name !== "")
  ) {
    throw new TypeError("The country list must be {countries: string[]}");
  }
  const names = parsed.countries as string[];
  if (new Set(names).size !== names.length) {
    throw new Error("The country list repeats a name");
  }
  return names;
}

function parseCollection(geojsonText: string): NaturalEarthFeature[] {
  const parsed = JSON.parse(geojsonText) as NaturalEarthCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new TypeError("Natural Earth input must be a GeoJSON FeatureCollection");
  }
  return parsed.features as NaturalEarthFeature[];
}

/**
 * D26: the guessable countries are exactly the list's `NAME`s (never a
 * `TYPE` filter); every other feature is a territory of its `SOVEREIGNT`,
 * bar the overrides and the dropped features. A territory whose identity is
 * taken (Natural Earth gives two Australian territories `AUS`) is known by
 * its `NAME`, so every identity in the output is unique.
 */
export function selectFeatures(
  geojsonText: string,
  list: readonly string[],
): Selection {
  const features = parseCollection(geojsonText);
  const wanted = new Set(list);
  const byName = new Map<string, SelectedFeature>();
  const others: { feature: NaturalEarthFeature; properties: NaturalEarthProperties }[] = [];
  for (const feature of features) {
    if (!feature.properties) {
      throw new TypeError("Natural Earth feature has no properties");
    }
    const properties = feature.properties;
    const name = stringProperty(properties, "NAME");
    if (!wanted.has(name)) {
      others.push({ feature, properties });
      continue;
    }
    if (byName.has(name)) {
      throw new Error(`Duplicate Natural Earth NAME: ${name}`);
    }
    byName.set(name, { feature, properties, iso: countryIdentity(properties) });
  }

  const missing = list.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Listed countries missing from the input: ${missing.join(", ")}`);
  }

  const used = new Set<string>();
  const countries = list.map((name) => byName.get(name)!);
  for (const country of countries) {
    if (used.has(country.iso)) {
      throw new Error(`Duplicate country identity: ${country.iso}`);
    }
    used.add(country.iso);
  }

  const territories: SelectedFeature[] = [];
  for (const { feature, properties } of others) {
    const name = stringProperty(properties, "NAME");
    if (DROPPED_FEATURES.includes(name)) {
      continue;
    }
    const ownerName =
      TERRITORY_OWNER_OVERRIDES[name] ?? stringProperty(properties, "SOVEREIGNT");
    const owner = byName.get(ownerName);
    if (!owner) {
      throw new Error(`Territory ${name} has no guessable owner (${ownerName})`);
    }
    let iso = countryIdentity(properties);
    if (used.has(iso)) {
      iso = name;
    }
    if (used.has(iso)) {
      throw new Error(`Duplicate territory identity: ${iso}`);
    }
    used.add(iso);
    territories.push({ feature, properties, iso, owner: owner.iso });
  }
  return { countries, territories };
}

/** A name-keyed table entry that misses the list is a typo, not a rule. */
export function checkNameTables(list: readonly string[]): void {
  for (const table of [COUNTRY_ALIASES, DISPLAY_NAME_OVERRIDES, CONTINENT_OVERRIDES]) {
    for (const name of Object.keys(table)) {
      if (!list.includes(name)) {
        throw new Error(`${name} is not on the country list`);
      }
    }
  }
  for (const [territory, owner] of Object.entries(TERRITORY_OWNER_OVERRIDES)) {
    if (list.includes(territory) || !list.includes(owner)) {
      throw new Error(`${territory} → ${owner} is not a territory of a listed country`);
    }
  }
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

export function generateCountries(
  geojsonText: string,
  list: readonly string[],
): Country[] {
  const countries = selectFeatures(geojsonText, list).countries
    .map(({ properties, iso }): Country => {
      const naturalEarthName = stringProperty(properties, "NAME");
      const name = displayName(properties);
      const aliases = [
        ...(naturalEarthName === name ? [] : [naturalEarthName]),
        ...(COUNTRY_ALIASES[naturalEarthName] ?? []),
      ];
      return {
        name,
        lat: numberProperty(properties, "LABEL_Y"),
        lng: numberProperty(properties, "LABEL_X"),
        continent: CONTINENT_OVERRIDES[naturalEarthName]
          ?? stringProperty(properties, "CONTINENT"),
        iso,
        aliases,
      };
    })
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

  // A folded name or alias finds one country only, or a guess would be ambiguous.
  const owners = new Map<string, string>();
  for (const country of countries) {
    if (country.iso === "-99") {
      throw new Error(`${country.name} has the invalid -99 identity`);
    }
    for (const label of new Set([country.name, ...country.aliases].map(foldCountryName))) {
      const other = owners.get(label);
      if (other !== undefined) {
        throw new Error(`"${label}" names both ${other} and ${country.name}`);
      }
      owners.set(label, country.name);
    }
  }
  return countries;
}

export function renderCountries(countries: readonly Country[]): string {
  return `${JSON.stringify(countries, null, 2)}\n`;
}

export function modulePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

export const DEFAULT_LIST_PATH = modulePath("../../shared/countries/globe-countries.json");

interface GeneratorOptions {
  inputPath: string;
  listPath: string;
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
    listPath: resolve(parsed.values.list ?? DEFAULT_LIST_PATH),
    outputPath: resolve(
      parsed.values.output ?? modulePath("../../shared/countries/core.json"),
    ),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const paths = options(args);
  const source = await readFile(paths.inputPath, "utf8");
  const list = parseCountryList(await readFile(paths.listPath, "utf8"));
  checkNameTables(list);
  const countries = generateCountries(source, list);
  await writeFile(paths.outputPath, renderCountries(countries));
  console.log(`Wrote ${countries.length} countries to ${paths.outputPath}.`);
}

if (process.argv[1]?.endsWith("generate-countries.ts")) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
