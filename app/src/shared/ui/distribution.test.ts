import { describe, expect, it } from "vitest";

import type { Histogram } from "../percentile";
import { COUNT_BUCKETS, SECONDS_BUCKETS } from "../roster";
import {
  axisLabels,
  bucketCounts,
  createDistribution,
  curvePath,
  distributionCurve,
  distributionLabel,
  kernelRadius,
  smoothCounts,
  type DistributionGame,
} from "./distribution";

function histogram(entries: [bucket: number, count: number][]): Histogram {
  return {
    total: entries.reduce((sum, [, count]) => sum + count, 0),
    buckets: entries.map(([bucket, count]) => ({ bucket, count })),
  };
}

const WORD: DistributionGame = { kind: "count", buckets: COUNT_BUCKETS, better: "lower" };
const SUDOKU: DistributionGame = { kind: "seconds", buckets: SECONDS_BUCKETS, better: "lower" };
/** Daily Color's shape (D24). */
const COLOR: DistributionGame = {
  kind: "points",
  buckets: { min: 0, max: 500, buckets: 100 },
  better: "higher",
};

describe("bucketCounts", () => {
  it("spreads the histogram over every bucket of the spec", () => {
    const counts = bucketCounts(COUNT_BUCKETS, histogram([[1, 3], [30, 2]]));
    expect(counts).toHaveLength(31);
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(3);
    expect(counts[30]).toBe(2);
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(5);
  });
});

describe("smoothCounts", () => {
  it("is a light 3-bucket kernel that keeps the peak where it was", () => {
    expect(smoothCounts([0, 0, 4, 0, 0])).toEqual([0, 1, 2, 1, 0]);
    // Renormalised at the edges: a crowd in the first bucket is not halved.
    expect(smoothCounts([4, 0, 0])).toEqual([(4 * 2) / 3, 1, 0]);
  });

  it("smooths the fine time axis a little wider than the count axis", () => {
    expect(kernelRadius(31)).toBe(1);
    expect(kernelRadius(100)).toBe(4);
    expect(kernelRadius(121)).toBe(5);
  });
});

describe("axisLabels", () => {
  it("labels the ends from the spec and the kind", () => {
    expect(axisLabels("count", COUNT_BUCKETS)).toEqual(["1", "31+"]);
    expect(axisLabels("seconds", SECONDS_BUCKETS)).toEqual(["0:00", "30:00+"]);
    expect(axisLabels("points", COLOR.buckets)).toEqual(["0", "50"]);
  });
});

