import type { ViewHandle } from "./home";
import type { DataSource, DayBits } from "./shared/data-source";
import { EPOCH_SECONDS, dateFromDayIndex, dayIndexFromTimestamp } from "./shared/day";
import { readDays } from "./shared/day-summary";
import { picksMask } from "./shared/picks";
import { GAME_ROSTER } from "./shared/roster";
import { deriveHubStreaks, nextMilestone, perfectWeeks, rosterMask } from "./shared/streaks";
import { createCalendar, hubCellState, type CalendarEntry } from "./shared/ui/calendar";

const MASK = rosterMask(GAME_ROSTER.map((game) => game.gameId));
const EMPTY: DayBits = { played: 0n, solved: 0n, ontime: 0n };
const MONTH_FORMAT = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The Streak board's flame (gold) and the finished-games tick; the tile and badge marks. */
const FLAME_PATH = "M8 0c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z";
const FLAME_SVG = `<svg viewBox="0 0 16 20" aria-hidden="true"><path d="${FLAME_PATH}" fill="currentColor"/></svg>`;
const TICK_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Null before the epoch (day 0 is 2026-01-01). */
function dayForDate(date: Date): number | null {
  const seconds = date.getTime() / 1_000;
  return seconds < EPOCH_SECONDS ? null : dayIndexFromTimestamp(seconds);
}

/** "19 played": the month's days with a game finished, on time or later. */
export function monthLine(days: readonly DayBits[]): string {
  return `${days.filter((bits) => (bits.played & MASK) !== 0n).length} played`;
}

/**
 * `#/streaks`, behind the header pill: the Streak board. The streak and the
 * lifetime games-finished tiles,
 * the month calendar with its perfect-week bars, the next badge and the
 * grace rule. Every day since the epoch is read once, as the archive does,
 * so the best streak and the lifetime count are exact; month navigation re-renders from that
 * read.
 */
