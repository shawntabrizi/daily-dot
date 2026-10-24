import { navigateTo } from "@parity/product-sdk-host";

import {
  CARD_ID,
  cardStateBits,
  detectCardStore,
  parseCardState,
  type CardBits,
} from "./shared/card-state";
import { dayIndexFromTimestamp } from "./shared/day";
import { writeOpenIntent } from "./shared/open-intent";
import { currentPicks, detectPicksStore, parsePicks, pickedGames } from "./shared/picks";
import { hostProductId } from "./shared/pocket-prompt";
import { hasStarted } from "./shared/progress";
import type { Game } from "./shared/roster";
import { hasGameBit } from "./shared/streaks";
import { gameGlyph } from "./shared/ui/game-glyphs";
import { FLAME_SVG } from "./shared/ui/streak-badges";

/**
 * The launcher: what the product shows when the host opens it beneath the
 * expanded Pocket card, at the app's URL with `?card=daily`, in a half-height
 * sheet. A game is unplayable at that height, so this view only lists the
 * picked games (D21) with today's ticks. A tap on a row selects it; the Play button sends
 * the selected game to the full app. No chain client, no signer: nothing here
 * may raise a permission sheet in the half screen.
 *
 * Today's ticks, the streak and the picks come from the same KV store the
 * card worker reads; a record for another day is yesterday's and shows as all
 * unplayed with no streak. "Resume" comes from the game's own progress
 * in localStorage (`hasStarted`), as on the hub.
 */
export function fromCard(search = window.location.search): boolean {
  return new URLSearchParams(search).get("card") === CARD_ID;
}

const EMPTY_BITS: CardBits = { played: 0n, solved: 0n };

interface TodayState {
  /** The picked gameIds, as the card draws them. */
  picks: number[];
  bits: CardBits;
  /** The hub streak the app last wrote (WP34); null on a record without it. */
  streak: number | null;
}

function emptyState(picks: number[]): TodayState {
  return { picks, bits: EMPTY_BITS, streak: null };
}

function today(): number {
  return dayIndexFromTimestamp(Date.now() / 1_000);
}

async function readTodayState(): Promise<TodayState> {
  const [store, picksStore] = await Promise.all([detectCardStore(), detectPicksStore()]);
  const picks = parsePicks(await picksStore.read()) ?? currentPicks();
  const state = parseCardState(await store.read());
  if (!state || state.day !== today()) {
    return emptyState(picks);
  }
  return {
    picks,
    bits: cardStateBits(state),
    streak: state.streakAny ?? null,
  };
}

/**
 * The URL forms to ask the host for, in order. Which form an Android host
 * takes for "open this product" is not documented; pets found the first
 * plain form works. The routed form goes first so the log shows whether the
 * host forwards a hash. Each attempt is logged for logcat.
 */
export function productUrls(productId: string, route?: string): string[] {
  const plain = [
    `polkadotapp://${productId}`,
    `https://${productId}`,
    `https://${productId}/`,
  ];
  return route ? [`polkadotapp://${productId}/${route}`, ...plain] : plain;
}

/**
 * Opens the full product, optionally at `route` (a `#/...` hash). Resolves
 * true when the host took one of the URL forms. When every form fails, or
 * outside a host, drops `?card=` and shows the app in place instead.
 */
export async function openFullApp(route?: string): Promise<boolean> {
  const productId = await hostProductId();
  if (productId) {
    for (const url of productUrls(productId, route)) {
      try {
        const result = await navigateTo(url);
        console.info(
          `[daily-on-dot] launcher navigateTo ${url}: ${result.ok ? "ok" : result.error.message}`,
        );
        if (result.ok) {
          return true;
        }
      } catch (error) {
        console.warn(`[daily-on-dot] launcher navigateTo ${url} threw`, error);
      }
    }
    console.warn("[daily-on-dot] launcher: host took no product URL; opening in place");
  } else {
    console.info("[daily-on-dot] launcher: no product id; opening in place");
  }
  window.location.href = window.location.pathname + (route ?? "");
  return false;
}

/** A row's state today: done (the KV bit), started (local progress, not done), or nothing yet. */
type RowState = "done" | "started" | "fresh";

/** The state pill on each row, as the hub's rows: Play, Resume or Done. */
const STATE_WORD: Record<RowState, string> = { done: "Done", started: "Resume", fresh: "Play" };
const PLAY_VERB: Record<RowState, string> = { done: "Open", started: "Resume", fresh: "Play" };

