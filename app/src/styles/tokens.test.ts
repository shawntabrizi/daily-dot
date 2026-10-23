import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GAME_ROSTER } from "../shared/roster";

/**
 * The token sheet is the one place colour lives (WP37 R1: the boards' values).
 * These tests read it as text: a game whose accent token is missing would
 * render with no colour, and a text/surface pair under 4.5:1 would ship below
 * the accessibility floor the boards are held to. The boards' `#6c7275`
 * (`--neutral`) is 3.8:1 on `--bg`: labels of 14 px bold or larger only;
 * `--dim` is the small-label grey that passes.
 */
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tokens.css"),
  "utf8",
);

type Block = Record<string, string>;

function block(selector: string): Block {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens: Block = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

const THEMES: Record<string, Block> = {
  dark: block(":root"),
  light: block(':root[data-theme="light"]'),
};

/** WCAG 2.x relative luminance of a six-digit hex colour. */
function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(Object.entries(THEMES))("tokens.css %s block", (_theme, tokens) => {
  it("declares an accent and an ink for every roster game", () => {
    for (const game of GAME_ROSTER) {
      expect(tokens[`--accent-${game.id}`], `--accent-${game.id}`).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
      expect(tokens[`--accent-${game.id}-ink`], `--accent-${game.id}-ink`).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
      expect(tokens[`--surface-${game.id}`], `--surface-${game.id}`).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
    }
  });

  it("keeps every text/surface pair at or above 4.5:1", () => {
    const pairs: Array<[string, string, string]> = [
      ["--text", tokens["--text"], tokens["--bg"]],
      ["--text on --surface", tokens["--text"], tokens["--surface"]],
      ["--text on --surface-raised", tokens["--text"], tokens["--surface-raised"]],
      ["--text on --tile-empty", tokens["--text"], tokens["--tile-empty"]],
      ["--muted on --bg", tokens["--muted"], tokens["--bg"]],
      ["--muted on --surface", tokens["--muted"], tokens["--surface"]],
      ["--muted on --surface-raised", tokens["--muted"], tokens["--surface-raised"]],
      // "DONE TODAY" and the drawer's section label: 11 px on the page.
      ["--dim on --bg", tokens["--dim"], tokens["--bg"]],
      // The header pill: gold count on the gold tint.
      ["--streak-gold on --streak-gold-tint", tokens["--streak-gold"], tokens["--streak-gold-tint"]],
      ["--streak-blue on --streak-gold-tint", tokens["--streak-blue"], tokens["--streak-gold-tint"]],
    ];
    for (const game of GAME_ROSTER) {
      pairs.push([
        `--accent-${game.id}-ink on --accent-${game.id}`,
        tokens[`--accent-${game.id}-ink`],
        tokens[`--accent-${game.id}`],
      ]);
      // The done row: muted line and the accent score on the tinted surface.
      pairs.push([
        `--muted on --surface-${game.id}`,
        tokens["--muted"],
        tokens[`--surface-${game.id}`],
      ]);
      // The score's text tone: the accent where it passes, a lightened or darkened one where not.
      pairs.push([
        `--accent-${game.id}-text on --surface-${game.id}`,
        tokens[`--accent-${game.id}-text`],
        tokens[`--surface-${game.id}`],
      ]);
    }
    for (const [label, fg, bg] of pairs) {
      expect(contrast(fg, bg), label).toBeGreaterThanOrEqual(4.5);
    }
  });
});

it("--neutral stays the boards' #6c7275, under the floor: large bold labels only", () => {
  // The guard: if this ever passes, the contrast function is broken.
  expect(THEMES.dark["--neutral"]).toBe("#6c7275");
  expect(contrast(THEMES.dark["--neutral"], THEMES.dark["--bg"])).toBeLessThan(4.5);
  // The plain accent fails on its tint; the text tone is why it exists.
  expect(contrast(THEMES.dark["--accent-connections"], THEMES.dark["--surface-connections"])).toBeLessThan(4.5);
});
