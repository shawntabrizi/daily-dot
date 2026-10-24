// Pocket worker: draws the daily scoreboard card whenever the host puts it on
// screen.
//
// Drawing goes through `getPocketManager()`: the manager owns the client's
// single render slot and routes by card id, and a throw in the handler does not
// end the registration. (Pattern from paritytech/humanity-spa and Nemanja's pets.)
//
// Lifecycle facts this is built around (host-rust-core #632, Worker Lifecycle):
//   - the worker runs only while the card is on screen. No background tick, so
//     the day index is computed from the clock on every draw and every poll.
//   - the app and this worker share no runtime. Today's bits and the player's
//     picked games (D21) come from the product's host KV store, which the app
//     writes on every completion and every change of picks.
//     Storage has no change notification, so a visible card polls it.
import {
  getHostLocalStorage,
  getPocketManager,
  getTruApi,
  navigateTo,
} from "@parity/product-sdk-host";

import {
  CARD_DRAWN_KEY,
  CARD_STATE_KEY,
  cardStateBits,
  type CardSummary,
  parseCardState,
  type CardBits,
} from "../../app/src/shared/card-state";
import { dayIndexFromTimestamp } from "../../app/src/shared/day";
import { parsePicks, pickedGames, PICKS_KEY, STARTER_PICKS } from "../../app/src/shared/picks";
import { gameById, type Game } from "../../app/src/shared/roster";
import { CARD_ID, dailyFace, EMPTY_BITS, countdownText, msToRollover, stripState } from "./face";

/** How often a visible card re-reads the checklist and ticks the countdown. One local key read. */
const POLL_MS = 1_000;

interface Checklist {
  today: number;
  /** The clock the checklist was read at; the strip depends on it. */
  now: number;
  bits: CardBits;
  /** The streak as the app last wrote it; null when nothing was ever recorded. */
  summary: CardSummary | null;
  /** The picked games; the starter set until the player picks. */
  games: readonly Game[];
}

/**
 * Today's bits, or none: a record for another day is yesterday's checklist
 * and must draw as 0/N, not as a carried-over tick.
 */
async function readChecklist(): Promise<Checklist> {
  const now = Date.now();
  const today = dayIndexFromTimestamp(now / 1_000);
  const storage = await getHostLocalStorage();
  const state = storage
    ? parseCardState(await storage.readString(CARD_STATE_KEY))
    : null;
  const picks = (storage ? parsePicks(await storage.readString(PICKS_KEY)) : null) ?? [...STARTER_PICKS];
  const bits = state && state.day === today ? cardStateBits(state) : EMPTY_BITS;
  // The streak is current whatever day the record is from (the app derives
  // it with the one-day grace). The card shows no percentile.
  const summary: CardSummary | null = state
    ? state.streakAny !== undefined ? { streakAny: state.streakAny } : {}
    : null;
  return { today, now, bits, summary, games: pickedGames(picks) };
}

/** What the face is drawn from; a change in any part repaints (midnight and
 *  the strip turning red included). */
function snapshot(checklist: Checklist): string {
  const s = checklist.summary;
  const left = msToRollover(checklist.now);
  const strip = stripState(checklist.bits, s?.streakAny ?? 0, left, checklist.games);
  // The countdown repaints the face every second while the card is visible.
  return `${countdownText(left)}:${checklist.today}:${checklist.bits.played}:${checklist.bits.solved}:${s ? `${s.streakAny ?? ""}` : "none"}:${checklist.games.map((game) => game.gameId).join(",")}:${strip}`;
}

async function openGame(slug: string): Promise<void> {
  const game = gameById(slug);
  if (!game) {
    console.warn(`[daily-on-dot] card action for unknown game "${slug}"`);
    return;
  }
  const truApi = await getTruApi();
  const productId = truApi
    ? await truApi.system.getProductContext().match(
        (context) => context.productId,
        () => null,
      )
    : null;
  if (!productId) {
    console.warn("[daily-on-dot] no product id; cannot open the app from the card");
    return;
  }
  // The route form a host takes for "open this product at this screen" is not
  // documented; pets found `polkadotapp://<productId>` opens the product.
  const url = `polkadotapp://${productId}/${game.route}`;
  const result = await navigateTo(url);
  console.info(
    `[daily-on-dot] navigateTo ${url}: ${result.ok ? "ok" : result.error.message}`,
  );
}

async function start(): Promise<void> {
  const pocket = await getPocketManager();
  if (pocket == null) {
    // A host with no Pocket surface shows the static preview the card was
    // added with. A narrower product, not a broken one.
    console.info("[daily-on-dot] no pocket surface on this host; the card stays static");
    return;
  }

  pocket.drawCard(CARD_ID, async (send) => {
    // Tell the app the card is held, so it never offers it again here.
    void getHostLocalStorage()
      .then((storage) => storage?.writeString(CARD_DRAWN_KEY, "1"))
      .catch((error: unknown) => console.warn("[daily-on-dot] drawn flag write failed", error));
    let current = await readChecklist();
    let shown = snapshot(current);
    send(dailyFace(current.bits, {}, current.summary, current.now, current.games));

    // Repaint only on a change: the host stores every face it is sent.
    const poll = setInterval(() => {
      readChecklist()
        .then((next) => {
          const key = snapshot(next);
          if (key === shown) return;
          shown = key;
          current = next;
          send(dailyFace(current.bits, {}, current.summary, current.now, current.games));
        })
        .catch((error: unknown) =>
          console.warn("[daily-on-dot] checklist read failed", error),
        );
    }, POLL_MS);

    // The host calls this when the card leaves the screen.
    return () => clearInterval(poll);
  });

  pocket.subscribeCardAction(CARD_ID, (action) => {
    if (action.actionId.startsWith("open:")) {
      void openGame(action.actionId.slice("open:".length));
    }
  });
  console.info("[daily-on-dot] pocket card renderer registered");
}

start().catch((error: unknown) =>
  console.error("[daily-on-dot] pocket card not registered", error),
);
