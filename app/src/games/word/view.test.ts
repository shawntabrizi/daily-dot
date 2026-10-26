import { afterEach, describe, expect, it, vi } from "vitest";
import { headerTitle } from "../../shared/ui/header";
import type { DataSource } from "../../shared/data-source";
import { HostSignerUnavailableError } from "../../shared/host-signer";
import {
  createWordProgress,
  loadWordProgress,
  saveWordProgress,
} from "../../shared/progress";
import { applyGuess } from "./session";
import { keyboardScores, renderWord } from "./view";

const ANSWER = "planet";

afterEach(() => {
  window.localStorage.clear();
});

function sourceWith(record: DataSource["record"] = async () => undefined): DataSource {
  return {
    currentDay: async () => 10,
    wordAnswer: async () => ANSWER,
    dayBits: async () => ({ played: 0n, solved: 0n, ontime: 0n }),
    dayBitsRange: async () => [],
    record,
    // Nine other finishers today: three in 1 guess, six in 3.
    histogram: async () => ({ total: 10, buckets: [{ bucket: 0, count: 4 }, { bucket: 2, count: 6 }] }),
  };
}

function typeWord(word: string): void {
  for (const key of [...word, "Enter"]) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  }
}

function tilesPerRow(element: HTMLElement): number[] {
  return [...element.querySelectorAll(".guess-row")].map(
    (row) => row.querySelectorAll(".letter-tile").length,
  );
}

