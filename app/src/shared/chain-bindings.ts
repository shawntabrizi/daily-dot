import { createChainClient } from "@parity/product-sdk-chain-client";
import {
  createContractFromClient,
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
} from "@parity/product-sdk-contracts";
import { requestResourceAllocation } from "@parity/product-sdk-host";
import { HostProvider, SignerManager } from "@parity/product-sdk-signer";

import type { NetworkTarget } from "../networks";
import type {
  ChainReadBindings,
  ChainWriteBindings,
} from "./chain-data-source";
import { assetHubDescriptor } from "./chain-descriptor";
import {
  assertExpectedGenesis,
  GenesisMismatchError,
} from "./genesis";
import { hostAccountBalances, isAccountMappedAtBest } from "./host-account";
import { HostSignerUnavailableError } from "./host-signer";
import { connectReadChain } from "./read-chain-client";
import { rememberAutoSignOutcome, type AutoSignOutcome } from "./save-consent";

/**
 * PGAS (planck) under which a write first asks the phone for the allowance.
 * Fees and storage deposits are both taken from PGAS: a day's first record
 * costs about 0.85 PGAS (three bitmaps and one detail item), each further
 * game that day about 0.02. One allowance claim brings 5 PGAS.
 */
const ENOUGH_PGAS = 10_000_000_000n;

/** Waits for the claimed PGAS to land: a balance above what was held before. */
async function waitForPgas(
  network: NetworkTarget,
  address: string,
  heldBefore: bigint,
  attempts = 30,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const held = await hostAccountBalances(network, address);
    if (held.pgas === null || held.pgas > heldBefore) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("The allowance was granted but no PGAS reached the account.");
}

/**
 * The live bindings the app boots with: the host signer, the read contracts
 * and the one write (`scores.record`). Kept apart from `main.ts` so a Node
 * harness against a headless host (`tools/record-smoke.mts`) runs exactly the
 * app's write path.
 */

export interface ContractAddresses {
  scores: `0x${string}`;
  word: `0x${string}`;
  chess: `0x${string}`;
  mini: `0x${string}`;
  connections: `0x${string}`;
}

export interface ContractAbis {
  scores: unknown;
  word: unknown;
  chess: unknown;
  mini: unknown;
  connections: unknown;
}

export const ANONYMOUS_H160 =
  "0x0000000000000000000000000000000000000000" as const;

export function hostSignerFactory(network: NetworkTarget) {
  let ready: ReturnType<typeof connect> | null = null;

  const connect = async () => {
    let provider: HostProvider | null = null;
    const manager = new SignerManager({
      ss58Prefix: network.ss58Prefix,
      dappName: "daily-on-dot",
      createProvider: (type) => {
        if (type !== "host") {
          throw new Error(
            `Daily on Dot signs only through the host provider (asked for "${type}").`,
          );
        }
        provider = new HostProvider({
          ss58Prefix: network.ss58Prefix,
          productAccount: {
            dotNsIdentifier: network.domain,
            derivationIndex: 0,
            requestName: false,
          },
        });
        return provider;
      },
    });

    try {
      const connected = await manager.connect();
      if (!connected.ok) {
        throw new HostSignerUnavailableError(connected.error.message);
      }

      const product = await manager.getProductAccount(network.domain, 0);
      if (!product.ok) {
        throw new HostSignerUnavailableError(product.error.message);
      }
      if (!provider) {
        throw new HostSignerUnavailableError("no host provider was created");
      }
      // A product account holds PGAS and no PAS. Since Asset Hub runtime
      // 3004000 fees and storage deposits are paid in PGAS only through
      // transaction-extension pipeline 1; the SDK's default
      // (`account.getSigner()`, pipeline 0) charges native PAS and the pool
      // refuses the transaction as `Invalid.Payment` (reproduced 2026-10-21
      // with a headless host, WP31).
      const signer = (provider as HostProvider).getProductAccountSigner(
        {
          dotNsIdentifier: network.domain,
          derivationIndex: 0,
          publicKey: product.value.publicKey,
        },
        { txExtVersion: 1 },
      );
      return { manager, account: product.value, signer };
    } catch (error) {
      manager.destroy();
      throw error;
    }
  };

  return () => {
    ready ??= connect().catch((error: unknown) => {
      ready = null;
      throw error;
    });
    return ready;
  };
}

export type HostSigner = ReturnType<typeof hostSignerFactory>;

