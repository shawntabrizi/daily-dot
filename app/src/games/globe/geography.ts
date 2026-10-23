import type { Country } from "./generate";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Direction {
  arrow: string;
  label: string;
  bearing: number;
}

export interface ProximityRamp {
  segment: "far" | "near";
  mix: number;
}

const EARTH_RADIUS_KM = 6_371.0088;
const MAX_GLOBE_DISTANCE_KM = Math.PI * EARTH_RADIUS_KM;
const COMPASS = [
  { arrow: "↑", label: "north" },
  { arrow: "↗", label: "north-east" },
  { arrow: "→", label: "east" },
  { arrow: "↘", label: "south-east" },
  { arrow: "↓", label: "south" },
  { arrow: "↙", label: "south-west" },
  { arrow: "←", label: "west" },
  { arrow: "↖", label: "north-west" },
] as const;

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function haversineDistanceKm(from: GeoPoint, to: GeoPoint): number {
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude)
      * Math.cos(toLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function directionTo(from: GeoPoint, to: GeoPoint): Direction {
  if (from.lat === to.lat && from.lng === to.lng) {
    return { arrow: "✓", label: "the answer", bearing: 0 };
  }

  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude)
      * Math.cos(toLatitude)
      * Math.cos(longitudeDelta);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const compass = COMPASS[Math.round(bearing / 45) % COMPASS.length]!;
  return { ...compass, bearing };
}

export function proximityRamp(distanceKm: number): ProximityRamp {
  const proximity = Math.max(
    0,
    Math.min(1, 1 - distanceKm / MAX_GLOBE_DISTANCE_KM),
  );
  if (proximity >= 0.5) {
    return { segment: "near", mix: (proximity - 0.5) * 200 };
  }
  return { segment: "far", mix: proximity * 200 };
}

export function countryDistanceKm(from: Country, to: Country): number {
  return haversineDistanceKm(from, to);
}
