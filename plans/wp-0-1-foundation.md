# WP0 + WP1 — Contract toolchain and day-index parity

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` when done.

Mirror `../quizzler` for all PolkaVM setup — it is a working reference on this machine.
`cargo-pvm-contract` is installed and nightly toolchains are available.

## WP0 — skeleton

Create `contracts/` with the crate scaffolding quizzler uses:

- `rust-toolchain.toml` (nightly), `.cargo/config.toml` (build-std, `RUSTC_BOOTSTRAP`,
  json-target-spec), and `riscv64emac-unknown-none-polkavm.json` per contract crate.
- `Cargo.toml` matching quizzler's dependency set (`pvm_contract` from the
  `charles/cdm-integration` branch, `pallet-revive-uapi`, `parity-scale-codec`,
  `alloy-core`, `picoalloc`, `polkavm-derive`) and its release profile.
- A root CI workflow running `cargo test` for `contracts/logic` and `pnpm test`/`pnpm build`
  for `app`.

## WP1 — `contracts/logic` + TS parity

A `no_std`, host-testable crate holding the only arithmetic the contract and the client
must agree on:

```rust
day_index(now_seconds: u64) -> u32      // (now - EPOCH) / 86400, EPOCH = 1767225600
index_for_day(day: u32, start_day: u32, count: u32) -> u32   // wrapping content selection
```

- `day_index` must **reject** pre-epoch input rather than wrapping or saturating. Choose
  `Option`/`Result` and state which.
- `index_for_day` wraps when a series is shorter than the day range; `count == 0` is an error.

Mirror both exactly in `app/src/shared/day.ts`. The existing `day.ts` already has day-index
logic — reconcile rather than duplicate, and keep its current tests passing.

Create `shared/day-test-vectors.json` consumed by **both** suites, covering: epoch exactly,
one second before epoch (rejected), one second after, a day boundary either side, a large
far-future day, wrap-around where `day - start_day >= count`, `start_day` in the future,
and `count == 1`.

## Acceptance

1. `cd contracts/logic && cargo test` green.
2. At least one contract crate builds: `cargo pvm-contract build` succeeds. If the pinned
   toolchain needs a specific nightly, pin it in `rust-toolchain.toml` and say which.
3. `cd app && pnpm test && pnpm build` green, existing 34 tests still passing.
4. **Both** suites read `shared/day-test-vectors.json` — not two hand-maintained copies.
   The Rust and TS tests must iterate the same file.
5. A deliberately wrong vector added by hand would fail **both** suites. Demonstrate this
   in your report by describing the check, not by leaving a broken vector committed.
6. Pre-epoch input is rejected in both implementations, with a test each.

## Out of scope

`DailyScores` and the game registries (WP2–WP4). Do not touch `app/src` beyond `day.ts`
and its tests. Do not wire the app to any contract yet.

## Report back

What you built, the exact nightly pinned, whether `cargo pvm-contract build` succeeded, and
anything you could not complete. Do not claim success for skipped work.
