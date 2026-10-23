import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { countryDistanceKm, proximityRamp } from "./geography";
import { GLOBE_COUNTRIES, globeAnswer } from "./generate";
import { countryFills, createGlobe, fillColour, GLOBE_SHAPES } from "./globe";

const palette = { wrong: "#c62121", present: "#dac316", correct: "#55b725" };

describe("country outlines data", () => {
  it("has an outline for every core.json country", () => {
    const shaped = new Set(GLOBE_SHAPES.map((shape) => shape.iso));
    const missing = GLOBE_COUNTRIES.filter((country) => !shaped.has(country.iso));
    // No country is centroid-only today; add any here if Natural Earth changes.
    expect(missing.map((country) => country.iso)).toEqual([]);
    expect(GLOBE_SHAPES.length).toBe(GLOBE_COUNTRIES.length);
  });

  it("stays within the bundle budget", () => {
    const bytes = readFileSync("../shared/countries/shapes.json").byteLength;
    expect(bytes).toBeLessThan(200 * 1024);
    for (const shape of GLOBE_SHAPES) {
      expect(shape.rings.length).toBeGreaterThan(0);
      for (const ring of shape.rings) {
        expect(ring.length % 2).toBe(0);
        expect(ring.length / 2).toBeGreaterThanOrEqual(4);
        expect(ring.length / 2).toBeLessThanOrEqual(500);
        for (let index = 0; index < ring.length; index += 2) {
          expect(Math.abs(ring[index]!)).toBeLessThanOrEqual(180);
          expect(Math.abs(ring[index + 1]!)).toBeLessThanOrEqual(90);
          expect(ring[index]).toBe(Math.round(ring[index]! * 10) / 10);
        }
      }
    }
  });
});

describe("countryFills", () => {
  const answer = globeAnswer(208, "v1");
  const byDistance = GLOBE_COUNTRIES.filter((country) => country.iso !== answer.iso)
    .sort((a, b) => countryDistanceKm(a, answer) - countryDistanceKm(b, answer));
  const near = byDistance[0]!;
  const far = byDistance[byDistance.length - 1]!;

  it("colours a guess with the same ramp the guess list uses", () => {
    const fills = countryFills([far, near], answer, false);
    expect(fills.get(far.iso)).toEqual({
      kind: "guess",
      ...proximityRamp(countryDistanceKm(far, answer)),
    });
    expect(fills.get(near.iso)).toEqual({
      kind: "guess",
      ...proximityRamp(countryDistanceKm(near, answer)),
    });
    expect(fills.get(far.iso)).toMatchObject({ segment: "far" });
    expect(fills.get(near.iso)).toMatchObject({ segment: "near" });
  });

  it("keeps the answer hidden until it is guessed or the day is read-only", () => {
    expect(countryFills([far], answer, false).has(answer.iso)).toBe(false);
    expect(countryFills([far, answer], answer, false).get(answer.iso)).toEqual({
      kind: "answer",
    });
    expect(countryFills([], answer, true).get(answer.iso)).toEqual({ kind: "answer" });
    expect(countryFills([far], answer, false).size).toBe(1);
  });
});

describe("fillColour", () => {
  it("mixes between the design-system tokens like the rows' color-mix", () => {
    expect(fillColour({ kind: "answer" }, palette)).toBe(palette.correct);
    expect(fillColour({ kind: "guess", segment: "far", mix: 0 }, palette)).toBe(
      "rgb(198 33 33)",
    );
    expect(fillColour({ kind: "guess", segment: "far", mix: 100 }, palette)).toBe(
      "rgb(218 195 22)",
    );
    expect(fillColour({ kind: "guess", segment: "near", mix: 100 }, palette)).toBe(
      "rgb(85 183 37)",
    );
    expect(fillColour({ kind: "guess", segment: "near", mix: 50 }, palette)).toBe(
      "rgb(152 189 30)",
    );
  });
});