export function renderStreaks(source: DataSource): ViewHandle {
  const page = document.createElement("section");
  page.className = "page streaks-page";
  page.innerHTML = `
    <div class="streak-tiles">
      <div class="streak-tile streak-tile--any" data-tile-any>
        <span class="streak-tile-mark" aria-hidden="true">${FLAME_SVG}</span>
        <strong class="streak-tile-count" data-streak-any>–</strong>
        <span class="streak-tile-label">Day streak</span>
        <span class="streak-tile-note">Any one game, any day. Best <span data-longest-any>–</span>.</span>
      </div>
      <div class="streak-tile streak-tile--finished" data-tile-finished>
        <span class="streak-tile-mark" aria-hidden="true">${TICK_SVG}</span>
        <strong class="streak-tile-count" data-finished>–</strong>
        <span class="streak-tile-label">Games finished</span>
        <span class="streak-tile-note">Every game you have played, on the day or later.</span>
      </div>
    </div>
    <section class="streak-month" aria-label="Month">
      <div class="streak-month-head">
        <h2 data-month-label>Loading…</h2>
        <span class="streak-month-line" data-month-line></span>
      </div>
      <div data-calendar class="calendar-loading">Loading calendar…</div>
      <div class="streak-month-foot">
        <div class="streak-legend" aria-label="Calendar legend">
          <span><i class="streak-swatch streak-swatch--played"></i>Played</span>
          <span><i class="streak-swatch streak-swatch--complete"></i>Complete</span>
          <span><i class="streak-swatch streak-swatch--week"></i>Perfect week</span>
        </div>
        <div class="streak-month-nav">
          <button class="streak-month-button" type="button" data-previous aria-label="Previous month">‹</button>
          <button class="streak-month-button" type="button" data-next aria-label="Next month">›</button>
        </div>
      </div>
    </section>
    <section class="streak-next" aria-label="Next badge" data-milestone hidden>
      <p class="eyebrow streak-next-eyebrow">Next badge</p>
      <div class="streak-next-card">
        <span class="streak-next-mark" aria-hidden="true">${FLAME_SVG}</span>
        <span class="streak-next-body">
          <span class="streak-next-label" data-milestone-label></span>
          <span class="streak-progress" role="progressbar" aria-valuemin="0" data-progress>
            <span class="streak-progress-fill" data-progress-fill></span>
          </span>
        </span>
        <span class="streak-next-count" data-milestone-count></span>
      </div>
    </section>
    <p class="streak-rule">A day counts until the next set drops. Past days you fill in later count for the calendar, not the streak.</p>
  `;

  const anyNode = page.querySelector<HTMLElement>("[data-streak-any]");
  const finishedNode = page.querySelector<HTMLElement>("[data-finished]");
  const longestAnyNode = page.querySelector<HTMLElement>("[data-longest-any]");
  const monthLabel = page.querySelector<HTMLElement>("[data-month-label]");
  const monthLineNode = page.querySelector<HTMLElement>("[data-month-line]");
  const calendarNode = page.querySelector<HTMLElement>("[data-calendar]");
  const previous = page.querySelector<HTMLButtonElement>("[data-previous]");
  const next = page.querySelector<HTMLButtonElement>("[data-next]");
  const milestone = page.querySelector<HTMLElement>("[data-milestone]");
  const milestoneLabel = page.querySelector<HTMLElement>("[data-milestone-label]");
  const milestoneCount = page.querySelector<HTMLElement>("[data-milestone-count]");
  const progress = page.querySelector<HTMLElement>("[data-progress]");
  const progressFill = page.querySelector<HTMLElement>("[data-progress-fill]");
  if (
    !anyNode
    || !finishedNode
    || !longestAnyNode
    || !monthLabel
    || !monthLineNode
    || !calendarNode
    || !previous
    || !next
    || !milestone
    || !milestoneLabel
    || !milestoneCount
    || !progress
    || !progressFill
  ) {
    throw new Error("Streaks shell failed to render");
  }

  let today = 0;
  let days: DayBits[] = [];
  let weeks = new Set<number>();
  let visibleYear = 2026;
  let visibleMonth = 0;
  let request = 0;
  let disposed = false;

  const renderMonth = (): void => {
    const firstDate = new Date(Date.UTC(visibleYear, visibleMonth, 1));
    const todayDate = dateFromDayIndex(today);
    // The board shows "October"; the year only when the view leaves this one.
    monthLabel.textContent = (
      visibleYear === todayDate.getUTCFullYear() ? MONTH_FORMAT : MONTH_YEAR_FORMAT
    ).format(firstDate);
    const count = daysInMonth(visibleYear, visibleMonth);
    const picks = picksMask();
    const entries: CalendarEntry[] = [];
    const monthDays: DayBits[] = [];
    for (let offset = 0; offset < count; offset += 1) {
      const date = new Date(Date.UTC(visibleYear, visibleMonth, offset + 1));
      const day = dayForDate(date);
      if (day !== null && day > today) {
        entries.push({ date, dayIndex: day, state: "empty", disabled: true, blank: true });
        continue;
      }
      const bits = day === null ? EMPTY : days[day] ?? EMPTY;
      if (day !== null) {
        monthDays.push(bits);
      }
      entries.push({
        date,
        dayIndex: day,
        state: day === null ? "empty" : hubCellState(bits, picks, MASK),
        disabled: day === null,
        href: day !== null && (bits.played & MASK) !== 0n ? `#/day?day=${day}` : undefined,
        today: day === today,
        perfectWeek: day !== null && weeks.has(day),
      });
    }
    monthLineNode.textContent = monthLine(monthDays);
    calendarNode.className = "";
    calendarNode.replaceChildren(createCalendar(visibleYear, visibleMonth, entries));

    next.disabled =
      visibleYear > todayDate.getUTCFullYear()
      || (visibleYear === todayDate.getUTCFullYear() && visibleMonth >= todayDate.getUTCMonth());
    previous.disabled = visibleYear < 2026 || (visibleYear === 2026 && visibleMonth === 0);
  };

  const renderStreakTiles = (): void => {
    const streaks = deriveHubStreaks(days, MASK);
    anyNode.textContent = String(streaks.any);
    finishedNode.textContent = String(streaks.finished);
    longestAnyNode.textContent = String(streaks.longestAny);

    const target = nextMilestone(streaks.any);
    milestone.hidden = target === null;
    if (target !== null) {
      milestoneLabel.textContent = `${target}-day streak`;
      milestoneCount.textContent = `${streaks.any} / ${target}`;
      progress.setAttribute("aria-valuemax", String(target));
      progress.setAttribute("aria-valuenow", String(streaks.any));
      progress.setAttribute("aria-label", `${streaks.any} of ${target} days`);
      progressFill.style.width = `${Math.min(100, (streaks.any / target) * 100)}%`;
    }
  };

  const showReadError = (): void => {
    calendarNode.className = "calendar-error";
    const text = document.createElement("span");
    text.textContent = "Streaks could not be loaded.";
    const button = document.createElement("button");
    button.className = "button-link button-link--button";
    button.type = "button";
    button.textContent = "Try again";
    button.addEventListener("click", () => void load());
    calendarNode.replaceChildren(text, button);
  };

  const load = async (): Promise<void> => {
    const current = ++request;
    calendarNode.className = "calendar-loading";
    calendarNode.textContent = "Loading calendar…";
    try {
      today = await source.currentDay();
      days = await readDays(source, 0, today);
      if (disposed || current !== request) {
        return;
      }
      weeks = perfectWeeks(days, MASK);
      const todayDate = dateFromDayIndex(today);
      visibleYear = todayDate.getUTCFullYear();
      visibleMonth = todayDate.getUTCMonth();
      renderStreakTiles();
      renderMonth();
    } catch {
      if (!disposed && current === request) {
        showReadError();
      }
    }
  };

  const shiftMonth = (delta: number): void => {
    const shifted = new Date(Date.UTC(visibleYear, visibleMonth + delta, 1));
    visibleYear = shifted.getUTCFullYear();
    visibleMonth = shifted.getUTCMonth();
    renderMonth();
  };
  previous.addEventListener("click", () => shiftMonth(-1));
  next.addEventListener("click", () => shiftMonth(1));
  void load();

  return {
    element: page,
    dispose() {
      disposed = true;
      request += 1;
    },
  };
}