describe("Word view", () => {
  it("keeps correct above present on the keyboard", () => {
    const progress = createWordProgress(10);
    progress.guesses.push(
      {
        word: "across",
        scores: ["correct", "absent", "absent", "absent", "absent", "absent"],
      },
      {
        word: "banana",
        scores: ["absent", "present", "absent", "absent", "absent", "absent"],
      },
    );

    expect(keyboardScores(progress).get("a")).toBe("correct");
  });

  it("names a past day's word by its day, not as today's", async () => {
    // Why: archive mode opens old puzzles; "TODAY'S WORD" there misleads.
    const view = renderWord({ ...sourceWith(), currentDay: async () => 12 }, 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("DAY 10 WORD");
    });
    expect(view.element.textContent).not.toContain("TODAY'S WORD");
    view.dispose();
    view.element.remove();
  });

  it("opens on the 6-letter word with six rows and a keyboard", async () => {
    const view = renderWord(sourceWith(), 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelectorAll(".guess-row")).toHaveLength(6);
    });

    expect(tilesPerRow(view.element)).toEqual([6, 6, 6, 6, 6, 6]);
    expect(view.element.textContent).toContain("TODAY'S WORD");
    expect(view.element.textContent).toContain("6 LETTERS");
    expect(headerTitle()).toBe("Word · Day 10");
    expect(view.element.querySelector(".keyboard")).not.toBeNull();
    expect(view.element.querySelector(".game-rule:not([hidden])")).not.toBeNull();
    view.dispose();
    view.element.remove();
  });

  it("refuses a word outside the list but takes the answer, then records once and shows the distribution", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderWord(sourceWith(record), 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".keyboard")).not.toBeNull();
    });

    typeWord("qzzzzz");
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Not in the word list.");
    });
    expect(view.element.querySelectorAll(".letter-tile--absent")).toHaveLength(0);

    for (let index = 0; index < ANSWER.length; index += 1) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    }
    typeWord(ANSWER);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(0, 10, 1, true);
    const winningRow = view.element.querySelector(".guess-row");
    expect(winningRow?.textContent).toBe("PLANET");
    expect(winningRow?.querySelectorAll(".letter-tile--correct")).toHaveLength(6);
    expect(view.element.textContent).toContain("PLANET in 1 guess");
    // The day's distribution replaces the keyboard: top 10% (rank 1 of 10,
    // ties in the player's favor), the player marked on 1 guess.
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("10%");
    });
    expect(view.element.querySelector("[data-distribution-total]")?.textContent).toBe("10 finished today");
    expect(view.element.querySelector(".keyboard")).toBeNull();
    expect(view.element.querySelector("[data-result-subline]")?.textContent).toBe(
      "1 guess · the word was PLANET",
    );
    // The result takes the page: the game's own heading leaves.
    expect(view.element.querySelector(".game-heading")?.hasAttribute("hidden")).toBe(true);
    expect(view.element.querySelector(".distribution-tick--player")?.textContent).toBe("1");

    // A solved day takes no more input and never writes again.
    typeWord("garden");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    // The Result board draws only the played rows: one guess, one row.
    expect(view.element.querySelectorAll(".guess-row")).toHaveLength(1);
    expect(record).toHaveBeenCalledTimes(1);
    const stored = loadWordProgress(10);
    expect(stored.complete).toBe(true);
    expect(stored.submission).toBe("submitted");
    expect(stored.guesses).toHaveLength(1);
    view.dispose();
    view.element.remove();
  });

  it("grows the grid past six rows with no loss state and records the guess count", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderWord(sourceWith(record), 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".keyboard")).not.toBeNull();
    });

    for (let guess = 0; guess < 7; guess += 1) {
      typeWord("garden");
      await vi.waitFor(() => {
        expect(view.element.querySelectorAll(".letter-tile--absent").length)
          .toBeGreaterThanOrEqual(guess + 1);
      });
    }
    // Seven misses: still playing, an eighth row waits for the draft.
    expect(view.element.querySelectorAll(".guess-row")).toHaveLength(8);
    expect(view.element.querySelector(".guess-grid--scroll")).not.toBeNull();
    expect(view.element.textContent).toContain("7 guesses so far");
    expect(view.element.textContent).not.toContain("The word was");
    expect(record).not.toHaveBeenCalled();

    typeWord(ANSWER);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(view.element.textContent).toContain("PLANET in 8 guesses");
    expect(view.element.querySelectorAll(".guess-row")).toHaveLength(8);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(0, 10, 8, true);
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("100%");
    });
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-distribution-total]")?.textContent).toBe("11 finished today");
    });
    view.dispose();
    view.element.remove();
  });

  it("labels a day recorded after it ended as played later", async () => {
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const source: DataSource = { ...sourceWith(record), currentDay: async () => 12 };
    const view = renderWord(source, 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".keyboard")).not.toBeNull();
    });
    typeWord(ANSWER);
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("9%");
    });
    expect(view.element.querySelector("[data-result-rank-tile] .result-tile-label")?.textContent).toBe("on the day");
    expect(view.element.querySelector("[data-result-subline]")?.textContent).toBe(
      "1 guess · the word was PLANET",
    );
    expect(record).toHaveBeenCalledWith(0, 10, 1, true);
    view.dispose();
    view.element.remove();
  });

  it("resumes an unfinished word after reload", async () => {
    saveWordProgress(applyGuess(createWordProgress(10), ANSWER, "garden"));

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderWord(sourceWith(record), 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".guess-row")?.textContent).toBe("GARDEN");
    });
    expect(view.element.textContent).toContain("1 guess so far");
    expect(view.element.querySelector(".keyboard")).not.toBeNull();
    expect(view.element.querySelector("[data-result-panel]")).toBeNull();
    expect(view.element.querySelector(".game-heading")?.hasAttribute("hidden")).toBe(false);
    expect(record).not.toHaveBeenCalled();
    view.dispose();
    view.element.remove();
  });

  it("fetches one word and opens a recorded day read-only", async () => {
    const wordAnswer = vi.fn(async () => ANSWER);
    const source: DataSource = {
      currentDay: async () => 10,
      wordAnswer,
      dayBits: async () => ({ played: 1n, solved: 1n, ontime: 1n }),
      dayBitsRange: async () => [],
      record: async () => {
        throw new Error("record must not be called");
      },
    };

    const view = renderWord(source, 10);
    document.body.append(view.element);
    // Today's day, played elsewhere: the friendly line with the countdown.
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("You already played today's Word! Next one in");
    });

    expect(wordAnswer).toHaveBeenCalledTimes(1);
    expect(tilesPerRow(view.element)).toEqual([6, 6, 6, 6, 6, 6]);
    expect(view.element.querySelector(".keyboard")).toBeNull();
    expect(view.element.querySelector(".game-rule:not([hidden])")).toBeNull();

    typeWord(ANSWER);
    expect(view.element.querySelector(".guess-row")?.textContent).toBe("");
    view.dispose();
    view.element.remove();
  });

  it("rejects word data that is not one six-letter word", async () => {
    const source: DataSource = { ...sourceWith(), wordAnswer: async () => "plane" };
    const view = renderWord(source, 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("The word data is invalid.");
    });
    view.dispose();
    view.element.remove();
  });

  it("retries a failed word read in place", async () => {
    const currentDay = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("endpoint dropped"))
      .mockResolvedValue(10);
    const source: DataSource = { ...sourceWith(), currentDay };

    const view = renderWord(source, 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Word unavailable");
    });

    view.element.querySelector<HTMLButtonElement>(".game-error button")?.click();
    await vi.waitFor(() => {
      expect(view.element.querySelector(".keyboard")).not.toBeNull();
    });
    expect(currentDay).toHaveBeenCalledTimes(2);
    view.dispose();
    view.element.remove();
  });

  it("keeps a completed word after write failure and records on retry", async () => {
    saveWordProgress(applyGuess(createWordProgress(10), ANSWER, ANSWER));

    const record = vi
      .fn<DataSource["record"]>()
      .mockRejectedValueOnce(new Error("wallet disconnected"))
      .mockResolvedValue(undefined);

    const view = renderWord(sourceWith(record), 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain(
        "PLANET in 1 guess · Recording failed.",
      );
    });
    expect(loadWordProgress(10).submission).toBe("failed");

    view.element
      .querySelector<HTMLButtonElement>("[data-submission-retry]")
      ?.click();
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });
    expect(loadWordProgress(10).submission).toBe("submitted");
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenLastCalledWith(0, 10, 1, true);
    view.dispose();
    view.element.remove();
  });

  it("keeps a hostless completion and explains where it will be recorded", async () => {
    saveWordProgress(applyGuess(createWordProgress(10), ANSWER, ANSWER));

    const record = vi.fn<DataSource["record"]>(async () => {
      throw new HostSignerUnavailableError("not running in a host");
    });

    const view = renderWord(sourceWith(record), 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain(
        "PLANET in 1 guess · Record it in the Polkadot app.",
      );
    });

    expect(view.element.textContent).not.toContain("Score recorded.");
    expect(loadWordProgress(10).submission).toBe("deferred");
    expect(record).toHaveBeenCalledOnce();
    view.dispose();
    view.element.remove();
  });

  it("records one deferred completion when reopened with a host signer", async () => {
    const progress = applyGuess(createWordProgress(10), ANSWER, ANSWER);
    progress.submission = "deferred";
    saveWordProgress(progress);

    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderWord(sourceWith(record), 10);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });

    expect(loadWordProgress(10).submission).toBe("submitted");
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(0, 10, 1, true);
    view.dispose();
    view.element.remove();
  });

  it("carries data-game, names the game on <html>, and ends with the rule line", async () => {
    const view = renderWord(sourceWith(), 10);
    document.body.append(view.element);
    expect(view.element.dataset.game).toBe("word");
    // The header reads the open game from <html> (decision 9); dispose clears it.
    expect(document.documentElement.dataset.game).toBe("word");
    await vi.waitFor(() => {
      expect(view.element.querySelector(".guess-row")).not.toBeNull();
    });
    const rule = view.element.querySelector<HTMLElement>(".game-rule");
    expect(rule?.hidden).toBe(false);
    expect(rule?.querySelector("svg")).not.toBeNull();
    expect(view.element.lastElementChild).toBe(rule);
    view.dispose();
    expect(document.documentElement.dataset.game).toBeUndefined();
    view.element.remove();
  });
});
