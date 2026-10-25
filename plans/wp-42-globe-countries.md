# WP42 — Daily Globe: the 197 countries, territories, alternate names

Decision D26 (new, below). Before first public play, so Globe v1 may change in place (D11).

## Why

`shared/countries/core.json` has 166 entries from Natural Earth **1:110m**, filtered to
`TYPE` "Sovereign country" or "Country". Two defects:
- the 1:110m map drops small states: no Singapore, Malta, Bahrain, Vatican, … (30 in all);
- the `TYPE` filter drops real countries Natural Earth types otherwise: **Cuba** and
  **Kazakhstan** ("Sovereignty"), **Israel** and **Kosovo** ("Disputed"), **Palestine**
  ("Indeterminate"). They can never be guessed or be the answer today.

## D26 — the list and how the globe draws the rest (Globle's choices)

- **Guessable: 197** = the 193 UN members + Vatican, Kosovo, Palestine, Taiwan.
  The list is `shared/countries/globe-countries.json` (Natural Earth `NAME`s; editorial,
  do not change it). Shapes and label points come from Natural Earth **1:50m**
  `ne_50m_admin_0_countries` (public domain) — use
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson`.
  Select features by `NAME` from the list; never by `TYPE`.
- **Territories: drawn, never guessable.** Every other 1:50m feature is a territory of
  its `SOVEREIGNT`, except: Somaliland → Somalia, N. Cyprus → Cyprus, W. Sahara →
  Morocco (Globle's choices); Antarctica and Siachen Glacier are dropped. A territory is
  drawn in a neutral fill when its owner is guessed (and when the owner is revealed as
  the answer), like Globle's Greenland with Denmark. It never affects distance or colour.
- **Display names**: Natural Earth abbreviates ("Bosnia and Herz.", "Central African
  Rep.", "Dem. Rep. Congo", "eSwatini", "S. Sudan", "St. Vin. and Gren.", …). Show
  `NAME_LONG` or a readable name (e.g. "Bosnia and Herzegovina", "Eswatini") consistently
  in the picker, the guess rows and the result; keep `iso` as the identity.
- **Alternate names** in the picker (they find the country, the row shows the real
  name): Burma→Myanmar, Swaziland→Eswatini, Macedonia→North Macedonia,
  Congo-Brazzaville→Congo, DR Congo / Congo-Kinshasa / Democratic Republic of Congo→
  Dem. Rep. Congo, Holy See / Vatican City→Vatican, Cape Verde→Cabo Verde,
  Ivory Coast / Cote d'Ivoire→Côte d'Ivoire, Bosnia→Bosnia and Herzegovina,
  Turkiye→Turkey, Czech Republic→Czechia, East Timor→Timor-Leste, USA / US / America→
  United States of America, UK / Britain / Great Britain→United Kingdom, UAE→United
  Arab Emirates, South Korea / North Korea as typed, plus accent-insensitive matching.
- **Small countries stay visible**: a guessed or revealed country whose shape is under a
  few pixels at the current zoom also gets a dot at its label point in the same fill.
- Distance and direction stay label-point haversine as now.

## Superset and subsets (Shawn, 2026-10-25)

The data is one **superset**: every 1:50m feature but Antarctica and Siachen Glacier,
each with a stable id, display name, alternate names, kind (sovereign, territory,
disputed), owner, label point, continent and shape. The config picks two subsets by id:
**guessable** (the picker) and **answers** (the daily shuffle). Both are the 197 above
for now. The v1 answer for a day depends only on `answers` and its order, so adding
places to the superset or to `guessable` never changes a day's answer; changing
`answers` once live is a new version (D11).

## Work

- `app/scripts/generate-countries.ts` and `generate-country-shapes.ts`: read the list,
  1:50m input, select by name, emit territories (shapes with an `owner` iso, not in
  `core.json`), keep reruns byte-identical; tests for the selection (Cuba, Kazakhstan,
  Israel, Kosovo, Palestine, Singapore, Vatican present; Greenland, Hong Kong, Somaliland
  absent from guessable; territory owners incl. the three overrides). Quantise shapes so
  `shapes.json` stays reasonable (report the size; under ~400 KB, simplify rings if
  needed, but never lose a country's last ring).
- `shared/countries/README.md`: the new source, list and rules.
- Globe: territories drawn per above, small-country dots, display names, alternate names
  in `matchCountries` / `countryFromGuess`, tests for each. Update tests that pinned the
  166-country v1 answers to the new list (it is a rewrite of v1 before first play).
- Check in Chromium at 360×780 and 1440×900: Singapore guessable and visible, Denmark
  guess shows Greenland neutral, no page scroll.
