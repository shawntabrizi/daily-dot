// Bakes the Pocket card's art into pocket/public/tiles/ as PNG.
//
// The card is the approved board (plans/wp-36-boards/Main.dc.html, "Proposed:
// scoreboard"). The renderer has nine theme colors, five text styles and no
// Fredoka or Nunito, so every colored or typeset mark on the card is an image
// from the worker archive: the "n/k" count (every n of every k picked games),
// the "DONE TODAY" label,
// the flame of the streak, and the six game tiles whole, in three looks
// (next up: accent fill with ink glyph and label; still to play: accent glyph
// and label on a tint with an accent ring; done: muted with a check). The state strip is a plain Box in a theme color, so it needs no art.
// Each asset is the board's own HTML and CSS, rasterized at 3x by headless
// Chromium (the app's Playwright) so it is crisp on a phone. Commit the PNGs:
// Vite copies pocket/public into the worker archive.
//
// Fonts: Fredoka 700 and Nunito (variable, used at 800) latin woff2 (Google Fonts, OFL) read from
// app/public/fonts/, or from CARD_ART_FONTS=<dir> when the app does not hold
// them yet.
//
//   pnpm pocket:art
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { GAME_ROSTER, type GameSlug } from "../app/src/shared/roster.ts";
import {
  COUNT_HEIGHT,
  COUNT_WIDTH,
  FLAME_HEIGHT,
  FLAME_WIDTH,
  LABEL_HEIGHT,
  LABEL_WIDTH,
  TILE_HEIGHT,
  TILE_RADIUS,
  TILE_WIDTH,
} from "../pocket/src/face.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "pocket/public/tiles");
const SCALE = 3;

/** The six accents and the ink that sits on each (tokens.css `--accent-<id>`). */
const ACCENT: Record<GameSlug, { fill: string; ink: string }> = {
  word: { fill: "#55b725", ink: "#0d1a07" },
  sudoku: { fill: "#22b8a0", ink: "#062420" },
  chess: { fill: "#e07b39", ink: "#2a1407" },
  globe: { fill: "#4f7df3", ink: "#0b1a3a" },
  mini: { fill: "#d85a9e", ink: "#2b0a1c" },
  connections: { fill: "#9b59c9", ink: "#ffffff" },
  code: { fill: "#e5534b", ink: "#2a0a08" },
  angle: { fill: "#b5c934", ink: "#22270a" },
  color: { fill: "#2fb1e4", ink: "#06202b" },
  sound: { fill: "#7f6df2", ink: "#120d33" },
};
/** The idle tile and the ring around it (the "+" tile). */
const IDLE = { fill: "#202427", ink: "#8d9396", ring: "#2e3336" };
/** A done tile: nothing left to do there, so it steps back. */
const DONE = { fill: "#191c1f", ink: "#5c6266", check: "#7c8386" };
/** The tile labels: each game's own name. A long name gets smaller type, never another name. */
const LABEL: Record<GameSlug, string> = {
  word: "WORD",
  sudoku: "SUDOKU",
  chess: "CHESS",
  globe: "GLOBE",
  mini: "MINI",
  connections: "CONNECTIONS",
  code: "CODE",
  angle: "ANGLE",
  color: "COLOR",
  sound: "SOUND",
};
const WHITE = "#ffffff";
const COUNT_MUTED = "#8d9396";
const MUTED = "#9aa0a3";
const GOLD = "#e8b53a";

const fontDir = process.env.CARD_ART_FONTS ?? resolve(root, "app/public/fonts");
function fontFace(family: string, weight: number, file: string): string {
  const path = resolve(fontDir, file);
  if (!existsSync(path)) {
    throw new Error(`font ${file} is missing from ${fontDir}; set CARD_ART_FONTS=<dir> to a folder that holds it`);
  }
  const data = readFileSync(path).toString("base64");
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2")}`;
}
const FONT_FACES =
  fontFace("Fredoka", 700, "fredoka-700-latin.woff2") + fontFace("Nunito", 800, "nunito-latin.woff2");

