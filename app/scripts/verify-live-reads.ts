/**
 * Manual WP7 read proof against the selected network's finalized deployment.
 *
 * This is intentionally not a test: it opens a real WebSocket and prints
 * decoded contract state for an operator to inspect.
 */

import { readFile } from "node:fs/promises";

import { ss58ToH160 } from "@parity/product-sdk-address";
import { getDevPublicKey } from "@parity/product-sdk-tx";
import { AccountId, Binary, createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import {
  decodeFunctionResult,
  encodeFunctionData,
  hexToBytes,
  type Abi,
} from "viem";

import { assertExpectedGenesis } from "../src/shared/genesis";
import {
  assetHubRpc,
  deploymentAbiPath,
  describeTarget,
  readDeploymentRecord,
  targetNetwork,
} from "./target";

interface DayBits {
  played: bigint;
  solved: bigint;
  ontime: bigint;
}

function outputHex(value: string | Uint8Array): `0x${string}` {
  return (
    typeof value === "string" ? value : Binary.toHex(value)
  ) as `0x${string}`;
}

async function main(): Promise<void> {
  const network = targetNetwork();
  const deployment = readDeploymentRecord(network);
  const listId = deployment.content?.wordListId;
  if (listId === undefined) {
    throw new Error(
      `The ${network.id} deployment has no active Word list id.`,
    );
  }

  const [scoresAbi, wordAbi] = await Promise.all([
    readFile(deploymentAbiPath(deployment.abis.scores.file), "utf8").then(
      (contents) => JSON.parse(contents) as Abi,
    ),
    readFile(deploymentAbiPath(deployment.abis.word.file), "utf8").then(
      (contents) => JSON.parse(contents) as Abi,
    ),
  ]);
  const rpc = assetHubRpc(network);
  const caller = AccountId(0).dec(getDevPublicKey("Alice"));
  const accountH160 = ss58ToH160(caller);
  const client = createClient(getWsProvider(rpc));

  try {
    await assertExpectedGenesis(client, network);
    const unsafeApi = client.getUnsafeApi();
    const query = async <T>(
      destination: `0x${string}`,
      abi: Abi,
      functionName: string,
      args: readonly unknown[],
    ): Promise<T> => {
      const data = encodeFunctionData({ abi, functionName, args });
      const result: any = await (unsafeApi as any).apis.ReviveApi.call(
        caller,
        destination,
        0n,
        undefined,
        undefined,
        hexToBytes(data),
        { at: "best" },
      );
      if (!result.result.success || result.result.value.flags !== 0) {
        throw new Error(`${functionName} did not return successfully.`);
      }
      return decodeFunctionResult({
        abi,
        functionName,
        data: outputHex(result.result.value.data),
      }) as T;
    };

    const currentDay = Number(
      await query<number | bigint>(
        deployment.contracts.scores,
        scoresAbi,
        "currentDay",
        [],
      ),
    );
    const [word, bits] = await Promise.all([
      query<string>(
        deployment.contracts.word,
        wordAbi,
        "wordForDay",
        [listId, currentDay],
      ),
      query<DayBits>(
        deployment.contracts.scores,
        scoresAbi,
        "getDay",
        [accountH160, currentDay],
      ),
    ]);

    console.log(describeTarget(network, rpc));
    console.log(`currentDay: ${currentDay}`);
    console.log(
      `wordForDay(list=${listId}, day=${currentDay}): ${JSON.stringify(word)}`,
    );
    console.log(
      `getDay(account=${accountH160}, day=${currentDay}): `
        + `played=${bits.played} solved=${bits.solved} ontime=${bits.ontime}`,
    );
    {
      const histogram = await query<{ total: bigint; buckets: { bucket: number; count: bigint }[] }>(
        deployment.contracts.scores,
        scoresAbi,
        "histogram",
        [0, currentDay],
      );
      console.log(
        `histogram(game=0, day=${currentDay}): total=${histogram.total} `
          + `buckets=${JSON.stringify(histogram.buckets, (_key, value) => typeof value === "bigint" ? value.toString() : value)}`,
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
