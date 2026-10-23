import type { DataSource, DayBits } from "./shared/data-source";
import {
  dayComplete,
  loadDaySummary,
  loadHubStreaks,
  renderDaySummary,
  type GameSummary,
} from "./shared/day-summary";
import { pickedGames } from "./shared/picks";
import { finishedUnrecorded, hasStarted, progressLine } from "./shared/progress";
import { COUNT_WORDS as WORDS, GAME_ROSTER, type Game } from "./shared/roster";
import { hasGameBit, type HubStreaks } from "./shared/streaks";
import { countdownText, dateFromDayIndex, dayIndexFromDate } from "./shared/day";
import { createGameRow, type RowState } from "./shared/ui/game-row";
import { icon } from "./shared/ui/icons";

export interface ViewHandle {
  element: HTMLElement;
  dispose(): void;
}


/** "Wednesday 22 October": the day rolls at 00:00 UTC, so the eyebrow is UTC too. */
function dateEyebrow(now = new Date()): string {
  return now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** The first headline line, by the local clock: 05–12 morning, 12–18 afternoon, else evening. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return "Good morning.";
  }
  if (hour >= 12 && hour < 18) {
    return "Good afternoon.";
  }
  return "Good evening.";
}

/** Whether "More games" is open; a per-device convenience. */
export const MORE_OPEN_KEY = "daily-on-dot:more-games:v1";

