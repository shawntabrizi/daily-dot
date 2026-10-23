/**
 * Offline content rules shared by validation and seeding.
 *
 * These checks intentionally mirror `contracts/logic/src/lib.rs`: one
 * six-letter Word answer per day, and the contract's structural FEN/UCI
 * validation.
 * Keep this as the single TypeScript implementation so tooling cannot drift.
 */

import {
  MINI_MAX_CLUE,
  miniEntries,
  miniGridFilled,
  miniGridShapeError,
} from "../src/games/mini/grid";

export const WORD_LENGTH = 6;
/** Words are six bytes: `WordRegistry.add_days` takes up to 64 per write. */
export const WORD_BATCH_SIZE = 64;
export const CONTENT_BATCH_SIZE = 8;
export const CONNECTIONS_GROUP_COUNT = 4;
export const CONNECTIONS_WORDS_PER_GROUP = 4;
export const MAX_CONNECTIONS_LABEL_BYTES = 40;
export const MAX_CONNECTIONS_WORD_BYTES = 24;
/** A Daily Mini answer may not recur within this many puzzles (= days). */
export const MINI_REPEAT_WINDOW = 120;

export interface WordlistFile {
  name: string;
  emoji: string;
  startDay: number;
  words: string[];
}

export interface ChessPuzzle {
  fen: string;
  moves: string;
}

export interface ChessFile {
  name: string;
  emoji: string;
  startDay: number;
  puzzles: ChessPuzzle[];
}

export interface ConnectionsGroup {
  label: string;
  words: string[];
  tier: number;
}

export interface ConnectionsPuzzle {
  day_index: number;
  groups: ConnectionsGroup[];
}

export interface ConnectionsFile {
  name: string;
  emoji: string;
  startDay: number;
  puzzles: ConnectionsPuzzle[];
}

/** One mini: the filled 5×5 grid and its clues in numbering order. */
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

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function metadata(
  value: Record<string, unknown>,
  label: string,
): Pick<WordlistFile, "name" | "emoji" | "startDay"> {
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new Error(`${label}.name must be a nonempty string.`);
  }
  if (typeof value.emoji !== "string" || value.emoji.length === 0) {
    throw new Error(`${label}.emoji must be a nonempty string.`);
  }
  if (
    !Number.isInteger(value.startDay) ||
    (value.startDay as number) < 0 ||
    (value.startDay as number) > 0xffff_ffff
  ) {
    throw new Error(`${label}.startDay must fit the contract's uint32.`);
  }
  return {
    name: value.name,
    emoji: value.emoji,
    startDay: value.startDay as number,
  };
}

export function validateWordAnswer(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z]+$/.test(value)) {
    throw new Error(`${label} must contain lowercase ASCII letters only.`);
  }
  if (value.length !== WORD_LENGTH) {
    throw new Error(
      `${label} must be ${WORD_LENGTH} letters, got ${value.length}.`,
    );
  }
  return value;
}

/** One answer per day, no repeats: a list is a year or more of distinct words. */
export function validateWordlistFile(
  input: unknown,
  label = "wordlist",
): WordlistFile {
  const value = record(input, label);
  if (!Array.isArray(value.words) || value.words.length === 0) {
    throw new Error(`${label}.words must be a nonempty array.`);
  }
  const words = value.words.map((word, index) =>
    validateWordAnswer(word, `${label}.words[${index}]`),
  );
  if (new Set(words).size !== words.length) {
    throw new Error(`${label}.words must not repeat a word.`);
  }
  return {
    ...metadata(value, label),
    words,
  };
}

export function validateChessFen(fen: string, label: string): void {
  const fields = fen.split(" ");
  if (fields.length !== 6 || fields.some((field) => field.length === 0)) {
    throw new Error(`${label} must contain exactly six nonempty FEN fields.`);
  }
  const [board, sideToMove] = fields;
  const ranks = board!.split("/");
  if (ranks.length !== 8) {
    throw new Error(`${label} must contain exactly eight ranks.`);
  }
  for (const [rankIndex, rank] of ranks.entries()) {
    let squares = 0;
    for (const symbol of rank) {
      if (/^[1-8]$/.test(symbol)) {
        squares += Number(symbol);
      } else if (/^[pnbrqkPNBRQK]$/.test(symbol)) {
        squares += 1;
      } else {
        throw new Error(`${label} rank ${rankIndex + 1} is invalid.`);
      }
      if (squares > 8) {
        throw new Error(`${label} rank ${rankIndex + 1} exceeds 8 squares.`);
      }
    }
    if (squares !== 8) {
      throw new Error(
        `${label} rank ${rankIndex + 1} sums to ${squares}, not 8.`,
      );
    }
  }
  if (sideToMove !== "w" && sideToMove !== "b") {
    throw new Error(`${label} side to move must be "w" or "b".`);
  }
}

