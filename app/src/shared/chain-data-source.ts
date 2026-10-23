import type {
  ChessPuzzle,
  ConnectionsPuzzle,
  DataSource,
  DayBits,
  Detail,
  MiniPuzzle,
} from "./data-source";
import type { Histogram } from "./percentile";
import {
  retryChainRead,
  type ChainReadRetryOptions,
} from "./chain-read-retry";

type QueryResult<T> =
  | { success: true; value: T }
  | { success: false; value: unknown };

interface QueryMethod<T> {
  query(...args: unknown[]): Promise<QueryResult<T>>;
}

interface TransactionResult {
  ok: boolean;
  /**
   * The SDK's failure when `ok` is false: a dry run that failed or reverted,
   * a transaction the pool refused (`Invalid.Payment`), a rejected signature,
   * or a dispatch error in a block. Its message carries the decoded cause.
   */
  error?: unknown;
  dispatchError?: unknown;
}

interface TransactionMethod {
  tx(...args: unknown[]): Promise<TransactionResult>;
}

type UintValue = bigint | number | string;

interface ContractDayBits {
  played: UintValue;
  solved: UintValue;
  ontime: UintValue;
}

/** The ABI's `uint8` tier may cross the boundary as a number or a bigint. */
interface ContractConnectionsPuzzle {
  groups: { label: string; words: string[]; tier: UintValue }[];
}

interface ContractDetail {
  score: UintValue;
  solved: boolean;
}

interface ContractHistogram {
  total: UintValue;
  buckets: { bucket: UintValue; count: UintValue }[];
}

type AccountSource =
  | `0x${string}`
  | Promise<`0x${string}`>
  | (() => Promise<`0x${string}`>);

export interface ChainReadBindings {
  accountH160: AccountSource;
  scores: {
    currentDay: QueryMethod<UintValue>;
    getDay: QueryMethod<ContractDayBits>;
    getDays: QueryMethod<ContractDayBits[]>;
    histogram: QueryMethod<ContractHistogram>;
    histograms: QueryMethod<ContractHistogram[]>;
    getDetails: QueryMethod<ContractDetail[]>;
  };
  word: {
    wordForDay: QueryMethod<string>;
  };
  chess: {
    puzzleForDay: QueryMethod<ChessPuzzle>;
  };
  mini: {
    setId: number;
    puzzleForDay: QueryMethod<MiniPuzzle>;
  };
  connections: {
    setId: number;
    puzzleForDay: QueryMethod<ContractConnectionsPuzzle>;
  };
}

export interface ChainWriteBindings {
  scores: {
    record: TransactionMethod;
  };
  beforeRecord?: () => Promise<void>;
}

type Source<T> = T | Promise<T> | (() => Promise<T>);

const MAX_U32 = 0xffff_ffff;

