import type { HubStreaks } from "../streaks";

/** Gold flame: the any-game streak, the boards' 16×20 path. The one copy; the launcher and the streaks page import it. */
export const FLAME_SVG =
  '<svg aria-hidden="true" viewBox="0 0 16 20" fill="currentColor"><path d="M8 0c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/></svg>';

/** Blue diamond: the all-games streak, the boards' "◆" character. */
export const GEM_CHAR = "\u25C6";

/** Crystal-blue gem: the all-games streak (D17c). */
export const GEM_SVG =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10l4 6-9 12L3 9z"/><path d="M7 3l5 6 5-6M3 9h18M12 9l-4 12M12 9l4 12" fill="none" stroke="#121415" stroke-width="1.2" opacity=".55"/></svg>';

export interface StreakBadgeOptions {
  /** Show a count of 0 or 1 too (the summary); the header hides below 2 (D17). */
  always?: boolean;
}

/** Both hub streak counts: gold flame for any game, blue gem for all games. */
export function createStreakBadges(
  streaks: Pick<HubStreaks, "any" | "all">,
  options: StreakBadgeOptions = {},
): HTMLElement {
  const root = document.createElement("div");
  root.className = "streak-badges";
  root.dataset.streakBadges = "";
  for (const [kind, count, mark, label] of [
    ["any", streaks.any, FLAME_SVG, "any-game"],
    ["all", streaks.all, GEM_SVG, "all-games"],
  ] as const) {
    const badge = document.createElement("span");
    badge.className = `streak-badge streak-badge--${kind}`;
    badge.dataset[kind === "any" ? "streakAny" : "streakAll"] = String(count);
    badge.setAttribute("title", `${count}-day ${label} streak`);
    badge.setAttribute("aria-label", `${count}-day ${label} streak`);
    badge.innerHTML = `${mark}<strong>${count}</strong>`;
    badge.hidden = !options.always && count < 2;
    root.append(badge);
  }
  return root;
}

export interface StreakPillHandle {
  element: HTMLAnchorElement;
  set(streaks: Pick<HubStreaks, "any" | "all">): void;
}

/**
 * The header pill: a 36 px gold-tinted pill with a blue inset ring inside a
 * 44 px target. The gold flame and the any-game streak, then "◆n" in blue
 * once the all-games streak is above 0. It links to the streaks route.
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
      <span class="streak-pill-all" hidden>${GEM_CHAR}<strong data-streak-all></strong></span>
    </span>
  `;
  const any = pill.querySelector<HTMLElement>("[data-streak-any]")!;
  const all = pill.querySelector<HTMLElement>("[data-streak-all]")!;
  const allWrap = pill.querySelector<HTMLElement>(".streak-pill-all")!;
  return {
    element: pill,
    set(streaks) {
      any.textContent = String(streaks.any);
      all.textContent = String(streaks.all);
      allWrap.hidden = streaks.all === 0;
      pill.setAttribute(
        "aria-label",
        `Streaks: ${streaks.any}-day streak, ${streaks.all}-day all-six streak`,
      );
    },
  };
}
