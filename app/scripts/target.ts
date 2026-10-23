/**
 * Build- and tool-time resolution of the target network.
 *
 * Vite and every chain-facing script resolve `DAILY_NETWORK` here so the
 * selected endpoint, deployment record, and compiled bundle cannot drift.
 */

import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NETWORK_IDS,
  resolveNetwork,
  type NetworkId,
  type NetworkTarget,
} from "../src/networks";

export const appDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const CONTRACT_NAMES = ["scores", "word", "chess", "mini", "connections"] as const;
export type ContractName = (typeof CONTRACT_NAMES)[number];
export type ProcessEnv = Record<string, string | undefined>;

export interface PendingDeploymentRecord {
  network: NetworkId;
  chain: string;
  status: "pending";
}

export interface ActiveDeploymentRecord {
  network: NetworkId;
  chain: string;
  status: "deployed";
  contracts: Record<ContractName, `0x${string}`>;
  abis: Record<ContractName, { file: string; sha256: string }>;
  content?: {
    wordListId?: number;
    chessSetId?: number;
    miniSetId?: number;
    connectionsSetId?: number;
  };
  deployedAt: string;
}

export type TargetRecord = PendingDeploymentRecord | ActiveDeploymentRecord;

export function targetNetwork(env: ProcessEnv = process.env): NetworkTarget {
  return resolveNetwork(env.DAILY_NETWORK);
}

export function assetHubRpc(
  network: NetworkTarget,
  env: ProcessEnv = process.env,
): string {
  return env.DAILY_AH_RPC ?? network.assetHubRpc[0];
}

export function deploymentRecordPath(network: NetworkTarget): string {
  return join(appDirectory, "src", "deployments", `${network.id}.json`);
}

export function deploymentAbiPath(file: string): string {
  if (basename(file) !== file || !file.endsWith(".abi.json")) {
    throw new Error(`Unsafe deployment ABI filename "${file}".`);
  }
  return join(appDirectory, "src", "deployments", file);
}

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function parseTargetRecord(
  network: NetworkTarget,
  file: string,
  raw: string,
): TargetRecord {
  const value = JSON.parse(raw) as Partial<TargetRecord>;
  if (value.network !== network.id) {
    throw new Error(
      `${file} declares network "${String(value.network)}" but was read as "${network.id}".`,
    );
  }
  if (value.chain !== network.chainKey) {
    throw new Error(
      `${file} declares chain "${String(value.chain)}" but "${network.id}" uses "${network.chainKey}".`,
    );
  }
  if (value.status === "pending") {
    return {
      network: network.id,
      chain: network.chainKey,
      status: "pending",
    };
  }
  if (value.status !== "deployed") {
    throw new Error(`${file} must declare status "pending" or "deployed".`);
  }

  const active = value as Partial<ActiveDeploymentRecord>;
  for (const name of CONTRACT_NAMES) {
    if (!isAddress(active.contracts?.[name])) {
      throw new Error(`${file} must contain a valid ${name} contract address.`);
    }
    const abi = active.abis?.[name];
    if (
      abi === undefined ||
      basename(abi.file) !== abi.file ||
      !abi.file.endsWith(".abi.json") ||
      !isSha256(abi.sha256)
    ) {
      throw new Error(`${file} must contain valid ${name} ABI metadata.`);
    }
  }
  if (active.content !== undefined) {
    const ids = [
      active.content.wordListId,
      active.content.chessSetId,
      active.content.miniSetId,
      active.content.connectionsSetId,
    ];
    if (
      ids.every((id) => id === undefined)
      || ids.some(
        (id) =>
          id !== undefined
          && (
            !Number.isInteger(id)
            || id < 0
            || id > 0xffff_ffff
          ),
      )
    ) {
      throw new Error(`${file} must contain valid content ids.`);
    }
  }
  if (typeof active.deployedAt !== "string" || !active.deployedAt.trim()) {
    throw new Error(`${file} must record when the stack finalized.`);
  }
  return active as ActiveDeploymentRecord;
}

/** Read the target marker used by the Vite build guard. */
export function readTargetRecord(network: NetworkTarget): TargetRecord {
  const file = deploymentRecordPath(network);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `No deployment record for "${network.id}" at ${file}. `
        + `Builds are refused until that network has an explicit record.`,
    );
  }
  return parseTargetRecord(network, file, raw);
}

/** Chain tools require finalized addresses, not the pre-deployment marker. */
export function readDeploymentRecord(
  network: NetworkTarget,
): ActiveDeploymentRecord {
  const record = readTargetRecord(network);
  if (record.status !== "deployed") {
    throw new Error(
      `${deploymentRecordPath(network)} is still pending. `
        + `Build and deploy the contracts before running this tool.`,
    );
  }
  return record;
}

export function describeTarget(
  network: NetworkTarget,
  rpc: string,
): string {
  return `Network: ${network.label} [${network.id}, ${network.kind}]\nEndpoint: ${rpc}`;
}

export { NETWORK_IDS };
