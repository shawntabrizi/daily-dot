import type { DataSource, DayBits } from "../data-source";
import { dayIndexFromDate } from "../day";
import { loadDaySummary, readStreakWindow } from "../day-summary";
import {
  formatScore,
  holdsPlayer,
  percentileFor,
  scoreValue,
  withPlayer,
  type Histogram,
  type ScoreUnit,
} from "../percentile";
import { pickedGames } from "../picks";
import { GAME_ROSTER, type Game } from "../roster";
import { shareText, type ShareGame, type ShareInput } from "../share";
import {
  deriveHubStreaks,
  hasGameBit,
  milestoneLine,
  popcount,
  rosterMask,
  type HubStreaks,
} from "../streaks";
import { createDistribution } from "./distribution";
import { setHeaderGame, setHeaderTitle } from "./header";
import { icon } from "./icons";

/** The gold flame of the Result board's streak tile. */
const FLAME =
  '<svg width="14" height="18" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 0c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" fill="currentColor"/></svg>';

const EMPTY_BITS: DayBits = { played: 0n, solved: 0n, ontime: 0n };

export interface ResultNext {
  /** The first unplayed picked game after the current one; null when none. */
  game: Game | null;
  /** Picked games done today, the current one included when it is picked. */
  done: number;
  total: number;
}

/**
 * Where the main button goes: the first unplayed game of `picks` (D21) after
 * `current`, wrapping; from an unpicked game, the first unplayed pick. The
 * current game always counts as done (the write landed; a lagging read may
 * not show it yet).
 */
export function nextGame(
  current: Game,
  played: bigint,
  picks: readonly Game[] = pickedGames(),
): ResultNext {
  const bits = played | (1n << BigInt(current.gameId));
  const start = picks.findIndex((game) => game.id === current.id);
  let game: Game | null = null;
  for (let step = 1; step <= picks.length && game === null; step += 1) {
    const candidate = picks[(start + step) % picks.length]!;
    if (!hasGameBit(bits, candidate.gameId)) {
      game = candidate;
    }
  }
  return {
    game,
    done: popcount(bits & rosterMask(picks.map((entry) => entry.gameId))),
    total: picks.length,
  };
}

export interface HeadlineInput {
  percentile: number | null;
  /** On-time finishers, the player included. */
  finishers: number;
  late: boolean;
}

/** WP36 decision 5: the headline by rule. */
export function headlineFor({ percentile, finishers, late }: HeadlineInput): string {
  if (late || percentile === null) {
    return "Done.";
  }
  if (finishers === 1) {
    return "First today.";
  }
  if (percentile <= 10) {
    return "Splendid.";
  }
  if (percentile <= 40) {
    return "Nice.";
  }
  return "Done.";
}

export interface ResultPanelOptions {
  /** The score's noun for count games ("guess", "move", "mistake"). */
  unit?: ScoreUnit;
  /**
   * The day was recorded after it ended. The distribution is of on-time
   * finishers (D20), so a late finisher is shown where they would have
   * ranked, "on the day", with no streak tile and no celebration.
   */
  late?: boolean;
  /**
   * A past day (Archive board): Next is that day's next unplayed game, the
   * second button is that day's hub, and a note says the streak counts
   * today only.
   */
  pastDay?: number;
  /** The main button's target; omitted while unknown (reads "Today"). */
  next?: ResultNext | null;
  /** The hub streaks after the record; omitted or null draws no streak tile. */
  streaks?: HubStreaks | null;
  /** The answer after the score on the subline ("the word was BLONDE"); omitted for time games. */
  detail?: string;
  /** The share preview's input; omitted previews this game alone. */
  share?: ShareInput | null;
  /** The Share button's action; omitted draws no Share button. */
  onShare?: () => void;
  /**
   * Finished but not saved: no rank, no streak, no "you are here" (the score
   * is not on chain), and a bar above Next with Save, or the write in flight.
   */
  unsaved?: { saving: boolean; onSave: () => void };
}

