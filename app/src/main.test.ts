import { afterEach, expect, it, vi } from "vitest";

const createChainClient = vi.hoisted(() => vi.fn());
vi.mock("@parity/product-sdk-chain-client", () => ({ createChainClient }));

import { bootApp, renderBootFailure } from "./main";
import { NETWORKS } from "./networks";
import { GenesisMismatchError } from "./shared/genesis";
import { OPEN_INTENT_KEY } from "./shared/open-intent";
import { PICKS_KEY, parsePicks } from "./shared/picks";
import { GAME_ROSTER } from "./shared/roster";

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
  vi.restoreAllMocks();
});

function intent(route: string, at: number): void {
  window.localStorage.setItem(
    OPEN_INTENT_KEY,
    JSON.stringify({ version: 1, route, at }),
  );
}

it("boots the complete stub roster in test mode without opening a chain", () => {
  window.location.hash = "#/";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);

  expect(root.querySelectorAll("[data-game-row]")).toHaveLength(GAME_ROSTER.length);
  // The count is not guessed before the day is read.
  expect(root.querySelector("[data-home-headline]")?.textContent).toBe("Loading…");
  expect(createChainClient).not.toHaveBeenCalled();
  // The hub header: hamburger, "Daily on Dot", the pill; the hamburger opens the drawer.
  expect(root.querySelector(".site-title")?.textContent).toBe("Daily on Dot");
  expect(root.querySelector<HTMLElement>("[data-streak-pill]")?.hidden).toBe(false);
  const drawer = root.querySelector<HTMLElement>(".drawer-shell");
  expect(drawer?.hidden).toBe(true);
  root.querySelector<HTMLButtonElement>('[aria-label="Menu"]')?.click();
  expect(drawer?.hidden).toBe(false);
  // A fresh device: the starter picks, then Customize.
  expect([...root.querySelectorAll(".drawer-nav a")].map((link) => link.getAttribute("href")))
    .toEqual(["#/", "#/history", "#/streaks", "#/card", "#/g/word", "#/g/mini", "#/g/connections", "#/customize"]);
  root.querySelector<HTMLButtonElement>(".drawer-backdrop")?.click();
  expect(drawer?.hidden).toBe(true);
  dispose();
});

it("beneath the Pocket card (?card=daily) renders the launcher, not the hub, and opens no chain", () => {
  window.history.replaceState(null, "", "/?card=daily");
  window.location.hash = "#/";
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);

  // The starter picks, as the card draws them.
  expect(root.querySelectorAll("[data-launcher-game]")).toHaveLength(3);
  expect(root.querySelector("[data-launcher-open]")?.textContent).toBe("Open Daily on Dot");
  expect(root.querySelector("[data-game-row]")).toBeNull();
  expect(root.querySelector("main")).toBeNull();
  expect(createChainClient).not.toHaveBeenCalled();
  dispose();
});

it("follows a fresh open intent from the launcher before the first route resolves", async () => {
  const game = GAME_ROSTER[1];
  window.location.hash = "#/";
  intent(game.route, Date.now() - 30_000);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);

  expect(window.location.hash).toBe(game.route);
  expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
  await vi.waitFor(() => {
    expect(root.querySelector("[data-game-row]")).toBeNull();
    expect(root.querySelector(".site-title")?.textContent).toBe("Sudoku");
    expect(root.querySelector(".header-day")?.textContent).toMatch(/^Day \d+$/);
  });
  // Off the hub: the back circle, no hamburger, no pill.
  expect(root.querySelector<HTMLElement>('[aria-label="Back to today"]')?.hidden).toBe(false);
  expect(root.querySelector<HTMLElement>('[aria-label="Menu"]')?.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>("[data-streak-pill]")?.hidden).toBe(true);
  dispose();
});

it("follows an intent written while the app was hidden, when it becomes visible again", async () => {
  const game = GAME_ROSTER[2];
  window.location.hash = "#/";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  const dispose = bootApp(root);
  expect(window.location.hash).toBe("#/");

  // The launcher taps a game while this instance sits in the background.
  intent(game.route, Date.now() - 1_000);
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));

  expect(window.location.hash).toBe(game.route);
  expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
  dispose();
});

