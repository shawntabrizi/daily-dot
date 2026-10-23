import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyGuess, submitResultOnce } from "../games/word/session";
import { MemoryStorage } from "../test/memory-storage";
import { pickAllGames } from "../test/picks";
import { savePicks } from "./picks";
import type { DataSource } from "./data-source";
import { HostSignerUnavailableError } from "./host-signer";
import { createWordProgress, finishedGamesReader, saveWordProgress } from "./progress";
import {
  GRANTED_BEFORE_KEY,
  SAVE_PROMPTED_KEY,
  SaveDeclinedError,
  submissionAfterError,
  withSaveConsent,
  type SaveRequest,
} from "./save-consent";
import { createSavePromptUi, overlayHeadline } from "./ui/save-prompt";

/**
 * A fresh copy of the gate, as after a page load. The grant lives in module
 * memory, so a test that sets an outcome uses its own copy; the static
 * import above stays a run with no outcome yet.
 */
async function freshRun() {
  vi.resetModules();
  return import("./save-consent");
}

function fakeSource(record: DataSource["record"]): DataSource {
  return {
    currentDay: async () => 10,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async (_from, count) =>
      Array.from({ length: count }, () => ({ played: 0n, solved: 0n, ontime: 0n })),
    record,
  };
}

/** A prompt the test answers by hand; it records what it was asked. */
function scriptedPrompt(answer: "save" | "later") {
  const requests: SaveRequest[] = [];
  const closed = vi.fn();
  return {
    requests,
    closed,
    open(request: SaveRequest) {
      requests.push(request);
      return { choice: Promise.resolve(answer), close: closed };
    },
  };
}