/** The board's glyphs, 26x26, in the given ink. */
const GLYPH: Record<GameSlug, (ink: string) => string> = {
  word: (ink) =>
    `<rect x="2" y="2" width="9" height="9" rx="2" fill="${ink}"/><rect x="15" y="2" width="9" height="9" rx="2" fill="${ink}" opacity="0.55"/><rect x="2" y="15" width="9" height="9" rx="2" fill="${ink}" opacity="0.55"/><rect x="15" y="15" width="9" height="9" rx="2" fill="${ink}"/>`,
  sudoku: (ink) =>
    `<path d="M3 3h20v20H3zM3 10h20M3 17h20M10 3v20M17 3v20" fill="none" stroke="${ink}" stroke-width="1.6"/>`,
  // A knight on the 24 grid, scaled to 26.
  chess: (ink) =>
    `<g transform="scale(1.0833)" fill="${ink}"><path fill-rule="evenodd" d="M9 3l1 3-3.5 2.2c-.5.3-.7.9-.5 1.4l.4 1.1c.2.6.9.9 1.5.7l2.6-.9L8 16h8.5l1.5-5.5C18.8 6.5 16 3 12 3zM12.3 5.4a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8z"/><path d="M7.5 17h9l1.5 1.5v2H6v-2z"/></g>`,
  globe: (ink) =>
    `<circle cx="13" cy="13" r="10" fill="none" stroke="${ink}" stroke-width="1.6"/><path d="M3 13h20M13 3c4 4 4 16 0 20M13 3c-4 4-4 16 0 20" fill="none" stroke="${ink}" stroke-width="1.6"/>`,
  mini: (ink) =>
    `<rect x="3" y="3" width="20" height="20" rx="2" fill="none" stroke="${ink}" stroke-width="2"/><path d="M3 11h20M11 3v20" stroke="${ink}" stroke-width="2"/><rect x="15" y="15" width="8" height="8" fill="${ink}"/>`,
  connections: (ink) =>
    `<circle cx="7" cy="7" r="3.5" fill="${ink}"/><circle cx="19" cy="7" r="3.5" fill="${ink}"/><circle cx="7" cy="19" r="3.5" fill="${ink}"/><circle cx="19" cy="19" r="3.5" fill="${ink}"/>`,
  code: (ink) =>
    `<rect x="4" y="11" width="18" height="13" rx="2.5" fill="${ink}"/><path d="M8 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="${ink}" stroke-width="2.4"/>`,
  angle: (ink) =>
    `<path d="M3 23h20M3 23L16 5" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/><path d="M11 23a8 8 0 0 0-3.2-6.4" fill="none" stroke="${ink}" stroke-width="2"/>`,
  // Three slider columns, thumbs at different heights.
  color: (ink) =>
    `<path d="M6 3v20M13 3v20M20 3v20" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/><circle cx="6" cy="9" r="3.2" fill="${ink}"/><circle cx="13" cy="17" r="3.2" fill="${ink}"/><circle cx="20" cy="7" r="3.2" fill="${ink}"/>`,
  // A speaker and two sound waves.
  sound: (ink) =>
    `<path d="M3 10h4.5L13 5v16l-5.5-5H3z" fill="${ink}"/><path d="M16.5 9.5a5 5 0 0 1 0 7M19.6 6.4a9.4 9.4 0 0 1 0 13.2" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`,
};

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

/**
 * One whole tile: glyph over label, centered. The games left to play carry
 * the color: "next" is solid accent, "idle" (still to play) is the accent on
 * a tinted dark with an accent ring, "done" is muted with a check.
 */
