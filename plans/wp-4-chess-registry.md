# WP4 — `ChessRegistry`, plus fixing the `view`-mislabelling footgun

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

Two parts. Do part 1 first — it changes the shape part 2 should copy.

---

## Part 1 — remove the `view`-mislabelled creator (correctness)

WP3 documented that the pinned ABI generator labels every return-valued function `view`,
including the state-writing `createList`, and left it as a client-side caveat. That is not
good enough: a client that honours `stateMutability` will `eth_call` `createList`, get a
plausible id back, write nothing, and fail silently much later.

**Quizzler already solved this.** See `../quizzler/contracts/registry/src/registry.rs`:

```rust
pub fn create_pack_with_nonce(title: String, emoji: String, creation_nonce: u64)  // returns ()
pub fn get_pack_for_creation(who: pvm::Address, creation_nonce: u64) -> u32       // resolves it
```

The creator returns nothing, so it is correctly `nonpayable`; a caller-chosen nonce plus a
lookup resolves the new id, and it stays idempotent across retries and duplicate tabs.

Adopt that pattern in `contracts/wordle`: replace `createList` with
`create_list_with_nonce(name, emoji, start_day, creation_nonce)` returning `()`, plus
`get_list_for_creation(who, creation_nonce) -> u32` returning `u32::MAX` when unused.

**Acceptance for part 1:** no function in either registry ABI is labelled `view` while
writing storage. Verify by listing every ABI entry and its `stateMutability`, and confirm
each `view` function is genuinely read-only by inspection. Say so explicitly in your report.

---

## Part 2 — `ChessRegistry`

Create `contracts/chess/`, structurally mirroring `contracts/wordle/` — copy and specialise
rather than abstracting (D3; WP14 handles extraction later *if* the duplication proves real).

```
SetMeta { creator: [u8;20], name: String, emoji: String,
          puzzle_count: u32, start_day: u32, sealed: bool }
Puzzle  { fen: String, moves: String }   // moves = solution line in UCI, space-separated
```

Methods, matching part 1's shape:

- `create_set_with_nonce(name, emoji, start_day, creation_nonce)` → `()`
- `get_set_for_creation(who, creation_nonce) -> u32`
- `add_puzzles(set_id, puzzles: Vec<PuzzleInput>)` — bounded resumable batch
- `seal_set(set_id)`
- `get_set(set_id) -> SetView`
- `get_sets(cursor, limit) -> SetPage` — newest-first, sealed only, bounded
- `get_puzzle(set_id, index) -> PuzzleView`
- `puzzle_for_day(set_id, day) -> PuzzleView` — via `logic::index_for_day`

### Rules (host-test in `contracts/logic` where possible)

1. Malformed FEN reverts. Validate structurally: six space-separated fields; the board
   field has 8 ranks separated by `/`; each rank sums to exactly 8 squares; side-to-move is
   `w` or `b`. Do not attempt full legality — structural validation only, and say so.
2. Empty or non-UCI `moves` reverts. A UCI move is 4 chars, or 5 with a promotion piece.
3. Non-creator writes revert; post-seal writes revert.
4. Unsealed sets never appear in `get_sets`.
5. `puzzle_for_day` matches `logic::index_for_day`, including wrap-around; a `start_day` in
   the future reverts (match Wordle's `BeforeListStart` behaviour).
6. Batch and page bounds revert when exceeded.
7. One `puzzle_for_day` call returns everything needed for the day (D14).

## Acceptance

1. `cd contracts/logic && cargo test` green, including FEN and UCI validation tests.
2. `contracts/chess`, `contracts/wordle`, and `contracts/scores` all build; report sizes.
3. Both registries' ABIs listed with `stateMutability`, and no writing function marked `view`.
4. `cd app && pnpm test && pnpm build` still green (45) — do not touch `app/src`.
5. Every rule host-tested, or named in your report with the reason it cannot be.

## Out of scope

Deployment, seeding real content, the Lichess import, app wiring. Those are WP5+.

## Report back

What you built, binary sizes, the full ABI mutability audit, which rules are tested versus
inspected, and anything you could not complete. Do not claim success for skipped work.
