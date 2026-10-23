import { afterEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => {
  const values = new Map<string, string>();
  const navigateTo = vi.fn(async (_url: string) => ({ ok: true as const }));
  return {
    values,
    navigateTo,
    productId: { current: "dailyondot.paseo" as string | null },
    storage: {
      readString: vi.fn(async (key: string) => values.get(key) ?? ""),
      writeString: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    },
  };
});
vi.mock("@parity/product-sdk-host", () => ({
  getHostLocalStorage: async () => host.storage,
  getPocketManager: async () => null,
  getTruApi: async () => ({
    system: {
      getProductContext: () => ({
        match: (ok: (context: { productId: string }) => string | null, fail: () => null) =>
          host.productId.current ? ok({ productId: host.productId.current }) : fail(),
      }),
    },
  }),
  navigateTo: host.navigateTo,
}));

import { fromCard, productUrls, renderCardLauncher } from "./card-launcher";
import { applyGuess } from "./games/word/session";
import { CARD_STATE_KEY, type CardSummary } from "./shared/card-state";
import { dayIndexFromTimestamp } from "./shared/day";
import { OPEN_INTENT_KEY, parseOpenIntent } from "./shared/open-intent";
import { createWordProgress, saveWordProgress } from "./shared/progress";
import { GAME_ROSTER, gameIdOf } from "./shared/roster";

const today = () => dayIndexFromTimestamp(Date.now() / 1_000);

function seedChecklist(day: number, playedGameIds: number[], summary: CardSummary = {}): void {
  const played = playedGameIds.reduce((bits, id) => bits | (1n << BigInt(id)), 0n);
  host.values.set(
    CARD_STATE_KEY,
    JSON.stringify({ version: 1, day, played: played.toString(), solved: "0", ...summary }),
  );
}

/** An unfinished Word in localStorage: one wrong guess, as a game in progress leaves it. */
function seedWordStarted(day: number): void {
  saveWordProgress(applyGuess(createWordProgress(day), "planet", "garden"));
}

function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = renderCardLauncher(root);
  return { root, dispose };
}

const rows = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>("[data-launcher-game]")];
const stateWords = (root: HTMLElement) =>
  rows(root).map((row) => row.querySelector(".launcher-row__state")?.textContent);
const playLabel = (root: HTMLElement) =>
  root.querySelector("[data-launcher-play]")?.textContent;
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  host.values.clear();
  host.navigateTo.mockClear();
  host.navigateTo.mockImplementation(async () => ({ ok: true as const }));
  host.productId.current = "dailyondot.paseo";
});

describe("fromCard", () => {
  it("is the host's `?card=<card id>` and nothing else", () => {
    expect(fromCard("?card=daily")).toBe(true);
    expect(fromCard("?card=other")).toBe(false);
    expect(fromCard("")).toBe(false);
  });
});

