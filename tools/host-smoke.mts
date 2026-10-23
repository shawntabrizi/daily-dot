// Runs the Pocket worker against a real headless host: `truapi-host signing-host
// --execution-kind worker` with `TRUAPI_POCKET_CARDS=daily`, the CLI's
// in-memory Pocket host (paritytech/trinity-user-agents, truapi-host-cli
// src/pocket.rs). The worker connects over the host's loopback WebSocket, the
// way a product does under `truapi-host dev`, so every host call (Pocket list,
// local storage, renderer registration) is answered by the real host core.
//
// What this proves, step by step (60 s each, markers on stdout):
//   1. the host boots with the card set and answers "Signing host ready";
//   2. the host's Pocket lists the `daily` card for this product;
//   3. the worker registers its PocketCard renderer with the host;
//   4. whether the host asks the worker to draw (truapi-host 0.25.0 serves
//      `pocket.list_subscribe` / `pocket.remove_card` only: no draw request is
//      expected, and the step reports what happened either way);
//   5. with the card drawn (script-driven if the host did not ask), the face
//      reads 0/N, and after the app-shaped writer records three games in the
//      host's KV store the card repaints 3/N through the real storage path
//      (N is the roster length).
//
//   HOST_CLI_SIGNER_MNEMONIC=<testnet phone mnemonic> pnpm smoke:host
//
// Optional: HOST_SMOKE_PORT (default 9956), HOST_SMOKE_BASE_PATH (default a
// fresh temp dir), TRUAPI_HOST_BIN (default truapi-host on PATH). Without a
// mnemonic the host auto-manages an account, which can take minutes on a first
// run. The mnemonic reaches the host through its environment, never argv, and
// nothing here prints it.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setTruApiClient } from "@parity/product-sdk-host/testing";
import {
  androidLimits,
  assertFaceValid,
  type RendererNode,
} from "@parity/product-sdk-renderer";
import { connectWebSocketHost, subscribeConnectionStatus } from "@parity/truapi/sandbox";

import { CARD_ID, CardStateWriter, detectCardStore } from "../app/src/shared/card-state.ts";
import { dayIndexFromTimestamp } from "../app/src/shared/day.ts";
import { GAME_ROSTER, gameIdOf } from "../app/src/shared/roster.ts";
import { expectText as expectFaceText } from "./face-text.mts";

const STEP_MS = 60_000;
const N = GAME_ROSTER.length;
const PORT = Number(process.env.HOST_SMOKE_PORT ?? 9956);
const BIN = process.env.TRUAPI_HOST_BIN ?? "truapi-host";
const PRODUCT_ID = "dailyondot.paseo";
const BASE_PATH = process.env.HOST_SMOKE_BASE_PATH ?? mkdtempSync(join(tmpdir(), "daily-on-dot-host-"));
const POCKET_LOG = join(BASE_PATH, "pocket-log.jsonl");

const t0 = Date.now();
const log = (message: string): void =>
  console.log(`[host +${((Date.now() - t0) / 1000).toFixed(1)}s] ${message}`);
