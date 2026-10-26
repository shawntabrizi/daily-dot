import { scoreBucket, scoreValue, type Histogram } from "../percentile";
import type { BucketSpec, Game, ScoreKind } from "../roster";

/** What the curve needs from a game: its spec, how its scores read, which end wins. */
export type DistributionGame = Pick<Game, "kind" | "buckets" | "better">;

/** The finishers per bucket, every bucket of the spec, 0 where nobody landed. */
export function bucketCounts(spec: BucketSpec, histogram: Histogram): number[] {
  const counts = new Array<number>(spec.buckets).fill(0);
  for (const entry of histogram.buckets) {
    // A bucket past the spec can only come from a mismatched spec; it is
    // still a finisher, so it joins the open-ended last bucket.
    const index = Math.min(Math.max(entry.bucket, 0), spec.buckets - 1);
    counts[index] = (counts[index] ?? 0) + entry.count;
  }
  return counts;
}

/**
 * The kernel's reach either side: one bucket (a 3-bucket kernel) for the
 * 31-step count axis, a few more for the fine 100- and 121-step axes, so the
 * curve reads as a shape rather than the noise of single 15-second steps.
 */
export function kernelRadius(buckets: number): number {
  return Math.max(1, Math.round(buckets / 25));
}

/**
 * A light triangular smoothing (weights r+1−|k|), renormalized at the
 * edges so the first and last buckets are not pulled toward zero.
 */
export function smoothCounts(counts: readonly number[], radius = 1): number[] {
  return counts.map((_, index) => {
    let sum = 0;
    let weights = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = counts[index + offset];
      if (value === undefined) {
        continue;
      }
      const weight = radius + 1 - Math.abs(offset);
      sum += value * weight;
      weights += weight;
    }
    return weights === 0 ? 0 : sum / weights;
  });
}

/** An axis value: "4", "3:00", "42.6". */
function axisValue(kind: ScoreKind, score: number): string {
  return scoreValue(kind, score);
}

/**
 * The axis end labels, low score first, from the spec: the first bucket's
 * start, and the open last bucket's start with a "+" (`1` … `31+`,
 * `0:00` … `30:00+`). A points game has a true ceiling at `max` (D24: 50),
 * so it reads `0` … `50`.
 */
export function axisLabels(kind: ScoreKind, spec: BucketSpec): [low: string, high: string] {
  if (kind === "points") {
    return [axisValue(kind, spec.min), axisValue(kind, spec.max)];
  }
  const lastStart = spec.min + Math.ceil(((spec.buckets - 1) * (spec.max - spec.min)) / spec.buckets);
  return [axisValue(kind, spec.min), `${axisValue(kind, lastStart)}+`];
}

/** The plot's own units; the SVG stretches to the card (preserveAspectRatio none). */
export const PLOT_WIDTH = 1000;
export const PLOT_HEIGHT = 100;
/** Head room above the peak, so the marker's dot never sits on the card edge. */
const PEAK = 0.86;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The curve through `values` (one per bucket, at bucket centers) as a closed
 * area: monotone cubic segments (Fritsch–Carlson, as d3's curveMonotoneX), so
 * it never overshoots below the baseline or above a peak, held flat out to
 * both edges.
 */
export function curvePath(values: readonly number[], width = PLOT_WIDTH, height = PLOT_HEIGHT): string {
  const max = Math.max(0, ...values);
  const step = width / Math.max(1, values.length);
  const points = values.map((value, index): [number, number] => [
    (index + 0.5) * step,
    height - (max === 0 ? 0 : (value / max) * height * PEAK),
  ]);
  if (points.length === 0) {
    return `M0,${height}L${width},${height}Z`;
  }
  const slopes = points.slice(1).map(([, y], index) => (y - points[index]![1]) / step);
  const tangents = points.map((_, index) => {
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before === undefined) {
      return after ?? 0;
    }
    if (after === undefined) {
      return before;
    }
    if (before * after <= 0) {
      return 0;
    }
    return (
      (Math.sign(before) + Math.sign(after)) *
      Math.min(Math.abs(before), Math.abs(after), 0.5 * Math.abs((before + after) / 2))
    );
  });
  const [firstX, firstY] = points[0]!;
  let path = `M0,${height}L0,${round(firstY)}L${round(firstX)},${round(firstY)}`;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1]!;
    const [x1, y1] = points[index]!;
    const third = step / 3;
    path +=
      `C${round(x0 + third)},${round(y0 + tangents[index - 1]! * third)}` +
      ` ${round(x1 - third)},${round(y1 - tangents[index]! * third)}` +
      ` ${round(x1)},${round(y1)}`;
  }
  const [, lastY] = points[points.length - 1]!;
  path += `L${width},${round(lastY)}L${width},${height}Z`;
  return path;
}

export interface DistributionCurve {
  /** Smoothed finishers per bucket, every bucket of the spec. */
  values: number[];
  /** The closed area path in PLOT_WIDTH × PLOT_HEIGHT units. */
  path: string;
  /** Low-score end first. */
  labels: [low: string, high: string];
  /** The player's bucket, its center as a share of the width, and the curve's height there (0..1). */
  player: { bucket: number; x: number; y: number } | null;
}

/** Everything the card draws, without the DOM. */
export function distributionCurve(
  game: DistributionGame,
  histogram: Histogram,
  playerScore: number | null,
): DistributionCurve {
  const spec = game.buckets;
  const values = smoothCounts(bucketCounts(spec, histogram), kernelRadius(spec.buckets));
  const max = Math.max(0, ...values);
  const bucket = playerScore === null ? null : scoreBucket(spec, playerScore);
  return {
    values,
    path: curvePath(values),
    labels: axisLabels(game.kind, spec),
    player:
      bucket === null
        ? null
        : {
            bucket,
            x: (bucket + 0.5) / spec.buckets,
            y: max === 0 ? 0 : (values[bucket]! / max) * PEAK,
          },
  };
}

