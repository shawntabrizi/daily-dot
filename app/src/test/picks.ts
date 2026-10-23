import { PICKS_KEY, serialisePicks } from "../shared/picks";
import { GAME_ROSTER } from "../shared/roster";

/**
 * A player who picked every game: for tests about a rule other than the
 * picks (D21), so the whole roster counts the way it did before picks.
 */
export function pickAllGames(storage: Pick<Storage, "setItem"> = window.localStorage): void {
  storage.setItem(PICKS_KEY, serialisePicks(GAME_ROSTER.map((game) => game.gameId)));
}
