import shapeData from "../../../../shared/countries/shapes.json";
import type { GeoPoint, ProximityRamp } from "./geography";
import { countryDistanceKm, proximityRamp } from "./geography";
import type { Country } from "./generate";
import {
  clampZoom,
  dragRotate,
  globeRadius,
  pinchZoom,
  project,
  rotateToward,
  wheelZoom,
} from "./projection";

/**
 * Why a shape is coloured: the guess ramp the list uses, the answer, or a
 * territory whose owner is marked (D26: neutral, never a guess colour).
 */
export type CountryFill =
  | { kind: "guess"; segment: ProximityRamp["segment"]; mix: number }
  | { kind: "answer" }
  | { kind: "territory" };

export interface GlobeHandle {
  setFills(fills: ReadonlyMap<string, CountryFill>): void;
  /** Turn the globe so `point` is in the middle; animates unless told not to. */
  focus(point: GeoPoint, animate?: boolean): void;
  zoom(): number;
  /** Set the zoom factor; it is clamped to `ZOOM_MIN..ZOOM_MAX`. */
  setZoom(zoom: number): void;
  dispose(): void;
}

export interface GlobeOptions {
  shapes?: readonly CountryShape[];
  /** Called after any zoom change: buttons, pinch, wheel or double-tap. */
  onZoom?: (zoom: number) => void;
}

export interface GlobePalette {
  wrong: string;
  present: string;
  correct: string;
  /** The found country (WP36 decision 9: accent on the done state); `correct` when unset. */
  accent?: string;
  /** A marked country's territories; `--neutral` when unset. */
  neutral?: string;
}

export interface CountryShape {
  iso: string;
  /** Set on a territory: the guessable country whose mark reveals it. */
  owner?: string;
  rings: number[][];
}

interface PreparedRing {
  cosLat: Float64Array;
  sinLat: Float64Array;
  lng: Float64Array;
}

interface PreparedShape {
  iso: string;
  owner?: string;
  rings: PreparedRing[];
}

export const GLOBE_SHAPES: readonly CountryShape[] = shapeData;

/** The design-system tokens, as fallbacks when CSS variables are unreadable. */
const DEFAULT_PALETTE: GlobePalette = {
  wrong: "#c62121",
  present: "#dac316",
  correct: "#55b725",
};
const OCEAN = "#1e2021";
const LAND = "rgb(112 112 112 / 38%)";
const OUTLINE = "rgb(112 112 112 / 55%)";
const GRATICULE = "rgb(236 236 236 / 7%)";
const RIM = "rgb(236 236 236 / 18%)";
const INITIAL_CENTRE: GeoPoint = { lat: 20, lng: 0 };
const FOCUS_DURATION_MS = 700;
const GRATICULE_STEP_DEGREES = 30;
const GRATICULE_SAMPLE_DEGREES = 3;
const CENTROID_DOT_RADIUS = 3;
const NEUTRAL = "#707070";
/**
 * A marked country whose largest ring spans fewer canvas pixels than this
 * also gets a dot at its label point, so Singapore or Vatican is seen.
 */
export const SMALL_SHAPE_PIXELS = 4;
/** A tap moves less than this; a drag past it is not a tap. */
const TAP_SLOP_PIXELS = 10;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PIXELS = 30;

/**
 * Which countries the globe colours. Guesses reuse the list's proximity
 * ramp so both views agree; the answer is drawn only when it is revealed
 * (solved, or a recorded day opened read-only).
 */
export function countryFills(
  guesses: readonly Country[],
  answer: Country,
  revealAnswer: boolean,
): Map<string, CountryFill> {
  const fills = new Map<string, CountryFill>();
  for (const guess of guesses) {
    if (guess.iso === answer.iso) {
      continue;
    }
    const ramp = proximityRamp(countryDistanceKm(guess, answer));
    fills.set(guess.iso, { kind: "guess", segment: ramp.segment, mix: ramp.mix });
  }
  if (revealAnswer || guesses.some((guess) => guess.iso === answer.iso)) {
    fills.set(answer.iso, { kind: "answer" });
  }
  return fills;
}

/** A territory takes its owner's mark, as neutral land; it has no fill of its own. */
export function shapeFill(
  shape: Pick<CountryShape, "iso" | "owner">,
  fills: ReadonlyMap<string, CountryFill>,
): CountryFill | undefined {
  if (shape.owner !== undefined) {
    return fills.has(shape.owner) ? { kind: "territory" } : undefined;
  }
  return fills.get(shape.iso);
}

/**
 * The angular size, in radians, of a shape's largest ring: its bounding
 * box's longer side, with longitude shrunk by latitude. On a globe of
 * `radius` pixels the ring spans about `extent × radius` pixels at the centre.
 */
