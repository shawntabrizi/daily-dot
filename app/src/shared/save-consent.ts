import type { DataSource } from "./data-source";
import { HostSignerUnavailableError } from "./host-signer";
import { GAME_ROSTER, type Game } from "./roster";
import type { StorageLike } from "./storage";

/**
 * The save rule: the app never opens a host sign sheet the player did not ask
 * for. A finished game saves on its own only after the AutoSigning grant came
 * back "Allocated" in this app run; otherwise it asks first. The grant does
 * not survive a Polkadot app restart (Android nightly 1042, 2026-10-23: the
 * host asks again after a restart), and a restart is a new page load, so the
 * outcome lives in memory only. RFC-0010 has no read-only check for it.
 */
let runOutcome: AutoSignOutcome | null = null;

/** Set once the full first prompt has been shown on this device. */
export const SAVE_PROMPTED_KEY = "daily-on-dot:save-prompt:v1";
/** Set once a grant came back Allocated on this device: later prompts warn it may be asked again. */
export const GRANTED_BEFORE_KEY = "daily-on-dot:autosign-granted:v1";
/** The old per-device grant flag; removed on load (a restart drops the grant). */
const LEGACY_AUTOSIGN_KEY = "daily-on-dot:autosign:v1";

export type AutoSignOutcome = "Allocated" | "Rejected" | "NotAvailable" | "Failed";

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string, storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string, storage: StorageLike | null): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // A blocked storage only costs the first-time overlay again.
  }
}

/** This run's AutoSigning outcome; null until the first save asks for it. */
export function autoSignOutcome(): AutoSignOutcome | null {
  return runOutcome;
}

export function rememberAutoSignOutcome(
  outcome: AutoSignOutcome,
  storage: StorageLike | null = defaultStorage(),
): void {
  runOutcome = outcome;
  if (outcome === "Allocated") {
    write(GRANTED_BEFORE_KEY, "1", storage);
  }
}

/** Thrown into a game's submit when the player chose Not now: the score stays local. */
export class SaveDeclinedError extends Error {
  constructor() {
    super("The player chose not to save yet.");
    this.name = "SaveDeclinedError";
  }
}

/** The state a game's submission takes after its record call threw. */
export function submissionAfterError(error: unknown): "pending" | "deferred" | "failed" {
  if (error instanceof SaveDeclinedError) {
    return "pending";
  }
  return error instanceof HostSignerUnavailableError ? "deferred" : "failed";
}

type Submission = "idle" | "pending" | "submitting" | "submitted" | "deferred" | "failed";

/**
 * A finished game shows the result layout once it is saved, and also while
 * it waits on the player (pending after Not now) or on the write (submitting):
 * the same screen, minus what the saved score brings.
 */
export function showsResult(submission: Submission): boolean {
  return submission === "submitted" || submission === "pending" || submission === "submitting";
}

/** What the result's save bar shows: Save (unsaved), the write in flight (saving), or nothing. */
export function pendingSave(submission: Submission): "unsaved" | "saving" | undefined {
  return submission === "pending" ? "unsaved" : submission === "submitting" ? "saving" : undefined;
}

export interface SaveRequest {
  game: Game;
  day: number;
  /** The first prompt on this device: the full overlay; later ones are the compact sheet. */
  first: boolean;
  /**
   * What the Polkadot app will ask: "approve" (the grant), "again" (granted
   * on this device before, so it may ask to allow auto-saving again), or
   * "each" (refused or unavailable in this run: a sheet per save).
   */
  ask: "approve" | "again" | "each";
  /** The day's finished games, this one included, in roster order. */
  finished: readonly Game["id"][];
}

export interface SavePrompt {
  /** "save" switches the prompt to its waiting state until `close`. */
  choice: Promise<"save" | "later">;
  close(): void;
}

/**
 * The save phase on <html data-save-phase>: "asking" while a prompt waits
 * (nothing records, so the result's save bar hides), "saving" while the
 * write runs ("Recording your score…"). The views do not re-render during a
 * record, so save.css reads the phase.
 */
function setSavePhase(phase: "asking" | "saving" | null): void {
  if (typeof document === "undefined") {
    return;
  }
  if (phase) {
    document.documentElement.dataset.savePhase = phase;
  } else {
    delete document.documentElement.dataset.savePhase;
  }
}

export interface SaveConsentDeps {
  /** Outside a host there is no sheet to warn about; the write defers as before. */
  inHost(): Promise<boolean>;
  /** The day's finished games (on chain or on this device); the overlay counts and lights them. */
  finished?(day: number): Promise<readonly Game["id"][]>;
  open(request: SaveRequest): SavePrompt;
  storage?: StorageLike | null;
}

/**
 * Gate `record` behind the save prompt unless the device holds the grant.
 * Every game's submit goes through `record`, so this is the one gate.
 */
export function withSaveConsent(source: DataSource, deps: SaveConsentDeps): DataSource {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  try {
    storage?.removeItem(LEGACY_AUTOSIGN_KEY);
  } catch {
    // Nothing reads it any more.
  }
  const record: DataSource["record"] = async (gameId, day, score, solved) => {
    const outcome = runOutcome;
    const game = GAME_ROSTER.find((entry) => entry.gameId === gameId);
    const silent = outcome === "Allocated" || !game;
    // Set before the first await, so the render that started the save never paints a stale bar.
    setSavePhase(silent ? "saving" : "asking");
    try {
      if (silent || !(await deps.inHost())) {
        setSavePhase("saving");
        return await source.record(gameId, day, score, solved);
      }
      const known = deps.finished ? await deps.finished(day).catch(() => []) : [];
      const finished = GAME_ROSTER.filter(
        (entry) => entry.id === game!.id || known.includes(entry.id),
      ).map((entry) => entry.id);
      const prompt = deps.open({
        game: game!,
        day,
        first: read(SAVE_PROMPTED_KEY, storage) !== "1",
        ask: outcome !== null ? "each" : read(GRANTED_BEFORE_KEY, storage) === "1" ? "again" : "approve",
        finished,
      });
      write(SAVE_PROMPTED_KEY, "1", storage);
      if ((await prompt.choice) === "later") {
        prompt.close();
        throw new SaveDeclinedError();
      }
      setSavePhase("saving");
      try {
        await source.record(gameId, day, score, solved);
      } finally {
        prompt.close();
      }
    } finally {
      setSavePhase(null);
    }
  };
  // A proxy, not a copy: the source may be a class with private fields.
  return new Proxy(source, {
    get(target, property) {
      if (property === "record") {
        return record;
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
