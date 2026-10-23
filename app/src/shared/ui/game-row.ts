import { UNITS } from "../day-summary";
import { formatScore } from "../percentile";
import type { Game, GameSlug } from "../roster";

/**
 * A hub row's state. `loading` is before the day's bits resolve; `open` is
 * not started; `started` is local progress without a finish, with the
 * progress phrase; `unrecorded` is finished on this device and not saved
 * (Not now, or a failed write); `done` has the chain bit, with the score and percentile once the
 * day's reads land.
 */
export type RowState =
  | { kind: "loading" }
  | { kind: "open" }
  | { kind: "started"; progress: string }
  | { kind: "unrecorded" }
  | {
      kind: "done";
      score: number | null;
      percentile: number | null;
      finishers: number | null;
    };

/** The one-line hook under a game's name while it is still to play (the hub board). */
export const HOOKS: Record<GameSlug, string> = {
  word: "Six letters, fewest guesses",
  sudoku: "Fill the grid · about 6 min",
  chess: "Find the move",
  globe: "Name the country",
  mini: "Five by five",
  connections: "Four groups of four",
  code: "Crack the four-digit code",
  angle: "Name the angle",
  color: "Five colours from memory",
};

/** Simple geometric glyphs on a 24-unit grid; the tile colours them. */
const GLYPHS: Record<GameSlug, string> = {
  word:
    '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2" opacity="0.55"/>'
    + '<rect x="3" y="13" width="8" height="8" rx="2" opacity="0.55"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  sudoku:
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18"/>'
    + '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></g>',
  chess:
    '<circle cx="12" cy="6.5" r="3.5"/><path d="M9.5 10.5h5l1.5 6h-8z"/><path d="M6 18.5h12a1.5 1.5 0 0 1 1.5 1.5v1h-15v-1A1.5 1.5 0 0 1 6 18.5z"/>',
  globe:
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/>'
    + '<ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></g>',
  mini:
    '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/>'
    + '<path d="M3 10h18M10 3v18"/></g><rect x="14" y="14" width="7" height="7"/>',
  connections:
    '<circle cx="7.5" cy="7.5" r="3.5"/><circle cx="16.5" cy="7.5" r="3.5"/>'
    + '<circle cx="7.5" cy="16.5" r="3.5"/><circle cx="16.5" cy="16.5" r="3.5"/>',
  code:
    '<rect x="4" y="10" width="16" height="11" rx="2"/>'
    + '<path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  angle:
    '<path d="M3 20h18v2H3z"/><path d="M3.6 21.2l11-14.5 1.6 1.2-11 14.5z"/>'
    + '<path d="M10 20a7 7 0 0 0-2.8-5.6l1.2-1.6A9 9 0 0 1 12 20z" opacity="0.55"/>',
  color:
    '<rect x="4.5" y="3" width="3" height="18" rx="1.5" opacity="0.55"/><rect x="10.5" y="3" width="3" height="18" rx="1.5" opacity="0.55"/>'
    + '<rect x="16.5" y="3" width="3" height="18" rx="1.5" opacity="0.55"/>'
    + '<circle cx="6" cy="9" r="3"/><circle cx="12" cy="15" r="3"/><circle cx="18" cy="7" r="3"/>',
};

export function gameGlyph(game: Game): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">${GLYPHS[game.id]}</svg>`;
}

/** "4 guesses", "1:42"; a Chess puzzle solved in one attempt is "first try" (the board). */
export function scoreText(game: Game, score: number): string {
  if (game.id === "chess" && score === 1) {
    return "first try";
  }
  return formatScore(game.kind, score, UNITS[game.id]);
}

/** "Top 18% of 1,204 today" ("that day" on a past day); empty until the histogram read lands. */
export function percentileText(
  state: Extract<RowState, { kind: "done" }>,
  when = "today",
): string {
  if (state.percentile === null || state.finishers === null) {
    return "";
  }
  return `Top ${state.percentile}% of ${state.finishers.toLocaleString("en-US")} ${when}`;
}

function secondLine(game: Game, state: RowState, pastDay: boolean): string {
  switch (state.kind) {
    case "done":
      return state.score === null ? "Done" : percentileText(state, pastDay ? "that day" : "today");
    case "unrecorded":
      // Today's streak needs the save before the set rolls at 00:00 UTC.
      return pastDay ? "Not saved yet" : "Not saved yet · save by 00:00 UTC";
    case "started":
      return `${HOOKS[game.id]} · ${state.progress}`;
    default:
      return HOOKS[game.id];
  }
}

function actionLabel(state: RowState): string | null {
  switch (state.kind) {
    case "open":
      return "Play";
    case "started":
      return "Resume";
    case "unrecorded":
      return "Save";
    default:
      return null;
  }
}

/**
 * One hub row as the board draws it: the whole row is the link to the game.
 * Not started: neutral tile, hook, Play. In progress: an accent bar on the
 * left, a tinted tile with the accent glyph, "hook · progress", Resume in the
 * accent. Done: the tinted surface with a ring, the accent tile, the score
 * in the accent after the name, the percentile line. A past day's row links
 * into that day's puzzle.
 */
export function createGameRow(
  game: Game,
  state: RowState,
  pastDay: number | null = null,
): HTMLAnchorElement {
  const row = document.createElement("a");
  row.className = "game-row";
  row.href = pastDay === null ? game.route : `${game.route}?day=${pastDay}`;
  row.dataset.gameRow = game.id;
  row.dataset.state = state.kind;
  const action = actionLabel(state);
  const score = state.kind === "done" && state.score !== null
    ? `<span class="game-row-score" data-row-score>· ${scoreText(game, state.score)}</span>`
    : "";
  row.innerHTML = `
    <span class="game-row-tile" aria-hidden="true">${gameGlyph(game)}</span>
    <span class="game-row-text">
      <strong class="game-row-name">${game.short}${score ? ` ${score}` : ""}</strong>
      <span class="game-row-line" data-row-line>${secondLine(game, state, pastDay !== null)}</span>
    </span>
    ${action ? `<span class="game-row-action" data-row-action>${action}</span>` : ""}
  `;
  return row;
}
