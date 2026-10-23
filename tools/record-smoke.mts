// Records one game-day through a real headless host: the app's own write path
// (`app/src/shared/chain-bindings.ts`, the same host signer, allowance, account
// mapping and `scores.record` the phone runs) against `truapi-host
// signing-host --serve`. A product account on a phone holds PGAS for fees and
// no PAS; this is the only harness that writes as such an account.
//
// What it proves, step by step (60 s each, markers on stdout):
//   1. the host is up (spawned here, or `RECORD_SMOKE_WS` names a running one);
//   2. the host hands out the product account for `dailyondot.paseo/0`;
//   3. the allowance is granted and the account is mapped (the app's
//      `beforeRecord`), with the account's PAS and PGAS printed;
//   4. a dry run of `record` as that account, decoded;
//   5. `ChainDataSource.record` lands and `getDay` shows the game bit;
//   6. the day's distribution for the game counts one more on-time finisher.
//
//   DAILY_NETWORK=paseo-next-v2 HOST_CLI_SIGNER_MNEMONIC=<phone mnemonic> \
//     node --import tsx tools/record-smoke.mts
//
// Optional: RECORD_SMOKE_WS (attach to a running host instead of spawning),
// RECORD_SMOKE_PORT (default 9957), RECORD_SMOKE_BASE_PATH, TRUAPI_HOST_BIN,
// RECORD_SMOKE_GAME (game id, default 2: Daily Chess), RECORD_SMOKE_DAY
// (default: the contract's current day). The mnemonic reaches the host through
// its environment, never argv, and nothing here prints it.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setTruApiClient } from "@parity/product-sdk-host/testing";
import { connectWebSocketHost, subscribeConnectionStatus } from "@parity/truapi/sandbox";

import { deploymentAbiPath, readDeploymentRecord, targetNetwork } from "../app/scripts/target.ts";
import {
  hostSignerFactory,
  readBindingsFactory,
  writeBindingsFactory,
} from "../app/src/shared/chain-bindings.ts";
import { ChainDataSource } from "../app/src/shared/chain-data-source.ts";
import { hostAccountBalances } from "../app/src/shared/host-account.ts";

const STEP_MS = 60_000;
const PORT = Number(process.env.RECORD_SMOKE_PORT ?? 9957);
const WS = process.env.RECORD_SMOKE_WS ?? `ws://127.0.0.1:${PORT}`;
const BIN = process.env.TRUAPI_HOST_BIN ?? "truapi-host";
const GAME_ID = Number(process.env.RECORD_SMOKE_GAME ?? 2);
const network = targetNetwork();
const deployment = readDeploymentRecord(network);
const abis = {
  scores: JSON.parse(readFileSync(deploymentAbiPath(deployment.abis.scores.file), "utf8")) as unknown,
  word: JSON.parse(readFileSync(deploymentAbiPath(deployment.abis.word.file), "utf8")) as unknown,
  chess: JSON.parse(readFileSync(deploymentAbiPath(deployment.abis.chess.file), "utf8")) as unknown,
  mini: JSON.parse(readFileSync(deploymentAbiPath(deployment.abis.mini.file), "utf8")) as unknown,
  connections: JSON.parse(readFileSync(deploymentAbiPath(deployment.abis.connections.file), "utf8")) as unknown,
};
const content = deployment.content ?? {};
if (
  content.wordListId === undefined || content.chessSetId === undefined
  || content.miniSetId === undefined || content.connectionsSetId === undefined
) {
  throw new Error(`The ${network.id} record has no seeded content ids; seed first.`);
}

const t0 = Date.now();
const log = (message: string): void =>
  console.log(`[record +${((Date.now() - t0) / 1000).toFixed(1)}s] ${message}`);
