import { describe, expect, it, vi } from "vitest";
import type { PocketManager } from "@parity/product-sdk-host";

import {
  addCardUrl,
  cardHeld,
  offerPocketCard,
  type PocketPromptDeps,
} from "./pocket-prompt";

function fakePocket(cards: string[] | "silent" | "throws"): PocketManager {
  return {
    subscribeCards(callback: (cards: { cardId: string; privileged: boolean }[]) => void) {
      if (cards === "throws") {
        throw new Error("no pocket domain");
      }
      if (cards !== "silent") {
        queueMicrotask(() =>
          callback(cards.map((cardId) => ({ cardId, privileged: false }))),
        );
      }
      return { unsubscribe() {}, onInterrupt: () => () => {} };
    },
  } as unknown as PocketManager;
}

function deps(overrides: Partial<PocketPromptDeps> = {}) {
  let offered = false;
  const navigate = vi.fn(async () => true);
  const built: PocketPromptDeps = {
    pocket: async () => fakePocket([]),
    drawn: async () => false,
    offered: async () => offered,
    markOffered: async () => {
      offered = true;
    },
    productId: async () => "dailyondot.paseo",
    navigate,
    ...overrides,
  };
  return { deps: built, navigate, isOffered: () => offered };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("cardHeld", () => {
  it("reports whether the daily card is among the product's cards", async () => {
    expect(await cardHeld(fakePocket(["daily"]))).toBe(true);
    expect(await cardHeld(fakePocket(["other"]))).toBe(false);
  });

  it("answers null, not false, when the host does not reply in time or throws", async () => {
    expect(await cardHeld(fakePocket("silent"), 20)).toBeNull();
    expect(await cardHeld(fakePocket("throws"))).toBeNull();
  });
});

describe("offerPocketCard", () => {
  it("does nothing outside a host", async () => {
    const root = document.createElement("div");
    const fake = deps({ pocket: async () => null });
    expect(await offerPocketCard(root, fake.deps)).toBe(false);
    expect(root.querySelector(".pocket-offer")).toBeNull();
    expect(fake.isOffered()).toBe(false);
  });

  it("offers once per device: the second completion never shows it again", async () => {
    const root = document.createElement("div");
    const fake = deps();
    expect(await offerPocketCard(root, fake.deps)).toBe(true);
    expect(root.querySelector(".pocket-offer")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("[data-dismiss]")!.click();
    expect(root.querySelector(".pocket-offer")).toBeNull();

    expect(await offerPocketCard(root, fake.deps)).toBe(false);
    expect(root.querySelector(".pocket-offer")).toBeNull();
  });

  it("links the share page as the other way to add the card, and closes on it", async () => {
    const root = document.createElement("div");
    expect(await offerPocketCard(root, deps().deps)).toBe(true);
    const link = root.querySelector<HTMLAnchorElement>("[data-card-page]");
    expect(link?.getAttribute("href")).toBe("#/card");
    link!.click();
    expect(root.querySelector(".pocket-offer")).toBeNull();
  });

  it("stays silent when the worker has drawn the card on this device, whatever the host lists", async () => {
    const root = document.createElement("div");
    // The host lists nothing (or answers late): the drawn flag is the proof.
    const fake = deps({ drawn: async () => true, pocket: async () => fakePocket("silent") });
    expect(await offerPocketCard(root, fake.deps)).toBe(false);
    expect(root.querySelector(".pocket-offer")).toBeNull();
    expect(fake.isOffered()).toBe(true);
  });

  it("stays silent when the card is already in the Pocket, and still counts as offered", async () => {
    const root = document.createElement("div");
    const fake = deps({ pocket: async () => fakePocket(["daily"]) });
    expect(await offerPocketCard(root, fake.deps)).toBe(false);
    expect(fake.isOffered()).toBe(true);
  });

  it("opens the host's add-card deeplink for this product and closes on success", async () => {
    const root = document.createElement("div");
    const fake = deps();
    await offerPocketCard(root, fake.deps);
    root.querySelector<HTMLButtonElement>("[data-add]")!.click();
    await flush();
    expect(fake.navigate).toHaveBeenCalledWith(
      "polkadotapp://pocket/add?product=dailyondot.paseo&card=daily",
    );
    expect(root.querySelector(".pocket-offer")).toBeNull();
  });

  it("keeps the sheet and says so when the host refuses the deeplink", async () => {
    const root = document.createElement("div");
    const fake = deps({ navigate: vi.fn(async () => false) });
    await offerPocketCard(root, fake.deps);
    root.querySelector<HTMLButtonElement>("[data-add]")!.click();
    await flush();
    expect(root.querySelector(".pocket-offer")).not.toBeNull();
    expect(root.querySelector("[data-detail]")!.textContent).toMatch(/could not open/);
    expect(root.querySelector<HTMLButtonElement>("[data-add]")!.disabled).toBe(false);
  });

  it("builds the deeplink the host classifies as its own Pocket add sheet", () => {
    expect(addCardUrl("a b.dot")).toBe("polkadotapp://pocket/add?product=a%20b.dot&card=daily");
  });
});
