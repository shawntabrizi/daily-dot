import { detectKeyStore, type KeyStore } from "./host-store";
import { GAME_ROSTER, type Game } from "./roster";
import type { StorageLike } from "./storage";
import { rosterMask } from "./streaks";

/**
 * The games a player plays each day (D21). Picked games lead the hub and are
 * all the headline, the day bar, "complete" (D17c), the share slots, the
 * drawer and the Pocket card count; the rest stay playable under "More games".
 *
 * Device-local (D6): the host KV store holds the copy the card worker reads,
 * `localStorage` the copy the app renders from synchronously (the home stays
 * zero-RPC, D7). `syncPicksWithHost` reconciles the two on boot.
 */
export const PICKS_KEY = "daily-on-dot:picks:v1";

/** Fired on `window` when the picks change; `detail.from` says who changed them. */
export const PICKS_EVENT = "daily-picks";

export interface PicksChange {
  from: "player" | "host";
  games: readonly number[];
}

/** A new player's games: Word, Mini, Connections, Code. */
export const STARTER_PICKS: readonly number[] = [0, 4, 5, 6];

interface StoredPicks {
  version: 1;
  games: number[];
}

/** The roster's gameIds among `ids`, in roster order; null when none are left. */
function normalise(ids: readonly number[]): number[] | null {
  const games = GAME_ROSTER.map((game) => game.gameId).filter((id) => ids.includes(id));
  return games.length > 0 ? games : null;
}

/**
 * The picked gameIds from a stored value, or null for anything that is not a
 * version-1 record naming at least one roster game. Ids no longer on the
 * roster are dropped.
 */
export function parsePicks(raw: string | null | undefined): number[] | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const candidate = parsed as Partial<StoredPicks> | null;
  if (
    !candidate
    || candidate.version !== 1
    || !Array.isArray(candidate.games)
    || !candidate.games.every((id) => Number.isInteger(id))
  ) {
    return null;
  }
  return normalise(candidate.games);
}

export function serialisePicks(ids: readonly number[]): string {
  const games = normalise(ids);
  if (!games) {
    throw new RangeError("At least one roster game must be picked");
  }
  const stored: StoredPicks = { version: 1, games };
  return JSON.stringify(stored);
}

/** The picked gameIds, roster order; the starter set until the player picks. */
export function currentPicks(storage: StorageLike = window.localStorage): number[] {
  return parsePicks(storage.getItem(PICKS_KEY)) ?? [...STARTER_PICKS];
}

export function pickedGames(ids: readonly number[] = currentPicks()): Game[] {
  return GAME_ROSTER.filter((game) => ids.includes(game.gameId));
}

export function unpickedGames(ids: readonly number[] = currentPicks()): Game[] {
  return GAME_ROSTER.filter((game) => !ids.includes(game.gameId));
}

export function picksMask(ids: readonly number[] = currentPicks()): bigint {
  return rosterMask([...ids]);
}

function announce(change: PicksChange): void {
  window.dispatchEvent(new CustomEvent<PicksChange>(PICKS_EVENT, { detail: change }));
}

/** The player's choice: stored locally at once, then announced (the app mirrors it to the host). */
export function savePicks(
  ids: readonly number[],
  storage: StorageLike = window.localStorage,
): void {
  const value = serialisePicks(ids);
  storage.setItem(PICKS_KEY, value);
  announce({ from: "player", games: parsePicks(value)! });
}

export function detectPicksStore(fallback?: StorageLike): Promise<KeyStore> {
  return detectKeyStore(PICKS_KEY, fallback);
}

/**
 * Boot-time reconcile. The host copy wins when it holds valid picks (it is
 * the one the card draws); otherwise this device's picks, if the player ever
 * chose, are written up so the card matches the app.
 */
export async function syncPicksWithHost(
  store: KeyStore,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  const host = parsePicks(await store.read());
  const local = parsePicks(storage.getItem(PICKS_KEY));
  if (host) {
    if (!local || host.join() !== local.join()) {
      storage.setItem(PICKS_KEY, serialisePicks(host));
      announce({ from: "host", games: host });
    }
    return;
  }
  if (local) {
    await store.write(serialisePicks(local));
  }
}
