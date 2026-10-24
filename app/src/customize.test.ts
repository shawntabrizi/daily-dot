import { afterEach, describe, expect, it } from "vitest";

import { renderCustomize } from "./customize";
import { currentPicks, savePicks } from "./shared/picks";
import { GAME_ROSTER } from "./shared/roster";

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

const boxes = (root: Element): HTMLInputElement[] => [...root.querySelectorAll<HTMLInputElement>(".customize-check")];
const box = (root: Element, gameId: number): HTMLInputElement =>
  boxes(root).find((entry) => entry.value === String(gameId))!;

describe("customize", () => {
  it("lists every roster game with the picks ticked", () => {
    const view = renderCustomize();
    expect(boxes(view.element)).toHaveLength(GAME_ROSTER.length);
    expect(boxes(view.element).filter((entry) => entry.checked).map((entry) => Number(entry.value))).toEqual([0, 4, 5, 6]);
    expect(view.element.querySelector('[data-customize-game="mini"]')?.classList.contains("is-picked")).toBe(true);
    expect(view.element.querySelector('[data-customize-game="globe"]')?.classList.contains("is-picked")).toBe(false);
  });

  it("saves each tick and untick at once", () => {
    const view = renderCustomize();
    document.body.append(view.element);
    box(view.element, 3).click();
    expect(currentPicks()).toEqual([0, 3, 4, 5, 6]);
    box(view.element, 0).click();
    expect(currentPicks()).toEqual([3, 4, 5, 6]);
    expect(view.element.querySelector("[data-customize-note]")?.textContent).toBe("4 games picked.");
  });

  it("never lets the last pick go", () => {
    savePicks([2]);
    const view = renderCustomize();
    document.body.append(view.element);
    const chess = box(view.element, 2);
    expect(chess.checked).toBe(true);
    expect(chess.disabled).toBe(true);
    expect(view.element.querySelector("[data-customize-note]")?.textContent).toBe("At least one game stays picked.");

    // A second pick frees the first again.
    box(view.element, 1).click();
    expect(chess.disabled).toBe(false);
    expect(currentPicks()).toEqual([1, 2]);
  });
});
