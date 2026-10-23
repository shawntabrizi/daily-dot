# Daily Games — Candidate List

Survey of daily ("-dle") games as clone candidates for a Polkadot daily-games hub.

Columns:

- **Mechanic** — what the player actually does.
- **Daily data** — what one day's puzzle consists of.
- **Source** — where a year+ of that data comes from.
  `PROC` procedurally generated · `LIST` curated word/answer list ·
  `DATA` free public dataset · `EDIT` human-authored · `MEDIA` licensed images/audio.
- **Tier** — S trivial · A easy mechanic, content cost · B awkward · C don't (licensing/assets).

> **Naming:** mechanics are not copyrightable, but *Wordle*, *Connections*, and *Strands*
> are NYT trademarks, and *Bracket City* is The Atlantic's. Clone the mechanic, use our own
> name, and never import another site's puzzle archive.

---

## Tier S — trivial to copy, data supply is solved

| # | Game | Link | Mechanic | Daily data | Source |
|---|------|------|----------|-----------|--------|
| 1 | Wordle | https://www.nytimes.com/games/wordle/ | Guess a 5-letter word in 6 tries; per-letter hot/cold | 1 word | `LIST` |
| 2 | Verticle | https://verticle.netlify.app/ | Wordle, but guesses stack downward toward the answer | 1 word | `LIST` |
| 3 | Xordle | https://xordle.org/ | Two secret words share one board, no positional overlap | 2 words | `LIST` |
| 4 | Dordle | https://dordle.online/ | 2 Wordle boards at once | 2 words | `LIST` |
| 5 | Quordle | https://www.merriam-webster.com/games/quordle/ | 4 boards at once | 4 words | `LIST` |
| 6 | Sedecordle | https://www.sedecordle.com/ | 16 boards at once | 16 words | `LIST` |
| 7 | Duotrigordle | https://duotrigordle.com/ | 32 boards at once | 32 words | `LIST` |
| 8 | Nerdle | https://nerdlegame.com/ | Wordle over an 8-char arithmetic equation | 1 equation | `PROC` |
| 9 | Mathler | https://www.mathler.com/ | Find an equation equal to a given target | 1 target + solution | `PROC` |
| 10 | Angle | https://angle.wtf/ | Guess an angle in degrees; higher/lower feedback | 1 integer | `PROC` |
| 11 | Padlock | https://www.padlockgame.net/ | Mastermind on a 4–5 digit code; counts only, no positions | 1 code | `PROC` |
| 12 | Sudoku | https://sudoku.com/challenges | Classic 9×9 sudoku | 1 grid | `PROC` |
| 13 | Word Search | https://games.washingtonpost.com/games/daily-word-search | Find themed words in a letter grid | grid + word list | `PROC` |
| 14 | Waffle | https://wafflegame.net/daily | Swap letters to fix a 5×5 interlocking word waffle | 1 scrambled grid | `PROC` |
| 15 | Dodeku | https://dodeku.com/ | Place number tiles so row/column sums hit targets | 1 grid + targets | `PROC` |
| 16 | Jumblie | https://jumblie.com/ | Find 4 themed words using every letter exactly once | 4 themed words | `PROC`+`LIST` |
| 17 | Chess Puzzle | https://www.chess.com/daily-chess-puzzle | Find the winning tactic from a position | FEN + move line | `DATA` |
| 18 | Globle | https://globle-game.com/ | Guess the country; warmer/colder by distance | 1 country | `DATA` |
| 19 | Worldle | https://worldle.teuteuf.fr/ | Guess country from silhouette; distance + bearing | 1 country | `DATA` |
| 20 | Flagle | https://www.flagle.io/ | Guess country from a progressively revealed flag | 1 country | `DATA` |

## Tier A — easy mechanic, real editorial or data-wrangling cost

| # | Game | Link | Mechanic | Daily data | Source |
|---|------|------|----------|-----------|--------|
| 21 | Connections | https://www.nytimes.com/games/connections | Sort 16 words into 4 hidden groups of 4 | 16 words + 4 category labels | `EDIT` |
| 22 | Strands | https://www.nytimes.com/games/strands | Themed word search with a hidden "spangram" | grid + theme + words | `EDIT` |
| 23 | Mini Crossword | https://minicrossword.com/ | 5×5 crossword | grid + clues | `EDIT` |
| 24 | Squaredle | https://squaredle.app/?level=xp | Find every valid word in a letter grid | 1 grid + accepted-word set | `PROC`+`LIST` |
| 25 | Daily Tens | https://dailytens.com/ | Name the top 10 for a ranked category; 5 wrong allowed | prompt + 10 ranked answers | `EDIT`/`DATA` |
| 26 | Metazooa | https://metazooa.com/ | Guess an animal; feedback by taxonomic distance | 1 species | `DATA` |
| 27 | Metaflora | https://flora.metazooa.com/ | Same, for plants | 1 species | `DATA` |
| 28 | Travle | https://travle.earth/ | Name countries forming a land route between two countries | start + end country | `DATA` |
| 29 | Tradle | https://games.oec.world/en/tradle/ | Guess country from its export treemap | 1 country + trade breakdown | `DATA` |
| 30 | UrbanStats | https://urbanstats.org/quiz.html | Compare two places on a demographic statistic | 5 stat comparisons | `DATA` |
| 31 | Guess The Movie | https://guessthemovie.name/ | Guess a film from progressive text clues | 1 film + clue ladder | `DATA` (TMDB) |

