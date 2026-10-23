export type LetterScore = "correct" | "present" | "absent";

/** Daily Word is one 6-letter word a day (D16). */
export const WORD_LENGTH = 6;
/** Rows the grid always shows. The word has no cap: a row is added per guess past six (WP34). */
export const WORD_GRID_ROWS = 6;

export function scoreGuess(answer: string, guess: string): LetterScore[] {
  const normalizedAnswer = answer.toLowerCase();
  const normalizedGuess = guess.toLowerCase();

  if (
    normalizedAnswer.length !== normalizedGuess.length ||
    !/^[a-z0-9+\-*/=]+$/.test(normalizedAnswer) ||
    !/^[a-z0-9+\-*/=]+$/.test(normalizedGuess)
  ) {
    throw new RangeError(
      "Answer and guess must be same-length supported character sequences",
    );
  }

  const scores: LetterScore[] = Array.from(
    { length: normalizedAnswer.length },
    () => "absent",
  );
  const remaining = new Map<string, number>();

  for (let index = 0; index < normalizedAnswer.length; index += 1) {
    const answerLetter = normalizedAnswer[index];
    const guessLetter = normalizedGuess[index];
    if (!answerLetter || !guessLetter) {
      continue;
    }

    if (answerLetter === guessLetter) {
      scores[index] = "correct";
    } else {
      remaining.set(answerLetter, (remaining.get(answerLetter) ?? 0) + 1);
    }
  }

  for (let index = 0; index < normalizedGuess.length; index += 1) {
    if (scores[index] === "correct") {
      continue;
    }

    const letter = normalizedGuess[index];
    if (!letter) {
      continue;
    }
    const available = remaining.get(letter) ?? 0;
    if (available > 0) {
      scores[index] = "present";
      remaining.set(letter, available - 1);
    }
  }

  return scores;
}

export function isSolved(scores: readonly LetterScore[]): boolean {
  return scores.length > 0 && scores.every((score) => score === "correct");
}
