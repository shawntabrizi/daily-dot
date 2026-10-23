import type {
  ConnectionsGroup,
  ConnectionsPuzzle,
} from "../../shared/data-source";
import { gameIdOf } from "../../shared/roster";

export const CONNECTIONS_GAME_ID = gameIdOf("connections");
export const CONNECTIONS_GROUP_COUNT = 4;
export const CONNECTIONS_GROUP_SIZE = 4;
export const CONNECTIONS_WORD_COUNT =
  CONNECTIONS_GROUP_COUNT * CONNECTIONS_GROUP_SIZE;

/**
 * Tier 0 is the easiest group, tier 3 the hardest. The names are the colour
 * words of our palette (`--present`, `--correct`, then two tier tokens), not
 * another game's; the squares are what the text-only share summary prints.
 */
export const CONNECTIONS_TIERS = [
  { name: "Gold", square: "🟨" },
  { name: "Green", square: "🟩" },
  { name: "Sky", square: "🟦" },
  { name: "Plum", square: "🟪" },
] as const;

export type GuessOutcome =
  | { kind: "correct"; group: number }
  | { kind: "one-away" }
  | { kind: "wrong" }
  | { kind: "repeat" };

export interface GuessResult {
  outcome: GuessOutcome;
  /** The tier of each guessed word's group, in guess order: the share row. */
  tiers: number[];
}

export function wordKey(word: string): string {
  return word.toLowerCase();
}

/** Throws on content the registry would also refuse, so a bad read is loud. */
export function assertConnectionsPuzzle(puzzle: ConnectionsPuzzle): void {
  if (puzzle.groups.length !== CONNECTIONS_GROUP_COUNT) {
    throw new Error("A Connections puzzle has four groups");
  }
  const tiers = new Set<number>();
  const words = new Set<string>();
  for (const group of puzzle.groups) {
    if (group.words.length !== CONNECTIONS_GROUP_SIZE) {
      throw new Error("A Connections group has four words");
    }
    if (!Number.isInteger(group.tier) || group.tier < 0 || group.tier > 3) {
      throw new Error("A Connections tier is 0 to 3");
    }
    if (tiers.has(group.tier)) {
      throw new Error("A Connections puzzle uses each tier once");
    }
    tiers.add(group.tier);
    for (const word of group.words) {
      if (words.has(wordKey(word))) {
        throw new Error(`A Connections puzzle repeats "${word}"`);
      }
      words.add(wordKey(word));
    }
  }
}

/** The group a word belongs to, by index into `puzzle.groups`. */
export function groupOfWord(puzzle: ConnectionsPuzzle, word: string): number {
  const key = wordKey(word);
  const index = puzzle.groups.findIndex((group) =>
    group.words.some((candidate) => wordKey(candidate) === key),
  );
  if (index < 0) {
    throw new Error(`"${word}" is not in this puzzle`);
  }
  return index;
}

export function groupsByTier(puzzle: ConnectionsPuzzle): ConnectionsGroup[] {
  return [...puzzle.groups].sort((left, right) => left.tier - right.tier);
}

/** All 16 words in content order: tier 0's four first, then tier 1's… */
export function puzzleWords(puzzle: ConnectionsPuzzle): string[] {
  return groupsByTier(puzzle).flatMap((group) => group.words);
}

/** Small xorshift so the first board of a day is the same on every device. */
function seededRandom(seed: number): () => number {
  let state = (seed * 2_654_435_761 + 0x9e37_79b9) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

export function shuffleWords(
  words: readonly string[],
  random: () => number = Math.random,
): string[] {
  const order = [...words];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}

/** The board order a player first sees on `day`: derived, never stored. */
export function initialOrder(puzzle: ConnectionsPuzzle, day: number): string[] {
  return shuffleWords(puzzleWords(puzzle), seededRandom(day));
}

export function selectionKey(words: readonly string[]): string {
  return words.map(wordKey).sort().join("\u0000");
}

/**
 * Score one submitted set of four. `previousGuesses` makes a resubmitted set
 * a "repeat" that costs nothing (the player is told, not punished twice).
 */
export function evaluateGuess(
  puzzle: ConnectionsPuzzle,
  selection: readonly string[],
  previousGuesses: readonly (readonly string[])[],
): GuessResult {
  if (selection.length !== CONNECTIONS_GROUP_SIZE) {
    throw new RangeError("Submit exactly four words");
  }
  if (new Set(selection.map(wordKey)).size !== CONNECTIONS_GROUP_SIZE) {
    throw new RangeError("Submit four different words");
  }
  const groups = selection.map((word) => groupOfWord(puzzle, word));
  const tiers = groups.map((group) => puzzle.groups[group]!.tier);
  const key = selectionKey(selection);
  if (previousGuesses.some((guess) => selectionKey(guess) === key)) {
    return { outcome: { kind: "repeat" }, tiers };
  }

  const counts = new Map<number, number>();
  for (const group of groups) {
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const best = Math.max(...counts.values());
  if (best === CONNECTIONS_GROUP_SIZE) {
    return { outcome: { kind: "correct", group: groups[0]! }, tiers };
  }
  if (best === CONNECTIONS_GROUP_SIZE - 1) {
    return { outcome: { kind: "one-away" }, tiers };
  }
  return { outcome: { kind: "wrong" }, tiers };
}
