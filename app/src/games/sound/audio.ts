/**
 * The one place Daily Sound touches Web Audio, so the view never does and
 * tests can replace it. The context is made on the first tap (browsers only
 * let audio start from a user gesture) and resumed whenever it is suspended.
 */

/** How long the target plays, and its fades in and out. */
export const TONE_SECONDS = 2;
const FADE_SECONDS = 0.04;
const LEVEL = 0.25;

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
  oscillator.type = "sine";
  oscillator.frequency.value = hz;
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(LEVEL, now + FADE_SECONDS);
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
  gain.gain.setValueAtTime(LEVEL, now + seconds - FADE_SECONDS);
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
        oscillator.frequency.setTargetAtTime(next, context.currentTime, 0.01);
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