function row(game: Game, state: RowState, selected: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "launcher-row";
  button.dataset.launcherGame = game.id;
  button.dataset.launcherState = state;
  button.setAttribute("aria-pressed", String(selected));
  if (state === "done") {
    button.classList.add("is-played");
  }
  if (selected) {
    button.classList.add("is-selected");
  }
  // The icon tile: neutral with the game's glyph until the game is done,
  // then lit in the game's accent (decision 1).
  const icon = document.createElement("span");
  icon.className = "launcher-row__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = gameGlyph(game.id);
  const text = document.createElement("span");
  text.className = "launcher-row__text";
  const name = document.createElement("span");
  name.className = "launcher-row__name";
  // The short name: two columns leave no room for "Daily X".
  name.textContent = game.short;
  const word = document.createElement("span");
  word.className = "launcher-row__state";
  word.textContent = STATE_WORD[state];
  text.append(name, word);
  button.append(icon, text);
  const spoken = state === "done" ? ", done" : state === "started" ? ", in progress" : "";
  button.setAttribute("aria-label", `${game.name}${spoken}`);
  return button;
}

function streakBadge(count: number): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "launcher__streak";
  badge.dataset.launcherStreak = String(count);
  badge.setAttribute("aria-label", `${count}-day streak`);
  badge.innerHTML = `${FLAME_SVG}<strong>${count}</strong>`;
  return badge;
}

export function renderCardLauncher(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="launcher" data-launcher>
      <header class="launcher__head">
        <div class="launcher__title">
          <strong>Daily on Dot</strong>
          <span class="launcher__count" data-launcher-count></span>
        </div>
      </header>
      <div class="launcher__list" data-launcher-list role="group" aria-label="Pick a game"></div>
      <footer class="launcher__foot">
        <button type="button" class="launcher__play" data-launcher-play>Play</button>
        <button type="button" class="launcher__open" data-launcher-open>Open Daily on Dot</button>
      </footer>
    </section>
  `;
  const section = root.querySelector<HTMLElement>("[data-launcher]");
  const head = root.querySelector<HTMLElement>(".launcher__head");
  const count = root.querySelector<HTMLElement>("[data-launcher-count]");
  const list = root.querySelector<HTMLElement>("[data-launcher-list]");
  const play = root.querySelector<HTMLButtonElement>("[data-launcher-play]");
  const open = root.querySelector<HTMLButtonElement>("[data-launcher-open]");
  if (!section || !head || !count || !list || !play || !open) {
    throw new Error("Card launcher failed to render");
  }

  let disposed = false;
  let opening = false;
  let state: TodayState = emptyState(currentPicks());
  // The row the Play button opens. Starts on the first unplayed game; a tap
  // moves it; a refresh keeps it unless the user has not picked yet.
  let selected: Game | null = null;
  let picked = false;

  const openGame = (route?: string): void => {
    if (opening) {
      return;
    }
    opening = true;
    section.classList.add("is-opening");
    void (async () => {
      if (route) {
        await writeOpenIntent(route);
      }
      await openFullApp(route);
    })()
      .catch((error: unknown) => {
        console.warn("[daily-on-dot] launcher open failed", error);
      })
      .finally(() => {
        opening = false;
        section.classList.remove("is-opening");
      });
  };

  const paint = (): void => {
    const day = today();
    const games = pickedGames(state.picks);
    const states = games.map((game): RowState =>
      hasGameBit(state.bits.played, game.gameId)
        ? "done"
        : hasStarted(game.gameId, day)
          ? "started"
          : "fresh",
    );
    const done = states.filter((entry) => entry === "done").length;
    count.textContent = `${done}/${games.length} done`;
    head.querySelector("[data-launcher-streak]")?.remove();
    if (state.streak !== null && state.streak > 0) {
      head.append(streakBadge(state.streak));
    }
    if (!picked || !selected || !games.includes(selected)) {
      // The first game not yet done, a started one included.
      const nextIndex = states.findIndex((entry) => entry !== "done");
      selected = games[nextIndex === -1 ? 0 : nextIndex]!;
    }
    list.replaceChildren(
      ...games.map((game, index) => {
        const button = row(game, states[index]!, game === selected);
        button.addEventListener("click", () => {
          picked = true;
          selected = game;
          paint();
        });
        return button;
      }),
    );
    const current = selected!;
    play.textContent = `${PLAY_VERB[states[games.indexOf(current)]!]} ${current.name}`;
    // The Play button fills in the selected game's accent.
    section.dataset.launcherSelected = current.id;
  };
  paint();

  const refresh = (): void => {
    void readTodayState()
      .then((next) => {
        if (disposed) return;
        state = next;
        paint();
      })
      .catch((error: unknown) => {
        console.warn("[daily-on-dot] launcher checklist read failed", error);
      });
  };
  refresh();
  // The host keeps the card's app session warm between opens (pets' finding):
  // re-read the ticks when the sheet comes back on screen.
  const onVisible = (): void => {
    if (!document.hidden) refresh();
  };
  document.addEventListener("visibilitychange", onVisible);
  play.addEventListener("click", () => {
    if (selected) openGame(selected.route);
  });
  open.addEventListener("click", () => openGame());

  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisible);
  };
}
