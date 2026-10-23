import { describe, expect, it } from "vitest";

import { GLOBE_COUNTRIES } from "./generate";
import {
  clampZoom,
  dragRotate,
  globeRadius,
  normaliseLongitude,
  pinchZoom,
  project,
  rotateToward,
  visible,
  wheelZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "./projection";

const london = { lat: 51.5, lng: -0.1 };
const sydney = { lat: -33.9, lng: 151.2 };

describe("orthographic projection", () => {
  it("puts the view centre in the middle of the disc, facing the viewer", () => {
    const projected = project(london, london);
    expect(projected.x).toBeCloseTo(0, 9);
    expect(projected.y).toBeCloseTo(0, 9);
    expect(projected.z).toBeCloseTo(1, 9);
  });

  it("hides a point on the far side of the globe", () => {
    expect(visible(sydney, london)).toBe(false);
    expect(visible(london, london)).toBe(true);
    expect(visible({ lat: 0, lng: 90 }, { lat: 0, lng: 0 })).toBe(true);
    expect(visible({ lat: 0, lng: 90.5 }, { lat: 0, lng: 0 })).toBe(false);
  });

  it("maps east to the right and north to the top", () => {
    const east = project({ lat: 0, lng: 30 }, { lat: 0, lng: 0 });
    const north = project({ lat: 30, lng: 0 }, { lat: 0, lng: 0 });
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeCloseTo(0, 9);
    expect(north.y).toBeGreaterThan(0);
    expect(north.x).toBeCloseTo(0, 9);
  });
});

describe("rotateToward", () => {
  it("ends exactly on the target so a guess is centred after the turn", () => {
    expect(rotateToward(london, sydney, 1)).toEqual(sydney);
    expect(rotateToward(london, sydney, 0)).toEqual(london);
  });

  it("stays on the great circle: the midpoint is equidistant from both ends", () => {
    const midpoint = rotateToward(london, sydney, 0.5);
    const toStart = Math.acos(project(london, midpoint).z);
    const toEnd = Math.acos(project(sydney, midpoint).z);
    expect(toStart).toBeCloseTo(toEnd, 9);
    expect(toStart).toBeGreaterThan(0.5);
  });

  it.each(GLOBE_COUNTRIES.filter((_, index) => index % 11 === 0))(
    "centres every sampled country ($name) within rounding",
    (country) => {
      const centred = rotateToward({ lat: 20, lng: 0 }, country, 1);
      const projected = project(country, centred);
      expect(projected.x).toBeCloseTo(0, 9);
      expect(projected.y).toBeCloseTo(0, 9);
    },
  );
});

describe("dragRotate", () => {
  it("drags the surface with the pointer and clamps the pole", () => {
    const turned = dragRotate({ lat: 0, lng: 0 }, 100, 0, 100);
    expect(turned.lng).toBeCloseTo(-90, 9);
    expect(dragRotate({ lat: 80, lng: 0 }, 0, 500, 100).lat).toBe(85);
    expect(dragRotate({ lat: 0, lng: 179 }, -10, 0, 100).lng).toBeCloseTo(-172, 9);
  });

  it("normalises longitudes into -180..180", () => {
    expect(normaliseLongitude(190)).toBe(-170);
    expect(normaliseLongitude(-190)).toBe(170);
    expect(normaliseLongitude(180)).toBe(-180);
  });
});

describe("zoom", () => {
  it("scales the disc radius by the zoom factor", () => {
    expect(globeRadius(320, 1)).toBe(158.5);
    expect(globeRadius(320, 2)).toBe(2 * globeRadius(320, 1));
    expect(globeRadius(320, 4)).toBe(4 * globeRadius(320, 1));
  });

  it("clamps between 1× (the whole disc) and 4×", () => {
    expect(ZOOM_MIN).toBe(1);
    expect(ZOOM_MAX).toBe(4);
    expect(clampZoom(0.5)).toBe(1);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(globeRadius(320, 0.1)).toBe(globeRadius(320, 1));
    expect(globeRadius(320, 10)).toBe(globeRadius(320, 4));
  });

  it("reaches the limit in two button presses from 1×, with no clamped dud press", () => {
    expect(ZOOM_STEP ** 2).toBe(ZOOM_MAX);
    expect(clampZoom(ZOOM_STEP)).toBe(ZOOM_STEP);
  });

  it("pinches like a photo: the globe scales with the finger gap", () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(2, 100, 150)).toBe(3);
    expect(pinchZoom(2, 200, 100)).toBe(1);
    expect(pinchZoom(1, 100, 50)).toBe(1);
    expect(pinchZoom(3, 100, 400)).toBe(4);
    expect(pinchZoom(2, 0, 100)).toBe(2);
  });

  it("zooms out on wheel down and in on wheel up, like a map", () => {
    expect(wheelZoom(2, 100)).toBeLessThan(2);
    expect(wheelZoom(2, -100)).toBeGreaterThan(2);
    expect(wheelZoom(2, -200)).toBeCloseTo(4, 9);
    expect(wheelZoom(1, 100)).toBe(1);
    expect(wheelZoom(4, -100)).toBe(4);
  });
});
