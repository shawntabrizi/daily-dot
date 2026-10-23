// The card face is the approved board (plans/wp-36-boards/Main.dc.html): a
// left scoreboard column, a right 3 x 2 tile grid, and a strip that is the
// one state signal. Nothing on it is a percentile. Runs with the app's
// vitest: `pnpm pocket:test`. Outside pocket/src so the worker's tsc (no
// vitest types) never sees it.
import { describe, expect, it } from "vitest";

import { DAY_SECONDS } from "../../app/src/shared/day";
import { GAME_ROSTER } from "../../app/src/shared/roster";
import { imagePathsIn, stripTokenIn, textsIn } from "../../tools/face-text.mts";
import {
  COUNT_HEIGHT,
  COUNT_WIDTH,
  countdownText,
  countdownToken,
  dailyFace,
  EMPTY_BITS,
  GAME_COUNT,
  LEFT_WIDTH,
  msToRollover,
  RED_WINDOW_MS,
  stripState,
  TILE_HEIGHT,
  TILE_WIDTH,
} from "../src/face";

const HOUR = 60 * 60 * 1_000;
const ALL = GAME_ROSTER.reduce((bits, game) => bits | (1n << BigInt(game.gameId)), 0n);
const full = { played: ALL, solved: ALL };
const three = { played: 0b111n, solved: 0b001n };
const noon = Date.UTC(2026, 9, 22, 12, 0, 0);
const strip = (face: ReturnType<typeof dailyFace>) => stripTokenIn(face);

interface Node {
  tag: string;
  value?: {
    modifiers?: { tag: string; value: unknown }[];
    props?: Record<string, unknown>;
    children?: Node[];
  };
}
/** Every node of a face, in tree order. */
function nodesIn(face: unknown): Node[] {
  const node = face as Node;
  return [node, ...(node.value?.children ?? []).flatMap(nodesIn)];
}
const modifier = (node: Node, tag: string) => node.value?.modifiers?.find((m) => m.tag === tag)?.value;
const imagePath = (node: Node) => (node.value?.props?.source as { value: string } | undefined)?.value;

describe("stripState", () => {
  it("is gold at 6/6 whatever the streak or the clock", () => {
    expect(stripState(full, 0, 10 * HOUR)).toBe("gold");
    expect(stripState(full, 5, HOUR)).toBe("gold");
  });

  it("is green while some games are done, whatever the streak or the clock", () => {
    expect(stripState({ played: 1n, solved: 0n }, 0, 10 * HOUR)).toBe("green");
    expect(stripState({ played: 1n, solved: 0n }, 7, HOUR)).toBe("green");
    expect(stripState(three, 7, 10 * HOUR)).toBe("green");
  });

  it("is red only with a streak, nothing played, and under four hours left", () => {
    expect(stripState(EMPTY_BITS, 1, RED_WINDOW_MS - 1)).toBe("red");
    expect(stripState(EMPTY_BITS, 1, 1)).toBe("red");
  });

  it("stays grey at 0/6 at exactly four hours or with no streak", () => {
    expect(stripState(EMPTY_BITS, 1, RED_WINDOW_MS)).toBe("grey");
    expect(stripState(EMPTY_BITS, 0, HOUR)).toBe("grey");
    expect(stripState(EMPTY_BITS, 0, 10 * HOUR)).toBe("grey");
  });
});

describe("msToRollover", () => {
  it("counts down to 00:00 UTC, the day boundary of shared/day.ts", () => {
    expect(msToRollover(Date.UTC(2026, 9, 22, 23, 30, 0))).toBe(30 * 60 * 1_000);
    expect(msToRollover(Date.UTC(2026, 9, 22, 0, 0, 0))).toBe(DAY_SECONDS * 1_000);
  });
});

