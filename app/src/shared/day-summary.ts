import type { DataSource, DayBits } from "./data-source";
import {
  dayPercentile,
  formatScore,
  percentileFor,
  type Histogram,
  type ScoreUnit,
} from "./percentile";
import { pickedGames } from "./picks";
import { GAME_ROSTER, type Game } from "./roster";
import { deriveHubStreaks, hasGameBit, rosterMask, type HubStreaks } from "./streaks";

const EMPTY_BITS: DayBits = { played: 0n, solved: 0n, ontime: 0n };
const PAGE = 64;

/** The score noun per game for the summary rows and the hub's done rows. */
export const UNITS: Partial<Record<Game["id"], ScoreUnit>> = {
  chess: "attempt",
  connections: "mistake",
};

export interface GameSummary {
  game: Game;
  played: boolean;
  /** Recorded after the day ended: shown where they would have ranked. */
  late: boolean;
  score: number | null;
  percentile: number | null;
  /** On-time finishers in the day's histogram; null without the read. */
  finishers: number | null;
}

export interface DaySummary {
  day: number;
  /** Every picked game has its played bit (D17c). */
  complete: boolean;
  games: GameSummary[];
  /** The mean of the game percentiles (see `dayPercentile`). */
  dayPercentile: number | null;
}

/** Every one of `games` (the picks, D17c) has its played bit, on time or later. */
export function dayComplete(bits: DayBits, games: readonly Game[]): boolean {
  return games.every((game) => hasGameBit(bits.played, game.gameId));
}

/**
 * The day's summary from two reads: every game's histogram and the account's
 * details. A source without those reads gives scores but no percentiles.
 */
export async function loadDaySummary(
  source: DataSource,
  day: number,
  bits: DayBits,
  roster: readonly Game[] = GAME_ROSTER,
): Promise<DaySummary> {
  const gameIds = roster.map((game) => game.gameId);
  const [histograms, details] = await Promise.all([
    source.histograms
      ? source.histograms(day, gameIds)
      : Promise.resolve<(Histogram | null)[]>(gameIds.map(() => null)),
    source.details
      ? source.details(day, gameIds)
      : Promise.resolve(gameIds.map(() => ({ score: 0, solved: false }))),
  ]);
  const games = roster.map((game, index): GameSummary => {
    const played = hasGameBit(bits.played, game.gameId);
    const late = played && !hasGameBit(bits.ontime, game.gameId);
    const histogram = histograms[index] ?? null;
    const score = played ? (details[index]?.score ?? null) : null;
    const percentile =
      score === null || histogram === null
        ? null
        : percentileFor(histogram, game, score, !late);
    return { game, played, late, score, percentile, finishers: histogram?.total ?? null };
  });
  return {
    day,
    complete: dayComplete(bits, pickedGames()),
    games,
    dayPercentile: dayPercentile(games.map((game) => game.percentile)),
  };
}

/** `from..today` inclusive, read in pages of 64; a short page pads with empty days. */
export async function readDays(
  source: DataSource,
  from: number,
  today: number,
): Promise<DayBits[]> {
  const days: DayBits[] = [];
  for (let start = from; start <= today; start += PAGE) {
    const count = Math.min(PAGE, today - start + 1);
    const page = await source.dayBitsRange(start, count);
    for (let offset = 0; offset < count; offset += 1) {
      days.push(page[offset] ?? EMPTY_BITS);
    }
  }
  return days;
}

/**
 * Enough recent days to derive the hub streak exactly: pages back from
 * today until a page starts with a day no roster game was played on (the
 * streak ends there) or day 0.
 */
export async function readStreakWindow(
  source: DataSource,
  today: number,
  mask: bigint,
): Promise<DayBits[]> {
  let from = Math.max(0, today - PAGE + 1);
  let days = await readDays(source, from, today);
  while (from > 0 && (days[0]!.ontime & mask) !== 0n) {
    const earlier = Math.max(0, from - PAGE);
    const page = await readDays(source, earlier, from - 1);
    days = [...page, ...days];
    from = earlier;
  }
  return days;
}

export async function loadHubStreaks(
  source: DataSource,
  today: number,
  roster: readonly Game[] = GAME_ROSTER,
): Promise<HubStreaks> {
  const mask = rosterMask(roster.map((game) => game.gameId));
  return deriveHubStreaks(await readStreakWindow(source, today, mask), mask);
}

function percentText(percentile: number | null): string {
  return percentile === null ? "—" : `Top ${percentile}%`;
}

/**
 * The "Day done" panel: the day's overall percentile, each game's score and
 * percentile (unless `games: false`: the hub's rows already show them), and,
 * when given, the lifetime count and the best streak as two tiles.
 */
export function renderDaySummary(
  summary: DaySummary,
  streaks: HubStreaks | null,
  options: { heading?: string; games?: boolean } = {},
): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "day-summary";
  panel.dataset.daySummary = String(summary.day);
  panel.setAttribute("aria-label", `Day ${summary.day} summary`);

  const head = document.createElement("div");
  head.className = "day-summary-head";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = options.heading ?? (summary.complete ? "DAY DONE" : `DAY ${summary.day}`);
  const rank = document.createElement("strong");
  rank.className = "day-summary-rank";
  rank.dataset.dayRank = "";
  rank.textContent =
    summary.dayPercentile === null ? "No percentile yet" : `Top ${summary.dayPercentile}% today`;
  const note = document.createElement("span");
  note.className = "day-summary-note";
  const ranked = summary.games.filter((game) => game.percentile !== null).length;
  note.textContent =
    ranked === 0
      ? "Ranks appear as results come in."
      : `Across your ${ranked} ${ranked === 1 ? "game" : "games"}.`;
  head.append(eyebrow, rank, note);

  const list = document.createElement("ul");
  list.className = "day-summary-games";
  for (const entry of summary.games) {
    const row = document.createElement("li");
    row.className = "day-summary-game";
    row.dataset.summaryGame = entry.game.id;
    const name = document.createElement("span");
    name.className = "day-summary-name";
    name.textContent = entry.game.short;
    const score = document.createElement("span");
    score.className = "day-summary-score";
    score.textContent = entry.score === null
      ? "not played"
      : `${formatScore(entry.game.kind, entry.score, UNITS[entry.game.id])}${entry.late ? " · after the day" : ""}`;
    const percentile = document.createElement("strong");
    percentile.className = "day-summary-percentile";
    percentile.textContent = entry.played ? percentText(entry.percentile) : "";
    row.append(name, score, percentile);
    list.append(row);
  }
  panel.append(head);
  if (options.games !== false) {
    panel.append(list);
  }

  // The streak lives in the header pill; the card adds the lifetime counts,
  // each a big number over its label.
  if (streaks) {
    const stats = document.createElement("div");
    stats.className = "day-summary-stats";
    for (const [label, value] of [
      ["Games finished", streaks.finished],
      ["Best streak", streaks.longestAny],
    ] as const) {
      const tile = document.createElement("div");
      tile.className = "day-summary-stat";
      const number = document.createElement("strong");
      number.textContent = String(value);
      const name = document.createElement("span");
      name.textContent = label;
      tile.append(number, name);
      stats.append(tile);
    }
    panel.append(stats);
  }
  return panel;
}
