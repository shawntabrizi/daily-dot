import type { GeoPoint } from "./geography";

/**
 * Orthographic projection on the unit sphere, seen from the point `centre`.
 * `x` is right, `y` is up (not canvas-down), `z` is toward the viewer; the
 * caller scales by the globe radius. Pure math so the renderer stays thin.
 */
export interface Projected {
  x: number;
  y: number;
  z: number;
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

const DEGREES = 180 / Math.PI;
/** Keep the pole off the exact centre so a drag never loses its heading. */
const MAX_CENTRE_LATITUDE = 85;

function radians(degrees: number): number {
  return degrees / DEGREES;
}

export function normaliseLongitude(lng: number): number {
  const wrapped = ((lng + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function project(point: GeoPoint, centre: GeoPoint): Projected {
  const latitude = radians(point.lat);
  const centreLatitude = radians(centre.lat);
  const longitudeDelta = radians(point.lng - centre.lng);
  const cosLatitude = Math.cos(latitude);
  const sinLatitude = Math.sin(latitude);
  const cosDelta = Math.cos(longitudeDelta);
  return {
    x: cosLatitude * Math.sin(longitudeDelta),
    y:
      Math.cos(centreLatitude) * sinLatitude
      - Math.sin(centreLatitude) * cosLatitude * cosDelta,
    z:
      Math.sin(centreLatitude) * sinLatitude
      + Math.cos(centreLatitude) * cosLatitude * cosDelta,
  };
}

/** A point is visible when it is on the near hemisphere (or its rim). */
export function visible(point: GeoPoint, centre: GeoPoint): boolean {
  return project(point, centre).z >= 0;
}

function toVector(point: GeoPoint): Vector3 {
  const latitude = radians(point.lat);
  const longitude = radians(point.lng);
  return {
    x: Math.cos(latitude) * Math.cos(longitude),
    y: Math.cos(latitude) * Math.sin(longitude),
    z: Math.sin(latitude),
  };
}

function toPoint(vector: Vector3): GeoPoint {
  return {
    lat: Math.atan2(vector.z, Math.hypot(vector.x, vector.y)) * DEGREES,
    lng: normaliseLongitude(Math.atan2(vector.y, vector.x) * DEGREES),
  };
}

/**
 * The view centre `t` of the way along the great circle from `from` to `to`
 * (spherical linear interpolation). `t` is clamped to 0..1, so `t >= 1`
 * lands exactly on `to`.
 */
export function rotateToward(
  from: GeoPoint,
  to: GeoPoint,
  t: number,
): GeoPoint {
  if (t <= 0) {
    return { lat: from.lat, lng: from.lng };
  }
  if (t >= 1) {
    return { lat: to.lat, lng: to.lng };
  }
  const start = toVector(from);
  const end = toVector(to);
  const dot = Math.max(
    -1,
    Math.min(1, start.x * end.x + start.y * end.y + start.z * end.z),
  );
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  if (sinOmega < 1e-9) {
    // Coincident (nothing to do) or antipodal (no unique arc): snap.
    return dot > 0 ? { lat: from.lat, lng: from.lng } : { lat: to.lat, lng: to.lng };
  }
  const weightStart = Math.sin((1 - t) * omega) / sinOmega;
  const weightEnd = Math.sin(t * omega) / sinOmega;
  return toPoint({
    x: weightStart * start.x + weightEnd * end.x,
    y: weightStart * start.y + weightEnd * end.y,
    z: weightStart * start.z + weightEnd * end.z,
  });
}

/**
 * Where the view centre lands after the pointer moves `dx`,`dy` canvas
 * pixels over a globe of `radius` pixels. Dragging one radius turns the
 * globe a quarter turn, which feels like pulling the surface.
 */
export function dragRotate(
  centre: GeoPoint,
  dx: number,
  dy: number,
  radius: number,
): GeoPoint {
  const degreesPerPixel = 90 / Math.max(1, radius);
  return {
    lat: Math.max(
      -MAX_CENTRE_LATITUDE,
      Math.min(MAX_CENTRE_LATITUDE, centre.lat + dy * degreesPerPixel),
    ),
    lng: normaliseLongitude(centre.lng - dx * degreesPerPixel),
  };
}

/**
 * Zoom scales the projected radius, so 1 shows the whole disc and 4 shows
 * a quarter of it through the same canvas. The limits keep the globe from
 * shrinking inside its box or blowing up past the point where a drag of one
 * pixel still moves the surface a sensible amount.
 */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** One press of the zoom button: 1×, 2×, 4×. Pinch and wheel are finer. */
export const ZOOM_STEP = 2;
/** Wheel pixels that double the zoom; one mouse notch (100) is about 1.4×. */
const WHEEL_PIXELS_PER_DOUBLING = 200;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return ZOOM_MIN;
  }
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/** The disc radius in canvas pixels for a square canvas of `size` pixels. */
export function globeRadius(size: number, zoom: number): number {
  return (size / 2 - 1.5) * clampZoom(zoom);
}

/**
 * Two fingers that started `startDistance` apart at `startZoom` and are now
 * `distance` apart: the globe scales with the gap, like a photo.
 */
export function pinchZoom(
  startZoom: number,
  startDistance: number,
  distance: number,
): number {
  if (startDistance <= 0) {
    return clampZoom(startZoom);
  }
  return clampZoom(startZoom * (distance / startDistance));
}

/** Wheel down (positive `deltaY`) zooms out, like a map; up zooms in. */
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * 2 ** (-deltaY / WHEEL_PIXELS_PER_DOUBLING));
}