describe("dailyFace layout", () => {
  const face = dailyFace(three, {}, { streakAny: 14 }, noon);
  const nodes = nodesIn(face);

  it("has a left column of fixed width 112 that holds the count and the streak", () => {
    const left = nodes.filter((n) => n.tag === "Column" && modifier(n, "Width") === LEFT_WIDTH);
    expect(left).toHaveLength(1);
    const inside = nodesIn(left[0]);
    expect(inside.map(imagePath)).toContain("tiles/count-3.png");
    expect(inside.map(imagePath)).toContain("tiles/done-today.png");
    expect(inside.map(imagePath)).toContain("tiles/flame.png");
    expect(left[0].value?.props?.verticalArrangement).toBe("SpaceBetween");
    expect(LEFT_WIDTH).toBe(112);
  });

  it("draws the count as a 112 x 64 image with the label under it", () => {
    const count = nodes.find((n) => imagePath(n) === "tiles/count-3.png")!;
    expect(modifier(count, "Width")).toBe(COUNT_WIDTH);
    expect(modifier(count, "Height")).toBe(COUNT_HEIGHT);
    expect([COUNT_WIDTH, COUNT_HEIGHT]).toEqual([112, 64]);
    const paths = imagePathsIn(face);
    expect(paths.indexOf("tiles/done-today.png")).toBe(paths.indexOf("tiles/count-3.png") + 1);
  });

  it("spreads the tiles in two rows of three with SpaceBetween, fixed size", () => {
    const rows = nodes.filter(
      (n) =>
        n.tag === "Row" &&
        (n.value?.children ?? []).length > 0 &&
        (n.value?.children ?? []).every((c) => /^tiles\/tile-/.test(imagePath(c) ?? "")),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.value?.props?.horizontalArrangement).toBe("SpaceBetween");
      expect(modifier(row, "FillWidth")).toBe(true);
      expect(row.value?.children).toHaveLength(3);
      for (const tile of row.value!.children!) {
        expect(modifier(tile, "Width")).toBe(TILE_WIDTH);
        expect(modifier(tile, "Height")).toBe(TILE_HEIGHT);
      }
    }
    expect(rows.flatMap((r) => r.value!.children!.map(imagePath))).toEqual(
      GAME_ROSTER.map((game) => `tiles/tile-${game.id}-${(three.played & (1n << BigInt(game.gameId))) !== 0n ? "done" : "idle"}.png`),
    );
  });

  it("fits the frame by arithmetic: 3 tiles + 2 gaps + the left column within 355, two rows within 200", () => {
    expect(LEFT_WIDTH + 14 + 3 * TILE_WIDTH + 2 * 8).toBeLessThanOrEqual(355);
    expect(2 * TILE_HEIGHT + 10).toBe(234 - 18 - 16);
  });

  it("bakes the tile labels into the PNGs: no live text for a game", () => {
    const texts = textsIn(face);
    for (const game of GAME_ROSTER) expect(texts).not.toContain(game.short);
  });
});

