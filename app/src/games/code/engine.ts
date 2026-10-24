/** Daily Code (D22): a four-digit code, digits 0–9, repeats allowed. */
export const CODE_LENGTH = 4;

/** Mastermind pegs: right digit right place, right digit wrong place. */
export interface Pegs {
  exact: number;
  near: number;
}

export function isCode(value: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value);
}

/**
 * Pegs for a guess. `near` counts each answer digit at most once, after the
 * exact matches have taken theirs: guessing 1111 against 1234 is one ●, no ○.
 */
export function scoreCode(guess: string, answer: string): Pegs {
  if (!isCode(guess) || !isCode(answer)) {
    throw new RangeError("Codes are four digits");
  }
  let exact = 0;
  const guessLeft = new Map<string, number>();
  const answerLeft = new Map<string, number>();
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    const g = guess[index]!;
    const a = answer[index]!;
    if (g === a) {
      exact += 1;
    } else {
      guessLeft.set(g, (guessLeft.get(g) ?? 0) + 1);
      answerLeft.set(a, (answerLeft.get(a) ?? 0) + 1);
    }
  }
  let near = 0;
  for (const [digit, count] of guessLeft) {
    near += Math.min(count, answerLeft.get(digit) ?? 0);
  }
  return { exact, near };
}

/** "2 in place, 1 elsewhere": the pegs in words, for assistive tech. */
export function pegsLabel({ exact, near }: Pegs): string {
  if (exact === CODE_LENGTH) {
    return "Cracked";
  }
  if (exact === 0 && near === 0) {
    return "No digit in the code";
  }
  return `${exact} in place, ${near} elsewhere`;
}
