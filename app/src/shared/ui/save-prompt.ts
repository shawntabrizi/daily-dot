import { pickedGames } from "../picks";
import { COUNT_WORDS, GAME_ROSTER } from "../roster";
import type { SavePrompt, SaveRequest } from "../save-consent";

const PHONE =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></svg>';

const ONCE_STEP = "Approve, and the rest of your games save on their own.";
const EACH_SAVE = "Your Polkadot app asks you to approve each save.";
const SHEET_LEDE: Record<SaveRequest["ask"], string> = {
  approve: "Your Polkadot app will ask you to approve.",
  again: "Your Polkadot app may ask to allow auto-saving again.",
  each: EACH_SAVE,
};

/** "First one done!" for the day's first finish, else the count: "Two done!", "All three done!". */
export function overlayHeadline(finished: number, total: number): string {
  if (finished <= 1) {
    return "First one done!";
  }
  if (finished >= total) {
    return total === 2 ? "Both done!" : `All ${COUNT_WORDS[total]!.toLowerCase()} done!`;
  }
  return `${COUNT_WORDS[finished]} done!`;
}

/**
 * The first prompt on a device (Save-Overlay board): the whole screen, the
 * picked games (and any other game finished today) with the finished ones
 * lit, what saving does and what the Polkadot app will ask.
 */
function overlayBody(request: SaveRequest): string {
  const picks = pickedGames();
  const shown = GAME_ROSTER.filter(
    (game) => picks.includes(game) || request.finished.includes(game.id),
  );
  const finishedPicks = picks.filter((game) => request.finished.includes(game.id)).length;
  const tiles = shown.map((game) =>
    request.finished.includes(game.id)
      ? `<span class="save-tile save-tile--lit" style="--tile-accent: var(--accent-${game.id})"></span>`
      : `<span class="save-tile"></span>`,
  ).join("");
  return `
    <div class="save-tiles" aria-hidden="true">${tiles}</div>
    <h2 class="save-title" id="save-title">${overlayHeadline(finishedPicks, picks.length)}<br>Keep your scores?</h2>
    <p class="save-lede">Saved scores build your streak and your calendar, and show how you did against everyone each day.</p>
    <ol class="save-steps">
      <li><span class="save-step-number">1</span><span>Your Polkadot app opens and asks to let Daily on Dot save scores for you.</span></li>
      <li><span class="save-step-number">2</span><span>${request.ask === "each" ? EACH_SAVE : ONCE_STEP}</span></li>
    </ol>
    <p class="save-fine">It only signs Daily on Dot scores. Your main account is not used.</p>
    <button type="button" class="save-primary" data-save-yes>Save my scores</button>
    <button type="button" class="save-later" data-save-later>Not now</button>
  `;
}

/** Every later prompt until the grant: a bottom sheet with the result visible above it. */
function sheetBody(request: SaveRequest): string {
  return `
    <h2 class="save-title save-title--sheet" id="save-title">Save this score?</h2>
    <p class="save-lede">${SHEET_LEDE[request.ask]}</p>
    <button type="button" class="save-primary" data-save-yes>Save</button>
    <button type="button" class="save-later" data-save-later>Not now</button>
  `;
}

/** After Save (Save-Wait board): until the write lands or fails. */
function waitingBody(request: SaveRequest): string {
  return `
    <span class="save-phone">${PHONE}</span>
    <h2 class="save-title save-title--sheet" id="save-title">Approve in your Polkadot app</h2>
    <p class="save-lede">It asks to save one ${request.game.short} score for Day ${request.day}. Nothing else is signed.</p>
    <div class="save-progress" role="progressbar" aria-label="Waiting for approval"><span></span></div>
  `;
}

/** Mount save prompts on `root`; `withSaveConsent` opens one per unsaved finish. */
export function createSavePromptUi(root: HTMLElement): { open(request: SaveRequest): SavePrompt } {
  return {
    open(request) {
      const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const layer = document.createElement("div");
      layer.className = `save-layer save-layer--${request.first ? "overlay" : "sheet"}`;
      const dialog = document.createElement("div");
      dialog.className = "save-dialog";
      dialog.dataset.savePrompt = request.first ? "overlay" : "sheet";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "save-title");
      dialog.style.setProperty("--accent", `var(--accent-${request.game.id})`);
      dialog.style.setProperty("--accent-ink", `var(--accent-${request.game.id}-ink)`);
      dialog.innerHTML = request.first ? overlayBody(request) : sheetBody(request);
      layer.append(dialog);
      root.append(layer);

      let settle: (choice: "save" | "later") => void = () => undefined;
      const choice = new Promise<"save" | "later">((resolve) => {
        settle = resolve;
      });
      let answered = false;
      const answer = (value: "save" | "later"): void => {
        if (answered) return;
        answered = true;
        document.removeEventListener("keydown", onKey);
        if (value === "save") {
          dialog.dataset.savePrompt = "waiting";
          layer.classList.replace("save-layer--overlay", "save-layer--sheet");
          dialog.innerHTML = waitingBody(request);
          dialog.setAttribute("aria-busy", "true");
          dialog.tabIndex = -1;
          dialog.focus();
        }
        settle(value);
      };
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
          event.preventDefault();
          answer("later");
        }
      };
      document.addEventListener("keydown", onKey);
      dialog.querySelector<HTMLButtonElement>("[data-save-yes]")?.addEventListener("click", () => answer("save"));
      dialog.querySelector<HTMLButtonElement>("[data-save-later]")?.addEventListener("click", () => answer("later"));
      dialog.querySelector<HTMLButtonElement>("[data-save-yes]")?.focus();

      return {
        choice,
        close() {
          document.removeEventListener("keydown", onKey);
          layer.remove();
          returnFocus?.focus();
        },
      };
    },
  };
}
