import type { NetworkTarget } from "../networks";

export interface ChainSpec {
  name: string;
  genesisHash: string;
}

export interface ChainSpecReader {
  getChainSpecData(): Promise<ChainSpec>;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

export class GenesisMismatchError extends Error {
  readonly headline =
    "This version of Daily on Dot is for a different network.";

  constructor(
    readonly expected: NetworkTarget,
    readonly connected: ChainSpec,
  ) {
    super(
      `built for ${expected.label} (genesis ${shortHash(expected.genesisHash)}), `
        + `connected to ${connected.name} (genesis ${shortHash(connected.genesisHash)})`,
    );
    this.name = "GenesisMismatchError";
  }
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out reading the chain identity.")),
      timeoutMs,
    );
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

/** Prove that the host-selected chain matches the contracts compiled in. */
export async function assertExpectedGenesis(
  client: ChainSpecReader,
  expected: NetworkTarget,
  timeoutMs = 15_000,
): Promise<ChainSpec> {
  const connected = await withTimeout(client.getChainSpecData(), timeoutMs);
  if (
    connected.genesisHash.toLowerCase()
    !== expected.genesisHash.toLowerCase()
  ) {
    throw new GenesisMismatchError(expected, connected);
  }
  return connected;
}