function tile(
  kind: "score" | "rank" | "streak",
  value: string | (string | Node)[],
  label: string,
  data: string,
): HTMLElement {
  const root = document.createElement("div");
  root.className = `result-tile result-tile--${kind}`;
  root.dataset[`result${kind[0]!.toUpperCase()}${kind.slice(1)}Tile`] = data;
  const strong = document.createElement("strong");
  strong.className = "result-tile-value";
  strong.append(...(typeof value === "string" ? [value] : value));
  const span = document.createElement("span");
  span.className = "result-tile-label";
  span.textContent = label;
  root.append(strong, span);
  return root;
}

function flameNode(): Node {
  const template = document.createElement("template");
  template.innerHTML = FLAME;
  return template.content.firstChild!;
}

function actionLink(href: string, className: string, ...children: (string | Node)[]): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.append(...children);
  return link;
}

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

/**
 * A finished game's result as the Result board draws it: headline by rule,
 * "<score> · the answer" subline, three tiles (score, top today, day streak),
 * the day's distribution card, "Next: <game>" with the day count, Share /
 * Today, and the share preview. `histogram` null means the read failed or
 * the source has none; the rank tile shows "—" and the card is left out.
 */
export function renderResultPanel(
  game: Game,
  score: number,
  histogram: Histogram | null,
  options: ResultPanelOptions = {},
): HTMLElement {
  const late = options.late ?? false;
  const pastDay = options.pastDay ?? null;
  const unsaved = options.unsaved ?? null;
  const percentile =
    histogram === null || unsaved ? null : percentileFor(histogram, game, score, !late);
  // A saved score is one of the day's finishers, in the count and the chart,
  // even where the chain does not count it (late) or the read lags.
  const shown = histogram === null || unsaved ? histogram : withPlayer(histogram, game, score, late);
  const finishers = shown === null ? 0 : shown.total;
  const scoreWords = formatScore(game.kind, score, options.unit);

  const panel = document.createElement("section");
  panel.className = "result";
  panel.dataset.resultPanel = game.id;
  panel.dataset.game = game.id;
  panel.setAttribute("aria-label", `${game.name} result`);

  const head = document.createElement("div");
  head.className = "result-head";
  const headline = document.createElement("h1");
  headline.className = "result-headline";
  headline.dataset.resultHeadline = "";
  headline.textContent = headlineFor({ percentile, finishers, late });
  const subline = document.createElement("p");
  subline.className = "result-subline";
  subline.dataset.resultSubline = "";
  subline.textContent = options.detail ? `${scoreWords} · ${options.detail}` : scoreWords;
  head.append(headline, subline);

  const tiles = document.createElement("div");
  tiles.className = "result-tiles";
  tiles.setAttribute("aria-label", "Result, rank, streak");
  const scoreValue = shortScore(game, score);
  tiles.append(
    tile(
      "score",
      scoreValue,
      game.kind === "seconds" ? "time" : scoreWords.slice(scoreValue.length + 1),
      scoreValue,
    ),
  );
  if (!unsaved) {
    const rankValue: (string | Node)[] =
      percentile === null ? ["—"] : [String(percentile), Object.assign(document.createElement("small"), { textContent: "%" })];
    tiles.append(
      tile("rank", rankValue, late ? "on the day" : "top today", percentile === null ? "" : String(percentile)),
    );
  }
  const streaks = late || unsaved ? null : (options.streaks ?? null);
  if (streaks) {
    tiles.append(tile("streak", [flameNode(), String(streaks.any)], "day streak", String(streaks.any)));
  }
  panel.append(head, tiles);

  const milestoneText = streaks ? milestoneLine(streaks.any) : null;
  if (streaks && milestoneText) {
    const milestone = document.createElement("p");
    milestone.className = "result-milestone";
    milestone.dataset.resultMilestone = String(streaks.any);
    milestone.textContent = milestoneText;
    panel.append(milestone);
  }

  if (shown !== null) {
    panel.append(
      createDistribution({
        game,
        histogram: shown,
        playerScore: unsaved ? null : score,
        percentile,
        finished: finishers,
        late,
      }),
    );
  }

  const next = options.next ?? null;
  const dayHub = `#/day?day=${pastDay}`;
  const main = pastDay !== null
    ? next?.game
      ? actionLink(
          `${next.game.route}?day=${pastDay}`,
          "result-primary",
          span("result-primary-label", `Next: ${next.game.short}`),
          span("result-primary-count", `Day ${pastDay} · ${next.done} of ${next.total}`),
        )
      : actionLink(
          dayHub,
          "result-primary",
          span("result-primary-label", `Day ${pastDay}`),
          ...(next ? [span("result-primary-count", `${next.done} of ${next.total} done`)] : []),
        )
    : next?.game
      ? actionLink(
          next.game.route,
          "result-primary",
          span("result-primary-label", `Next: ${next.game.short}`),
          span("result-primary-count", `${next.done} of ${next.total} done`),
        )
      : actionLink(
          "#/",
          "result-primary",
          span("result-primary-label", "Today"),
          ...(next ? [span("result-primary-count", `${next.done} of ${next.total} done`)] : []),
        );
  main.dataset.resultNext = next?.game?.id ?? (pastDay !== null ? "day" : "today");
  if (next?.game) {
    // The button wears the next game's color, not this one's.
    main.dataset.game = next.game.id;
  }

  const row = document.createElement("div");
  row.className = "result-secondary";
  if (options.onShare) {
    const share = document.createElement("button");
    share.type = "button";
    share.className = "result-action";
    share.dataset.resultShare = "";
    share.textContent = "Share";
    share.addEventListener("click", () => options.onShare?.());
    row.append(share);
  }
  row.append(
    pastDay !== null
      ? actionLink(dayHub, "result-action", `Day ${pastDay}`)
      : actionLink("#/", "result-action", "Today"),
  );
  if (unsaved) {
    panel.append(saveBar(unsaved));
  }
  const actions = document.createElement("div");
  actions.className = "result-actions";
  actions.append(main, row);
  panel.append(actions);
  if (pastDay !== null && !unsaved) {
    const note = document.createElement("p");
    note.className = "past-note";
    note.dataset.resultPastNote = "";
    note.innerHTML = `${icon("calendar")}Day ${pastDay} is on your calendar now. Your streak counts today only.`;
    panel.append(note);
  }

  return panel;
}

