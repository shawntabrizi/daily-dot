import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { PICKS_KEY, serializePicks } from "./shared/picks";
import { pickSixGames } from "./test/picks";
import { createWordProgress, saveWordProgress } from "./shared/progress";
import { GAME_ROSTER, gameIdOf } from "./shared/roster";

/** The picks these tests run with: the six original games. */
const PICKED = GAME_ROSTER.slice(0, 6);

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
const playedIds = (root: HTMLElement) =>
  rows(root).filter((row) => row.classList.contains("is-played")).map((row) => row.dataset.launcherGame);
const rowFor = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLButtonElement>(`[data-launcher-game="${id}"]`)!;
const stateWords = (root: HTMLElement) =>
  rows(root).map((row) => row.querySelector(".launcher-row__state")?.textContent);
const playLabel = (root: HTMLElement) =>
  root.querySelector("[data-launcher-play]")?.textContent;
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

// The six original games picked, in the host's copy and this device's
// mirror, except where a test sets its own (D21).
beforeEach(() => {
  host.values.set(PICKS_KEY, serializePicks([0, 1, 2, 3, 4, 5]));
  pickSixGames();
});

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
  it("lists only the picks the card draws, from the host's copy, and counts them alone", async () => {
    host.values.set(PICKS_KEY, serializePicks([0, 4, 5]));
    // Globe (3) is done but not picked: no row, no count.
    seedChecklist(today(), [0, 3]);
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(playedIds(root)).toEqual(["word"]);
    });
    // Done games go last.
    expect(rows(root).map((row) => row.dataset.launcherGame)).toEqual(["mini", "connections", "word"]);
    expect(playLabel(root)).toBe("Play Daily Mini");
    dispose();
  });

  it("falls back to this device's picks, then to the starter set", async () => {
    host.values.delete(PICKS_KEY);
    window.localStorage.clear();
    window.localStorage.setItem(PICKS_KEY, serializePicks([2]));
    const local = mount();
    await settled();
    expect(rows(local.root).map((row) => row.dataset.launcherGame)).toEqual(["chess"]);
    local.dispose();

    window.localStorage.removeItem(PICKS_KEY);
    const fresh = mount();
    await settled();
    expect(rows(fresh.root).map((row) => row.dataset.launcherGame)).toEqual(["word", "mini", "connections", "code"]);
    fresh.dispose();
  });


  it("lists every roster game in order with today's ticks from the KV record", async () => {
    const [first, , third] = PICKED;
    seedChecklist(today(), [first.gameId, third.gameId]);
    const { root, dispose } = mount();

    expect(rows(root).map((row) => row.dataset.launcherGame)).toEqual(
      PICKED.map((game) => game.id),
    );
    expect(rows(root).map((row) => row.textContent?.trim())).toEqual(
      PICKED.map((game) => expect.stringContaining(game.short)),
    );
    await vi.waitFor(() => {
      expect(playedIds(root)).toEqual([first.id, third.id]);
    });
    // Why: the sheet is an action list, so it leads with what is left to play
    // and the done games step back to the end.
    expect(rows(root).map((row) => row.dataset.launcherGame)).toEqual([
      ...PICKED.filter((game) => game !== first && game !== third).map((game) => game.id),
      first.id,
      third.id,
    ]);
    // The first unplayed game starts selected, and the Play button names it.
    const selected = rows(root).filter((row) => row.classList.contains("is-selected"));
    expect(selected.map((row) => row.dataset.launcherGame)).toEqual([PICKED[1].id]);
    expect(root.querySelector("[data-launcher-play]")?.textContent).toBe(
      `Play ${PICKED[1].name}`,
    );
    // The Play button fills in the selected game's accent.
    expect(root.querySelector<HTMLElement>("[data-launcher]")?.dataset.launcherSelected).toBe(PICKED[1].id);
    expect(root.querySelector(".game-grid")).toBeNull();
    dispose();
  });

  it("shows yesterday's record as all unplayed", async () => {
    seedChecklist(today() - 1, PICKED.map((game) => game.gameId));
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(host.storage.readString).toHaveBeenCalledWith(CARD_STATE_KEY);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rows(root).filter((row) => row.classList.contains("is-played"))).toHaveLength(0);
    expect(rows(root)[0].classList.contains("is-selected")).toBe(true);
    dispose();
  });

  it("does not count a bit outside the roster toward the day's total", async () => {
    // A set bit with no roster entry must not add a tick or a row.
    const [first] = PICKED;
    seedChecklist(today(), [first.gameId, PICKED.length]);
    const { root, dispose } = mount();

    await vi.waitFor(() => {
      expect(playedIds(root)).toEqual([first.id]);
    });
    expect(rows(root)).toHaveLength(PICKED.length);
    dispose();
  });

  it("a tap on a row only selects it; the half sheet must not jump into a game", async () => {
    const last = PICKED.length - 1;
    const { root, dispose } = mount();

    rows(root)[last].click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.navigateTo).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
    const selected = rows(root).filter((row) => row.classList.contains("is-selected"));
    expect(selected.map((row) => row.dataset.launcherGame)).toEqual([PICKED[last].id]);
    expect(rows(root)[last].getAttribute("aria-pressed")).toBe("true");
    expect(rows(root)[0].getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector("[data-launcher-play]")?.textContent).toBe(
      `Play ${PICKED[last].name}`,
    );
    dispose();
  });

  it("a played game's row offers to open it again, and a tick refresh keeps the user's pick", async () => {
    const [first] = PICKED;
    seedChecklist(today(), [first.gameId]);
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(playedIds(root)).toEqual([first.id]);
    });
    rowFor(root, first.id).click();
    expect(root.querySelector("[data-launcher-play]")?.textContent).toBe(`Open ${first.name}`);

    // The sheet comes back on screen: ticks re-read, selection unchanged.
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rowFor(root, first.id).classList.contains("is-selected")).toBe(true);
    dispose();
  });

  it("Play writes the selected game's intent to both stores, then asks the host for the routed product URL", async () => {
    const last = PICKED.length - 1;
    const game = PICKED[last];
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
    const game = PICKED[0];
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
      expect(playedIds(root)).toEqual(["word"]);
    });
    expect(stateWords(root)).toEqual(["Play", "Resume", "Play", "Play", "Play", "Done"]);
    expect(rows(root).map((row) => row.dataset.launcherState)).toEqual([
      "fresh", "started", "fresh", "fresh", "fresh", "done",
    ]);
    expect(rows(root).map((row) => row.getAttribute("aria-label"))).toEqual([
      "Daily Sudoku",
      "Daily Chess, in progress",
      "Daily Globe",
      "Daily Mini",
      "Daily Connections",
      "Daily Word, done",
    ]);
    // Every row carries its game's glyph; the done row is the muted one.
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
      expect(playedIds(root)).toEqual(["chess"]);
    });

    // The first game not done is Word, in progress: preselected as Resume.
    expect(rowFor(root, "word").getAttribute("aria-pressed")).toBe("true");
    expect(playLabel(root)).toBe("Resume Daily Word");
    rowFor(root, "sudoku").click();
    expect(playLabel(root)).toBe("Play Daily Sudoku");
    rowFor(root, "chess").click();
    expect(playLabel(root)).toBe("Open Daily Chess");
    dispose();
  });

  it("has no head: the card right above already shows the count and the streak", async () => {
    // Why: the sheet opens under the card, which shows n/k and the streak;
    // saying them again only pushes the games down.
    seedChecklist(today(), [PICKED[0].gameId], { streakAny: 14 });
    const { root, dispose } = mount();
    await vi.waitFor(() => {
      expect(playedIds(root)).toEqual([PICKED[0].id]);
    });
    expect(root.querySelector(".launcher__head")).toBeNull();
    expect(root.textContent).not.toContain("done");
    expect(root.textContent).not.toContain("14");
    dispose();
  });

  it("the footer opens the hub by its route, since the host ignores a bare product URL here", async () => {
    const { root, dispose } = mount();

    root.querySelector<HTMLButtonElement>("[data-launcher-open]")!.click();

    // Why: on Android the bare URL returns ok and opens nothing; only a routed
    // URL brings the full app up, so the routed form must be asked first.
    await vi.waitFor(() => {
      expect(host.navigateTo).toHaveBeenCalled();
    });
    expect(host.navigateTo.mock.calls[0]![0]).toBe("polkadotapp://dailyondot.paseo/#/");
    // The intent takes a warm full app off whatever game it showed, to the hub.
    expect(JSON.parse(window.localStorage.getItem(OPEN_INTENT_KEY)!).route).toBe("#/");
    dispose();
  });
});
