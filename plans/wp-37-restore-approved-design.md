# WP37 — Restore the approved design, literally

Shawn approved the six design boards (`plans/wp-36-boards/*.dc.html`, HTML with inline
styles). WP36 shipped a reviewed version that drifted from them; he does not like the
drift. **The boards are the contract.** `plans/wp-37-design-diff.md` lists every
deviation per board (approved vs shipped, origin, restore?). `plans/wp-36-design-pass.md`
is superseded wherever it disagrees with a board.

Rules for every WP37 package:
- Match the board: structure, order, copy (every string), fonts, sizes, weights, letter
  spacing, case, colours, radii, spacing, control labels. When the diff says "restore",
  restore. When it says "owner", restore the board too (Shawn chose the boards). When it
  says "keep", keep. Keep states the boards do not show (loading, error, never recorded,
  backfill, late/archive) but draw them in the board's visual language.
- Only two exceptions: (1) the Pocket renderer's hard limits (nine theme colours, five
  text styles, archive PNGs, fixed widths in rows); (2) accessibility floors (44 px tap
  targets, text contrast ≥ 4.5:1). When an exception applies, get as close as the limit
  allows and write the one-line reason in PROGRESS.
- Shared tokens (R1 sets them in `tokens.css`; every package uses these names, never
  literals): `--bg #121415`, `--surface #1b1e20`, `--surface-raised #1f2224`,
  `--tile-empty #2a2e31`, `--neutral #6c7275`, `--muted #9aa0a3`, `--text #ececec`,
  `--display "Fredoka"`, `--body "Nunito"`, the six `--accent-<id>` / `--accent-<id>-ink`,
  `--surface-<id>` (the board's tinted done surfaces: word `#16211a`, chess `#221a15`,
  mini `#23161d`; derive sudoku/globe/connections the same way), `--streak-gold`,
  `--streak-blue`. Fonts self-hosted: Fredoka 600 (exists) and 700, Nunito 500/700/800
  latin woff2 subsets from Google Fonts (OFL), `app/public/fonts/`, `@font-face` in
  `tokens.css`. No Google Fonts link in the app.
- Per-screen header as drawn (44 px circle left: hamburger on the hub, back arrow on
  game/result/streak screens; centred title or eyebrow; one control right; no hairline, no
  blur). The hamburger opens the drawer (nav list + activity strip) that existed before
  WP36: restore it from git history (`git show 34fdedf:app/src/shared/ui/drawer.ts`) and
  restyle it in the board's language. The flame pill still links to `#/streaks`.
- No backwards compat: replace, do not add flags.
- Verify with the suite, `tsc`, build, and headless screenshots at 390×844 (and 360×780)
  compared side by side with the board; look at them and fix before reporting.

Packages (parallel, separate files): R1 global + hub (main checkout: tokens, fonts,
shell, header, drawer, hub, launcher copy) · R2 result + share · R3 streaks page ·
R4 Connections · R5 Pocket card (`pocket/`, `tools/`). Merge order: R1 first.