function validUciMove(value: string): boolean {
  return /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/.test(value);
}

export function validateChessMoves(moves: string, label: string): void {
  if (moves.length === 0) {
    throw new Error(`${label} must contain at least one UCI move.`);
  }
  if (moves.split(" ").some((move) => !validUciMove(move))) {
    throw new Error(`${label} contains an invalid UCI move.`);
  }
}

export function validateChessFile(
  input: unknown,
  label = "chess",
): ChessFile {
  const value = record(input, label);
  if (!Array.isArray(value.puzzles) || value.puzzles.length === 0) {
    throw new Error(`${label}.puzzles must be a nonempty array.`);
  }
  const puzzles = value.puzzles.map((inputPuzzle, index) => {
    const puzzle = record(inputPuzzle, `${label}.puzzles[${index}]`);
    if (typeof puzzle.fen !== "string") {
      throw new Error(`${label}.puzzles[${index}].fen must be a string.`);
    }
    if (typeof puzzle.moves !== "string") {
      throw new Error(`${label}.puzzles[${index}].moves must be a string.`);
    }
    validateChessFen(puzzle.fen, `${label}.puzzles[${index}].fen`);
    validateChessMoves(puzzle.moves, `${label}.puzzles[${index}].moves`);
    return { fen: puzzle.fen, moves: puzzle.moves };
  });
  return {
    ...metadata(value, label),
    puzzles,
  };
}

/** The clue must not give its answer away, as a word or a longer substring. */
export function miniClueContainsAnswer(clue: string, answer: string): boolean {
  const haystack = clue.toUpperCase();
  if (answer.length >= 4 && haystack.includes(answer)) {
    return true;
  }
  return new RegExp(`(^|[^A-Z])${answer}([^A-Z]|$)`).test(haystack);
}

