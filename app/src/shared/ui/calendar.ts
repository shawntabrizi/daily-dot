import type { DayBits } from "../data-source";

/**
 * Per-game calendars use played / archive / started; the all-games calendar
 * uses complete (every picked game finished, blue, D17c), any (a game
 * finished on the day, gold, D17b) and backfill (played later only, a tick).
 */
export type CalendarCellState =
  | "played"
  | "archive"
  | "started"
  | "empty"
  | "complete"
  | "any"
  | "backfill";

const STATE_LABELS: Record<CalendarCellState, string> = {
  played: "played",
  archive: "from archive",
  started: "started",
  empty: "no activity",
  complete: "every game you play finished",
  any: "a game finished on the day",
  backfill: "played later",
};

/** The week starts on Monday (the Streak board). */
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * The all-games cell: blue when every picked game was finished, on time or
 * later (D17c, measured against today's picks); gold when any roster game was
 * finished on the day itself (D17b); a tick when the day was only played
 * later; else empty.
 */
export function hubCellState(bits: DayBits, picks: bigint, roster: bigint): CalendarCellState {
  if ((bits.played & picks) === picks) {
    return "complete";
  }
  if ((bits.ontime & roster) !== 0n) {
    return "any";
  }
  if ((bits.played & roster) !== 0n) {
    return "backfill";
  }
  return "empty";
}

export interface CalendarEntry {
  date: Date;
  dayIndex: number | null;
  state: CalendarCellState;
  disabled: boolean;
  href?: string;
  /** Ringed in the text colour, `aria-current="date"`. */
  today?: boolean;
  /** A future day: dim number, hidden from assistive tech (the streaks page). */
  blank?: boolean;
  /**
   * Inside a perfect week (`perfectWeeks`). A Monday–Sunday row whose seven
   * cells all carry this is drawn as one gold bar.
   */
  perfectWeek?: boolean;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });

function createCell(entry: CalendarEntry): HTMLElement {
  if (entry.blank) {
    const blank = document.createElement("span");
    blank.className = "calendar-day calendar-day--blank";
    blank.setAttribute("aria-hidden", "true");
    blank.innerHTML = `<span class="calendar-day-number">${entry.date.getUTCDate()}</span>`;
    return blank;
  }
  const element = entry.href && !entry.disabled
    ? document.createElement("a")
    : document.createElement("span");
  element.className = `calendar-day calendar-day--${entry.state}`;
  if (entry.disabled) {
    element.classList.add("calendar-day--disabled");
  }
  if (entry.today) {
    element.classList.add("calendar-day--today");
    element.setAttribute("aria-current", "date");
  }
  if (element instanceof HTMLAnchorElement && entry.href) {
    element.href = entry.href;
  }
  element.setAttribute(
    "aria-label",
    `${DATE_FORMAT.format(entry.date)}: ${STATE_LABELS[entry.state]}`,
  );
  element.innerHTML = `
    <span class="calendar-day-number">${entry.date.getUTCDate()}</span>
    <span class="calendar-day-dot" aria-hidden="true">${entry.state === "backfill" ? "✓" : ""}</span>
  `;
  return element;
}

export function createCalendar(
  year: number,
  month: number,
  entries: readonly CalendarEntry[],
): HTMLElement {
  const calendar = document.createElement("div");
  calendar.className = "calendar";
  calendar.setAttribute("aria-label", MONTH_FORMAT.format(new Date(Date.UTC(year, month, 1))));

  const weekdays = document.createElement("div");
  weekdays.className = "calendar-weekdays";
  for (const weekday of WEEKDAYS) {
    const label = document.createElement("span");
    label.textContent = weekday;
    weekdays.append(label);
  }
  calendar.append(weekdays);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  // Monday is column one: `getUTCDay()` is 0 on a Sunday, 1 on a Monday.
  const leading = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const slots: { element: HTMLElement; entry: CalendarEntry | null }[] = [];
  for (let index = 0; index < leading; index += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    spacer.setAttribute("aria-hidden", "true");
    slots.push({ element: spacer, entry: null });
  }
  for (const entry of entries) {
    slots.push({ element: createCell(entry), entry });
  }

  // A row of seven perfect-week days becomes one bar; every other row is
  // laid straight into the grid.
  for (let start = 0; start < slots.length; start += 7) {
    const row = slots.slice(start, start + 7);
    const perfect = row.length === 7 && row.every((slot) => slot.entry?.perfectWeek);
    if (!perfect) {
      grid.append(...row.map((slot) => slot.element));
      continue;
    }
    const bar = document.createElement("span");
    bar.className = "calendar-week calendar-week--perfect";
    const first = row[0]!.entry!.date;
    const last = row[6]!.entry!.date;
    bar.setAttribute(
      "aria-label",
      `Perfect week, ${first.getUTCDate()} to ${last.getUTCDate()} ${DAY_MONTH_FORMAT.format(last)}`,
    );
    bar.append(...row.map((slot) => slot.element));
    grid.append(bar);
  }

  calendar.append(grid);
  return calendar;
}
