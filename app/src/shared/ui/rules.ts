import type { Game, GameSlug } from "../roster";
import { icon } from "./icons";

/**
 * How to play, per game: two or three steps, each a small picture and one
 * short line, then how the day is scored. Behind the (?) in a game's header;
 * it opens over the board and closes back to it, so a game in play never
 * loses its place.
 */
interface RuleStep {
  /** A small picture: game-styled marks or an emoji, never the day's answer. */
  visual: string;
  text: string;
}

interface GameRules {
  steps: readonly RuleStep[];
  score: string;
}

const tile = (letter: string, kind: "correct" | "present" | "absent" | "empty"): string =>
  `<span class="rules-tile rules-tile--${kind}">${letter}</span>`;
const emoji = (char: string): string => `<span class="rules-emoji" aria-hidden="true">${char}</span>`;
const peg = (kind: "exact" | "near"): string => `<i class="rules-peg rules-peg--${kind}"></i>`;
const swatch = (colour: string): string => `<span class="rules-swatch" style="background:${colour}"></span>`;

export const RULES: Record<GameSlug, GameRules> = {
  word: {
    steps: [
      { visual: tile("", "empty") + tile("", "empty") + tile("", "empty"), text: "Guess the six-letter word. Take as many tries as you need." },
      { visual: tile("P", "correct") + tile("L", "present") + tile("A", "absent"), text: "Green is the right spot, yellow is in the word, grey is not in it." },
    ],
    score: "Fewer guesses is better.",
  },
  sudoku: {
    steps: [
      { visual: emoji("🔢"), text: "Fill every row, column and box with 1 to 9." },
      { visual: emoji("👆"), text: "Tap a square, then a number." },
    ],
    score: "Faster is better.",
  },
  chess: {
    steps: [
      { visual: emoji("♟️"), text: "Find the best move for your side." },
      { visual: emoji("↩️"), text: "The other side replies. Keep going until the puzzle is solved." },
    ],
    score: "Fewer attempts is better.",
  },
  globe: {
    steps: [
      { visual: emoji("🌍"), text: "Guess any country." },
      { visual: emoji("🧭"), text: "Each guess shows how far away the answer is, and which way." },
    ],
    score: "Fewer guesses is better.",
  },
  mini: {
    steps: [
      { visual: emoji("✏️"), text: "Fill the five-by-five crossword from the clues." },
      { visual: emoji("🔁"), text: "Tap a square to type. Tap it again to switch across and down." },
    ],
    score: "Faster is better.",
  },
  connections: {
    steps: [
      { visual: emoji("🧩"), text: "Find four groups of four words that belong together." },
      { visual: emoji("✅"), text: "Pick four, then Submit. A wrong group counts as a mistake; you keep playing." },
    ],
    score: "Fewer mistakes is better.",
  },
  code: {
    steps: [
      { visual: tile("4", "empty") + tile("0", "empty") + tile("7", "empty"), text: "Crack the four-digit code. Digits can repeat." },
      { visual: peg("exact") + peg("near"), text: "● a right digit in the right place. ○ a right digit in the wrong place." },
    ],
    score: "Fewer guesses is better.",
  },
  angle: {
    steps: [
      { visual: emoji("📐"), text: "Guess the marked angle, from 1° to 359°." },
      { visual: emoji("🔥") + emoji("⬆️"), text: "So close, Hot, Warm or Cold tells you how near; the arrow says higher or lower." },
    ],
    score: "Fewer guesses is better.",
  },
  color: {
    steps: [
      { visual: swatch("#c94fd8"), text: "A colour shows for 5 seconds. Remember it." },
      { visual: swatch("linear-gradient(#e33,#fd3,#3d6,#3be,#a3e)") + swatch("linear-gradient(#999,#a3e)") + swatch("linear-gradient(#000,#a3e)"), text: "Rebuild it with hue, saturation and brightness." },
      { visual: emoji("🎨"), text: "Five colours a day." },
    ],
    score: "Up to 10 points a colour. More is better.",
  },
  sound: {
    steps: [
      { visual: emoji("🔊"), text: "Tap Listen to hear a tone, once." },
      { visual: emoji("👆"), text: "Hold and drag up or down to find it again, then Submit." },
      { visual: emoji("🎵"), text: "Five tones a day. Sound on!" },
    ],
    score: "Up to 10 points a tone. More is better.",
  },
};

let openDialog: { close: () => void } | null = null;

/**
 * Opens the rules over the page. Escape, the backdrop, the close button and
 * "Got it" all close it, and focus goes back to whatever opened it.
 */
export function openRules(game: Pick<Game, "id" | "name">): () => void {
  openDialog?.close();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const rules = RULES[game.id];

  const overlay = document.createElement("div");
  overlay.className = "rules-overlay";
  overlay.dataset.rules = game.id;
  const dialog = document.createElement("section");
  dialog.className = "rules-dialog";
  dialog.dataset.game = game.id;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "rules-title");
  dialog.innerHTML = `
    <header class="rules-head">
      <h2 id="rules-title">How to play</h2>
      <button type="button" class="rules-close" data-rules-close aria-label="Close">${icon("close")}</button>
    </header>
    <p class="rules-game">${game.name}</p>
    <ol class="rules-steps">
      ${rules.steps.map((step) => `<li class="rules-step"><span class="rules-visual" aria-hidden="true">${step.visual}</span><span>${step.text}</span></li>`).join("")}
    </ol>
    <p class="rules-score"><span aria-hidden="true">🏆</span> ${rules.score}</p>
    <button type="button" class="rules-ok" data-rules-close>Got it</button>
  `;
  overlay.append(dialog);

  const close = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
    if (openDialog?.close === close) {
      openDialog = null;
    }
    opener?.focus();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      // Keep focus inside the dialog: its two buttons are the only stops.
      const stops = [...dialog.querySelectorAll<HTMLElement>("button")];
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    // A game listens for keys on window; while the rules are open they are not for it.
    event.stopPropagation();
  };
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || (event.target as Element).closest("[data-rules-close]")) {
      close();
    }
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  dialog.querySelector<HTMLButtonElement>(".rules-ok")!.focus();
  openDialog = { close };
  return close;
}
