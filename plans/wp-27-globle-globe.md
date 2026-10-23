# WP27 — Globle: the visual globe (2026-10-21)

Shawn's request: "globle game is missing the visual globe." WP16 shipped the
input and the guess list only. This WP adds the globe between the heading and
the input, so a guess is seen on the map as well as read in the list.

## What

- `shared/countries/shapes.json` — Natural Earth 110m outlines for all 166
  `core.json` countries, quantised to 0.1°, ~100 KB, bundled (D10/D19: no
  runtime fetch, no remote asset). Generator: `app/scripts/generate-country-shapes.ts`,
  same identity rule as `core.json`. Licence and source in `shared/countries/README.md`.
- `app/src/games/globle/projection.ts` — orthographic projection, visibility,
  great-circle rotate, drag-to-centre math. Pure, unit-tested.
- `app/src/games/globle/globe.ts` — canvas 2D renderer (no library, no WebGL):
  ocean disc, faint graticule, muted outlines, guesses filled with the same
  proximity ramp the list uses, the answer in `--correct` once revealed.
  Drag/touch rotates; each new guess turns the globe to it; reduced motion
  jumps; no frame loop while idle; device-pixel-ratio aware.
- Layout: square, `min(100%, 42vh)`, inside the stage above the input. D18
  holds at 360×780 and 1440×900; the guess list scrolls inside its box.

## Why these choices

- Canvas 2D, not WebGL or SVG: the Polkadot app WebView and Dotli's iframe
  must draw it with nothing but the bundle; 9k points redraw in one frame.
- One canvas for the life of the view: the player's rotation survives a guess.
- Far-side points are pushed to the rim rather than clipped exactly: simpler,
  and the disc clip hides the difference at this resolution.

## Acceptance

Unit tests for projection, fills model, shapes integrity; `tsc --noEmit`;
Playwright at 360×780, 420×860, 1440×900 with two guesses: `scrollHeight ==
clientHeight`, no console errors, drag redraws.
