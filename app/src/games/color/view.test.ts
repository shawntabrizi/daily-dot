import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { hsbCss, roundScore, type Hsb } from "./engine";
import { colorAnswer } from "./generate";
import { renderColor } from "./view";

const DAY = 208;
const TARGETS = colorAnswer(DAY, "v1");
const START: Hsb = { hue: 180, saturation: 50, brightness: 50 };

function sourceFor(played = 0n, record: DataSource["record"] = async () => undefined): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
  };
}

const slider = (root: Element, channel: keyof Hsb) =>
  root.querySelector<HTMLElement>(`[data-color-slider="${channel}"]`)!;

function press(target: HTMLElement, key: string, times = 1): void {
  for (let i = 0; i < times; i += 1) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }
}

/** Walks a slider from its start to `value` with the arrow keys. */
function dial(root: Element, channel: keyof Hsb, value: number): void {
  const now = Number(slider(root, channel).getAttribute("aria-valuenow"));
  press(slider(root, channel), value > now ? "ArrowUp" : "ArrowDown", Math.abs(value - now));
}

// jsdom has no PointerEvent; the slider needs the type, the pointer id and clientY.
function pointer(type: string, clientY: number): MouseEvent {
  const event = new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

/** Opens the game and taps Start, as a player must before the first look. */
async function open(source: DataSource): Promise<ReturnType<typeof renderColor>> {
  const view = renderColor(source, DAY);
  document.body.append(view.element);
  await vi.waitFor(() => expect(view.element.querySelector("[data-color-phase]")).not.toBeNull());
  start(view.element);
  return view;
}

function start(root: Element): void {
  root.querySelector<HTMLButtonElement>("[data-color-start]")!.click();
}

/** Past the 5-second look of the current colour. */
async function look(): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("Color view", () => {
  it("waits for Start before showing a colour, so opening the game never starts the clock", async () => {
    const view = renderColor(sourceFor(), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector('[data-color-phase="ready"]')).not.toBeNull());
    await vi.advanceTimersByTimeAsync(10_000);
    // Still waiting: no colour on screen, no countdown ran.
    expect(view.element.querySelector('[data-color-phase="look"]')).toBeNull();
    expect(view.element.querySelector("[data-color-countdown]")).toBeNull();
    start(view.element);
    expect(view.element.querySelector('[data-color-phase="look"]')).not.toBeNull();
    expect(view.element.querySelector("[data-color-countdown]")?.textContent).toBe("5");
    view.dispose();
  });

  it("shows the colour full-board for 5 seconds with a countdown, then hides it for the sliders", async () => {
    const view = await open(sourceFor());
    const board = view.element.querySelector<HTMLElement>('[data-color-phase="look"]')!;
    expect(board.style.background).toBe(hsbCss(TARGETS[0]!));
    expect(view.element.querySelector("[data-color-round]")?.textContent).toBe("Colour 1 of 5");
    const countdown = () => view.element.querySelector("[data-color-countdown]")?.textContent;
    expect(countdown()).toBe("5");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(countdown()).toBe("4");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(countdown()).toBe("1");
    expect(view.element.querySelector("[data-color-slider]")).toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(view.element.querySelector('[data-color-phase="look"]')).toBeNull();
    const pick = view.element.querySelector<HTMLElement>('[data-color-phase="pick"]')!;
    // The target is gone: the board now shows the pick.
    expect(pick.style.background).toBe(hsbCss(START));
    expect(document.activeElement).toBe(slider(view.element, "hue"));
    view.dispose();
  });

  it("gives each slider a label and value text, moved by the arrow keys and by a drag", async () => {
    const view = await open(sourceFor());
    await look();
    const hue = slider(view.element, "hue");
    expect(hue.getAttribute("role")).toBe("slider");
    expect(hue.getAttribute("aria-label")).toBe("Hue");
    expect(hue.getAttribute("aria-orientation")).toBe("vertical");
    expect(hue.getAttribute("aria-valuetext")).toBe("Hue 180°");
    press(hue, "ArrowUp", 30);
    expect(hue.getAttribute("aria-valuenow")).toBe("210");
    expect(hue.getAttribute("aria-valuetext")).toBe("Hue 210°");
    press(hue, "PageDown");
    expect(hue.getAttribute("aria-valuetext")).toBe("Hue 200°");
    press(hue, "End");
    expect(hue.getAttribute("aria-valuemax")).toBe("359");
    expect(hue.getAttribute("aria-valuenow")).toBe("359");
    press(hue, "ArrowUp");
    expect(hue.getAttribute("aria-valuenow")).toBe("359");
    press(hue, "Home");
    press(hue, "ArrowLeft");
    expect(hue.getAttribute("aria-valuenow")).toBe("0");

    const saturation = slider(view.element, "saturation");
    press(saturation, "ArrowUp", 10);
    expect(saturation.getAttribute("aria-valuetext")).toBe("Saturation 60%");
    const brightness = slider(view.element, "brightness");
    brightness.getBoundingClientRect = () => ({ top: 100, height: 200, bottom: 300, left: 0, right: 44, width: 44, x: 0, y: 100, toJSON: () => ({}) });
    brightness.dispatchEvent(pointer("pointerdown", 140)); // 20% from the top
    expect(brightness.getAttribute("aria-valuetext")).toBe("Brightness 80%");
    brightness.dispatchEvent(pointer("pointermove", 300));
    expect(brightness.getAttribute("aria-valuenow")).toBe("0");
    brightness.dispatchEvent(pointer("pointerup", 300));
    brightness.dispatchEvent(pointer("pointermove", 100));
    expect(brightness.getAttribute("aria-valuenow")).toBe("0");

    // The board and the other columns follow the pick.
    const picked: Hsb = { hue: 0, saturation: 60, brightness: 0 };
    expect(view.element.querySelector<HTMLElement>('[data-color-phase="pick"]')!.style.background).toBe(hsbCss(picked));
    view.dispose();
  });

  it("submits, reveals the colour beside the guess with its score out of 10, then shows the next colour", async () => {
    const view = await open(sourceFor());
    await look();
    dial(view.element, "hue", TARGETS[0]!.hue);
    dial(view.element, "saturation", TARGETS[0]!.saturation);
    dial(view.element, "brightness", TARGETS[0]!.brightness);
    view.element.querySelector<HTMLButtonElement>("[data-color-submit]")!.click();

    const reveal = view.element.querySelector<HTMLElement>('[data-color-phase="reveal"]')!;
    const halves = [...reveal.querySelectorAll<HTMLElement>(".color-half")];
    expect(halves.map((half) => half.style.background)).toEqual([hsbCss(TARGETS[0]!), hsbCss(TARGETS[0]!)]);
    expect(reveal.querySelector(".color-reveal-score")?.textContent).toBe("10 / 10");
    expect(view.element.querySelector("[data-color-total]")?.textContent).toBe("10 points");

    view.element.querySelector<HTMLButtonElement>("[data-color-next]")!.click();
    expect(view.element.querySelector("[data-color-round]")?.textContent).toBe("Colour 2 of 5");
    expect(view.element.querySelector<HTMLElement>('[data-color-phase="look"]')!.style.background).toBe(hsbCss(TARGETS[1]!));
    expect(view.element.querySelector("[data-color-countdown]")?.textContent).toBe("5");
    view.dispose();
  });

  it("records once after the fifth colour, the total in tenths, and shows it out of 50", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = await open(sourceFor(0n, record));
    for (let round = 0; round < 5; round += 1) {
      await look();
      // The sliders start mid-way every colour; submit them as they are.
      view.element.querySelector<HTMLButtonElement>("[data-color-submit]")!.click();
      expect(view.element.querySelector(".color-reveal-score strong")?.textContent).toBe(
        String(roundScore(TARGETS[round]!, START) / 10),
      );
      expect(record).not.toHaveBeenCalled();
      expect(view.element.querySelector("[data-color-next]")?.textContent).toBe(
        round < 4 ? "Next colour" : "See your total",
      );
      view.element.querySelector<HTMLButtonElement>("[data-color-next]")!.click();
    }
    const total = TARGETS.reduce((sum, target) => sum + roundScore(target, START), 0);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(8, DAY, total, true);
    expect(view.element.querySelector("[data-color-final]")?.getAttribute("data-color-final")).toBe(String(total));
    expect(view.element.querySelector(".color-final")?.textContent).toBe(`${(total / 10).toString()} / 50`);
    expect(view.element.querySelectorAll(".color-pair")).toHaveLength(5);
    expect(view.element.querySelector("[data-color-slider]")).toBeNull();
    view.dispose();
  });

  it("restarts the current colour's look after a reload and keeps the colours done", async () => {
    const first = await open(sourceFor());
    await look();
    first.element.querySelector<HTMLButtonElement>("[data-color-submit]")!.click();
    first.dispose();
    document.body.replaceChildren();

    const again = await open(sourceFor());
    expect(again.element.querySelector("[data-color-round]")?.textContent).toBe("Colour 2 of 5");
    expect(again.element.querySelector("[data-color-countdown]")?.textContent).toBe("5");
    expect(again.element.querySelector<HTMLElement>('[data-color-phase="look"]')!.style.background).toBe(hsbCss(TARGETS[1]!));
    again.dispose();
  });

  it("opens a day recorded elsewhere read-only, with the day's five colours", async () => {
    const view = renderColor(sourceFor(1n << 8n), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".color-result")).not.toBeNull());
    expect(view.element.querySelector("[data-color-slider]")).toBeNull();
    expect(view.element.querySelector("[data-color-countdown]")).toBeNull();
    const swatches = [...view.element.querySelectorAll<HTMLElement>(".color-pair-swatch")];
    expect(swatches.map((swatch) => swatch.style.background)).toEqual(TARGETS.map(hsbCss));
    expect(view.element.querySelector(".color-result")?.textContent).toContain("You already played");
    view.dispose();
  });
});
