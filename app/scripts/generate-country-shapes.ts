import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  DEFAULT_CONFIG_PATH,
  modulePath,
  parseGlobeConfig,
  selectPlaces,
  type SelectedFeature,
} from "./generate-countries";

/**
 * One place's outline for the Globe globe (`core.json` holds the rest of
 * the place): every polygon ring, flat `[lng, lat, lng, lat, …]`,
 * simplified and quantised. Holes stay in the list so an even-odd fill
 * leaves them open (Lesotho inside South Africa).
 */
export interface CountryShape {
  id: string;
  rings: number[][];
}

export interface ShapeReport {
  shapes: CountryShape[];
  /** Place ids with no usable ring: drawn as a label-point dot. */
  centroidOnly: string[];
  droppedRings: number;
  /** Features whose every ring was a speck at 0.1°, kept at a finer grid. */
  finerRings: string[];
}

/** 0.1° is about 11 km: finer than a globe pixel at 4× zoom on a phone. */
const QUANTUM = 10;
/** The finer grids a feature's last ring may fall back to (Vatican is ~0.004°). */
const FINE_QUANTA = [100, 1000, 10000] as const;
/** Douglas–Peucker tolerance, in grid steps, applied before quantising. */
const SIMPLIFY_STEPS = 0.5;
/** A ring is a polygon only from 3 distinct points; 4 stops slivers. */
const MIN_RING_POINTS = 4;

type Position = [number, number];

function perpendicularDistance(point: Position, start: Position, end: Position): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0])
    / length;
}

/** Iterative Douglas–Peucker over an open polyline; keeps both ends. */
function simplify(points: readonly Position[], tolerance: number): Position[] {
  if (points.length <= 2) {
    return [...points];
  }
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const candidate = perpendicularDistance(points[index]!, points[first]!, points[last]!);
      if (candidate > distance) {
        distance = candidate;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

function quantiseRing(ring: readonly Position[], quantum: number): number[] | null {
  // A closed ring split at its farthest point simplifies as two open halves,
  // so Douglas–Peucker never collapses it to its own start point.
  const open = ring.length > 1
    && ring[0]![0] === ring[ring.length - 1]![0]
    && ring[0]![1] === ring[ring.length - 1]![1]
    ? ring.slice(0, -1)
    : [...ring];
  if (open.length === 0) {
    return null;
  }
  let split = 0;
  let farthest = -1;
  for (let index = 1; index < open.length; index += 1) {
    const distance = Math.hypot(open[index]![0] - open[0]![0], open[index]![1] - open[0]![1]);
    if (distance > farthest) {
      farthest = distance;
      split = index;
    }
  }
  const tolerance = SIMPLIFY_STEPS / quantum;
  const simplified = [
    ...simplify(open.slice(0, split + 1), tolerance),
    ...simplify([...open.slice(split), open[0]!], tolerance).slice(1, -1),
  ];

  const points: Position[] = [];
  for (const [lng, lat] of simplified) {
    const x = Math.round(lng * quantum) / quantum;
    const y = Math.round(lat * quantum) / quantum;
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

function boundingArea(ring: readonly Position[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return (maxX - minX) * (maxY - minY);
}

function shapeRings(
  selected: SelectedFeature,
): { rings: number[][]; dropped: number; finer: boolean } {
  const source = polygonRings(selected.feature.geometry);
  const rings: number[][] = [];
  let dropped = 0;
  for (const ring of source) {
    const quantised = quantiseRing(ring, QUANTUM);
    if (quantised) {
      rings.push(quantised);
    } else {
      dropped += 1;
    }
  }
  if (rings.length > 0 || source.length === 0) {
    return { rings, dropped, finer: false };
  }
  // Never lose a feature's last ring: its largest ring on the first finer
  // grid that keeps it a polygon (Vatican, Monaco, Nauru…).
  let largest = source[0]!;
  for (const ring of source) {
    if (boundingArea(ring) > boundingArea(largest)) {
      largest = ring;
    }
  }
  for (const quantum of FINE_QUANTA) {
    const quantised = quantiseRing(largest, quantum);
    if (quantised) {
      return { rings: [quantised], dropped: dropped - 1, finer: true };
    }
  }
  return { rings, dropped, finer: false };
}

export function generateCountryShapes(
  geojsonText: string,
  sovereignNames: readonly string[],
): ShapeReport {
  const shapes: CountryShape[] = [];
  const centroidOnly: string[] = [];
  const finerRings: string[] = [];
  let droppedRings = 0;
  // selectPlaces returns id order, so the output is too.
  for (const selected of selectPlaces(geojsonText, sovereignNames)) {
    const { rings, dropped, finer } = shapeRings(selected);
    droppedRings += dropped;
    if (finer) {
      finerRings.push(selected.place.id);
    }
    if (rings.length === 0) {
      centroidOnly.push(selected.place.id);
      continue;
    }
    shapes.push({ id: selected.place.id, rings });
  }
  return { shapes, centroidOnly, droppedRings, finerRings };
}

/** One shape per line keeps diffs readable without pretty-printing rings. */
export function renderCountryShapes(shapes: readonly CountryShape[]): string {
  return `[\n${shapes.map((shape) => `  ${JSON.stringify(shape)}`).join(",\n")}\n]\n`;
}

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
      parsed.values.output ?? modulePath("../../shared/countries/shapes.json"),
    ),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const paths = options(args);
  const source = await readFile(paths.inputPath, "utf8");
  const config = parseGlobeConfig(await readFile(paths.configPath, "utf8"));
  const report = generateCountryShapes(source, config.countries);
  await writeFile(paths.outputPath, renderCountryShapes(report.shapes));
  console.log(
    `Wrote ${report.shapes.length} place shapes to ${paths.outputPath} `
      + `(${report.droppedRings} rings under ${MIN_RING_POINTS} points dropped).`,
  );
  console.log(
    report.finerRings.length === 0
      ? "No feature needed a finer grid."
      : `Kept on a finer grid: ${report.finerRings.join(", ")}`,
  );
  console.log(
    report.centroidOnly.length === 0
      ? "Every place has an outline."
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
