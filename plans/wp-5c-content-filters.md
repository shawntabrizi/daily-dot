# WP5c — Filter generated word content (ship-blocker)

Read `AGENTS.md`, `PROGRESS.md`, and `shared/sources/README.md` first. Update `PROGRESS.md`
and commit when done.

WP5b's generator worked exactly as specified and its output is **not shippable**. That is a
brief defect, not an execution one — the selection rules were too naive.

## The problem

`shared/wordlists/core.json` currently contains 18 words from the obscenity list, including
`rape`, `incest`, `dildo`, `penis`, `pussy`, and `cock`, plus 367 stopwords like `her`,
`she`, `him`, `per`, and `non`. The frequency corpus is drawn from the open web, so this was
predictable. Every test passed; appropriateness is not something the suite encodes.

Two source lists are now staged and committed:

- `shared/sources/obscenity-en.txt` — LDNOOBW `en`, CC0, 403 entries
- `shared/sources/stopwords-en.txt` — stopwords-iso, MIT, 1,297 entries

## What to change

In `app/scripts/generate-wordlists.ts`:

1. **Answer words** must be excluded if they appear in *either* list.
2. **Guess dictionary** must be excluded if it appears in the **obscenity list only**.
   Keep stopwords accepted as guesses — telling a player that `their` is not a word is worse
   than the stopword being unusable as an answer.
3. Skip the first **150** surviving entries per length rather than 30. The top of a web
   frequency list is dense with site-furniture nouns (`links`, `hotel`, `store`, `phone`);
   starting deeper yields more general vocabulary while staying common.
4. Take **400** per length after that. Verified yield after filtering is
   505 / 1106 / 1330 / 1559 / 1466 / 1309 for lengths 3–8, so 400 fits at every length.
   If any length falls short, **stop and report** — do not pad or relax the filters.
5. Matching is case-insensitive on whole words only. Do not substring-match: `class`
   contains `ass`, and `grape` contains `rape`. A substring filter would wrongly remove
   legitimate words, so compare whole entries.

## Acceptance

1. **Zero** answer words and **zero** guess-dictionary words appear in the obscenity list.
   Add a test that loads `shared/sources/obscenity-en.txt` and asserts the intersection with
   both lists is empty. This test must fail against the current committed content.
2. **Zero** answer words appear in the stopword list; a test asserts it. Guesses are exempt,
   and a test asserts a known stopword (`their`) is still an accepted guess.
3. A test asserts `grape` and `class` survive — proving whole-word not substring matching.
4. Still 400 ladders, six words of lengths 3–8 in order; validators pass.
5. Every answer is still an accepted guess (existing test keeps passing).
6. Generator remains deterministic — rerun byte-identical. Prove it.
7. `pnpm test && pnpm build` green; report the bundle-size change.
8. Report **20 sample ladders verbatim** again for spot-checking.

## Out of scope

Chess content is unaffected — leave `shared/chess/` alone. No app or contract changes beyond
the regenerated `dictionary.ts`.

## Report back

Counts removed by each filter, the verbatim samples, bundle size, and anything you could not
complete. Do not claim success for skipped work.
