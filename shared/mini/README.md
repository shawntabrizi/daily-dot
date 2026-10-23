# Daily Mini content

Authored content for Daily Mini (`gameId` 10): 400 themeless 5×5 crosswords,
one per day, generated from an owned word pool and clued by hand. Nothing is
imported from a published puzzle.

## Files

| File | What | How it is made |
|---|---|---|
| `pool.source.json` | The answer pool: `{ "3": [...], "4": [...], "5": [...] }`, uppercase, frequency order | `pnpm generate:mini-pool -- <path to enable1.txt>` |
| `exclusions.txt` | Hand-reviewed words dropped from the pool | by hand |
| `extra-words.txt` | Hand-authored common words the frequency list lacks | by hand |
| `clues.source.json` | `{ "ANSWER": "clue" }`, one clue per distinct answer | by hand |
| `core.json` | The puzzle set that is seeded on chain | `pnpm generate:mini` |

`pnpm validate:mini` checks `core.json` (and `fixtures/`); `pnpm seed:mini` seeds
`core.json`. The `*.source.json` files are authoring inputs: the validator and the
seed skip them.

## Word list source and licence

- **ENABLE** (Enhanced North American Benchmark Lexicon), 172,823 words,
  **public domain**. Fetched 2026-10-21 from the mirror
  <https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt>,
  sha256 `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`.
  Not committed (1.7 MB); the pool script takes its path. It is the
  "real word" signal: it has no abbreviations, names or phrases.
- **google-20k-english** (`shared/sources/google-20k-english.txt`, MIT) is the
  frequency signal, as for every other word game here.
- `shared/sources/obscenity-en.txt` (CC0) and `exclusions-en.txt` (ours) are
  applied as for the Word game. Stopwords are **not** removed: ARE, ITS and
  ONE are the glue of every crossword.

The pool is `frequency-ranked ∩ ENABLE`, 3–5 letters, A–Z only, minus the
obscenity list, the shared exclusions and `exclusions.txt`, plus
`extra-words.txt` (every extra must also be in ENABLE). Sizes on 2026-10-21:
456 / 1,369 / 2,261 words for 3 / 4 / 5 letters.

Considered and rejected: `nzfeng/crossword-dataset` (GPL-3.0: copyleft, a poor
fit for content we distribute) and 12dicts (public domain, but the SourceForge
download was unreachable from the build environment; ENABLE is its ancestor
and carries the same terms).

## Grid rules (Shawn's spec, 2026-10-21)

Themeless 5×5 like the NYT Mini. 2–5 black squares. Every run of white
squares is at least three long, so there are **no two-letter entries** and
every white square is checked both ways. Under those two rules a 5×5 always
has exactly five across and five down entries: the "10 to 12 entries" range
in the spec collapses to ten, because an interior black square would split a
row into runs shorter than three. Eleven layouts are used (`MINI_LAYOUTS` in
`app/scripts/generate-mini.ts`).

Content rules enforced by the generator and re-checked by the validator:

- an answer never recurs within any **120-day** window;
- an answer appears at most **4 times** in the 400 days (so at most four
  times a year, each at least four months apart);
- no answer twice in one grid;
- the clue for an answer is the same wherever it recurs;
- a clue is 1–50 characters, no control characters, and never contains its
  answer (as a word, or as a substring for answers of four letters or more).

## `core.json` shape

```json
{
  "name": "Daily Mini core",
  "emoji": "🔠",
  "startDay": 0,
  "puzzles": [
    { "grid": "#GET#HEARTANGERDELAY#SET#", "across": ["Obtain", "..."], "down": ["..."] }
  ]
}
```

`grid` is 25 characters, rows top to bottom, `#` for a black square. Numbers,
entries and answers are derived from the grid by `app/src/games/mini/grid.ts`
(reading order; a square is numbered when it starts an across or a down run).
`across` and `down` list the clues in that numbering order. This is exactly
what the MiniRegistry contract stores and what `puzzleForDay` returns.

## Regenerating

The generator is seeded (`MINI_SEED`) and pure: a rerun is byte-identical.
Changing the pool, the exclusions or the seed changes every grid from the
first affected day, so before first public play `core.json` may be rebuilt
freely; after that a change must ship as a new set (D11 by analogy).
