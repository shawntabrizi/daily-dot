import type { DayBits } from "./data-source";

export interface GameStats {
  played: number;
  solved: number;
  winRate: number;
  streak: number;
}

export function hasGameBit(bits: bigint, gameId: number): boolean {
  if (!Number.isInteger(gameId) || gameId < 0 || gameId >= 64) {
    throw new RangeError("Game id must be between 0 and 63");
  }

  return (bits & (1n << BigInt(gameId))) !== 0n;
}

export function popcount(bits: bigint): number {
  if (bits < 0n) {
    throw new RangeError("Bitmap must be non-negative");
  }

  let remaining = bits;
  let count = 0;
  while (remaining > 0n) {
    remaining &= remaining - 1n;
    count += 1;
  }
  return count;
}

export function deriveGameStats(days: readonly DayBits[], gameId: number): GameStats {
  let played = 0;
  let solved = 0;

  for (const day of days) {
    if (hasGameBit(day.played, gameId)) {
      played += 1;
    }
    if (hasGameBit(day.solved, gameId)) {
      solved += 1;
    }
  }

  const qualifies = (index: number): boolean => {
    const day = days[index];
    return (
      day !== undefined &&
      hasGameBit(day.ontime, gameId) &&
      hasGameBit(day.solved, gameId)
    );
  };

  let cursor = days.length - 1;
  if (!qualifies(cursor)) {
    cursor -= 1;
    if (!qualifies(cursor)) {
      cursor = -1;
    }
  }

  let streak = 0;
  while (qualifies(cursor)) {
    streak += 1;
    cursor -= 1;
  }

  return {
    played,
    solved,
    winRate: played === 0 ? 0 : (solved / played) * 100,
    streak,
  };
}

/**
 * The hub streak (D17b) over a contiguous run of days ending today, with
 * D17's one-day grace, and the lifetime count.
 *
 * `any`: consecutive days with at least one roster game finished on the day
 * itself (any `ontime` bit). A backfilled day sets `played` only, so it
 * counts toward `finished` and never toward the streak.
 */
export interface HubStreaks {
  any: number;
  /**
   * The longest run of any-game days in the window. The grace rule only
   * affects the run that ends today, and that run is a plain run of
   * consecutive days, so `longestAny` is never below `any`.
   */
  longestAny: number;
  /** Lifetime games finished: popcount of `played` over the window. */
  finished: number;
}

export function rosterMask(gameIds: readonly number[]): bigint {
  return gameIds.reduce((mask, gameId) => {
    if (!Number.isInteger(gameId) || gameId < 0 || gameId >= 64) {
      throw new RangeError("Game id must be between 0 and 63");
    }
    return mask | (1n << BigInt(gameId));
  }, 0n);
}

function streakWithGrace(
  days: readonly DayBits[],
  qualifies: (day: DayBits) => boolean,
): number {
  const at = (index: number): boolean => {
    const day = days[index];
    return day !== undefined && qualifies(day);
  };
  let cursor = days.length - 1;
  if (!at(cursor)) {
    cursor -= 1;
    if (!at(cursor)) {
      return 0;
    }
  }
  let streak = 0;
  while (at(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

export function deriveHubStreaks(
  days: readonly DayBits[],
  mask: bigint,
): HubStreaks {
  if (mask === 0n) {
    throw new RangeError("The roster mask must name at least one game");
  }
  const anyDay = (day: DayBits): boolean => (day.ontime & mask) !== 0n;

  let longestAny = 0;
  let run = 0;
  let finished = 0;
  for (const day of days) {
    run = anyDay(day) ? run + 1 : 0;
    longestAny = Math.max(longestAny, run);
    finished += popcount(day.played & mask);
  }

  return {
    any: streakWithGrace(days, anyDay),
    longestAny,
    finished,
  };
}

/** The any-game streak milestones (decision 7); nothing after the last. */
export const MILESTONES = [7, 30, 100, 365] as const;

/** The first milestone above `any`, or null once 365 is reached. */
export function nextMilestone(any: number): number | null {
  return MILESTONES.find((milestone) => milestone > any) ?? null;
}

/** The result screen's one celebration line on a milestone day (decision 8). */
export function milestoneLine(any: number): string | null {
  return (MILESTONES as readonly number[]).includes(any) ? `${any} days. Keep it.` : null;
}

/** Day 0 (2026-01-01) is a Thursday; the first Monday is day 4. Weeks run Monday to Sunday. */
export const FIRST_MONDAY = 4;

/**
 * The day indexes inside every perfect week: seven consecutive Monday–Sunday
 * days each with at least one roster game played, on time or later. The
 * calendar draws such a week as one gold bar; a backfilled day counts here
 * because it counts for the calendar, not the streak.
 */
export function perfectWeeks(days: readonly DayBits[], mask: bigint): Set<number> {
  if (mask === 0n) {
    throw new RangeError("The roster mask must name at least one game");
  }
  const inside = new Set<number>();
  for (let monday = FIRST_MONDAY; monday + 6 < days.length; monday += 7) {
    let perfect = true;
    for (let day = monday; day < monday + 7; day += 1) {
      if ((days[day]!.played & mask) === 0n) {
        perfect = false;
        break;
      }
    }
    if (perfect) {
      for (let day = monday; day < monday + 7; day += 1) {
        inside.add(day);
      }
    }
  }
  return inside;
}
