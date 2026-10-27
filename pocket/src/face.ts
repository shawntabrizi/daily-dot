// The Pocket card face: the approved scoreboard board
// (plans/wp-36-boards/Main.dc.html, "Proposed: scoreboard"), restored in WP37.
//
// One module for every surface that shows the card: the worker streams it,
// tools/write-pocket-assets.mts writes the add-sheet preview from it, and the
// smoke test reads it back. Plain `RendererNode` literals: the renderer package
// validates trees but no longer builds them.
//
// Two columns. Left, 112 wide: the big "n/k" for the player's k picked games
// (D21), "DONE TODAY" under it, and the streak (flame + days) at the bottom.
// Right: up to six of the picked games in rows of three tiles (`cardTiles`:
// unfinished first, then finished; five and a "+" when more than six are
// unfinished), each baked whole as one PNG, spread across the column. The
// games left to play carry the color: the first is solid accent (next up),
// the rest show their glyph and label in the accent; a done game is muted with
// a check, since nothing is left to do there. A strip down the left edge is the day's
// state: gray before any game, green once one is played, gold when every pick
// is done, red when the streak is about to lapse.
// The renderer has nine theme colors, five text styles and no Fredoka or
// Nunito, so every colored or typeset mark is a PNG from the worker archive
// (`pocket/public/tiles/`, baked by `pnpm pocket:art`); only the streak
// numbers and "Tap to play" are live text.
//
// Fits the host's 234dp frame by arithmetic, not measurement: 18 + 200 + 16
// tall; the grid is 95 + 10 + 95. Widths: 112 + 14 + (3 * 70 + 2 * 8) = 352
// inside the 355 a Pixel gives after 20dp padding each side. Tiles are fixed
// width, since the host gives a second FillWidth child of a Row nothing; on a
// narrow phone (288 inner) the third column clips at the frame. ASCII source
// only (the host reads worker JS as Latin-1).
import type {
  ColorToken,
  Modifier,
  RendererNode,
  TypographyStyle,
} from "@parity/product-sdk-renderer";

import { CARD_ID, type CardBits, type CardSummary } from "../../app/src/shared/card-state";
import { DAY_SECONDS, EPOCH_SECONDS } from "../../app/src/shared/day";
import { pickedGames, STARTER_PICKS } from "../../app/src/shared/picks";
import { GAME_ROSTER, type Game } from "../../app/src/shared/roster";

export { CARD_ID };

/** Two rows of three: the most tiles the 234dp frame holds. */
export const MAX_TILES = 6;

/** The games a face draws when the player never picked: the starter set. */
export const STARTER_GAMES: readonly Game[] = pickedGames(STARTER_PICKS);

/** The host frames a product card at 234dp tall with 24dp corners and clips to it. */
const CARD_HEIGHT = 234;
const CARD_RADIUS = 24;
const PADDING = { top: 18, end: 20, bottom: 16, start: 20 };
const INNER_HEIGHT = CARD_HEIGHT - PADDING.top - PADDING.bottom;
/** The state strip down the left edge: a Box in a theme color (an Image here
 *  never showed on the Android host, 2026-10-22). */
const STRIP_WIDTH = 8;
/** The left column and the gap to the grid. */
export const LEFT_WIDTH = 112;
const COLUMN_GAP = 14;
/** The baked "n/k" (tiles/count-<n>-of-<k>.png) and "DONE TODAY" (tiles/done-today.png). */
export const COUNT_WIDTH = LEFT_WIDTH;
export const COUNT_HEIGHT = 64;
export const LABEL_WIDTH = LEFT_WIDTH;
export const LABEL_HEIGHT = 14;
const LABEL_GAP = 6;
/** The streak mark. */
export const FLAME_WIDTH = 16;
export const FLAME_HEIGHT = 20;
const STREAK_ICON_GAP = 5;
/** Tiles: fixed widths, since the host gives a second FillWidth child of a
 *  Row nothing (seen on Android 2026-10-21). Two rows fill the inner height. */
