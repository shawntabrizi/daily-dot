# WP41 — Daily Sound

Decisions: D13, D20, D21, D24 (pattern), D25 (new). Builds on WP40 (bucket specs,
higher-better scores) and follows Daily Color (gameId 8) for structure.

A clone of dialed.gg's sound mode: hear a tone, then find it again.

## D25 Daily Sound (gameId 9, `#/g/sound`)

- Five tones a day from a frozen seeded `v1` generator (`shared/seeded.ts`, own salt):
  frequencies log-uniform over 110–880 Hz (A2–A5), to hundredths of a Hz.
- Each round: a **Listen** button (Web Audio needs a user gesture) plays the target as a
  pure sine for 2 seconds with a short fade in and out, once; then the player finds it
  by press-and-hold and drag on the board (vertical position is pitch on a log scale over
  the same range; the tone sounds live while held), with arrow keys as the keyboard path
  (±1 cent fine, ±50 cents with Shift). Submit with a button.
- Reveal (the dialed.gg screen): round "1 / 5", the round score large to two decimals
  with a line of verdict text, TARGET in Hz and the guess in Hz, and an arrow to go on.
- Score per tone: `10 × max(0, 1 − ΔERB / 0.5)`, ΔERB the difference in ERB-rate,
  `E(f) = 21.4 × log10(1 + 0.00437 f)` (Glasberg & Moore). Shown to hundredths; the
  recorded `score` is the total in tenths (0–500), `kind: "points"`, `better: "higher"`,
  bucket spec `{0, 500, 100}` — the same as Daily Color. The 0.5 ERB tolerance is a
  round choice (dialed.gg's own constant looks closer to 0.515); tune before first play.
- One chain write after the fifth tone. Progress in localStorage; a reload mid-round
  restarts that round's listen. A day recorded elsewhere opens read-only listing the
  five targets. No loss state. Not a starter pick.
- Accessibility: the pitch control is a slider (aria-valuetext "220.00 Hz"); the game
  states that it needs sound; a device with audio blocked shows a message, not a dead
  board. Fits 360×780 and 1440×900 without scrolling (D18).
- Visual: black board, the waveform glow is optional; keep it a simple SVG/CSS wave in
  the game's accent if added, never a heavy canvas loop.

## Acceptance

1. ERB and score formula tested at known values (e.g. 173.83 vs 190.36 Hz → ΔERB ≈ 0.374).
2. Frozen v1 frequencies pinned in tests; all within range.
3. One write of the total in tenths; resume; read-only; tests fail if the direction flips.
4. Plays end to end in Chromium at both sizes (audio mocked in tests; real Web Audio in
   the browser check).