/**
 * The bar above Next on an unsaved result: "Not saved yet" with Save, or,
 * after Save, "Recording your score…". While a save prompt is still asking,
 * the bar hides (save.css): nothing records until the player taps Save.
 */
function saveBar(unsaved: { saving: boolean; onSave: () => void }): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "result-unsaved-row";
  bar.dataset.resultUnsaved = unsaved.saving ? "saving" : "unsaved";
  bar.dataset.saveStatus = "";
  bar.setAttribute("role", "status");
  const recording = document.createElement("span");
  recording.className = "result-unsaved-line result-unsaved-recording";
  recording.textContent = "Recording your score…";
  if (unsaved.saving) {
    bar.append(recording);
    return bar;
  }
  // The view does not re-render while a record runs; save.css swaps to
  // "Recording your score…" on <html data-save-phase="saving">.
  const line = document.createElement("span");
  line.className = "result-unsaved-line result-unsaved-idle";
  line.textContent = "Not saved yet";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "result-unsaved-save";
  save.dataset.resultSave = "";
  save.textContent = "Save";
  save.addEventListener("click", () => unsaved.onSave());
  bar.append(line, recording, save);
  return bar;
}

/** The score as the tiles write it: the number, the time, or the points. */
function shortScore(game: Pick<Game, "kind">, score: number): string {
  return scoreValue(game.kind, score);
}

export interface ResultPanelState {
  day: number;
  score: number;
  /** The write landed; the day's distribution now includes the player (unless late). */
  recorded: boolean;
  late: boolean;
  /** The answer for the subline ("the word was BLONDE"); never in the share text. */
  detail?: string;
  /** Extra color-free share lines for this game (Connections' tier rows). */
  shareLines?: readonly string[];
  /** Finished, not saved: Save offered (unsaved) or the write in flight (saving). */
  pendingSave?: "unsaved" | "saving";
  /** The unsaved bar's Save. */
  onSave?: () => void;
}