function tile(id: GameSlug, state: "next" | "idle" | "done"): string {
  const accent = ACCENT[id];
  const look = {
    next: { fill: accent.fill, ink: accent.ink, ring: "" },
    idle: {
      fill: `color-mix(in srgb, ${accent.fill} 16%, ${IDLE.fill})`,
      ink: accent.fill,
      ring: `box-shadow:inset 0 0 0 1.5px color-mix(in srgb, ${accent.fill} 55%, ${IDLE.fill});`,
    },
    done: { fill: DONE.fill, ink: DONE.ink, ring: "" },
  }[state];
  const check =
    state === "done"
      ? `<svg style="position:absolute;top:8px;right:8px" width="16" height="16" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="${DONE.check}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : "";
  return (
    `<div style="position:relative;width:${TILE_WIDTH}px;height:${TILE_HEIGHT}px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:${TILE_RADIUS}px;background:${look.fill};color:${look.ink};${look.ring}">` +
    check +
    svg(26, 26, GLYPH[id](look.ink)) +
    `<span style="font-family:'Nunito';font-size:${LABEL[id].length > 8 ? "8.5px" : "11px"};font-weight:800;letter-spacing:${LABEL[id].length > 8 ? "0.01em" : "0.06em"};white-space:nowrap">${LABEL[id]}</span></div>`
  );
}

/** The "+" tile: idle, a plus over MORE, when more picks wait than the card holds. */
function moreTile(): string {
  return (
    `<div style="width:${TILE_WIDTH}px;height:${TILE_HEIGHT}px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:${TILE_RADIUS}px;background:${IDLE.fill};color:${IDLE.ink};box-shadow:inset 0 0 0 1.5px ${IDLE.ring}">` +
    svg(26, 26, `<path d="M13 4v18M4 13h18" stroke="${IDLE.ink}" stroke-width="2.6" stroke-linecap="round"/>`) +
    `<span style="font-family:'Nunito';font-size:11px;font-weight:800;letter-spacing:0.06em">MORE</span></div>`
  );
}

/** The count: "n" big in Fredoka, "/N" small and muted, nothing behind it. */
function count(n: number, total: number): string {
  return (
    `<div style="width:${COUNT_WIDTH}px;height:${COUNT_HEIGHT}px;display:flex;align-items:flex-end;font-family:'Fredoka';font-weight:700;font-size:64px;line-height:0.95;letter-spacing:-0.02em;color:${WHITE};white-space:nowrap">` +
    `<div>${n}<span style="font-size:30px;color:${COUNT_MUTED}">/${total}</span></div></div>`
  );
}

/** "DONE TODAY" under the count. */
function doneToday(): string {
  return `<div style="width:${LABEL_WIDTH}px;height:${LABEL_HEIGHT}px;display:flex;align-items:center;font-family:'Nunito';font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};white-space:nowrap">done today</div>`;
}

/** The board's flame, 16x20, gold. */
function flame(): string {
  return svg(
    FLAME_WIDTH,
    FLAME_HEIGHT,
    `<path d="M8 0c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" fill="${GOLD}"/>`,
  );
}

interface Asset {
  name: string;
  width: number;
  height: number;
  html: string;
}

const assets: Asset[] = [
  // One count per n of k: a player picks 1 to every roster game (D21).
  ...Array.from({ length: GAME_ROSTER.length }, (_, index) => index + 1).flatMap((total) =>
    Array.from({ length: total + 1 }, (_, n) => ({
      name: `count-${n}-of-${total}`,
      width: COUNT_WIDTH,
      height: COUNT_HEIGHT,
      html: count(n, total),
    })),
  ),
  { name: "done-today", width: LABEL_WIDTH, height: LABEL_HEIGHT, html: doneToday() },
  { name: "flame", width: FLAME_WIDTH, height: FLAME_HEIGHT, html: flame() },
  { name: "tile-more", width: TILE_WIDTH, height: TILE_HEIGHT, html: moreTile() },
  ...GAME_ROSTER.flatMap((game) => [
    { name: `tile-${game.id}-next`, width: TILE_WIDTH, height: TILE_HEIGHT, html: tile(game.id, "next") },
    { name: `tile-${game.id}-idle`, width: TILE_WIDTH, height: TILE_HEIGHT, html: tile(game.id, "idle") },
    { name: `tile-${game.id}-done`, width: TILE_WIDTH, height: TILE_HEIGHT, html: tile(game.id, "done") },
  ]),
];

// Playwright is the app package's; the root has no dependency on it.
const appRequire = createRequire(resolve(root, "app/package.json"));
type Chromium = { launch(options?: { executablePath?: string }): Promise<{ newContext(o: object): Promise<any>; close(): Promise<void> }> };
const playwright = (await import(pathToFileURL(appRequire.resolve("@playwright/test")).href)) as {
  chromium?: Chromium;
  default?: { chromium: Chromium };
};
// CommonJS package: the named exports ride on `default` under Node's ESM loader.
const chromium = playwright.chromium ?? playwright.default!.chromium;

mkdirSync(out, { recursive: true });
// CHROMIUM_PATH: a preinstalled browser when Playwright's own build is absent.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
let total = 0;
try {
  const context = await browser.newContext({ deviceScaleFactor: SCALE });
  const page = await context.newPage();
  for (const asset of assets) {
    await page.setViewportSize({ width: asset.width, height: asset.height });
    await page.setContent(
      `<!doctype html><html><head><style>${FONT_FACES}html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${asset.html}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    const png = resolve(out, `${asset.name}.png`);
    await page.screenshot({ path: png, omitBackground: true, type: "png" });
    const bytes = statSync(png).size;
    total += bytes;
    process.stdout.write(`${png.slice(root.length + 1)}: ${asset.width * SCALE}x${asset.height * SCALE}, ${bytes} bytes\n`);
  }
} finally {
  await browser.close();
}
process.stdout.write(`${assets.length} assets, ${total} bytes; fonts from ${fontDir}\n`);
