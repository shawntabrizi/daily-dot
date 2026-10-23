# WP23 — One consolidated proper-noun audit across all answer pools

Read `AGENTS.md`, `PROGRESS.md`, and `shared/sources/README.md` first. Update `PROGRESS.md` and
commit when done.

## Why this exists

Proper nouns in the answer pools have now surfaced **five times**, each through a game that
samples the pool differently:

| Found via | Shape of the problem |
|---|---|
| Wordle 3-letter tier | `dod` — a web abbreviation that web2 also lists as an archaic verb |
| Wordle answers | obscene words from the web frequency corpus |
| Wordle answers | months, places, brands (`canada`, `august`, `yahoo`) |
| Waffle | pool-*tail* names, because its constraint search reaches deep (`kerry`, `clark`) |
| Word Search | 6–8 letter names, because WP19's fixes were 5-letter-focused (`hastings`) |

Reacting per game guarantees a sixth. Do this **once, across every pool**, so the next game
inherits clean content instead of finding a new corner.

## The candidates

PM audit of `answerPoolForLength(4..8)` against a 5k given-name list, restricted to entries past
frequency rank 6000 (real words rank high, so depth is the signal):

```
len 4 (47): dale glen chad ruth deny emma beth lucy kyle gale jade lily …
len 5 (40): honey sandy perry sunny olive coral fancy bride randy berry penny ivory …
len 6 (22): easter geneva marina aurora velvet willow myrtle ginger garnet laurel willie melody …
len 7 (8):  heather harmony garland scarlet jasmine alameda colleen abigail
len 8 (8):  florence sunshine sapphire caroline patience fidelity cinnamon rosemary
```

Plus `hastings`, found live in Word Search day 0.

**Most of these must stay.** `dale`, `glen`, `gale`, `jade`, `lily`, `honey`, `olive`, `coral`,
`berry`, `penny`, `ivory`, `willow`, `ginger`, `laurel`, `cinnamon`, `rosemary`, `harmony`,
`patience`, `fidelity` are ordinary English words — flowers, gems, virtues, landforms — that
merely happen to be names. Removing them would degrade the content, exactly as a surname filter
would have (measured in WP19: 21% false positives).

**Review each candidate individually** and exclude only entries a player would reject as "that's
a name, not a word": personal names with no common-word meaning (`abigail`, `caroline`,
`colleen`, `emma`, `lucy`, `kyle`, `chad`, `beth`, `willie`), and place names (`geneva`,
`florence`, `alameda`, `hastings`).

Where a word is genuinely ambiguous, **keep it** — a slightly odd answer is a smaller harm than a
thinner pool. State your reasoning for any judgement call you found difficult.

Add what you exclude to `shared/sources/exclusions-en.txt` under a heading noting this was a
consolidated audit, and record in `shared/sources/README.md` that the pools have been audited
once across all lengths so future games need not re-derive it.

## Then regenerate

- Wordle answer list and guess dictionary.
- Waffle grids and Word Search grids, plus their fixtures.
- **Report the diff summary for `shared/wordlists/core.json`** — how many ladders changed and
  from which day. The PM will reseed once, after this lands.

## Acceptance

1. `pnpm test && pnpm build` green; report the count and the slowest test duration — no test
   within 20% of its timeout.
2. Zero answers, Waffle words, or Word Search words in the obscenity, stopword, or exclusion
   lists, across all 365 days (tests).
3. Word Search grids still contain no obscenity run in any of 8 directions, any day.
4. Waffle still yields six distinct pool words with nine agreeing intersections, every day, still
   solvable within 15 swaps.
5. All regenerated fixtures committed and reported verbatim.
6. Explicit statement: how many Wordle ladders changed and from which day.
7. No regression: the nine game screens still fit 360×780 and 1440×900.

## Out of scope

Reseeding or redeploying — the PM does that once after this. Game 10. Publishing.

## Report back

The exclusions you added **and the candidates you deliberately kept, with reasoning**, the
regenerated fixtures, the Wordle diff summary, and the slowest test duration. Do not claim
success for skipped work.
