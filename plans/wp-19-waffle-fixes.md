# WP19 (revised) — Waffle flaky test and pool-tail proper nouns

Read `AGENTS.md` and `PROGRESS.md` first. Update `PROGRESS.md` and commit when done.

You were right to stop on both points. Two corrections from the PM:

**D11 has been clarified**, not waived: generators are frozen **from first public play, not
first commit**. Waffle has never been played — nothing is recorded on-chain for `gameId` 6 and
the app is unpublished — so rewriting `v1` in place is authorised here. Re-read D11 in
`AGENTS.md`.

**My earlier claim was wrong.** I said the shipped Wordle answers contained none of these
proper nouns; you found `kelly` at day 234 and `clark` at day 299, and I have verified both.
So the Wordle answer list **will** change, and that is expected and accepted. Report it; the
PM will handle the redeploy and reseed.

## 1. The exhaustive test is flaky

"fills every first-year grid with six distinct filtered-pool words" takes **5081ms against
vitest's 5000ms default** — it passed for you and failed for the PM. Fix the *test*, not the
algorithm: give it an explicit generous timeout, or memoise the year as Nerdle does. State
which. A test whose result depends on machine speed is worse than a slow test.

## 2. Proper nouns in the pool tail

Waffle's search draws from the whole 1,323-word 5-letter pool, so it reaches the tail where
proper nouns live. Its 873 distinct words across the year include:

```
kerry  kelly  chang  tammy  brett  julio  blair  clark  terry  molly  morse  satan
```

Day 0 is `spank / liter / dirty / solid / altar / kerry`.

Add the genuinely-proper-noun entries to `shared/sources/exclusions-en.txt` in its existing
commented style, under a heading noting that Waffle surfaced them. Review the full 873-word set
and add any further clear personal names, place names, or brands. `satan` goes too, on
appropriateness grounds.

**Do not use a surname list as a filter.** Measured: 21% of Waffle words and 13% of Wordle
answers appear in a 20k surname list, because `nurse`, `olive`, `eagle`, `friend`, `market`,
and `price` are all somebody's surname. It would gut the content.

Then regenerate Waffle grids, the Wordle answer list, and the guess dictionary.

## Acceptance

1. `pnpm test && pnpm build` green with **no test within 20% of its timeout**; report the count
   and the slowest test duration.
2. Zero Waffle words across days 0–364 in the obscenity, stopword, or exclusion lists.
3. All six words per day still in the pool; all nine intersections agree; every day.
4. Every scramble still solvable within 15 swaps.
5. New fixtures for days 0, 1, 100, 208, 364 — Waffle **and** Wordle — reported verbatim.
6. Report the diff summary for `shared/wordlists/core.json`: how many ladders changed, and
   which days. The PM needs this to size the reseed.
7. No regression: the seven game screens still fit 360×780 and 1440×900.

## Out of scope

Redeploying or reseeding. Other games' logic.

## Report back

Timeout approach, exclusions added, new fixtures, the Wordle diff summary, and the slowest test
duration. Do not claim success for skipped work.
