import type { DataSource } from "../../shared/data-source";
import { submissionAfterError } from "../../shared/save-consent";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import {
  GLOBE_COUNTRIES,
  type Country,
} from "./generate";

const GLOBE_PROGRESS_PREFIX = "daily-on-dot:globe:v1:";

export type GlobeSubmissionState =
  "idle" | "pending" | "submitting" | "submitted" | "deferred" | "failed";

export interface GlobeProgress {
  version: 1;
  day: number;
  answerIso: string;
  guesses: string[];
  complete: boolean;
  submission: GlobeSubmissionState;
}

export type GlobeGuessResult =
  | { accepted: true; country: Country; progress: GlobeProgress }
  | { accepted: false; progress: GlobeProgress; message: string };

const COUNTRY_BY_ISO = new Map(
  GLOBE_COUNTRIES.map((country) => [country.iso, country]),
);
const COUNTRY_BY_NAME = new Map(
  GLOBE_COUNTRIES.map((country) => [country.name.toLowerCase(), country]),
);
const COUNTRIES_BY_NAME = [...GLOBE_COUNTRIES].sort((a, b) =>
  a.name.localeCompare(b.name, "en"),
);

function progressKey(day: number): string {
  return `${GLOBE_PROGRESS_PREFIX}${day}`;
}

function isSubmissionState(value: unknown): value is GlobeSubmissionState {
  return (
    value === "idle"
    || value === "pending"
    || value === "submitting"
    || value === "submitted"
    || value === "deferred"
    || value === "failed"
  );
}

function isProgress(
  value: unknown,
  day: number,
  answer: Country,
): value is GlobeProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<GlobeProgress>;
  if (
    candidate.version !== 1
    || candidate.day !== day
    || candidate.answerIso !== answer.iso
    || !Array.isArray(candidate.guesses)
    || !candidate.guesses.every(
      (identity) =>
        typeof identity === "string" && COUNTRY_BY_ISO.has(identity),
    )
    || typeof candidate.complete !== "boolean"
    || !isSubmissionState(candidate.submission)
  ) {
    return false;
  }

  const firstSolvedIndex = candidate.guesses.indexOf(answer.iso);
  if (
    firstSolvedIndex >= 0
    && firstSolvedIndex !== candidate.guesses.length - 1
  ) {
    return false;
  }
  const complete =
    firstSolvedIndex >= 0
    && firstSolvedIndex === candidate.guesses.length - 1;
  return (
    candidate.complete === complete
    && (complete
      ? candidate.submission !== "idle"
      : candidate.submission === "idle")
  );
}

export function countryByIso(identity: string): Country | undefined {
  return COUNTRY_BY_ISO.get(identity);
}

export function countryFromGuess(value: string): Country | undefined {
  return COUNTRY_BY_NAME.get(value.trim().toLowerCase());
}

// The picker's list: every country for an empty query, otherwise names that
// start with it ahead of names that only contain it ("Korea" finds both Koreas).
export function matchCountries(query: string): readonly Country[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return COUNTRIES_BY_NAME;
  }
  const starts: Country[] = [];
  const contains: Country[] = [];
  for (const country of COUNTRIES_BY_NAME) {
    const name = country.name.toLowerCase();
    if (name.startsWith(needle)) {
      starts.push(country);
    } else if (name.includes(needle)) {
      contains.push(country);
    }
  }
  return [...starts, ...contains];
}

export function createGlobeProgress(
  day: number,
  answer: Country,
): GlobeProgress {
  if (!Number.isSafeInteger(day) || day < 0) {
    throw new RangeError("Day must be a non-negative safe integer");
  }
  if (COUNTRY_BY_ISO.get(answer.iso)?.name !== answer.name) {
    throw new TypeError("Globe answer must come from the bundled country list");
  }
  return {
    version: 1,
    day,
    answerIso: answer.iso,
    guesses: [],
    complete: false,
    submission: "idle",
  };
}

export function loadGlobeProgress(
  day: number,
  answer: Country,
  storage: StorageLike = window.localStorage,
): GlobeProgress {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return createGlobeProgress(day, answer);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed, day, answer)) {
      return createGlobeProgress(day, answer);
    }
    if (parsed.submission === "submitting") {
      parsed.submission = "failed";
    }
    return parsed;
  } catch {
    return createGlobeProgress(day, answer);
  }
}

export function saveGlobeProgress(
  progress: GlobeProgress,
  storage: StorageLike = window.localStorage,
): void {
  storage.setItem(progressKey(progress.day), JSON.stringify(progress));
}

export function hasStartedGlobe(
  day: number,
  storage: StorageLike = window.localStorage,
): boolean {
  const raw = storage.getItem(progressKey(day));
  if (!raw) {
    return false;
  }
  try {
    const stored = JSON.parse(raw) as Partial<GlobeProgress>;
    return (
      stored.version === 1
      && stored.day === day
      && Array.isArray(stored.guesses)
      && stored.guesses.length > 0
      && stored.complete === false
    );
  } catch {
    return false;
  }
}

export function applyGlobeGuess(
  progress: GlobeProgress,
  value: string,
): GlobeGuessResult {
  if (progress.complete) {
    throw new Error("This Globe is already complete");
  }

  const country = countryFromGuess(value);
  if (!country) {
    return {
      accepted: false,
      progress,
      message: "Choose a country from the list.",
    };
  }
  // A repeat tells the player nothing new, so it must not cost a guess.
  if (progress.guesses.includes(country.iso)) {
    return {
      accepted: false,
      progress,
      message: `You already guessed ${country.name}.`,
    };
  }

  const guesses = [...progress.guesses, country.iso];
  const complete = country.iso === progress.answerIso;
  return {
    accepted: true,
    country,
    progress: {
      ...progress,
      guesses,
      complete,
      submission: complete ? "pending" : "idle",
    },
  };
}

export async function submitGlobeOnce(
  source: DataSource,
  progress: GlobeProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending"
      && progress.submission !== "deferred")
  ) {
    return;
  }

  progress.submission = "submitting";
  saveGlobeProgress(progress, storage);
  try {
    await source.record(gameIdOf("globe"), progress.day, progress.guesses.length, true);
    progress.submission = "submitted";
    saveGlobeProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveGlobeProgress(progress, storage);
    throw error;
  }
}

export function prepareGlobeSubmissionRetry(
  progress: GlobeProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveGlobeProgress(progress, storage);
  }
}
