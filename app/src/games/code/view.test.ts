import { afterEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { codeAnswer } from "./generate";
import { loadCodeProgress } from "./progress";
import { renderCode } from "./view";

const DAY = 208;
const ANSWER = codeAnswer(DAY, "v1");

function sourceFor(played = 0n, record: DataSource["record"] = async () => undefined): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
  };
}

const press = (root: Element, key: string): void => {
  root.querySelector<HTMLButtonElement>(`.code-key[data-key="${key}"]`)!.click();
};
const enter = (root: Element, code: string): void => {
  for (const digit of code) press(root, digit);
  press(root, "enter");
};
/** A code that is not the answer and has no digit in common with it, so its pegs are empty. */
const miss = (): string => {
  const digit = [..."0123456789"].find((candidate) => !ANSWER.includes(candidate))!;
  return digit.repeat(4);
};

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("Code view", () => {
  it("types on the pad, refuses a short code, and lists each guess with its pegs", async () => {
    const view = renderCode(sourceFor(), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".code-pad")).not.toBeNull());

    press(view.element, "1");
    press(view.element, "2");
    expect(view.element.querySelector("[data-code-draft]")?.getAttribute("data-code-draft")).toBe("12");
    expect(view.element.querySelector<HTMLButtonElement>('.code-key[data-key="enter"]')!.disabled).toBe(true);
    press(view.element, "backspace");
    expect(view.element.querySelector("[data-code-draft]")?.getAttribute("data-code-draft")).toBe("1");
    press(view.element, "backspace");

    enter(view.element, miss());
    const row = view.element.querySelector(".code-row")!;
    expect(row.getAttribute("data-code-guess")).toBe(miss());
    expect(row.querySelector(".code-pegs")?.getAttribute("aria-label")).toBe("No digit in the code");
    expect(row.querySelectorAll(".code-peg--exact, .code-peg--near")).toHaveLength(0);

    // The physical keyboard types too.
    for (const digit of miss()) window.dispatchEvent(new KeyboardEvent("keydown", { key: digit }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(view.element.querySelector(".code-message")?.textContent).toBe(`You already tried ${miss()}.`);
    expect(view.element.querySelectorAll(".code-row")).toHaveLength(1);
    view.dispose();
  });

  it("records once when cracked and shows the result", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderCode(sourceFor(0n, record), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".code-pad")).not.toBeNull());
    enter(view.element, miss());
    enter(view.element, ANSWER);

    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(6, DAY, 2, true);
    expect(view.element.querySelector(".code-pad")).toBeNull();
    expect(loadCodeProgress(DAY, ANSWER).complete).toBe(true);
    view.dispose();
  });

  it("opens a day recorded elsewhere read-only, naming the code", async () => {
    const view = renderCode(sourceFor(1n << 6n), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".code-result")).not.toBeNull());
    expect(view.element.querySelector(".code-pad")).toBeNull();
    expect(view.element.querySelector(".code-result")?.textContent).toContain(`The code was ${ANSWER}.`);
    view.dispose();
  });
});