function moreOpen(): boolean {
  try {
    return window.localStorage.getItem(MORE_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberMoreOpen(open: boolean): void {
  try {
    if (open) {
      window.localStorage.setItem(MORE_OPEN_KEY, "1");
    } else {
      window.localStorage.removeItem(MORE_OPEN_KEY);
    }
  } catch {
    // A blocked store only forgets the choice.
  }
}

// Until the day's bits arrive the count is unknown; a guessed "Six to play."
// flashed and then corrected itself on every archive step.
const HEADLINE_LOADING = "Loading…";

/** The headline states the day: "Six to play." / "Three to go." / "All six done." */
export function headlineFor(done: number, total = GAME_ROSTER.length): string {
  if (done === 0) {
    return `${WORDS[total]} to play.`;
  }
  if (done >= total) {
    return total === 1 ? "All done." : total === 2 ? "Both done." : `All ${WORDS[total]!.toLowerCase()} done.`;
  }
  return `${WORDS[total - done]} to go.`;
}

function rowState(
  game: Game,
  day: number | null,
  bits: DayBits | null,
  summary: GameSummary | null,
): RowState {
  if (day === null || !bits) {
    return { kind: "loading" };
  }
  if (hasGameBit(bits.played, game.gameId)) {
    return {
      kind: "done",
      score: summary?.score ?? null,
      percentile: summary?.percentile ?? null,
      finishers: summary?.finishers ?? null,
    };
  }
  if (finishedUnrecorded(game.gameId, day)) {
    return { kind: "unrecorded" };
  }
  if (hasStarted(game.gameId, day)) {
    return { kind: "started", progress: progressLine(game, day) };
  }
  return { kind: "open" };
}

const ORDER: Record<RowState["kind"], number> = {
  started: 0,
  unrecorded: 0,
  open: 1,
  loading: 1,
  done: 2,
};

/** `#/day?day=N` for a past day; `#/` for today. */
export function dayHref(day: number, today: number): string {
  return day >= today ? "#/" : `#/day?day=${day}`;
}

/**
 * The past day's top (Archive board): ‹ and › step one day (› from
 * yesterday opens today; there is no ‹ before day 0), the date over
 * "Day N", then the headline with a gold Today chip.
 */
function pastHead(day: number, today: number): string {
  const step = (target: number, kind: "back" | "forward", label: string): string =>
    target < 0
      ? `<span class="day-step day-step--none" aria-hidden="true"></span>`
      : `<a class="header-circle day-step" data-day-step="${kind}" href="${dayHref(target, today)}" aria-label="${label}">${icon(kind)}</a>`;
  const next = day + 1 >= today ? "Today" : `Day ${day + 1}`;
  return `
    <nav class="day-stepper" aria-label="Change day">
      ${step(day - 1, "back", `Previous day, Day ${day - 1}`)}
      <div class="day-stepper-label">
        <p class="eyebrow">${dateEyebrow(dateFromDayIndex(day))}</p>
        <strong>Day ${day}</strong>
      </div>
      ${step(day + 1, "forward", `Next day, ${next}`)}
    </nav>
    <div class="home-head home-head--past">
      <h1><span data-home-headline data-loading>${HEADLINE_LOADING}</span></h1>
      <a class="today-chip" href="#/">Today${icon("forward")}</a>
    </div>
  `;
}

/**
 * The hub. The picked games (D21) lead, then the done group (every finished
 * game, picked or not), then "More games": the unpicked ones, collapsed, still
 * playable. The headline and the bar count picked games only.
 *
 * With `pastDay` it is that day's hub (Archive board): the same rows, bar and
 * groups, a day stepper in place of the greeting and the countdown, rows that
 * open that day's puzzles, and a note that late plays fill the calendar, not
 * the streak.
 */
export function renderHome(source: DataSource, pastDay: number | null = null): ViewHandle {
  const past = pastDay !== null;
  const clockToday = dayIndexFromDate(new Date());
  const picked = pickedGames();
  const pickedIds = new Set(picked.map((game) => game.id));
  const page = document.createElement("section");
  page.className = past ? "page home-page home-page--past" : "page home-page";
  page.innerHTML = `
    ${pastDay !== null
      ? pastHead(pastDay, clockToday)
      : `<div class="home-head">
      <div class="home-lead">
        <p class="eyebrow" data-home-date>${dateEyebrow()}</p>
        <h1><span data-home-greeting>${greetingFor(new Date().getHours())}</span><br><span data-home-headline data-loading>${HEADLINE_LOADING}</span></h1>
      </div>
      <div class="home-countdown" aria-live="off">New set in<br><span data-countdown>${countdownText()}</span></div>
    </div>`}
    <div class="day-bar" data-day-bar role="img" aria-label="${past ? `Day ${pastDay}` : "Today"}: 0 of ${picked.length} done">
      ${picked.map(
        (game) =>
          `<span class="day-bar-segment" data-segment="${game.id}" data-done="false"></span>`,
      ).join("")}
    </div>
    <div class="home-day-summary" data-home-day-summary hidden></div>
    <div class="read-error" data-home-read-error role="status" hidden>
      <span>Completion data could not be loaded.</span>
      <button type="button">Try again</button>
    </div>
    <div class="game-rows" data-open-games></div>
    <section class="home-done" data-home-done hidden>
      <h2 class="home-done-heading">${past ? "Done that day" : "Done today"}</h2>
      <div class="game-rows" data-done-games></div>
    </section>
    <section class="home-more" data-home-more hidden>
      <button type="button" class="home-more-toggle" data-more-toggle aria-expanded="false" aria-controls="home-more-games">
        <span>More games <span class="home-more-count" data-more-count></span></span>${icon("down")}
      </button>
      <div class="game-rows" id="home-more-games" data-more-games hidden></div>
    </section>
    ${past ? `<p class="past-note">${icon("calendar")}Past days fill your calendar, not your streak.</p>` : ""}
  `;

  const headline = page.querySelector<HTMLElement>("[data-home-headline]");
  const bar = page.querySelector<HTMLElement>("[data-day-bar]");
  const openRows = page.querySelector<HTMLElement>("[data-open-games]");
  const doneSection = page.querySelector<HTMLElement>("[data-home-done]");
  const doneRows = page.querySelector<HTMLElement>("[data-done-games]");
  const moreSection = page.querySelector<HTMLElement>("[data-home-more]");
  const moreToggle = page.querySelector<HTMLButtonElement>("[data-more-toggle]");
  const moreCount = page.querySelector<HTMLElement>("[data-more-count]");
  const moreRows = page.querySelector<HTMLElement>("[data-more-games]");
  const readError = page.querySelector<HTMLElement>("[data-home-read-error]");
  const retryRead = readError?.querySelector<HTMLButtonElement>("button");
  const countdown = page.querySelector<HTMLElement>("[data-countdown]");
  const summarySlot = page.querySelector<HTMLElement>("[data-home-day-summary]");
  if (
    !headline
    || !bar
    || !openRows
    || !doneSection
    || !doneRows
    || !moreSection
    || !moreToggle
    || !moreCount
    || !moreRows
    || !readError
    || !retryRead
    || (!past && !countdown)
    || !summarySlot
  ) {
    throw new Error("Home shell failed to render");
  }

  let shownDay: number | null = null;
  let dayBits: DayBits | null = null;
  let summaries: GameSummary[] | null = null;
  let disposed = false;
  let readRequest = 0;

  const showMore = (open: boolean): void => {
    moreRows.hidden = !open;
    moreToggle.setAttribute("aria-expanded", String(open));
  };
  showMore(moreOpen());
  moreToggle.addEventListener("click", () => {
    const open = moreRows.hidden;
    showMore(open);
    rememberMoreOpen(open);
  });

  const renderRows = (): void => {
    const states = GAME_ROSTER.map((game) => ({
      game,
      picked: pickedIds.has(game.id),
      state: rowState(
        game,
        shownDay,
        dayBits,
        summaries?.find((entry) => entry.game.id === game.id) ?? null,
      ),
    }));
    // In progress, then not started, both in roster order; the done group last.
    const ordered = [...states].sort(
      (left, right) => ORDER[left.state.kind] - ORDER[right.state.kind],
    );
    const row = (entry: (typeof states)[number]): HTMLElement =>
      createGameRow(entry.game, entry.state, pastDay);
    const waiting = ordered.filter((entry) => entry.state.kind !== "done");
    openRows.replaceChildren(...waiting.filter((entry) => entry.picked).map(row));
    const more = waiting.filter((entry) => !entry.picked);
    moreRows.replaceChildren(...more.map(row));
    moreCount.textContent = String(more.length);
    moreSection.hidden = more.length === 0;
    const done = ordered.filter((entry) => entry.state.kind === "done");
    doneRows.replaceChildren(...done.map(row));
    doneSection.hidden = done.length === 0;

    const pickedDone = done.filter((entry) => entry.picked).length;
    if (dayBits) {
      headline.textContent = headlineFor(pickedDone, picked.length);
      delete headline.dataset.loading;
    }
    bar.setAttribute(
      "aria-label",
      `${past ? `Day ${pastDay}` : "Today"}: ${pickedDone} of ${picked.length} done`,
    );
    for (const entry of states) {
      bar
        .querySelector(`[data-segment="${entry.game.id}"]`)
        ?.setAttribute("data-done", String(entry.state.kind === "done"));
    }
  };

  // The full roster is painted before the first asynchronous data read starts.
  renderRows();

  // The card record carries what the home derives (WP34); `main.ts` listens
  // and the header pill shows the streaks.
  const announce = (day: number, detail: Record<string, number>): void => {
    window.dispatchEvent(
      new CustomEvent("daily-day-summary", { detail: { day, ...detail } }),
    );
  };

  const hydrateStreaks = async (day: number, request: number): Promise<HubStreaks | null> => {
    try {
      const streaks = await loadHubStreaks(source, day);
      if (disposed || request !== readRequest) {
        return null;
      }
      announce(day, { streakAny: streaks.any });
      return streaks;
    } catch {
      // A failed read leaves the header as it was.
      return null;
    }
  };

  // Each done game's score and percentile for its row; at 6/6 the day
  // summary goes below the bar (today's also announces the day's percentile).
  const hydrateSummary = async (
    day: number,
    bits: DayBits,
    streaks: Promise<HubStreaks | null>,
    request: number,
  ): Promise<void> => {
    summarySlot.hidden = true;
    summarySlot.replaceChildren();
    if (bits.played === 0n) {
      return;
    }
    try {
      const summary = await loadDaySummary(source, day, bits);
      if (disposed || request !== readRequest) {
        return;
      }
      summaries = summary.games;
      renderRows();
      if (!dayComplete(bits, picked)) {
        return;
      }
      // A past day's summary has no streak tiles: late plays do not count for them.
      const hubStreaks = past ? null : await streaks;
      if (disposed || request !== readRequest) {
        return;
      }
      summarySlot.replaceChildren(renderDaySummary(summary, hubStreaks, { games: false }));
      summarySlot.hidden = false;
      if (!past && summary.dayPercentile !== null) {
        announce(day, { dayPercentile: summary.dayPercentile });
      }
    } catch {
      // The rows stand; the scores are a bonus of the day's reads.
    }
  };

  const hydrateCompletion = async (): Promise<void> => {
    const request = ++readRequest;
    readError.hidden = true;
    if (!dayBits) {
      headline.textContent = HEADLINE_LOADING;
      headline.dataset.loading = "";
    }
    try {
      const today = await source.currentDay();
      if (pastDay !== null && pastDay >= today) {
        // Today (or a day not yet out) is the live hub.
        window.location.replace("#/");
        return;
      }
      const day = pastDay ?? today;
      const bits = await source.dayBits(day);
      if (!disposed && request === readRequest) {
        shownDay = day;
        dayBits = bits;
        summaries = null;
        renderRows();
        // The header pill shows today's streaks on every hub.
        const streaks = hydrateStreaks(today, request);
        void hydrateSummary(day, bits, streaks, request);
      }
    } catch {
      if (!disposed && request === readRequest) {
        readError.hidden = false;
        if (!dayBits) {
          headline.textContent = `${WORDS[picked.length]} ${picked.length === 1 ? "game" : "games"}.`;
          delete headline.dataset.loading;
        }
      }
    }
  };
  retryRead.addEventListener("click", () => void hydrateCompletion());
  void hydrateCompletion();

  const timer = countdown
    ? window.setInterval(() => {
        countdown.textContent = countdownText();
      }, 1_000)
    : 0;

  return {
    element: page,
    dispose() {
      disposed = true;
      readRequest += 1;
      window.clearInterval(timer);
    },
  };
}