function assertUint(value: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} must be an integer between 0 and ${maximum}`);
  }
}

function toUintNumber(value: UintValue, maximum: number, label: string): number {
  let converted: bigint;
  try {
    converted = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new TypeError(`${label} was not an unsigned integer`);
  }
  if (converted < 0n || converted > BigInt(maximum)) {
    throw new RangeError(`${label} was outside its ABI range`);
  }
  return Number(converted);
}

function toBitmap(value: UintValue, label: string): bigint {
  if (
    typeof value === "number"
    && (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new RangeError(`${label} must cross the ABI boundary as an exact integer`);
  }
  let converted: bigint;
  try {
    converted = typeof value === "bigint" ? value : BigInt(value);
  } catch {
    throw new TypeError(`${label} was not an unsigned integer`);
  }
  if (converted < 0n || converted > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError(`${label} was outside uint64`);
  }
  return converted;
}

export function dayBitsFromContract(value: ContractDayBits): DayBits {
  return {
    played: toBitmap(value.played, "played_bits"),
    solved: toBitmap(value.solved, "solved_bits"),
    ontime: toBitmap(value.ontime, "ontime_bits"),
  };
}

export function histogramFromContract(value: ContractHistogram): Histogram {
  if (!value || typeof value !== "object" || !Array.isArray(value.buckets)) {
    throw new TypeError("histogram was not a {total, buckets[]} tuple");
  }
  return {
    total: toUintNumber(value.total, MAX_U32, "histogram total"),
    buckets: value.buckets.map((entry) => ({
      bucket: toUintNumber(entry.bucket, 0xff, "histogram bucket"),
      count: toUintNumber(entry.count, MAX_U32, "histogram count"),
    })),
  };
}

function detailFromContract(value: ContractDetail): Detail {
  if (!value || typeof value !== "object" || typeof value.solved !== "boolean") {
    throw new TypeError("detail was not a {score, solved} tuple");
  }
  return {
    score: toUintNumber(value.score, MAX_U32, "detail score"),
    solved: value.solved,
  };
}

function assertGameIds(gameIds: readonly number[]): void {
  if (gameIds.length === 0 || gameIds.length > 64) {
    throw new RangeError("Game id list must hold 1 to 64 ids");
  }
  for (const gameId of gameIds) {
    assertUint(gameId, 63, "Game id");
  }
}

function chainError(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, item) => typeof item === "bigint" ? item.toString() : item,
    );
  } catch {
    return String(value);
  }
}

function describeFailure(result: TransactionResult): string {
  const failure = result.error ?? result.dispatchError;
  if (failure instanceof Error) {
    const detail =
      (failure as { dispatchError?: unknown }).dispatchError
      ?? (failure as { reason?: unknown }).reason;
    return detail === undefined
      ? failure.message
      : `${failure.message} ${chainError(detail)}`;
  }
  return chainError(failure ?? "unknown dispatch error");
}

async function queryValue<T>(
  label: string,
  query: () => Promise<QueryResult<T>>,
): Promise<T> {
  const result = await query();
  if (!result.success) {
    throw new Error(`${label} failed: ${chainError(result.value)}`);
  }
  return result.value;
}

/**
 * The live implementation of the prototype's DataSource seam.
 *
 * A binding factory lets the client-side roster paint immediately while host,
 * signer, genesis, and contract setup finish in parallel.
 */
export class ChainDataSource implements DataSource {
  readonly #reads: () => Promise<ChainReadBindings>;
  readonly #writes: () => Promise<ChainWriteBindings>;
  readonly #activeWordListId: number;
  readonly #activeChessSetId: number;
  readonly #retryOptions: ChainReadRetryOptions;

  constructor(
    reads: Source<ChainReadBindings>,
    writes: Source<ChainWriteBindings>,
    activeWordListId: number,
    activeChessSetId: number,
    retryOptions: ChainReadRetryOptions = {},
  ) {
    assertUint(activeWordListId, MAX_U32, "Word list id");
    assertUint(activeChessSetId, MAX_U32, "Chess set id");
    this.#activeWordListId = activeWordListId;
    this.#activeChessSetId = activeChessSetId;
    this.#retryOptions = retryOptions;
    this.#reads =
      typeof reads === "function"
        ? reads
        : () => Promise.resolve(reads);
    this.#writes =
      typeof writes === "function"
        ? writes
        : () => Promise.resolve(writes);
  }

  async currentDay(): Promise<number> {
    return this.#read(async (bindings) =>
      toUintNumber(
        await queryValue("scores.currentDay", () =>
          bindings.scores.currentDay.query(),
        ),
        MAX_U32,
        "current day",
      ),
    );
  }

  async wordAnswer(day: number): Promise<string> {
    assertUint(day, MAX_U32, "Day");
    return this.#read(async (bindings) => {
      const word = await queryValue("word.wordForDay", () =>
        bindings.word.wordForDay.query(this.#activeWordListId, day),
      );
      if (typeof word !== "string") {
        throw new TypeError("word.wordForDay returned an invalid word");
      }
      return word;
    });
  }

  async chessPuzzle(day: number): Promise<ChessPuzzle> {
    assertUint(day, MAX_U32, "Day");
    return this.#read(async (bindings) => {
      const puzzle = await queryValue("chess.puzzleForDay", () =>
        bindings.chess.puzzleForDay.query(this.#activeChessSetId, day),
      );
      if (
        !puzzle
        || typeof puzzle !== "object"
        || typeof puzzle.fen !== "string"
        || typeof puzzle.moves !== "string"
      ) {
        throw new TypeError("chess.puzzleForDay returned an invalid puzzle");
      }
      return { fen: puzzle.fen, moves: puzzle.moves };
    });
  }

  async miniPuzzle(day: number): Promise<MiniPuzzle> {
    assertUint(day, MAX_U32, "Day");
    return this.#read(async (bindings) => {
      const puzzle = await queryValue("mini.puzzleForDay", () =>
        bindings.mini.puzzleForDay.query(bindings.mini.setId, day),
      );
      if (
        !puzzle
        || typeof puzzle !== "object"
        || typeof puzzle.grid !== "string"
        || !Array.isArray(puzzle.across)
        || !Array.isArray(puzzle.down)
        || [...puzzle.across, ...puzzle.down].some((clue) => typeof clue !== "string")
      ) {
        throw new TypeError("mini.puzzleForDay returned an invalid puzzle");
      }
      return {
        grid: puzzle.grid,
        across: [...puzzle.across],
        down: [...puzzle.down],
      };
    });
  }

  async connectionsPuzzle(day: number): Promise<ConnectionsPuzzle> {
    assertUint(day, MAX_U32, "Day");
    return this.#read(async (bindings) => {
      const puzzle = await queryValue("connections.puzzleForDay", () =>
        bindings.connections.puzzleForDay.query(bindings.connections.setId, day),
      );
      const groups: unknown = (puzzle as { groups?: unknown } | null)?.groups;
      if (
        !Array.isArray(groups)
        || groups.some(
          (group: unknown) =>
            !group
            || typeof group !== "object"
            || typeof (group as { label?: unknown }).label !== "string"
            || !Array.isArray((group as { words?: unknown }).words)
            || (group as { words: unknown[] }).words.some((word) => typeof word !== "string"),
        )
      ) {
        throw new TypeError("connections.puzzleForDay returned an invalid puzzle");
      }
      return {
        groups: (groups as ContractConnectionsPuzzle["groups"]).map((group) => ({
          label: group.label,
          words: [...group.words],
          tier: toUintNumber(group.tier, 3, "tier"),
        })),
      };
    });
  }

  async dayBits(day: number): Promise<DayBits> {
    assertUint(day, MAX_U32, "Day");
    return this.#read(async (bindings) => {
      const accountH160 = await this.#accountH160(bindings.accountH160);
      return dayBitsFromContract(
        await queryValue("scores.getDay", () =>
          bindings.scores.getDay.query(accountH160, day),
        ),
      );
    });
  }

  async dayBitsRange(from: number, count: number): Promise<DayBits[]> {
    assertUint(from, MAX_U32, "First day");
    assertUint(count, 64, "Range count");
    if (count === 0) {
      return [];
    }
    if (from + count - 1 > MAX_U32) {
      throw new RangeError("Day range exceeds uint32");
    }
    return this.#read(async (bindings) => {
      const accountH160 = await this.#accountH160(bindings.accountH160);
      const values = await queryValue("scores.getDays", () =>
        bindings.scores.getDays.query(accountH160, from, count),
      );
      if (!Array.isArray(values) || values.length !== count) {
        throw new Error(
          `scores.getDays returned ${Array.isArray(values) ? values.length : "invalid"} days; expected ${count}`,
        );
      }
      return values.map(dayBitsFromContract);
    });
  }

  async histogram(gameId: number, day: number): Promise<Histogram> {
    assertUint(gameId, 63, "Game id");
    assertUint(day, MAX_U32, "Day");
    return this.#read(async (bindings) =>
      histogramFromContract(
        await queryValue("scores.histogram", () =>
          bindings.scores.histogram.query(gameId, day),
        ),
      ),
    );
  }

  async histograms(day: number, gameIds: readonly number[]): Promise<Histogram[]> {
    assertUint(day, MAX_U32, "Day");
    assertGameIds(gameIds);
    return this.#read(async (bindings) => {
      const values = await queryValue("scores.histograms", () =>
        bindings.scores.histograms.query(day, [...gameIds]),
      );
      if (!Array.isArray(values) || values.length !== gameIds.length) {
        throw new Error(
          `scores.histograms returned ${Array.isArray(values) ? values.length : "invalid"} games; expected ${gameIds.length}`,
        );
      }
      return values.map(histogramFromContract);
    });
  }

  async details(day: number, gameIds: readonly number[]): Promise<Detail[]> {
    assertUint(day, MAX_U32, "Day");
    assertGameIds(gameIds);
    return this.#read(async (bindings) => {
      const accountH160 = await this.#accountH160(bindings.accountH160);
      const values = await queryValue("scores.getDetails", () =>
        bindings.scores.getDetails.query(accountH160, day, [...gameIds]),
      );
      if (!Array.isArray(values) || values.length !== gameIds.length) {
        throw new Error(
          `scores.getDetails returned ${Array.isArray(values) ? values.length : "invalid"} games; expected ${gameIds.length}`,
        );
      }
      return values.map(detailFromContract);
    });
  }

  async record(
    gameId: number,
    day: number,
    score: number,
    solved: boolean,
  ): Promise<void> {
    assertUint(gameId, 63, "Game id");
    assertUint(day, MAX_U32, "Day");
    assertUint(score, MAX_U32, "Score");
    if (typeof solved !== "boolean") {
      throw new TypeError("Solved must be a boolean");
    }

    try {
      const bindings = await this.#writes();
      await bindings.beforeRecord?.();
      const result = await bindings.scores.record.tx(
        gameId,
        day,
        score,
        solved,
        { waitFor: "best-block" },
      );
      if (!result.ok) {
        throw new Error(`scores.record failed: ${describeFailure(result)}`);
      }
    } catch (error) {
      // Every game's result line shows "Recording failed." and keeps the
      // cause to itself; the console (logcat on a phone) gets it here.
      console.error(
        `[daily-on-dot] record(game ${gameId}, day ${day}) failed`,
        error,
      );
      throw error;
    }
  }

  #read<T>(read: (bindings: ChainReadBindings) => Promise<T>): Promise<T> {
    return retryChainRead(
      async () => read(await this.#reads()),
      this.#retryOptions,
    );
  }

  #accountH160(source: AccountSource): Promise<`0x${string}`> {
    if (typeof source === "function") {
      return source();
    }
    return Promise.resolve(source);
  }
}
