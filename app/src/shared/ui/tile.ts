import type { LetterScore } from "../../games/word/engine";

export function createTile(
  letter = "",
  score?: LetterScore,
  size: "game" | "mini" = "game",
): HTMLElement {
  const tile = document.createElement("span");
  tile.className = `letter-tile letter-tile--${size}`;
  if (score) {
    tile.classList.add(`letter-tile--${score}`);
  }
  tile.textContent = letter.toUpperCase();
  return tile;
}
