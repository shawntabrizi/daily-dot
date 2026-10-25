import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { countryDistanceKm, proximityRamp } from "./geography";
import { GLOBE_COUNTRIES, GLOBE_PLACES, globeAnswer, placesForIds } from "./generate";
import {
  countriesNeedingDots,
  countryFills,
  createGlobe,
  fillColour,
  GLOBE_SHAPES,
  shapeExtent,
  shapeFill,
  SMALL_SHAPE_PIXELS,
} from "./globe";

const palette = { wrong: "#c62121", present: "#dac316", correct: "#55b725" };
const guessable = new Set(GLOBE_COUNTRIES.map((country) => country.id));
const place = (id: string) => GLOBE_PLACES.find((candidate) => candidate.id === id)!;

describe("country outlines data", () => {
  it("has an outline for every place, guessable or not", () => {
    const shaped = new Set(GLOBE_SHAPES.map((shape) => shape.id));
    // Even Vatican keeps a ring (on a finer grid); none is centroid-only.
    expect(GLOBE_PLACES.filter((candidate) => !shaped.has(candidate.id))).toEqual([]);
    expect(GLOBE_SHAPES.length).toBe(GLOBE_PLACES.length);
    for (const name of ["Vatican", "Monaco", "San Marino", "Singapore"]) {
      const country = GLOBE_COUNTRIES.find((candidate) => candidate.name === name)!;
      expect(shaped.has(country.id), name).toBe(true);
    }
  });

  it("stays within the bundle budget", () => {
    const bytes = readFileSync("../shared/countries/shapes.json").byteLength;
    expect(bytes).toBeLessThan(400 * 1024);
    for (const shape of GLOBE_SHAPES) {
      expect(shape.rings.length).toBeGreaterThan(0);
      for (const ring of shape.rings) {
        expect(ring.length % 2).toBe(0);
        expect(ring.length / 2).toBeGreaterThanOrEqual(4);
        expect(ring.length / 2).toBeLessThanOrEqual(2000);
        for (let index = 0; index < ring.length; index += 2) {
          expect(Math.abs(ring[index]!)).toBeLessThanOrEqual(180);
          expect(Math.abs(ring[index + 1]!)).toBeLessThanOrEqual(90);
        }
      }
    }
  });
});

describe("places that are not guessable (D26)", () => {
  const denmark = GLOBE_COUNTRIES.find((country) => country.name === "Denmark")!;
  const greenland = place("GRL");
  const answer = GLOBE_COUNTRIES.find((country) => country.name === "Australia")!;

  it("draws Greenland neutral once Denmark is guessed, and not before", () => {
    expect(greenland.owner).toBe(denmark.id);
    expect(guessable.has(greenland.id)).toBe(false);
    expect(shapeFill(greenland, countryFills([], answer, false), guessable)).toBeUndefined();
    expect(shapeFill(greenland, countryFills([denmark], answer, false), guessable)).toEqual({
      kind: "territory",
    });
    expect(fillColour({ kind: "territory" }, palette)).toBe("#707070");
  });

  it("reveals the answer's territories with it, but never fills them in its colour", () => {
    const denmarkAnswer = countryFills([], denmark, true);
    expect(shapeFill(greenland, denmarkAnswer, guessable)).toEqual({ kind: "territory" });
    expect(denmarkAnswer.has("GRL")).toBe(false);
    expect(shapeFill(denmark, denmarkAnswer, guessable)).toEqual({ kind: "answer" });
  });

  it("draws a guessable territory as itself: Hong Kong made guessable by config only", () => {
    // A fake config: today's guessable ids plus Hong Kong.
    const fakeGuessable = placesForIds(GLOBE_PLACES, [...guessable, "HKG"]);
    const ids = new Set(fakeGuessable.map((country) => country.id));
    const hongKong = fakeGuessable.find((country) => country.id === "HKG")!;
    const china = fakeGuessable.find((country) => country.id === "CHN")!;
    expect(hongKong).toMatchObject({ name: "Hong Kong", kind: "territory", owner: "CHN" });

    // China guessed: Hong Kong is not painted as China's neutral territory.
    const chinaGuessed = countryFills([china], answer, false);
    expect(shapeFill(hongKong, chinaGuessed, ids)).toBeUndefined();
    expect(shapeFill(hongKong, chinaGuessed, guessable)).toEqual({ kind: "territory" });
    // Hong Kong guessed: its own proximity colour, like any country.
    const hongKongGuessed = countryFills([hongKong], answer, false);
    expect(shapeFill(hongKong, hongKongGuessed, ids)).toEqual(hongKongGuessed.get("HKG"));
    expect(shapeFill(hongKong, hongKongGuessed, ids)).toMatchObject({ kind: "guess" });
    // And as the answer, the answer colour.
    expect(shapeFill(hongKong, countryFills([], hongKong, true), ids)).toEqual({ kind: "answer" });
  });
});

