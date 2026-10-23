# WP3 — `WordleRegistry` contract

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Create `contracts/wordle/`, mirroring the structure and idiom of `contracts/scores/` and
`../quizzler/contracts/registry/src/registry.rs`. Keep the contract thin: rules with real
logic go in `contracts/logic` where `cargo test` reaches them — that split is what gave
WP2 its coverage, so repeat it.

## Content model (D16)

A day is a **six-word ladder** of lengths 3, 4, 5, 6, 7, 8 in that order.

```
ListMeta { creator: [u8;20], name: String, emoji: String,
           day_count: u32, start_day: u32, sealed: bool }
```

Words are lowercase ASCII, stored per `(list_id, day_index, tier)`.

## Methods

- `create_list(name, emoji, start_day) -> u32`
- `add_days(list_id, ladders: Vec<Ladder>)` — bounded resumable batch; a `Ladder` is six
  words. Pick a batch bound that keeps one call comfortably sized and state it.
- `seal_list(list_id)`
- `get_list(list_id) -> ListView`
- `get_lists(cursor, limit) -> ListPage` — newest-first, **sealed only**, bounded
- `get_ladder(list_id, index) -> Vec<String>`
- `ladder_for_day(list_id, day) -> Vec<String>` — uses `logic::index_for_day` for wrapping.
  Do not reimplement that arithmetic.

## Rules (each needs a test in `contracts/logic` where possible)

1. A ladder whose word lengths are not exactly 3,4,5,6,7,8 in order reverts.
2. Any non-lowercase-ASCII character in a word reverts.
3. Writes by a non-creator revert; writes after sealing revert.
4. Unsealed lists never appear in `get_lists`.
5. `ladder_for_day` matches `logic::index_for_day`, including wrap-around and a
   `start_day` in the future (which must revert or return empty — pick one and say which).
6. `get_lists` beyond its bound reverts.
7. **One `ladder_for_day` call returns everything the client needs for the whole day** —
   this is what makes D14's single-read-per-day possible. No per-tier fetches.

## Acceptance

1. `cd contracts/logic && cargo test` green, including new ladder-validation tests.
2. `cd contracts/wordle && cargo pvm-contract build` succeeds; report binary size.
3. The ABI contains all seven methods with expected signatures.
4. `cd app && pnpm test && pnpm build` still green (45) — do not touch `app/src`.
5. Every rule has a host test, or your report names the rule and says why it cannot be
   host-tested.
6. `contracts/scores` still builds — you changed shared `logic`, so prove it.

## Out of scope

`ChessRegistry`, deployment, seeding real word lists, wiring the app. Content comes in WP5.

## Report back

What you built, the binary size, which rules are tested versus inspected only, and anything
you could not complete. Do not claim success for skipped work.
