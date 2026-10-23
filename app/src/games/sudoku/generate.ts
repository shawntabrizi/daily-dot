export type Grid = number[][];

const GRID_SIZE = 9;
const FULL_CANDIDATE_MASK = 0x1ff;
const MAX_U32 = 0xffff_ffff;

// v1 is historical content. Changing any constant or transform below changes past days;
// add a new version with a future start day instead.
const V1_PUZZLE = [
  "530070000",
  "600195000",
  "098000060",
  "800060003",
  "400803001",
  "700020006",
  "060000280",
  "000419005",
  "000080079",
] as const;

const V1_SOLUTION = [
  "534678912",
  "672195348",
  "198342567",
  "859761423",
  "426853791",
  "713924856",
  "961537284",
  "287419635",
  "345286179",
] as const;

const UNITS: readonly (readonly [number, number][])[] = [
  ...Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, column) => [row, column] as [number, number]),
  ),
  ...Array.from({ length: GRID_SIZE }, (_, column) =>
    Array.from({ length: GRID_SIZE }, (_, row) => [row, column] as [number, number]),
  ),
  ...Array.from({ length: GRID_SIZE }, (_, box) => {
    const firstRow = Math.floor(box / 3) * 3;
    const firstColumn = (box % 3) * 3;
    return Array.from({ length: GRID_SIZE }, (_, index) => [
      firstRow + Math.floor(index / 3),
      firstColumn + (index % 3),
    ] as [number, number]);
  }),
];

interface SolverResult {
  count: number;
  first: Grid | null;
}

function parseGrid(rows: readonly string[]): Grid {
  return rows.map((row) => [...row].map(Number));
}

function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

function assertGrid(grid: Grid): void {
  if (
    grid.length !== GRID_SIZE
    || grid.some(
      (row) =>
        row.length !== GRID_SIZE
        || row.some((value) => !Number.isInteger(value) || value < 0 || value > 9),
    )
  ) {
    throw new TypeError("Sudoku grid must be a 9×9 matrix of digits 0 through 9");
  }
}

function boxIndex(row: number, column: number): number {
  return Math.floor(row / 3) * 3 + Math.floor(column / 3);
}

function analyzeSolutions(grid: Grid, limit: number): SolverResult {
  assertGrid(grid);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Solution limit must be a positive integer");
  }

  const working = cloneGrid(grid);
  const rowMasks = Array<number>(GRID_SIZE).fill(0);
  const columnMasks = Array<number>(GRID_SIZE).fill(0);
  const boxMasks = Array<number>(GRID_SIZE).fill(0);

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const value = working[row]?.[column] ?? 0;
      if (value === 0) {
        continue;
      }
      const bit = 1 << (value - 1);
      const box = boxIndex(row, column);
      if (
        (rowMasks[row]! & bit) !== 0
        || (columnMasks[column]! & bit) !== 0
        || (boxMasks[box]! & bit) !== 0
      ) {
        return { count: 0, first: null };
      }
      rowMasks[row]! |= bit;
      columnMasks[column]! |= bit;
      boxMasks[box]! |= bit;
    }
  }

  let count = 0;
  let first: Grid | null = null;

  const search = (): void => {
    if (count >= limit) {
      return;
    }

    let targetRow = -1;
    let targetColumn = -1;
    let targetMask = 0;
    let fewestCandidates = 10;

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        if (working[row]?.[column] !== 0) {
          continue;
        }
        const mask =
          FULL_CANDIDATE_MASK
          & ~(rowMasks[row]! | columnMasks[column]! | boxMasks[boxIndex(row, column)]!);
        const candidateCount = countBits(mask);
        if (candidateCount === 0) {
          return;
        }
        if (candidateCount < fewestCandidates) {
          targetRow = row;
          targetColumn = column;
          targetMask = mask;
          fewestCandidates = candidateCount;
          if (candidateCount === 1) {
            break;
          }
        }
      }
      if (fewestCandidates === 1) {
        break;
      }
    }

    if (targetRow === -1) {
      count += 1;
      first ??= cloneGrid(working);
      return;
    }

    const box = boxIndex(targetRow, targetColumn);
    let candidates = targetMask;
    while (candidates !== 0 && count < limit) {
      const bit = candidates & -candidates;
      const value = 32 - Math.clz32(bit);
      working[targetRow]![targetColumn] = value;
      rowMasks[targetRow]! |= bit;
      columnMasks[targetColumn]! |= bit;
      boxMasks[box]! |= bit;

      search();

      working[targetRow]![targetColumn] = 0;
      rowMasks[targetRow]! &= ~bit;
      columnMasks[targetColumn]! &= ~bit;
      boxMasks[box]! &= ~bit;
      candidates &= ~bit;
    }
  };

  search();
  return { count, first };
}

function countBits(mask: number): number {
  let count = 0;
  let remaining = mask;
  while (remaining !== 0) {
    remaining &= remaining - 1;
    count += 1;
  }
  return count;
}

