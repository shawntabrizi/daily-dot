import type { HubStreaks } from "../streaks";

/** Gold flame: the hub streak, the boards' 16×20 path. The one copy; the launcher and the streaks page import it. */
export const FLAME_SVG =
  '<svg aria-hidden="true" viewBox="0 0 16 20" fill="currentColor"><path d="M8 0c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/></svg>';

export interface StreakBadgeOptions {
  /** Show a count of 0 or 1 too (the summary); the header hides below 2 (D17). */
  always?: boolean;
}

/** The hub streak (D17b): the gold flame and the day count. */
export function createStreakBadge(
  streaks: Pick<HubStreaks, "any">,
  options: StreakBadgeOptions = {},
): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "streak-badge";
  badge.dataset.streakAny = String(streaks.any);
  badge.setAttribute("title", `${streaks.any}-day streak`);
  badge.setAttribute("aria-label", `${streaks.any}-day streak`);
  badge.innerHTML = `${FLAME_SVG}<strong>${streaks.any}</strong>`;
  badge.hidden = !options.always && streaks.any < 2;
  return badge;
}

export interface StreakPillHandle {
  element: HTMLAnchorElement;
  set(streaks: Pick<HubStreaks, "any">): void;
}

/**
 * The header pill: a 36 px gold-tinted pill inside a 44 px target with the
 * gold flame and the streak. It links to the streaks route.
 */
export function createStreakPill(): StreakPillHandle {
  const pill = document.createElement("a");
  pill.className = "streak-pill";
  pill.href = "#/streaks";
  pill.dataset.streakPill = "";
  pill.setAttribute("aria-label", "Streaks");
  pill.innerHTML = `
    <span class="streak-pill-body">
      <span class="streak-pill-any">${FLAME_SVG}<strong data-streak-any></strong></span>
    </span>
  `;
  const any = pill.querySelector<HTMLElement>("[data-streak-any]")!;
  return {
    element: pill,
    set(streaks) {
      any.textContent = String(streaks.any);
      pill.setAttribute("aria-label", `Streaks: ${streaks.any}-day streak`);
    },
  };
}