describe("small-country dots", () => {
  const extents = new Map(
    GLOBE_SHAPES.filter((shape) => guessable.has(shape.id)).map((shape) => [
      shape.id,
      shapeExtent(shape.rings),
    ]),
  );
  const named = (name: string) => GLOBE_COUNTRIES.find((country) => country.name === name)!;
  const singapore = named("Singapore");
  const vatican = named("Vatican");
  const france = named("France");
  const answer = named("Australia");
  // A 360 px phone canvas at 1×.
  const radius = 178.5;

  it("dots a guessed Singapore or Vatican but not France", () => {
    const fills = countryFills([singapore, vatican, france], answer, false);
    expect(
      countriesNeedingDots(GLOBE_COUNTRIES, extents, fills, radius)
        .map((country) => country.name)
        .sort(),
    ).toEqual(["Singapore", "Vatican"]);
  });

  it("dots only marked countries, and drops the dot once zoom makes the shape visible", () => {
    expect(countriesNeedingDots(GLOBE_COUNTRIES, extents, new Map(), radius)).toEqual([]);
    const fills = countryFills([singapore], answer, false);
    const pixels = extents.get(singapore.id)! * radius;
    expect(pixels).toBeLessThan(SMALL_SHAPE_PIXELS);
    expect(
      countriesNeedingDots(GLOBE_COUNTRIES, extents, fills, (SMALL_SHAPE_PIXELS / pixels) * radius * 1.01),
    ).toEqual([]);
  });

  it("dots a marked country with no outline at all", () => {
    const fills = countryFills([france], answer, false);
    expect(countriesNeedingDots([france], new Map(), fills, radius)).toEqual([france]);
  });
});

describe("countryFills", () => {
  const answer = globeAnswer(208, "v1");
  const byDistance = GLOBE_COUNTRIES.filter((country) => country.id !== answer.id)
    .sort((a, b) => countryDistanceKm(a, answer) - countryDistanceKm(b, answer));
  const near = byDistance[0]!;
  const far = byDistance[byDistance.length - 1]!;

  it("colours a guess with the same ramp the guess list uses", () => {
    const fills = countryFills([far, near], answer, false);
    expect(fills.get(far.id)).toEqual({
      kind: "guess",
      ...proximityRamp(countryDistanceKm(far, answer)),
    });
    expect(fills.get(near.id)).toEqual({
      kind: "guess",
      ...proximityRamp(countryDistanceKm(near, answer)),
    });
    expect(fills.get(far.id)).toMatchObject({ segment: "far" });
    expect(fills.get(near.id)).toMatchObject({ segment: "near" });
  });

  it("keeps the answer hidden until it is guessed or the day is read-only", () => {
    expect(countryFills([far], answer, false).has(answer.id)).toBe(false);
    expect(countryFills([far, answer], answer, false).get(answer.id)).toEqual({
      kind: "answer",
    });
    expect(countryFills([], answer, true).get(answer.id)).toEqual({ kind: "answer" });
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