export function shapeExtent(rings: readonly (readonly number[])[]): number {
  let largest = 0;
  for (const ring of rings) {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (let index = 0; index < ring.length; index += 2) {
      minLng = Math.min(minLng, ring[index]!);
      maxLng = Math.max(maxLng, ring[index]!);
      minLat = Math.min(minLat, ring[index + 1]!);
      maxLat = Math.max(maxLat, ring[index + 1]!);
    }
    const middle = ((minLat + maxLat) / 2) * Math.PI / 180;
    const span = Math.max(
      maxLat - minLat,
      (maxLng - minLng) * Math.cos(middle),
    );
    largest = Math.max(largest, span);
  }
  return largest * Math.PI / 180;
}

/**
 * The marked countries that get a label-point dot on a globe of `radius`
 * pixels: those with no outline, and those whose outline is too small to see.
 */
export function countriesNeedingDots(
  countries: readonly Country[],
  extents: ReadonlyMap<string, number>,
  fills: ReadonlyMap<string, CountryFill>,
  radius: number,
): Country[] {
  return countries.filter((country) => {
    if (!fills.has(country.iso)) {
      return false;
    }
    const extent = extents.get(country.iso);
    return extent === undefined || extent * radius < SMALL_SHAPE_PIXELS;
  });
}

