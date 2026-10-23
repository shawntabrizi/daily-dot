// Writes the static preview face into pocket/public/faces/daily.json: what the
// host's add sheet draws before the worker has run. Vite copies public/ into
// the worker archive, which the manifest's `preview` path resolves against.
//
// The preview comes from the same module the worker streams (pocket/src/face.ts),
// so the sheet cannot disagree with the card it offers. Every face the worker
// can send is checked against the Android host's limits (depth 32, 256 KiB),
// measured on the text that is written, not the tree, and every image it
// names must exist under pocket/public (baked by `pnpm pocket:art`). The file
// is ASCII: the host reads the worker archive as Latin-1.
//
//   pnpm pocket:assets
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { androidLimits, assertFaceValid, type RendererNode } from "@parity/product-sdk-renderer";

import { GAME_ROSTER } from "../app/src/shared/roster.ts";
import { dailyFace, EMPTY_BITS, GAME_COUNT, RED_WINDOW_MS, msToRollover } from "../pocket/src/face.ts";
import { imagePathsIn, stripTokenIn } from "./face-text.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "pocket/public");
const out = resolve(publicDir, "faces");

/** JSON with every non-ASCII character escaped. */
export function asciiJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`.replace(
    /[\u0080-￿]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

// A clock in the middle of the day (grey, green or gold strip) and one under
// four hours before 00:00 UTC (red when a streak is at risk).
const noon = Date.UTC(2026, 9, 22, 12, 0, 0);
const late = noon + 24 * 60 * 60 * 1_000 - msToRollover(noon) - RED_WINDOW_MS / 2;

// The sheet shows a sample day: three games done, with both streaks.
const preview = dailyFace({ played: 0b111n, solved: 0b010n }, {}, { streakAny: 5, streakAll: 2 }, noon);
const json = asciiJson(preview);
assertFaceValid(json, { host: androidLimits });

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "daily.json"), json);

// Every live face must pass too, and draw the strip its state names. "All"
// is the roster's bits.
const all = GAME_ROSTER.reduce((bits, game) => bits | (1n << BigInt(game.gameId)), 0n);
const three = { played: 0b111n, solved: 0b111n };
const full = { played: all, solved: all };
const streaks = { streakAny: 999, streakAll: 999, dayPercentile: 100 };
const faces: Record<string, { face: RendererNode; strip: string }> = {
  "0/6 never recorded": { face: dailyFace(EMPTY_BITS, {}, null, noon), strip: "FgTertiary" },
  "0/6 never recorded, late": { face: dailyFace(EMPTY_BITS, {}, null, late), strip: "FgTertiary" },
  "0/6 grey": { face: dailyFace(EMPTY_BITS, {}, {}, noon), strip: "FgTertiary" },
  "0/6 grey, streaks": { face: dailyFace(EMPTY_BITS, {}, streaks, noon), strip: "FgTertiary" },
  "0/6 red": { face: dailyFace(EMPTY_BITS, {}, streaks, late), strip: "FgError" },
  "0/6 late, no streak": { face: dailyFace(EMPTY_BITS, {}, {}, late), strip: "FgTertiary" },
  "3/6 green": { face: dailyFace(three, {}, {}, noon), strip: "FgSuccess" },
  "3/6 green, streaks": { face: dailyFace(three, {}, streaks, noon), strip: "FgSuccess" },
  "3/6 green, late": { face: dailyFace(three, {}, streaks, late), strip: "FgSuccess" },
  "6/6 gold": { face: dailyFace(full, {}, {}, noon), strip: "FgWarning" },
  "6/6 gold, streaks": { face: dailyFace(full, {}, streaks, noon), strip: "FgWarning" },
  "6/6 gold, late": { face: dailyFace(full, {}, streaks, late), strip: "FgWarning" },
  "6/6 buttons": { face: dailyFace(full, { rowButtons: true }, streaks, noon), strip: "FgWarning" },
};
let largest = { name: "", bytes: 0 };
for (const [name, { face, strip }] of Object.entries(faces)) {
  const text = asciiJson(face);
  assertFaceValid(text, { host: androidLimits });
  if (text.length > largest.bytes) largest = { name, bytes: text.length };
  if (stripTokenIn(face) !== strip) {
    throw new Error(`${name}: strip is ${stripTokenIn(face)}, expected ${strip}`);
  }
  for (const path of imagePathsIn(face)) {
    if (!existsSync(resolve(publicDir, path))) {
      throw new Error(`${name}: image "${path}" is missing under pocket/public; run pnpm pocket:art`);
    }
  }
}

process.stdout.write(
  `pocket/public/faces/daily.json: ${json.length} bytes, 3/${GAME_COUNT} preview; ${Object.keys(faces).length} faces validated, largest "${largest.name}" ${largest.bytes} bytes of ${androidLimits.maxBytes}\n`,
);