function candidateMask(grid: Grid, row: number, column: number): number {
  let used = 0;
  for (let index = 0; index < GRID_SIZE; index += 1) {
    const rowValue = grid[row]?.[index] ?? 0;
    const columnValue = grid[index]?.[column] ?? 0;
    if (rowValue > 0) {
      used |= 1 << (rowValue - 1);
    }
    if (columnValue > 0) {
      used |= 1 << (columnValue - 1);
    }
  }

  const firstRow = Math.floor(row / 3) * 3;
  const firstColumn = Math.floor(column / 3) * 3;
  for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < 3; columnOffset += 1) {
      const value = grid[firstRow + rowOffset]?.[firstColumn + columnOffset] ?? 0;
      if (value > 0) {
        used |= 1 << (value - 1);
      }
    }
  }
  return FULL_CANDIDATE_MASK & ~used;
}

function isConsistent(grid: Grid): boolean {
  const withoutSearch = cloneGrid(grid);
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const value = withoutSearch[row]?.[column] ?? 0;
      if (value === 0) {
        continue;
      }
      withoutSearch[row]![column] = 0;
      if ((candidateMask(withoutSearch, row, column) & (1 << (value - 1))) === 0) {
        return false;
      }
      withoutSearch[row]![column] = value;
    }
  }
  return true;
}

export function countSudokuSolutions(grid: Grid, limit = 2): number {
  return analyzeSolutions(grid, limit).count;
}

export function solveSudoku(grid: Grid): Grid | null {
  return analyzeSolutions(grid, 1).first;
}

/**
 * Returns a solution only when naked and hidden singles are sufficient.
 * v1 transformations preserve this technique profile across every day.
 */
export function solveSudokuWithSingles(grid: Grid): Grid | null {
  assertGrid(grid);
  const working = cloneGrid(grid);
  if (!isConsistent(working)) {
    return null;
  }

  while (working.some((row) => row.includes(0))) {
    let changed = false;

    for (let row = 0; row < GRID_SIZE && !changed; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        if (working[row]?.[column] !== 0) {
          continue;
        }
        const mask = candidateMask(working, row, column);
        if (countBits(mask) === 1) {
          working[row]![column] = 32 - Math.clz32(mask);
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      continue;
    }

    for (const unit of UNITS) {
      for (let value = 1; value <= GRID_SIZE; value += 1) {
        if (unit.some(([row, column]) => working[row]?.[column] === value)) {
          continue;
        }
        const bit = 1 << (value - 1);
        const matches = unit.filter(
          ([row, column]) =>
            working[row]?.[column] === 0
            && (candidateMask(working, row, column) & bit) !== 0,
        );
        if (matches.length === 1) {
          const target = matches[0]!;
          working[target[0]]![target[1]] = value;
          changed = true;
          break;
        }
      }
      if (changed) {
        break;
      }
    }

    if (!changed) {
      return null;
    }
  }

  return isConsistent(working) ? working : null;
}

function createPrng(day: number, version: "v1"): () => number {
  let state = (0x9e37_79b9 ^ day) >>> 0;
  for (const character of version) {
    state = Math.imul(state ^ character.charCodeAt(0), 0x85eb_ca6b) >>> 0;
    state ^= state >>> 16;
  }
  if (state === 0) {
    state = 0x6d2b_79f5;
  }

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

function shuffle<T>(values: readonly T[], next: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = next() % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

function shuffledGroups(next: () => number): number[] {
  return shuffle([0, 1, 2], next).flatMap((group) =>
    shuffle([0, 1, 2], next).map((offset) => group * 3 + offset),
  );
}

function transformGrid(
  source: Grid,
  digitMap: readonly number[],
  rowOrder: readonly number[],
  columnOrder: readonly number[],
  transpose: boolean,
): Grid {
  return Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, column) => {
      const sourceRow = transpose ? columnOrder[column]! : rowOrder[row]!;
      const sourceColumn = transpose ? rowOrder[row]! : columnOrder[column]!;
      const value = source[sourceRow]?.[sourceColumn] ?? 0;
      return value === 0 ? 0 : digitMap[value - 1]!;
    }),
  );
}

export function generateSudoku(
  day: number,
  version: "v1",
): { puzzle: Grid; solution: Grid } {
  if (!Number.isInteger(day) || day < 0 || day > MAX_U32) {
    throw new RangeError("Sudoku day must be a u32");
  }
  if (version !== "v1") {
    throw new RangeError("Unsupported Sudoku generator version");
  }

  const next = createPrng(day, version);
  const digitMap = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], next);
  const rowOrder = shuffledGroups(next);
  const columnOrder = shuffledGroups(next);
  const transpose = (next() & 1) === 1;
  const puzzle = transformGrid(
    parseGrid(V1_PUZZLE),
    digitMap,
    rowOrder,
    columnOrder,
    transpose,
  );
  const transformedSolution = transformGrid(
    parseGrid(V1_SOLUTION),
    digitMap,
    rowOrder,
    columnOrder,
    transpose,
  );

  const analysis = analyzeSolutions(puzzle, 2);
  if (
    analysis.count !== 1
    || JSON.stringify(analysis.first) !== JSON.stringify(transformedSolution)
  ) {
    throw new Error("Sudoku v1 invariant failed: generated puzzle is not uniquely solvable");
  }

  return { puzzle, solution: transformedSolution };
}