function parseHex(colour: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** `color-mix(in srgb, top mix%, base)`, matching the list rows' CSS. */
function mixColours(base: string, top: string, mixPercent: number): string {
  const from = parseHex(base);
  const to = parseHex(top);
  if (!from || !to) {
    return mixPercent >= 50 ? top : base;
  }
  const weight = Math.max(0, Math.min(100, mixPercent)) / 100;
  const channel = (index: number): number =>
    Math.round(from[index]! + (to[index]! - from[index]!) * weight);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

export function fillColour(fill: CountryFill, palette: GlobePalette): string {
  if (fill.kind === "answer") {
    return palette.accent ?? palette.correct;
  }
  if (fill.kind === "territory") {
    return palette.neutral ?? NEUTRAL;
  }
  return fill.segment === "near"
    ? mixColours(palette.present, palette.correct, fill.mix)
    : mixColours(palette.wrong, palette.present, fill.mix);
}

function readPalette(element: Element): GlobePalette {
  const styles = getComputedStyle(element);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return parseHex(value) ? value : fallback;
  };
  return {
    wrong: token("--wrong", DEFAULT_PALETTE.wrong),
    present: token("--present", DEFAULT_PALETTE.present),
    correct: token("--correct", DEFAULT_PALETTE.correct),
    accent: token("--accent-globe", DEFAULT_PALETTE.correct),
    neutral: token("--neutral", NEUTRAL),
  };
}

function prepareShapes(shapes: readonly CountryShape[]): PreparedShape[] {
  return shapes.map((shape) => ({
    iso: shape.iso,
    ...(shape.owner === undefined ? {} : { owner: shape.owner }),
    rings: shape.rings.map((ring) => {
      const count = ring.length / 2;
      const prepared: PreparedRing = {
        cosLat: new Float64Array(count),
        sinLat: new Float64Array(count),
        lng: new Float64Array(count),
      };
      for (let index = 0; index < count; index += 1) {
        const latitude = (ring[index * 2 + 1]! * Math.PI) / 180;
        prepared.cosLat[index] = Math.cos(latitude);
        prepared.sinLat[index] = Math.sin(latitude);
        prepared.lng[index] = (ring[index * 2]! * Math.PI) / 180;
      }
      return prepared;
    }),
  }));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function reducedMotion(): boolean {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface PointerPosition {
  x: number;
  y: number;
}

function distanceBetween(pointers: ReadonlyMap<number, PointerPosition>): number {
  const [first, second] = pointers.values();
  if (!first || !second) {
    return 0;
  }
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/**
 * Draws the globe into `canvas` and owns its pointer interaction. Nothing
 * else is touched: the view decides fills and focus, this module only draws.
 * There is no animation loop while idle; frames run on drag or focus only.
 * Zoom lives here, in memory only: one finger drags, two pinch, the wheel
 * zooms about the centre, a double tap resets to 1×.
 */
export function createGlobe(
  canvas: HTMLCanvasElement,
  countries: readonly Country[],
  options: GlobeOptions = {},
): GlobeHandle {
  const shapes = options.shapes ?? GLOBE_SHAPES;
  const context = canvas.getContext("2d");
  const prepared = prepareShapes(shapes);
  const shaped = new Set(prepared.map((shape) => shape.iso));
  const centroidOnly = countries.filter((country) => !shaped.has(country.iso));
  const extents = new Map(
    shapes
      .filter((shape) => shape.owner === undefined)
      .map((shape) => [shape.iso, shapeExtent(shape.rings)]),
  );
  let palette: GlobePalette | null = null;
  let fills: ReadonlyMap<string, CountryFill> = new Map();
  let centre: GeoPoint = INITIAL_CENTRE;
  let frame = 0;
  let animation: { from: GeoPoint; to: GeoPoint; startedAt: number } | null =
    null;
  let drag: { pointerId: number; x: number; y: number } | null = null;
  let zoom = 1;
  const pointers = new Map<number, PointerPosition>();
  let pinch: { startZoom: number; startDistance: number } | null = null;
  let tap: { pointerId: number; x: number; y: number; moved: boolean } | null =
    null;
  let lastTap: { at: number; x: number; y: number } | null = null;
  let disposed = false;

  // When zoomed the disc is larger than the canvas; the canvas edge clips it.
  const radiusFor = (size: number): number => globeRadius(size, zoom);

  const applyZoom = (next: number): void => {
    const clamped = clampZoom(next);
    if (clamped === zoom) {
      return;
    }
    zoom = clamped;
    options.onZoom?.(zoom);
    schedule();
  };

  const draw = (): void => {
    if (!context) {
      return;
    }
    const size = Math.max(0, Math.floor(canvas.clientWidth));
    if (size === 0) {
      return;
    }
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const pixels = Math.round(size * ratio);
    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    palette ??= readPalette(canvas);
    const radius = radiusFor(size);
    const middle = size / 2;
    const centreLatitude = (centre.lat * Math.PI) / 180;
    const centreLongitude = (centre.lng * Math.PI) / 180;
    const sinCentre = Math.sin(centreLatitude);
    const cosCentre = Math.cos(centreLatitude);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);

    context.beginPath();
    context.arc(middle, middle, radius, 0, Math.PI * 2);
    context.fillStyle = OCEAN;
    context.fill();

    context.save();
    context.clip();

    context.beginPath();
    for (
      let latitude = -90 + GRATICULE_STEP_DEGREES;
      latitude < 90;
      latitude += GRATICULE_STEP_DEGREES
    ) {
      traceLine(
        (step) => ({ lat: latitude, lng: -180 + step * GRATICULE_SAMPLE_DEGREES }),
        360 / GRATICULE_SAMPLE_DEGREES,
      );
    }
    for (let longitude = -180; longitude < 180; longitude += GRATICULE_STEP_DEGREES) {
      traceLine(
        (step) => ({ lat: -90 + step * GRATICULE_SAMPLE_DEGREES, lng: longitude }),
        180 / GRATICULE_SAMPLE_DEGREES,
      );
    }
    context.lineWidth = 1;
    context.strokeStyle = GRATICULE;
    context.stroke();

    for (const shape of prepared) {
      const fill = shapeFill(shape, fills);
      context.beginPath();
      let drewAny = false;
      for (const ring of shape.rings) {
        let anyVisible = false;
        const count = ring.lng.length;
        const points = new Float64Array(count * 2);
        for (let index = 0; index < count; index += 1) {
          const delta = ring.lng[index]! - centreLongitude;
          const cosDelta = Math.cos(delta);
          let x = ring.cosLat[index]! * Math.sin(delta);
          let y = cosCentre * ring.sinLat[index]! - sinCentre * ring.cosLat[index]! * cosDelta;
          const z = sinCentre * ring.sinLat[index]! + cosCentre * ring.cosLat[index]! * cosDelta;
          if (z < 0) {
            // Far-side points hug the rim so a ring crossing the horizon
            // still closes along the edge instead of across the disc.
            const length = Math.hypot(x, y) || 1;
            x = (x / length) * 1.01;
            y = (y / length) * 1.01;
          } else {
            anyVisible = true;
          }
          points[index * 2] = middle + x * radius;
          points[index * 2 + 1] = middle - y * radius;
        }
        if (!anyVisible) {
          continue;
        }
        drewAny = true;
        context.moveTo(points[0]!, points[1]!);
        for (let index = 1; index < count; index += 1) {
          context.lineTo(points[index * 2]!, points[index * 2 + 1]!);
        }
        context.closePath();
      }
      if (!drewAny) {
        continue;
      }
      context.fillStyle = fill ? fillColour(fill, palette) : LAND;
      context.fill("evenodd");
      context.lineWidth = fill ? 1.2 : 0.8;
      context.strokeStyle = fill ? "rgb(22 24 25 / 70%)" : OUTLINE;
      context.stroke();
    }

    // Unmarked countries with no outline still show where they are; marked
    // ones, and marked ones too small to see, get their fill as a dot on top.
    const dotted = countriesNeedingDots(countries, extents, fills, radius);
    for (const country of [
      ...centroidOnly.filter((candidate) => !fills.has(candidate.iso)),
      ...dotted,
    ]) {
      const point = project(country, centre);
      if (point.z < 0) {
        continue;
      }
      const fill = fills.get(country.iso);
      context.beginPath();
      context.arc(
        middle + point.x * radius,
        middle - point.y * radius,
        CENTROID_DOT_RADIUS,
        0,
        Math.PI * 2,
      );
      context.fillStyle = fill ? fillColour(fill, palette) : OUTLINE;
      context.fill();
      if (fill) {
        context.lineWidth = 1;
        context.strokeStyle = "rgb(22 24 25 / 70%)";
        context.stroke();
      }
    }

    context.restore();

    context.beginPath();
    context.arc(middle, middle, radius, 0, Math.PI * 2);
    context.lineWidth = 1;
    context.strokeStyle = RIM;
    context.stroke();

    function traceLine(at: (step: number) => GeoPoint, steps: number): void {
      if (!context) {
        return;
      }
      let pen = false;
      for (let step = 0; step <= steps; step += 1) {
        const point = project(at(step), centre);
        if (point.z < 0) {
          pen = false;
          continue;
        }
        const x = middle + point.x * radius;
        const y = middle - point.y * radius;
        if (pen) {
          context.lineTo(x, y);
        } else {
          context.moveTo(x, y);
          pen = true;
        }
      }
    }
  };

  const schedule = (): void => {
    if (disposed || frame !== 0) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (animation) {
        const t = Math.min(
          1,
          (performance.now() - animation.startedAt) / FOCUS_DURATION_MS,
        );
        centre = rotateToward(animation.from, animation.to, easeInOut(t));
        if (t >= 1) {
          animation = null;
        } else {
          schedule();
        }
      }
      draw();
    });
  };

  const onPointerDown = (event: PointerEvent): void => {
    animation = null;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    if (pointers.size === 1) {
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      tap = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    } else if (pointers.size === 2) {
      // A second finger turns the drag into a pinch; neither finger taps.
      drag = null;
      tap = null;
      pinch = { startZoom: zoom, startDistance: distanceBetween(pointers) };
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      return;
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pinch) {
      applyZoom(pinchZoom(pinch.startZoom, pinch.startDistance, distanceBetween(pointers)));
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (
      tap
      && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP_PIXELS
    ) {
      tap.moved = true;
    }
    centre = dragRotate(
      centre,
      event.clientX - drag.x,
      event.clientY - drag.y,
      radiusFor(canvas.clientWidth),
    );
    drag.x = event.clientX;
    drag.y = event.clientY;
    schedule();
  };
  const onPointerEnd = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId)) {
      return;
    }
    if (pinch) {
      if (pointers.size >= 2) {
        pinch = { startZoom: zoom, startDistance: distanceBetween(pointers) };
      } else {
        // The finger still down carries on as a drag from where it is.
        pinch = null;
        const [remaining] = pointers;
        drag = remaining
          ? { pointerId: remaining[0], x: remaining[1].x, y: remaining[1].y }
          : null;
      }
    } else if (drag && event.pointerId === drag.pointerId) {
      drag = null;
    }
    if (tap && tap.pointerId === event.pointerId) {
      const ended = tap;
      tap = null;
      if (event.type === "pointerup" && !ended.moved) {
        const now = performance.now();
        if (
          lastTap
          && now - lastTap.at <= DOUBLE_TAP_MS
          && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y)
            <= DOUBLE_TAP_SLOP_PIXELS
        ) {
          lastTap = null;
          applyZoom(1);
        } else {
          lastTap = { at: now, x: event.clientX, y: event.clientY };
        }
      }
    }
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // Firefox reports lines, not pixels, for a mouse wheel.
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    applyZoom(wheelZoom(zoom, pixels));
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const onResize = (): void => schedule();
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  if (observer) {
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", onResize);
  }
  schedule();

  return {
    setFills(next) {
      fills = next;
      schedule();
    },
    focus(point, animate = true) {
      drag = null;
      pinch = null;
      pointers.clear();
      if (!animate || reducedMotion()) {
        animation = null;
        centre = { lat: point.lat, lng: point.lng };
      } else {
        animation = { from: centre, to: point, startedAt: performance.now() };
      }
      schedule();
    },
    zoom() {
      return zoom;
    },
    setZoom(next) {
      applyZoom(next);
    },
    dispose() {
      disposed = true;
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