describe("dailyFace", () => {
  it("draws one tile per roster game, lit when played", () => {
    const paths = imagePathsIn(dailyFace(three, {}, {}, noon));
    const tiles = paths.filter((path) => /^tiles\/tile-[a-z]+-(done|idle)\.png$/.test(path));
    expect(tiles).toHaveLength(GAME_ROSTER.length);
    for (const game of GAME_ROSTER) {
      const played = (three.played & (1n << BigInt(game.gameId))) !== 0n;
      expect(paths).toContain(`tiles/tile-${game.id}-${played ? "done" : "idle"}.png`);
      expect(paths).not.toContain(`tiles/tile-${game.id}-${played ? "idle" : "done"}.png`);
    }
  });

  it("heads with the baked n/6 count", () => {
    expect(imagePathsIn(dailyFace(three, {}, {}, noon))).toContain("tiles/count-3.png");
    expect(imagePathsIn(dailyFace(full, {}, {}, noon))).toContain(`tiles/count-${GAME_COUNT}.png`);
    expect(imagePathsIn(dailyFace(EMPTY_BITS, {}, null, noon))).toContain("tiles/count-0.png");
  });

  it("never shows the percentile", () => {
    const texts = textsIn(dailyFace(full, {}, { streakAny: 4, dayPercentile: 12 }, noon));
    expect(texts.some((text) => /%|Top/.test(text))).toBe(false);
  });

  it("counts down to the next set as HH:MM:SS under a NEW SET IN label, like the hub", () => {
    // Noon UTC: twelve hours to the 00:00 UTC rollover.
    const texts = textsIn(dailyFace(three, {}, {}, noon));
    expect(texts).toContain("NEW SET IN");
    expect(texts).toContain("12:00:00");
    expect(countdownText(7 * HOUR + 12 * 60_000 + 33_000)).toBe("07:12:33");
    // A part-second rounds up: it reads 00:00:01, never 00:00:00, before the set changes.
    expect(countdownText(1)).toBe("00:00:01");
  });

  it("warms the countdown as the set nears: white, gold in the last hour, red in the last five minutes", () => {
    expect(countdownToken(2 * HOUR)).toBe("FgPrimary");
    expect(countdownToken(HOUR)).toBe("FgWarning");
    expect(countdownToken(5 * 60_000)).toBe("FgError");
    const late = Date.UTC(2026, 9, 22, 23, 57, 0);
    const clock = nodesIn(dailyFace(three, {}, {}, late)).find((n) => n.tag === "Text" && textsIn(n)[0] === "00:03:00");
    expect(clock?.value?.props?.color).toBe("FgError");
  });

  it("invites a first play only when nothing was ever recorded", () => {
    expect(textsIn(dailyFace(EMPTY_BITS, {}, null, noon))).toContain("Tap to play");
    expect(textsIn(dailyFace(EMPTY_BITS, {}, {}, noon))).not.toContain("Tap to play");
  });

  it("shows the streak count only when it is above zero, in gold", () => {
    const none = dailyFace(three, {}, { streakAny: 0 }, noon);
    expect(imagePathsIn(none)).not.toContain("tiles/flame.png");
    const some = dailyFace(three, {}, { streakAny: 14 }, noon);
    expect(imagePathsIn(some)).toContain("tiles/flame.png");
    const texts = nodesIn(some).filter((n) => n.tag === "Text" && !/^(NEW SET IN|\d\d:\d\d:\d\d)$/.test(textsIn(n)[0] ?? ""));
    const colours = texts.map((n) => [textsIn(n)[0], n.value?.props?.color, n.value?.props?.style]);
    expect(colours).toEqual([["14", "FgWarning", "BodyLargeRegular"]]);
  });

  it("draws the strip that stripState names: grey, green, gold, red", () => {
    expect(strip(dailyFace(EMPTY_BITS, {}, {}, noon))).toBe("FgTertiary");
    expect(strip(dailyFace(three, {}, {}, noon))).toBe("FgSuccess");
    expect(strip(dailyFace({ played: 1n, solved: 0n }, {}, {}, noon))).toBe("FgSuccess");
    expect(strip(dailyFace(full, {}, {}, noon))).toBe("FgWarning");
    const late = Date.UTC(2026, 9, 22, 23, 30, 0);
    expect(strip(dailyFace(EMPTY_BITS, {}, { streakAny: 3 }, late))).toBe("FgError");
    expect(strip(dailyFace(three, {}, { streakAny: 3 }, late))).toBe("FgSuccess");
    expect(strip(dailyFace(EMPTY_BITS, {}, null, late))).toBe("FgTertiary");
  });

  it("keeps the open action on each tile when buttons are asked for", () => {
    const face = JSON.stringify(dailyFace(three, { rowButtons: true }, {}, noon));
    for (const game of GAME_ROSTER) expect(face).toContain(`"clickAction":"open:${game.id}"`);
  });
});
