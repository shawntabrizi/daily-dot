/**
 * Daily Color (D24): five colours from memory, each scored by how close the
 * rebuilt colour is to the shown one in CIEDE2000.
 */
export const ROUNDS = 5;
/** A round's best score, in tenths of a point (10.0 points). */
export const ROUND_MAX_TENTHS = 100;
/** A ΔE00 at or beyond this scores nothing. */
export const ZERO_AT_DELTA_E = 40;

export const HUE_MAX = 359;
export const PERCENT_MAX = 100;

/** Hue in whole degrees 0–359; saturation and brightness in whole percent 0–100 (HSB/HSV). */
export interface Hsb {
  hue: number;
  saturation: number;
  brightness: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export function isHsb(value: unknown): value is Hsb {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { hue, saturation, brightness } = value as Partial<Hsb>;
  const whole = (n: unknown, max: number): boolean =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
  return whole(hue, HUE_MAX) && whole(saturation, PERCENT_MAX) && whole(brightness, PERCENT_MAX);
}

/** HSB to sRGB channels 0–255, unrounded: the score measures the colour itself, not its 8-bit display. */
export function hsbToRgb({ hue, saturation, brightness }: Hsb): [number, number, number] {
  const value = (brightness / 100) * 255;
  const chroma = value * (saturation / 100);
  const low = value - chroma;
  const sector = (hue % 360) / 60;
  const rise = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1 ? [chroma, rise, 0]
    : sector < 2 ? [rise, chroma, 0]
    : sector < 3 ? [0, chroma, rise]
    : sector < 4 ? [0, rise, chroma]
    : sector < 5 ? [rise, 0, chroma]
    : [chroma, 0, rise];
  return [r + low, g + low, b + low];
}

/** The colour as CSS, rounded to 8 bits a channel. */
export function hsbCss(colour: Hsb): string {
  const [r, g, b] = hsbToRgb(colour).map((channel) => Math.round(channel));
  return `rgb(${r}, ${g}, ${b})`;
}

/** The D65 reference white. */
const WHITE_X = 0.95047;
const WHITE_Z = 1.08883;

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

/** sRGB (0–255 a channel) to CIELAB under D65. */
export function srgbToLab([red, green, blue]: readonly [number, number, number]): Lab {
  const r = linear(red);
  const g = linear(green);
  const b = linear(blue);
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const fx = labF(x / WHITE_X);
  const fy = labF(y);
  const fz = labF(z / WHITE_Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const DEG = Math.PI / 180;

function hueAngle(b: number, a: number): number {
  if (a === 0 && b === 0) {
    return 0;
  }
  const h = Math.atan2(b, a) / DEG;
  return h < 0 ? h + 360 : h;
}

/**
 * CIEDE2000 colour difference (kL = kC = kH = 1), after Sharma, Wu and Dalal
 * (2005), with their rules for the hue mean and difference across 0°/360°
 * and for a neutral (zero-chroma) colour.
 */
export function ciede2000(first: Lab, second: Lab): number {
  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const meanC7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(meanC7 / (meanC7 + 25 ** 7)));
  const a1 = (1 + g) * first.a;
  const a2 = (1 + g) * second.a;
  const cp1 = Math.hypot(a1, first.b);
  const cp2 = Math.hypot(a2, second.b);
  const hp1 = hueAngle(first.b, a1);
  const hp2 = hueAngle(second.b, a2);
  const chromatic = cp1 * cp2 !== 0;

  const dL = second.L - first.L;
  const dC = cp2 - cp1;
  let dh = 0;
  if (chromatic) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * DEG);

  const meanL = (first.L + second.L) / 2;
  const meanCp = (cp1 + cp2) / 2;
  let meanH = hp1 + hp2;
  if (chromatic) {
    if (Math.abs(hp1 - hp2) <= 180) meanH /= 2;
    else meanH = meanH < 360 ? (meanH + 360) / 2 : (meanH - 360) / 2;
  }

  const t =
    1
    - 0.17 * Math.cos((meanH - 30) * DEG)
    + 0.24 * Math.cos(2 * meanH * DEG)
    + 0.32 * Math.cos((3 * meanH + 6) * DEG)
    - 0.2 * Math.cos((4 * meanH - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((meanH - 275) / 25) ** 2));
  const meanCp7 = meanCp ** 7;
  const rc = 2 * Math.sqrt(meanCp7 / (meanCp7 + 25 ** 7));
  const l50 = (meanL - 50) ** 2;
  const sl = 1 + (0.015 * l50) / Math.sqrt(20 + l50);
  const sc = 1 + 0.045 * meanCp;
  const sh = 1 + 0.015 * meanCp * t;
  const rt = -Math.sin(2 * dTheta * DEG) * rc;

  return Math.sqrt(
    (dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh),
  );
}

/** A colour's score in tenths of a point: 10 × max(0, 1 − ΔE00 / 40), to the nearest tenth. */
export function scoreForDelta(deltaE: number): number {
  if (!Number.isFinite(deltaE) || deltaE < 0) {
    throw new RangeError("ΔE00 is a non-negative distance");
  }
  return Math.round(ROUND_MAX_TENTHS * Math.max(0, 1 - deltaE / ZERO_AT_DELTA_E));
}

/** ΔE00 between two HSB colours, through sRGB and CIELAB D65. */
export function colourDelta(target: Hsb, guess: Hsb): number {
  return ciede2000(srgbToLab(hsbToRgb(target)), srgbToLab(hsbToRgb(guess)));
}

/** One colour's score in tenths (0–100). */
export function roundScore(target: Hsb, guess: Hsb): number {
  if (!isHsb(target) || !isHsb(guess)) {
    throw new RangeError("Colours are whole hue 0–359, saturation and brightness 0–100");
  }
  return scoreForDelta(colourDelta(target, guess));
}

/** The day's score in tenths (0–500): the sum of the colours' rounded scores. */
export function totalScore(targets: readonly Hsb[], guesses: readonly Hsb[]): number {
  return guesses.reduce((sum, guess, index) => sum + roundScore(targets[index]!, guess), 0);
}

/** Dark or light type on the colour, whichever reads: by CIELAB lightness. */
export function inkFor(colour: Hsb): "dark" | "light" {
  return srgbToLab(hsbToRgb(colour)).L > 62 ? "dark" : "light";
}
