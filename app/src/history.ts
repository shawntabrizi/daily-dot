import type { DataSource, DayBits } from "./shared/data-source";
import { DAY_SECONDS, EPOCH_SECONDS, dateFromDayIndex, dayIndexFromTimestamp } from "./shared/day";
import { readDays } from "./shared/day-summary";
import { picksMask } from "./shared/picks";
import { hasStarted } from "./shared/progress";
import { GAME_ROSTER, type Game } from "./shared/roster";
import {
  deriveGameStats,
  deriveHubStreaks,
  hasGameBit,
  rosterMask,
} from "./shared/streaks";
import {
  createCalendar,
  hubCellState,
  type CalendarCellState,
  type CalendarEntry,
} from "./shared/ui/calendar";
import { createStreakBadge } from "./shared/ui/streak-badges";
import type { ViewHandle } from "./home";

/** The select's first option: the all-games calendar (D17b, D17c). */
const ALL_GAMES = "all";
const ROSTER_MASK = rosterMask(GAME_ROSTER.map((game) => game.gameId));

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function dayForDate(date: Date): number | null {
  const seconds = date.getTime() / 1_000;
  if (seconds < EPOCH_SECONDS) {
    return null;
  }
  return dayIndexFromTimestamp(seconds);
}

function cellState(bits: DayBits, game: Game, day: number): CalendarCellState {
  const played = hasGameBit(bits.played, game.gameId);
  const solved = hasGameBit(bits.solved, game.gameId);
  const ontime = hasGameBit(bits.ontime, game.gameId);
  if (played && solved && ontime) {
    return "played";
  }
  if (played && !ontime) {
    return "archive";
  }
  if (!played && hasStarted(game.gameId, day)) {
    return "started";
  }
  return "empty";
}