export interface DistributionOptions {
  game: DistributionGame;
  histogram: Histogram;
  playerScore: number | null;
  /** The player's "top N%" for the label; null or omitted when unranked. */
  percentile?: number | null;
  /** The finishers the head row counts; the histogram's total when omitted. */
  finished?: number;
  /** A late play reads "finished on the day". */
  late?: boolean;
}

const SVG = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

/** "You are in the top 12% of 340 finishers", or the count when unranked. */
export function distributionLabel(
  finished: number,
  percentile: number | null,
  late: boolean,
): string {
  const finishers = `${finished.toLocaleString("en-US")} ${finished === 1 ? "finisher" : "finishers"}`;
  const when = late ? " on the day" : "";
  return percentile === null
    ? `${finishers} ${late ? "on the day" : "today"}`
    : `You are in the top ${percentile}% of ${finishers}${when}`;
}

/** Below this share of the width, the player's tick would sit on an end label. */
const END_LABEL_ROOM = 0.12;

/**
 * The day's distribution card (Result board): "<n> finished today" with
 * "you are here" in the accent, a smooth curve of the day's finishers over
 * the game's whole bucket range, the player's place marked in the accent with
 * the share that ranks with or ahead of them shaded from the game's better
 * end, and the axis ends under it. Scores always run low to high left to
 * right; the better end's label is the bright one. No library.
 */
export function createDistribution(options: DistributionOptions): HTMLElement {
  const { game } = options;
  const curve = distributionCurve(game, options.histogram, options.playerScore);
  const finished = options.finished ?? options.histogram.total;
  const late = options.late ?? false;
  const percentile = curve.player ? (options.percentile ?? null) : null;

  const root = document.createElement("figure");
  root.className = `distribution distribution--${game.kind}`;
  root.dataset.distribution = "";
  root.dataset.better = game.better;
  root.setAttribute("aria-label", distributionLabel(finished, percentile, late));

  const head = document.createElement("figcaption");
  head.className = "distribution-head";
  const total = document.createElement("span");
  total.className = "distribution-total";
  total.dataset.distributionTotal = String(finished);
  total.textContent = `${finished.toLocaleString("en-US")} finished ${late ? "on the day" : "today"}`;
  head.append(total);
  if (curve.player) {
    const you = document.createElement("span");
    you.className = "distribution-you";
    you.dataset.distributionYou = "";
    you.textContent = "you are here";
    head.append(you);
  }

  const plot = document.createElement("div");
  plot.className = "distribution-plot";
  plot.setAttribute("aria-hidden", "true");
  const svg = svgElement("svg", {
    class: "distribution-curve",
    viewBox: `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`,
    preserveAspectRatio: "none",
    focusable: "false",
  });
  svg.append(
    svgElement("path", { class: "distribution-area", d: curve.path, "vector-effect": "non-scaling-stroke" }),
  );
  if (curve.player) {
    // The player's bucket and every better one: the "top N%" share.
    const edge = game.better === "lower"
      ? (curve.player.bucket + 1) / game.buckets.buckets
      : curve.player.bucket / game.buckets.buckets;
    const clipId = `distribution-clip-${Math.random().toString(36).slice(2, 10)}`;
    const clip = svgElement("clipPath", { id: clipId });
    clip.append(
      svgElement("rect", {
        x: String(game.better === "lower" ? 0 : round(edge * PLOT_WIDTH)),
        y: "0",
        width: String(round((game.better === "lower" ? edge : 1 - edge) * PLOT_WIDTH)),
        height: String(PLOT_HEIGHT),
      }),
    );
    const ahead = svgElement("path", {
      class: "distribution-area distribution-area--ahead",
      d: curve.path,
      "clip-path": `url(#${clipId})`,
      "vector-effect": "non-scaling-stroke",
    });
    ahead.dataset.distributionAhead = "";
    svg.append(clip, ahead);
  }
  plot.append(svg);

  if (curve.player) {
    const marker = document.createElement("span");
    marker.className = "distribution-marker";
    marker.dataset.playerMarker = String(curve.player.bucket);
    marker.style.setProperty("--x", `${round(curve.player.x * 100)}%`);
    marker.style.setProperty("--y", `${round(curve.player.y * 100)}%`);
    plot.append(marker);
  }

  const axis = document.createElement("div");
  axis.className = "distribution-axis";
  axis.setAttribute("aria-hidden", "true");
  const [lowText, highText] = curve.labels;
  const low = document.createElement("span");
  low.className = "distribution-tick distribution-tick--low";
  low.textContent = lowText;
  const high = document.createElement("span");
  high.className = "distribution-tick distribution-tick--high";
  high.textContent = highText;
  (game.better === "lower" ? low : high).dataset.betterEnd = "";
  axis.append(low, high);
  if (curve.player && options.playerScore !== null) {
    const tick = document.createElement("span");
    tick.className = "distribution-tick distribution-tick--player";
    tick.textContent = scoreValue(game.kind, options.playerScore);
    tick.style.setProperty("--x", `${round(curve.player.x * 100)}%`);
    axis.append(tick);
    low.hidden = curve.player.x < END_LABEL_ROOM;
    high.hidden = curve.player.x > 1 - END_LABEL_ROOM;
  }

  root.append(head, plot, axis);
  return root;
}
