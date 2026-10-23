/** Gold bulb for the rule line (WP36 decision 9). */
const BULB =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';

/**
 * The one-line rule at the bottom of a game page: a bulb plus the text.
 * Starts hidden; the game shows it once the board is up and hides it again
 * on the resolved state.
 */
export function createGameRule(text: string): HTMLElement {
  const rule = document.createElement("footer");
  rule.className = "game-rule";
  rule.hidden = true;
  const bulb = document.createElement("span");
  bulb.className = "game-rule-bulb";
  bulb.innerHTML = BULB;
  const line = document.createElement("span");
  line.textContent = text;
  rule.append(bulb, line);
  return rule;
}