const TILES_PER_ROW = 3;
const TILE_ROW_GAP = 10;
export const TILE_WIDTH = 70;
export const TILE_HEIGHT = (INNER_HEIGHT - TILE_ROW_GAP) / 2;
export const TILE_RADIUS = 14;

export const EMPTY_BITS: CardBits = { played: 0n, solved: 0n };

/** Where the PNGs sit in the worker archive (`pocket/public` at build time). */
export const TILE_DIR = "tiles";
export type StripState = "gray" | "green" | "gold" | "red";
/** A lapsing streak turns the strip red this close to the day's end. */
export const RED_WINDOW_MS = 4 * 60 * 60 * 1_000;
const DAY_MS = DAY_SECONDS * 1_000;

export interface FaceOptions {
  /**
   * A `Button` per tile, `clickAction: "open:<slug>"`, instead of the baked
   * tile. Off by default: a Material button draws its own chrome, and the
   * worker's whole-card tap already opens the launcher. Untested on a
   * device; see README "Pocket card".
   */
  rowButtons?: boolean;
}

function str(text: string): RendererNode {
  return { tag: "String", value: { text } };
}

function text(
  content: string,
  style: TypographyStyle,
  color: ColorToken,
  modifiers: Modifier[] = [],
): RendererNode {
  return {
    tag: "Text",
    value: { modifiers, props: { style, color }, children: [str(content)] },
  };
}

function spacer(size: { width?: number; height?: number }): RendererNode {
  const modifiers: Modifier[] = [];
  if (size.width !== undefined) modifiers.push({ tag: "Width", value: size.width });
  if (size.height !== undefined) modifiers.push({ tag: "Height", value: size.height });
  return { tag: "Spacer", value: { modifiers } };
}

function column(
  children: RendererNode[],
  modifiers: Modifier[] = [],
  props: {
    horizontalAlignment?: "Start" | "Center";
    verticalArrangement?: "Start" | "Center" | "SpaceBetween";
  } = {},
): RendererNode {
  return { tag: "Column", value: { modifiers, props, children } };
}

function row(
  children: RendererNode[],
  modifiers: Modifier[] = [],
  horizontalArrangement: "Start" | "SpaceBetween" = "Start",
  verticalAlignment: "Top" | "Center" = "Center",
): RendererNode {
  return {
    tag: "Row",
    value: { modifiers, props: { verticalAlignment, horizontalArrangement }, children },
  };
}

function box(
  children: RendererNode[],
  modifiers: Modifier[],
  contentAlignment: "TopStart" | "CenterStart" | "Center" = "TopStart",
): RendererNode {
  return { tag: "Box", value: { modifiers, props: { contentAlignment }, children } };
}

function background(color: ColorToken, radius: number): Modifier {
  return { tag: "Background", value: { color, shape: { tag: "Rounded", value: radius } } };
}

/** A PNG from the worker archive, drawn inside `width` x `height`. */
function image(path: string, width: number, height: number, fit: "Fill" | "Contain" = "Contain"): RendererNode {
  return {
    tag: "Image",
    value: {
      modifiers: [{ tag: "Width", value: width }, { tag: "Height", value: height }],
      props: { source: { tag: "Archive", value: `${TILE_DIR}/${path}` }, fit },
    },
  };
}

function hasBit(bits: bigint, gameId: number): boolean {
  return (bits & (1n << BigInt(gameId))) !== 0n;
}

/** Picked games played today. */
export function playedCount(bits: CardBits, games: readonly Game[]): number {
  return games.filter((game) => hasBit(bits.played, game.gameId)).length;
}

export function headlineFor(bits: CardBits, games: readonly Game[]): string {
  return `${playedCount(bits, games)}/${games.length}`;
}

/** The image for the count: tiles/count-<played>-of-<picks>.png. */
export function countImage(bits: CardBits, games: readonly Game[]): string {
  return `count-${playedCount(bits, games)}-of-${games.length}.png`;
}

