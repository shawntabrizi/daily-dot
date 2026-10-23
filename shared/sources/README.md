# Content sources

Raw inputs for generated game content. Committed so every generated list is reproducible
and its provenance auditable — the generators here are deterministic, so a regenerated
file should be byte-identical.

## `wordfreq-en-six.txt`

Every six-letter `[a-z]` word with a wordfreq Zipf frequency ≥ 3.0, one `word<TAB>zipf`
per line, ranked. Exported from wordfreq 3.1.1 (<https://github.com/rspeer/wordfreq>;
code Apache-2.0, data **CC BY-SA 4.0**, which credits SUBTLEX, Google Books Ngrams and
other corpora) with the command in the file header, so the TypeScript generator needs no
Python. The file and the answer list derived from it are CC BY-SA 4.0 data and keep the
attribution in the header.

Daily Word's **frequency signal**: `app/scripts/generate-wordlists.ts` keeps Zipf ≥ 4.0
(about one use per 100,000 words), 1,175 candidates.

## `scowl-60-us.txt` and `scowl-70-us.txt`

SCOWL (Spell Checker Oriented Word Lists) / English Speller Database by Kevin Atkinson,
sizes 60 and 70, US spelling, variant level 1, generated at <https://app.aspell.net/create>
(ESDB git `1e5b7d3`, 2026-06-24). Licence (MIT-like, kept in each file's header):
"Permission to use, copy, modify, distribute, and sell any part of the English Speller
Database (ESDB, previously known as SCOWLv2), or word lists created from it, is hereby
granted without fee, provided that the above copyright notice appears in all copies and
that both the above copyright notice and this notice appear in supporting documentation."
Copyright 2000-2026 by Kevin Atkinson. <http://wordlist.aspell.net/scowl-readme/>

Daily Word's **dictionary signal**: an answer must appear lowercase in size 60
(`^[a-z]{6}$` drops the capitalised proper nouns and the possessives; the US list drops
`colour` and `centre`). Size 70 widens the guess list (`scripts/generate-guesses.ts`).

## `google-20k-english.txt`

20,000 most common English words, frequency-ranked.
Source: <https://github.com/first20hours/google-10000-english> (`20k.txt`), MIT licence,
derived from the Google Web Trillion Word Corpus.

Used by the Daily Mini answer pool as a **frequency signal**. It is not a dictionary: it
contains abbreviations (`dvd`, `rss`), proper nouns (`usa`, `ebay`), and platform words
(`email`, `download`) that make poor puzzle answers.

## Lichess puzzle database (not committed)

<https://database.lichess.org/lichess_db_puzzle.csv.zst> — CC0, 4M+ puzzles, ~250MB
compressed. Too large to commit; the importer takes a path to a local copy and only the
selected puzzles are committed. CC0 requires no attribution, but provenance is recorded
here anyway.

## `obscenity-en.txt`

Source: <https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words>
(`en`), CC0. 403 entries.

**Why this exists.** The first generated answer list contained 18 of these, including
`rape`, `incest`, `dildo`, `penis`, `pussy`, and `cock`. The frequency corpus is drawn from
the open web, so this is an entirely predictable outcome and not an edge case. Nothing in
the test suite catches it, because appropriateness is not a property tests encode — it was
found by reading the generated samples.

Answer words are filtered against this list (Daily Word and the Mini pool). The Word guess
list stays permissive. A daily puzzle whose answer is a slur is a product incident, not a
content nit; the list is short, so `shared/wordlists/answers-review.md` flags what it misses.

## `exclusions-en.txt`

Project-owned answer curation for the Daily Mini pool: entries that survive the source
filters but are unsuitable answers, including abbreviations, fragments, and proper nouns.
Comment lines start with `#`; the remaining entries are whitespace-separated and matched
as case-insensitive whole words.

## Natural Earth Admin 0 countries (not committed)

<https://github.com/nvkelso/natural-earth-vector> —
`geojson/ne_110m_admin_0_countries.geojson`, **public domain**. 838KB, 177 features,
166 sovereign countries.

Used for Globle. The fixed reference table ships in the app bundle, while a frozen,
versioned shuffled-deck sequence selects the daily answer without a content contract.
Every feature carries `LABEL_X`/`LABEL_Y` — cartographic label points that serve directly
as centroids, so no geometry math is needed. `CONTINENT`, `NAME`, and `ISO_A3_EH` are also
used.

**Chosen over `mledoze/countries`** despite that dataset being easier (194 UN members with a
`latlng` field), because it is ODC-ODbL — share-alike for derived databases — while every
other source here is public domain, CC0, or MIT. Natural Earth carries no such condition.

**Known quirk:** `ISO_A3` is `-99` for several countries including France. Use `ISO_A3_EH`,
or `NAME` as the identity.

**Accepted limit:** ~166 sovereign countries is well under a year, so Globle recycles roughly
2.2× annually — as the original does. Documented, not padded.