// Every game picked, except where a test picks its own (D21).
beforeEach(() => {
  pickAllGames();
});

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("save consent", () => {
  // Why: a host sign sheet the player did not ask for is the bug this fixes.
  it("never writes before the player taps Save when the device holds no grant", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    let answer: (value: "save" | "later") => void = () => undefined;
    const storage = new MemoryStorage();
    const source = withSaveConsent(fakeSource(record), {
      inHost: async () => true,
      storage,
      open: () => ({
        choice: new Promise((resolve) => {
          answer = resolve;
        }),
        close: () => undefined,
      }),
    });

    const write = source.record(0, 10, 4, true);
    // Why: nothing records while the prompt asks, so no "Recording…" may show behind it.
    expect(document.documentElement.dataset.savePhase).toBe("asking");
    await Promise.resolve();
    await Promise.resolve();
    expect(record).not.toHaveBeenCalled();
    answer("save");
    await write;
    expect(record).toHaveBeenCalledWith(0, 10, 4, true);
    expect(document.documentElement.dataset.savePhase).toBeUndefined();
  });

  // Why: after a grant in this run the host signs silently, so asking again is pure friction.
  it("saves at once with no prompt after a grant in this run", async () => {
    const run = await freshRun();
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const storage = new MemoryStorage();
    run.rememberAutoSignOutcome("Allocated", storage);
    const prompt = scriptedPrompt("later");
    const source = run.withSaveConsent(fakeSource(record), { inHost: async () => true, storage, ...prompt });

    const write = source.record(0, 10, 4, true);
    // The silent write shows "Recording your score…" from the first paint.
    expect(document.documentElement.dataset.savePhase).toBe("saving");
    await write;
    expect(record).toHaveBeenCalledTimes(1);
    expect(prompt.requests).toHaveLength(0);
  });

  // Why: outside a host there is no sheet; the write defers exactly as before.
  it("does not prompt outside a host", async () => {
    const record = vi.fn<DataSource["record"]>(async () => {
      throw new HostSignerUnavailableError("no host");
    });
    const prompt = scriptedPrompt("save");
    const source = withSaveConsent(fakeSource(record), {
      inHost: async () => false,
      storage: new MemoryStorage(),
      ...prompt,
    });
    await expect(source.record(0, 10, 4, true)).rejects.toBeInstanceOf(HostSignerUnavailableError);
    expect(prompt.requests).toHaveLength(0);
  });

  it("asks with the full overlay the first time on a device and the compact sheet after", async () => {
    const storage = new MemoryStorage();
    const prompt = scriptedPrompt("later");
    const source = withSaveConsent(fakeSource(async () => undefined), {
      inHost: async () => true,
      storage,
      ...prompt,
    });
    await expect(source.record(0, 10, 4, true)).rejects.toBeInstanceOf(SaveDeclinedError);
    await expect(source.record(1, 10, 90, true)).rejects.toBeInstanceOf(SaveDeclinedError);
    expect(prompt.requests.map((request) => request.first)).toEqual([true, false]);
    expect(storage.getItem(SAVE_PROMPTED_KEY)).toBe("1");
    expect(prompt.closed).toHaveBeenCalledTimes(2);
  });

  // Why: "save on their own" is false when the host refused AutoSigning in this run; each save shows a sheet.
  it("drops the save-on-their-own promise after a refused grant", async () => {
    const run = await freshRun();
    const storage = new MemoryStorage();
    run.rememberAutoSignOutcome("Rejected", storage);
    const prompt = scriptedPrompt("later");
    const source = run.withSaveConsent(fakeSource(async () => undefined), { inHost: async () => true, storage, ...prompt });
    await expect(source.record(0, 10, 4, true)).rejects.toBeInstanceOf(run.SaveDeclinedError);
    expect(prompt.requests[0]?.ask).toBe("each");

    const ui = createSavePromptUi(document.body);
    const opened = ui.open({ ...prompt.requests[0]!, first: true });
    expect(document.body.textContent).toContain("Your Polkadot app asks you to approve each save.");
    expect(document.body.textContent).not.toContain("on their own");
    opened.close();
  });

  // Why: Android nightly 1042 drops the AutoSigning grant on a Polkadot app
  // restart and the host asks again. A restart is a new page load: the app
  // must prompt first, never write straight into the host's sheet.
  it("prompts again after a restart even though the last run was granted", async () => {
    window.localStorage.clear();
    const first = await freshRun();
    first.rememberAutoSignOutcome("Allocated");
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const prompt = scriptedPrompt("later");
    const afterRestart = await freshRun();
    const source = afterRestart.withSaveConsent(fakeSource(record), { inHost: async () => true, ...prompt });
    await expect(source.record(0, 10, 4, true)).rejects.toBeInstanceOf(afterRestart.SaveDeclinedError);
    expect(record).not.toHaveBeenCalled();
    // The copy warns the host may ask to allow auto-saving again.
    expect(prompt.requests[0]?.ask).toBe("again");
    expect(window.localStorage.getItem(GRANTED_BEFORE_KEY)).toBe("1");
    window.localStorage.clear();
  });

  // Why: devices hold "Allocated" from the old per-device flag; read as a grant
  // it would skip the prompt after a restart.
  it("removes the old stored grant and never reads it", async () => {
    const storage = new MemoryStorage();
    storage.setItem("daily-on-dot:autosign:v1", "Allocated");
    const prompt = scriptedPrompt("later");
    const source = withSaveConsent(fakeSource(async () => undefined), { inHost: async () => true, storage, ...prompt });
    expect(storage.getItem("daily-on-dot:autosign:v1")).toBeNull();
    await expect(source.record(0, 10, 4, true)).rejects.toBeInstanceOf(SaveDeclinedError);
    expect(prompt.requests[0]?.ask).toBe("approve");
  });

  // Why: the overlay headline and squares state the real day, not "first one" on a fifth game.
  it("passes the day's finished games, this one included, in roster order", async () => {
    const prompt = scriptedPrompt("later");
    const source = withSaveConsent(fakeSource(async () => undefined), {
      inHost: async () => true,
      storage: new MemoryStorage(),
      finished: async () => ["globe", "word"],
      ...prompt,
    });
    await expect(source.record(1, 10, 90, true)).rejects.toBeInstanceOf(SaveDeclinedError);
    expect(prompt.requests[0]?.finished).toEqual(["word", "sudoku", "globe"]);
  });

  // Why: Not now must keep the score savable, not mark it failed or lose it.
  it("leaves a declined game pending, with nothing signed", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const storage = new MemoryStorage();
    const source = withSaveConsent(fakeSource(record), {
      inHost: async () => true,
      storage,
      ...scriptedPrompt("later"),
    });
    const progress = applyGuess(createWordProgress(10), "planet", "planet");
    await expect(submitResultOnce(source, progress, storage)).rejects.toBeInstanceOf(SaveDeclinedError);
    expect(progress.submission).toBe("pending");
    expect(record).not.toHaveBeenCalled();
    expect(submissionAfterError(new HostSignerUnavailableError("x"))).toBe("deferred");
    expect(submissionAfterError(new Error("x"))).toBe("failed");
  });
});

