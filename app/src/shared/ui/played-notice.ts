import { countdownText } from "../day";
import type { Game } from "../roster";

/**
 * The friendly line for a day already played elsewhere. Today: "You already
 * played today's Word! Next one in 07:12:33", ticking. A past day: "You
 * already played this Word! Today's is waiting."
 */
export function createPlayedNotice(game: Pick<Game, "short">, day: number, today: number): HTMLElement {
  const notice = document.createElement("span");
  notice.className = "played-notice";
  if (day < today) {
    notice.textContent = `You already played this ${game.short}! Today's is waiting.`;
    return notice;
  }
  const clock = document.createElement("strong");
  clock.className = "played-notice-clock";
  clock.textContent = countdownText();
  notice.append(`You already played today's ${game.short}! Next one in `, clock);
  // Tick while on screen; stop once the view replaces it.
  let seen = false;
  const timer = window.setInterval(() => {
    if (notice.isConnected) {
      seen = true;
      clock.textContent = countdownText();
    } else if (seen) {
      window.clearInterval(timer);
    }
  }, 1_000);
  return notice;
}
