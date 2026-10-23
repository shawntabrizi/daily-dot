/**
 * Set each game's score kind on the deployed DailyScores (owner only; the
 * deployer is the owner). The kinds come from the app roster
 * (`GAME_ROSTER[].kind`); extra `<gameId>=<count|seconds>` arguments cover
 * games on other branches. A game already at the right kind is skipped;
 * an unset game reads as Count, so only Seconds games cost a transaction.
 *
 *   DAILY_NETWORK=paseo-next-v2 DAILY_DEPLOY_MNEMONIC=<env> DAILY_DEPLOY_DERIVATION=//4 \
 *     pnpm set:game-kinds -- 6=seconds
 *
 * Like the seeders, the writer waits for finalization (about 30 s a write).
 */

import { readFile } from "node:fs/promises";

import type { Abi } from "viem";

import { GAME_ROSTER, type ScoreKind } from "../src/shared/roster";
import { connectContractWriter } from "./contract-writer";
import {
  deploymentAbiPath,
  readDeploymentRecord,
  targetNetwork,
} from "./target";

/** Mirrors `contracts/logic`: `GAME_KIND_COUNT`, `GAME_KIND_SECONDS`. */
const KIND_BYTE: Record<ScoreKind, number> = { count: 0, seconds: 1 };

function parseKindArgs(
  argv: readonly string[],
): Map<number, ScoreKind> {
  const kinds = new Map<number, ScoreKind>();
  for (const game of GAME_ROSTER) {
    kinds.set(game.gameId, game.kind);
  }
  for (const arg of argv) {
    const match = /^(\d{1,2})=(count|seconds)$/.exec(arg);
    if (!match) {
      throw new Error(`Expected <gameId>=<count|seconds>, got "${arg}".`);
    }
    const gameId = Number(match[1]);
    if (gameId > 63) {
      throw new Error(`Game id ${gameId} is outside 0..63.`);
    }
    kinds.set(gameId, match[2] as ScoreKind);
  }
  return kinds;
}

async function main(): Promise<void> {
  const network = targetNetwork();
  const deployment = readDeploymentRecord(network);
  const abi = JSON.parse(
    await readFile(deploymentAbiPath(deployment.abis.scores.file), "utf8"),
  ) as Abi;
  if (!abi.some((item) => item.type === "function" && item.name === "setGameKind")) {
    throw new Error(
      `The recorded ${network.id} DailyScores ABI has no setGameKind.`,
    );
  }
  const kinds = parseKindArgs(process.argv.slice(2));
  const writer = await connectContractWriter(network, deployment.contracts.scores, abi);
  try {
    const owner = (await writer.query<string>("owner", [])).toLowerCase();
    if (owner !== writer.accountH160) {
      throw new Error(
        `DailyScores at ${deployment.contracts.scores} is owned by ${owner}, not the signer (${writer.accountH160}).`,
      );
    }
    for (const [gameId, kind] of [...kinds.entries()].sort(([a], [b]) => a - b)) {
      const current = Number(await writer.query<number | bigint>("gameKind", [gameId]));
      if (current === KIND_BYTE[kind]) {
        console.log(`game ${gameId}: already ${kind}`);
        continue;
      }
      console.log(`game ${gameId}: setting ${kind}…`);
      await writer.write("setGameKind", [gameId, KIND_BYTE[kind]]);
      const after = Number(await writer.query<number | bigint>("gameKind", [gameId]));
      if (after !== KIND_BYTE[kind]) {
        throw new Error(`game ${gameId}: kind reads back as ${after}, expected ${KIND_BYTE[kind]}.`);
      }
      console.log(`game ${gameId}: ${kind}`);
    }
  } finally {
    writer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
