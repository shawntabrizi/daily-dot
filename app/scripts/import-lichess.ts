import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { type Readable } from "node:stream";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import {
  validateChessFile,
  type ChessFile,
  type ChessPuzzle,
} from "./content-validation";

export const PUZZLE_COUNT = 400;
export const MIN_RATING = 1200;
export const MAX_RATING = 1800;
export const MIN_POPULARITY = 80;
export const MIN_PLAYS = 500;
export const MAX_PLIES = 4;

const SOURCE_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const EXPECTED_HEADER = [
  "PuzzleId",
  "FEN",
  "Moves",
  "Rating",
  "RatingDeviation",
  "Popularity",
  "NbPlays",
  "Themes",
  "GameUrl",
  "OpeningTags",
].join(",");
export interface LichessRow {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  popularity: number;
  plays: number;
  gameUrl: string;
}

export interface SelectionCounts {
  rows: number;
  ratingBand: number;
  popularity: number;
  plays: number;
  solutionLength: number;
}

export interface SelectionResult {
  selected: LichessRow[];
  counts: SelectionCounts;
}

function integer(value: string, label: string, line: number): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Line ${line} has invalid ${label}: ${value}`);
  }
  return Number(value);
}

export function parseLichessRow(line: string, lineNumber: number): LichessRow {
  const fields = line.split(",");
  if (fields.length !== 10) {
    throw new Error(
      `Line ${lineNumber} has ${fields.length} CSV columns; expected 10.`,
    );
  }
  const [
    puzzleId,
    fen,
    moves,
    rating,
    ,
    popularity,
    plays,
    ,
    gameUrl,
  ] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (!puzzleId || !fen || !moves || !gameUrl) {
    throw new Error(`Line ${lineNumber} is missing required puzzle data.`);
  }
  return {
    puzzleId,
    fen,
    moves: moves.trim().split(/\s+/).join(" "),
    rating: integer(rating, "Rating", lineNumber),
    popularity: integer(popularity, "Popularity", lineNumber),
    plays: integer(plays, "NbPlays", lineNumber),
    gameUrl,
  };
}

function comparePuzzleId(left: LichessRow, right: LichessRow): number {
  if (left.puzzleId < right.puzzleId) return -1;
  if (left.puzzleId > right.puzzleId) return 1;
  return 0;
}

function insertSorted(
  selected: LichessRow[],
  candidate: LichessRow,
  limit: number,
): void {
  if (
    selected.length === limit
    && comparePuzzleId(candidate, selected[selected.length - 1]!) >= 0
  ) {
    return;
  }
  let low = 0;
  let high = selected.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (comparePuzzleId(selected[middle]!, candidate) <= 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  selected.splice(low, 0, candidate);
  if (selected.length > limit) selected.pop();
}

function consider(
  result: SelectionResult,
  row: LichessRow,
  limit: number,
): void {
  result.counts.rows += 1;
  if (row.rating < MIN_RATING || row.rating > MAX_RATING) return;
  result.counts.ratingBand += 1;
  if (row.popularity < MIN_POPULARITY) return;
  result.counts.popularity += 1;
  if (row.plays < MIN_PLAYS) return;
  result.counts.plays += 1;
  if (row.moves.split(" ").length > MAX_PLIES) return;
  result.counts.solutionLength += 1;
  insertSorted(result.selected, row, limit);
}

export function selectLichessRows(
  rows: Iterable<LichessRow>,
  limit = PUZZLE_COUNT,
): SelectionResult {
  const result: SelectionResult = {
    selected: [],
    counts: {
      rows: 0,
      ratingBand: 0,
      popularity: 0,
      plays: 0,
      solutionLength: 0,
    },
  };
  for (const row of rows) consider(result, row, limit);
  return result;
}

function openInput(path: string): {
  stream: Readable;
  completed: Promise<void>;
  cancel: () => void;
} {
  if (!path.endsWith(".zst")) {
    const stream = createReadStream(path);
    return {
      stream,
      completed: Promise.resolve(),
      cancel: () => stream.destroy(),
    };
  }

  const child = spawn("zstd", ["-dc", path], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const completed = new Promise<void>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(
          new Error(
            `zstd failed (${signal ?? `exit ${String(code)}`}): `
              + stderr.trim(),
          ),
        );
      }
    });
  });
  void completed.catch(() => undefined);
  return {
    stream: child.stdout,
    completed,
    cancel: () => child.kill(),
  };
}

async function readSelection(path: string): Promise<SelectionResult> {
  const input = openInput(path);
  const lines = createInterface({
    input: input.stream,
    crlfDelay: Infinity,
  });
  const result = selectLichessRows([]);
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (lineNumber === 1) {
        if (line !== EXPECTED_HEADER) {
          throw new Error(`Unexpected Lichess CSV header: ${line}`);
        }
        continue;
      }
      if (line.length === 0) {
        throw new Error(`Line ${lineNumber} is unexpectedly empty.`);
      }
      consider(result, parseLichessRow(line, lineNumber), PUZZLE_COUNT);
    }
    await input.completed;
  } catch (error) {
    input.cancel();
    await input.completed.catch(() => undefined);
    throw error;
  }
  if (lineNumber === 0) throw new Error("The Lichess CSV is empty.");
  if (result.selected.length < PUZZLE_COUNT) {
    throw new Error(
      `Only ${result.selected.length} puzzles match all filters; `
        + `${PUZZLE_COUNT} are required.`,
    );
  }
  return result;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

interface RatingDistribution {
  min: number;
  max: number;
  mean: number;
  median: number;
  buckets: Array<{ range: string; count: number }>;
}

export function ratingDistribution(
  rows: readonly LichessRow[],
): RatingDistribution {
  if (rows.length === 0) throw new Error("Cannot rate an empty selection.");
  const ratings = rows.map((row) => row.rating).sort((a, b) => a - b);
  const middle = ratings.length / 2;
  const median = Number.isInteger(middle)
    ? (ratings[middle - 1]! + ratings[middle]!) / 2
    : ratings[Math.floor(middle)]!;
  const buckets: Array<{ range: string; count: number }> = [];
  for (let lower = MIN_RATING; lower < MAX_RATING; lower += 100) {
    buckets.push({
      range: `${lower}-${lower + 99}`,
      count: ratings.filter(
        (rating) => rating >= lower && rating <= lower + 99,
      ).length,
    });
  }
  buckets.push({
    range: `${MAX_RATING}`,
    count: ratings.filter((rating) => rating === MAX_RATING).length,
  });
  return {
    min: ratings[0]!,
    max: ratings[ratings.length - 1]!,
    mean: Math.round(
      (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)
        * 100,
    ) / 100,
    median,
    buckets,
  };
}

function provenancePath(outputPath: string): string {
  const extension = extname(outputPath);
  return `${outputPath.slice(0, -extension.length)}.provenance${extension}`;
}

interface ImportOptions {
  inputPath: string;
  outputPath: string;
  provenancePath: string;
}

function options(args: readonly string[]): ImportOptions {
  const parsed = parseArgs({
    args,
    options: {
      input: { type: "string" },
      output: { type: "string" },
      provenance: { type: "string" },
    },
    strict: true,
  });
  const input = parsed.values.input ?? process.env.LICHESS_DB;
  if (!input) {
    throw new Error("Pass --input <csv.zst> or set LICHESS_DB.");
  }
  const outputPath = resolve(
    parsed.values.output
      ?? fileURLToPath(new URL("../../shared/chess/core.json", import.meta.url)),
  );
  return {
    inputPath: resolve(input),
    outputPath,
    provenancePath: resolve(
      parsed.values.provenance ?? provenancePath(outputPath),
    ),
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const paths = options(args);
  await access(paths.inputPath);
  const inputHash = sha256(paths.inputPath);
  const result = await readSelection(paths.inputPath);
  const distribution = ratingDistribution(result.selected);
  const content: ChessFile = {
    name: "Daily Chess core",
    emoji: "♟️",
    startDay: 0,
    puzzles: result.selected.map(
      ({ fen, moves }): ChessPuzzle => ({ fen, moves }),
    ),
  };
  validateChessFile(content, "generated chess content");
  const provenance = {
    source: {
      url: SOURCE_URL,
      license: "CC0",
      inputSha256: await inputHash,
    },
    fenConvention:
      "Pre-opponent-move FEN with the full Lichess line; moves[0] is "
      + "auto-played before the player's first solution move.",
    selection: {
      rating: [MIN_RATING, MAX_RATING],
      minimumPopularity: MIN_POPULARITY,
      minimumPlays: MIN_PLAYS,
      maximumPlies: MAX_PLIES,
      order: "PuzzleId ascending",
      limit: PUZZLE_COUNT,
    },
    counts: result.counts,
    ratingDistribution: distribution,
    puzzles: result.selected.map(({ puzzleId, gameUrl, rating }) => ({
      puzzleId,
      gameUrl,
      rating,
    })),
  };
  await Promise.all([
    writeFile(paths.outputPath, `${JSON.stringify(content, null, 2)}\n`),
    writeFile(
      paths.provenancePath,
      `${JSON.stringify(provenance, null, 2)}\n`,
    ),
  ]);

  console.log(
    `Selection funnel: ${result.counts.rows} rows; `
      + `${result.counts.ratingBand} in rating band; `
      + `${result.counts.popularity} with popularity >= ${MIN_POPULARITY}; `
      + `${result.counts.plays} with plays >= ${MIN_PLAYS}; `
      + `${result.counts.solutionLength} with <= ${MAX_PLIES} plies.`,
  );
  console.log(
    `Selected ${content.puzzles.length} puzzles by PuzzleId. Ratings: `
      + `${distribution.min}-${distribution.max}, mean ${distribution.mean}, `
      + `median ${distribution.median}; buckets `
      + distribution.buckets
        .map(({ range, count }) => `${range}=${count}`)
        .join(", "),
  );
  console.log(`Wrote puzzles to ${paths.outputPath}.`);
  console.log(`Wrote provenance to ${paths.provenancePath}.`);
}

const moduleUrl = new URL(import.meta.url);
if (
  moduleUrl.protocol === "file:"
  && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(moduleUrl)
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
