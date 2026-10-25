# AGENTS.md — Daily on Dot

A hub of daily puzzle games on Polkadot. Read [`PLAN.md`](PLAN.md) for full context;
this file is the short version that applies to **every** task.

## Roles

You are the engineer. A human PM owns design and reviews every diff. Implement the brief
you were given — nothing more. If a brief seems to require contradicting a locked decision
below, **stop and say so** rather than designing around it.

## Locked decisions (do not re-litigate)

- **D1** Plaintext content, casual trust. No commit-reveal, no encryption, no daily anchoring.
- **D2** Day index from block timestamp: `day = (now − EPOCH) / 86400`, UTC. No keeper transactions.
- **D3** One small registry contract per game, typed to that game's content. No generic
  engine registry, no opaque-`bytes` payloads.
- **D4** One shared `DailyScores` contract for all games.
- **D5** Streaks are derived, never stored. Three `u64` bitmaps per `(account, day)`:
  `played_bits`, `solved_bits`, `ontime_bits`.
- **D6** Player settings are device-local, never on-chain: the game selection (D21) lives
  in the product's host KV store (so the Pocket card can read it), mirrored to
  `localStorage` for synchronous reads and for hosts without one.
- **D7** No hub-index contract. The game roster is client-side data; home renders with zero RPC.
- **D8** Mobile-first. Desktop is the same layout widened.
- **D9** Guess dictionaries ship in the bundle; only answers live on-chain.
- **D10** Procedural games (Sudoku) get no content contract.
- **D11** Procedural generators are frozen and versioned **from first public play, not first
  commit**. Once live, changes ship as `v2` from a future start day. Before a game is live to
  players, `v1` may be rewritten in place — there is no history to protect.
- **D12** The roster is open-ended and append-only, see `app/src/shared/roster.ts`: Word 0,
  Sudoku 1, Chess 2, Globe 3, Mini 4, Connections 5, Code 6, Angle 7, Color 8, Sound 9 today. A gameId is never reused or
  moved once a game is live; the D5 bitmaps cap the roster at 64.
- **D13** `DailyScores` detail is `{score: u32, solved: bool}`; `score` is the game's own
  natural number, and each game says whether **lower or higher is better** (roster
  `better`): guesses, attempts, seconds and mistakes are lower-better; points (Daily
  Color, Daily Sound) are higher-better. `solved` means finished. No game has a loss state.
- **D14** **One chain write per game-day, at completion. Never per guess.**
- **D15** In-progress ("Started") state is `localStorage` only.
- **D16** Daily Word (gameId 0, route `#/g/word`) is one 6-letter word a day with no guess
  cap; `score` = guesses. The on-chain content is one six-letter word per day; there are
  no other lengths and no extra rounds. A guess is allowed when the bundled guess list has
  it or it is the day's answer.
- **D18** Game screens must fit 360×780 **and** 1440×900 with no scrolling. Document
  screens (home, history) may scroll vertically.
- **D17** Streaks get a one-day grace: the backward walk starts at today if today qualifies,
  otherwise at yesterday; 0 only if neither does. The compact badge hides below a streak
  of 2. See `PLAN.md` §8.2.
- **D17b** The one hub streak (gold flame): a day qualifies when any roster game, selected
  or not, was finished on the day itself; D17's grace applies. Mirrored to the Pocket card
  as `streakAny`. A backfill never counts for it.
- **D17c** No all-games streak. A day is **complete** (blue) when every game in the
  player's *current* selection was finished, on time or later. It is a status, not a
  streak: changing the selection may turn past days from blue to gold, and that is the
  intended nudge. No perfect-day counts.
- **D21** Each player picks the games they play daily (starter set: Word, Mini,
  Connections, Code). Picked games lead the hub and are all the Pocket card, the drawer,
  the headline and the share text count; unpicked games stay playable under "More games".
  At least one game is always picked; there is no upper limit. The card shows six tiles:
  unfinished picks first, then finished; with more than six unfinished, five and a **+**.
  See `plans/wp-38-game-selection.md`, `plans/wp-39-code-and-angle.md`.
- **D22** Daily Code (gameId 6, `#/g/code`): a four-digit code (0–9, repeats allowed),
  procedural; Mastermind pegs only (● right place, ○ wrong place); no cap; `score` = guesses.
