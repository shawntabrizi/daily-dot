import type { GameSlug } from "../roster";

export interface GlyphOptions {
  /** Line colour; `currentColor` by default so the tile's text colour drives it. */
  stroke?: string;
  /** Colour of the solid parts (dots, pawn); follows `stroke` by default. */
  fill?: string;
}

/**
 * One line glyph per roster game, 24×24, for icon tiles (WP36 decision 1:
 * the icon is the signal before a game is done, the accent only after).
 * `%f` marks the solid parts; everything else is stroked.
 */
const GLYPHS: Record<GameSlug, string> = {
  // Four letter tiles.
  word:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/>'
    + '<rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  // A 3×3 grid.
  sudoku:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  // A knight, the eye cut out.
  chess:
    '<path fill-rule="evenodd" d="M9 3l1 3-3.5 2.2c-.5.3-.7.9-.5 1.4l.4 1.1c.2.6.9.9 1.5.7l2.6-.9L8 16h8.5l1.5-5.5C18.8 6.5 16 3 12 3zM12.3 5.4a.9.9 0 1 0 0 1.8.9.9 0 1 0 0-1.8z" fill="%f" stroke="none"/>'
    + '<path d="M7.5 17h9l1.5 1.5v2H6v-2z" fill="%f" stroke="none"/>',
  // A circle with meridians.
  globe:
    '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.5" ry="8.5"/><path d="M3.5 12h17"/>',
  // A crossword corner with one black square.
  mini:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>'
    + '<rect x="14.8" y="14.8" width="5.7" height="5.7" fill="%f" stroke="none"/>',
  // Four dots.
  connections:
    '<circle cx="7.5" cy="7.5" r="3" fill="%f" stroke="none"/><circle cx="16.5" cy="7.5" r="3" fill="%f" stroke="none"/>'
    + '<circle cx="7.5" cy="16.5" r="3" fill="%f" stroke="none"/><circle cx="16.5" cy="16.5" r="3" fill="%f" stroke="none"/>',
  // A padlock.
  code:
    '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'
    + '<circle cx="12" cy="15.5" r="1.6" fill="%f" stroke="none"/>',
  // Two rays and the arc between them.
  angle:
    '<path d="M4 19.5h16M4 19.5l10-13"/><path d="M10 19.5a6 6 0 0 0-2.4-4.8"/>',
  // Three slider columns, thumbs at different heights.
  color:
    '<path d="M6 4v16M12 4v16M18 4v16"/>'
    + '<circle cx="6" cy="9" r="2.2" fill="%f" stroke="none"/><circle cx="12" cy="15" r="2.2" fill="%f" stroke="none"/>'
    + '<circle cx="18" cy="7" r="2.2" fill="%f" stroke="none"/>',
  // A speaker and two sound waves.
  sound:
    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.3a8 8 0 0 1 0 11.4"/>',
};

export function gameGlyph(id: GameSlug, options: GlyphOptions = {}): string {
  const stroke = options.stroke ?? "currentColor";
  const fill = options.fill ?? stroke;
  const body = GLYPHS[id].replaceAll("%f", fill);
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
