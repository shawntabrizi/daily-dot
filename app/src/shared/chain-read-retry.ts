/**
 * Contract reads are idempotent. Retry only failures that indicate the
 * community endpoint or its ChainHead follower was interrupted.
 */

export const CHAIN_READ_RETRY_DELAYS_MS = [250, 500, 1_000] as const;
export const CHAIN_READ_TIMEOUT_MS = 15_000;

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  cause?: unknown;
  errors?: unknown;
};

function nestedErrors(error: unknown): Iterable<unknown> {
  if (typeof error !== "object" || error === null) {
    return [];
  }
  const candidate = error as ErrorLike;
  const nested: unknown[] = [];
  if (candidate.cause !== undefined) {
    nested.push(candidate.cause);
  }
  if (Array.isArray(candidate.errors)) {
    nested.push(...candidate.errors);
  }
  return nested;
}

/** True only for endpoint/follower failures where repeating a read is safe. */
export function isTransientChainReadError(error: unknown): boolean {
  const pending: unknown[] = [error];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const candidate = pending.shift();
    if (typeof candidate !== "object" || candidate === null) {
      continue;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);

    const details = candidate as ErrorLike;
    if (details.name === "DisjointError" || details.name === "ChainReadTimeoutError") {
      return true;
    }
    if (
      typeof details.message === "string"
      && /(?:websocket|connection|disconnected|network|rpc).*(?:closed|dropped|failed|lost|unavailable|timeout)|timed? ?out|temporarily unavailable/i.test(
        details.message,
      )
    ) {
      return true;
    }
    for (const nested of nestedErrors(candidate)) {
      pending.push(nested);
    }
  }
  return false;
}

export interface ChainReadRetryOptions {
  delays?: readonly number[];
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class ChainReadTimeoutError extends Error {
  constructor() {
    super("Timed out reading the chain.");
    this.name = "ChainReadTimeoutError";
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ChainReadTimeoutError()), timeoutMs);
    void operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Retry a side-effect-free read with a bounded timeout and backoff. */
export async function retryChainRead<T>(
  read: () => Promise<T>,
  {
    delays = CHAIN_READ_RETRY_DELAYS_MS,
    sleep = defaultSleep,
    timeoutMs = CHAIN_READ_TIMEOUT_MS,
  }: ChainReadRetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await withTimeout(read(), timeoutMs);
    } catch (error) {
      if (!isTransientChainReadError(error) || attempt >= delays.length) {
        throw error;
      }
      await sleep(delays[attempt] ?? 0);
    }
  }
}