export interface ResultPanelHandle {
  /** Append this wherever the game's end state sits; the panel fills itself. */
  element: HTMLElement;
  /**
   * Call on every render of the end state. Shows nothing until `recorded`,
   * then reads the day once per `(day, score)` and renders.
   */
  update(state: ResultPanelState): void;
}

/**
 * The page chrome around a shown result (Result board): the game's own
 * heading block hides, and the header is asked for the "DAILY WORD · DAY 294"
 * eyebrow; while the game is still on screen the header shows the game (Game board).
 */
export function syncResultChrome(
  page: HTMLElement,
  game: Game,
  day: number,
  shown: boolean,
): void {
  // The Result board: the page scrolls as one and the board shrinks (result.css).
  page.classList.toggle("page--result", shown);
  const heading = page.querySelector<HTMLElement>(".game-heading, .connections-heading");
  if (heading) {
    heading.hidden = shown;
  }
  // A past day keeps the game header and its day switcher (Archive board).
  if (shown && day >= dayIndexFromDate(new Date())) {
    setHeaderTitle(`${game.name} · Day ${day}`);
  } else {
    setHeaderGame(game, day);
  }
}

/**
 * The hub streaks right after this game's record: the window read from the
 * source, with today's bit set locally in case the read lags the write.
 */
async function loadResultStreaks(
  source: DataSource,
  game: Game,
  day: number,
): Promise<HubStreaks> {
  const mask = rosterMask(GAME_ROSTER.map((entry) => entry.gameId));
  const days = await readStreakWindow(source, day, mask);
  const bit = 1n << BigInt(game.gameId);
  const last = days[days.length - 1] ?? EMPTY_BITS;
  days[days.length - 1] = {
    played: last.played | bit,
    solved: last.solved,
    ontime: last.ontime | bit,
  };
  return deriveHubStreaks(days, mask);
}

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent("daily-toast", { detail: message }));
}

/** The share sheet when the page has one, else the clipboard, else the preview is selected to copy. */
async function shareOut(text: string): Promise<void> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.");
    return;
  } catch {
    // No clipboard (insecure context, or denied).
    toast("Could not copy.");
  }
}

/**
 * The one shared end-state helper: a game appends `element` and calls
 * `update` with its score. After the write it reads the day's
 * histogram, the day's bits (for the next game), the streak window (for the
 * streak tile) and the day summary (for the share text),
 * then renders; a failing read drops that part and keeps the score.
 */
/** One block (2 s) and a margin: when a lagging histogram read is tried again. */
const HISTOGRAM_REREAD_MS = 2500;

