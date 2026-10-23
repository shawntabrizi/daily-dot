import type { DataSource } from "../../shared/data-source";
import {
  saveWordProgress,
  type WordProgress,
} from "../../shared/progress";
import type { StorageLike } from "../../shared/storage";
import { gameIdOf } from "../../shared/roster";
import { submissionAfterError } from "../../shared/save-consent";
import { isSolved, scoreGuess } from "./engine";

/** The day's score: guesses on the word, lower is better (WP34). */
export function wordScore(progress: WordProgress): number {
  return progress.guesses.length;
}

export function applyGuess(
  progress: WordProgress,
  answer: string,
  guess: string,
): WordProgress {
  if (progress.complete) {
    throw new Error("The word is already solved");
  }

  const scores = scoreGuess(answer, guess);
  const solved = isSolved(scores);
  // No loss state: the word stays open until solved and the score is the
  // guess count (WP34). Solving it completes the day.
  return {
    ...progress,
    guesses: [...progress.guesses, { word: guess.toLowerCase(), scores }],
    complete: solved,
    submission: solved ? "pending" : progress.submission,
  };
}

export async function submitResultOnce(
  source: DataSource,
  progress: WordProgress,
  storage: StorageLike = window.localStorage,
): Promise<void> {
  if (
    !progress.complete
    || (progress.submission !== "pending" && progress.submission !== "deferred")
  ) {
    return;
  }

  progress.submission = "submitting";
  saveWordProgress(progress, storage);

  try {
    // D13/D16 amended (WP34): the score is the guess count; a completed day
    // is always solved because the word has no loss state.
    await source.record(gameIdOf("word"), progress.day, wordScore(progress), true);
    progress.submission = "submitted";
    saveWordProgress(progress, storage);
  } catch (error) {
    progress.submission = submissionAfterError(error);
    saveWordProgress(progress, storage);
    throw error;
  }
}

export function prepareSubmissionRetry(
  progress: WordProgress,
  storage: StorageLike = window.localStorage,
): void {
  if (progress.complete && progress.submission === "failed") {
    progress.submission = "pending";
    saveWordProgress(progress, storage);
  }
}