it("ignores a stale open intent and boots the hub", () => {
  window.location.hash = "#/";
  intent(GAME_ROSTER[1].route, Date.now() - 6 * 60_000);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);

  expect(window.location.hash).toBe("#/");
  expect(root.querySelectorAll("[data-game-row]")).toHaveLength(GAME_ROSTER.length);
  expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
  dispose();
});

it("routes #/streaks to the streaks page behind the header pill", async () => {
  window.location.hash = "#/streaks";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);
  expect(root.querySelector("main .streaks-page")).not.toBeNull();
  expect(root.querySelector("[data-streak-pill]")?.getAttribute("href")).toBe("#/streaks");
  expect(root.querySelector("[data-game-row]")).toBeNull();
  await vi.waitFor(() => {
    expect(root.querySelector(".streaks-page .calendar-grid")).not.toBeNull();
  });
  expect(root.querySelector("[data-tile-any] [data-streak-any]")?.textContent).toMatch(/^\d+$/);
  dispose();
});

it("routes #/customize, where a tick picks a game and the hub leads with it", async () => {
  window.location.hash = "#/customize";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);
  expect(root.querySelector(".site-title")?.textContent).toBe("Customize");
  const boxes = [...root.querySelectorAll<HTMLInputElement>(".customize-check")];
  expect(boxes).toHaveLength(GAME_ROSTER.length);
  expect(boxes.filter((box) => box.checked).map((box) => Number(box.value))).toEqual([0, 4, 5]);

  const globe = boxes.find((box) => box.value === "3")!;
  globe.click();
  expect(parsePicks(window.localStorage.getItem(PICKS_KEY))).toEqual([0, 3, 4, 5]);

  window.location.hash = "#/";
  await vi.waitFor(() => {
    expect(
      [...root.querySelectorAll("[data-open-games] [data-game-row]")].map((row) => row.getAttribute("data-game-row")),
    ).toEqual(["word", "globe", "mini", "connections"]);
  });
  dispose();
});

it("routes an archived Daily Sudoku day into the playable screen", async () => {
  window.location.hash = "#/g/sudoku?day=0";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);
  await vi.waitFor(() => {
    expect(root.querySelectorAll(".sudoku-cell")).toHaveLength(81);
  });
  expect(root.querySelector(".site-title")?.textContent).toBe("Sudoku");
  expect(root.querySelector(".header-day")?.textContent).toBe("Day 0");
  expect(root.querySelector(".sudoku-pad")).not.toBeNull();
  dispose();
});

it("routes an archived Daily Chess day into the playable screen", async () => {
  window.location.hash = "#/g/chess?day=0";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);
  await vi.waitFor(() => {
    expect(root.querySelectorAll(".chess-square")).toHaveLength(64);
  });
  expect(root.querySelector(".site-title")?.textContent).toBe("Chess");
  expect(root.querySelector(".header-day")?.textContent).toBe("Day 0");
  expect(root.textContent).not.toContain("Coming soon");
  dispose();
});

it("routes an archived Daily Globe day into the procedural screen", async () => {
  window.location.hash = "#/g/globe?day=0";
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const dispose = bootApp(root);
  await vi.waitFor(() => {
    expect(root.querySelector(".globe-form")).not.toBeNull();
  });
  expect(root.querySelector(".site-title")?.textContent).toBe("Globe");
  expect(root.querySelector(".header-day")?.textContent).toBe("Day 0");
  root.querySelector<HTMLInputElement>("#globe-country-input")?.focus();
  expect(
    root.querySelectorAll("#globe-country-options [role=option]"),
  ).toHaveLength(166);
  dispose();
});

it("renders the read-path genesis mismatch as a blocking error", () => {
  const root = document.createElement("div");
  const mismatch = new GenesisMismatchError(NETWORKS["paseo-next-v2"], {
    name: "Wrong Asset Hub",
    genesisHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  renderBootFailure(
    root,
    mismatch.headline,
    `Network mismatch: ${mismatch.message}.`,
  );

  expect(root.getAttribute("role")).toBeNull();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain(
    "CONNECTION BLOCKED",
  );
  expect(root.textContent).toContain(
    "This version of Daily on Dot is for a different network.",
  );
  expect(root.textContent).toContain(
    "connected to Wrong Asset Hub (genesis 0xaaaaaaaa…)",
  );
  expect(root.textContent).toContain("Reload and try again");
});
