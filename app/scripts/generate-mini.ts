/**
 * Generate the Daily Mini puzzle set: seeded, pure, byte-identical on rerun.
 *
 * Grids come from a fixed menu of 5×5 layouts (2–5 black squares, every entry
 * at least three letters, so exactly ten entries each). The fill is a
 * most-constrained-slot backtracking search over `shared/mini/pool.source.json`.
 * Content rules: an answer never repeats inside a 120-day window, appears at
 * most three times in the whole set, and never twice in one grid. Words that
 * already appeared (outside the window) are preferred, which keeps the number
 * of distinct answers — and so of clues to write — small.
 *
 * Clues live in `shared/mini/clues.source.json` (`{ "ANSWER": "clue" }`) and are
 * merged in; a missing clue fails the run and lists the answers to write.
 *
 *   pnpm generate:mini                 # writes shared/mini/core.json
 *   pnpm generate:mini -- --answers    # prints the distinct answers instead
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  MINI_CELLS,
  MINI_SIZE,
  miniEntries,
  miniGridShapeError,
  type MiniEntry,
} from "../src/games/mini/grid";

export const MINI_PUZZLE_COUNT = 400;
export const MINI_REPEAT_WINDOW_DAYS = 120;
export const MINI_MAX_USES = 4;
export const MINI_SEED = 0x6d696e69; // "mini"
export const MINI_FILL_RESTARTS = 4;
export const MINI_MAX_BACKTRACKS = 400;
export const MINI_FILL_BUDGET = 20_000;

/** Rows top to bottom; "." is a white square. Every layout passes the shape rule. */
export const MINI_LAYOUTS: readonly string[] = [
  "#...." + "....." + "....." + "....." + "....#",
  "....#" + "....." + "....." + "....." + "#....",
  "##..." + "#...." + "....." + "....." + ".....",
  "...##" + "....#" + "....." + "....." + ".....",
  "....." + "....." + "....." + "#...." + "##...",
  "....." + "....." + "....." + "....#" + "...##",
  "##..." + "....." + "....." + "....." + "...##",
  "...##" + "....." + "....." + "....." + "##...",
  "#...#" + "....." + "....." + "....." + "#...#",
  "##..." + "#...." + "....." + "....#" + "....#",
  "...##" + "....#" + "....." + "#...." + "#....",
];

export interface MiniPuzzle {
  grid: string;
  across: string[];
  down: string[];
}

export interface MiniFile {
  name: string;
  emoji: string;
  startDay: number;
  puzzles: MiniPuzzle[];
}

export type MiniPool = Record<string, readonly string[]>;

/** mulberry32: small, seedable, and identical on every platform. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface Usage {
  lastDay: number;
  uses: number;
}

/**
 * The repeat rules: never within the window, and never more than
 * `MINI_MAX_USES` times in the whole set. `seen` is undefined for a word that
 * has not appeared yet.
 */
export function wordEligible(seen: Usage | undefined, day: number): boolean {
  if (!seen) {
    return true;
  }
  return seen.uses < MINI_MAX_USES && day - seen.lastDay >= MINI_REPEAT_WINDOW_DAYS;
}

/** Words of one length in preference order, indexed by (position, letter). */
export class WordIndex {
  readonly words: readonly string[];
  readonly ids = new Map<string, number>();
  /** The first `reusableCount` words have appeared before (clue exists). */
  readonly reusableCount: number;
  readonly #byPosition: number[][][];

  constructor(words: readonly string[], length: number, reusableCount = 0) {
    this.words = words;
    this.reusableCount = reusableCount;
    this.#byPosition = Array.from({ length }, () =>
      Array.from({ length: 26 }, () => [] as number[]),
    );
    words.forEach((word, id) => {
      this.ids.set(word, id);
      for (let position = 0; position < length; position += 1) {
        this.#byPosition[position]![word.charCodeAt(position) - 65]!.push(id);
      }
    });
  }

  /** Ids matching the pattern, ascending (= preference order). */
  matches(pattern: string): number[] {
    let lists: number[][] = [];
    for (let position = 0; position < pattern.length; position += 1) {
      const letter = pattern.charCodeAt(position) - 65;
      if (letter >= 0 && letter < 26) {
        lists.push(this.#byPosition[position]![letter]!);
      }
    }
    if (lists.length === 0) {
      return this.words.map((_, id) => id);
    }
    lists = lists.sort((left, right) => left.length - right.length);
    let result = lists[0]!;
    for (let next = 1; next < lists.length; next += 1) {
      result = intersect(result, lists[next]!);
      if (result.length === 0) break;
    }
    return result;
  }
}

function intersect(left: readonly number[], right: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i]!;
    const b = right[j]!;
    if (a === b) {
      out.push(a);
      i += 1;
      j += 1;
    } else if (a < b) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return out;
}

