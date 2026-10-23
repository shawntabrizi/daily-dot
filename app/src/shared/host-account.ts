import { createChainClient } from "@parity/product-sdk-chain-client";

import type { NetworkTarget } from "../networks";
import { assetHubDescriptor } from "./chain-descriptor";

export interface HostAccountBalances {
  /** Native free balance, in planck. */
  pas: bigint;
  /** The PGAS asset balance, or null when this chain has no Pgas pallet. */
  pgas: bigint | null;
}

interface AssetHubUnsafeApi {
  constants: { Pgas: { PgasAssetId(): Promise<unknown> } };
  query: {
    System: {
      Account: {
        getValue(
          who: string,
          options: { at: "best" },
        ): Promise<{ data: { free: bigint } }>;
      };
    };
    Assets: {
      Account: {
        getValue(
          id: unknown,
          who: string,
          options: { at: "best" },
        ): Promise<{ balance: bigint } | undefined>;
      };
    };
    Revive: {
      OriginalAccount: {
        getValue(h160: string, options: { at: "best" }): Promise<unknown>;
      };
    };
  };
}

async function unsafeApi(network: NetworkTarget): Promise<AssetHubUnsafeApi> {
  const client = await createChainClient({
    chains: { assetHub: assetHubDescriptor(network) },
  });
  return client.raw.assetHub.getUnsafeApi() as unknown as AssetHubUnsafeApi;
}

/** An account's PAS and PGAS at the best block, through the host's chain. */
export async function hostAccountBalances(
  network: NetworkTarget,
  address: string,
): Promise<HostAccountBalances> {
  const api = await unsafeApi(network);
  const account = await api.query.System.Account.getValue(address, {
    at: "best",
  });
  let pgas: bigint | null = null;
  try {
    const id = await api.constants.Pgas.PgasAssetId();
    const held = await api.query.Assets.Account.getValue(id, address, {
      at: "best",
    });
    pgas = BigInt(held?.balance ?? 0);
  } catch {
    pgas = null;
  }
  return { pas: BigInt(account.data.free), pgas };
}

/**
 * Whether pallet-revive maps this H160 at the best block. The SDK's own check
 * reads the finalized block, which lags a mapping the host just made.
 */
export async function isAccountMappedAtBest(
  network: NetworkTarget,
  h160: string,
): Promise<boolean> {
  const api = await unsafeApi(network);
  const original = await api.query.Revive.OriginalAccount.getValue(h160, {
    at: "best",
  });
  return original !== undefined;
}
