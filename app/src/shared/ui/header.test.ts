import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeader, headerTitle, setHeaderTitle } from "./header";

const SHELL_CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../styles/shell.css"),
  "utf8",
);

describe("header", () => {
  it("on the hub: the hamburger, the centred title and the pill; no archive icon", () => {
    const onMenu = vi.fn();
    const header = createHeader({ onMenu });
    const menu = header.element.querySelector<HTMLButtonElement>('button[aria-label="Menu"]');
    expect(menu?.hidden).toBe(false);
    expect(menu?.classList.contains("header-circle")).toBe(true);
    expect(header.element.querySelector<HTMLElement>('[aria-label="Back to today"]')?.hidden).toBe(true);
    expect(header.element.querySelector(".site-title")?.textContent).toBe("Daily on Dot");
    expect(header.element.querySelector('[aria-label="Archive"]')).toBeNull();
    expect(header.element.querySelector<HTMLElement>("[data-streak-pill]")?.hidden).toBe(false);
    menu?.click();
    expect(onMenu).toHaveBeenCalledTimes(1);
    // The circle is the 44 px target; no hairline, no blur on the header.
    expect(SHELL_CSS).toMatch(/\.header-circle \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(SHELL_CSS).not.toMatch(/\.site-header \{[^}]*(backdrop-filter|border-bottom)/);
  });

  it("on another screen: the back circle to #/, the screen's eyebrow, no pill", () => {
    const header = createHeader();
    header.setLeft("back");
    header.setTitle("Daily Word · Day 294");
    const back = header.element.querySelector<HTMLAnchorElement>('a[aria-label="Back to today"]');
    expect(back?.hidden).toBe(false);
    expect(back?.getAttribute("href")).toBe("#/");
    expect(header.element.querySelector<HTMLElement>('[aria-label="Menu"]')?.hidden).toBe(true);
    const title = header.element.querySelector<HTMLElement>(".site-title");
    expect(title?.textContent).toBe("Daily Word · Day 294");
    expect(title?.dataset.kind).toBe("eyebrow");
    expect(header.element.querySelector<HTMLElement>("[data-streak-pill]")?.hidden).toBe(true);

    // Back to the hub: the title and the pill return.
    header.setLeft("menu");
    header.setTitle(null);
    expect(title?.textContent).toBe("Daily on Dot");
    expect(title?.dataset.kind).toBe("title");
    expect(header.element.querySelector<HTMLElement>("[data-streak-pill]")?.hidden).toBe(false);
  });

  it("a screen sets its eyebrow without a handle", () => {
    const header = createHeader();
    setHeaderTitle("Streaks");
    expect(header.element.querySelector(".site-title")?.textContent).toBe("Streaks");
    expect(headerTitle()).toBe("Streaks");
    setHeaderTitle(null);
    expect(header.element.querySelector(".site-title")?.textContent).toBe("Daily on Dot");
    expect(headerTitle()).toBeNull();
  });

  it("links the pill to the streaks route: gold flame and count, the blue gem count only above 0", () => {
    const header = createHeader();
    const pill = header.element.querySelector<HTMLAnchorElement>("[data-streak-pill]");
    expect(pill?.getAttribute("href")).toBe("#/streaks");
    // A 36 px pill inside a 44 px target, gold tint, blue inset ring.
    expect(SHELL_CSS).toMatch(/\.streak-pill \{[^}]*height: 44px;/);
    expect(SHELL_CSS).toMatch(
      /\.streak-pill-body \{[^}]*height: 36px;[^}]*background: var\(--streak-gold-tint\);[^}]*box-shadow: inset 0 0 0 2px var\(--streak-blue\);/,
    );

    header.setStreaks({ any: 14, all: 3 });
    expect(pill?.querySelector("[data-streak-any]")?.textContent).toBe("14");
    expect(pill?.querySelector("[data-streak-all]")?.textContent).toBe("3");
    expect(pill?.querySelector(".streak-pill-all")?.textContent).toBe("◆3");
    expect(pill?.querySelector<HTMLElement>(".streak-pill-all")?.hidden).toBe(false);

    header.setStreaks({ any: 2, all: 0 });
    expect(pill?.querySelector("[data-streak-any]")?.textContent).toBe("2");
    expect(pill?.querySelector<HTMLElement>(".streak-pill-all")?.hidden).toBe(true);
  });
});

describe("header on a past day's game (Archive board)", () => {
  const word = { id: "word", short: "Word", route: "#/g/word" } as const;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z")); // day 294
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("switches to the same game a day earlier or later; the day after yesterday is today's game", () => {
    const header = createHeader();
    header.setGame(word, 293);
    const step = (kind: string) =>
      header.element.querySelector<HTMLAnchorElement>(`[data-day-step="${kind}"]`);
    expect(step("back")?.getAttribute("href")).toBe("#/g/word?day=292");
    expect(step("forward")?.getAttribute("href")).toBe("#/g/word");
    expect(header.element.querySelector(".header-day")?.textContent).toBe("Day 293");
    // Today's game has the plain pill: there is no later day to step to.
    header.setGame(word, 294);
    expect(step("back")).toBeNull();
    expect(header.element.querySelector(".header-day")?.textContent).toBe("Day 294");
  });

  it("goes back to the day's hub, and a new route resets back to today", () => {
    const header = createHeader();
    header.setLeft("back");
    header.setBack("#/day?day=293", "Back to Day 293");
    const back = header.element.querySelector<HTMLAnchorElement>("a.header-circle")!;
    expect(back.getAttribute("href")).toBe("#/day?day=293");
    header.setLeft("back");
    expect(back.getAttribute("href")).toBe("#/");
    expect(back.getAttribute("aria-label")).toBe("Back to today");
  });
});