describe("finishedGamesReader", () => {
  // Why: the overlay counts games played on chain and games finished on this
  // device but not saved (Not now), and never hangs on a slow read.
  it("joins the chain's played bits with complete games on this device", async () => {
    const storage = new MemoryStorage();
    saveWordProgress(applyGuess(createWordProgress(10), "planet", "planet"), storage);
    const source = fakeSource(async () => undefined);
    source.dayBits = async () => ({ played: 1n << 2n, solved: 0n, ontime: 0n });
    await expect(finishedGamesReader(source, storage)(10)).resolves.toEqual(["word", "chess"]);
    source.dayBits = () => new Promise(() => undefined);
    await expect(finishedGamesReader(source, storage, 10)(10)).resolves.toEqual(["word"]);
  });
});

describe("save prompt", () => {
  it("shows the first-time overlay as a modal dialog with the board's copy, Escape meaning Not now", async () => {
    const ui = createSavePromptUi(document.body);
    const game = { id: "word", short: "Word", gameId: 0 } as SaveRequest["game"];
    const prompt = ui.open({ game, day: 294, first: true, ask: "approve", finished: ["word"] });
    const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.dataset.savePrompt).toBe("overlay");
    expect(dialog.textContent).toContain("First one done!");
    expect(dialog.textContent).toContain("Approve, and the rest of your games save on their own.");
    expect(dialog.textContent).not.toContain("no more pop-ups");
    expect(dialog.textContent).toContain("It only signs Daily on Dot scores. Your main account is not used.");
    expect(document.activeElement?.textContent).toBe("Save my scores");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(prompt.choice).resolves.toBe("later");
    prompt.close();
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("turns Save into the waiting state naming the one score it signs", async () => {
    const ui = createSavePromptUi(document.body);
    const game = { id: "chess", short: "Chess", gameId: 2 } as SaveRequest["game"];
    const prompt = ui.open({ game, day: 293, first: false, ask: "approve", finished: ["chess"] });
    expect(document.querySelector<HTMLElement>("[role=dialog]")!.dataset.savePrompt).toBe("sheet");
    expect(document.body.textContent).toContain("Save this score?");
    document.querySelector<HTMLButtonElement>("[data-save-yes]")!.click();
    await expect(prompt.choice).resolves.toBe("save");
    expect(document.body.textContent).toContain("Approve in your Polkadot app");
    expect(document.body.textContent).toContain("It asks to save one Chess score for Day 293. Nothing else is signed.");
    prompt.close();
  });

  // Why: "First one done!" on the fifth game of the day is false.
  it("counts the day's finished games and lights one square each in its accent", () => {
    expect(overlayHeadline(1, 6)).toBe("First one done!");
    expect(overlayHeadline(5, 6)).toBe("Five done!");
    expect(overlayHeadline(6, 6)).toBe("All six done!");
    expect(overlayHeadline(3, 3)).toBe("All three done!");
    expect(overlayHeadline(2, 2)).toBe("Both done!");
    const ui = createSavePromptUi(document.body);
    const game = { id: "mini", short: "Mini", gameId: 4 } as SaveRequest["game"];
    const prompt = ui.open({ game, day: 294, first: true, ask: "approve", finished: ["word", "sudoku", "chess", "globe", "mini"] });
    const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
    expect(dialog.textContent).toContain("Five done!");
    const lit = [...dialog.querySelectorAll<HTMLElement>(".save-tile--lit")];
    expect(lit).toHaveLength(5);
    expect(lit[0]!.style.getPropertyValue("--tile-accent")).toBe("var(--accent-word)");
    prompt.close();
  });

  it("draws a tile per pick plus any other game finished, and counts the picks", () => {
    savePicks([0, 4, 5]);
    const ui = createSavePromptUi(document.body);
    const game = { id: "globe", short: "Globe", gameId: 3 } as SaveRequest["game"];
    const prompt = ui.open({ game, day: 294, first: true, ask: "approve", finished: ["word", "mini", "globe"] });
    const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
    expect(dialog.querySelectorAll(".save-tile")).toHaveLength(4);
    expect(dialog.querySelectorAll(".save-tile--lit")).toHaveLength(3);
    expect(dialog.textContent).toContain("Two done!");
    prompt.close();
  });

  it("warns after a grant on this device that the Polkadot app may ask again", () => {
    const ui = createSavePromptUi(document.body);
    const game = { id: "word", short: "Word", gameId: 0 } as SaveRequest["game"];
    const prompt = ui.open({ game, day: 294, first: false, ask: "again", finished: ["word"] });
    expect(document.body.textContent).toContain("Your Polkadot app may ask to allow auto-saving again.");
    prompt.close();
  });
});
