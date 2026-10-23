export type GameSlug = "word" | "sudoku" | "chess" | "globe" | "mini" | "connections";

/**
 * Player-facing names follow the "Daily X" pattern; `short` is the X, for
 * compact surfaces such as the Pocket card. The roster order and the gameIds
 * are frozen from first public play: they index the D5 bitmaps on chain.
 */
/**
 * `kind` says how the game's `score` is minimised (D13, amended 2026-10-21):
 * a `count` of guesses/attempts/mistakes or elapsed `seconds`. It must match
 * the kind set on chain for the gameId (`DailyScores.setGameKind`, see
 * `scripts/set-game-kinds.ts`): the contract buckets by it and the app labels
 * the distribution by it.
 */
export type ScoreKind = "count" | "seconds";

export interface Game {
  id: GameSlug;
  name: string;
  short: string;
  gameId: number;
  startDay: number;
  route: string;
  kind: ScoreKind;
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
  },
  {
    id: "sudoku",
    name: "Daily Sudoku",
    short: "Sudoku",
    gameId: 1,
    startDay: 0,
    route: "#/g/sudoku",
    kind: "seconds",
  },
  {
    id: "chess",
    name: "Daily Chess",
    short: "Chess",
    gameId: 2,
    startDay: 0,
    route: "#/g/chess",
    kind: "count",
  },
  {
    id: "globe",
    name: "Daily Globe",
    short: "Globe",
    gameId: 3,
    startDay: 0,
    route: "#/g/globe",
    kind: "count",
  },
  {
    id: "mini",
    name: "Daily Mini",
    short: "Mini",
    gameId: 4,
    startDay: 0,
    route: "#/g/mini",
    kind: "seconds",
  },
  {
    id: "connections",
    name: "Daily Connections",
    short: "Connections",
    gameId: 5,
    startDay: 0,
    route: "#/g/connections",
    kind: "count",
  },
];

/** Count words for headlines, index = count: the hub and the save overlay share them. */
export const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six"] as const;

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
