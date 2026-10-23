import { describe, expect, it } from "vitest";

import { GAME_ROSTER } from "../roster";
import { gameGlyph } from "./game-glyphs";

describe("game glyphs", () => {
  it("gives every roster game a hidden-from-readers SVG", () => {
    for (const game of GAME_ROSTER) {
      const svg = gameGlyph(game.id);
      expect(svg, game.id).toMatch(/^<svg [^>]*aria-hidden="true"/);
      expect(svg, game.id).toMatch(/<\/svg>$/);
      expect(svg, game.id).toContain("currentColor");
    }
  });

  it("takes a stroke and fill for a baked render", () => {
    const svg = gameGlyph("connections", { stroke: "#111111", fill: "#222222" });
    expect(svg).toContain('stroke="#111111"');
    expect(svg).toContain('fill="#222222"');
    expect(svg).not.toContain("currentColor");
    expect(svg).not.toContain("%f");
  });

  it("is distinct per game", () => {
    const bodies = new Set(GAME_ROSTER.map((game) => gameGlyph(game.id)));
    expect(bodies.size).toBe(GAME_ROSTER.length);
  });
});
