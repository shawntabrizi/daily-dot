import { createChainClient } from "@parity/product-sdk-chain-client";
import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

import type { NetworkTarget } from "../networks";
import {
  assertExpectedGenesis,
  GenesisMismatchError,
} from "./genesis";
import { assetHubDescriptor } from "./chain-descriptor";

export interface ReadChainConnection {
  client: PolkadotClient;
  transport: "host" | "direct";
  destroy(): void;
}

interface UnverifiedChainConnection {
  client: PolkadotClient;
  destroy(): void;
}

export interface ReadChainDependencies {
  createHost(network: NetworkTarget): Promise<UnverifiedChainConnection>;
  createDirect(
    endpoints: readonly [string, ...string[]],
  ): Promise<UnverifiedChainConnection>;
  assertGenesis(
    client: PolkadotClient,
    network: NetworkTarget,
  ): Promise<unknown>;
}

const defaultDependencies: ReadChainDependencies = {
  async createHost(network) {
    const client = await createChainClient({
      chains: { assetHub: assetHubDescriptor(network) },
    });
    return {
      client: client.raw.assetHub,
      destroy: () => client.destroy(),
    };
  },
  async createDirect(endpoints) {
    const client = createClient(getWsProvider([...endpoints]));
    return {
      client,
      destroy: () => client.destroy(),
    };
  },
  assertGenesis: assertExpectedGenesis,
};

async function verifyConnection(
  connection: UnverifiedChainConnection,
  transport: ReadChainConnection["transport"],
  network: NetworkTarget,
  dependencies: ReadChainDependencies,
): Promise<ReadChainConnection> {
  try {
    await dependencies.assertGenesis(connection.client, network);
    return { ...connection, transport };
  } catch (error) {
    connection.destroy();
    throw error;
  }
}

/**
 * Prefer the host-owned chain connection, then use the configured community
 * endpoints when the target chain is unavailable through the host.
 */
export async function connectReadChain(
  network: NetworkTarget,
  dependencies: ReadChainDependencies = defaultDependencies,
): Promise<ReadChainConnection> {
  try {
    return await verifyConnection(
      await dependencies.createHost(network),
      "host",
      network,
      dependencies,
    );
  } catch (error) {
    if (error instanceof GenesisMismatchError) {
      throw error;
    }
  }

  return verifyConnection(
    await dependencies.createDirect(network.assetHubRpc),
    "direct",
    network,
    dependencies,
  );
}
