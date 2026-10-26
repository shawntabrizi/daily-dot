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
import { dailyFace, EMPTY_BITS, RED_WINDOW_MS, STARTER_GAMES, msToRollover } from "../pocket/src/face.ts";
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

// A clock in the middle of the day (gray, green or gold strip) and one under
// four hours before 00:00 UTC (red when a streak is at risk).
const noon = Date.UTC(2026, 9, 22, 12, 0, 0);
const late = noon + 24 * 60 * 60 * 1_000 - msToRollover(noon) - RED_WINDOW_MS / 2;

// The sheet shows a sample day for a new player: the starter picks, two of
// three done (Word and Mini), with a streak.
const bit = (gameId: number): bigint => 1n << BigInt(gameId);
const preview = dailyFace({ played: bit(0) | bit(4), solved: bit(0) }, {}, { streakAny: 5 }, noon, STARTER_GAMES);
const json = asciiJson(preview);
assertFaceValid(json, { host: androidLimits });

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "daily.json"), json);

// Every live face must pass too, and draw the strip its state names, for
// every number of picks: none of them done, some, and all.
const streaks = { streakAny: 999, dayPercentile: 100 };
const faces: Record<string, { face: RendererNode; strip: string }> = {
  "starter, never recorded": { face: dailyFace(EMPTY_BITS, {}, null, noon), strip: "FgTertiary" },
  "starter, never recorded, late": { face: dailyFace(EMPTY_BITS, {}, null, late), strip: "FgTertiary" },
  "starter, red": { face: dailyFace(EMPTY_BITS, {}, streaks, late), strip: "FgError" },
  "starter, late, no streak": { face: dailyFace(EMPTY_BITS, {}, {}, late), strip: "FgTertiary" },
  // Only an unpicked game (Globe) played: the streak is safe, the strip green.
  "starter, unpicked game only, late": {
    face: dailyFace({ played: bit(3), solved: bit(3) }, {}, streaks, late),
    strip: "FgSuccess",
  },
};
for (let count = 1; count <= GAME_ROSTER.length; count += 1) {
  const games = GAME_ROSTER.slice(0, count);
  const all = games.reduce((bits, game) => bits | bit(game.gameId), 0n);
  const first = bit(games[0]!.gameId);
  faces[`0/${count} gray`] = { face: dailyFace(EMPTY_BITS, {}, {}, noon, games), strip: "FgTertiary" };
  faces[`0/${count} gray, streaks`] = { face: dailyFace(EMPTY_BITS, {}, streaks, noon, games), strip: "FgTertiary" };
  if (count > 1) {
    faces[`1/${count} green, late`] = {
      face: dailyFace({ played: first, solved: first }, {}, streaks, late, games),
      strip: "FgSuccess",
    };
  }
  faces[`${count}/${count} gold, streaks`] = {
    face: dailyFace({ played: all, solved: all }, {}, streaks, noon, games),
    strip: "FgWarning",
  };
  faces[`${count}/${count} buttons`] = {
    face: dailyFace({ played: all, solved: all }, { rowButtons: true }, streaks, noon, games),
    strip: "FgWarning",
  };
}
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
  `pocket/public/faces/daily.json: ${json.length} bytes, 2/${STARTER_GAMES.length} preview; ${Object.keys(faces).length} faces validated, largest "${largest.name}" ${largest.bytes} bytes of ${androidLimits.maxBytes}\n`,
);
