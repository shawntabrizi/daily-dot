import { describe, expect, it } from "vitest";

import type { Histogram } from "../percentile";
import { createDistribution, distributionBars } from "./distribution";

function histogram(entries: [bucket: number, count: number][]): Histogram {
  return {
    total: entries.reduce((sum, [, count]) => sum + count, 0),
    buckets: entries.map(([bucket, count]) => ({ bucket, count })),
  };
}

describe("distributionBars", () => {
  it("draws guess counts from 1 to the last finisher, at least six bars", () => {
    const bars = distributionBars("count", histogram([[2, 3], [4, 1]]), 4);
    expect(bars.map((bar) => bar.label)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(bars.map((bar) => bar.count)).toEqual([0, 3, 0, 1, 0, 0]);
    expect(bars.map((bar) => bar.player)).toEqual([false, false, false, true, false, false]);
    expect(bars.every((bar) => bar.labelled)).toBe(true);
  });

  it("extends to the player's bucket and caps at 31+", () => {
    const bars = distributionBars("count", histogram([[3, 2]]), 9);
    expect(bars).toHaveLength(9);
    expect(bars[8]).toMatchObject({ label: "9", player: true });

    const capped = distributionBars("count", histogram([[3, 2], [31, 1]]), 500);
    expect(capped).toHaveLength(31);
    expect(capped[30]).toMatchObject({ label: "31+", count: 1, player: true });
  });

  it("labels only a few ticks on a crowded axis, the player's always", () => {
    const bars = distributionBars("count", histogram([[20, 1]]), 17);
    expect(bars).toHaveLength(20);
    expect(bars.filter((bar) => bar.labelled).map((bar) => bar.label)).toEqual([
      "1",
      "5",
      "10",
      "15",
      "17",
      "20",
    ]);
  });

  it("groups seconds into minutes, 0 to the last finisher, 30+ at the top", () => {
    // Buckets 13 (3:15) and 15 (3:45) are both minute 3; 120 is 30 min+.
    const bars = distributionBars("seconds", histogram([[13, 2], [15, 1], [120, 1]]), 205);
    expect(bars).toHaveLength(31);
    expect(bars[3]).toMatchObject({ label: "3", count: 3, player: true });
    expect(bars[30]).toMatchObject({ label: "30+", count: 1 });
    // Ten minute bars pass the board's eight: the axis labels 0, 5, the end and the player.
    const quiet = distributionBars("seconds", histogram([]), 50);
    expect(quiet).toHaveLength(10);
    expect(quiet.filter((bar) => bar.labelled).map((bar) => bar.label)).toEqual(["0", "5", "9"]);
  });

  it("labels every bar up to the board's eight", () => {
    const eight = distributionBars("count", histogram([[8, 1]]), 3);
    expect(eight).toHaveLength(8);
    expect(eight.every((bar) => bar.labelled)).toBe(true);
    const nine = distributionBars("count", histogram([[9, 1]]), 3);
    expect(nine.filter((bar) => bar.labelled).map((bar) => bar.label)).toEqual(["1", "3", "5", "9"]);
  });

  it("marks no bar when the player has no score (a day summary of another day)", () => {
    const bars = distributionBars("count", histogram([[2, 1]]), null);
    expect(bars.some((bar) => bar.player)).toBe(false);
  });
});

describe("createDistribution", () => {
  it("heads the card with the finisher count and 'you are here', and marks the player's bar without a count", () => {
    const element = createDistribution({
      kind: "count",
      histogram: histogram([[2, 3], [4, 5]]),
      playerScore: 4,
    });
    expect(element.getAttribute("aria-label")).toBe("8 finishers today by guesses");
    expect(element.querySelector("[data-distribution-total]")?.textContent).toBe("8 finished today");
    expect(element.querySelector("[data-distribution-you]")?.textContent).toBe("you are here");
    const player = element.querySelector<HTMLElement>("[data-player-bar]");
    expect(player?.textContent).toBe("");
    expect(player?.style.getPropertyValue("--fill")).toBe("100%");
    expect(element.querySelectorAll(".distribution-bar--player")).toHaveLength(1);
    expect(element.querySelector(".distribution-tick--player")?.textContent).toBe("4");

    // The panel passes the finishers it ranks against; a late play reads "on the day".
    const late = createDistribution({
      kind: "count",
      histogram: histogram([[2, 1203]]),
      playerScore: null,
      finished: 1204,
      late: true,
    });
    expect(late.querySelector("[data-distribution-total]")?.textContent).toBe("1,204 finished on the day");
    expect(late.querySelector("[data-distribution-you]")).toBeNull();
  });

  it("scales bars against the tallest one", () => {
    const element = createDistribution({
      kind: "seconds",
      histogram: histogram([[4, 2], [8, 4]]),
      playerScore: 60,
    });
    const fills = [...element.querySelectorAll<HTMLElement>(".distribution-bar")].map(
      (bar) => bar.style.getPropertyValue("--fill"),
    );
    expect(fills[1]).toBe("50%");
    expect(fills[2]).toBe("100%");
    expect(element.getAttribute("aria-label")).toBe("6 finishers today by minutes");
  });
});