interface Slot {
  entry: MiniEntry;
  index: WordIndex;
  word: string | null;
  /** Candidate order for this slot: abundant crossing letters first. */
  rank: number[];
}

function patternOf(grid: string[], entry: MiniEntry): string {
  return entry.cells.map((cell) => grid[cell]!).join("");
}

/** Letter counts per (length, position) over a set of words. */
export function letterCounts(
  wordsByLength: ReadonlyMap<number, readonly string[]>,
): Map<number, number[][]> {
  const supply = new Map<number, number[][]>();
  for (const [length, words] of wordsByLength) {
    const counts = Array.from({ length }, () => new Array<number>(26).fill(0));
    for (const word of words) {
      for (let position = 0; position < length; position += 1) {
        counts[position]![word.charCodeAt(position) - 65]! += 1;
      }
    }
    supply.set(length, counts);
  }
  return supply;
}

/**
 * How much of each (length, position, letter) feature is still eligible,
 * relative to the whole pool: 1 untouched, 0 exhausted. Spending features in
 * proportion to their supply keeps the pool fillable through the trough just
 * before the repeat window reopens.
 */
export function letterDepletion(
  eligible: ReadonlyMap<number, WordIndex>,
  pool: ReadonlyMap<number, number[][]>,
): Map<number, number[][]> {
  const current = letterCounts(
    new Map([...eligible].map(([length, index]) => [length, index.words])),
  );
  const depletion = new Map<number, number[][]>();
  for (const [length, counts] of current) {
    const base = pool.get(length);
    depletion.set(
      length,
      counts.map((row, position) =>
        row.map((count, letter) => {
          const total = base?.[position]?.[letter] ?? 0;
          return total === 0 ? 0 : count / total;
        }),
      ),
    );
  }
  return depletion;
}

/**
 * Fill one layout. `eligible` holds the words allowed today per length.
 * Candidates are tried in an order that spends the pool evenly: a word whose
 * letters are plentiful at the crossing positions comes first, so the
 * scarce features (vowel-initial five-letter words, say) are kept for the
 * days that need them. Returns the grid or null when the budget runs out.
 */
export function fillLayout(
  layout: string,
  eligible: ReadonlyMap<number, WordIndex>,
  budget = 60_000,
  random: () => number = () => 0,
  pool: ReadonlyMap<number, number[][]> = letterCounts(
    new Map([...eligible].map(([length, index]) => [length, index.words])),
  ),
): string | null {
  const entries = miniEntries(layout);
  const all = [...entries.across, ...entries.down];
  const depletion = letterDepletion(eligible, pool);
  const slots: Slot[] = all.map((entry) => {
    const index = eligible.get(entry.cells.length);
    if (!index) {
      throw new Error(`No words of length ${entry.cells.length}`);
    }
    // For each position: the crossing slot's length and position there.
    const crossings = entry.cells.map((cell) => {
      const other = all.find(
        (candidate) => candidate.dir !== entry.dir && candidate.cells.includes(cell),
      )!;
      return { length: other.cells.length, position: other.cells.indexOf(cell) };
    });
    const own = depletion.get(entry.cells.length)!;
    const score = index.words.map((word, id) => {
      let total = 0;
      for (let position = 0; position < word.length; position += 1) {
        const letter = word.charCodeAt(position) - 65;
        const crossing = crossings[position]!;
        const across = depletion.get(crossing.length)?.[crossing.position]?.[letter] ?? 0;
        total += Math.log(0.05 + (own[position]?.[letter] ?? 0)) + Math.log(0.05 + across);
      }
      // Higher = less depleted features. Reusable words (lower ids) get a
      // bonus: they cost no new clue. Jitter breaks ties and varies restarts.
      return {
        id,
        key: -total / word.length + random() * 0.6 + (id < index.reusableCount ? -1.5 : 0),
      };
    });
    score.sort((left, right) => left.key - right.key);
    const rank = new Array<number>(index.words.length);
    score.forEach((item, position) => {
      rank[item.id] = position;
    });
    return { entry, index, word: null, rank };
  });
  const grid = [...layout];
  const used = new Set<string>();
  let nodes = 0;

  const search = (): boolean => {
    let best: Slot | null = null;
    let bestOptions: number[] = [];
    for (const slot of slots) {
      if (slot.word !== null) continue;
      const pattern = patternOf(grid, slot.entry);
      const options = slot.index.matches(pattern).filter(
        (id) => !used.has(slot.index.words[id]!),
      );
      if (options.length === 0) {
        return false;
      }
      if (best === null || options.length < bestOptions.length) {
        best = slot;
        bestOptions = options;
      }
    }
    if (best === null) {
      return true;
    }
    const chosen = best;
    bestOptions.sort((left, right) => chosen.rank[left]! - chosen.rank[right]!);
    for (const id of bestOptions) {
      nodes += 1;
      if (nodes > budget) {
        return false;
      }
      const word = chosen.index.words[id]!;
      const previous = chosen.entry.cells.map((cell) => grid[cell]!);
      chosen.entry.cells.forEach((cell, index) => {
        grid[cell] = word[index]!;
      });
      chosen.word = word;
      used.add(word);
      // A placement can complete crossing slots: each must be an allowed,
      // still-unused word.
      const completed: Slot[] = [];
      let consistent = true;
      for (const slot of slots) {
        if (slot.word !== null) continue;
        const pattern = patternOf(grid, slot.entry);
        if (pattern.includes(".")) continue;
        if (!slot.index.ids.has(pattern) || used.has(pattern)) {
          consistent = false;
          break;
        }
        slot.word = pattern;
        used.add(pattern);
        completed.push(slot);
      }
      if (consistent && search()) {
        return true;
      }
      for (const slot of completed) {
        used.delete(slot.word!);
        slot.word = null;
      }
      used.delete(word);
      chosen.word = null;
      chosen.entry.cells.forEach((cell, index) => {
        grid[cell] = previous[index]!;
      });
      if (nodes > budget) {
        return false;
      }
    }
    return false;
  };

  if (!search()) {
    return null;
  }
  const filled = grid.join("");
  const words = all.map((entry) =>
    entry.cells.map((cell) => filled[cell]!).join(""),
  );
  if (new Set(words).size !== words.length) {
    throw new Error("fill produced a repeated answer");
  }
  return filled;
}

