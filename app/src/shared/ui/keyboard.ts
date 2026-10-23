import type { LetterScore } from "../../games/word/engine";

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["enter", "z", "x", "c", "v", "b", "n", "m", "backspace"],
] as const;

export function createKeyboard(
  onKey: (key: string) => void,
  scores: ReadonlyMap<string, LetterScore>,
): HTMLElement {
  const keyboard = document.createElement("div");
  keyboard.className = "keyboard";
  keyboard.setAttribute("aria-label", "On-screen keyboard");

  for (const keys of ROWS) {
    const row = document.createElement("div");
    row.className = `keyboard-row keyboard-row--${keys.length}`;
    for (const key of keys) {
      const button = document.createElement("button");
      button.className = "keyboard-key";
      button.type = "button";
      button.dataset.key = key;
      button.textContent =
        key === "backspace" ? "⌫" : key === "enter" ? "ENTER" : key.toUpperCase();
      if (key === "enter" || key === "backspace") {
        button.classList.add("keyboard-key--wide");
      } else {
        const score = scores.get(key);
        if (score) {
          button.classList.add(`keyboard-key--${score}`);
        }
      }
      button.addEventListener("click", () => onKey(key));
      row.append(button);
    }
    keyboard.append(row);
  }

  return keyboard;
}
