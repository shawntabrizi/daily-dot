import { afterEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { angleAnswer } from "./generate";
import { angleSvg, renderAngle } from "./view";

const DAY = 208;
const PUZZLE = angleAnswer(DAY, "v1");

function sourceFor(played = 0n, record: DataSource["record"] = async () => undefined): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
  };
}

const key = (root: Element, name: string): void => {
  root.querySelector<HTMLButtonElement>(`.angle-key[data-key="${name}"]`)!.click();
};

/** Types the degrees on the pad, then Guess. */
function guess(root: Element, degrees: number | string): void {
  for (const digit of String(degrees)) key(root, digit);
  key(root, "enter");
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("Angle view", () => {
  it("marks a reflex angle the long way round and never prints the value", () => {
    const reflex = angleSvg({ degrees: 290, rotation: 0 });
    expect(reflex).toMatch(/A 30 30 0 1 0/);
    const acute = angleSvg({ degrees: 40, rotation: 0 });
    expect(acute).toMatch(/A 30 30 0 0 0/);
    // No text in the drawing: the degrees are the thing to find.
    expect(acute).not.toMatch(/<text|°/);
  });

  it("gives the hint and the arrow for each guess, newest first, and refuses a bad degree", async () => {
    const view = renderAngle(sourceFor(), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".angle-pad")).not.toBeNull());

    // No text field anywhere: the phone keyboard would cover the hints.
    expect(view.element.querySelector("input")).toBeNull();

    // Three digits at most, no leading zero; 400 is refused without a guess spent.
    key(view.element, "0");
    expect(view.element.querySelector("[data-angle-draft]")?.getAttribute("data-angle-draft")).toBe("");
    expect(view.element.querySelector<HTMLButtonElement>('.angle-key[data-key="enter"]')!.disabled).toBe(true);
    for (const digit of "4001") key(view.element, digit);
    expect(view.element.querySelector("[data-angle-draft]")?.getAttribute("data-angle-draft")).toBe("400");
    key(view.element, "enter");
    expect(view.element.querySelector(".angle-message")?.textContent).toBe("Enter a whole degree from 1 to 359.");
    expect(view.element.querySelectorAll(".angle-row")).toHaveLength(0);

    // The desktop keyboard types too.
    for (const digit of "35") window.dispatchEvent(new KeyboardEvent("keydown", { key: digit }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    expect(view.element.querySelector("[data-angle-draft]")?.getAttribute("data-angle-draft")).toBe("3");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));

    const first = PUZZLE.degrees > 180 ? 1 : 359;
    guess(view.element, first);
    const second = PUZZLE.degrees > 180 ? 2 : 358;
    guess(view.element, second);
    const rows = [...view.element.querySelectorAll<HTMLElement>(".angle-row")];
    // The hints sit above the pad, under the drawing: nothing covers them.
    const list = view.element.querySelector(".angle-list")!;
    const pad = view.element.querySelector(".angle-pad")!;
    expect(list.compareDocumentPosition(pad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows.map((row) => row.dataset.angleGuess)).toEqual([String(second), String(first)]);
    expect(rows[0]!.querySelector(".angle-row-arrow")?.getAttribute("aria-label")).toBe(
      PUZZLE.degrees > second ? "The angle is larger" : "The angle is smaller",
    );
    view.dispose();
  });

  it("records once on the exact degree and shows the answer on the drawing", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderAngle(sourceFor(0n, record), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".angle-pad")).not.toBeNull());
    guess(view.element, PUZZLE.degrees === 180 ? 181 : 180);
    guess(view.element, PUZZLE.degrees);

    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(7, DAY, 2, true);
    expect(view.element.querySelector(".angle-pad")).toBeNull();
    expect(view.element.querySelector(".angle-answer")?.textContent).toBe(`${PUZZLE.degrees}°`);
    view.dispose();
  });

  it("opens a day recorded elsewhere read-only", async () => {
    const view = renderAngle(sourceFor(1n << 7n), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".angle-result")).not.toBeNull());
    expect(view.element.querySelector(".angle-pad")).toBeNull();
    expect(view.element.querySelector(".angle-result")?.textContent).toContain(`The angle was ${PUZZLE.degrees}°.`);
    view.dispose();
  });
});
