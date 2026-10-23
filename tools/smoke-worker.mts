// Drives the Pocket worker against a fake host, the way the Polkadot app would:
// boot it, put the card on screen, write today's checklist the way the app
// does, and take the card off screen again. No phone, no chain.
//
//   pnpm smoke
import {
  createFakeTruApiClient,
  setTruApiClient,
} from "@parity/product-sdk-host/testing";
import {
  androidLimits,
  assertFaceValid,
  type RendererNode,
} from "@parity/product-sdk-renderer";

import { getHostLocalStorage } from "@parity/product-sdk-host";

import {
  CARD_DRAWN_KEY,
  CardStateWriter,
  detectCardStore,
} from "../app/src/shared/card-state.ts";
import { dayIndexFromTimestamp } from "../app/src/shared/day.ts";
import { PICKS_KEY, serialisePicks } from "../app/src/shared/picks.ts";
import { GAME_ROSTER, gameIdOf } from "../app/src/shared/roster.ts";
import { expectText as expectFaceText, imagePathsIn, stripTokenIn, textsIn } from "./face-text.mts";

type Handler = (
  request: unknown,
  send: (face: RendererNode) => void,
  interrupt: (reason: unknown) => void,
) => unknown;

let onRender: Handler | undefined;
const base = createFakeTruApiClient();
// The fake models storage; renderer is the one domain a card needs on top.
const client = new Proxy(base as object, {
  get(target, prop, receiver) {
    if (prop === "renderer") {
      return {
        onRender: (next: Handler) => {
          onRender = next;
          return { unsubscribe() {} };
        },
        actionSubscribe: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}) as typeof base;
setTruApiClient(client);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message: string): never => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const expectText = (face: RendererNode, text: string, label: string): void =>
  expectFaceText(face, text, label, fail);
const expectStrip = (face: RendererNode, token: string, label: string): void => {
  if (stripTokenIn(face) !== token) fail(`${label}: strip is ${stripTokenIn(face)}, expected ${token}`);
};
const expectImage = (face: RendererNode, path: string, label: string): void => {
  if (!imagePathsIn(face).includes(path)) {
    fail(`${label}: image "${path}" missing from ${JSON.stringify(imagePathsIn(face))}`);
  }
};
const expectNoText = (face: RendererNode, text: string, label: string): void => {
  if (textsIn(face).includes(text)) fail(`${label}: "${text}" must not be on the card`);
};
const N = GAME_ROSTER.length;

// The countdown repaints every second, so the clock is frozen at 12:00:00 UTC
// today; each check moves it on purpose.
const realNow = Date.now;
let frozen = (() => {
  const d = new Date(realNow());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
})();
Date.now = () => frozen;

// The player picked every game (D21); a later step narrows the picks.
await (await getHostLocalStorage())!.writeString(
  PICKS_KEY,
  serialisePicks(GAME_ROSTER.map((game) => game.gameId)),
);

await import("../pocket/src/worker.ts");
await sleep(200);
if (!onRender) fail("the worker did not register a renderer");

const sent: RendererNode[] = [];
const cleanup = await onRender!(
  { context: { tag: "PocketCard", value: { cardId: "daily", payload: "0x" } }, payload: "0x" },
  (face) => {
    assertFaceValid(face, { host: androidLimits });
    sent.push(face);
  },
  (reason) => fail(`render interrupted: ${JSON.stringify(reason)}`),
);
await sleep(100);
if (sent.length !== 1) fail(`expected one face on screen, got ${sent.length}`);
expectImage(sent[0], `tiles/count-0-of-${N}.png`, "empty store");
expectImage(sent[0], "tiles/done-today.png", "empty store");
expectText(sent[0], "Tap to play", "empty store");
expectStrip(sent[0], "FgTertiary", "empty store");
expectText(sent[0], "NEW SET IN", "empty store");
expectText(sent[0], "12:00:00", "empty store");
console.log(`ok  card on screen with nothing stored -> 0/${N}, "Tap to play", grey strip`);
if ((await (await getHostLocalStorage())!.readString(CARD_DRAWN_KEY)) !== "1") {
  fail("the worker did not mark the card as drawn");
}
console.log("ok  first draw marks the card as held on this device");

// The app records three games today, through the same store and writer.
const today = dayIndexFromTimestamp(Date.now() / 1_000);
const writer = new CardStateWriter(detectCardStore());
await writer.markRecorded(today, 0, true);
await writer.markRecorded(today, gameIdOf("globe"), false);
await writer.markRecorded(today, 2, true);
await sleep(2_600);
if (sent.length !== 2) fail(`expected a repaint after the app recorded, got ${sent.length} faces`);
expectImage(sent[1], `tiles/count-3-of-${N}.png`, "three recorded");
expectNoText(sent[1], "Tap to play", "three recorded");
for (const id of ["word", "globe", "chess"]) expectImage(sent[1], `tiles/tile-${id}-done.png`, "three recorded");
for (const id of ["sudoku", "mini", "connections"]) expectImage(sent[1], `tiles/tile-${id}-idle.png`, "three recorded");
expectStrip(sent[1], "FgSuccess", "three recorded");
console.log(`ok  three games recorded in the app -> card repainted 3/${N}, three lit tiles, green strip`);

await sleep(2_600);
if (sent.length !== 2) fail("an unchanged checklist on a frozen clock must not repaint");
console.log("ok  unchanged checklist, same second -> no repaint");

// One second later the countdown ticks: one new face, same checklist.
frozen += 1_000;
await sleep(1_300);
if (sent.length !== 3) fail(`expected one repaint for the countdown tick, got ${sent.length} faces`);
expectText(sent[2], "11:59:59", "countdown tick");
console.log("ok  the clock moves one second -> the countdown ticks to 11:59:59");
sent.splice(2, 1);

// The home derives the hub streak and the day percentile; the card shows the streak.
await writer.syncSummary(today, { streakAny: 5, dayPercentile: 23 });
await sleep(2_600);
if (sent.length !== 3) fail(`expected a repaint after the streak landed, got ${sent.length} faces`);
expectImage(sent[2], "tiles/flame.png", "streak");
expectText(sent[2], "5", "streak");
expectNoText(sent[2], "Top 23% today", "streak");
console.log("ok  streak written by the app -> card shows it; the percentile stays off the card");

// Yesterday's record must not carry over: the worker draws 0/N for a stale day.
const store = await detectCardStore();
await store.write(
  JSON.stringify({ version: 1, day: today - 1, played: "1023", solved: "1023" }),
);
await sleep(2_600);
if (sent.length !== 4) fail(`expected a repaint after the stored day went stale, got ${sent.length} faces`);
expectImage(sent[3], `tiles/count-0-of-${N}.png`, "stale day");
expectNoText(sent[3], "Tap to play", "stale day");
expectStrip(sent[3], "FgTertiary", "stale day");
console.log(`ok  stale day in the store -> 0/${N}, grey strip`);

// A streak at risk: nothing played today, a streak on the record, and the
// clock at 23:30 UTC. The worker reads the clock on every poll.
const lateToday = (() => {
  const d = new Date(realNow());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 30, 0);
})();
frozen = lateToday;
await store.write(
  JSON.stringify({ version: 1, day: today, played: "0", solved: "0", streakAny: 3 }),
);
await sleep(2_600);
if (sent.length !== 5) fail(`expected a repaint for the streak at risk, got ${sent.length} faces`);
expectImage(sent[4], `tiles/count-0-of-${N}.png`, "streak at risk");
expectStrip(sent[4], "FgError", "streak at risk");
expectImage(sent[4], "tiles/flame.png", "streak at risk");
expectText(sent[4], "3", "streak at risk");
expectText(sent[4], "00:30:00", "streak at risk");
console.log("ok  streak of 3, nothing played, 23:30 UTC -> red strip, countdown 00:30:00");

// The player narrows the picks to Word and Mini in the app, and plays Word:
// the card draws those two only and counts 1/2.
await store.write(
  JSON.stringify({ version: 1, day: today, played: "1", solved: "1", streakAny: 3 }),
);
await (await getHostLocalStorage())!.writeString(PICKS_KEY, serialisePicks([0, 4]));
await sleep(2_600);
if (sent.length !== 6) fail(`expected a repaint after the picks changed, got ${sent.length} faces`);
expectImage(sent[5], "tiles/count-1-of-2.png", "two picks");
const pickedTiles = imagePathsIn(sent[5]).filter((path) => path.startsWith("tiles/tile-"));
if (pickedTiles.join() !== "tiles/tile-word-done.png,tiles/tile-mini-idle.png") {
  fail(`two picks: expected the Word and Mini tiles only, got ${pickedTiles.join(", ")}`);
}
expectStrip(sent[5], "FgSuccess", "two picks");
console.log("ok  picks narrowed to Word and Mini, Word played -> 1/2, two tiles, green strip");

if (typeof cleanup === "function") cleanup();
await writer.syncDay(today, { played: 1023n, solved: 1023n });
await sleep(2_600);
if (sent.length !== 6) fail("the card left the screen but the worker kept sending faces");
console.log("ok  card off screen -> polling stopped");
Date.now = realNow;
process.exit(0);
