import { dayIndexFromDate } from "../day";
import type { Game } from "../roster";
import type { HubStreaks } from "../streaks";
import { icon } from "./icons";
import { openRules } from "./rules";
import { createStreakPill } from "./streak-badges";

export type HeaderLeft = "menu" | "back";

export interface HeaderHandle {
  element: HTMLElement;
  setStreaks(streaks: Pick<HubStreaks, "any">): void;
  /** The centered slot: null is the hub's "Daily on Dot"; a string is a screen's eyebrow ("Daily Word · Day 294"). */
  setTitle(text: string | null): void;
  /** The 44 px circle on the left: the hamburger on the hub, the back arrow everywhere else. */
  setLeft(kind: HeaderLeft): void;
  /** Where the back circle goes (`setLeft` resets it to today). */
  setBack(href: string, label: string): void;
  /**
   * A game screen (Game board): accent dot and short name centered, the day
   * pill on the right. On a past day the pill is "‹ DAY N ›": the same game
   * a day earlier or later (Archive board).
   */
  setGame(game: Pick<Game, "id" | "name" | "short" | "route">, day: number): void;
}

export interface HeaderOptions {
  onMenu?: () => void;
}

let current: HeaderHandle | null = null;
let currentTitle: string | null = null;

/** A screen sets its eyebrow in the header without a handle; `main.ts` clears it on every route. */
export function setHeaderTitle(text: string | null): void {
  currentTitle = text;
  current?.setTitle(text);
}

/** A game screen sets its header (Game board) without a handle; the result shows the eyebrow instead. */
export function setHeaderGame(game: Pick<Game, "id" | "name" | "short" | "route">, day: number): void {
  currentTitle = `${game.short} · Day ${day}`;
  current?.setGame(game, day);
}

/** The eyebrow a screen last set (tests read it; a header may not exist). */
export function headerTitle(): string | null {
  return currentTitle;
}

/**
 * The per-screen header the boards draw: a 44 px circle on the left, the
 * title or a screen's eyebrow centered, the streak pill on the right of the
 * hub (a spacer elsewhere keeps the title centered). No hairline, no blur.
 */
export function createHeader(options: HeaderOptions = {}): HeaderHandle {
  const header = document.createElement("header");
  header.className = "site-header";

  const menu = document.createElement("button");
  menu.className = "header-circle";
  menu.type = "button";
  menu.setAttribute("aria-label", "Menu");
  menu.innerHTML = icon("menu");
  menu.addEventListener("click", () => options.onMenu?.());

  const back = document.createElement("a");
  back.className = "header-circle";
  back.href = "#/";
  back.setAttribute("aria-label", "Back to today");
  back.innerHTML = icon("back");

  const title = document.createElement("span");
  title.className = "site-title";

  const right = document.createElement("div");
  right.className = "header-right";
  const pill = createStreakPill();
  const dayPill = document.createElement("span");
  dayPill.className = "header-day";
  dayPill.hidden = true;
  // How to play, on every game screen: opens over the board and closes back to it.
  const help = document.createElement("button");
  help.type = "button";
  help.className = "header-help";
  help.dataset.headerHelp = "";
  help.textContent = "?";
  help.hidden = true;
  let helpGame: Pick<Game, "id" | "name"> | null = null;
  help.addEventListener("click", () => {
    if (helpGame) {
      openRules(helpGame);
    }
  });
  right.append(pill.element, help, dayPill);

  header.append(menu, back, title, right);

  const setTitle = (text: string | null): void => {
    dayPill.hidden = true;
    help.hidden = true;
    if (text === null) {
      title.textContent = "Daily on Dot";
      title.dataset.kind = "title";
    } else {
      title.textContent = text;
      title.dataset.kind = "eyebrow";
    }
  };
  const setBack = (href: string, label: string): void => {
    back.href = href;
    back.setAttribute("aria-label", label);
  };
  const setLeft = (kind: HeaderLeft): void => {
    header.dataset.left = kind;
    setBack("#/", "Back to today");
    menu.hidden = kind !== "menu";
    back.hidden = kind !== "back";
    pill.element.hidden = kind !== "menu";
  };
  const setGame = (game: Pick<Game, "id" | "name" | "short" | "route">, day: number): void => {
    helpGame = game;
    help.hidden = false;
    help.setAttribute("aria-label", `How to play ${game.name}`);
    const dot = document.createElement("span");
    dot.className = "header-dot";
    dot.style.background = `var(--accent-${game.id})`;
    title.replaceChildren(dot, game.short);
    title.dataset.kind = "game";
    dayPill.hidden = false;
    const today = dayIndexFromDate(new Date());
    if (day >= today) {
      dayPill.className = "header-day";
      dayPill.removeAttribute("role");
      dayPill.removeAttribute("aria-label");
      dayPill.textContent = `Day ${day}`;
      return;
    }
    dayPill.className = "header-day header-day--switch";
    dayPill.setAttribute("role", "group");
    dayPill.setAttribute("aria-label", `${game.short} on another day`);
    const step = (target: number, kind: "back" | "forward"): HTMLElement => {
      if (target < 0) {
        const none = document.createElement("span");
        none.className = "header-day-step";
        none.setAttribute("aria-hidden", "true");
        return none;
      }
      const link = document.createElement("a");
      link.className = "header-day-step";
      link.dataset.dayStep = kind;
      link.href = target >= today ? game.route : `${game.route}?day=${target}`;
      link.setAttribute("aria-label", `${game.short}, ${target >= today ? "today" : `Day ${target}`}`);
      link.innerHTML = icon(kind);
      return link;
    };
    const label = document.createElement("span");
    label.textContent = `Day ${day}`;
    dayPill.replaceChildren(step(day - 1, "back"), label, step(day + 1, "forward"));
  };
  setTitle(null);
  setLeft("menu");

  const handle: HeaderHandle = {
    element: header,
    setStreaks(streaks) {
      pill.set(streaks);
    },
    setTitle(text) {
      currentTitle = text;
      setTitle(text);
    },
    setLeft,
    setBack,
    setGame(game, day) {
      currentTitle = `${game.short} · Day ${day}`;
      setGame(game, day);
    },
  };
  current = handle;
  return handle;
}
