import { dayIndexFromTimestamp } from "./day";
import { scoreBucket, type Histogram } from "./percentile";
import type { StorageLike } from "./storage";
import { COUNT_BUCKETS, GAME_ROSTER, type Game } from "./roster";
import { WORD_LENGTH } from "../games/word/engine";

export interface DayBits {
  played: bigint;
  solved: bigint;
  ontime: bigint;
}

export interface ChessPuzzle {
  fen: string;
  moves: string;
}

/** A Daily Mini: the filled 5×5 grid ("#" = black) and its clues in numbering order. */
export interface MiniPuzzle {
  grid: string;
  across: string[];
  down: string[];
}

/** One Connections group: four words, a label and a tier (0 easiest … 3). */
export interface ConnectionsGroup {
  label: string;
  words: string[];
  tier: number;
}

export interface ConnectionsPuzzle {
  groups: ConnectionsGroup[];
}

/** One recorded game-day: `DailyScores.getDetail` (D13). */
export interface Detail {
  score: number;
  solved: boolean;
}

export interface DataSource {
  currentDay(): Promise<number>;
  /** The day's six-letter answer. */
  wordAnswer(day: number): Promise<string>;
  chessPuzzle?(day: number): Promise<ChessPuzzle>;
  miniPuzzle?(day: number): Promise<MiniPuzzle>;
  connectionsPuzzle?(day: number): Promise<ConnectionsPuzzle>;
  dayBits(day: number): Promise<DayBits>;
  dayBitsRange(from: number, count: number): Promise<DayBits[]>;
  record(gameId: number, day: number, score: number, solved: boolean): Promise<void>;
  /**
   * The day's distribution for one game (WP34). The transaction receipt
   * carries no return data, so a game reads this once after its `record`.
   * Optional like `chessPuzzle`: a view that finds it missing says the
   * distribution is unavailable instead of failing the game.
   */
  histogram?(gameId: number, day: number): Promise<Histogram>;
  /** Every listed game's distribution for one day, in one read. */
  histograms?(day: number, gameIds: readonly number[]): Promise<Histogram[]>;
  /**
   * The account's recorded scores for the listed games on one day. A game
   * without a record comes back `{score: 0, solved: false}`; `dayBits` tells
   * the two apart.
   */
  details?(day: number, gameIds: readonly number[]): Promise<Detail[]>;
}

interface StoredResult {
  gameId: number;
  day: number;
  score: number;
  solved: boolean;
  ontime: boolean;
}

const RESULT_STORAGE_KEY = "daily-on-dot:stub-results:v1";
const EMPTY_BITS: DayBits = { played: 0n, solved: 0n, ontime: 0n };

const WORDS: readonly string[] = ["planet", "garden", "silver", "bridge", "candle"];

const CHESS_PUZZLES = new Map<number, ChessPuzzle>([
  [
    59,
    {
      fen: "1r4k1/4Ppbp/p5p1/2q5/p2n4/P2Q2B1/r2N1PPP/3KR2R b - - 0 27",
      moves: "g7h6 e7e8q b8e8 e1e8",
    },
  ],
  [
    208,
    {
      fen: "5b1r/1Q3p2/p3pk1p/1p1p2p1/3q4/1P3PPP/P5P1/2RK1B1R w - - 0 22",
      moves: "d1e2 d4b2 e2d3 b2c1",
    },
  ],
]);

// Three sample minis for the stub source; day % 3 picks one.
const MINI_PUZZLES: readonly MiniPuzzle[] = [
  {
    grid: "#GET#" + "HEART" + "ANGER" + "DELAY" + "#SET#",
    across: ["Obtain", "Valentine symbol", "Fury", "Hold up", "Tennis unit"],
    down: ["Possessed", "DNA units", "Bird on the US seal", "Halloween request", "Give it a go"],
  },
  {
    grid: "PAN##" + "ACORN" + "INDIE" + "NEEDS" + "##SET",
    across: ["Frying vessel", "Oak's seed", "Small-label music genre", "Requirements", "Tennis unit"],
    down: ["Ache", "Teen skin woe", "Network points", "Carnival attraction", "Bird's home"],
  },
  {
    grid: "DIG##" + "ITEM#" + "DENIM" + "#MINI" + "#SEED",
    across: ["Use a shovel", "Thing on a list", "Jeans fabric", "This puzzle's size", "Start of a plant"],
    down: ["Performed", "Shopping list entries", "Lamp dweller", "Belonging to me", "Halfway prefix"],
  },
];