export function validateMiniClue(
  clue: unknown,
  answer: string,
  label: string,
): string {
  if (typeof clue !== "string" || clue.length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  if ([...clue].length > MINI_MAX_CLUE) {
    throw new Error(`${label} must be at most ${MINI_MAX_CLUE} characters.`);
  }
  if (/[\p{Cc}]/u.test(clue)) {
    throw new Error(`${label} must not contain control characters.`);
  }
  if (miniClueContainsAnswer(clue, answer)) {
    throw new Error(`${label} contains its answer ${answer}.`);
  }
  return clue;
}

export function validateMiniPuzzle(
  input: unknown,
  label: string,
): MiniPuzzle & { answers: string[] } {
  const puzzle = record(input, label);
  if (typeof puzzle.grid !== "string") {
    throw new Error(`${label}.grid must be a string.`);
  }
  const shape = miniGridShapeError(puzzle.grid);
  if (shape) {
    throw new Error(`${label}.grid: ${shape}.`);
  }
  if (!miniGridFilled(puzzle.grid)) {
    throw new Error(`${label}.grid must be completely filled.`);
  }
  const entries = miniEntries(puzzle.grid);
  const answers = [...entries.across, ...entries.down].map((entry) => entry.answer);
  if (new Set(answers).size !== answers.length) {
    throw new Error(`${label} repeats an answer inside the grid.`);
  }
  const clueList = (dir: "across" | "down"): string[] => {
    const clues = puzzle[dir];
    const expected = entries[dir];
    if (!Array.isArray(clues) || clues.length !== expected.length) {
      throw new Error(
        `${label}.${dir} must list ${expected.length} clues in numbering order.`,
      );
    }
    return clues.map((clue, index) =>
      validateMiniClue(
        clue,
        expected[index]!.answer,
        `${label}.${dir}[${index}] (${expected[index]!.n} ${dir})`,
      ),
    );
  };
  return {
    grid: puzzle.grid,
    across: clueList("across"),
    down: clueList("down"),
    answers,
  };
}

export function validateMiniFile(
  input: unknown,
  label = "mini",
  repeatWindow = MINI_REPEAT_WINDOW,
): MiniFile {
  const value = record(input, label);
  if (!Array.isArray(value.puzzles) || value.puzzles.length === 0) {
    throw new Error(`${label}.puzzles must be a nonempty array.`);
  }
  const lastSeen = new Map<string, number>();
  const puzzles = value.puzzles.map((inputPuzzle, index) => {
    const puzzle = validateMiniPuzzle(inputPuzzle, `${label}.puzzles[${index}]`);
    for (const answer of puzzle.answers) {
      const previous = lastSeen.get(answer);
      if (previous !== undefined && index - previous < repeatWindow) {
        throw new Error(
          `${label}.puzzles[${index}] repeats ${answer} from puzzle ${previous}; `
            + `answers may not recur within ${repeatWindow} days.`,
        );
      }
      lastSeen.set(answer, index);
    }
    return { grid: puzzle.grid, across: puzzle.across, down: puzzle.down };
  });
  return {
    ...metadata(value, label),
    puzzles,
  };
}

const utf8 = new TextEncoder();

function trimmedText(value: unknown, label: string, maxBytes: number): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a nonempty string with no surrounding whitespace.`);
  }
  if (utf8.encode(value).length > maxBytes) {
    throw new Error(`${label} must be at most ${maxBytes} UTF-8 bytes.`);
  }
  return value;
}

/** Mirrors `validate_connections_puzzle` in `contracts/logic`. */
export function validateConnectionsGroups(
  value: unknown,
  label: string,
): ConnectionsGroup[] {
  if (!Array.isArray(value) || value.length !== CONNECTIONS_GROUP_COUNT) {
    throw new Error(`${label} must contain exactly four groups.`);
  }
  const tiers = new Set<number>();
  const seenWords = new Set<string>();
  return value.map((inputGroup, index) => {
    const group = record(inputGroup, `${label}[${index}]`);
    const groupLabel = trimmedText(
      group.label,
      `${label}[${index}].label`,
      MAX_CONNECTIONS_LABEL_BYTES,
    );
    if (
      !Array.isArray(group.words)
      || group.words.length !== CONNECTIONS_WORDS_PER_GROUP
    ) {
      throw new Error(`${label}[${index}].words must contain exactly four words.`);
    }
    const words = group.words.map((word, wordIndex) => {
      const text = trimmedText(
        word,
        `${label}[${index}].words[${wordIndex}]`,
        MAX_CONNECTIONS_WORD_BYTES,
      );
      const key = text.toLowerCase();
      if (seenWords.has(key)) {
        throw new Error(`${label} repeats the word "${text}".`);
      }
      seenWords.add(key);
      return text;
    });
    if (
      !Number.isInteger(group.tier)
      || (group.tier as number) < 0
      || (group.tier as number) >= CONNECTIONS_GROUP_COUNT
    ) {
      throw new Error(`${label}[${index}].tier must be 0, 1, 2, or 3.`);
    }
    if (tiers.has(group.tier as number)) {
      throw new Error(`${label} uses tier ${group.tier} twice.`);
    }
    tiers.add(group.tier as number);
    return { label: groupLabel, words, tier: group.tier as number };
  });
}

/** A group's identity for the cross-day reuse rule: its word set, any order. */
export function connectionsGroupKey(words: readonly string[]): string {
  return [...words].map((word) => word.toLowerCase()).sort().join("\u0000");
}

/**
 * Beyond the contract rules the file must be a complete year: `day_index`
 * runs 0..n-1 in order, and no full group of four appears on two days.
 */
export function validateConnectionsFile(
  input: unknown,
  label = "connections",
): ConnectionsFile {
  const value = record(input, label);
  if (!Array.isArray(value.puzzles) || value.puzzles.length === 0) {
    throw new Error(`${label}.puzzles must be a nonempty array.`);
  }
  const groupOwner = new Map<string, number>();
  const puzzles = value.puzzles.map((inputPuzzle, index) => {
    const puzzle = record(inputPuzzle, `${label}.puzzles[${index}]`);
    if (puzzle.day_index !== index) {
      throw new Error(
        `${label}.puzzles[${index}].day_index must be ${index}; every day appears once, in order.`,
      );
    }
    const groups = validateConnectionsGroups(
      puzzle.groups,
      `${label}.puzzles[${index}].groups`,
    );
    for (const group of groups) {
      const key = connectionsGroupKey(group.words);
      const owner = groupOwner.get(key);
      if (owner !== undefined) {
        throw new Error(
          `${label}.puzzles[${index}] reuses the group "${group.label}" from day ${owner}.`,
        );
      }
      groupOwner.set(key, index);
    }
    return { day_index: index, groups };
  });
  return {
    ...metadata(value, label),
    puzzles,
  };
}
