# WP2 — `DailyScores` contract

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

`contracts/scores/` already exists as a 25-line smoke contract that builds. Grow it into
the real thing. Mirror `../quizzler/contracts/registry/src/registry.rs` for idiom:
`#[pvm::storage]`, `#[pvm::contract]`, `#[pvm::method]`, `fail(&str)` for reverts,
`caller20()`, bounded view batches.

## Storage

Three `u64` bitmaps per `(account, day)` — one bit per game, `gameId < 64` (D5) — plus a
detail record:

```
played_bits:  Mapping<([u8;20], u32), u64>   // finished a session, win or loss
solved_bits:  Mapping<([u8;20], u32), u64>   // won
ontime_bits:  Mapping<([u8;20], u32), u64>   // played it on the day itself
detail:       Mapping<([u8;20], u32, u8), Detail>   // { score: u32, solved: bool }
```

## Methods

- `record(game_id: u8, day: u32, score: u32, solved: bool)`
- `current_day() -> u32` — from `pvm::api::now()` (block timestamp, **seconds**), using
  `contracts/logic`'s `day_index`. Do not reimplement the arithmetic.
- `get_day(who, day) -> DayBits { played, solved, ontime }`
- `get_days(who, from_day, count) -> Vec<DayBits>` — bounded, `count <= 64`
- `get_detail(who, day, game_id) -> DetailView`

## Rules (each needs a test)

1. `game_id >= 64` reverts.
2. `day > current_day()` reverts — no recording a future day.
3. Re-recording an existing `(account, day, game_id)` reverts.
4. `ontime_bits` is set by the **contract**, from `day == current_day()`. It is never a
   caller argument. This is the whole integrity story for streaks — a caller must not be
   able to claim an on-time play for a backfilled day.
5. `get_days` with `count > 64` reverts.
6. A month of calendar data — played, solved, on-time, and therefore win rate — is
   derivable from one `get_days` call with no per-day detail fetch.

## Testing

Contract methods are hard to unit-test on the host. Follow quizzler: keep the contract
thin and put anything with real logic into `contracts/logic` where `cargo test` reaches it.
At minimum, add pure helpers in `contracts/logic` for bit set/read over a `u64` bitmap and
test them there, including bits 53–63 (the client had a 53-bit bug — the contract must not
repeat it) and out-of-range rejection.

Also extend `shared/day-test-vectors.json` if you add any arithmetic the client mirrors.

## Acceptance

1. `cd contracts/logic && cargo test` green, including new bitmap helpers covering bits
   53–63 and out-of-range rejection.
2. `cd contracts/scores && cargo pvm-contract build` succeeds; report the binary size.
3. The generated ABI contains all five methods with the expected signatures.
4. `cd app && pnpm test && pnpm build` still green (45 tests) — do not touch `app/src`.
5. `ontime` cannot be supplied by a caller anywhere in the ABI.
6. Every rule above has a corresponding test or, where host-testing is impossible, an
   explicit note in your report saying which rule is untested and why.

## Out of scope

`WordleRegistry`, `ChessRegistry`, deployment, and wiring the app. The app keeps using its
stub `DataSource` for now.

## Report back

What you built, the contract binary size, which rules are covered by tests versus only by
inspection, and anything you could not complete. Do not claim success for skipped work.
