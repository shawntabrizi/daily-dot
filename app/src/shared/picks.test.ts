import { afterEach, describe, expect, it, vi } from "vitest";

import { storageKeyStore } from "./host-store";
import {
  PICKS_EVENT,
  PICKS_KEY,
  STARTER_PICKS,
  currentPicks,
  parsePicks,
  pickedGames,
  picksMask,
  savePicks,
  serialisePicks,
  syncPicksWithHost,
  unpickedGames,
  type PicksChange,
} from "./picks";
import { MemoryStorage } from "../test/memory-storage";

afterEach(() => {
  window.localStorage.clear();
});

describe("picks", () => {
  it("starts a new player on Word, Mini, Connections and Code", () => {
    expect(STARTER_PICKS).toEqual([0, 4, 5, 6]);
    expect(currentPicks()).toEqual([0, 4, 5, 6]);
    expect(pickedGames().map((game) => game.id)).toEqual(["word", "mini", "connections", "code"]);
    expect(unpickedGames().map((game) => game.id)).toEqual(["sudoku", "chess", "globe", "angle", "color", "sound"]);
    expect(picksMask()).toBe(0b1110001n);
  });

  it("stores roster gameIds in roster order and never an empty pick", () => {
    expect(serialisePicks([5, 0, 5])).toBe('{"version":1,"games":[0,5]}');
    expect(() => serialisePicks([])).toThrow(RangeError);
    // An id off the roster is not a pick.
    expect(() => serialisePicks([42])).toThrow(RangeError);
  });

  it("parses only a version-1 record that names a roster game", () => {
    expect(parsePicks('{"version":1,"games":[3,1]}')).toEqual([1, 3]);
    expect(parsePicks('{"version":1,"games":[1,42]}')).toEqual([1]);
    expect(parsePicks('{"version":1,"games":[42]}')).toBeNull();
    expect(parsePicks('{"version":1,"games":[]}')).toBeNull();
    expect(parsePicks('{"version":2,"games":[1]}')).toBeNull();
    expect(parsePicks('{"version":1,"games":["word"]}')).toBeNull();
    expect(parsePicks("not json")).toBeNull();
    expect(parsePicks(null)).toBeNull();
  });

  it("saves locally at once and announces the player's change", () => {
    const changes: PicksChange[] = [];
    const listen = (event: Event): void => {
      changes.push((event as CustomEvent<PicksChange>).detail);
    };
    window.addEventListener(PICKS_EVENT, listen);
    savePicks([3, 2]);
    window.removeEventListener(PICKS_EVENT, listen);
    expect(currentPicks()).toEqual([2, 3]);
    expect(changes).toEqual([{ from: "player", games: [2, 3] }]);
  });
});

describe("syncPicksWithHost", () => {
  it("adopts the host's picks, which the card draws, and announces them", async () => {
    const host = new MemoryStorage();
    host.setItem(PICKS_KEY, serialisePicks([1]));
    savePicks([0, 4]);
    const listen = vi.fn();
    window.addEventListener(PICKS_EVENT, listen);
    await syncPicksWithHost(storageKeyStore(host, PICKS_KEY));
    window.removeEventListener(PICKS_EVENT, listen);
    expect(currentPicks()).toEqual([1]);
    expect((listen.mock.calls[0]![0] as CustomEvent<PicksChange>).detail).toEqual({ from: "host", games: [1] });
  });

  it("writes this device's choice up when the host has none, and stays quiet when they agree", async () => {
    const host = new MemoryStorage();
    const store = storageKeyStore(host, PICKS_KEY);
    savePicks([2, 3]);
    await syncPicksWithHost(store);
    expect(parsePicks(host.getItem(PICKS_KEY))).toEqual([2, 3]);

    const listen = vi.fn();
    window.addEventListener(PICKS_EVENT, listen);
    await syncPicksWithHost(store);
    window.removeEventListener(PICKS_EVENT, listen);
    expect(listen).not.toHaveBeenCalled();
  });

  it("writes nothing when neither side ever chose: both read the starter set", async () => {
    const host = new MemoryStorage();
    await syncPicksWithHost(storageKeyStore(host, PICKS_KEY));
    expect(host.getItem(PICKS_KEY)).toBeNull();
    expect(window.localStorage.getItem(PICKS_KEY)).toBeNull();
  });
});