export function renderHistory(source: DataSource): ViewHandle {
  const page = document.createElement("section");
  page.className = "page history-page";
  page.innerHTML = `
    <div class="history-heading">
      <div>
        <p class="eyebrow">ARCHIVE</p>
        <h1>Your daily trail.</h1>
      </div>
    </div>
    <div class="game-chips" role="group" aria-label="Game" data-game-chips>
      <button type="button" class="game-chip" data-game-chip="${ALL_GAMES}" aria-pressed="true">All</button>
      ${GAME_ROSTER.map((game) => `<button type="button" class="game-chip" data-game-chip="${game.id}" aria-pressed="false">${game.short}</button>`).join("")}
    </div>
    <div class="stats-panel" aria-live="polite" data-game-stats hidden>
      <div><strong data-played>—</strong><span>PLAYED</span></div>
      <div><strong data-win-rate>—</strong><span>WIN RATE</span></div>
      <div class="streak-stat"><strong data-streak>—</strong><span>DAY STREAK</span></div>
    </div>
    <div class="stats-panel stats-panel--hub" aria-live="polite" data-hub-stats hidden>
      <div class="hub-streak-stat" data-hub-streaks></div>
      <div><strong data-finished>—</strong><span>GAMES FINISHED</span></div>
      <div><strong data-longest-any>—</strong><span>BEST STREAK</span></div>
    </div>
    <div class="month-panel">
      <div class="month-controls">
        <button class="icon-button month-button" type="button" data-previous aria-label="Previous month">←</button>
        <h2 data-month-label>Loading…</h2>
        <button class="icon-button month-button" type="button" data-next aria-label="Next month">→</button>
      </div>
      <div data-calendar class="calendar-loading">Loading calendar…</div>
      <div class="calendar-legend" aria-label="Calendar legend" data-game-legend hidden>
        <span><i class="legend-dot legend-dot--played"></i>Played</span>
        <span><i class="legend-dot legend-dot--started"></i>Started</span>
        <span><i class="legend-dot legend-dot--archive"></i>From Archive</span>
        <span><i class="legend-dot legend-dot--empty"></i>Empty</span>
      </div>
      <div class="calendar-legend" aria-label="Calendar legend" data-hub-legend>
        <span><i class="legend-dot legend-dot--complete"></i>Complete</span>
        <span><i class="legend-dot legend-dot--any"></i>Any game</span>
        <span><i class="legend-dot legend-dot--backfill"></i>Played later</span>
        <span><i class="legend-dot legend-dot--empty"></i>Empty</span>
      </div>
    </div>
  `;

  // In-page chips, not a native <select>: the Polkadot app's web view does not open the native picker.
  const chips = page.querySelector<HTMLElement>("[data-game-chips]");
  const gameStats = page.querySelector<HTMLElement>("[data-game-stats]");
  const hubStats = page.querySelector<HTMLElement>("[data-hub-stats]");
  const hubStreaksNode = page.querySelector<HTMLElement>("[data-hub-streaks]");
  const finishedNode = page.querySelector<HTMLElement>("[data-finished]");
  const longestAnyNode = page.querySelector<HTMLElement>("[data-longest-any]");
  const gameLegend = page.querySelector<HTMLElement>("[data-game-legend]");
  const hubLegend = page.querySelector<HTMLElement>("[data-hub-legend]");
  const playedNode = page.querySelector<HTMLElement>("[data-played]");
  const winRateNode = page.querySelector<HTMLElement>("[data-win-rate]");
  const streakNode = page.querySelector<HTMLElement>("[data-streak]");
  const monthLabel = page.querySelector<HTMLElement>("[data-month-label]");
  const calendarNode = page.querySelector<HTMLElement>("[data-calendar]");
  const previous = page.querySelector<HTMLButtonElement>("[data-previous]");
  const next = page.querySelector<HTMLButtonElement>("[data-next]");
  if (
    !chips ||
    !gameStats ||
    !hubStats ||
    !hubStreaksNode ||
    !finishedNode ||
    !longestAnyNode ||
    !gameLegend ||
    !hubLegend ||
    !playedNode ||
    !winRateNode ||
    !streakNode ||
    !monthLabel ||
    !calendarNode ||
    !previous ||
    !next
  ) {
    throw new Error("History shell failed to render");
  }

  let selected: string = ALL_GAMES;
  let today = 0;
  let visibleYear = 2026;
  let visibleMonth = 0;
  let requestNumber = 0;
  let disposed = false;

  /** Null means the all-games calendar. */
  const selectedGame = (): Game | null =>
    selected === ALL_GAMES
      ? null
      : GAME_ROSTER.find((game) => game.id === selected) ?? null;

  const showReadError = (
    message: string,
    retry: () => void,
  ): void => {
    calendarNode.className = "calendar-error";
    const text = document.createElement("span");
    text.textContent = message;
    const button = document.createElement("button");
    button.className = "button-link button-link--button";
    button.type = "button";
    button.textContent = "Try again";
    button.addEventListener("click", retry);
    calendarNode.replaceChildren(text, button);
  };

  const monthEntries = (
    count: number,
    startDay: number,
    bitsAt: (offset: number) => DayBits,
    state: (bits: DayBits, day: number) => CalendarCellState,
    href: (bits: DayBits, day: number) => string | undefined,
  ): CalendarEntry[] =>
    Array.from({ length: count }, (_, offset) => {
      const date = new Date(Date.UTC(visibleYear, visibleMonth, offset + 1));
      const day = dayForDate(date);
      const disabled = day === null || day < startDay || day > today;
      const bits = bitsAt(offset);
      return {
        date,
        dayIndex: day,
        state: day === null ? "empty" : state(bits, day),
        disabled,
        href: day !== null && !disabled ? href(bits, day) : undefined,
      };
    });

  const finishCalendar = (entries: CalendarEntry[]): void => {
    calendarNode.className = "";
    calendarNode.replaceChildren(createCalendar(visibleYear, visibleMonth, entries));
    const todayDate = dateFromDayIndex(today);
    next.disabled =
      visibleYear > todayDate.getUTCFullYear() ||
      (visibleYear === todayDate.getUTCFullYear() &&
        visibleMonth >= todayDate.getUTCMonth());
    previous.disabled =
      visibleYear < 2026 || (visibleYear === 2026 && visibleMonth === 0);
  };

  /**
   * The all-games calendar: every day since the epoch in one pass (five
   * reads in the first year), so the lifetime count and the best streak are
   * exact.
   */
  const hydrateHub = async (request: number, count: number, firstDay: number | null): Promise<void> => {
    const days = await readDays(source, 0, today);
    if (disposed || request !== requestNumber) {
      return;
    }
    const streaks = deriveHubStreaks(days, ROSTER_MASK);
    hubStreaksNode.replaceChildren(createStreakBadge(streaks, { always: true }));
    finishedNode.textContent = String(streaks.finished);
    longestAnyNode.textContent = String(streaks.longestAny);

    const empty: DayBits = { played: 0n, solved: 0n, ontime: 0n };
    const picks = picksMask();
    finishCalendar(
      monthEntries(
        count,
        0,
        (offset) => (firstDay === null ? empty : days[firstDay + offset] ?? empty),
        (bits) => hubCellState(bits, picks, ROSTER_MASK),
        (bits, day) => ((bits.played & ROSTER_MASK) !== 0n ? `#/day?day=${day}` : undefined),
      ),
    );
  };

  const hydrate = async (): Promise<void> => {
    const request = ++requestNumber;
    const game = selectedGame();
    const count = daysInMonth(visibleYear, visibleMonth);
    const firstDate = new Date(Date.UTC(visibleYear, visibleMonth, 1));
    const firstDay = dayForDate(firstDate);
    gameStats.hidden = game === null;
    gameLegend.hidden = game === null;
    hubStats.hidden = game !== null;
    hubLegend.hidden = game !== null;

    monthLabel.textContent = new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(firstDate);
    calendarNode.className = "calendar-loading";
    calendarNode.textContent = "Loading calendar…";

    if (game === null) {
      try {
        await hydrateHub(request, count, firstDay);
      } catch {
        if (!disposed && request === requestNumber) {
          showReadError(
            "Calendar data could not be loaded.",
            () => void hydrate(),
          );
        }
      }
      return;
    }

    const statsFrom = Math.max(game.startDay, today - 63);
    const statsCount = today - statsFrom + 1;
    const monthRead =
      firstDay === null
        ? Promise.resolve(Array.from({ length: count }, () => ({ played: 0n, solved: 0n, ontime: 0n })))
        : source.dayBitsRange(firstDay, count);

    try {
      const [monthBits, statsBits] = await Promise.all([
        monthRead,
        source.dayBitsRange(statsFrom, statsCount),
      ]);
      if (disposed || request !== requestNumber) {
        return;
      }

      const stats = deriveGameStats(statsBits, game.gameId);
      playedNode.textContent = String(stats.played);
      winRateNode.textContent = `${Math.round(stats.winRate)}%`;
      streakNode.textContent = String(stats.streak);

      finishCalendar(
        monthEntries(
          count,
          game.startDay,
          (offset) => monthBits[offset] ?? { played: 0n, solved: 0n, ontime: 0n },
          (bits, day) => cellState(bits, game, day),
          (_bits, day) => `${game.route}?day=${day}`,
        ),
      );
    } catch {
      if (!disposed && request === requestNumber) {
        showReadError(
          "Calendar data could not be loaded.",
          () => void hydrate(),
        );
      }
    }
  };

  const shiftMonth = (delta: number): void => {
    const shifted = new Date(Date.UTC(visibleYear, visibleMonth + delta, 1));
    visibleYear = shifted.getUTCFullYear();
    visibleMonth = shifted.getUTCMonth();
    void hydrate();
  };

  previous.addEventListener("click", () => shiftMonth(-1));
  next.addEventListener("click", () => shiftMonth(1));
  chips.addEventListener("click", (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-game-chip]");
    if (!chip || chip.dataset.gameChip === selected) {
      return;
    }
    selected = chip.dataset.gameChip ?? ALL_GAMES;
    for (const other of chips.querySelectorAll<HTMLButtonElement>("[data-game-chip]")) {
      other.setAttribute("aria-pressed", String(other === chip));
    }
    void hydrate();
  });

  const loadCurrentDay = async (): Promise<void> => {
    const request = ++requestNumber;
    calendarNode.className = "calendar-loading";
    calendarNode.textContent = "Loading calendar…";
    try {
      const currentDay = await source.currentDay();
      if (disposed || request !== requestNumber) {
        return;
      }
      today = currentDay;
      const currentDate = new Date((EPOCH_SECONDS + today * DAY_SECONDS) * 1_000);
      visibleYear = currentDate.getUTCFullYear();
      visibleMonth = currentDate.getUTCMonth();
      void hydrate();
    } catch {
      if (!disposed && request === requestNumber) {
        showReadError(
          "Calendar data could not be loaded.",
          () => void loadCurrentDay(),
        );
      }
    }
  };
  void loadCurrentDay();

  return {
    element: page,
    dispose() {
      disposed = true;
      requestNumber += 1;
    },
  };
}
