import { isInsideContainer, navigateTo } from "@parity/product-sdk-host";
import qrcode from "qrcode-generator";

import type { ViewHandle } from "./home";
import { NETWORKS, type NetworkTarget } from "./networks";
import { addCardUrl } from "./shared/pocket-prompt";

/**
 * A page to share: how to put the checklist card in a Pocket. The add-card
 * deeplink (the same one the offer sheet opens) as a QR code for a phone
 * camera, as text to copy, and as a button inside a host.
 */
export interface CardPageDeps {
  network: NetworkTarget;
  insideHost(): Promise<boolean>;
  navigate(url: string): Promise<boolean>;
}

/** Dotli serves `<label>.<tld>` at `https://<label>.<tld>.li`. */
export function cardPageUrl(domain: string): string {
  return `https://${domain}.li/#/card`;
}

function defaultDeps(): CardPageDeps {
  return {
    network: NETWORKS[__DAILY_NETWORK__],
    insideHost: isInsideContainer,
    async navigate(url) {
      const result = await navigateTo(url);
      if (!result.ok) {
        console.warn(`[daily-on-dot] navigateTo ${url}: ${result.error.message}`);
      }
      return result.ok;
    },
  };
}

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent("daily-toast", { detail: message }));
}

/** Clipboard when the page has it (secure context); else select the text. */
async function copyText(text: string, source: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.");
    return;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(source);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    toast("Selected. Copy it from the menu.");
  }
}

function copyRow(label: string, text: string, key: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "copy-row";
  const code = document.createElement("code");
  code.className = "copy-row__text";
  code.dataset[key] = "";
  code.textContent = text;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy-row__button";
  copy.setAttribute("aria-label", `Copy the ${label}`);
  copy.textContent = "Copy";
  copy.addEventListener("click", () => void copyText(text, code));
  row.append(code, copy);
  return row;
}

function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ scalable: true });
}

export function renderCardPage(deps: CardPageDeps = defaultDeps()): ViewHandle {
  const deeplink = addCardUrl(deps.network.domain);
  const page = document.createElement("section");
  page.className = "page card-page";
  page.innerHTML = `
    <div class="card-page-intro">
      <p class="eyebrow">POCKET</p>
      <h1>Add the Daily on Dot card</h1>
    </div>
    <div class="card-page-grid">
      <article class="card-panel card-panel--qr">
        <div class="qr-tile" data-qr aria-label="QR code of the add-card link" role="img"></div>
        <p class="card-panel__note">Scan with the phone that has the Polkadot app.</p>
        <div data-deeplink-row></div>
        <div class="card-panel__action" data-add-slot></div>
      </article>
      <article class="card-panel">
        <h2>What the card shows</h2>
        <p>
          A tick for each game finished today, the count done, and what
          is left. Tap the card to pick a game.
        </p>
      </article>
      <article class="card-panel">
        <h2>If the code does not work</h2>
        <ol>
          <li>Open <code>${deps.network.domain}</code> in the Polkadot app.</li>
          <li>Finish one game.</li>
          <li>Accept the offer to add the card.</li>
        </ol>
      </article>
      <article class="card-panel">
        <h2>Share this page</h2>
        <div data-share-row></div>
      </article>
    </div>
  `;

  const qr = page.querySelector<HTMLElement>("[data-qr]");
  const deeplinkRow = page.querySelector<HTMLElement>("[data-deeplink-row]");
  const addSlot = page.querySelector<HTMLElement>("[data-add-slot]");
  const shareRow = page.querySelector<HTMLElement>("[data-share-row]");
  if (!qr || !deeplinkRow || !addSlot || !shareRow) {
    throw new Error("Card page failed to render");
  }

  qr.innerHTML = qrSvg(deeplink);
  deeplinkRow.replaceWith(copyRow("add-card link", deeplink, "deeplink"));
  shareRow.replaceWith(
    copyRow("page link", cardPageUrl(deps.network.domain), "share"),
  );

  let disposed = false;
  // The host check is async; the slot stays empty until it answers so a
  // phone never sees the "open this in the app" line inside the app.
  void deps.insideHost().then((inside) => {
    if (disposed) return;
    if (inside) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "button-link button-link--button";
      add.dataset.add = "";
      add.textContent = "Add to Pocket";
      add.addEventListener("click", () => {
        add.disabled = true;
        void deps.navigate(deeplink).then((opened) => {
          add.disabled = false;
          if (!opened) {
            toast("The Polkadot app could not open the Pocket. Try again later.");
          }
        });
      });
      addSlot.replaceChildren(add);
      return;
    }
    const note = document.createElement("p");
    note.className = "card-panel__note";
    note.textContent =
      "Open this page in the Polkadot app or scan the code with the phone.";
    const link = document.createElement("a");
    link.className = "button-link";
    link.dataset.addLink = "";
    link.href = deeplink;
    link.textContent = "Add the card to Pocket";
    addSlot.replaceChildren(note, link);
  });

  return {
    element: page,
    dispose() {
      disposed = true;
    },
  };
}
