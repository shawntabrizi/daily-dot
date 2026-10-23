import {
  getHostLocalStorage,
  getPocketManager,
  getTruApi,
  navigateTo,
  type PocketManager,
} from "@parity/product-sdk-host";

import { CARD_DRAWN_KEY, CARD_ID } from "./card-state";

/**
 * Offers the checklist card for the Pocket once per device, right after the
 * first game recorded on it. Inside a host only: outside one there is no
 * Pocket to add to.
 *
 * TrUAPI has no "add a card" call; the Pocket manager lists and removes cards
 * only. Adding goes through the host's own deeplink,
 * `polkadotapp://pocket/add?product=<product>&card=<id>`, which `navigateTo`
 * accepts from a product and the host turns into its add-card sheet (pets'
 * finding; see pocket-prompt.ts there).
 */
export const OFFERED_KEY = "daily-on-dot:card:offered";

export interface PocketPromptDeps {
  pocket(): Promise<PocketManager | null>;
  /** The worker has drawn the card on this device: it is in the Pocket. */
  drawn(): Promise<boolean>;
  offered(): Promise<boolean>;
  markOffered(): Promise<void>;
  productId(): Promise<string | null>;
  navigate(url: string): Promise<boolean>;
}

export function addCardUrl(productId: string): string {
  return `polkadotapp://pocket/add?product=${encodeURIComponent(productId)}&card=${encodeURIComponent(CARD_ID)}`;
}

/**
 * Whether this product's card is in the Pocket. `null` when the host can't say
 * (an error, or no answer in time): then the offer is made once anyway rather
 * than never.
 */
export function cardHeld(
  pocket: PocketManager,
  timeoutMs = 3_000,
): Promise<boolean | null> {
  return new Promise((resolve) => {
    let settled = false;
    let subscription: { unsubscribe(): void } | undefined;
    const settle = (held: boolean | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(held);
    };
    const timer = setTimeout(() => settle(null), timeoutMs);
    try {
      const sub = pocket.subscribeCards((cards) =>
        settle(cards.some((card) => card.cardId === CARD_ID)),
      );
      sub.onInterrupt(() => settle(null));
      subscription = sub;
      // The host may have answered before `subscribeCards` returned.
      if (settled) sub.unsubscribe();
    } catch {
      settle(null);
    }
  });
}

/** This product's id as the host knows it; `null` outside a host. */
export async function hostProductId(): Promise<string | null> {
  const truApi = await getTruApi();
  if (!truApi) return null;
  return truApi.system.getProductContext().match(
    (context) => context.productId,
    () => null,
  );
}

function defaultDeps(): PocketPromptDeps {
  const storage = getHostLocalStorage();
  return {
    pocket: getPocketManager,
    async drawn() {
      return (await (await storage)?.readString(CARD_DRAWN_KEY)) === "1";
    },
    async offered() {
      return (await (await storage)?.readString(OFFERED_KEY)) === "1";
    },
    async markOffered() {
      await (await storage)?.writeString(OFFERED_KEY, "1");
    },
    productId: hostProductId,
    async navigate(url) {
      const result = await navigateTo(url);
      if (!result.ok) {
        console.warn(`[daily-on-dot] navigateTo ${url}: ${result.error.message}`);
      }
      return result.ok;
    },
  };
}

function renderSheet(
  root: HTMLElement,
  onAdd: () => Promise<boolean>,
): HTMLElement {
  const sheet = document.createElement("div");
  sheet.className = "pocket-offer";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-labelledby", "pocket-offer-title");
  sheet.innerHTML = `
    <strong id="pocket-offer-title">Keep today's checklist in your Pocket</strong>
    <span data-detail>One card with all six games, ticked as you play.</span>
    <div class="pocket-offer__actions">
      <button type="button" class="button-link button-link--button" data-add>Add card</button>
      <button type="button" data-dismiss>Not now</button>
      <a href="#/card" data-card-page>Other ways</a>
    </div>
  `;
  const detail = sheet.querySelector<HTMLElement>("[data-detail]");
  const add = sheet.querySelector<HTMLButtonElement>("[data-add]");
  const dismiss = sheet.querySelector<HTMLButtonElement>("[data-dismiss]");
  const cardPage = sheet.querySelector<HTMLAnchorElement>("[data-card-page]");
  if (!detail || !add || !dismiss || !cardPage) {
    throw new Error("Pocket offer failed to render");
  }
  dismiss.addEventListener("click", () => sheet.remove());
  cardPage.addEventListener("click", () => sheet.remove());
  add.addEventListener("click", () => {
    add.disabled = true;
    void onAdd().then((opened) => {
      if (opened) {
        sheet.remove();
        return;
      }
      add.disabled = false;
      detail.textContent = "The Polkadot app could not open the Pocket. Try again later.";
    });
  });
  root.append(sheet);
  return sheet;
}

/**
 * Mount the offer if this device has not seen it. Resolves true when the sheet
 * was shown. Marks the device as offered before showing, so a second
 * completion in the same session cannot show it twice.
 */
export async function offerPocketCard(
  root: HTMLElement,
  deps: PocketPromptDeps = defaultDeps(),
): Promise<boolean> {
  if (root.querySelector(".pocket-offer")) {
    return false;
  }
  const pocket = await deps.pocket();
  if (!pocket || (await deps.offered())) {
    return false;
  }
  await deps.markOffered();
  if ((await deps.drawn()) || (await cardHeld(pocket)) === true) {
    return false;
  }
  renderSheet(root, async () => {
    const productId = await deps.productId();
    return productId ? deps.navigate(addCardUrl(productId)) : false;
  });
  return true;
}
