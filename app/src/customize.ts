import type { ViewHandle } from "./home";
import { currentPicks, savePicks } from "./shared/picks";
import { GAME_ROSTER } from "./shared/roster";
import { gameGlyph, HOOKS } from "./shared/ui/game-row";

/**
 * `#/customize`, from the drawer: one checkbox per roster game (D21). A tick
 * saves at once; the last picked game cannot be unticked, so the hub always
 * has a game to ask for.
 */
export function renderCustomize(): ViewHandle {
  const page = document.createElement("section");
  page.className = "page customize-page";
  page.innerHTML = `
    <div class="customize-head">
      <h1>Your games.</h1>
      <p class="customize-lead">Pick the games you play each day. They lead the hub and fill your Pocket card; the rest wait under More games.</p>
    </div>
    <fieldset class="customize-list" data-customize-list>
      <legend class="customize-legend">Daily games</legend>
    </fieldset>
    <p class="customize-note" data-customize-note role="status" aria-live="polite"></p>
  `;
  const list = page.querySelector<HTMLFieldSetElement>("[data-customize-list]")!;
  const note = page.querySelector<HTMLElement>("[data-customize-note]")!;

  const boxes = GAME_ROSTER.map((game) => {
    const row = document.createElement("label");
    row.className = "game-row customize-row";
    row.dataset.gameRow = game.id;
    row.dataset.customizeGame = game.id;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "customize-check";
    box.value = String(game.gameId);
    row.innerHTML = `
      <span class="game-row-tile" aria-hidden="true">${gameGlyph(game)}</span>
      <span class="game-row-text">
        <strong class="game-row-name">${game.short}</strong>
        <span class="game-row-line">${HOOKS[game.id]}</span>
      </span>
    `;
    row.append(box);
    list.append(row);
    return box;
  });

  const paint = (): void => {
    const picks = currentPicks();
    for (const box of boxes) {
      box.checked = picks.includes(Number(box.value));
      // The last pick stays: unticking it would leave the hub nothing to ask for.
      box.disabled = box.checked && picks.length === 1;
      box.closest(".customize-row")?.classList.toggle("is-picked", box.checked);
    }
    note.textContent =
      picks.length === 1 ? "At least one game stays picked." : `${picks.length} games picked.`;
  };

  list.addEventListener("change", () => {
    const picks = boxes.filter((box) => box.checked).map((box) => Number(box.value));
    if (picks.length > 0) {
      savePicks(picks);
    }
    paint();
  });
  paint();

  return { element: page, dispose() {} };
}
