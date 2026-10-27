import { afterEach, describe, expect, it } from "vitest";

import { hintFor, HEAT_BANDS } from "../../games/angle/engine";
import { GAME_ROSTER, gameById } from "../roster";
import { createHeader, setHeaderGame } from "./header";
import { openRules, RULES } from "./rules";

afterEach(() => {
  document.body.replaceChildren();
});

const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");

describe("rules", () => {
  it("has short rules for every game: a few steps, each one line, and how it scores", () => {
    for (const game of GAME_ROSTER) {
      const rules = RULES[game.id];
      expect(rules.steps.length).toBeGreaterThanOrEqual(2);
      expect(rules.steps.length).toBeLessThanOrEqual(3);
      for (const step of rules.steps) {
        expect(step.visual).not.toBe("");
        expect(step.text.length).toBeLessThanOrEqual(90);
      }
      expect(rules.score).toMatch(/better/);
    }
    // The direction matches the game (D13).
    expect(RULES.color.score).toMatch(/More is better/);
    expect(RULES.word.score).toMatch(/Fewer/);
  });

  it("states Angle's heat bands as the game applies them", () => {
    // Why: the rules quote the degrees; they must move when the hint logic does.
    const bands = RULES.angle.steps.map((step) => step.text).join(" ");
    for (const [heat, limit] of Object.entries(HEAT_BANDS)) {
      expect(bands).toContain(`within ${limit}°`);
      expect(hintFor(100 + limit, 100).heat).toBe(heat);
      expect(hintFor(101 + limit, 100).heat).not.toBe(heat);
    }
  });

  it("opens from the (?) in a game's header and closes back to it", () => {
    const header = createHeader();
    document.body.append(header.element);
    const help = header.element.querySelector<HTMLButtonElement>("[data-header-help]")!;
    expect(help.hidden).toBe(true);

    setHeaderGame(gameById("code")!, 300);
    expect(help.hidden).toBe(false);
    expect(help.getAttribute("aria-label")).toBe("How to play Daily Code");
    help.focus();
    help.click();
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    expect(dialog()?.textContent).toContain("Crack the four-digit code");
    expect(document.activeElement?.textContent).toBe("Got it");

    document.querySelector<HTMLButtonElement>(".rules-ok")!.click();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(help);

    // Off a game screen the (?) goes away.
    header.setTitle("Streaks");
    expect(help.hidden).toBe(true);
  });

  it("closes on Escape, the close button and the backdrop, and keeps keys from the game", () => {
    const keys: string[] = [];
    const onKey = (event: KeyboardEvent): void => {
      keys.push(event.key);
    };
    window.addEventListener("keydown", onKey);

    openRules(gameById("word")!);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(keys).toEqual([]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialog()).toBeNull();

    openRules(gameById("word")!);
    document.querySelector<HTMLButtonElement>(".rules-close")!.click();
    expect(dialog()).toBeNull();

    openRules(gameById("word")!);
    document.querySelector<HTMLElement>(".rules-overlay")!.click();
    expect(dialog()).toBeNull();

    // Once closed, the game hears keys again.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(keys).toEqual(["a"]);
    window.removeEventListener("keydown", onKey);
  });
});
