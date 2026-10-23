import type { DataSource, DayBits } from "../data-source";
import { dateFromDayIndex } from "../day";
import { GAME_ROSTER } from "../roster";
import { hasGameBit } from "../streaks";
import { icon } from "./icons";

const EMPTY_BITS: DayBits = { played: 0n, solved: 0n, ontime: 0n };

interface ActivityDay {
  day: number;
  date: Date;
  played: boolean;
}

export interface DrawerHandle {
  element: HTMLElement;
  open(): void;
  close(): void;
}

function countdownText(now = new Date()): string {
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const remaining = Math.max(0, tomorrow - now.getTime());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function activityDays(
  bits: readonly DayBits[],
  rangeStart: number,
  today: number,
): ActivityDay[] {
  const selected: ActivityDay[] = [];
  let consecutiveUnplayed = 0;

  for (let day = today; day >= rangeStart && selected.length < 30; day -= 1) {
    const dayBits = bits[day - rangeStart] ?? EMPTY_BITS;
    const played = dayBits.played !== 0n;
    selected.push({ day, date: dateFromDayIndex(day), played });
    consecutiveUnplayed = played ? 0 : consecutiveUnplayed + 1;

    if (selected.length >= 10 && consecutiveUnplayed >= 3) {
      break;
    }
  }

  return selected.reverse();
}

function renderActivityTrack(days: readonly ActivityDay[]): HTMLElement {
  const track = document.createElement("div");
  track.className = "activity-track";

  days.forEach((day, index) => {
    const previous = days[index - 1];
    if (previous) {
      const connector = document.createElement("span");
      connector.className = "activity-connector";
      if (previous.played && day.played) {
        connector.classList.add("activity-connector--played");
      }
      connector.setAttribute("aria-hidden", "true");
      track.append(connector);
    }

    // Each day opens its day page, where any of its games can be played.
    const circle = document.createElement("a");
    circle.href = `#/day?day=${day.day}`;
    circle.className = "activity-day";
    circle.classList.add(
      day.played ? "activity-day--played" : "activity-day--unplayed",
    );
    if (index === days.length - 1) {
      circle.classList.add("activity-day--today");
      circle.setAttribute("aria-current", "date");
    }
    circle.textContent = String(day.date.getUTCDate());
    circle.setAttribute(
      "aria-label",
      `${day.date.toLocaleDateString("en", {
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })}, ${day.played ? "played" : "not played"}`,
    );
    track.append(circle);
  });

  return track;
}

/**
 * The drawer behind the hub's hamburger: Today, Archive, Streaks, the Pocket
 * card and the six games with today's ticks, then the activity strip. It
 * closes on the backdrop, the close button and any navigation.
 */
export function createDrawer(
  source: DataSource,
  onStateChange?: (open: boolean) => void,
): DrawerHandle {
  const shell = document.createElement("div");
  shell.className = "drawer-shell";
  shell.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.className = "drawer-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close menu");

  const drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.setAttribute("aria-label", "Game menu");

  const heading = document.createElement("div");
  heading.className = "drawer-heading";
  heading.innerHTML = "<strong>Daily on Dot</strong>";
  const closeButton = document.createElement("button");
  closeButton.className = "icon-button";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close menu");
  closeButton.innerHTML = icon("close");
  heading.append(closeButton);

  const nav = document.createElement("nav");
  nav.className = "drawer-nav";
  nav.innerHTML = `
    <a href="#/">Today</a>
    <a href="#/history">Archive</a>
    <a href="#/streaks">Streaks</a>
    <a href="#/card">Pocket card</a>
    <span class="drawer-label">Games</span>
  `;
  for (const game of GAME_ROSTER) {
    const link = document.createElement("a");
    link.className = "drawer-game-link";
    link.href = game.route;

    const name = document.createElement("span");
    name.textContent = game.name;
    const check = document.createElement("span");
    check.className = "drawer-completion-check";
    check.dataset.drawerGameCheck = game.id;
    check.setAttribute("aria-label", `${game.name} completed`);
    check.textContent = "✓";
    check.hidden = true;

    link.append(name, check);
    nav.append(link);
  }

  const activity = document.createElement("section");
  activity.className = "drawer-activity";
  activity.innerHTML = `
    <div class="drawer-activity-heading">
      <strong data-activity-label>ACTIVITY</strong>
      <span data-drawer-countdown>${countdownText()}</span>
    </div>
    <div class="activity-strip" data-activity-strip>
      <span class="activity-loading">Loading activity…</span>
    </div>
    <p class="drawer-nudge">Play a game to keep the streak alive!</p>
  `;

  drawer.append(heading, nav, activity);
  shell.append(backdrop, drawer);

  const activityLabel = activity.querySelector<HTMLElement>("[data-activity-label]");
  const activityStrip = activity.querySelector<HTMLElement>("[data-activity-strip]");
  const countdown = activity.querySelector<HTMLElement>("[data-drawer-countdown]");
  if (!activityLabel || !activityStrip || !countdown) {
    throw new Error("Drawer activity shell failed to render");
  }

  let activityRequest = 0;
  let countdownTimer = 0;

  const hydrateActivity = async (): Promise<void> => {
    const request = ++activityRequest;

    try {
      const today = await source.currentDay();
      const rangeStart = Math.max(0, today - 29);
      const bits = await source.dayBitsRange(rangeStart, today - rangeStart + 1);
      if (request !== activityRequest) {
        return;
      }

      const todayBits = bits[today - rangeStart] ?? EMPTY_BITS;
      for (const game of GAME_ROSTER) {
        const check = nav.querySelector<HTMLElement>(
          `[data-drawer-game-check="${game.id}"]`,
        );
        if (check) {
          check.hidden = !hasGameBit(todayBits.played, game.gameId);
        }
      }

      const todayDate = dateFromDayIndex(today);
      const month = todayDate.toLocaleDateString("en", {
        month: "long",
        timeZone: "UTC",
      });
      activityLabel.textContent = `${month.toUpperCase()} ACTIVITY`;
      activityStrip.replaceChildren(
        renderActivityTrack(activityDays(bits, rangeStart, today)),
      );
      activityStrip.scrollLeft = activityStrip.scrollWidth;
    } catch {
      if (request === activityRequest) {
        const message = document.createElement("span");
        message.className = "activity-loading";
        message.textContent = "Activity unavailable.";
        const retry = document.createElement("button");
        retry.className = "read-retry";
        retry.type = "button";
        retry.textContent = "Try again";
        retry.addEventListener("click", () => void hydrateActivity());
        activityStrip.replaceChildren(message, retry);
      }
    }
  };

  const close = (): void => {
    activityRequest += 1;
    window.clearInterval(countdownTimer);
    shell.classList.remove("is-open");
    shell.hidden = true;
    onStateChange?.(false);
  };
  const open = (): void => {
    shell.hidden = false;
    requestAnimationFrame(() => shell.classList.add("is-open"));
    onStateChange?.(true);
    closeButton.focus();
    countdown.textContent = countdownText();
    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(() => {
      countdown.textContent = countdownText();
    }, 1_000);
    void hydrateActivity();
  };

  backdrop.addEventListener("click", close);
  closeButton.addEventListener("click", close);
  nav.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) {
      close();
    }
  });

  return { element: shell, open, close };
}