function entryLengths(layout: string): number[] {
  const entries = miniEntries(layout);
  return [...entries.across, ...entries.down].map((entry) => entry.cells.length);
}


export interface GeneratedMini {
  grids: string[];
  distinctAnswers: string[];
}

export function generateMiniGrids(
  pool: MiniPool,
  count = MINI_PUZZLE_COUNT,
  seed = MINI_SEED,
): GeneratedMini {
  const random = seededRandom(seed);
  const usage = new Map<string, Usage>();
  const grids: string[] = [];
  const byLength = new Map<number, readonly string[]>(
    Object.entries(pool).map(([length, words]) => [Number(length), words]),
  );
  const poolCounts = letterCounts(byLength);
  // Cross-day backtracking: when a day cannot be filled, the previous day is
  // undone and refilled with a different draw. Bounded so a hopeless pool
  // fails loudly instead of looping.
  const history: { grid: string; restore: Map<string, Usage | undefined> }[] = [];
  const forbiddenByDay = new Map<number, Set<string>>();
  let backtracks = 0;

  for (let day = 0; day < count; day += 1) {
    const forbidden = forbiddenByDay.get(day) ?? new Set<string>();
    const fillDay = (): string | null => {
    const groups = new Map<number, { reusable: string[]; fresh: string[] }>();
    for (const [length, words] of byLength) {
      const reusable: string[] = [];
      const fresh: string[] = [];
      for (const word of words) {
        const seen = usage.get(word);
        if (!seen) {
          fresh.push(word);
        } else if (wordEligible(seen, day)) {
          reusable.push(word);
        }
      }
      groups.set(length, { reusable, fresh });
    }
    if (process.env.MINI_DUMP_DAY === String(day)) {
      // Debug hook: write the day's eligible words and stop.
      const dump = Object.fromEntries(
        [...groups].map(([length, group]) => [length, [...group.reusable, ...group.fresh]]),
      );
      console.log(JSON.stringify(dump));
      process.exit(0);
    }
    // Reusable words first: a word seen before costs no new clue. The fill
    // orders candidates by letter supply itself.
    const eligible = new Map<number, WordIndex>(
      [...groups].map(([length, group]) => [
        length,
        new WordIndex([...group.reusable, ...group.fresh], length, group.reusable.length),
      ]),
    );

    // Spread consumption across word lengths: a layout that leans on the
    // length with the least headroom left (fraction of its pool still
    // eligible) sorts later. Three-letter words are the scarce resource
    // (385 in the pool against a 120-day window).
    const pressure = new Map<number, number>();
    for (const [length, group] of groups) {
      const total = byLength.get(length)?.length ?? 1;
      pressure.set(length, 1 - (group.reusable.length + group.fresh.length) / total);
    }
    const meanPressure =
      [...pressure.values()].reduce((sum, value) => sum + value, 0) / pressure.size;
    const order = MINI_LAYOUTS.map((layout) => ({
      layout,
      key:
        random()
        + 0.4 * entryLengths(layout).reduce(
          (sum, length) => sum + ((pressure.get(length) ?? 0) - meanPressure),
          0,
        ),
    }))
      .sort((left, right) => left.key - right.key)
      .map((item) => item.layout);
    let filled: string | null = null;
    let picked = "";
    // Random restarts: a fresh candidate order escapes a barren subtree far
    // more often than a larger budget on the same order.
    attempts: for (let attempt = 0; attempt < MINI_FILL_RESTARTS; attempt += 1) {
      for (const layout of order) {
        filled = fillLayout(layout, eligible, MINI_FILL_BUDGET, random, poolCounts);
        if (filled && forbidden.has(filled)) {
          filled = null;
        }
        if (filled) {
          picked = layout;
          break attempts;
        }
      }
    }
    if (process.env.MINI_TRACE) {
      console.error(
        `day ${day}: eligible ${[...groups].map(([l, g]) => `${l}:${g.reusable.length + g.fresh.length}`).join(" ")} layout ${picked.replace(/\./g, "_")}`,
      );
    }
    return filled;
    };

    let filled = fillDay();
    if (!filled) {
      const previous = history.pop();
      if (!previous || backtracks >= MINI_MAX_BACKTRACKS) {
        throw new Error(`Could not fill day ${day}; the pool is too small.`);
      }
      backtracks += 1;
      for (const [word, before] of previous.restore) {
        if (before) usage.set(word, before);
        else usage.delete(word);
      }
      grids.pop();
      if (process.env.MINI_TRACE) {
        console.error(`day ${day}: stuck; refilling day ${day - 1} (backtrack ${backtracks})`);
      }
      day -= 2; // the loop's increment lands on day - 1
      // The redone day must not reproduce the grid that led here.
      forbiddenByDay.set(day + 1, new Set([...(forbiddenByDay.get(day + 1) ?? []), previous.grid]));
      continue;
    }
    const shape = miniGridShapeError(filled);
    if (shape) {
      throw new Error(`Day ${day}: ${shape}`);
    }
    const entries = miniEntries(filled);
    const restore = new Map<string, Usage | undefined>();
    for (const entry of [...entries.across, ...entries.down]) {
      const seen = usage.get(entry.answer);
      restore.set(entry.answer, seen);
      usage.set(entry.answer, {
        lastDay: day,
        uses: (seen?.uses ?? 0) + 1,
      });
    }
    grids.push(filled);
    history.push({ grid: filled, restore });
  }

  return {
    grids,
    distinctAnswers: [...usage.keys()].sort(),
  };
}

