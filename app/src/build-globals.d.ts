import type { NetworkId } from "./networks";

declare global {
  interface BuiltDeployment {
    network: NetworkId;
    chain: string;
    status: "pending" | "deployed";
    contracts?: {
      scores: `0x${string}`;
      word: `0x${string}`;
      chess: `0x${string}`;
      mini: `0x${string}`;
      connections: `0x${string}`;
    };
    content?: {
      wordListId?: number;
      chessSetId?: number;
      miniSetId?: number;
      connectionsSetId?: number;
    };
  }

  const __DAILY_NETWORK__: NetworkId;
  const __DAILY_DEPLOYMENT__: BuiltDeployment;
  const __DAILY_ABIS__: {
    scores: readonly unknown[];
    word: readonly unknown[];
    chess: readonly unknown[];
    mini: readonly unknown[];
    connections: readonly unknown[];
  } | null;
  const __DAILY_SOURCE__: "stub" | "chain";
}
