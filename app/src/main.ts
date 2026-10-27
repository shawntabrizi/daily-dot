import { getTruApi } from "@parity/product-sdk-host";

import { fromCard, renderCardLauncher } from "./card-launcher";
import { renderCardPage } from "./card-page";
import { renderCustomize } from "./customize";
import { renderDayPage } from "./day-page";
import { renderChess } from "./games/chess/view";
import { renderAngle } from "./games/angle/view";
import { renderCode } from "./games/code/view";
import { renderColor } from "./games/color/view";
import { renderConnections } from "./games/connections/view";
import { renderGlobe } from "./games/globe/view";
import { renderMini } from "./games/mini/view";
import { renderSound } from "./games/sound/view";
import { renderSudoku } from "./games/sudoku/view";
import { renderWord } from "./games/word/view";
import { renderHistory } from "./history";
import { renderHome, type ViewHandle } from "./home";
import { renderStreaks } from "./streaks";
import {
  CardStateWriter,
  detectCardStore,
  withCardState,
  type CardSummary,
} from "./shared/card-state";
import { InMemoryDataSource, type DataSource } from "./shared/data-source";
import { dayComplete, loadDaySummary, loadHubStreaks } from "./shared/day-summary";
import { followHostTheme } from "./shared/host-theme";
import { followOpenIntent, OPEN_INTENT_KEY } from "./shared/open-intent";
import {
  PICKS_EVENT,
  detectPicksStore,
  pickedGames,
  serializePicks,
  syncPicksWithHost,
  type PicksChange,
} from "./shared/picks";
import { offerPocketCard } from "./shared/pocket-prompt";
import { withSaveConsent } from "./shared/save-consent";
import { finishedGamesReader } from "./shared/progress";
import { createSavePromptUi } from "./shared/ui/save-prompt";
import {
  hostSignerFactory,
  readBindingsFactory,
  writeBindingsFactory,
} from "./shared/chain-bindings";
import { ChainDataSource } from "./shared/chain-data-source";
import { GenesisMismatchError } from "./shared/genesis";
import { NETWORKS } from "./networks";
import { createDrawer } from "./shared/ui/drawer";
import { createHeader } from "./shared/ui/header";
import { dayIndexFromDate } from "./shared/day";
import "./styles/index.css";

function parseDay(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const day = Number(value);
  return Number.isInteger(day) ? day : Number.NaN;
}

function notFound(): ViewHandle {
  const page = document.createElement("section");
  page.className = "page placeholder-page";
  page.innerHTML = `
    <p class="eyebrow">404</p>
    <h1>That puzzle wandered off.</h1>
    <a class="button-link" href="#/">Back to home</a>
  `;
  return { element: page, dispose() {} };
}