describe("curvePath", () => {
  it("closes an area on the baseline and never rises above the peak's head room", () => {
    const path = curvePath([0, 5, 10, 5, 0], 100, 100);
    expect(path.startsWith("M0,100L0,100")).toBe(true);
    expect(path.endsWith("L100,100Z")).toBe(true);
    const ys = [...path.matchAll(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
    // Monotone segments: nothing overshoots the peak (y 14) or dips under the baseline (y 100).
    expect(Math.min(...ys)).toBeCloseTo(14, 5);
    expect(Math.max(...ys)).toBe(100);
  });

  it("draws a flat baseline for an empty day", () => {
    expect(curvePath([0, 0, 0], 30, 10)).toBe("M0,10L0,10L5,10C8.3,10 11.7,10 15,10C18.3,10 21.7,10 25,10L30,10L30,10Z");
  });
});

describe("distributionCurve", () => {
  it("places the player at their bucket's centre, at the curve's height there", () => {
    const curve = distributionCurve(WORD, histogram([[1, 3], [3, 1]]), 4);
    expect(curve.player?.bucket).toBe(3);
    expect(curve.player?.x).toBeCloseTo(3.5 / 31);
    expect(curve.player!.y).toBeGreaterThan(0);
    expect(curve.player!.y).toBeLessThan(0.86);
    expect(curve.labels).toEqual(["1", "31+"]);
  });

  it("marks nobody when the player has no score (a day summary of another day)", () => {
    expect(distributionCurve(WORD, histogram([[1, 1]]), null).player).toBeNull();
  });
});

describe("distributionLabel", () => {
  it("reads the player's rank as a sentence, or the count when unranked", () => {
    expect(distributionLabel(340, 12, false)).toBe("You are in the top 12% of 340 finishers");
    expect(distributionLabel(1, 100, false)).toBe("You are in the top 100% of 1 finisher");
    expect(distributionLabel(1204, 40, true)).toBe("You are in the top 40% of 1,204 finishers on the day");
    expect(distributionLabel(8, null, false)).toBe("8 finishers today");
  });
});

describe("createDistribution", () => {
  it("heads the card with the finisher count and 'you are here', and labels the figure with the rank", () => {
    const element = createDistribution({
      game: WORD,
      histogram: histogram([[1, 3], [3, 5]]),
      playerScore: 4,
      percentile: 38,
    });
    expect(element.getAttribute("aria-label")).toBe("You are in the top 38% of 8 finishers");
    expect(element.querySelector("[data-distribution-total]")?.textContent).toBe("8 finished today");
    expect(element.querySelector("[data-distribution-you]")?.textContent).toBe("you are here");
    expect(element.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 1000 100");
    expect(element.querySelector("[data-player-marker]")?.getAttribute("data-player-marker")).toBe("3");
    expect(element.querySelector(".distribution-tick--player")?.textContent).toBe("4");

    // The panel passes the finishers it ranks against; a late play reads "on the day".
    const late = createDistribution({
      game: WORD,
      histogram: histogram([[1, 1203]]),
      playerScore: null,
      finished: 1204,
      late: true,
    });
    expect(late.querySelector("[data-distribution-total]")?.textContent).toBe("1,204 finished on the day");
    expect(late.querySelector("[data-distribution-you]")).toBeNull();
    expect(late.querySelector("[data-player-marker]")).toBeNull();
    expect(late.querySelector("[data-distribution-ahead]")).toBeNull();
    expect(late.getAttribute("aria-label")).toBe("1,204 finishers on the day");
  });

  it("writes the axis ends from the spec and the player's time on a seconds game", () => {
    const element = createDistribution({
      game: SUDOKU,
      histogram: histogram([[8, 2], [16, 4]]),
      playerScore: 245,
      percentile: 50,
    });
    const ticks = [...element.querySelectorAll(".distribution-tick")].map((tick) => tick.textContent);
    expect(ticks).toEqual(["0:00", "30:00+", "4:05"]);
  });

  it("shades from the better end: the left for fewer guesses, the right for more points", () => {
    const word = createDistribution({ game: WORD, histogram: histogram([[3, 2]]), playerScore: 4, percentile: 50 });
    const wordClip = word.querySelector("clipPath rect")!;
    expect(wordClip.getAttribute("x")).toBe("0");
    expect(Number(wordClip.getAttribute("width"))).toBeCloseTo((4 / 31) * 1000, 0);
    expect(word.querySelector("[data-better-end]")?.classList.contains("distribution-tick--low")).toBe(true);

    // A higher-better game ranks the top bucket first: the shade runs from the right.
    const color = createDistribution({ game: COLOR, histogram: histogram([[60, 2]]), playerScore: 400, percentile: 50 });
    const colorClip = color.querySelector("clipPath rect")!;
    expect(colorClip.getAttribute("x")).toBe("800");
    expect(colorClip.getAttribute("width")).toBe("200");
    expect(color.querySelector("[data-better-end]")?.classList.contains("distribution-tick--high")).toBe(true);
    expect(color.dataset.better).toBe("higher");
    expect(color.querySelector(".distribution-tick--player")?.textContent).toBe("40");
  });

  it("hides the end label the player's tick would sit on", () => {
    const element = createDistribution({ game: WORD, histogram: histogram([[0, 2]]), playerScore: 1, percentile: 67 });
    expect(element.querySelector<HTMLElement>(".distribution-tick--low")?.hidden).toBe(true);
    expect(element.querySelector<HTMLElement>(".distribution-tick--high")?.hidden).toBe(false);
  });
});