export function createResultPanel(
  source: DataSource,
  game: Game,
  options: Pick<ResultPanelOptions, "unit"> = {},
): ResultPanelHandle {
  const element = document.createElement("div");
  element.className = "result-panel-slot";
  element.dataset.resultSlot = game.id;
  element.hidden = true;
  let loadedKey: string | null = null;
  let request = 0;
  let shareReady: string | null = null;
  let latestSave: (() => void) | null = null;

  const warn = (what: string, day: number, error: unknown): void => {
    console.warn(`[daily-on-dot] ${what} (game ${game.gameId}, day ${day}) failed`, error);
  };

  const shareInputFor = (
    state: ResultPanelState,
    bits: DayBits,
    percentile: number | null,
    streaks: HubStreaks | null,
    summary: Awaited<ReturnType<typeof loadDaySummary>> | null,
  ): ShareInput => {
    const games: ShareGame[] = GAME_ROSTER.map((entry) => {
      if (entry.id === game.id) {
        return {
          id: entry.id,
          played: true,
          score: state.score,
          kind: entry.kind,
          percentile,
          lines: state.shareLines,
        };
      }
      const known = summary?.games.find((item) => item.game.id === entry.id);
      return {
        id: entry.id,
        played: known?.played ?? hasGameBit(bits.played, entry.gameId),
        score: known?.score ?? null,
        kind: entry.kind,
        percentile: known?.percentile ?? null,
      };
    });
    return {
      day: state.day,
      games,
      streaks: streaks ? { any: streaks.any } : null,
      dayPercentile: summary?.dayPercentile ?? null,
    };
  };

  const onShare = (): void => {
    if (shareReady) {
      void shareOut(shareReady);
    }
  };

  return {
    element,
    update(state) {
      // Unsaved (Not now) and saving keep the result layout; only a game that
      // is neither saved nor waiting on a save shows no panel.
      const pending = state.recorded ? undefined : state.pendingSave;
      latestSave = state.onSave ?? null;
      if (!state.recorded && !pending) {
        element.hidden = true;
        element.replaceChildren();
        loadedKey = null;
        return;
      }
      const key = `${state.day}:${state.score}:${state.late}:${pending ?? "saved"}`;
      if (key === loadedKey) {
        element.hidden = false;
        return;
      }
      loadedKey = key;
      const current = ++request;
      const loading = document.createElement("section");
      loading.className = "result result--loading";
      loading.dataset.game = game.id;
      const line = document.createElement("p");
      line.className = "result-subline result-loading";
      line.textContent = "Reading today's distribution…";
      loading.append(line);
      // Unsaved → saving → saved re-reads in place, with no loading flash.
      if (!element.querySelector("[data-result-panel]")) {
        element.replaceChildren(loading);
      }
      element.hidden = false;

      const histogramRead = source.histogram
        ? source.histogram(game.gameId, state.day)
        : Promise.resolve<Histogram | null>(null);
      const bitsRead = source.dayBits(state.day).catch((error: unknown) => {
        warn("dayBits", state.day, error);
        return EMPTY_BITS;
      });
      void Promise.all([
        histogramRead.catch((error: unknown) => {
          warn("histogram", state.day, error);
          return null;
        }),
        bitsRead,
        source.currentDay().catch(() => state.day),
        bitsRead.then((bits) =>
          loadDaySummary(source, state.day, bits).catch((error: unknown) => {
            warn("day summary", state.day, error);
            return null;
          }),
        ),
        state.late || pending
          ? Promise.resolve<HubStreaks | null>(null)
          : loadResultStreaks(source, game, state.day).catch((error: unknown) => {
              warn("streaks", state.day, error);
              return null;
            }),
      ]).then(([histogram, bits, today, summary, streaks]) => {
        if (current !== request) {
          return;
        }
        const draw = (histogram: Histogram | null): void => {
          const percentile =
            histogram === null || pending
              ? null
              : percentileFor(histogram, game, state.score, !state.late);
          const share = shareInputFor(state, bits, percentile, streaks, summary);
          shareReady = shareText(share);
          element.replaceChildren(
            renderResultPanel(game, state.score, histogram, {
              ...options,
              late: state.late,
              pastDay: state.day < today ? state.day : undefined,
              next: nextGame(game, bits.played),
              streaks,
              detail: state.detail,
              share,
              onShare,
              unsaved: pending
                ? { saving: pending === "saving", onSave: () => latestSave?.() }
                : undefined,
            }),
          );
          element.hidden = false;
        };
        draw(histogram);
        // The write landed at the best block, but this read can still lag it:
        // read once more after a block and draw the chain's own count.
        if (
          histogram !== null &&
          !pending &&
          !state.late &&
          source.histogram &&
          !holdsPlayer(histogram, game, state.score)
        ) {
          const histogramOf = source.histogram.bind(source);
          setTimeout(() => {
            if (current !== request) {
              return;
            }
            histogramOf(game.gameId, state.day)
              .then((again) => {
                if (current === request && holdsPlayer(again, game, state.score)) {
                  draw(again);
                }
              })
              .catch((error: unknown) => warn("histogram re-read", state.day, error));
          }, HISTOGRAM_REREAD_MS);
        }
      });
    },
  };
}
