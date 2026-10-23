# WP5d — Regenerate word content with all filters (retry of WP5c)

Read `AGENTS.md`, `PROGRESS.md`, and `shared/sources/README.md` first. Update `PROGRESS.md`
and commit when done.

WP5c correctly refused to proceed: my rule was arithmetically impossible (skip 150 + take 400
needs 550 three-letter words; only 505 existed). That was a brief defect. Rules are corrected
below and verified against the sources.

## Filters — all four, whole-word and case-insensitive

**Never substring-match.** `grape` contains `rape`; `class` contains `ass`.

| Source | Applies to |
|---|---|
| `shared/sources/google-20k-english.txt` | frequency ranking (the input order) |
| `/usr/share/dict/words` (web2) | must be present — real-word filter |
| `shared/sources/obscenity-en.txt` | excluded from answers **and** guesses |
| `shared/sources/stopwords-en.txt` | excluded from answers only |
| `shared/sources/exclusions-en.txt` | excluded from answers only. Comment lines start `#`; entries are whitespace-separated |

## Selection

1. Build each length's pool in frequency order after the filters above.
2. **No skip.** Take the top **365** per length — exactly one year. Verified clean pools are
   446 / 1067 / 1295 / 1525 / 1452 / 1295 for lengths 3–8, so 365 fits everywhere.
3. Ladder *i* takes the *i*th word of each length. 365 ladders.
4. If any length yields under 365, **stop and report** — do not pad or relax filters.
5. Guess dictionary: the full frequency ∩ web2 set minus obscenity. Permissive by design.

## Residual curation

The 3-letter tier is thin, so its tail still holds non-words. Inspect the last 40 selected
words at **every** length. If any is an abbreviation, fragment, proper noun, or otherwise not
a word a player would accept, **append it to `shared/sources/exclusions-en.txt`** with a
brief comment and regenerate. Repeat until every selected word is defensible. Report what
you added.

## Acceptance

1. Tests asserting the intersection of answers with obscenity, stopwords, and exclusions is
   **empty** — each must fail against the WP5b content still committed.
2. Test asserting `grape` and `class` survive (whole-word matching).
3. Test asserting a stopword (`their`) is still an accepted **guess**.
4. Every answer is an accepted guess (existing test).
5. 365 ladders, six words of lengths 3–8 in order; both validators pass.
6. Deterministic — rerun byte-identical. Prove it.
7. `pnpm test && pnpm build` green; report bundle size.
8. Report the **last 20 selected words at each length** verbatim, plus 20 sample ladders.
   The tails are what reveal quality problems; the heads always look fine.

## Out of scope

Chess content. No contract or app changes beyond the regenerated `dictionary.ts`.

## Report back

Per-filter removal counts, exclusions you added, verbatim tails and samples, bundle size, and
anything incomplete. Do not claim success for skipped work.
