# WP5b — Generate real game content

Read `AGENTS.md`, `PROGRESS.md`, and `shared/sources/README.md` first. Update `PROGRESS.md`
and commit when done.

Both sources are staged. **Do not invent content.** Every word and puzzle must come from a
source file, and the generators must be deterministic — rerunning produces byte-identical
output.

---

## Part 1 — Wordle ladders

Generator: `app/scripts/generate-wordlists.ts`, writing `shared/wordlists/core.json`.

Two signals, per `shared/sources/README.md`:

- **Frequency** — `shared/sources/google-20k-english.txt`, rank-ordered.
- **Legitimacy** — `/usr/share/dict/words` (web2). Intersect to drop abbreviations,
  proper nouns, and modern coinages.

Selection rules:

1. Lowercase `[a-z]+` only; must appear in both sources.
2. **Skip the highest-frequency band** — the top 30 entries at each length are function
   words (`the`, `and`, `for`, `you`, `not`, `are`) and make dull answers. Take the next
   **400** per length, in frequency order.
3. Emit **400 ladders**, ladder *i* taking the *i*th word of each length 3–8. That is
   ≥1 year with headroom (definition of done, item 1).
4. If any length yields fewer than 400 after filtering, **stop and report** rather than
   padding or reaching deeper into the obscure tail.

Also **replace the bundled guess dictionary** (`app/src/games/wordle/dictionary.ts`), which
currently accepts `rss`, `dvd`, `faq` and rejects legitimate words. Regenerate it from the
same intersection but with a *wider* band — a guess list should be permissive (accept any
reasonable word) while the answer list stays common. Keep the shipped size sane and say what
you chose. Every answer must be accepted as a guess; add a test asserting that.

## Part 2 — Chess puzzles

Generator: `app/scripts/import-lichess.ts`, writing `shared/chess/core.json`.

Input path via `--input` or `LICHESS_DB`; a local copy is at
`/private/tmp/claude-501/-Users-shawntabrizi-Documents-GitHub-daily-on-dot/a18b2011-1bfd-4892-8230-c617f69b0ae3/scratchpad/lichess_puzzles.csv.zst`
(zstd; `zstd` is on PATH). **Never commit the database** — add it to `.gitignore` if needed.

CSV columns: `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags`.

Selection rules:

1. Rating band **1200–1800** — approachable but not trivial for a daily puzzle.
2. `Popularity >= 80` and `NbPlays >= 500`, so puzzles are human-validated as good.
3. Solution length **≤ 4 plies** (2 player moves), keeping a daily puzzle short.
4. Deterministic: sort candidates by `PuzzleId` and take the first **400**. No RNG.
5. Emit `{ fen, moves }` where `moves` is the space-separated UCI line. Preserve `PuzzleId`
   and `GameUrl` in a sibling provenance file, not in the on-chain content.
6. Report the rating distribution of what you selected.

Note the FEN in this database is the position **before** the opponent's first move, and
`Moves[0]` is that move. Handle this explicitly — decide whether to store the pre-move FEN
plus the full line, or advance the FEN by one ply and store the remainder. State which, and
make sure it is consistent with what a board renderer will expect in WP11.

## Acceptance

1. `pnpm validate:wordlists` and `pnpm validate:chess` pass over the generated files.
2. `shared/wordlists/core.json` has 400 ladders, each six words of lengths 3–8 in order.
3. `shared/chess/core.json` has 400 puzzles, each a structurally valid FEN and UCI line.
4. Both generators are deterministic — rerunning yields byte-identical files. Prove it.
5. Every answer word is accepted by the regenerated guess dictionary (test).
6. `pnpm test && pnpm build` green; report the new bundle size, since the guess dictionary
   grew.
7. The Lichess database is **not** committed; `git status` is clean after generating.
8. Your report includes **20 sample ladders and 5 sample puzzles verbatim** so a human can
   spot-check quality.

## Report back

Selection counts, rating distribution, bundle-size change, the FEN-convention decision, the
verbatim samples, and anything you could not complete. Do not claim success for skipped work.