describe("createGlobe zoom gestures", () => {
  // jsdom has no PointerEvent and no 2D context; the gesture model only
  // needs the event names, pointer ids and client coordinates.
  const pointerEvent = (
    type: string,
    pointerId: number,
    x: number,
    y: number,
  ): MouseEvent => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event;
  };

  const setUp = (): { canvas: HTMLCanvasElement; zooms: number[]; handle: ReturnType<typeof createGlobe> } => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const canvas = document.createElement("canvas");
    const zooms: number[] = [];
    const handle = createGlobe(canvas, GLOBE_COUNTRIES, {
      shapes: [],
      onZoom: (zoom) => zooms.push(zoom),
    });
    return { canvas, zooms, handle };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pinches two pointers apart to zoom in and together to zoom out", () => {
    const { canvas, zooms, handle } = setUp();
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(pointerEvent("pointerdown", 2, 200, 100));
    canvas.dispatchEvent(pointerEvent("pointermove", 2, 300, 100));
    expect(handle.zoom()).toBe(2);
    canvas.dispatchEvent(pointerEvent("pointermove", 1, 50, 100));
    expect(handle.zoom()).toBe(2.5);
    canvas.dispatchEvent(pointerEvent("pointermove", 2, 150, 100));
    expect(handle.zoom()).toBe(1);
    expect(zooms).toEqual([2, 2.5, 1]);
    canvas.dispatchEvent(pointerEvent("pointerup", 2, 150, 100));
    canvas.dispatchEvent(pointerEvent("pointerup", 1, 50, 100));
    handle.dispose();
  });

  it("never pinches past 4× or under 1×", () => {
    const { canvas, handle } = setUp();
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(pointerEvent("pointerdown", 2, 110, 100));
    canvas.dispatchEvent(pointerEvent("pointermove", 2, 400, 100));
    expect(handle.zoom()).toBe(4);
    canvas.dispatchEvent(pointerEvent("pointermove", 2, 101, 100));
    expect(handle.zoom()).toBe(1);
    handle.dispose();
  });

  it("resets to 1× on a double tap, but not on two taps far apart in time", () => {
    const { canvas, handle } = setUp();
    const now = vi.spyOn(performance, "now");
    handle.setZoom(3);
    now.mockReturnValue(1000);
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(pointerEvent("pointerup", 1, 100, 100));
    now.mockReturnValue(2000);
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(pointerEvent("pointerup", 1, 100, 100));
    expect(handle.zoom()).toBe(3);
    now.mockReturnValue(2200);
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 105, 100));
    canvas.dispatchEvent(pointerEvent("pointerup", 1, 105, 100));
    expect(handle.zoom()).toBe(1);
    handle.dispose();
  });

  it("treats a drag as a rotation, not a tap", () => {
    const { canvas, handle } = setUp();
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    handle.setZoom(2);
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(pointerEvent("pointerup", 1, 100, 100));
    now.mockReturnValue(1100);
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 100, 100));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, 160, 100));
    canvas.dispatchEvent(pointerEvent("pointerup", 1, 160, 100));
    expect(handle.zoom()).toBe(2);
    handle.dispose();
  });

  it("zooms with the wheel and swallows the page scroll", () => {
    const { canvas, handle } = setUp();
    const wheelIn = new WheelEvent("wheel", { deltaY: -200, cancelable: true });
    canvas.dispatchEvent(wheelIn);
    expect(wheelIn.defaultPrevented).toBe(true);
    expect(handle.zoom()).toBeCloseTo(2, 9);
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true }));
    expect(handle.zoom()).toBeLessThan(2);
    expect(handle.zoom()).toBeGreaterThan(1);
    handle.dispose();
  });

  it("clamps setZoom and reports each change once", () => {
    const { zooms, handle } = setUp();
    handle.setZoom(9);
    handle.setZoom(9);
    handle.setZoom(0);
    expect(handle.zoom()).toBe(1);
    expect(zooms).toEqual([4, 1]);
    handle.dispose();
  });
});
