/**
 * The Daily Mini grid: 5×5, "#" for a black square, A–Z for a letter.
 *
 * Numbering, entries and answers are derived from the 25-character string;
 * the chain stores the grid and the clues only. This module is pure and is
 * shared by the generator, the validator, the seed tooling and the game.
 */

export const MINI_SIZE = 5;
export const MINI_CELLS = MINI_SIZE * MINI_SIZE;
export const MINI_BLACK = "#";
export const MINI_MIN_BLACKS = 2;
export const MINI_MAX_BLACKS = 5;
/** No two-letter entries: every run of white squares is at least this long. */
export const MINI_MIN_ENTRY = 3;
export const MINI_MAX_CLUE = 50;

export type MiniDirection = "across" | "down";

export interface MiniEntry {
  n: number;
  dir: MiniDirection;
  row: number;
  col: number;
  /** Cell indexes (row * 5 + col) in reading order. */
  cells: number[];
  /** Letters of the grid along `cells`; "." where a cell has no letter yet. */
  answer: string;
}

export interface MiniLayout {
  across: MiniEntry[];
  down: MiniEntry[];
  /** Clue number per cell, or 0 where the cell starts no entry. */
  numbers: number[];
}

export function cellIndex(row: number, col: number): number {
  return row * MINI_SIZE + col;
}

export function isBlack(grid: string, index: number): boolean {
  return grid[index] === MINI_BLACK;
}

/**
 * The shape rule, independent of the letters: 25 squares, 2–5 blacks, and
 * every across and down run of white squares at least three long (which also
 * means every white square is checked both ways). Returns the first problem
 * as text, or null when the grid is well formed. Unfilled squares may be ".".
 */
export function miniGridShapeError(grid: string): string | null {
  if (grid.length !== MINI_CELLS) {
    return `grid must be ${MINI_CELLS} characters, got ${grid.length}`;
  }
  if (!/^[A-Z#.]+$/.test(grid)) {
    return "grid may contain only A–Z, # and .";
  }
  const blacks = [...grid].filter((cell) => cell === MINI_BLACK).length;
  if (blacks < MINI_MIN_BLACKS || blacks > MINI_MAX_BLACKS) {
    return `grid must have ${MINI_MIN_BLACKS}–${MINI_MAX_BLACKS} black squares, got ${blacks}`;
  }
  for (let line = 0; line < MINI_SIZE; line += 1) {
    for (const dir of ["across", "down"] as const) {
      let run = 0;
      for (let step = 0; step <= MINI_SIZE; step += 1) {
        const index =
          dir === "across" ? cellIndex(line, step) : cellIndex(step, line);
        const white = step < MINI_SIZE && !isBlack(grid, index);
        if (white) {
          run += 1;
        } else {
          if (run > 0 && run < MINI_MIN_ENTRY) {
            return `${dir} run of ${run} at ${dir === "across" ? "row" : "column"} ${line + 1}; entries must be at least ${MINI_MIN_ENTRY} letters`;
          }
          run = 0;
        }
      }
    }
  }
  return null;
}

/** Numbered entries of a well-formed grid. Throws on a malformed shape. */
export function miniEntries(grid: string): MiniLayout {
  const error = miniGridShapeError(grid);
  if (error) {
    throw new Error(`Invalid mini grid: ${error}`);
  }
  const across: MiniEntry[] = [];
  const down: MiniEntry[] = [];
  const numbers = new Array<number>(MINI_CELLS).fill(0);
  let next = 1;
  for (let row = 0; row < MINI_SIZE; row += 1) {
    for (let col = 0; col < MINI_SIZE; col += 1) {
      const index = cellIndex(row, col);
      if (isBlack(grid, index)) {
        continue;
      }
      const startsAcross = col === 0 || isBlack(grid, cellIndex(row, col - 1));
      const startsDown = row === 0 || isBlack(grid, cellIndex(row - 1, col));
      if (!startsAcross && !startsDown) {
        continue;
      }
      const n = next;
      next += 1;
      numbers[index] = n;
      if (startsAcross) {
        const cells: number[] = [];
        for (let c = col; c < MINI_SIZE && !isBlack(grid, cellIndex(row, c)); c += 1) {
          cells.push(cellIndex(row, c));
        }
        across.push({ n, dir: "across", row, col, cells, answer: letters(grid, cells) });
      }
      if (startsDown) {
        const cells: number[] = [];
        for (let r = row; r < MINI_SIZE && !isBlack(grid, cellIndex(r, col)); r += 1) {
          cells.push(cellIndex(r, col));
        }
        down.push({ n, dir: "down", row, col, cells, answer: letters(grid, cells) });
      }
    }
  }
  return { across, down, numbers };
}

function letters(grid: string, cells: readonly number[]): string {
  return cells.map((index) => grid[index] ?? ".").join("");
}

/** True when every white square holds a letter. */
export function miniGridFilled(grid: string): boolean {
  return !grid.includes(".");
}
