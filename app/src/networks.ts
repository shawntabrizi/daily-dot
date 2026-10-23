/**
 * The networks Daily on Dot can be built for.
 *
 * This module is shared by the browser bundle and Node tooling, so it must
 * stay free of `process`, `import.meta.env`, and DOM access.
 */

export type NetworkId = "paseo-next-v2";

export interface NetworkTarget {
  id: NetworkId;
  label: string;
  kind: "testnet" | "mainnet";
  /** Stable namespace for network-specific client storage. */
  chainKey: string;
  genesisHash: `0x${string}`;
  assetHubRpc: readonly [string, ...string[]];
  token: { symbol: string; decimals: number };
  ss58Prefix: number;
  /** The DotNS name. It derives the player accounts, so it is per network. */
  domain: string;
  publish: {
    cli: "bulletin-deploy";
    env: string;
  };
}

export const NETWORKS: Record<NetworkId, NetworkTarget> = {
  "paseo-next-v2": {
    id: "paseo-next-v2",
    label: "Paseo Next v2 (Asset Hub Next)",
    kind: "testnet",
    chainKey: "paseo-asset-hub",
    genesisHash:
      "0x4349b00e54897e21196fd331015fc5be0f14e118beb0375ed2bb1793737bb57a",
    assetHubRpc: ["wss://paseo-asset-hub-next-rpc.polkadot.io"],
    token: { symbol: "PAS", decimals: 10 },
    ss58Prefix: 42,
    domain: "dailyondot.paseo",
    publish: { cli: "bulletin-deploy", env: "paseo-next-v2" },
  },
};

export const DEFAULT_NETWORK_ID: NetworkId = "paseo-next-v2";
export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && Object.hasOwn(NETWORKS, value);
}

/** Resolve a configured id, failing loudly rather than falling back silently. */
export function resolveNetwork(value: string | undefined | null): NetworkTarget {
  if (value === undefined || value === null || value === "") {
    return NETWORKS[DEFAULT_NETWORK_ID];
  }
  if (!isNetworkId(value)) {
    throw new Error(
      `Unknown network "${value}". Set DAILY_NETWORK to one of: ${NETWORK_IDS.join(", ")}.`,
    );
  }
  return NETWORKS[value];
}