describe("card launcher", () => {
  it("lists every roster game in order with today's ticks from the KV record", async () => {
    const [first, , third] = GAME_ROSTER;
    seedChecklist(today(), [first.gameId, third.gameId]);
    const { root, dispose } = mount();

    expect(rows(root).map((row) => row.dataset.launcherGame)).toEqual(
      GAME_ROSTER.map((game) => game.id),
    );
    expect(rows(root).map((row) => row.textContent?.trim())).toEqual(
      GAME_ROSTER.map((game) => expect.stringContaining(game.short)),
    );
    await vi.waitFor(() => {
      expect(root.querySelector("[data-launcher-count]")?.textContent).toBe(
        `2/${GAME_ROSTER.length} done`,
      );
    });
    const played = rows(root).filter((row) => row.classList.contains("is-played"));
    expect(played.map((row) => row.dataset.launcherGame)).toEqual([first.id, third.id]);
    // The first unplayed game starts selected, and the Play button names it.
    const selected = rows(root).filter((row) => row.classList.contains("is-selected"));
    expect(selected.map((row) => row.dataset.launcherGame)).toEqual([GAME_ROSTER[1].id]);
    expect(root.querySelector("[data-launcher-play]")?.textContent).toBe(
      `Play ${GAME_ROSTER[1].name}`,
    );
    // The Play button fills in the selected game's accent; the title is the product's.
    expect(root.querySelector<HTMLElement>("[data-launcher]")?.dataset.launcherSelected).toBe(GAME_ROSTER[1].id);
    expect(root.querySelector(".launcher__title strong")?.textContent).toBe("Daily on Dot");
    expect(root.querySelector(".game-grid")).toBeNull();
    dispose();
  });

  it("shows yesterday's record as all unplayed", async () => {
    seedChecklist(today() - 1, GAME_ROSTER.map((game) => game.gameId));
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(host.storage.readString).toHaveBeenCalledWith(CARD_STATE_KEY);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector("[data-launcher-count]")?.textContent).toBe(
      `0/${GAME_ROSTER.length} done`,
    );
    expect(rows(root).filter((row) => row.classList.contains("is-played"))).toHaveLength(0);
    expect(rows(root)[0].classList.contains("is-selected")).toBe(true);
    dispose();
  });

  it("does not count a bit outside the roster toward the day's total", async () => {
    // A set bit with no roster entry must not add a tick or a row.
    const [first] = GAME_ROSTER;
    seedChecklist(today(), [first.gameId, GAME_ROSTER.length]);
    const { root, dispose } = mount();

    await vi.waitFor(() => {
      expect(root.querySelector("[data-launcher-count]")?.textContent).toBe(
        `1/${GAME_ROSTER.length} done`,
      );
    });
    expect(rows(root)).toHaveLength(GAME_ROSTER.length);
    const played = rows(root).filter((row) => row.classList.contains("is-played"));
    expect(played.map((row) => row.dataset.launcherGame)).toEqual([first.id]);
    dispose();
  });

  it("a tap on a row only selects it; the half sheet must not jump into a game", async () => {
    const last = GAME_ROSTER.length - 1;
    const { root, dispose } = mount();

    rows(root)[last].click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.navigateTo).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
    const selected = rows(root).filter((row) => row.classList.contains("is-selected"));
    expect(selected.map((row) => row.dataset.launcherGame)).toEqual([GAME_ROSTER[last].id]);
    expect(rows(root)[last].getAttribute("aria-pressed")).toBe("true");
    expect(rows(root)[0].getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector("[data-launcher-play]")?.textContent).toBe(
      `Play ${GAME_ROSTER[last].name}`,
    );
    dispose();
  });

  it("a played game's row offers to open it again, and a tick refresh keeps the user's pick", async () => {
    const [first] = GAME_ROSTER;
    seedChecklist(today(), [first.gameId]);
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(root.querySelector("[data-launcher-count]")?.textContent).toBe(
        `1/${GAME_ROSTER.length} done`,
      );
    });
    rows(root)[0].click();
    expect(root.querySelector("[data-launcher-play]")?.textContent).toBe(`Open ${first.name}`);

    // The sheet comes back on screen: ticks re-read, selection unchanged.
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rows(root)[0].classList.contains("is-selected")).toBe(true);
    dispose();
  });

  it("Play writes the selected game's intent to both stores, then asks the host for the routed product URL", async () => {
    const last = GAME_ROSTER.length - 1;
    const game = GAME_ROSTER[last];
    const { root, dispose } = mount();
    const before = Date.now();

    rows(root)[last].click();
    root.querySelector<HTMLButtonElement>("[data-launcher-play]")!.click();

    await vi.waitFor(() => {
      expect(host.navigateTo).toHaveBeenCalledTimes(1);
    });
    expect(host.navigateTo).toHaveBeenCalledWith(
      `polkadotapp://dailyondot.paseo/${game.route}`,
    );
    const local = parseOpenIntent(window.localStorage.getItem(OPEN_INTENT_KEY));
    expect(local).toMatchObject({ version: 1, route: game.route });
    expect(local!.at).toBeGreaterThanOrEqual(before);
    expect(parseOpenIntent(host.values.get(OPEN_INTENT_KEY))).toEqual(local);
    // The intent landed before the host was asked to navigate.
    expect(host.storage.writeString.mock.invocationCallOrder[0]).toBeLessThan(
      host.navigateTo.mock.invocationCallOrder[0],
    );
    dispose();
  });

  it("tries the product URL forms in order until the host takes one", async () => {
    host.navigateTo.mockImplementation(async (url: string) =>
      url.startsWith("https://dailyondot.paseo/")
        ? { ok: true as const }
        : ({ ok: false, error: { message: `refused ${url}` } } as never),
    );
    const game = GAME_ROSTER[0];
    const { root, dispose } = mount();

    root.querySelector<HTMLButtonElement>("[data-launcher-play]")!.click();

    await vi.waitFor(() => {
      expect(host.navigateTo).toHaveBeenCalledTimes(4);
    });
    expect(host.navigateTo.mock.calls.map(([url]) => url)).toEqual(
      productUrls("dailyondot.paseo", game.route),
    );
    expect(productUrls("dailyondot.paseo", game.route)).toEqual([
      `polkadotapp://dailyondot.paseo/${game.route}`,
      "polkadotapp://dailyondot.paseo",
      "https://dailyondot.paseo",
      "https://dailyondot.paseo/",
    ]);
    dispose();
  });

  it("rows read Done from the KV bit, Resume from local progress, and nothing otherwise", async () => {
    // Word is done on chain and also has local progress: done wins. Sudoku's
    // local progress is yesterday's and does not count. Chess is in progress.
    const day = today();
    seedChecklist(day, [gameIdOf("word")]);
    seedWordStarted(day);
    window.localStorage.setItem(
      `daily-on-dot:sudoku:v1:${day - 1}`,
      JSON.stringify({ version: 1, day: day - 1, started: true, complete: false }),
    );
    window.localStorage.setItem(
      `daily-on-dot:chess:v1:${day}`,
      JSON.stringify({ version: 1, day, started: true, complete: false }),
    );
    const { root, dispose } = mount();

    await vi.waitFor(() => {
      expect(root.querySelector("[data-launcher-count]")?.textContent).toBe(
        `1/${GAME_ROSTER.length} done`,
      );
    });
    expect(stateWords(root)).toEqual(["Done", "Play", "Resume", "Play", "Play", "Play"]);
    expect(rows(root).map((row) => row.dataset.launcherState)).toEqual([
      "done", "fresh", "started", "fresh", "fresh", "fresh",
    ]);
    expect(rows(root).map((row) => row.getAttribute("aria-label"))).toEqual([
      "Daily Word, done",
      "Daily Sudoku",
      "Daily Chess, in progress",
      "Daily Globe",
      "Daily Mini",
      "Daily Connections",
    ]);
    // Every row carries its game's glyph; the done row is the lit one.
    expect(rows(root).every((row) => row.querySelector(".launcher-row__icon svg"))).toBe(true);
    expect(rows(root).filter((row) => row.classList.contains("is-played"))).toHaveLength(1);
    dispose();
  });

  it("the Play button says Play, Resume or Open for the selected row's state", async () => {
    const day = today();
    seedChecklist(day, [gameIdOf("chess")]);
    seedWordStarted(day);
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(root.querySelector("[data-launcher-count]")?.textContent).toBe(
        `1/${GAME_ROSTER.length} done`,
      );
    });

    // The first game not done is Word, in progress: preselected as Resume.
    expect(rows(root)[0].getAttribute("aria-pressed")).toBe("true");
    expect(playLabel(root)).toBe("Resume Daily Word");
    rows(root)[1].click();
    expect(playLabel(root)).toBe("Play Daily Sudoku");
    rows(root)[2].click();
    expect(playLabel(root)).toBe("Open Daily Chess");
    dispose();
  });

  it("shows the streak line only when the record carries streaks, the gem only above zero", async () => {
    const { root, dispose } = mount();
    await settled();
    expect(root.querySelector("[data-launcher-streaks]")).toBeNull();
    dispose();

    seedChecklist(today(), [], { streakAny: 14, streakAll: 0 });
    const gold = mount();
    await vi.waitFor(() => {
      expect(gold.root.querySelector("[data-launcher-streaks]")).not.toBeNull();
    });
    expect(gold.root.querySelector("[data-streak-any]")?.textContent).toBe("14");
    expect(gold.root.querySelector("[data-streak-all]")).toBeNull();
    expect(gold.root.querySelector(".launcher__streak--any svg")?.getAttribute("aria-hidden")).toBe("true");
    gold.dispose();

    seedChecklist(today(), [], { streakAny: 14, streakAll: 3 });
    const both = mount();
    await vi.waitFor(() => {
      expect(both.root.querySelector("[data-streak-all]")?.textContent).toBe("3");
    });
    expect(both.root.querySelector("[data-streak-any]")?.textContent).toBe("14");
    expect(both.root.querySelectorAll("[data-launcher-streaks]")).toHaveLength(1);
    both.dispose();

    // A zero any-game streak is no streak: no line.
    seedChecklist(today(), [], { streakAny: 0, streakAll: 0 });
    const none = mount();
    await settled();
    await settled();
    expect(none.root.querySelector("[data-launcher-streaks]")).toBeNull();
    none.dispose();
  });

  it("yesterday's streaks do not show today", async () => {
    seedChecklist(today() - 1, [], { streakAny: 14, streakAll: 3 });
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(host.storage.readString).toHaveBeenCalledWith(CARD_STATE_KEY);
    });
    await settled();
    expect(root.querySelector("[data-launcher-streaks]")).toBeNull();
    dispose();
  });

  it("the footer opens the product itself, without a route or an intent", async () => {
    const { root, dispose } = mount();

    root.querySelector<HTMLButtonElement>("[data-launcher-open]")!.click();

    await vi.waitFor(() => {
      expect(host.navigateTo).toHaveBeenCalledWith("polkadotapp://dailyondot.paseo");
    });
    expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
    expect(host.values.has(OPEN_INTENT_KEY)).toBe(false);
    dispose();
  });
});
