import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataSource } from "../../shared/data-source";
import { centsToHz, formatHundredths, hzToCents, toneScore } from "./engine";
import { soundAnswer } from "./generate";

const audio = vi.hoisted(() => {
  const live = { set: vi.fn<(hz: number) => void>(), stop: vi.fn<() => void>() };
  return {
    live,
    audioSupported: vi.fn(() => true),
    ensureAudio: vi.fn(async () => true),
    playTone: vi.fn(async (_hz: number, _seconds?: number) => undefined),
    startTone: vi.fn((_hz: number) => live),
  };
});

vi.mock("./audio", () => ({
  TONE_SECONDS: 2,
  audioSupported: audio.audioSupported,
  ensureAudio: audio.ensureAudio,
  playTone: audio.playTone,
  startTone: audio.startTone,
}));

const { renderSound } = await import("./view");

const DAY = 208;
const TARGETS = soundAnswer(DAY, "v1");
/** Where the pitch starts each tone: mid-range, 1800 cents above 110 Hz. */
const START_HZ = centsToHz(1800);

function sourceFor(played = 0n, record: DataSource["record"] = async () => undefined): DataSource {
  return {
    currentDay: async () => DAY,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
  };
}

const pitch = (root: Element) => root.querySelector<HTMLElement>("[data-sound-pitch]")!;

function press(target: HTMLElement, key: string, times = 1, shiftKey = false): void {
  for (let i = 0; i < times; i += 1) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
  }
}

/** Dials the pitch to whole cents with the keys alone: Home, then Shift steps, then fine ones. */
function dial(root: Element, cents: number): void {
  press(pitch(root), "Home");
  press(pitch(root), "ArrowUp", Math.floor(cents / 50), true);
  press(pitch(root), "ArrowUp", cents % 50);
}