/** A tile's look: the next game to play, another still to play, or done. */
export type TileState = "next" | "idle" | "done";

/** The tile image for a game: tiles/tile-<id>-<state>.png. */
export function tileImage(game: Game, state: TileState): string {
  return `tile-${game.id}-${state}.png`;
}

/** The strip's theme color: the renderer has no gold, green or red of its own. */
export function stripToken(state: StripState): ColorToken {
  switch (state) {
    case "green":
      return "FgSuccess";
    case "gold":
      return "FgWarning";
    case "red":
      return "FgError";
    default:
      return "FgTertiary";
  }
}

/** Milliseconds until the day rolls at 00:00 UTC (`shared/day.ts`). */
export function msToRollover(nowMs: number): number {
  const sinceEpoch = nowMs - EPOCH_SECONDS * 1_000;
  return DAY_MS - (((sinceEpoch % DAY_MS) + DAY_MS) % DAY_MS);
}

/** "07:12:33" to the next set at 00:00 UTC, as the hub shows it. */
export function countdownText(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1_000));
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3_600))}:${pad(Math.floor((total % 3_600) / 60))}:${pad(total % 60)}`;
}

/** Warms up as the set nears: white, gold in the last hour, red in the last five minutes. */
export function countdownToken(msLeft: number): ColorToken {
  if (msLeft <= 5 * 60_000) return "FgError";
  if (msLeft <= 60 * 60_000) return "FgWarning";
  return "FgPrimary";
}

/**
 * The strip's color: gold once every pick is done, green once any game is
 * played (an unpicked one keeps the streak too, D17b), red when the streak is
 * about to lapse (nothing played today, under four hours left), else gray.
 */
export function stripState(
  bits: CardBits,
  streakAny: number,
  msToRollover: number,
  games: readonly Game[],
): StripState {
  if (playedCount(bits, games) === games.length) return "gold";
  if (playedCount(bits, GAME_ROSTER) > 0) return "green";
  if (streakAny > 0 && msToRollover < RED_WINDOW_MS) return "red";
  return "gray";
}

/** A tile slot: a picked game, or the "+" that says more are waiting. */
export type CardTile = Game | "more";

/**
 * The six tiles at most (D21): unfinished picks first, then finished ones to
 * fill the rest, each group in roster order. With more than six unfinished,
 * five of them and a "+": the card asks for what is left, and the launcher
 * beneath it lists every pick.
 */
export function cardTiles(bits: CardBits, games: readonly Game[]): CardTile[] {
  const open = games.filter((game) => !hasBit(bits.played, game.gameId));
  const done = games.filter((game) => hasBit(bits.played, game.gameId));
  if (open.length > MAX_TILES) {
    return [...open.slice(0, MAX_TILES - 1), "more"];
  }
  return [...open, ...done].slice(0, MAX_TILES);
}

/** One game: its whole tile as a PNG in its state's look. The label is baked
 *  in; the renderer has no accessibility text for an image. */
function tile(game: CardTile, state: TileState, options: FaceOptions): RendererNode {
  if (game === "more") {
    return image("tile-more.png", TILE_WIDTH, TILE_HEIGHT);
  }
  if (options.rowButtons) {
    return {
      tag: "Button",
      value: {
        modifiers: [{ tag: "Width", value: TILE_WIDTH }, { tag: "Height", value: TILE_HEIGHT }],
        props: { text: game.short, variant: "Text", clickAction: `open:${game.id}` },
        children: [],
      },
    };
  }
  return image(tileImage(game, state), TILE_WIDTH, TILE_HEIGHT);
}

/** The streak: flame + days, only when > 0. The renderer has no 18px 800
 *  style and no gold text: the count is `BodyLargeRegular` in `FgWarning`
 *  (gold-ish). */
function streakNodes(summary: CardSummary): RendererNode[] {
  const any = summary.streakAny ?? 0;
  if (any <= 0) return [];
  return [
    image("flame.png", FLAME_WIDTH, FLAME_HEIGHT),
    spacer({ width: STREAK_ICON_GAP }),
    text(String(any), "BodyLargeRegular", "FgWarning"),
  ];
}

/**
 * The scoreboard. `summary` is the app's last record, or `null` when the
 * device has never recorded anything: then the card invites a first play.
 * `now` decides the strip (red needs the time to the day's end). `games` are
 * the player's picks, roster order.
 */
export function dailyFace(
  bits: CardBits,
  options: FaceOptions = {},
  summary: CardSummary | null = null,
  now: number = Date.now(),
  games: readonly Game[] = STARTER_GAMES,
): RendererNode {
  const strip = stripState(bits, summary?.streakAny ?? 0, msToRollover(now), games);

  const count = column([
    image(countImage(bits, games), COUNT_WIDTH, COUNT_HEIGHT),
    spacer({ height: LABEL_GAP }),
    image("done-today.png", LABEL_WIDTH, LABEL_HEIGHT),
  ]);
  const streaks =
    summary === null
      ? [text("Tap to play", "BodySmallRegular", "FgSecondary")]
      : streakNodes(summary);
  const msLeft = msToRollover(now);
  const countdown = column([
    text("NEW SET IN", "BodySmallRegular", "FgSecondary"),
    text(countdownText(msLeft), "TitleMediumRegular", countdownToken(msLeft)),
  ]);
  const left = column(
    [count, countdown, ...(streaks.length ? [row(streaks)] : [])],
    [{ tag: "Width", value: LEFT_WIDTH }, { tag: "Height", value: INNER_HEIGHT }],
    { verticalArrangement: "SpaceBetween" },
  );

  const tiles = cardTiles(bits, games);
  // Unfinished games come first, so the first unplayed tile is next up.
  const next = tiles.find((entry) => entry !== "more" && !hasBit(bits.played, entry.gameId));
  const stateOf = (entry: CardTile): TileState =>
    entry === "more" || !hasBit(bits.played, entry.gameId)
      ? entry === next ? "next" : "idle"
      : "done";
  const tileRows: RendererNode[] = [];
  for (let i = 0; i < tiles.length; i += TILES_PER_ROW) {
    const lineGames = tiles.slice(i, i + TILES_PER_ROW);
    // A short last row is padded with blank tiles, so its tiles stay under
    // the columns of a full one.
    const blanks = Array.from({ length: TILES_PER_ROW - lineGames.length }, () =>
      spacer({ width: TILE_WIDTH, height: TILE_HEIGHT }),
    );
    // Fixed-width tiles spread across whatever width the host gives the column.
    const line = row(
      [
        ...lineGames.map((entry) => tile(entry, stateOf(entry), options)),
        ...blanks,
      ],
      [{ tag: "FillWidth", value: true }, { tag: "Height", value: TILE_HEIGHT }],
      "SpaceBetween",
    );
    if (tileRows.length) tileRows.push(spacer({ height: TILE_ROW_GAP }));
    tileRows.push(line);
  }
  // The one FillWidth child of the row, and the last: it takes what the
  // left column and the gap leave.
  const grid = column(tileRows, [{ tag: "FillWidth", value: true }, { tag: "Height", value: INNER_HEIGHT }]);

  const content = row(
    [left, spacer({ width: COLUMN_GAP }), grid],
    [
      { tag: "FillWidth", value: true },
      { tag: "Height", value: CARD_HEIGHT },
      { tag: "Padding", value: PADDING },
    ],
    "Start",
    "Top",
  );

  const stripNode = box(
    [],
    [
      { tag: "Width", value: STRIP_WIDTH },
      { tag: "FillHeight", value: true },
      background(stripToken(strip), 0),
    ],
  );
  return box(
    [stripNode, content],
    [
      { tag: "FillWidth", value: true },
      { tag: "Height", value: CARD_HEIGHT },
      background("BgSurfaceContainer", CARD_RADIUS),
    ],
  );
}
