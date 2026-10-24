/**
 * The one place Daily Sound touches Web Audio, so the view never does and
 * tests can replace it. The context is made on the first tap (browsers only
 * let audio start from a user gesture) and resumed whenever it is suspended.
 */

/** How long the target plays, and its fades in and out. */
export const TONE_SECONDS = 2;
const FADE_SECONDS = 0.04;

/**
 * Equal loudness: the sound level (dB SPL) a tone needs to sound as loud as
 * 1 kHz at 40 dB (ISO 226:2003, the 40-phon contour). The ear is far less
 * sensitive low down, so one fixed level made 110 Hz near silent and 880 Hz
 * loud. Linear in log-frequency between these points.
 */
const EQUAL_LOUDNESS_40_PHON: readonly (readonly [hz: number, db: number])[] = [
  [100, 64.4], [125, 60.6], [160, 56.7], [200, 53.4], [250, 50.4], [315, 47.6],
  [400, 45.0], [500, 43.1], [630, 41.3], [800, 40.1], [1000, 40.0],
];

/** Gain of the lowest, loudest-needing tone; everything else is scaled down from it. */
export const PEAK_LEVEL = 0.45;
/**
 * How much of the contour to correct. All of it (about 23 dB across
 * 110–880 Hz) would drive small phone speakers into distortion at the low end.
 */
const COMPENSATION = 0.75;

function contourDb(hz: number): number {
  const points = EQUAL_LOUDNESS_40_PHON;
  if (hz <= points[0]![0]) return points[0]![1];
  for (let index = 1; index < points.length; index += 1) {
    const [hzHigh, dbHigh] = points[index]!;
    if (hz <= hzHigh) {
      const [hzLow, dbLow] = points[index - 1]!;
      const t = Math.log(hz / hzLow) / Math.log(hzHigh / hzLow);
      return dbLow + t * (dbHigh - dbLow);
    }
  }
  return points[points.length - 1]![1];
}

/** The gain that makes `hz` sound about as loud as every other tone in 110–880 Hz. */
export function levelFor(hz: number): number {
  // The game's range starts at 110 Hz; never boost past its level.
  const belowLowest = contourDb(Math.max(hz, 110)) - contourDb(110);
  return PEAK_LEVEL * 10 ** ((COMPENSATION * belowLowest) / 20);
}

/**
 * A soft tone: the fundamental with a little of the 2nd and 3rd harmonic.
 * Phone speakers barely reproduce 110 Hz, but the ear hears the pitch from
 * its harmonics; the pitch, and so the scoring, stays the fundamental.
 */
const HARMONICS = [0, 1, 0.3, 0.12];

type AudioContextClass = typeof AudioContext;

let context: AudioContext | null = null;

function contextClass(): AudioContextClass | null {
  if (typeof window === "undefined") {
    return null;
  }
  const scope = window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Whether this browser has Web Audio at all. */
export function audioSupported(): boolean {
  return contextClass() !== null;
}

/**
 * Makes or wakes the context; call it from a tap. True when sound can play;
 * false when the device keeps it suspended (blocked or never allowed).
 */
export async function ensureAudio(): Promise<boolean> {
  const Context = contextClass();
  if (!Context) {
    return false;
  }
  try {
    context ??= new Context();
    if (context.state !== "running") {
      // Some browsers never settle resume() when audio is not allowed.
      await Promise.race([
        context.resume(),
        new Promise((resolve) => window.setTimeout(resolve, 1_500)),
      ]);
    }
    return (context.state as string) === "running";
  } catch {
    return false;
  }
}

function voice(hz: number): { oscillator: OscillatorNode; gain: GainNode; now: number } | null {
  if (!context) {
    return null;
  }
  const oscillator = context.createOscillator();
  oscillator.setPeriodicWave(
    context.createPeriodicWave(new Float32Array(HARMONICS), new Float32Array(HARMONICS.length)),
  );
  oscillator.frequency.value = hz;
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(levelFor(hz), now + FADE_SECONDS);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  return { oscillator, gain, now };
}

/** Plays a sine at `hz` for `seconds` with short fades; resolves when it ends. */
export function playTone(hz: number, seconds = TONE_SECONDS): Promise<void> {
  const played = voice(hz);
  if (!played) {
    return Promise.resolve();
  }
  const { oscillator, gain, now } = played;
  gain.gain.setValueAtTime(levelFor(hz), now + seconds - FADE_SECONDS);
  gain.gain.linearRampToValueAtTime(0, now + seconds);
  oscillator.stop(now + seconds + 0.01);
  return new Promise((resolve) => {
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      resolve();
    };
  });
}

export interface LiveTone {
  /** Glides the held tone to a new pitch. */
  set(hz: number): void;
  /** Fades the tone out and frees it. */
  stop(): void;
}

/** A tone that sounds until stopped, for the drag and the keys. */
export function startTone(hz: number): LiveTone {
  const played = voice(hz);
  if (!played) {
    return { set: () => undefined, stop: () => undefined };
  }
  const { oscillator, gain } = played;
  let stopped = false;
  return {
    set(next) {
      if (!stopped && context) {
        // The level follows the pitch, so a drag stays even in loudness.
        oscillator.frequency.setTargetAtTime(next, context.currentTime, 0.01);
        gain.gain.setTargetAtTime(levelFor(next), context.currentTime, 0.02);
      }
    },
    stop() {
      if (stopped || !context) {
        return;
      }
      stopped = true;
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      oscillator.stop(now + FADE_SECONDS + 0.01);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    },
  };
}