export function assembleMiniFile(
  grids: readonly string[],
  clues: Readonly<Record<string, string>>,
): { file: MiniFile; missing: string[] } {
  const missing = new Set<string>();
  const puzzles = grids.map((grid) => {
    const entries = miniEntries(grid);
    const clueFor = (entry: MiniEntry): string => {
      const clue = clues[entry.answer];
      if (!clue) {
        missing.add(entry.answer);
        return "";
      }
      return clue;
    };
    return {
      grid,
      across: entries.across.map(clueFor),
      down: entries.down.map(clueFor),
    };
  });
  return {
    file: {
      name: "Daily Mini core",
      emoji: "🔠",
      startDay: 0,
      puzzles,
    },
    missing: [...missing].sort(),
  };
}

function modulePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

async function main(): Promise<void> {
  const pool = JSON.parse(
    await readFile(modulePath("../../shared/mini/pool.source.json"), "utf8"),
  ) as MiniPool;
  const generated = generateMiniGrids(pool);
  if (process.argv.includes("--answers")) {
    for (const answer of generated.distinctAnswers) {
      console.log(answer);
    }
    console.error(
      `${generated.grids.length} grids, ${generated.distinctAnswers.length} distinct answers`,
    );
    return;
  }
  let clues: Record<string, string> = {};
  try {
    clues = JSON.parse(
      await readFile(modulePath("../../shared/mini/clues.source.json"), "utf8"),
    ) as Record<string, string>;
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") throw error;
  }
  const { file, missing } = assembleMiniFile(generated.grids, clues);
  if (missing.length > 0) {
    console.error(`${missing.length} answers have no clue:\n${missing.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  const output = modulePath("../../shared/mini/core.json");
  await writeFile(output, `${JSON.stringify(file, null, 2)}\n`);
  const layouts = new Map<string, number>();
  for (const grid of generated.grids) {
    const key = grid.replace(/[A-Z]/g, ".");
    layouts.set(key, (layouts.get(key) ?? 0) + 1);
  }
  console.log(
    `Wrote ${file.puzzles.length} puzzles (${generated.distinctAnswers.length} distinct answers, ${layouts.size} layouts) to ${output}`,
  );
  void MINI_CELLS;
  void MINI_SIZE;
}

if (process.argv[1]?.endsWith("generate-mini.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
