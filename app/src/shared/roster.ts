export type GameSlug =
  | "word"
  | "sudoku"
  | "chess"
  | "globe"
  | "mini"
  | "connections"
  | "code"
  | "angle"
  | "color"
  | "sound";

/**
 * Player-facing names follow the "Daily X" pattern; `short` is the X, for
 * compact surfaces such as the Pocket card. The roster order and the gameIds
 * are frozen from first public play: they index the D5 bitmaps on chain.
 */
/**
 * `kind` says what a game's `score` counts and how it is written (D13,
 * amended 2026-10-23): a `count` of guesses/moves/mistakes, elapsed
 * `seconds`, or `points` in tenths of a point (426 is 42.6 points).
 */
export type ScoreKind = "count" | "seconds" | "points";

/** Which end of the score range ranks first (D13): fewer guesses, or more points. */
export type ScoreDirection = "lower" | "higher";

/**
 * How `DailyScores` buckets the game's scores into its on-time histogram
 * (D20, amended 2026-10-23): `buckets` equal steps over `[min, max)`, with
 * everything below `min` in the first and everything at or above `max` in
 * the last. It must match the spec set on chain for the gameId
 * (`DailyScores.setBucketSpec`, set once, see `scripts/set-bucket-specs.ts`):
 * the contract buckets by it and the app ranks and labels by it.
 */
export interface BucketSpec {
  min: number;
  max: number;
  buckets: number;
}

/** Exact counts 1–30, then 31+ (also what an unset spec reads as on chain). */
export const COUNT_BUCKETS: BucketSpec = { min: 1, max: 32, buckets: 31 };
/** 15-second steps from 0:00, then 30:00+. */
export const SECONDS_BUCKETS: BucketSpec = { min: 0, max: 1815, buckets: 121 };
/** Half-point steps over 0–50 points (scores in tenths). */
export const POINTS_BUCKETS: BucketSpec = { min: 0, max: 500, buckets: 100 };
/** Exact counts 0–30, then 31+: Connections scores mistakes, and 0 is the best board. */
export const MISTAKE_BUCKETS: BucketSpec = { min: 0, max: 32, buckets: 32 };

export interface Game {
  id: GameSlug;
  name: string;
  short: string;
  gameId: number;
  startDay: number;
  route: string;
  kind: ScoreKind;
  better: ScoreDirection;
  buckets: BucketSpec;
}

export const GAME_ROSTER: readonly Game[] = [
  {
    id: "word",
    name: "Daily Word",
    short: "Word",
    gameId: 0,
    startDay: 0,
    route: "#/g/word",
    kind: "count",
    better: "lower",
    buckets: COUNT_BUCKETS,
  },
  {
    id: "sudoku",
    name: "Daily Sudoku",
    short: "Sudoku",
    gameId: 1,
    startDay: 0,
    route: "#/g/sudoku",
    kind: "seconds",
    better: "lower",
    buckets: SECONDS_BUCKETS,
  },
  {
    id: "chess",
    name: "Daily Chess",
    short: "Chess",
    gameId: 2,
    startDay: 0,
    route: "#/g/chess",
    kind: "count",
    better: "lower",
    buckets: COUNT_BUCKETS,
  },
  {
    id: "globe",
    name: "Daily Globe",
    short: "Globe",
    gameId: 3,
    startDay: 0,
    route: "#/g/globe",
    kind: "count",
    better: "lower",
    buckets: COUNT_BUCKETS,
  },
  {
    id: "mini",
    name: "Daily Mini",
    short: "Mini",
    gameId: 4,
    startDay: 0,
    route: "#/g/mini",
    kind: "seconds",
    better: "lower",
    buckets: SECONDS_BUCKETS,
  },
  {
    id: "connections",
    name: "Daily Connections",
    short: "Connections",
    gameId: 5,
    startDay: 0,
    route: "#/g/connections",
    kind: "count",
    better: "lower",
    buckets: MISTAKE_BUCKETS,
  },
  {
    id: "code",
    name: "Daily Code",
    short: "Code",
    gameId: 6,
    startDay: 0,
    route: "#/g/code",
    kind: "count",
    better: "lower",
    buckets: COUNT_BUCKETS,
  },
  {
    id: "angle",
    name: "Daily Angle",
    short: "Angle",
    gameId: 7,
    startDay: 0,
    route: "#/g/angle",
    kind: "count",
    better: "lower",
    buckets: COUNT_BUCKETS,
  },
  {
    id: "color",
    name: "Daily Color",
    short: "Color",
    gameId: 8,
    startDay: 0,
    route: "#/g/color",
    kind: "points",
    better: "higher",
    buckets: POINTS_BUCKETS,
  },
  {
    id: "sound",
    name: "Daily Sound",
    short: "Sound",
    gameId: 9,
    startDay: 0,
    route: "#/g/sound",
    kind: "points",
    better: "higher",
    buckets: POINTS_BUCKETS,
  },
];

/** Count words for headlines, index = count: the hub and the save overlay share them. */
export const COUNT_WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
] as const;

export function gameById(id: string): Game | undefined {
  return GAME_ROSTER.find((game) => game.id === id);
}

export function isGameSlug(value: unknown): value is GameSlug {
  return GAME_ROSTER.some((game) => game.id === value);
}

/** The on-chain bit of a roster game; the one place a gameId comes from. */
export function gameIdOf(slug: GameSlug): number {
  return gameById(slug)!.gameId;
}