const scrub = (text: string): string =>
  text.replace(/polkadotapp:\/\/pair\?[^\s'"]+/g, "<pairing deeplink>");
const describe = (value: unknown): string => {
  try {
    return JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString()
        : item instanceof Error ? { name: item.name, message: item.message, ...item }
        : item);
  } catch {
    return String(value);
  }
};

let host: ChildProcess | undefined;
let hostOut = "";
const fail = (message: string): never => {
  console.error(`FAIL: ${message}`);
  if (hostOut) console.error(`--- last host output ---\n${hostOut.slice(-2000)}`);
  host?.kill("SIGTERM");
  process.exit(1);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function step<T>(name: string, body: () => Promise<T>, timeout = STEP_MS): Promise<T> {
  log(`STEP START ${name}`);
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeout / 1000} s`)), timeout);
  });
  try {
    const result = await Promise.race([body(), expired]);
    log(`STEP DONE  ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return result;
  } catch (error) {
    return fail(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function until<T>(probe: () => T | undefined, everyMs = 200): Promise<T> {
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    await sleep(everyMs);
  }
}

// 1. The host.
await step(`a headless host is up (${process.env.RECORD_SMOKE_WS ? "attached" : "spawned"})`, async () => {
  if (process.env.RECORD_SMOKE_WS) return;
  const basePath = process.env.RECORD_SMOKE_BASE_PATH ?? mkdtempSync(join(tmpdir(), "daily-on-dot-record-"));
  host = spawn(
    BIN,
    [
      "signing-host", "--serve", "--auto-accept",
      "--network", network.id,
      "--frame-listen", `127.0.0.1:${PORT}`,
      "--product-id", network.domain,
      "--base-path", basePath,
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
  );
  const onData = (chunk: Buffer): void => {
    const text = scrub(chunk.toString());
    hostOut += text;
    for (const line of text.split("\n").filter(Boolean)) log(`[truapi-host] ${line}`);
  };
  host.stdout?.on("data", onData);
  host.stderr?.on("data", onData);
  host.once("close", (code) => {
    if (code !== 0 && code !== null) fail(`truapi-host exited with ${code}`);
  });
  await until(() => (hostOut.includes("Signing host ready") ? true : undefined));
}, 180_000);

const client = connectWebSocketHost(WS) ?? fail("no TrUAPI client for the host endpoint");
setTruApiClient(client);
await step("the app's client connects to the host", async () => {
  let status = "disconnected";
  const stop = subscribeConnectionStatus((next) => {
    status = next;
  });
  await until(() => (status === "connected" ? true : undefined));
  stop();
});

// 2. The product account, as the app asks for it.
const hostSigner = hostSignerFactory(network);
const { account } = await step(`the host hands out the product account for ${network.domain}/0`, async () => hostSigner());
log(`product account: ${account.address} (h160 ${account.h160Address})`);
const reads = readBindingsFactory(network, deployment.contracts, abis, hostSigner, content.miniSetId, content.connectionsSetId);
const writes = writeBindingsFactory(network, deployment.contracts, abis, hostSigner);
const source = new ChainDataSource(reads, writes, content.wordListId, content.chessSetId);
const balances = async (label: string) => {
  const held = await hostAccountBalances(network, account.address);
  log(`${label}: PAS free=${held.pas} PGAS=${held.pgas ?? "n/a"}`);
};

// 3. The app's pre-write: allowance, PGAS, mapping.
await balances("before the allowance");
const day = Number(process.env.RECORD_SMOKE_DAY ?? (await source.currentDay()));
const before = await source.dayBits(day);
log(`day ${day}, game ${GAME_ID}: played bits before = ${before.played.toString(2)}`);
if ((before.played >> BigInt(GAME_ID)) & 1n) fail(`game ${GAME_ID} is already recorded for day ${day}; pick another with RECORD_SMOKE_GAME`);
await step("the allowance is granted and the account is mapped (beforeRecord)", async () => {
  const bindings = await writes();
  await bindings.beforeRecord?.();
}, 120_000);
await balances("after the allowance");

// 4. The dry run the SDK makes before signing, decoded.
await step(`dry run: record(${GAME_ID}, ${day}, 1, true) as the product account`, async () => {
  const bindings = await writes();
  const probe = await (bindings.scores.record as unknown as {
    query(...args: unknown[]): Promise<{ success: boolean; value: unknown; gasRequired?: unknown }>;
  }).query(GAME_ID, day, 1, true);
  log(`dry run: success=${probe.success} value=${describe(probe.value)} gasRequired=${describe(probe.gasRequired)}`);
});

// 6a. The day's distribution before the write.
const histogramBefore = await step(`histogram(${GAME_ID}, ${day}) before the write`, async () => source.histogram(GAME_ID, day));
log(`histogram before: total=${histogramBefore.total} buckets=${describe(histogramBefore.buckets)}`);

// 5. The write, as the app makes it.
const landed = await step(`ChainDataSource.record(${GAME_ID}, ${day}, 1, true)`, async () => {
  try {
    await source.record(GAME_ID, day, 1, true);
    return true;
  } catch (error) {
    log(`record threw: ${error instanceof Error ? `${error.name}: ${error.message}` : describe(error)}`);
    return false;
  }
}, 120_000);
await balances("after the write");
if (landed) {
  await step("getDay shows the game bit at the best block", async () => {
    for (;;) {
      const bits = await source.dayBits(day);
      if ((bits.played >> BigInt(GAME_ID)) & 1n) {
        log(`day ${day}: played=${bits.played.toString(2)} solved=${bits.solved.toString(2)} ontime=${bits.ontime.toString(2)}`);
        return;
      }
      await sleep(2_000);
    }
  });
  // 6b. An on-time record counts one more finisher in its bucket (score 1 = bucket 1
  // for a Count game, bucket 0 for a Seconds game); a backfill (RECORD_SMOKE_DAY in
  // the past) must leave the histogram unchanged.
  {
    await step(`histogram(${GAME_ID}, ${day}) after the write`, async () => {
      const after = await source.histogram(GAME_ID, day);
      const ontime = day === (await source.currentDay());
      const expectedTotal = histogramBefore.total + (ontime ? 1 : 0);
      log(`histogram after: total=${after.total} buckets=${describe(after.buckets)} (${ontime ? "on time" : "backfill"})`);
      if (after.total !== expectedTotal) {
        throw new Error(`histogram total ${after.total}, expected ${expectedTotal}`);
      }
    });
  }
}

host?.kill("SIGTERM");
console.log(
  landed
    ? `\nok  real host: record(${GAME_ID}, ${day}) landed as ${account.address}`
    : `\nFAIL real host: record(${GAME_ID}, ${day}) did not land as ${account.address}`,
);
process.exit(landed ? 0 : 1);
