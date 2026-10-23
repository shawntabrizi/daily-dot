# Daily on Dot — Delivery Plan

A hub of daily puzzle games on Polkadot, published to the Polkadot app browser.
Reference architecture: [`quizzler`](../quizzler).

**Roles.** Claude is project manager and reviewer: owns design, writes work-package
briefs, reviews every diff, runs the acceptance gates, and is the only one who may
change a locked decision. Codex is the engineer: implements one work package at a
time and does not redesign.

---

## 1. Locked decisions

These are settled. Codex must not re-litigate them; a brief that seems to require
otherwise is a brief bug — escalate to the PM instead of designing around it.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Plaintext content, casual trust.** No commit-reveal, no encryption, no anchoring. | Contract state is public; a contract that verifies answers must store them. NYT ships Wordle answers to the browser too. |
| D2 | **Day index from block timestamp**, `day = (now − EPOCH) / 86400`, UTC. No keeper transactions. | Block times drift; wall-clock is what a *daily* game means. |
| D3 | **One small registry contract per game**, typed to that game's content. No generic engine/opaque-bytes registry. | A generic registry buys nothing real — new game types need client code regardless — and it destroys on-chain format validation. |
| D4 | **One shared `DailyScores` contract** for all games. | `(account, gameId, day)` is genuinely uniform; it is also the only view that spans games. |
| D5 | **Streaks are derived, not stored.** Three bitmaps per `(account, day)`: `played_bits` (finished a session, win or loss), `solved_bits` (won), `ontime_bits` (did it on the day itself). | Strictly more information than a counter. Win rate = `popcount(solved)/popcount(played)`, streak = run over `ontime & solved`, completionist = `popcount(played)` — all from one read, with no per-day detail fetch. |
| D6 | **Player settings are device-local, never on-chain.** The game selection (D21) lives in the product's host KV store, which the Pocket card worker can read, mirrored to `localStorage` for synchronous reads and for hosts without a store. *(Amended 2026-10-23: was "favorites and hidden games are `localStorage` only".)* | Every toggle would otherwise cost a signature. The card and the app share no runtime; the host KV store is their one channel. |
| D7 | **No hub-index contract.** The game roster is client-side data. | Every game needs shipped client code anyway, so the chain never needs to enumerate games. Home renders with zero RPC. |
| D8 | **Mobile-first**, desktop is the widened case. | Product requirement. |
| D9 | **Guess dictionaries ship in the bundle; only answers live on-chain.** | ~13k allowed guesses are static app code. Answers are the content that gets extended. |
| D10 | **Procedurally generated games get no content contract.** Sudoku derives day D's grid client-side and touches only `DailyScores`. | Under D1 there is nothing to hide and nothing to store. |
| D11 | **Procedural generators are frozen and versioned — from first public play, not from first commit.** Once a game is live to players, a change ships as `v2` applying from a future start day only. Before that, `v1` may be rewritten in place. | Regenerating history from a changed algorithm silently rewrites puzzles players already completed. Pre-release there are no completed puzzles, so the rule protects nothing and only blocks fixing content. |
| D12 | **An open-ended, append-only roster** (`app/src/shared/roster.ts`): Daily Word 0, Daily Sudoku 1, Daily Chess 2, Daily Globe 3, Daily Mini 4, Daily Connections 5, Daily Code 6, Daily Angle 7 today, more to come. A gameId is never reused or moved once its game is live; new games take the next id. *(Amended 2026-10-23: was "six games".)* | The ids index the D5 bitmaps on chain; a recorded bit cannot move to another game. `DailyScores` takes any id below 64, so a new game needs client code (and its own content contract under D3/D19) but no change to the scores contract. |
| D13 | **`DailyScores` detail is `{score: u32, solved: bool}`**, with `score` the game's natural number and a per-game direction (roster `better`): guesses (Word, Globe, Code, Angle), attempts (Chess), seconds (Sudoku, Mini), mistakes (Connections) are lower-better; points (Daily Color, tenths of a point out of 50) are higher-better. `solved` means finished and feeds the streak. **No game has a loss state.** *(Amended 2026-10-23: was "minimised" for every game.)* | A scalar is not a schema; this stays uniform across games without becoming generic. Forcing every game toward zero bent natural scores ("points lost") for no reason the chain needed: the contract only buckets, the app ranks. |
| D14 | **One chain write per game-day, at completion.** Never per guess. In-progress state is `localStorage` only. | lessgames POSTs every guess to its server; the on-chain equivalent would be up to 36 transactions per game per day. Read content once, validate locally, write once. |
| D15 | **The "Started" state is local-only.** The calendar's three states are Played (on-chain `ontime`), From Archive (on-chain backfill), Started (local, unfinished). | An unfinished puzzle is worth showing but is not worth a transaction. |
| D16 | **Daily Word (gameId 0, route `#/g/word`) is one 6-letter word per day** with no guess cap; `score` = guesses. The on-chain content is one six-letter word per day: `WordRegistry` stores a sealed list of answers with a `start_day`, and `word_for_day` is the game's one content read. Answers are curated off chain (wordfreq Zipf ≥ 4.0 ∩ lowercase SCOWL-60 − LDNOOBW, shuffled with a fixed seed); guesses are checked against a bundled permissive list (ENABLE ∪ SCOWL-70 ∪ answers), and the day's answer is always allowed. | One word a day is the habit; the extra lengths were played by nobody and cost a five-word read and five storage items a day. Six letters and the name "Daily Word" keep it from being exactly Wordle. Curation off chain keeps proper nouns, British spellings and slurs out of a list that cannot be edited once sealed. |
| D19 | **Content contracts are for *authored* content, not *derived* or *reference* content.** A game gets a registry only when a human wrote its puzzles (Word answer lists, Chess selections, Mini grids and clues, Connections groups). Procedurally generated content (Sudoku) and fixed public reference data (Globe's country table) ship in the bundle and touch only `DailyScores`. | D3 read per-game, which invited a contract per game; the real axis is provenance. Reference data is not secret, does not change, and gains nothing from being on-chain — D9's dictionary logic generalises to it. |
| D18 | **Game screens must fit the viewport at 360×780 and 1440×900 with no scrolling; document screens (home, history) may scroll vertically.** | A board you interact with must be wholly visible — scrolling between grid and keyboard mid-play is a defect. A list of games is not. Specified after mis-stating it as a mobile-only rule, which hid desktop overflows in Word and Sudoku. |
| D17 | **Streaks get a one-day grace.** The backward walk starts at today if today qualifies, otherwise at yesterday; if neither qualifies the streak is 0. The compact badge is hidden below a streak of 2. | Transliterated from the reference implementation (§8.2), not inferred. Without it every user sees a zeroed streak each morning until they play. |
| D17b | **The one hub streak (gold).** A day qualifies when at least one roster game, picked or not, was finished on the day itself (any `ontime` bit in the roster mask); D17's grace applies. Shown as a gold flame on the home header (above 1); a gold day in the calendars. Mirrored to the Pocket card record as `streakAny`. A backfill never counts. *(Amended 2026-10-23: the only streak.)* | One finished game a day is the habit the hub asks for, and it is the one streak a change of selection can never break. |
| D17c | **No all-games streak; "complete" is a status.** A day is complete (blue in the calendars and the drawer, gold-strip "done" on the card) when every game in the player's *current* selection (D21) has its `played` bit, on time or later. Changing the selection re-reads every day against the new one, so a newly picked game turns days gold again: the intended "more to play" nudge. No perfect-day count, no longest all-games run, no `streakAll`. *(Amended 2026-10-23: was the crystal-blue all-games streak.)* | A streak over a selection the player can change would need a stored selection history; a status over the current selection needs nothing stored and never punishes a change. |
| D21 | **Players pick their daily games.** A selection of roster games (starter set: Word, Mini, Connections, Code; at least one always picked, no upper limit), edited on `#/customize` from the drawer, stored per D6. Picked games lead the hub in roster order; unpicked games sit under a collapsed "More games" (absent when every game is picked) and stay fully playable; any finished game moves to the Done group. The headline, the day bar, "complete" (D17c), the result's Next and "n of N", the share slots, the drawer's game list, the Pocket card's tiles and count, and the launcher beneath it count picked games only. Unpicked finishes still count for the streak (D17b). The card holds six tiles: unfinished picks first, then finished ones to fill six; with more than six unfinished, five and a **+** tile; its count is done of all picks. The launcher beneath it lists every pick. No reordering yet. | The hub grows past what anyone plays daily; the selection says what the player is asked to play, never what they may play. |
| D22 | **Daily Code (gameId 6, `#/g/code`).** A four-digit code, digits 0–9 with repeats, from a frozen seeded generator (D10, D11, D19). Each guess gets Mastermind pegs only: ● per right digit in the right place, ○ per right digit elsewhere (with multiplicity); which digits earned them is never shown. No cap (D13); `score` = guesses; a repeat is refused. | A number game that needs no content and rewards deduction, not vocabulary. Pegs over per-digit colours keep it distinct from Daily Word. |
| D23 | **Daily Angle (gameId 7, `#/g/angle`).** A drawn angle of 1°–359° (reflex angles marked the long way round), from a frozen seeded generator. Each whole-degree guess gets Angledle's hint: So close! within 5°, Hot within 15°, Warm within 30°, Cold beyond, and an arrow toward the answer. No cap, unlike Angledle's six (D13); `score` = guesses; a repeat is refused. | An estimation game: the eye gives the opener, the hints a search. A cap would be a loss state. |
| D24 | **Daily Color (gameId 8, `#/g/color`).** Five colours a day from a frozen seeded generator (hue 0–359, saturation 25–100, brightness 30–100). Each is shown for 5 seconds, then rebuilt with hue, saturation and brightness sliders (after dialed.gg). Per colour `10 × max(0, 1 − ΔE00/40)`, CIEDE2000 in CIELAB, to tenths; `score` = the total in tenths (0–500), **higher better**, bucket spec `{0, 500, 100}`. One write after the fifth colour; a reload restarts the current round's look. | A memory game with no content to curate, and the first higher-better score (D13). |
| D25 | **Daily Sound (gameId 9, `#/g/sound`).** Five tones a day from a frozen seeded generator, log-uniform 110–880 Hz. Each is played once (2 s sine, after a tap), then found by press-and-hold dragging with the tone live. Per tone `10 × max(0, 1 − ΔERB/0.5)` on the Glasberg–Moore ERB-rate scale, shown to hundredths; `score` = the total in tenths (0–500), higher better, bucket spec `{0, 500, 100}`. One write after the fifth tone. | The pitch twin of Daily Color (after dialed.gg); ERB keeps the scoring fair across low and high frequencies. |
| D20 | **`DailyScores` keeps a per-`(game_id, day)` histogram of on-time finishers.** `record` increments `bucket -> count` and `total` only for an on-time, solved record; a backfill sets `played`/`solved` as before and never enters the distribution. Buckets come from a per-game **bucket spec** `{min, max, buckets}` (1–128 buckets), set once by the owner (`setBucketSpec`) before the game ships: linear over `[min, max)`, a score below `min` in bucket 0, at or above `max` in the last; unset reads as `{1, 32, 31}` (the old Count). Specs today: guesses/attempts/mistakes `{1, 32, 31}` (exact 1–30, then 31+), seconds `{0, 1815, 121}` (15 s steps, 30 min+), points `{0, 500, 100}` (half-point steps). The contract never knows whether lower or higher is better. "Top N%" is the finisher's rank share counted from the game's better end, `(better + 1) / total`, ties in the player's favour, rounded, never below 1; a late finisher is shown where they would have ranked ("played later"). The distribution is drawn as a smooth curve over the buckets. The day percentile is the mean of the game percentiles. Rust and TS bucket identically: `shared/bucket-test-vectors.json`. *(Amended 2026-10-23: was two hard-coded kinds, Count and Seconds.)* | A public aggregate in the same transaction as the completion is verifiable rather than asserted (§8 "Opportunity"); on-time only, so the day's picture is fixed by the people who played it that day. A spec per game lets any score range and direction share one contract; buckets keep storage bounded where exact scores would grow with players. Set-once keeps every day of a game comparable. |

**Known accepted wrinkles** (document, do not solve): UTC day boundary can cost a
streak in far-east timezones; anyone can read ahead in a sealed word list; a
grinding-resistant daily selection is impossible under D1.

---

## 2. Target repo layout

```
daily-on-dot/
  AGENTS.md                  PM-authored; conventions + locked decisions for Codex
  PLAN.md                    this file
  games.md                   candidate survey
  plans/wp-*.md              per-work-package briefs (PM-authored)
  contracts/
    logic/                   host-testable pure Rust (day index, validation rules)
    scores/                  DailyScores — shared by all games
    word/                    WordRegistry — typed six-letter answer lists
    chess/                   ChessRegistry — typed FEN + solution lines
    mini/                    MiniRegistry — 5×5 grids with clues
    connections/             ConnectionsRegistry — four groups of four
                             (no sudoku or globe contract — see D10, D19)
  shared/
    day-test-vectors.json    contract⇄client parity fixtures
    wordlists/ chess/ mini/ connections/ countries/   content, validated offline
  app/
    src/
      networks.ts  deployments/  main.ts
      shared/      roster.ts prefs.ts progress.ts streaks.ts card-state.ts ui/
      games/       word/ sudoku/ chess/ globe/ mini/ connections/
    scripts/       deploy.ts seed-*.ts set-game-kinds.ts verify-*.ts validate-*.ts
  pocket/                    the Pocket card worker
  tools/                     smoke tests, Pocket assets
```

No `packages/` workspace: all games are routes in one Vite bundle, so directories
give the same separation with none of the overhead.

---

## 3. Work packages

Each WP is one `codex exec` invocation against a brief in `plans/`. A WP is done
when **every** acceptance criterion passes; partial delivery is rejected, not merged.

| WP | Title | Depends on | Size |
|----|-------|-----------|------|
| 0 | Repo skeleton + toolchain | — | S |
| 1 | `contracts/logic` + TS parity | 0 | S |
| 2 | `DailyScores` contract | 1 | M |
| 3 | `WordleRegistry` contract | 1 | M |
| 4 | `ChessRegistry` contract | 3 | M |
| 5 | Deploy + seed tooling (incl. Lichess import) | 2, 3, 4 | L |
| 6 | App shell (host, connect, routing, layout) | 0 | M |
| 7 | Home screen — today's roster | 5, 6 | M |
| 8 | History, streaks, completionist | 7 | M |
| 9 | Wordle game screen | 7 | L |
| 10 | Sudoku generator + game screen | 7 | L |
| 11 | Chess board + game screen | 7 | L |
| 12 | Publish pipeline (Bulletin + DotNS) | 9, 10, 11 | S |
| 13 | E2E suite | 9, 10, 11 | M |
| 14 | *(conditional)* extract shared registry shell | 4 | S |

### WP0 — Repo skeleton + toolchain
**Deliver:** pinned `rust-toolchain.toml`, `.cargo/config.toml`, and
`riscv64emac-unknown-none-polkavm.json` per contract crate (mirror quizzler);
`app/` Vite + TS + Vitest; root CI workflow.
**Accept:** a trivial contract compiles via `cargo pvm-contract build`;
`pnpm test` and `pnpm build` succeed on an empty app; CI green.

### WP1 — `contracts/logic` + TS parity
**Deliver:** `day_index(now_seconds) -> u32`, `index_for_day(day, start_day, count) -> u32`
(wrapping), as a `no_std` host-testable crate; identical TS in `app/src/shared/day.ts`;
`shared/day-test-vectors.json` consumed by *both* test suites.
**Accept:** `cargo test` and `pnpm test` both green against the same vectors, including
epoch boundary, pre-epoch (must reject), and wrap-around.

### WP2 — `DailyScores` contract
**Deliver:** three bitmaps per `(account, day)` — `played_bits`, `solved_bits`,
`ontime_bits` (all `u64`, one bit per game) — plus
`detail: (account, day, game_id) -> {score: u32, solved: bool}`.
Methods: `record(game_id, day, score, solved)`, `get_day(who, day)` returning all three
words, `get_days(who, from_day, count)`, `get_detail(who, day, game_id)`, `current_day()`.
**Accept:** `game_id < 64` enforced; recording a **future** day reverts; re-recording an
existing `(account, day, game_id)` reverts; `ontime_bits` is set by the contract from
`current_day()` and is never caller-supplied; `get_days` bounded to ≤64 days; a month of
calendar data — played, solved, on-time, and therefore win rate — is derivable from a
single `get_days` call with no per-day detail fetch; builds clean.

### WP3 — `WordRegistry` contract
**Deliver:** a day is **one six-letter word** (D16).
`ListMeta {creator, name, emoji, day_count, start_day, sealed}`; a day's entry is one
lowercase-ASCII word of exactly six letters.
Methods: `create_list_with_nonce`, `add_days` (up to 64 words, resumable), `seal_list`,
`get_list`, `get_lists(cursor, limit)` newest-first sealed page, `get_word(list_id, index)`,
`word_for_day(list_id, day)`.
**Accept:** a word that is not exactly six lowercase ASCII letters reverts; non-creator
or post-seal writes revert; unsealed lists never appear in `get_lists`; `word_for_day`
matches `contracts/logic` vectors; batch bound enforced; one `word_for_day` read returns
everything the client needs for the whole day (D14).

### WP4 — `ChessRegistry` contract
**Deliver:** same shell as WP3, typed to chess: `PuzzleSet {creator, name, emoji,
puzzle_count, start_day, sealed}`; a puzzle is `{fen: String, moves: String}` where
`moves` is the solution line in UCI. Methods mirror WP3, plus `puzzle_for_day`.
**Accept:** malformed FEN (wrong field count, bad rank sum) reverts; empty `moves`
reverts; non-creator or post-seal writes revert; unsealed sets never appear in
`get_sets`; `puzzle_for_day` matches `contracts/logic` vectors.
**Note:** implement by copying WP3 and specializing. Do **not** abstract yet — see WP14.

### WP5 — Deploy + seed tooling
**Deliver:** `networks.ts` (single source per network: genesis hash, RPC, storage
namespace, DotNS name, publish CLI), `deployments/<network>.json`, `deploy.ts`
(finalized inclusion before recording an address), resume-safe `seed-wordle.ts` and
`seed-chess.ts`, `import-lichess.ts` (filter the CC0 database by rating band and
theme, emit a validated puzzle set), `verify-deployment.ts`, offline
`validate:wordlists` and `validate:chess`.
**Accept:** deploy against the target network writes a deployment record only after
finalization; re-running either seed after an interrupted batch resumes without
duplicates; build fails when the target network has no deployment record; the Lichess
importer records source and licence provenance alongside its output.

### WP6 — App shell
**Deliver:** Triangle product-sdk boot, `SignerManager` product account, genesis-hash
assertion at boot, hash routing (`#/`, `#/history`, `#/g/wordle?day=N`), mobile-first
layout primitives, release-label footer.
**Accept:** app refuses to start against a chain whose genesis hash differs from the
build target; renders correctly at 360px wide and at desktop; no horizontal scroll.

### WP7 — Home screen
**Deliver:** client-side roster of all three games (`{id, name, emoji, gameId, startDay,
route}`), today's tiles with completion state from one `get_day` read, favorites-to-top
and hidden-games filtering from `localStorage`, rollover countdown.
**Accept:** home renders before any RPC completes; a game whose `startDay` is after the
viewed day shows no tile; hidden games are excluded from the tracker but reachable from
a "hidden" section; prefs survive reload; `prefs.ts` unit-tested.

### WP8 — History, streaks, completionist
*(see §8 for the UX reference this mirrors)*
**Deliver:** calendar view over a bounded `get_days` page; `streaks.ts` deriving
per-game and hub streaks from `ontime_bits` (walking backwards, stopping at first gap)
and completionist counts from `completed_bits`; navigation into a past day.
**Accept:** unit tests prove backfill **does not** repair a streak but **does** raise the
completionist count; streak read for a 5-day streak fetches ≤ a handful of days, not a year.

### WP9 — Daily Word game screen
**Deliver:** pure `engine.ts` (guess scoring incl. duplicate-letter handling), one
six-letter word with a grid that grows past six rows, on-screen keyboard, lazily loaded
guess list, **one** submission via `DailyScores.record` when the word is solved with
`score = guesses`, replay of past days read-only once recorded.
**Accept:** engine unit tests cover duplicate-letter yellow/green precedence; the word has
no loss state; the day is played from a single `word_for_day` read and produces exactly
**one** transaction (D14) — a test must fail if a second write is issued; in-progress
state persists in `localStorage` across reload and is never written on-chain (D15);
playable one-handed at 360px; a completed day cannot be re-submitted; failing to submit
on-chain does not lose local progress.

### WP10 — Sudoku generator + game screen
**Deliver:** deterministic `generate.ts` keyed on `(day, generatorVersion)` producing a
uniquely-solvable grid, a solver used to prove uniqueness at generation time, 9×9 grid
UI with number pad and pencil marks, timer, submission with `score = seconds`.
**Accept:** the same `(day, version)` yields a byte-identical grid across runs and
platforms — unit-tested against committed fixtures for a spread of days; every
generated grid is proven uniquely solvable; the generator takes no wall-clock or
RNG input beyond the day; grid is usable one-handed at 360px; `sudoku-v1` is frozen
and the version is carried in the roster entry (D11).

### WP11 — Chess board + game screen
**Deliver:** board renderer from FEN, tap-to-move (not drag-only — mobile), legal-move
generation via a bundled MIT-licensed library rather than hand-rolled, solution-line
validation against the registry's UCI moves, opponent replies auto-played, submission
with `score = attempts`.
**Accept:** move legality is delegated to the library, not reimplemented; a wrong move
is rejected without ending the puzzle unless the game's attempt rule says so; board is
playable one-handed at 360px including promotion and castling; puzzle loads from
`ChessRegistry.puzzle_for_day`.
**Note:** this is the long pole of Phase 1. Review it before WP12 starts.

### WP12 — Publish pipeline
**Deliver:** `deploy:dot` (build + Bulletin + DotNS) targeting `dailyondot.dot`.
**Accept:** published bundle loads in the Polkadot app browser and talks to the
deployed contracts. Document Bulletin's ~2-week retention and the republish cadence.

### WP13 — E2E
**Deliver:** `@parity/host-api-test-sdk` suite playing one full day of **each** game and
asserting all three completions appear on home and in history, and that the day's
completion bitmap has exactly bits 0–2 set.
**Accept:** opt-in flag required (destructive against a public testnet); isolated
contract profile; green locally.

### WP14 — *(conditional)* extract shared registry shell
**Trigger:** only after WP4 lands, and only if review finds the Wordle and Chess
registries share materially identical list/seal/batch/pagination code.
**Deliver:** that shell as a module in `contracts/logic`, with each registry keeping its
own payload type and validation.
**Accept:** both contracts still build and their existing tests pass unchanged; no
payload type becomes opaque bytes (D3 stands).
**If the duplication turns out to be superficial, close this WP as not-needed.**

---

## 4. Execution loop

Per work package:

```sh
# 1. PM writes the brief
plans/wp-3-wordle-registry.md

# 2. Hand off
codex exec --sandbox workspace-write -C path/to/daily-on-dot \
  -o /tmp/wp3-report.md "$(cat plans/wp-3-wordle-registry.md)"

# 3. PM reviews
git diff --stat && git diff
cd contracts/wordle && cargo pvm-contract build
cd app && pnpm test

# 4. Iterate in the same session if rejected
codex exec resume --last "Rejected: <specific criterion>. Fix only that."

# 5. Commit on a branch once every criterion passes
```

`AGENTS.md` at the repo root carries the locked decisions and conventions into
*every* Codex invocation, so briefs stay short and design drift is bounded.

**Rejection triggers** — send back without merging if: an acceptance criterion is
unmet; scope beyond the brief was touched; logic landed without a test that would
fail if the rule changed; a locked decision was worked around; or "done" was reported
with skipped or failing tests.

---

## 5. Phasing

- **Phase 1 (v1):** WP0–WP13. Wordle, Sudoku, and Chess, first-party content only,
  published and playable. WP14 conditionally.
- **Phase 2:** fourth game, drawn from Tier S in [`games.md`](games.md). By then the
  per-game pattern has been exercised against all three content strategies, so this
  should be near-mechanical.
- **Phase 3:** community-submitted content — the contracts already support it (any
  account may `create_list` / `create_set`), so this is a Pack-studio-style UI plus a
  **client-side blocklist and featured list**. Do not ship community submission without
  those: content is immutable, public, and rendered under our name.

Phase 1 is roughly double the original single-game scope, and two of the three game
screens (Sudoku grid, Chess board) are large on their own. WP9–WP11 are independent of
each other and can run concurrently once WP7 lands.

---

## 6. Decisions

| | |
|---|---|
| **Network** | Paseo Next v2 (Asset Hub Next), the one network in `app/src/networks.ts` |
| **DotNS name** | `dailyondot.paseo` (https://dailyondot.paseo.li). The name derives the player accounts, so it is per network. |
| **Launch roster** | Six games, see D12 and `app/src/shared/roster.ts`; players pick theirs (D21) |
| **Hub epoch** | `2026-01-01T00:00:00Z` (`1767225600`). It is only an arithmetic origin — each game's own `start_day` is what gates its tiles, so days before launch correctly render empty. |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| ABI drift breaks every read at once | `verify:deployment` gate before any app work resumes after a contract change |
| Bulletin ~2-week retention silently expires the app | Documented republish cadence in WP12; calendar reminder |
| Codex over-builds beyond a brief | Narrow briefs, `AGENTS.md` locked decisions, diff review every WP |
| Contract logic untestable on host | Keep contracts thin; all real logic in `contracts/logic` with `cargo test` |
| Community content abuse (Phase 3) | Client blocklist + featured list before submission UI ships |
| Sudoku generator change silently rewrites completed history | D11: frozen, versioned generators; WP10 pins byte-identical output with committed fixtures |
| Chess board is the Phase 1 long pole and can sink the schedule | WP11 reviewed before WP12 starts; move generation delegated to a library, never hand-rolled |
| Lichess licence/attribution mishandled | WP5 importer records source and licence provenance with its output; CC0 requires no attribution but provenance is kept anyway |
| Two near-identical registries drift apart | WP14 extraction, gated on real duplication rather than anticipated duplication |

---

## 8. UX reference — lessgames.com

Surveyed 2026-07-27. Five games (`wordless`, `songless`, `spellingbee`, `moreless`,
`clueless`), one route each. This is the closest shipping analogue to what we are
building, and the layout is the model for WP7 and WP8.

**Layout.** Home is a vertical stack of large cards on mobile that reflows to a centred
3+2 grid on desktop — literally D8. Each card is a title plus a graphical logo that
telegraphs the mechanic; there are no descriptions. Header is
`hamburger | title | archive | settings | account`.

**Sidebar.** Game list, a `JULY ACTIVITY` seven-day strip of circled dates, a live
rollover countdown, and streak-nudge copy ("Play a game to keep the streak alive!").

**Archive.** Per-game dropdown, streak badge, `PLAYED` / `WIN RATE` header, month
calendar. Legend is three states: **Played · Started · From Archive**. That maps onto our
`ontime_bits`, local in-progress state, and backfill respectively — an independent
arrival at D5's distinction. Their archive is **paywalled**; ours is inherently free,
because the content is already public on-chain.

**Architecture — the important finding.** lessgames is fully server-authoritative. Every
keystroke-complete guess is `POST api.lessgames.com/wordless/guess`
`{challengeDate, categoryId, roundIndex, guess}` → `{correct, comparison:[{letter,state}]}`.
The answer never reaches the client, which is how they solve the problem D1 says is
unsolvable for us. Signed out, nothing persists but a how-to-play timestamp; all state is
server-side, behind Google OAuth.

Two consequences, both already captured as decisions:

- Their per-guess round trip is precisely what we must **not** mirror — six guesses × six
  tiers is up to 36 writes per game per day (D14).
- `categoryId` 0–5 is the word-length tier and `roundIndex` 0–5 the guess within it. The
  tiers were tried as extra rounds and dropped (D16): one word a day.

**Worth stealing.** The rollover countdown; the activity strip; per-game sound effects
(they ship `cell_reveal`, `won`, `lost`, `keyboard_type` WAVs — cheap polish); and a
changelog served as *data* with a display window (`{version, startDate, endDate, title,
body}`) so announcements ship without a redeploy. That last one is a natural fit for a
contract read and a good demonstration of the "update without redeploying the site" thesis.

**Worth skipping.** OAuth (product accounts replace sign-in entirely), advertising, and
the archive paywall.

**Opportunity.** Their `GET /wordless/distribution` returns a global guess distribution —
a trusted server aggregate. Aggregate counters in `DailyScores`, incremented in the same
transaction as the completion, would be publicly verifiable rather than asserted, at
roughly no extra cost. Deferred to Phase 2; noted here so WP2's storage layout leaves
room for it.

**Also observed.** Songless has no archive tab at all, consistent with
[`games.md`](games.md) placing music games in Tier C on licensing grounds. Guesses like
`zzz` are accepted, so their guess validation is loose — we should still ship a real
dictionary (D9).

### 8.1 Design system (measured, not guessed)

Dark theme only. Sampled from the live pages and screenshots.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#161819` | page background |
| `--surface` | `#303436` | game cards, dividers, icon-button fill |
| `--surface-raised` | `#27282A` | secondary buttons |
| `--tile-empty` | `#1E2021` | unfilled letter tile |
| `--neutral` | `#707070` | absent letter, keyboard key |
| `--correct` | `#55B725` | right letter, right place |
| `--present` | `#DAC316` | right letter, wrong place |
| `--wrong` | `#C62121` | failure / negative bars |
| `--text` | `#ECECEC` | all foreground text |

**Type.** Three families: **Clash Display** for headings (600; 24px page title),
**DM Sans** for body and numerals (400 body 16px, 500 labels, 900 for big stats —
e.g. 34px/900), **Poppins** 500 for small accents. Substitute freely, but keep the
pairing shape: a wide geometric display face for titles, a neutral grotesque for
everything else.

**Geometry.** Letter tiles 64×64, radius 6. Keyboard keys 32×50, radius 4, 20px.
Icon buttons 36×36, fully round. Mini/preview tiles 32×32, radius 6.

**Layout.** Mobile is a single vertical stack of full-width game cards; desktop reflows
the same cards into a centred 3+2 grid with no other change — a direct demonstration of
D8. Content is centred with generous vertical whitespace; nothing is full-bleed on desktop.

**Navigation.** One flat route per game (`/wordless`), no nesting. Persistent header:
`hamburger · title · archive · settings · account`. The hamburger opens a left drawer;
archive and settings are icon buttons; there is no bottom tab bar and no in-page
back button — the header title is the only wayfinding.

**Per-game footer strip.** Every game page ends with an always-visible one-line rule
("Type a word. Tiles reveal how close you are."), plus a first-visit modal tracked in
`localStorage` as `<game>_htpLastShown`.

**Not captured.** The Settings, Results, and How-to-Play *modals* would not open under
automation — they are portal-rendered and appear to need a genuine user gesture, and the
how-to-play modal is once-per-period. Their trigger buttons and the always-visible hint
strip are recorded above; the modal bodies are not. Archive tabs for the other three games
show the same signed-out paywall as Wordless, so there was nothing further to capture there.

### 8.2 Streak behaviour (recovered from their bundle)

Their signed-out fallback lives in chunk `7866-*.js`, module `35130`, export `_`. The
signed-in path takes `streak` straight from `GET /sessions/activity`; the local
computation implements the same rule:

```js
function streak(playedDates, today) {
  const set = new Set(playedDates);
  let cursor = new Date(today + "T00:00:00");
  if (!set.has(today) && (cursor.setDate(cursor.getDate() - 1), !set.has(fmt(cursor)))) return 0;
  let n = 0;
  while (set.has(fmt(cursor))) { n++; cursor.setDate(cursor.getDate() - 1); }
  return n;
}
```

An unplayed today does **not** zero a live streak — the cursor steps back to yesterday.
Only missing yesterday *and* today returns 0. This is D17.

Two further behaviours from the same chunk:

- The compact streak badge renders `null` below 2 (`streak < 2 ? null : …`), so a streak
  of 1 shows no badge at all.
- The activity strip draws a green connector between adjacent circles only when **both**
  days were played, so runs read as one chain. Circle count is `max(10, …)`, extending
  back up to 30 days and stopping once three consecutive unplayed days have passed beyond
  the first ten. The CTA beneath it (`ACTIVITY_CTA`) is static, not conditional.

Completion is marked with a filled green circular check at the **top-right of each game
card**, repeated beside each completed game's name in the drawer list.