export function startApp(
  root: HTMLElement,
  source: DataSource = new InMemoryDataSource(),
): () => void {
  root.innerHTML = `
    <div class="app-shell">
      <div data-header></div>
      <main id="main-content" tabindex="-1"></main>
      <div class="toast" data-toast role="status" aria-live="polite"></div>
    </div>
  `;
  const headerTarget = root.querySelector<HTMLElement>("[data-header]");
  const main = root.querySelector<HTMLElement>("main");
  const toast = root.querySelector<HTMLElement>("[data-toast]");
  if (!headerTarget || !main || !toast) {
    throw new Error("Application shell failed to render");
  }

  let toastTimer = 0;
  let currentView: ViewHandle | null = null;
  // The hub's hamburger opens the drawer (nav list and activity strip).
  const drawer = createDrawer(source);
  const header = createHeader({ onMenu: () => drawer.open() });
  headerTarget.append(header.element, drawer.element);
  // The home announces the hub streak (WP34); the header pill shows it.
  const onStreaks = (event: Event): void => {
    const { streakAny } = (event as CustomEvent<CardSummary>).detail;
    if (typeof streakAny === "number") {
      header.setStreaks({ any: streakAny });
    }
  };
  window.addEventListener("daily-day-summary", onStreaks);

  const onToast = (event: Event): void => {
    const message = (event as CustomEvent<string>).detail;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2_400);
  };
  window.addEventListener("daily-toast", onToast);

  const route = (): void => {
    currentView?.dispose();

    const raw = window.location.hash.slice(1) || "/";
    const url = new URL(raw, window.location.origin);
    // The hubs (today and a past day) have the hamburger and the pill; every
    // other screen a back circle and the eyebrow it sets itself
    // (`setHeaderTitle`). A past day's game goes back to that day's hub.
    header.setLeft(url.pathname === "/" || url.pathname === "/day" ? "menu" : "back");
    header.setTitle(null);
    const day = parseDay(url.searchParams.get("day"));
    if (
      url.pathname.startsWith("/g/")
      && day !== undefined
      && day >= 0
      && day < dayIndexFromDate(new Date())
    ) {
      header.setBack(`#/day?day=${day}`, `Back to Day ${day}`);
    }
    drawer.close();
    if (url.pathname === "/") {
      currentView = renderHome(source);
    } else if (url.pathname === "/history") {
      currentView = renderHistory(source);
    } else if (url.pathname === "/streaks") {
      currentView = renderStreaks(source);
      header.setTitle("Streaks");
    } else if (url.pathname === "/card") {
      currentView = renderCardPage();
    } else if (url.pathname === "/customize") {
      currentView = renderCustomize();
      header.setTitle("Customize");
    } else if (url.pathname === "/day") {
      currentView = renderDayPage(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/word") {
      currentView = renderWord(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/sudoku") {
      currentView = renderSudoku(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/chess") {
      currentView = renderChess(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/globe") {
      currentView = renderGlobe(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/mini") {
      currentView = renderMini(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/code") {
      currentView = renderCode(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/angle") {
      currentView = renderAngle(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/color") {
      currentView = renderColor(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/sound") {
      currentView = renderSound(source, parseDay(url.searchParams.get("day")));
    } else if (url.pathname === "/g/connections") {
      currentView = renderConnections(
        source,
        parseDay(url.searchParams.get("day")),
      );
    } else {
      currentView = notFound();
    }

    main.replaceChildren(currentView.element);
    window.scrollTo({ top: 0 });
  };

  window.addEventListener("hashchange", route);
  route();

  // Picks adopted from the host (another surface changed them) redraw a hub
  // in place; a game in play is never torn down for it.
  const onPicks = (event: Event): void => {
    const path = (window.location.hash.slice(1) || "/").split("?")[0];
    if ((event as CustomEvent<PicksChange>).detail.from === "host" && (path === "/" || path === "/day")) {
      route();
    }
  };
  window.addEventListener(PICKS_EVENT, onPicks);

  return () => {
    currentView?.dispose();
    window.removeEventListener("hashchange", route);
    window.removeEventListener(PICKS_EVENT, onPicks);
    window.removeEventListener("daily-toast", onToast);
    window.removeEventListener("daily-day-summary", onStreaks);
    window.clearTimeout(toastTimer);
  };
}

function activeDeployment(): {
  contracts: NonNullable<BuiltDeployment["contracts"]>;
  wordListId: number;
  chessSetId: number;
  miniSetId: number;
  connectionsSetId: number;
} {
  const content = __DAILY_DEPLOYMENT__.content;
  if (
    __DAILY_DEPLOYMENT__.status !== "deployed"
    || !__DAILY_DEPLOYMENT__.contracts
    || !content
    || typeof content.wordListId !== "number"
    || typeof content.chessSetId !== "number"
    || typeof content.miniSetId !== "number"
    || typeof content.connectionsSetId !== "number"
    || !__DAILY_ABIS__
  ) {
    throw new Error(
      `The ${__DAILY_NETWORK__} build has no deployed contracts and seeded content.`,
    );
  }
  return {
    contracts: __DAILY_DEPLOYMENT__.contracts,
    wordListId: content.wordListId,
    chessSetId: content.chessSetId,
    miniSetId: content.miniSetId,
    connectionsSetId: content.connectionsSetId,
  };
}

export function renderBootFailure(
  root: HTMLElement,
  headline: string,
  detail: string,
): void {
  const page = document.createElement("section");
  page.className = "page placeholder-page boot-error";
  page.setAttribute("role", "alert");

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "CONNECTION BLOCKED";
  const title = document.createElement("h1");
  title.textContent = headline;
  const message = document.createElement("p");
  message.textContent = detail;
  const retry = document.createElement("button");
  retry.className = "button-link button-link--button";
  retry.type = "button";
  retry.textContent = "Reload and try again";
  retry.addEventListener("click", () => window.location.reload());

  page.append(eyebrow, title, message, retry);
  root.replaceChildren(page);
}

export function bootApp(root: HTMLElement): () => void {
  // Beneath the Pocket card (`?card=daily`): the launcher only. No chain
  // client, no signer. A game tapped there is followed before the first route.
  if (fromCard()) {
    return renderCardLauncher(root);
  }
  followOpenIntent();
  // The Pocket card reads the day's checklist from the product's KV store;
  // every data source the app boots with mirrors into it.
  const cardState = new CardStateWriter(detectCardStore());
  // The host keeps this instance alive and only brings it forward when the
  // launcher opens a game (Android, 2026-10-21: the boot hook never re-ran, so
  // every tap landed on the game already open). Read the intent again each
  // time the page becomes visible.
  const onVisible = (): void => {
    if (document.visibilityState === "visible") {
      followOpenIntent();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
  // The launcher's write can reach this instance after both reads above
  // (Android, 2026-10-26: boot and visible read nothing, the intent showed up
  // a moment later, and Play landed on the hub). Follow it when it arrives.
  const onIntentWrite = (event: StorageEvent): void => {
    if (event.key === OPEN_INTENT_KEY && event.newValue) {
      followOpenIntent();
    }
  };
  window.addEventListener("storage", onIntentWrite);
  // The home derives the day's percentile and the hub streaks (WP34) and
  // announces them; they ride on the Pocket card's record.
  const onSummary = (event: Event): void => {
    const { day, ...summary } = (event as CustomEvent<{ day: number } & CardSummary>).detail;
    void cardState.syncSummary(day, summary).catch((error: unknown) => {
      console.warn("[daily-on-dot] card summary write failed", error);
    });
  };
  window.addEventListener("daily-day-summary", onSummary);
  // The picks (D21) live in the host KV store, where the card reads them:
  // adopt the host's copy on boot and mirror every change the player makes.
  const picksStore = detectPicksStore();
  void picksStore
    .then((store) => syncPicksWithHost(store))
    .catch((error: unknown) => console.warn("[daily-on-dot] picks sync failed", error));
  const onPicks = (event: Event): void => {
    const change = (event as CustomEvent<PicksChange>).detail;
    if (change.from !== "player") return;
    void picksStore
      .then((store) => store.write(serializePicks(change.games)))
      .catch((error: unknown) => console.warn("[daily-on-dot] picks write failed", error));
  };
  window.addEventListener(PICKS_EVENT, onPicks);
  // The host's light or dark theme selects the token block (WP36 A6).
  const stopTheme = followHostTheme();
  const stopFollowing = (): void => {
    stopTheme();
    window.removeEventListener(PICKS_EVENT, onPicks);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", onVisible);
    window.removeEventListener("storage", onIntentWrite);
    window.removeEventListener("daily-day-summary", onSummary);
  };

  // After every record: the card gets the streaks (and, once the sixth game
  // is in, the day's percentile) at once, without a visit to the home page.
  let summarySource: DataSource | null = null;
  const syncCardSummary = async (recordedDay: number): Promise<void> => {
    const source = summarySource;
    if (!source) return;
    const today = await source.currentDay();
    const streaks = await loadHubStreaks(source, today);
    const summary: CardSummary = { streakAny: streaks.any };
    if (recordedDay === today) {
      const bits = await source.dayBits(today);
      if (dayComplete(bits, pickedGames())) {
        const daySummary = await loadDaySummary(source, today, bits);
        if (daySummary.dayPercentile !== null) {
          summary.dayPercentile = daySummary.dayPercentile;
        }
      }
    }
    await cardState.syncSummary(today, summary);
  };
  // The first completion on this device offers the card; inside a host only.
  const onRecorded = (day: number): void => {
    void syncCardSummary(day).catch((error: unknown) => {
      console.warn("[daily-on-dot] card summary sync failed", error);
    });
    void offerPocketCard(root).catch((error: unknown) => {
      console.warn("[daily-on-dot] pocket offer failed", error);
    });
  };
  // No sign sheet the player did not ask for: a finish without the
  // AutoSigning grant asks first (save-consent.ts).
  const savePrompts = createSavePromptUi(root);
  if (__DAILY_SOURCE__ === "stub") {
    // The stub has no host; it always prompts, so the flow can be seen.
    const stubSource = withCardState(new InMemoryDataSource(), cardState, onRecorded);
    summarySource = withSaveConsent(stubSource, {
      inHost: async () => true,
      open: savePrompts.open,
      finished: finishedGamesReader(stubSource),
    });
    const stop = startApp(root, summarySource);
    return () => {
      stopFollowing();
      stop();
    };
  }

  let deployment: ReturnType<typeof activeDeployment>;
  try {
    deployment = activeDeployment();
  } catch (error) {
    renderBootFailure(
      root,
      "This build isn’t set up yet.",
      error instanceof Error ? error.message : String(error),
    );
    return stopFollowing;
  }

  const network = NETWORKS[__DAILY_NETWORK__];
  const abis = __DAILY_ABIS__!;
  const hostSigner = hostSignerFactory(network);
  const reads = readBindingsFactory(
    network,
    deployment.contracts,
    abis,
    hostSigner,
    deployment.miniSetId,
    deployment.connectionsSetId,
  );
  const writes = writeBindingsFactory(
    network,
    deployment.contracts,
    abis,
    hostSigner,
  );
  const chainSource = withCardState(
    new ChainDataSource(
      reads,
      writes,
      deployment.wordListId,
      deployment.chessSetId,
    ),
    cardState,
    onRecorded,
  );
  summarySource = withSaveConsent(chainSource, {
    inHost: async () => (await getTruApi()) !== null,
    open: savePrompts.open,
    finished: finishedGamesReader(chainSource),
  });
  const dispose = startApp(root, summarySource);
  void reads().catch((error: unknown) => {
    if (error instanceof GenesisMismatchError) {
      dispose();
      renderBootFailure(
        root,
        error.headline,
        `Network mismatch: ${error.message}.`,
      );
    }
  });
  return () => {
    stopFollowing();
    dispose();
  };
}

const root = document.querySelector<HTMLElement>("#app");
if (root) {
  bootApp(root);
}
