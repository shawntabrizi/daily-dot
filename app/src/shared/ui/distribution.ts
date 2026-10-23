import {
  COUNT_BUCKET_MAX,
  SECONDS_BUCKET_MAX,
  scoreBucket,
  type Histogram,
} from "../percentile";
import type { ScoreKind } from "../roster";

export interface DistributionBar {
  label: string;
  count: number;
  /** The bar that holds the player's score. */
  player: boolean;
  /** Whether the axis shows this bar's label (crowded axes label a few). */
  labelled: boolean;
}

/** Seconds histograms draw one bar per minute: four 15-second buckets. */
const BUCKETS_PER_MINUTE = 4;
const SECONDS_BAR_MAX = SECONDS_BUCKET_MAX / BUCKETS_PER_MINUTE;
const MIN_COUNT_BARS = 6;
const MIN_SECONDS_BARS = 10;
/** The Result board labels every bar of its eight; past that, every fifth. */
const LABEL_EVERY_PAST = 8;

/**
 * The bars a distribution draws: guess counts (1, 2, … 31+) or minutes
 * (0, 1, … 30+), from the first bucket to the last one with a finisher (or
 * the player's), never fewer than a handful so a quiet day still reads as
 * an axis.
 */
export function distributionBars(
  kind: ScoreKind,
  histogram: Histogram,
  playerScore: number | null,
): DistributionBar[] {
  const playerBucket = playerScore === null ? null : scoreBucket(kind, playerScore);
  const perBar = kind === "seconds" ? BUCKETS_PER_MINUTE : 1;
  const firstBar = kind === "seconds" ? 0 : 1;
  const lastBar = kind === "seconds" ? SECONDS_BAR_MAX : COUNT_BUCKET_MAX;
  const minBars = kind === "seconds" ? MIN_SECONDS_BARS : MIN_COUNT_BARS;
  const barOf = (bucket: number): number => Math.floor(bucket / perBar);

  const counts = new Map<number, number>();
  for (const entry of histogram.buckets) {
    const bar = barOf(entry.bucket);
    counts.set(bar, (counts.get(bar) ?? 0) + entry.count);
  }
  const highest = Math.max(
    firstBar + minBars - 1,
    playerBucket === null ? firstBar : barOf(playerBucket),
    ...counts.keys(),
  );
  const end = Math.min(highest, lastBar);
  const bars: DistributionBar[] = [];
  for (let bar = firstBar; bar <= end; bar += 1) {
    const player = playerBucket !== null && barOf(playerBucket) === bar;
    const crowded = end - firstBar + 1 > LABEL_EVERY_PAST;
    bars.push({
      label: bar === lastBar ? `${bar}+` : String(bar),
      count: counts.get(bar) ?? 0,
      player,
      labelled: !crowded || player || bar === firstBar || bar === end || bar % 5 === 0,
    });
  }
  return bars;
}

export interface DistributionOptions {
  kind: ScoreKind;
  histogram: Histogram;
  playerScore: number | null;
  /** The finishers the head row counts; the histogram's total when omitted. */
  finished?: number;
  /** A late play reads "finished on the day". */
  late?: boolean;
}

/**
 * The day's distribution card (Result board): "<n> finished today" with
 * "you are here" in the accent, one bar per guess count or minute with the
 * player's bar in the accent, and the axis under it. No library.
 */
export function createDistribution(options: DistributionOptions): HTMLElement {
  const bars = distributionBars(options.kind, options.histogram, options.playerScore);
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  const unit = options.kind === "seconds" ? "minutes" : "guesses";
  const finished = options.finished ?? options.histogram.total;

  const root = document.createElement("figure");
  root.className = `distribution distribution--${options.kind}`;
  root.dataset.distribution = "";
  root.setAttribute(
    "aria-label",
    `${finished} ${finished === 1 ? "finisher" : "finishers"} today by ${unit}`,
  );

  const head = document.createElement("figcaption");
  head.className = "distribution-head";
  const total = document.createElement("span");
  total.className = "distribution-total";
  total.dataset.distributionTotal = String(finished);
  total.textContent = `${finished.toLocaleString("en-US")} finished ${options.late ? "on the day" : "today"}`;
  head.append(total);
  if (bars.some((bar) => bar.player)) {
    const you = document.createElement("span");
    you.className = "distribution-you";
    you.dataset.distributionYou = "";
    you.textContent = "you are here";
    head.append(you);
  }

  const plot = document.createElement("div");
  plot.className = "distribution-bars";
  plot.setAttribute("role", "list");
  const axis = document.createElement("div");
  axis.className = "distribution-axis";
  axis.setAttribute("aria-hidden", "true");

  for (const bar of bars) {
    const column = document.createElement("div");
    column.className = "distribution-column";
    column.setAttribute("role", "listitem");
    column.setAttribute(
      "aria-label",
      `${bar.label} ${unit}: ${bar.count}${bar.player ? " (you)" : ""}`,
    );
    const fill = document.createElement("div");
    fill.className = "distribution-bar";
    fill.classList.toggle("distribution-bar--player", bar.player);
    fill.style.setProperty("--fill", `${Math.round((bar.count / max) * 100)}%`);
    if (bar.player) {
      fill.dataset.playerBar = "";
    }
    column.append(fill);
    plot.append(column);

    const tick = document.createElement("span");
    tick.className = "distribution-tick";
    tick.classList.toggle("distribution-tick--player", bar.player);
    tick.textContent = bar.labelled ? bar.label : "";
    axis.append(tick);
  }

  root.append(head, plot, axis);
  return root;
}
