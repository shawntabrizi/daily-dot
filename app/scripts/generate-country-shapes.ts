import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import {
  countryIdentity,
  isCountryFeature,
  type NaturalEarthFeature,
} from "./generate-countries";

/**
 * One country outline for the Globe globe: every polygon ring, flat
 * `[lng, lat, lng, lat, …]`, quantised to 0.1°. Holes stay in the list so an
 * even-odd fill leaves them open (Lesotho inside South Africa).
 */
export interface CountryShape {
  iso: string;
  rings: number[][];
}

export interface ShapeReport {
  shapes: CountryShape[];
  /** `core.json` identities with no usable ring: drawn as a centroid dot. */
  centroidOnly: string[];
  droppedRings: number;
}

/** Natural Earth 110m is ~1° resolution; 0.1° keeps every detail it has. */
const QUANTUM = 10;
/** A ring is a polygon only from 3 distinct points; 4 stops slivers. */
const MIN_RING_POINTS = 4;

type Position = [number, number];

function quantiseRing(ring: readonly Position[]): number[] | null {
  const points: Position[] = [];
  for (const [lng, lat] of ring) {
    const x = Math.round(lng * QUANTUM) / QUANTUM;
    const y = Math.round(lat * QUANTUM) / QUANTUM;
    const last = points[points.length - 1];
    if (last && last[0] === x && last[1] === y) {
      continue;
    }
    points.push([x, y]);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && points.length > 1 && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  if (points.length < MIN_RING_POINTS) {
    return null;
  }
  return points.flat();
}

function polygonRings(geometry: unknown): Position[][] {
  if (typeof geometry !== "object" || geometry === null) {
    throw new TypeError("Natural Earth feature has no geometry");
  }
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown };
  if (type === "Polygon") {
    return coordinates as Position[][];
  }
  if (type === "MultiPolygon") {
    return (coordinates as Position[][][]).flat();
  }
  throw new TypeError(`Unsupported geometry type ${String(type)}`);
}

export function generateCountryShapes(
  geojsonText: string,
  identities: readonly string[],
): ShapeReport {
  const parsed = JSON.parse(geojsonText) as { type?: unknown; features?: unknown };
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new TypeError("Natural Earth input must be a GeoJSON FeatureCollection");
  }

  const wanted = new Set(identities);
  const shapes = new Map<string, CountryShape>();
  let droppedRings = 0;
  for (const feature of (parsed.features as NaturalEarthFeature[]).filter(
    isCountryFeature,
  )) {
    if (!feature.properties) {
      throw new TypeError("Natural Earth feature has no properties");
    }
    const iso = countryIdentity(feature.properties);
    if (!wanted.has(iso)) {
      continue;
    }
    if (shapes.has(iso)) {
      throw new Error(`Duplicate country identity: ${iso}`);
    }
    const rings: number[][] = [];
    for (const ring of polygonRings(feature.geometry)) {
      const quantised = quantiseRing(ring);
      if (quantised) {
        rings.push(quantised);
      } else {
        droppedRings += 1;
      }
    }
    if (rings.length > 0) {
      shapes.set(iso, { iso, rings });
    }
  }

  return {
    shapes: [...shapes.values()].sort((left, right) =>
      left.iso < right.iso ? -1 : left.iso > right.iso ? 1 : 0,
    ),
    centroidOnly: identities.filter((iso) => !shapes.has(iso)),
    droppedRings,
  };
}

/** One shape per line keeps diffs readable without pretty-printing rings. */
export function renderCountryShapes(shapes: readonly CountryShape[]): string {
  return `[\n${shapes.map((shape) => `  ${JSON.stringify(shape)}`).join(",\n")}\n]\n`;
}

function modulePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

interface GeneratorOptions {
  inputPath: string;
  countriesPath: string;
  outputPath: string;
}

function options(args: readonly string[]): GeneratorOptions {
  const parsed = parseArgs({
    args,
    options: {
      input: { type: "string" },
      countries: { type: "string" },
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
    countriesPath: resolve(
      parsed.values.countries ?? modulePath("../../shared/countries/core.json"),
    ),
    outputPath: resolve(
      parsed.values.output ?? modulePath("../../shared/countries/shapes.json"),
    ),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const paths = options(args);
  const source = await readFile(paths.inputPath, "utf8");
  const countries = JSON.parse(
    await readFile(paths.countriesPath, "utf8"),
  ) as { iso: string }[];
  const report = generateCountryShapes(
    source,
    countries.map((country) => country.iso),
  );
  await writeFile(paths.outputPath, renderCountryShapes(report.shapes));
  console.log(
    `Wrote ${report.shapes.length} shapes to ${paths.outputPath} `
      + `(${report.droppedRings} rings under ${MIN_RING_POINTS} points dropped).`,
  );
  console.log(
    report.centroidOnly.length === 0
      ? "Every country has an outline."
      : `Centroid-only: ${report.centroidOnly.join(", ")}`,
  );
}

if (process.argv[1]?.endsWith("generate-country-shapes.ts")) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
