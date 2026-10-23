import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export interface Country {
  name: string;
  lat: number;
  lng: number;
  continent: string;
  iso: string;
}

export interface NaturalEarthProperties {
  TYPE?: unknown;
  NAME?: unknown;
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

export function isCountryFeature(feature: NaturalEarthFeature): boolean {
  const type = feature.properties?.TYPE;
  return type === "Sovereign country" || type === "Country";
}

export function generateCountries(geojsonText: string): Country[] {
  const parsed = JSON.parse(geojsonText) as NaturalEarthCollection;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new TypeError("Natural Earth input must be a GeoJSON FeatureCollection");
  }

  const countries = (parsed.features as NaturalEarthFeature[])
    .filter(isCountryFeature)
    .map((feature): Country => {
      if (!feature.properties) {
        throw new TypeError("Natural Earth feature has no properties");
      }
      const properties = feature.properties;
      const name = stringProperty(properties, "NAME");
      return {
        name,
        lat: numberProperty(properties, "LABEL_Y"),
        lng: numberProperty(properties, "LABEL_X"),
        continent: stringProperty(properties, "CONTINENT"),
        iso: countryIdentity(properties),
      };
    })
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

  const names = new Set<string>();
  for (const country of countries) {
    if (country.iso === "-99") {
      throw new Error(`${country.name} has the invalid -99 identity`);
    }
    if (names.has(country.name)) {
      throw new Error(`Duplicate country name: ${country.name}`);
    }
    names.add(country.name);
  }
  return countries;
}

export function renderCountries(countries: readonly Country[]): string {
  return `${JSON.stringify(countries, null, 2)}\n`;
}

function modulePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

interface GeneratorOptions {
  inputPath: string;
  outputPath: string;
}

function options(args: readonly string[]): GeneratorOptions {
  const parsed = parseArgs({
    args,
    options: {
      input: { type: "string" },
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
    outputPath: resolve(
      parsed.values.output ?? modulePath("../../shared/countries/core.json"),
    ),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const paths = options(args);
  const source = await readFile(paths.inputPath, "utf8");
  const countries = generateCountries(source);
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
