import { afterEach, describe, expect, it, vi } from "vitest";

const hostKv = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    enabled: { current: true },
    storage: {
      readString: vi.fn(async (key: string) => values.get(key) ?? ""),
      writeString: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
    },
  };
});
vi.mock("@parity/product-sdk-host", () => ({
  getHostLocalStorage: async () => (hostKv.enabled.current ? hostKv.storage : null),
}));

import {
  followOpenIntent,
  OPEN_INTENT_KEY,
  OPEN_INTENT_MAX_AGE_MS,
  parseOpenIntent,
  writeOpenIntent,
} from "./open-intent";
import { GAME_ROSTER } from "./roster";

const NOW = 1_800_000_000_000;
const route = GAME_ROSTER[2].route;

afterEach(() => {
  window.localStorage.clear();
  hostKv.values.clear();
  hostKv.enabled.current = true;
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("writeOpenIntent", () => {
  it("writes the same versioned intent to localStorage and to the host KV store", async () => {
    await writeOpenIntent(route, NOW);
    const expected = JSON.stringify({ version: 1, route, at: NOW });
    expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBe(expected);
    expect(hostKv.values.get(OPEN_INTENT_KEY)).toBe(expected);
  });

  it("rejects an intent that is not a versioned hash route", () => {
    expect(parseOpenIntent(JSON.stringify({ version: 2, route, at: NOW }))).toBeNull();
    expect(parseOpenIntent(JSON.stringify({ version: 1, route: "https://x", at: NOW }))).toBeNull();
    expect(parseOpenIntent(JSON.stringify({ version: 1, route }))).toBeNull();
    expect(parseOpenIntent("not json")).toBeNull();
  });
});

describe("followOpenIntent", () => {
  it("follows a fresh localStorage intent before the first route and clears it everywhere", async () => {
    window.location.hash = "#/";
    await writeOpenIntent(route, NOW - 1_000);

    followOpenIntent(NOW);

    expect(window.location.hash).toBe(route);
    expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
    await vi.waitFor(() => {
      expect(hostKv.values.get(OPEN_INTENT_KEY)).toBe("");
    });
  });

  it("ignores a stale intent but still clears it", async () => {
    window.location.hash = "#/";
    await writeOpenIntent(route, NOW - OPEN_INTENT_MAX_AGE_MS);

    followOpenIntent(NOW);

    expect(window.location.hash).toBe("#/");
    expect(window.localStorage.getItem(OPEN_INTENT_KEY)).toBeNull();
    await vi.waitFor(() => {
      expect(hostKv.values.get(OPEN_INTENT_KEY)).toBe("");
    });
  });

  it("follows an intent that only the host KV store holds", async () => {
    window.location.hash = "#/";
    hostKv.values.set(
      OPEN_INTENT_KEY,
      JSON.stringify({ version: 1, route, at: NOW - 5_000 }),
    );

    followOpenIntent(NOW);

    expect(window.location.hash).toBe("#/");
    await vi.waitFor(() => {
      expect(window.location.hash).toBe(route);
    });
    expect(hostKv.values.get(OPEN_INTENT_KEY)).toBe("");
  });

  it("does nothing without an intent, inside or outside a host", async () => {
    window.location.hash = "#/history";
    followOpenIntent(NOW);
    hostKv.enabled.current = false;
    followOpenIntent(NOW);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.hash).toBe("#/history");
  });
});