// Three sample Connections for the stub source (days 0–2 of the authored
// set); day % 3 picks one.
const CONNECTIONS_PUZZLES: readonly ConnectionsPuzzle[] = [
  {
    groups: [
      { label: "Breads", words: ["roll", "loaf", "bun", "baguette"], tier: 0 },
      { label: "Things with keys", words: ["piano", "keyboard", "lock", "map"], tier: 1 },
      { label: "Ways to move on foot", words: ["walk", "skip", "hop", "jog"], tier: 2 },
      { label: "Ice ___", words: ["cream", "cube", "age", "berg"], tier: 3 },
    ],
  },
  {
    groups: [
      { label: "Planets", words: ["Mars", "Venus", "Saturn", "Mercury"], tier: 0 },
      { label: "Chess pieces", words: ["king", "queen", "rook", "bishop"], tier: 1 },
      { label: "Candy bar fillings", words: ["nougat", "caramel", "peanut", "wafer"], tier: 2 },
      { label: "___ ball", words: ["snow", "foot", "eye", "meat"], tier: 3 },
    ],
  },
  {
    groups: [
      { label: "Fruits", words: ["apple", "mango", "cherry", "plum"], tier: 0 },
      { label: "Dog commands", words: ["sit", "stay", "heel", "fetch"], tier: 1 },
      { label: "Parts of a book", words: ["spine", "index", "chapter", "cover"], tier: 2 },
      { label: "Hidden body parts", words: ["hearth", "legend", "shindig", "chinook"], tier: 3 },
    ],
  },
];

for (const word of WORDS) {
  if (word.length !== WORD_LENGTH || !/^[a-z]+$/.test(word)) {
    throw new Error("Stub words must be six lowercase letters");
  }
}

function loadStoredResults(storage: StorageLike): StoredResult[] {
  const raw = storage.getItem(RESULT_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is StoredResult => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const result = entry as Partial<StoredResult>;
      return (
        Number.isInteger(result.gameId) &&
        Number.isInteger(result.day) &&
        Number.isInteger(result.score) &&
        typeof result.solved === "boolean" &&
        typeof result.ontime === "boolean"
      );
    });
  } catch {
    return [];
  }
}

function setBit(bitmap: bigint, gameId: number): bigint {
  return bitmap | (1n << BigInt(gameId));
}

/** A gameId off the roster reads as an unset spec does on chain: counts. */
function gameOf(gameId: number): Pick<Game, "kind" | "buckets"> {
  return GAME_ROSTER.find((game) => game.gameId === gameId) ?? { kind: "count", buckets: COUNT_BUCKETS };
}

/** The stub's typical score and spread per kind: four guesses, four minutes, 32 points. */
const TYPICAL = {
  count: { center: 4, spread: 2, floor: 1 },
  seconds: { center: 240, spread: 120, floor: 0 },
  points: { center: 320, spread: 80, floor: 0 },
} as const;

/** A small deterministic generator so the stub's "other finishers" are stable per day. */
function* pseudoRandom(seed: number): Generator<number> {
  let state = (seed * 2_654_435_761 + 12_345) >>> 0;
  for (;;) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    yield state / 0x1_0000_0000;
  }
}

/**
 * The day's other finishers, invented: a hump of 15–40 scores around a
 * typical result (four guesses, four minutes, 32 points), bucketed by the
 * game's spec as the contract would. Real records recorded through this
 * source land on top of them.
 */