- **D23** Daily Angle (gameId 7, `#/g/angle`): an angle of 1°–359°, procedural; each
  guess gets So close (≤5°) / Hot (≤15°) / Warm (≤30°) / Cold and an up/down arrow; no
  cap (D13, unlike Angledle's six); `score` = guesses.
- **D24** Daily Color (gameId 8, `#/g/color`): five procedural colours a day, each shown
  5 s then rebuilt with hue/saturation/brightness sliders; 10 × (1 − ΔE00/40) per colour;
  `score` = total in tenths of a point (0–500), higher better.
- **D25** Daily Sound (gameId 9, `#/g/sound`): five procedural tones a day (110–880 Hz),
  each heard once then found by dragging; 10 × (1 − ΔERB/0.5) per tone; `score` = total
  in tenths (0–500), higher better. See `plans/wp-41-daily-sound.md`.
- **D26** Daily Globe's data is a **superset** of every Natural Earth 1:50m place (but
  Antarctica, Siachen), each with a stable id, kind and owner; an editorial config
  (`shared/countries/globe-countries.json`) picks two subsets, **guessable** and
  **answers**, both Globle's 197 today (193 UN members + Vatican, Kosovo, Palestine,
  Taiwan). The daily answer depends only on `answers`, whose entries carry a start day
  (`since`, optional `until`), so adding a place or an answer is never breaking; ids and
  the shuffle rule are frozen once live. Non-guessable places are drawn
  neutral when their owner is guessed. See `plans/wp-42-globe-countries.md`.
- **D20** `DailyScores` keeps a per-`(game_id, day)` histogram of **on-time** finishers,
  bucketed by an owner-set, set-once, per-game **bucket spec** `{min, max, buckets ≤ 128}`:
  linear buckets over `[min, max)`, below `min` in the first, at or above `max` in the
  last. The contract never knows the direction. "Top N%" = rank share counted from the
  game's better end, ties in the player's favour; the distribution is drawn as a smooth
  curve; the day percentile is the mean of the game percentiles. Parity vectors:
  `shared/bucket-test-vectors.json`. See `PLAN.md` D20, `plans/wp-40-bucket-specs.md`.

## Working loop

`PROGRESS.md` is the durable ledger — read it first, update it before anything else.
It holds the current batch, current WP, blockers, and deliberate deferrals.

Fix defects that are **correctness, accessibility, data-loss, or broken-on-mobile**.
Log anything cosmetic to `PROGRESS.md` and move on — do not polish indefinitely.

**Commit as you go.** Every work package that passes its acceptance criteria gets its own
commit, together with the `PROGRESS.md` update for that step — never batch several work
packages into one commit, and never leave verified work uncommitted at the end of a turn.
Commit messages say what changed and *why*, including the defect being fixed. Do not commit
while another agent is mid-run in the same worktree: a blanket `git add -A` would sweep in
half-finished work. Verify first, then commit.

**Stop and ask** rather than proceeding when: a locked decision would have to change, a
step needs credentials/tokens/registration, or content needs editorial sign-off.
**Never fabricate content to hit a count.**

## Conventions

- **Rust contracts**: `no_std`, PolkaVM via `cargo pvm-contract`, mirroring `../quizzler`
  (pinned nightly, `.cargo/config.toml`, `riscv64emac-unknown-none-polkavm.json`). Keep
  contracts thin — real logic belongs in the host-testable `contracts/logic` crate.
- **App**: Vite + TypeScript + Vitest, pnpm, Node ≥ 22. No React unless a brief says so.
- **Tests encode intent.** A test that cannot fail when the business rule changes is wrong.
- **No silent skips.** "Done" is false if anything was skipped, stubbed, or left failing.
  Say what you did not do.
- **Surgical diffs.** Touch only what the brief covers. Do not reformat or "improve"
  adjacent code.
- Match the surrounding style. Comments explain *why*, not *what*.

## Design system

Dark theme only. Full table in `PLAN.md` §8.1.

```
--bg #161819   --surface #303436      --surface-raised #27282A   --tile-empty #1E2021
--neutral #707070   --correct #55B725   --present #DAC316   --wrong #C62121   --text #ECECEC
```

Headings: a wide geometric display face (Clash Display or similar), 600.
Body/numerals: a neutral grotesque (DM Sans or similar), 400/500/900.
Letter tiles 64×64 r6 · keyboard keys 32×50 r4 · icon buttons 36×36 round.

Layout: mobile is one vertical stack of full-width cards; desktop reflows the *same* cards
into a centred grid. Persistent header `hamburger · title · archive · settings · account`.
No bottom tab bar. Must work at 360px wide with no horizontal scroll.