## Tier B — awkward; defer

| # | Game | Link | Why it's awkward |
|---|------|------|------------------|
| 32 | Cryptic Crossword (MinuteCryptic) | https://www.minutecryptic.com/ | Cryptic clue writing is a specialist craft; not automatable at quality |
| 33 | Feudle | https://googlefeud.com/feudle/ | Depends on Google autocomplete results — no licensable source |
| 34 | Spellcheck | https://spellcheck.xyz/ | Audio-first: needs hosted TTS per word |
| 35 | Minigolfle | https://minigolfle.com/ | Physics sim; cross-client determinism is hard to guarantee/verify |
| 36 | Wikipedia Game | https://www.thewikipediagame.com/ | Needs the live Wikipedia link graph; puzzle validity drifts |
| 37 | Bracket City | https://www.theatlantic.com/games/bracket-city/ | Nested-clue authoring is as hard as cryptics; strong brand identity |
| 38 | Cinematrix | https://www.vulture.com/article/daily-movie-grid-trivia-game-cinematrix.html | Needs a full film/cast/crew graph to validate arbitrary answers |
| 39 | Cine2Nerdle | https://www.cinenerdle2.app/ | Same graph requirement, plus real-time multiplayer |
| 40 | Movie to Movie | https://movietomovie.com/ | Needs a shortest-path solver over the actor–film graph |

## Tier C — don't clone; media licensing is the whole product

| # | Game | Link | Blocker |
|---|------|------|---------|
| 41 | Framed | https://framed.wtf/ | Film stills |
| 42 | Bandle | https://bandle.app/ | Music recordings |
| 43 | Guess the Audio | https://guesstheaudio.com/ | Audio clips |
| 44 | Lyricle | https://www.lyricle.app/ | Song lyrics (aggressively licensed) |
| 45 | Guess The Game | https://guessthe.game/ | Game screenshots |
| 46 | Gamedle Classic | https://www.gamedle.wtf/classic | Game cover art |
| 47 | Gamedle Character | https://www.gamedle.wtf/characters | Character art |
| 48 | Pokedoku | https://pokedoku.com/ | Nintendo/Pokémon IP |
| 49 | Squirdle | https://squirdle.fireblend.com/daily.html | Nintendo/Pokémon IP |
| 50 | Food Guessr | https://www.foodguessr.com/ | Food photography rights |

---

## Data sources for a year and beyond

| Source | Covers | Licence | Supply |
|---|---|---|---|
| Lichess puzzle database | Chess Puzzle | CC0 | 4M+ puzzles — effectively infinite |
| Natural Earth + REST Countries | Globle, Worldle, Flagle, Travle | Public domain / free | ~195 countries (~250 with territories) |
| GBIF / Wikidata taxonomy | Metazooa, Metaflora | CC0 | Tens of thousands of species |
| UN Comtrade / OEC | Tradle | Check OEC terms; Comtrade is the primary source | ~195 countries |
| US Census / OpenStreetMap | UrbanStats | Public domain / ODbL | Effectively infinite comparisons |
| ENABLE / SCOWL / `dwyl/english-words` | every Wordle variant, Jumblie, Squaredle, Word Search | Public domain / MIT | ~2,300 good 5-letter answers ≈ 6 years at 1/day |
| Procedural generators | Nerdle, Mathler, Angle, Padlock, Sudoku, Waffle, Dodeku | n/a | Infinite |
| In-house editorial (quizzler `pack-sources` workflow) | Connections, Strands, Mini Crossword, Daily Tens | ours | Whatever we author |

## Existing open-source implementations worth reading

| Game | Repo | Licence |
|---|---|---|
| Jumblie (the actual game) | `cassidoo/jumblie` | open source |
| Globle (the actual game) | `the-abe-train/globle` | check terms |
| Connections | `srefsland/nyt-connections-clone` | MIT |
| Sudoku generator/solver | `robatron/sudoku.js` | MIT |
| Word search generator | `joshbduncan/word-search-generator` | MIT |
| Crossword layout | `MichaelWehar/Crossword-Layout-Generator` | MIT |
| Duotrigordle | `thesilican/duotrigordle` | check terms |

Read for mechanics and edge cases; write our own implementations rather than vendoring
GPL code into a product we intend to ship.

---

## Corrections applied to the original list

- `Sqauredle` → **Squaredle**; `Mini Cross Word` → **Mini Crossword**;
  `Move to Movie` → **Movie to Movie**; `Cryptic Crossword` → **MinuteCryptic**.
- `Verticle` kept — the deliberate misspelling is the game's actual name.
- Dropped the four unlabelled `FALSE` tracking columns and the trailing empty row 52.
- Noted that `minicrossword.com` is a third-party clone; the NYT original is at
  `nytimes.com/crosswords/game/mini`.