// jsdom has no PointerEvent; the board needs the type, the pointer id and clientY.
function pointer(type: string, clientY: number): MouseEvent {
  const event = new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

async function open(source: DataSource): Promise<ReturnType<typeof renderSound>> {
  const view = renderSound(source, DAY);
  document.body.append(view.element);
  await vi.waitFor(() => expect(view.element.querySelector("[data-sound-phase]")).not.toBeNull());
  return view;
}

/** Taps Listen and waits out the 2-second tone. */
async function listen(root: Element): Promise<void> {
  root.querySelector<HTMLButtonElement>("[data-sound-listen]")!.click();
  await vi.advanceTimersByTimeAsync(2_200);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  audio.audioSupported.mockReturnValue(true);
  audio.ensureAudio.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("Sound view", () => {
  it("says it needs sound, plays the target once after the tap, then hands over the pitch", async () => {
    const view = await open(sourceFor());
    expect(view.element.querySelector("[data-sound-round]")?.textContent).toBe("Tone 1 of 5");
    expect(view.element.querySelector("[data-sound-note]")?.textContent).toContain("needs sound");
    // Nothing plays, and no context is made, before the tap.
    expect(audio.ensureAudio).not.toHaveBeenCalled();
    expect(audio.playTone).not.toHaveBeenCalled();
    expect(pitch(view.element)).toBeNull();

    view.element.querySelector<HTMLButtonElement>("[data-sound-listen]")!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.ensureAudio).toHaveBeenCalledTimes(1);
    expect(audio.playTone).toHaveBeenCalledTimes(1);
    expect(audio.playTone).toHaveBeenCalledWith(TARGETS[0], 2);
    const playing = view.element.querySelector<HTMLButtonElement>("[data-sound-listen]")!;
    expect(playing.disabled).toBe(true);
    // A second tap while it plays does not play it again.
    playing.click();
    await vi.advanceTimersByTimeAsync(2_200);
    expect(audio.playTone).toHaveBeenCalledTimes(1);

    // The listen is gone: there is no way to hear the target again this round.
    expect(view.element.querySelector("[data-sound-listen]")).toBeNull();
    const slider = pitch(view.element);
    expect(slider.getAttribute("role")).toBe("slider");
    expect(slider.getAttribute("aria-label")).toBe("Pitch");
    expect(slider.getAttribute("aria-orientation")).toBe("vertical");
    expect(slider.getAttribute("aria-valuemin")).toBe("110");
    expect(slider.getAttribute("aria-valuemax")).toBe("880");
    expect(slider.getAttribute("aria-valuetext")).toBe(`${START_HZ.toFixed(2)} Hz`);
    expect(document.activeElement).toBe(slider);
    view.dispose();
  });

  it("moves the pitch by a cent per arrow and fifty with Shift, sounding it as it goes", async () => {
    const view = await open(sourceFor());
    await listen(view.element);
    const slider = pitch(view.element);
    press(slider, "Home");
    expect(slider.getAttribute("aria-valuetext")).toBe("110.00 Hz");
    press(slider, "ArrowUp", 24, true);
    expect(slider.getAttribute("aria-valuetext")).toBe("220.00 Hz");
    expect(slider.getAttribute("aria-valuenow")).toBe("220.00");
    press(slider, "ArrowUp");
    expect(slider.getAttribute("aria-valuetext")).toBe("220.13 Hz");
    press(slider, "ArrowDown");
    press(slider, "ArrowDown", 1, true);
    expect(slider.getAttribute("aria-valuetext")).toBe(`${centsToHz(1150).toFixed(2)} Hz`);
    press(slider, "End");
    press(slider, "ArrowUp");
    expect(slider.getAttribute("aria-valuetext")).toBe("880.00 Hz");
    // The keys play the pitch while pressed, then let it go.
    expect(audio.startTone).toHaveBeenCalledTimes(1);
    expect(audio.live.set).toHaveBeenLastCalledWith(880);
    expect(audio.live.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(audio.live.stop).toHaveBeenCalled();
    view.dispose();
  });

  it("plays the tone live while held and dragged: top 880 Hz, bottom 110 Hz on a log scale", async () => {
    const view = await open(sourceFor());
    await listen(view.element);
    const slider = pitch(view.element);
    slider.getBoundingClientRect = () => ({ top: 100, height: 300, bottom: 400, left: 0, right: 300, width: 300, x: 0, y: 100, toJSON: () => ({}) });
    slider.dispatchEvent(pointer("pointerdown", 200)); // a third down: an octave below the top
    expect(slider.getAttribute("aria-valuetext")).toBe("440.00 Hz");
    expect(audio.startTone).toHaveBeenCalledWith(440);
    slider.dispatchEvent(pointer("pointermove", 300)); // two thirds down
    expect(slider.getAttribute("aria-valuetext")).toBe("220.00 Hz");
    expect(audio.live.set).toHaveBeenLastCalledWith(220);
    slider.dispatchEvent(pointer("pointermove", 500));
    expect(slider.getAttribute("aria-valuetext")).toBe("110.00 Hz");
    expect(audio.live.stop).not.toHaveBeenCalled();
    slider.dispatchEvent(pointer("pointerup", 500));
    expect(audio.live.stop).toHaveBeenCalledTimes(1);
    slider.dispatchEvent(pointer("pointermove", 100));
    expect(slider.getAttribute("aria-valuetext")).toBe("110.00 Hz");
    view.dispose();
  });

  it("submits, reveals round, score, verdict, target and guess, then the arrow goes to the next listen", async () => {
    const view = await open(sourceFor());
    await listen(view.element);
    dial(view.element, hzToCents(TARGETS[0]!));
    const guess = centsToHz(hzToCents(TARGETS[0]!));
    view.element.querySelector<HTMLButtonElement>("[data-sound-submit]")!.click();

    const reveal = view.element.querySelector<HTMLElement>('[data-sound-phase="reveal"]')!;
    const score = toneScore(TARGETS[0]!, guess);
    expect(score).toBeGreaterThan(990);
    expect(reveal.querySelector(".sound-reveal-round")?.textContent).toBe("1 / 5");
    expect(reveal.querySelector("[data-sound-round-score]")?.textContent).toBe(formatHundredths(score));
    expect(reveal.querySelector(".sound-verdict")?.textContent).toBe("Perfect pitch.");
    expect(reveal.querySelector("[data-sound-target]")?.textContent).toBe(`${TARGETS[0]!.toFixed(2)} Hz`);
    expect(reveal.querySelector("[data-sound-guess]")?.textContent).toBe(`${guess.toFixed(2)} Hz`);
    expect(view.element.querySelector("[data-sound-total]")?.textContent).toBe(`${formatHundredths(score)} points`);

    const next = view.element.querySelector<HTMLButtonElement>("[data-sound-next]")!;
    expect(next.getAttribute("aria-label")).toBe("Next tone");
    next.click();
    expect(view.element.querySelector("[data-sound-round]")?.textContent).toBe("Tone 2 of 5");
    expect(view.element.querySelector('[data-sound-phase="listen"]')).not.toBeNull();
    await listen(view.element);
    expect(audio.playTone).toHaveBeenLastCalledWith(TARGETS[1], 2);
    // Every tone's pitch starts mid-range again.
    expect(pitch(view.element).getAttribute("aria-valuetext")).toBe(`${START_HZ.toFixed(2)} Hz`);
    view.dispose();
  });

  it("records once, after the player moves on from the fifth reveal, the total in tenths", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = await open(sourceFor(0n, record));
    const guesses: number[] = [];
    for (let round = 0; round < 5; round += 1) {
      await listen(view.element);
      // A tone a hundred cents (a semitone) sharp of each target.
      const cents = Math.min(3600, hzToCents(TARGETS[round]!) + 100);
      dial(view.element, cents);
      guesses.push(centsToHz(cents));
      view.element.querySelector<HTMLButtonElement>("[data-sound-submit]")!.click();
      expect(view.element.querySelector("[data-sound-round-score]")?.textContent).toBe(
        formatHundredths(toneScore(TARGETS[round]!, guesses[round]!)),
      );
      expect(view.element.querySelector(".sound-reveal-round")?.textContent).toBe(`${round + 1} / 5`);
      // The fifth reveal stays up: nothing is written until the player moves on.
      expect(record).not.toHaveBeenCalled();
      expect(view.element.querySelector("[data-sound-next]")?.getAttribute("aria-label")).toBe(
        round < 4 ? "Next tone" : "See your total",
      );
      view.element.querySelector<HTMLButtonElement>("[data-sound-next]")!.click();
    }
    const hundredths = TARGETS.reduce((sum, target, index) => sum + toneScore(target, guesses[index]!), 0);
    const total = Math.floor((hundredths + 5) / 10);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(500);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(9, DAY, total, true);
    expect(view.element.querySelector("[data-sound-final]")?.getAttribute("data-sound-final")).toBe(String(total));
    expect(view.element.querySelector(".sound-final")?.textContent).toBe(
      `${total % 10 === 0 ? total / 10 : (total / 10).toFixed(1)} / 50`,
    );
    expect(view.element.querySelectorAll(".sound-pair")).toHaveLength(5);
    expect(pitch(view.element)).toBeNull();
    expect(audio.playTone).toHaveBeenCalledTimes(5);
    view.dispose();
  });

  it("restarts the current tone's listen after a reload and keeps the tones done", async () => {
    const first = await open(sourceFor());
    await listen(first.element);
    first.element.querySelector<HTMLButtonElement>("[data-sound-submit]")!.click();
    first.element.querySelector<HTMLButtonElement>("[data-sound-next]")!.click();
    await listen(first.element);
    first.dispose();
    document.body.replaceChildren();

    const again = await open(sourceFor());
    expect(again.element.querySelector("[data-sound-round]")?.textContent).toBe("Tone 2 of 5");
    expect(again.element.querySelector('[data-sound-phase="listen"]')).not.toBeNull();
    expect(pitch(again.element)).toBeNull();
    await listen(again.element);
    expect(audio.playTone).toHaveBeenLastCalledWith(TARGETS[1], 2);
    again.dispose();
  });

  it("shows a message, not a dead board, when sound is blocked or missing", async () => {
    audio.ensureAudio.mockResolvedValue(false);
    const view = await open(sourceFor());
    view.element.querySelector<HTMLButtonElement>("[data-sound-listen]")!.click();
    await vi.waitFor(() => expect(view.element.querySelector("[data-sound-note]")?.textContent).toContain("blocked"));
    expect(audio.playTone).not.toHaveBeenCalled();
    expect(pitch(view.element)).toBeNull();
    // The player can try again once the device lets sound through.
    audio.ensureAudio.mockResolvedValue(true);
    const retry = view.element.querySelector<HTMLButtonElement>("[data-sound-listen]")!;
    expect(retry.textContent).toBe("Try again");
    await listen(view.element);
    expect(audio.playTone).toHaveBeenCalledTimes(1);
    expect(pitch(view.element)).not.toBeNull();
    view.dispose();

    audio.audioSupported.mockReturnValue(false);
    const none = await open(sourceFor());
    expect(none.element.querySelector("[data-sound-note]")?.textContent).toContain("can't play in this browser");
    expect(none.element.querySelector("[data-sound-listen]")).toBeNull();
    none.dispose();
  });

  it("opens a day recorded elsewhere read-only, listing the day's five tones", async () => {
    const view = renderSound(sourceFor(1n << 9n), DAY);
    document.body.append(view.element);
    await vi.waitFor(() => expect(view.element.querySelector(".sound-result")).not.toBeNull());
    expect(view.element.querySelector("[data-sound-listen]")).toBeNull();
    expect(pitch(view.element)).toBeNull();
    const listed = [...view.element.querySelectorAll("[data-sound-pair-target]")].map((item) => item.textContent);
    expect(listed).toEqual(TARGETS.map((hz) => `${hz.toFixed(2)} Hz`));
    expect(view.element.querySelector(".sound-result")?.textContent).toContain("You already played");
    // Another game's bit does not lock Sound.
    view.dispose();
    const other = await open(sourceFor(1n << 8n));
    expect(other.element.querySelector("[data-sound-listen]")).not.toBeNull();
    other.dispose();
  });
});