function seededHistogram(gameId: number, day: number): Map<number, number> {
  const game = gameOf(gameId);
  const { center, spread, floor } = TYPICAL[game.kind];
  const random = pseudoRandom(day * 64 + gameId + 1);
  const total = 15 + Math.floor(random.next().value * 26);
  const buckets = new Map<number, number>();
  for (let finisher = 0; finisher < total; finisher += 1) {
    const offset =
      (random.next().value + random.next().value - 1) * spread * 1.5;
    const score = Math.max(floor, Math.round(center + offset));
    const bucket = scoreBucket(game.buckets, score);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return buckets;
}

export class InMemoryDataSource implements DataSource {
  readonly #storage: StorageLike;
  readonly #nowSeconds: () => number;
  readonly #seededDays = new Map<number, DayBits>();
  #storedResults: StoredResult[];

  constructor(
    storage: StorageLike = window.localStorage,
    nowSeconds: () => number = () => Date.now() / 1_000,
  ) {
    this.#storage = storage;
    this.#nowSeconds = nowSeconds;
    this.#storedResults = loadStoredResults(storage);
    this.#seedHistory();
  }

  async currentDay(): Promise<number> {
    return dayIndexFromTimestamp(this.#nowSeconds());
  }

  async wordAnswer(day: number): Promise<string> {
    this.#assertDay(day);
    return WORDS[day % WORDS.length]!;
  }

  async chessPuzzle(day: number): Promise<ChessPuzzle> {
    this.#assertDay(day);
    const puzzle = CHESS_PUZZLES.get(day) ?? CHESS_PUZZLES.get(208);
    if (!puzzle) {
      throw new Error("No chess puzzle available");
    }
    return { ...puzzle };
  }

  async miniPuzzle(day: number): Promise<MiniPuzzle> {
    this.#assertDay(day);
    const puzzle = MINI_PUZZLES[day % MINI_PUZZLES.length]!;
    return { grid: puzzle.grid, across: [...puzzle.across], down: [...puzzle.down] };
  }

  async connectionsPuzzle(day: number): Promise<ConnectionsPuzzle> {
    this.#assertDay(day);
    const puzzle = CONNECTIONS_PUZZLES[day % CONNECTIONS_PUZZLES.length]!;
    return {
      groups: puzzle.groups.map((group) => ({ ...group, words: [...group.words] })),
    };
  }

  async dayBits(day: number): Promise<DayBits> {
    this.#assertDay(day);
    return this.#bitsForDay(day);
  }

  async dayBitsRange(from: number, count: number): Promise<DayBits[]> {
    this.#assertDay(from);
    if (!Number.isInteger(count) || count < 0 || count > 64) {
      throw new RangeError("Range count must be between 0 and 64");
    }

    return Array.from({ length: count }, (_, offset) => this.#bitsForDay(from + offset));
  }

  async record(
    gameId: number,
    day: number,
    score: number,
    solved: boolean,
  ): Promise<void> {
    this.#assertDay(day);
    if (!Number.isInteger(gameId) || gameId < 0 || gameId >= 64) {
      throw new RangeError("Game id must be between 0 and 63");
    }
    if (!Number.isInteger(score) || score < 0) {
      throw new RangeError("Score must be a non-negative integer");
    }
    if (day > (await this.currentDay())) {
      throw new RangeError("Cannot record a future day");
    }
    if (
      this.#storedResults.some(
        (result) => result.gameId === gameId && result.day === day,
      ) ||
      this.#seedHasGame(day, gameId)
    ) {
      throw new Error("This game-day is already recorded");
    }

    this.#storedResults.push({
      gameId,
      day,
      score,
      solved,
      ontime: day === (await this.currentDay()),
    });
    this.#storage.setItem(RESULT_STORAGE_KEY, JSON.stringify(this.#storedResults));
  }

  async histogram(gameId: number, day: number): Promise<Histogram> {
    this.#assertDay(day);
    const buckets = seededHistogram(gameId, day);
    // Only on-time, solved records enter a day's distribution (D20).
    for (const result of this.#storedResults) {
      if (result.gameId !== gameId || result.day !== day || !result.ontime || !result.solved) {
        continue;
      }
      const bucket = scoreBucket(gameOf(gameId).buckets, result.score);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    const entries = [...buckets.entries()].sort(([left], [right]) => left - right);
    return {
      total: entries.reduce((sum, [, count]) => sum + count, 0),
      buckets: entries.map(([bucket, count]) => ({ bucket, count })),
    };
  }

  async histograms(day: number, gameIds: readonly number[]): Promise<Histogram[]> {
    return Promise.all(gameIds.map((gameId) => this.histogram(gameId, day)));
  }

  async details(day: number, gameIds: readonly number[]): Promise<Detail[]> {
    this.#assertDay(day);
    return gameIds.map((gameId) => {
      const stored = this.#storedResults.find(
        (result) => result.gameId === gameId && result.day === day,
      );
      if (stored) {
        return { score: stored.score, solved: stored.solved };
      }
      if (this.#seedHasGame(day, gameId)) {
        // A seeded past day: a plausible score so a summary has numbers.
        const seeded = this.#seededDays.get(day)!;
        const solved = (seeded.solved & (1n << BigInt(gameId))) !== 0n;
        const kind = gameOf(gameId).kind;
        const score = kind === "count"
          ? 2 + ((day + gameId) % 5)
          : kind === "seconds"
            ? 150 + ((day * 13 + gameId * 37) % 400)
            : 250 + ((day * 13 + gameId * 37) % 200);
        return { score, solved };
      }
      return { score: 0, solved: false };
    });
  }

  #assertDay(day: number): void {
    if (!Number.isInteger(day) || day < 0) {
      throw new RangeError("Day must be a non-negative integer");
    }
  }

  #seedHistory(): void {
    const today = dayIndexFromTimestamp(this.#nowSeconds());

    for (let offset = 1; offset <= 60; offset += 1) {
      const day = today - offset;
      if (day < 0) {
        break;
      }

      let played = 0n;
      let solved = 0n;
      let ontime = 0n;

      for (let gameId = 0; gameId < 5; gameId += 1) {
        const missed = (offset + gameId * 2) % (5 + gameId) === 0;
        if (missed) {
          continue;
        }

        played = setBit(played, gameId);
        const gameSolved = (offset + gameId) % 4 !== 0;
        const backfilled = (offset + gameId * 3) % 9 === 0;
        if (gameSolved) {
          solved = setBit(solved, gameId);
        }
        if (!backfilled) {
          ontime = setBit(ontime, gameId);
        }
      }

      this.#seededDays.set(day, { played, solved, ontime });
    }
  }

  #seedHasGame(day: number, gameId: number): boolean {
    const seeded = this.#seededDays.get(day);
    if (!seeded) {
      return false;
    }
    return (seeded.played & (1n << BigInt(gameId))) !== 0n;
  }

  #bitsForDay(day: number): DayBits {
    const seeded = this.#seededDays.get(day) ?? EMPTY_BITS;
    const bits = { ...seeded };

    for (const result of this.#storedResults) {
      if (result.day !== day) {
        continue;
      }
      bits.played = setBit(bits.played, result.gameId);
      if (result.solved) {
        bits.solved = setBit(bits.solved, result.gameId);
      }
      if (result.ontime) {
        bits.ontime = setBit(bits.ontime, result.gameId);
      }
    }

    return bits;
  }
}
