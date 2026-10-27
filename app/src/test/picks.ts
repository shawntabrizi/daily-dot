import { PICKS_KEY, serializePicks } from "../shared/picks";

/**
 * A player who picked the six original games (Word to Connections): for
 * tests about a rule other than the picks (D21), written against a six-game
 * day. Daily Code and Daily Angle sit under More games.
 */
export function pickSixGames(storage: Pick<Storage, "setItem"> = window.localStorage): void {
  storage.setItem(PICKS_KEY, serializePicks([0, 1, 2, 3, 4, 5]));
}
