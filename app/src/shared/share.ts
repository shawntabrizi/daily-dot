import { CONNECTIONS_TIERS } from "../games/connections/engine";
import { formatScore, type ScoreUnit } from "./percentile";
import { pickedGames } from "./picks";
import { GAME_ROSTER, type Game, type GameSlug, type ScoreKind } from "./roster";

/** The score noun per game; "guess" for the rest. */
const SCORE_UNITS: Partial<Record<GameSlug, ScoreUnit>> = {
  chess: "attempt",
  connections: "mistake",
};

export function scoreUnit(id: GameSlug): ScoreUnit {
  return SCORE_UNITS[id] ?? "guess";
}

export interface ShareGame {
  id: GameSlug;
  played: boolean;
  score: number | null;
  kind: ScoreKind;
  percentile: number | null;
  /** Extra color-free lines under the game's line (Connections' tier rows). */
  lines?: readonly string[];
}

export interface ShareInput {
  day: number;
  games: readonly ShareGame[];
  streaks: { any: number } | null;
  /** The day's overall percentile; written only when every picked game is played. */
  dayPercentile: number | null;
}

const PLAYED = "✅";
const UNPLAYED = "⬜";

/**
 * The one share text (WP36 decision 6): the day and the count of picked games
 * done, one slot per picked game (D21), one line per played game with its
 * score and percentile (picked games first, then any other game finished),
 * and the streak. Never an answer, never a grid that encodes letters.
 */
export function shareText(input: ShareInput, picks: readonly Game[] = pickedGames()): string {
  const byId = new Map(input.games.map((game) => [game.id, game]));
  const slots = picks.map((game) => ({ game, share: byId.get(game.id) }));
  const pickedPlayed = slots.filter((entry) => entry.share?.played).length;
  const others = GAME_ROSTER.filter((game) => !picks.includes(game));
  const played = [...picks, ...others]
    .map((game) => ({ game, share: byId.get(game.id) }))
    .filter((entry) => entry.share?.played);

  const lines = [
    `Daily on Dot #${input.day} · ${pickedPlayed}/${picks.length}`,
    slots.map((entry) => (entry.share?.played ? PLAYED : UNPLAYED)).join(""),
  ];
  for (const { game, share } of played) {
    if (!share || share.score === null) {
      continue;
    }
    const score = formatScore(share.kind, share.score, scoreUnit(game.id));
    const rank = share.percentile === null ? "" : ` · Top ${share.percentile}%`;
    lines.push(`${game.short} ${score}${rank}`, ...(share.lines ?? []));
  }

  const footer: string[] = [];
  if (input.streaks && input.streaks.any > 0) {
    footer.push(`✦ ${input.streaks.any}`);
  }
  if (pickedPlayed === picks.length && input.dayPercentile !== null) {
    footer.push(`Top ${input.dayPercentile}% today`);
  }
  if (footer.length > 0) {
    lines.push(footer.join(" · "));
  }
  return lines.join("\n");
}

/**
 * Connections' extra share lines: one row of tier squares per guess, in the
 * order played. No words, no labels: the groups stay hidden.
 */
export function connectionsRows(guessTiers: readonly (readonly number[])[]): string[] {
  return guessTiers.map((tiers) =>
    tiers.map((tier) => CONNECTIONS_TIERS[tier]!.square).join(""),
  );
}