// A pairing deeplink carries a handshake secret; keep it out of the output.
const scrub = (text: string): string =>
  text.replace(/polkadotapp:\/\/pair\?[^\s'"]+/g, "<pairing deeplink>");

let host: ChildProcess | undefined;
let hostOut = "";
const fail = (message: string): never => {
  console.error(`FAIL: ${message}`);
  if (hostOut) console.error(`--- last host output ---\n${hostOut.slice(-2000)}`);
  host?.kill("SIGTERM");
  process.exit(1);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const expectText = (face: RendererNode, text: string, label: string): void =>
  expectFaceText(face, text, label, fail);

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

/** Poll `probe` until it returns a value, within the step's own timeout. */
async function until<T>(probe: () => T | undefined, everyMs = 200): Promise<T> {
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    await sleep(everyMs);
  }
}

// 1. The host.
await step("truapi-host boots as a worker host with the daily card", async () => {
  host = spawn(
    BIN,
    [
      "signing-host",
      "--serve",
      "--auto-accept",
      "--execution-kind", "worker",
      "--network", "paseo-next-v2",
      "--frame-listen", `127.0.0.1:${PORT}`,
      "--product-id", PRODUCT_ID,
      "--base-path", BASE_PATH,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TRUAPI_POCKET_CARDS: CARD_ID, TRUAPI_POCKET_LOG: POCKET_LOG },
    },
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
});

// 2. The client the worker will use: the host's WebSocket, through the same
// @parity/truapi instance the SDK holds, with the renderer wrapped so the
// script can see host-initiated draw requests and the handler the worker
// registers.
type RenderHandler = (
  request: unknown,
  send: (face: RendererNode) => void,
  interrupt: (reason: unknown) => void,
) => unknown;
let registered: RenderHandler | undefined;
let hostRenders = 0;
const real = connectWebSocketHost(`ws://127.0.0.1:${PORT}`) ?? fail("no TrUAPI client for the host endpoint");
const client = new Proxy(real as object, {
  get(target, prop, receiver) {
    if (prop !== "renderer") return Reflect.get(target, prop, receiver);
    return {
      onRender: (handler: RenderHandler) => {
        registered = handler;
        return real.renderer.onRender((request, send, interrupt) => {
          hostRenders += 1;
          log(`host asked for a render: ${JSON.stringify((request as { context: unknown }).context)}`);
          return handler(request, send as (face: RendererNode) => void, interrupt);
        });
      },
      actionSubscribe: () => real.renderer.actionSubscribe(),
    };
  },
}) as typeof real;
setTruApiClient(client);

await step("the worker's client connects to the host", async () => {
  let status = "disconnected";
  const stop = subscribeConnectionStatus((next) => {
    status = next;
  });
  await until(() => (status === "connected" ? true : undefined));
  stop();
});

await step("the host's Pocket lists the daily card for this product", async () => {
  let cards: { cardId: string; privileged: boolean }[] | undefined;
  const sub = client.pocket.listSubscribe().subscribe({
    next: (item) => {
      cards = item.cards;
    },
    error: (reason: unknown) => fail(`pocket list failed: ${String(reason)}`),
  });
  const list = await until(() => cards);
  sub.unsubscribe();
  log(`pocket cards: ${JSON.stringify(list)}`);
  if (!list.some((card) => card.cardId === CARD_ID)) fail(`the host lists no "${CARD_ID}" card`);
});

// 3. The worker, as built: it registers through getPocketManager().
await step("the worker registers its PocketCard renderer with the host", async () => {
  await import("../pocket/src/worker.ts");
  await until(() => registered);
});

// 4. Does the host put the card on screen?
const hostDrew = await step("the host asks the worker to draw (15 s)", async () => {
  await sleep(15_000);
  if (hostRenders > 0) {
    log(`host-initiated draws: ${hostRenders}`);
    return true;
  }
  log("the host never asked for a draw: truapi-host serves the Pocket list and removals, not card rendering");
  return false;
}, 30_000);

// 5. The face, through the real host's storage. Reset the KV key first: a
// reused base path may hold an earlier run's checklist.
const sent: RendererNode[] = [];
const today = dayIndexFromTimestamp(Date.now() / 1_000);
const store = await detectCardStore();
let cleanup: unknown;
await step(`${hostDrew ? "host-driven" : "script-driven"} draw reads 0/${N} from the host KV`, async () => {
  await store.write(JSON.stringify({ version: 1, day: today - 1, played: "1023", solved: "1023" }));
  cleanup = await registered!(
    { context: { tag: "PocketCard", value: { cardId: CARD_ID } }, payload: "0x" },
    (face) => {
      assertFaceValid(face, { host: androidLimits });
      sent.push(face);
    },
    (reason) => fail(`render interrupted: ${JSON.stringify(reason)}`),
  );
  await until(() => (sent.length >= 1 ? true : undefined));
  expectText(sent[0], `Daily Games: 0/${N} done`, "stale day in the host KV");
});

await step(`three games recorded through the app's writer repaint the card 3/${N}`, async () => {
  const writer = new CardStateWriter(store);
  await writer.markRecorded(today, 0, true);
  await writer.markRecorded(today, gameIdOf("globe"), false);
  await writer.markRecorded(today, 2, true);
  await until(() => (sent.length >= 2 ? true : undefined));
  expectText(sent[1], `Daily Games: 3/${N} done`, "three recorded");
  expectText(sent[1], "✓ Word", "three recorded");
  expectText(sent[1], "☐ Sudoku", "three recorded");
  log(`host KV now holds: ${await store.read()}`);
});

if (typeof cleanup === "function") cleanup();
host?.kill("SIGTERM");
console.log(
  `\nok  real host: card listed, renderer registered, face 0/${N} -> 3/${N} through host KV`
  + `\n    host-initiated draw: ${hostDrew ? "yes" : "no (not served by this truapi-host)"}`
  + `\n    base path: ${BASE_PATH}`,
);
process.exit(0);
