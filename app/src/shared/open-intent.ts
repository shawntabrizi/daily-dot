import { getHostLocalStorage } from "@parity/product-sdk-host";

/**
 * "Open this game", handed from the card launcher (the half-height sheet the
 * host opens beneath the Pocket card) to the full app it then opens.
 *
 * The two are separate instances of the product, and which store the full
 * instance sees first is not known: so the intent goes to `localStorage` and
 * to the product's host KV store, and the full app's boot reads both. An
 * intent older than {@link OPEN_INTENT_MAX_AGE_MS} is a leftover, not a tap.
 */
export const OPEN_INTENT_KEY = "daily-on-dot:open-intent:v1";
export const OPEN_INTENT_MAX_AGE_MS = 5 * 60_000;

export interface OpenIntent {
  version: 1;
  route: string;
  at: number;
}

export function parseOpenIntent(raw: string | null | undefined): OpenIntent | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const candidate = parsed as Partial<OpenIntent>;
  if (
    candidate.version !== 1
    || typeof candidate.route !== "string"
    || !candidate.route.startsWith("#/")
    || typeof candidate.at !== "number"
    || !Number.isFinite(candidate.at)
  ) {
    return null;
  }
  return { version: 1, route: candidate.route, at: candidate.at };
}

export function isFreshIntent(intent: OpenIntent, now: number): boolean {
  const age = now - intent.at;
  return age >= 0 && age < OPEN_INTENT_MAX_AGE_MS;
}

/** Both stores. A failed host write is logged: `localStorage` still has it. */
export async function writeOpenIntent(
  route: string,
  now = Date.now(),
): Promise<void> {
  const value = JSON.stringify({ version: 1, route, at: now } satisfies OpenIntent);
  window.localStorage.setItem(OPEN_INTENT_KEY, value);
  try {
    const host = await getHostLocalStorage();
    await host?.writeString(OPEN_INTENT_KEY, value);
  } catch (error) {
    console.warn("[daily-on-dot] open intent host write failed", error);
  }
}

async function clearHostIntent(): Promise<void> {
  try {
    const host = await getHostLocalStorage();
    await host?.writeString(OPEN_INTENT_KEY, "");
  } catch (error) {
    console.warn("[daily-on-dot] open intent host clear failed", error);
  }
}

/**
 * The full app's boot hook. `localStorage` is read synchronously, so a fresh
 * intent there sets the hash before the router's first resolve; the host KV
 * store answers later and, if it alone holds the intent, the router follows
 * the hash change. Either way the intent is cleared from both stores, stale
 * or not. Logs the boot hash and the outcome so logcat shows whether the host
 * forwarded a hash in the product deeplink.
 */
export function followOpenIntent(now = Date.now()): void {
  const bootHash = window.location.hash;
  const follow = (intent: OpenIntent | null, from: string): boolean => {
    if (!intent) {
      return false;
    }
    const age = now - intent.at;
    const fresh = isFreshIntent(intent, now);
    console.info(
      `[daily-on-dot] open intent from ${from}: ${intent.route} (${age} ms old, ${fresh ? "followed" : "stale"}); booted at hash "${bootHash}"`,
    );
    if (fresh) {
      window.location.hash = intent.route;
    }
    return true;
  };

  const local = parseOpenIntent(window.localStorage.getItem(OPEN_INTENT_KEY));
  if (local) {
    window.localStorage.removeItem(OPEN_INTENT_KEY);
  }
  const followed = follow(local, "localStorage");
  if (!followed) {
    console.info(`[daily-on-dot] no open intent in localStorage; booted at hash "${bootHash}"`);
  }

  void (async () => {
    let host: Awaited<ReturnType<typeof getHostLocalStorage>>;
    try {
      host = await getHostLocalStorage();
    } catch {
      return;
    }
    if (!host) {
      return;
    }
    const stored = parseOpenIntent(await host.readString(OPEN_INTENT_KEY));
    if (!stored) {
      return;
    }
    await clearHostIntent();
    if (!followed) {
      follow(stored, "host KV");
    }
  })().catch((error: unknown) => {
    console.warn("[daily-on-dot] open intent host read failed", error);
  });
}
