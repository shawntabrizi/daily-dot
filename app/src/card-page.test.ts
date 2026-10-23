import { describe, expect, it, vi } from "vitest";

import { renderCardPage, type CardPageDeps } from "./card-page";
import { NETWORKS } from "./networks";

// The link a phone scans or taps. Pinned as a literal on purpose: a change to
// the product id or the card id must also change the page people share.
const PUBLISHED_DEEPLINK =
  "polkadotapp://pocket/add?product=dailyondot.paseo&card=daily";

function deps(overrides: Partial<CardPageDeps> = {}) {
  const navigate = vi.fn(async () => true);
  const built: CardPageDeps = {
    network: NETWORKS["paseo-next-v2"],
    insideHost: async () => false,
    navigate,
    ...overrides,
  };
  return { deps: built, navigate };
}

describe("card page", () => {
  it("shows the published add-card link as a QR code and as text", () => {
    const view = renderCardPage(deps().deps);
    expect(view.element.querySelector("[data-qr] svg")).not.toBeNull();
    expect(view.element.querySelector("[data-deeplink]")?.textContent).toBe(
      PUBLISHED_DEEPLINK,
    );
    expect(view.element.querySelector("[data-share]")?.textContent).toBe(
      "https://dailyondot.paseo.li/#/card",
    );
    view.dispose();
  });

  it("outside a host, links the deeplink directly and has no host button", async () => {
    const view = renderCardPage(deps().deps);
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-add-link]")).not.toBeNull();
    });
    expect(
      view.element.querySelector<HTMLAnchorElement>("[data-add-link]")?.getAttribute("href"),
    ).toBe(PUBLISHED_DEEPLINK);
    expect(view.element.querySelector("[data-add]")).toBeNull();
    expect(view.element.textContent).toContain(
      "Open this page in the Polkadot app or scan the code with the phone.",
    );
    view.dispose();
  });

  it("inside a host, the button opens the deeplink through the host", async () => {
    const fake = deps({ insideHost: async () => true });
    const view = renderCardPage(fake.deps);
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-add]")).not.toBeNull();
    });
    expect(view.element.querySelector("[data-add-link]")).toBeNull();
    view.element.querySelector<HTMLButtonElement>("[data-add]")?.click();
    expect(fake.navigate).toHaveBeenCalledWith(PUBLISHED_DEEPLINK);
    view.dispose();
  });
});