export function readBindingsFactory(
  network: NetworkTarget,
  contracts: ContractAddresses,
  abis: ContractAbis,
  hostSigner: HostSigner,
  miniSetId: number,
  connectionsSetId: number,
): () => Promise<ChainReadBindings> {
  let ready: Promise<ChainReadBindings> | null = null;
  let accountReady: Promise<`0x${string}`> | null = null;

  const accountH160 = (): Promise<`0x${string}`> => {
    accountReady ??= hostSigner()
      .then(({ account }) => account.h160Address)
      .catch(() => ANONYMOUS_H160);
    return accountReady;
  };

  const connect = async (): Promise<ChainReadBindings> => {
    const descriptor = assetHubDescriptor(network);
    const connection = await connectReadChain(network);
    const scores = createContractFromClient(
      connection.client,
      descriptor,
      contracts.scores,
      abis.scores as never,
    );
    const word = createContractFromClient(
      connection.client,
      descriptor,
      contracts.word,
      abis.word as never,
    );
    const chess = createContractFromClient(
      connection.client,
      descriptor,
      contracts.chess,
      abis.chess as never,
    );
    const mini = createContractFromClient(
      connection.client,
      descriptor,
      contracts.mini,
      abis.mini as never,
    );
    const connections = createContractFromClient(
      connection.client,
      descriptor,
      contracts.connections,
      abis.connections as never,
    );
    const bindings: ChainReadBindings = {
      accountH160:
        connection.transport === "host" ? accountH160 : ANONYMOUS_H160,
      scores: scores as unknown as ChainReadBindings["scores"],
      word: word as unknown as ChainReadBindings["word"],
      chess: chess as unknown as ChainReadBindings["chess"],
      mini: {
        setId: miniSetId,
        puzzleForDay: (mini as unknown as ChainReadBindings["mini"]).puzzleForDay,
      },
      connections: {
        setId: connectionsSetId,
        puzzleForDay: (
          connections as unknown as ChainReadBindings["connections"]
        ).puzzleForDay,
      },
    };
    return bindings;
  };

  return () => {
    ready ??= connect().catch((error: unknown) => {
      if (!(error instanceof GenesisMismatchError)) {
        ready = null;
      }
      throw error;
    });
    return ready;
  };
}

/**
 * Ask the host for silent signing on the product account. Logged, never
 * thrown: the write path works either way, with or without the prompt. The
 * outcome is remembered for this app run only: only "Allocated" lets later
 * finishes save without asking first (save-consent.ts).
 */
export async function requestAutoSigning(
  request: typeof requestResourceAllocation = requestResourceAllocation,
): Promise<AutoSignOutcome> {
  const outcome = await askAutoSigning(request);
  rememberAutoSignOutcome(outcome);
  return outcome;
}

async function askAutoSigning(
  request: typeof requestResourceAllocation,
): Promise<AutoSignOutcome> {
  try {
    const allocation = await request([{ tag: "AutoSigning", value: undefined }]);
    if (!allocation.ok) {
      console.warn(`[daily-on-dot] auto-signing request failed: ${allocation.error.message}`);
      return "Failed";
    }
    const outcome = allocation.value[0] ?? "NotAvailable";
    console.info(`[daily-on-dot] auto-signing: ${outcome}`);
    return outcome;
  } catch (error) {
    console.warn("[daily-on-dot] auto-signing request threw", error);
    return "Failed";
  }
}

export function writeBindingsFactory(
  network: NetworkTarget,
  contracts: Pick<ContractAddresses, "scores">,
  abis: Pick<ContractAbis, "scores">,
  hostSigner: HostSigner,
): () => Promise<ChainWriteBindings> {
  let ready: Promise<ChainWriteBindings> | null = null;

  const connect = async (): Promise<ChainWriteBindings> => {
    const descriptor = assetHubDescriptor(network);
    const { account, signer } = await hostSigner();
    const client = await createChainClient({
      chains: { assetHub: descriptor },
    });
    await assertExpectedGenesis(client.raw.assetHub, network);

    const scores = createContractFromClient(
      client.raw.assetHub,
      descriptor,
      contracts.scores,
      abis.scores as never,
      {
        defaultOrigin: account.address,
        defaultSigner: signer,
      },
    );

    let writeReady: Promise<void> | null = null;
    const beforeRecord = (): Promise<void> => {
      writeReady ??= (async () => {
        // RFC-0010 `AutoSigning`: the host asks the user once, then signs the
        // product account's transactions with no sheet. A refusal, or a host
        // without it, leaves the per-write prompt in place; nothing fails.
        await requestAutoSigning();

        // PGAS pays the fees and the storage deposits. The allowance has the
        // phone claim PGAS into the product account, which takes a proof, a
        // transaction and one of a lite person's 10 daily statement slots, so
        // it is asked for only when the account runs low.
        const held = await hostAccountBalances(network, account.address);
        if (held.pgas === null || held.pgas < ENOUGH_PGAS) {
          const allocation = await requestResourceAllocation([
            { tag: "SmartContractAllowance", value: { tag: "Index", value: 0 } },
          ]);
          if (!allocation.ok) {
            throw new Error(
              `Smart-contract allowance failed: ${allocation.error.message}`,
            );
          }
          const outcome = allocation.value[0];
          if (outcome !== "Allocated") {
            throw new Error(
              outcome === "Rejected"
                ? "Smart-contract allowance was rejected."
                : "Smart-contract allowance is not available.",
            );
          }
          // The PGAS lands a block or so after the phone answers. The mapping
          // below may be the account's first transaction, and the pool refuses
          // one the account cannot pay for (`Invalid.Payment`).
          await waitForPgas(network, account.address, held.pgas ?? 0n);
        }

        // The SDK's mapping check reads the finalized block, which lags a
        // mapping the host just made; a second `map_account` fails.
        if (await isAccountMappedAtBest(network, account.h160Address)) {
          return;
        }
        const runtime = createContractRuntimeFromClient(
          client.raw.assetHub,
          descriptor,
        );
        const mapped = await ensureContractAccountMapped(
          runtime,
          account.address,
          signer,
        );
        if (!mapped.ok) {
          throw new Error(`Account mapping failed: ${mapped.error.message}`);
        }
      })().catch((error: unknown) => {
        writeReady = null;
        throw error;
      });
      return writeReady;
    };

    return {
      scores: scores as unknown as ChainWriteBindings["scores"],
      beforeRecord,
    };
  };

  return () => {
    ready ??= connect().catch((error: unknown) => {
      ready = null;
      throw error;
    });
    return ready;
  };
}
