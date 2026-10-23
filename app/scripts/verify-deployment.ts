/**
 * Read-only verification for the selected finalized deployment.
 *
 * Every recorded ABI must match both its stored fingerprint and the current
 * contract build. Each address is then queried through one view function; a
 * mismatch, revert, missing record, or unreachable contract exits non-zero.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getDevPublicKey } from "@parity/product-sdk-tx";
import { AccountId, Binary, createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import {
  decodeFunctionResult,
  encodeFunctionData,
  hexToBytes,
  type Abi,
} from "viem";

import {
  assetHubRpc,
  CONTRACT_NAMES,
  deploymentAbiPath,
  describeTarget,
  readDeploymentRecord,
  targetNetwork,
  type ContractName,
} from "./target";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const contractsDirectory = join(scriptsDirectory, "..", "..", "contracts");
const network = targetNetwork();
const rpc = assetHubRpc(network);

const builtAbiPaths: Record<ContractName, string> = {
  scores: join(
    contractsDirectory,
    "scores",
    "target",
    "daily-scores.release.abi.json",
  ),
  word: join(
    contractsDirectory,
    "word",
    "target",
    "word-registry.release.abi.json",
  ),
  chess: join(
    contractsDirectory,
    "chess",
    "target",
    "chess-registry.release.abi.json",
  ),
  mini: join(
    contractsDirectory,
    "mini",
    "target",
    "mini-registry.release.abi.json",
  ),
  connections: join(
    contractsDirectory,
    "connections",
    "target",
    "connections-registry.release.abi.json",
  ),
};

const probes: Record<
  ContractName,
  { functionName: string; args: readonly unknown[] }
> = {
  scores: { functionName: "currentDay", args: [] },
  word: { functionName: "getLists", args: [0xffff_ffff, 1] },
  chess: { functionName: "getSets", args: [0xffff_ffff, 1] },
  mini: { functionName: "getSets", args: [0xffff_ffff, 1] },
  connections: { functionName: "getSets", args: [0xffff_ffff, 1] },
};

function sha256Abi(contents: Uint8Array): string {
  const parsed = JSON.parse(new TextDecoder().decode(contents)) as unknown;
  return createHash("sha256")
    .update(JSON.stringify(parsed))
    .digest("hex");
}

function outputHex(value: string | Uint8Array): `0x${string}` {
  return (
    typeof value === "string" ? value : Binary.toHex(value)
  ) as `0x${string}`;
}

async function main(): Promise<void> {
  const deployment = readDeploymentRecord(network);
  const names = CONTRACT_NAMES;
  const abis = {} as Record<ContractName, Abi>;

  for (const name of names) {
    const recordedAbi = deployment.abis[name];
    const [recorded, built] = await Promise.all([
      readFile(deploymentAbiPath(recordedAbi.file)),
      readFile(builtAbiPaths[name]),
    ]);
    const recordedHash = sha256Abi(recorded);
    const builtHash = sha256Abi(built);
    if (
      recordedHash !== recordedAbi.sha256 ||
      recordedHash !== builtHash
    ) {
      throw new Error(
        `${name} ABI mismatch: the recorded ABI, deployment fingerprint, `
          + "and current contract build must be identical.",
      );
    }
    abis[name] = JSON.parse(recorded.toString("utf8")) as Abi;
  }

  console.log(describeTarget(network, rpc));
  const caller = AccountId(0).dec(getDevPublicKey("Alice"));
  const client = createClient(getWsProvider(rpc));
  try {
    // The generated descriptor currently lags ReviveApi.call.
    const unsafeApi = client.getUnsafeApi();
    for (const name of names) {
      const probe = probes[name];
      const data = encodeFunctionData({
        abi: abis[name],
        functionName: probe.functionName,
        args: probe.args,
      });
      const result: any = await (unsafeApi as any).apis.ReviveApi.call(
        caller,
        deployment.contracts[name],
        0n,
        undefined,
        undefined,
        hexToBytes(data),
        { at: "best" },
      );
      if (!result.result.success || result.result.value.flags !== 0) {
        throw new Error(
          `${name} at ${deployment.contracts[name]} did not answer `
            + `${probe.functionName}().`,
        );
      }
      decodeFunctionResult({
        abi: abis[name],
        functionName: probe.functionName,
        data: outputHex(result.result.value.data),
      });
      console.log(
        `Verified ${name} at ${deployment.contracts[name]} `
          + `with ${probe.functionName}().`,
      );
    }
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
