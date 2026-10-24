# WP40 — Per-game bucket specs, score direction, and Daily Color

Decisions: D13 and D20 amended 2026-10-23, D24 new (below). Read `AGENTS.md` first.

Games will not all aim at zero: Daily Color scores points out of 50, higher is better.
The contract only buckets scores; the app ranks them. So the contract learns a per-game
bucket spec instead of two hard-coded kinds, and the app learns a per-game direction.

There are no players: the `DailyScores` change ships as a fresh deploy (new address). No
migration, no compatibility with the old `setGameKind` / `gameKind`.

## The bucket rule (identical in Rust and TS)

```
BucketSpec { min: u32, max: u32, buckets: u8 }   // 1 <= buckets <= 128, max > min
bucket(score) = 0                                    if score < min
              = buckets - 1                          if score >= max
              = min(buckets - 1, (score - min) * buckets / (max - min))   // u64, floor
```

Unset spec reads as `{ min: 1, max: 32, buckets: 31 }`. `shared/bucket-test-vectors.json`
holds the parity vectors; both sides must have a test that reads that file and passes
every vector. Do not edit the file except to add vectors.

Specs per game (also in the app roster):

| Games | spec | meaning |
|---|---|---|
| Word, Chess, Globe, Connections, Code, Angle | `{1, 32, 31}` | exact 1–30, then 31+ |
| Sudoku, Mini | `{0, 1815, 121}` | 15 s steps, 30 min+ |
| Color | `{0, 500, 100}` | half-point steps (score in tenths) |

## Part A — contract (`contracts/logic`, `contracts/scores`)

- `contracts/logic`: replace `GameKind`, `score_bucket(kind, …)`, `COUNT_BUCKET_MAX`,
  `SECONDS_BUCKET_*` with `BucketSpec`, `BucketSpec::DEFAULT`, `BucketSpec::new(min, max,
  buckets) -> Result<_, SpecError>` (validation), `BucketSpec::bucket(score) -> u8`.
  `histogram_bucket_for_record` keeps its rule (on-time and solved only) with a spec.
  Host tests: validation, the parity file, the on-time rule. Keep logic in this crate.
- `contracts/scores`: storage `bucket_spec: Mapping<u8, (u32, u32, u8)>` replaces
  `game_kind`. Methods: `set_bucket_spec(game_id, min, max, buckets)` owner-only, fails
  if invalid, game id out of range, or already set (set-once); `bucket_spec(game_id) ->
  BucketSpecView { min, max, buckets, set }`. Remove `set_game_kind` / `game_kind`.
  `record`, `histogram`, `histograms`, `day_totals` keep their signatures; `histogram`
  walks `0..buckets` of the game's spec. Bucket indices are now 0-based.
- Build: try `cargo pvm-contract` with the pinned nightly. If the toolchain or target
  cannot be installed in this sandbox, say so exactly; `cargo test` on `contracts/logic`
  with stable must pass either way.

## Part B — app (`app/`)

- Roster: every game gets `better: "lower" | "higher"` and `buckets: { min, max,
  buckets }` per the table. `ScoreKind` gains `"points"` (tenths of a point; shown
  `42.6`). Remove anything that maps a kind to buckets.
- `shared/percentile.ts`: `scoreBucket(spec, score)` per the rule above with a parity
  test over `shared/bucket-test-vectors.json`; `percentileFor(histogram, game, score,
  counted)` counts finishers in strictly better buckets from the game's better end
  (higher-better: buckets above). Ties stay in the player's favour; the formula is
  unchanged otherwise. `holdsPlayer` and the rest follow. Every caller updated.
- `shared/ui/distribution.ts`: a smooth curve (SVG area path through the bucket
  counts, lightly smoothed, e.g. a 3-bucket kernel, with the player's position marked),
  better end consistent per game, axis end labels from the spec (`1`, `31+`; `0:00`,
  `30:00+`; `0`, `50`). An `aria-label` sentence ("You are in the top 12% of 340
  finishers"). Fits wherever the bar chart did, at 360 px.
- `app/scripts/set-game-kinds.ts` becomes `set-bucket-specs.ts`: for each roster game,
  read `bucketSpec(gameId)`; if unset, `setBucketSpec`; if set and different, stop with
  an error naming the game (specs are set-once). Dry-run flag. It will only run after the
  redeploy; it cannot be run here (needs a key) — do not try.
- `formatScore` for `"points"`: `"42.6 points"`; anything that says "fewest" or
  assumes lower-better (result headline thresholds use the percentile, so fine — check).

## Part C — Daily Color (gameId 8, `#/g/color`, D24)

- **D24 Daily Color:** five colours a day from a frozen seeded `v1` generator
  (`shared/seeded.ts`; hue 0–359, saturation 25–100, brightness 30–100, HSB). Each
  round: the colour fills the board for **5 seconds** with a countdown, then hides; the
  player rebuilds it with three vertical sliders, hue, saturation, brightness (the
  dialed.gg layout: three slim columns on the left, the chosen colour filling the rest),
  and submits. Reveal: target beside guess, the round's score out of 10. After five:
  the total out of 50.
- Score per colour: `10 × max(0, 1 − ΔE00 / 40)`, ΔE00 the CIEDE2000 distance between
  target and guess in CIELAB (D65, sRGB). Round each colour to tenths; the recorded
  `score` is the total in tenths (0–500), higher better, `better: "higher"`, kind
  `"points"`, spec `{0, 500, 100}`. Test CIEDE2000 against Sharma's published pairs.
- One chain write after the fifth colour (D14). Progress in localStorage (D15): rounds
  done and their guesses. A reload mid-round restarts that round's 5-second look
  (casual trust, D1). Recorded elsewhere → read-only with the day's five colours.
- No loss state; `solved` is true at the end. Not a starter pick. Accent, glyph, hub
  hook ("Five colours from memory"), progress line ("2 of 5 colours"), tiles in
  `tools/render-card-art.mts` (bake with `CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm
  pocket:art`, then restore every pre-existing PNG with `git checkout` so only new
  ones are added), `count-<n>-of-9` images. Fits 360×780 and 1440×900, no scroll (D18);
  sliders usable by touch, mouse and keyboard (arrow keys), each with an aria label and
  value text.

## Acceptance

1. Parity file passes in Rust (`cargo test --manifest-path contracts/logic/Cargo.toml`)
   and TS (`vitest`).
2. A higher-better histogram ranks the top bucket first; tests fail if direction flips.
3. App `tsc`, all `vitest`, `pnpm build` in `app/`, `pnpm pocket:test`, `pnpm smoke`,
   `pnpm pocket:assets`, `pnpm pocket:build` pass.
4. Color plays end to end in Chromium at both sizes.

## Not in this WP

- Deploying `DailyScores` and running `set-bucket-specs` (needs Shawn's key).
- Exact (unbucketed) percentiles: would need an indexer.
