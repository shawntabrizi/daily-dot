# WP6 — Wordle becomes a five-tier 4→8 ladder

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

**D16 has been amended by the PM.** The ladder is now **five tiers, lengths 4–8**, six
guesses per tier, `score` = tiers solved (0–5). The 3-letter tier is removed.

Why, so you do not reintroduce it: filling 365 three-letter answers requires reaching
frequency rank 17,111, against ~5,900 for every other length, and drags in abbreviations
that web2 also lists as archaic words (`dod`, `foo`, `sig`, `dow`) which no filter can
separate. Today's live puzzle had `dod` as its answer. English does not contain 365 common
non-stopword three-letter words.

Change every layer. This is a cross-cutting change, so work outward from the contract.

## 1. Contract — `contracts/wordle`

Ladder validation accepts exactly five words of lengths 4,5,6,7,8 in order. Update the
host tests in `contracts/logic` accordingly, including a test that a 3→8 six-word ladder
now **reverts**.

## 2. Content — `app/scripts/generate-wordlists.ts`

Emit 365 five-word ladders. All other filters and the no-skip top-365 rule are unchanged;
just drop length 3. Verified clean pools: 1062 / 1294 / 1524 / 1450 / 1294 for lengths 4–8,
so 365 fits with the 365th word at frequency rank ≤5,900 everywhere.

Regenerate the guess dictionary without length 3 as well.

## 3. App

- `engine.ts` / `session.ts`: five tiers, `activeTier` 0–4, complete at tier 5,
  `score` = tiers solved 0–5.
- `view.ts`: tier indicator shows five pips labelled 4–8; "TIER n OF 5"; the resolved-state
  "Next: N letters" copy follows.
- Ladder summary shows "n OF 5 SOLVED".
- The stub `DataSource.wordleLadder` returns five words; update its fixture ladders.

Update every affected test rather than deleting it. In particular the existing
`session.test.ts` cases assert six tiers and completion at `activeTier === 5`; they must now
assert five tiers and completion at `activeTier === 4`.

## 4. Validators

`validate-wordlists.ts` requires five words of lengths 4–8.

## Acceptance

1. `cd contracts/logic && cargo test` green, including the new "six-word ladder reverts" test.
2. `cd contracts/wordle && cargo pvm-contract build` succeeds; `contracts/scores` and
   `contracts/chess` still build.
3. `shared/wordlists/core.json` has 365 ladders, each five words of lengths 4–8 in order.
   `pnpm validate:wordlists` passes.
4. Generator deterministic — rerun byte-identical. Prove it.
5. Answers contain zero obscenity / stopword / exclusion entries (existing tests).
6. Every answer accepted as a guess (existing test).
7. `pnpm test && pnpm build` green. Report the test count and bundle size.
8. Report the **last 15 words at each of the five lengths**, plus 10 sample ladders.
9. A full ladder is completable and still issues exactly **one** `record` call — the
   single-write test must pass unchanged in meaning.

## Out of scope

Do **not** deploy or seed — the PM will redeploy `WordleRegistry` and reseed, because the
live list is sealed and its validation is baked in. Do not touch chess content or the
chess/scores contracts beyond confirming they still build.

## Report back

What you changed per layer, the verbatim tails and samples, test count, bundle size, and
anything incomplete. Do not claim success for skipped work.
