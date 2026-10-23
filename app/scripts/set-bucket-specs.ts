/**
 * Set each game's bucket spec on the deployed DailyScores (owner only; the
 * deployer is the owner). The specs come from the app roster
 * (`GAME_ROSTER[].buckets`, D20). A spec is set once: a game already at the
 * roster's spec is skipped, an unset game is set, and a game set to anything
 * else stops the run with an error naming it, since the contract cannot
 * change it and the app would rank that game against the wrong buckets.
 * `--dry-run` reads and reports without writing.
 *
 *   DAILY_NETWORK=paseo-next-v2 DAILY_DEPLOY_MNEMONIC=<env> DAILY_DEPLOY_DERIVATION=//4 \
 *     pnpm set:bucket-specs -- --dry-run
 *
 * Like the seeders, the writer waits for finalization (about 30 s a write).
 */

import { readFile } from "node:fs/promises";

import type { Abi } from "viem";

import { GAME_ROSTER, type BucketSpec, type Game } from "../src/shared/roster";
import { connectContractWriter } from "./contract-writer";
import {
  deploymentAbiPath,
  readDeploymentRecord,
  targetNetwork,
} from "./target";

/** `DailyScores.bucketSpec(gameId)`: an unset game reads `set: false` (and the default spec). */
export interface BucketSpecView extends BucketSpec {
  set: boolean;
}

export type BucketSpecStep =
  | { game: Pick<Game, "name" | "gameId">; action: "skip"; spec: BucketSpec }
  | { game: Pick<Game, "name" | "gameId">; action: "set"; spec: BucketSpec };

function sameSpec(a: BucketSpec, b: BucketSpec): boolean {
  return a.min === b.min && a.max === b.max && a.buckets === b.buckets;
}

function describeSpec(spec: BucketSpec): string {
  return `{min ${spec.min}, max ${spec.max}, buckets ${spec.buckets}}`;
}

/** What one game needs; throws when it is set to another spec (set-once). */
export function planBucketSpec(
  game: Pick<Game, "name" | "gameId" | "buckets">,
  current: BucketSpecView,
): BucketSpecStep {
  if (!current.set) {
    return { game, action: "set", spec: game.buckets };
  }
  if (sameSpec(current, game.buckets)) {
    return { game, action: "skip", spec: game.buckets };
  }
  throw new Error(
    `${game.name} (game ${game.gameId}) is already set to ${describeSpec(current)} on chain, ` +
      `not the roster's ${describeSpec(game.buckets)}. Specs are set once: ` +
      "redeploy DailyScores or change the roster back.",
  );
}

/** The contract's view as viem decodes it: a named tuple, uints as number or bigint. */
export function bucketSpecFromContract(value: unknown): BucketSpecView {
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record !== "object" || typeof record.set !== "boolean") {
    throw new TypeError("bucketSpec did not return {min, max, buckets, set}");
  }
  return {
    min: Number(record.min),
    max: Number(record.max),
    buckets: Number(record.buckets),
    set: record.set,
  };
}

async function main(argv: readonly string[]): Promise<void> {
  const args = argv.filter((arg) => arg !== "--");
  const unknown = args.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(" ")} (only --dry-run is accepted).`);
  }
  const dryRun = args.includes("--dry-run");
  const network = targetNetwork();
  const deployment = readDeploymentRecord(network);
  const abi = JSON.parse(
    await readFile(deploymentAbiPath(deployment.abis.scores.file), "utf8"),
  ) as Abi;
  for (const name of ["bucketSpec", "setBucketSpec"]) {
    if (!abi.some((item) => item.type === "function" && item.name === name)) {
      throw new Error(
        `The recorded ${network.id} DailyScores ABI has no ${name}: deploy the WP40 DailyScores first.`,
      );
    }
  }
  const writer = await connectContractWriter(network, deployment.contracts.scores, abi);
  try {
    const owner = (await writer.query<string>("owner", [])).toLowerCase();
    if (owner !== writer.accountH160) {
      throw new Error(
        `DailyScores at ${deployment.contracts.scores} is owned by ${owner}, not the signer (${writer.accountH160}).`,
      );
    }
    // Plan every game before the first write, so a set-once conflict stops
    // the run with nothing half-written.
    const steps: BucketSpecStep[] = [];
    for (const game of [...GAME_ROSTER].sort((a, b) => a.gameId - b.gameId)) {
      const current = bucketSpecFromContract(await writer.query("bucketSpec", [game.gameId]));
      steps.push(planBucketSpec(game, current));
    }
    for (const step of steps) {
      const label = `game ${step.game.gameId} (${step.game.name})`;
      if (step.action === "skip") {
        console.log(`${label}: already ${describeSpec(step.spec)}`);
        continue;
      }
      if (dryRun) {
        console.log(`${label}: would set ${describeSpec(step.spec)} (dry run)`);
        continue;
      }
      console.log(`${label}: setting ${describeSpec(step.spec)}…`);
      await writer.write("setBucketSpec", [
        step.game.gameId,
        step.spec.min,
        step.spec.max,
        step.spec.buckets,
      ]);
      const after = bucketSpecFromContract(await writer.query("bucketSpec", [step.game.gameId]));
      if (!after.set || !sameSpec(after, step.spec)) {
        throw new Error(`${label}: spec reads back as ${describeSpec(after)} (set ${after.set}).`);
      }
      console.log(`${label}: ${describeSpec(step.spec)}`);
    }
  } finally {
    writer.close();
  }
}

if (process.argv[1]?.endsWith("set-bucket-specs.ts")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
