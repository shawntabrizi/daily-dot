import { getThemeProvider, type ThemeMode } from "@parity/product-sdk-host";

export type ThemeAttribute = "light" | "dark";

/** The attribute `tokens.css` keys its light block on. */
export function themeAttribute(theme: ThemeMode): ThemeAttribute {
  return theme.variant === "Light" ? "light" : "dark";
}

/**
 * Follow the host's theme: `data-theme` on the root element switches the token
 * block (`:root[data-theme="light"]` in tokens.css). Outside a host, or on a
 * host without a theme provider, the attribute stays off and the app is dark.
 * Returns a stop function.
 */
export function followHostTheme(
  root: HTMLElement = document.documentElement,
  provider: typeof getThemeProvider = getThemeProvider,
): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  void provider()
    .then((themes) => {
      if (!themes || stopped) return;
      const subscription = themes.subscribeTheme((theme) => {
        root.dataset.theme = themeAttribute(theme);
      });
      unsubscribe = () => subscription.unsubscribe();
    })
    .catch((error: unknown) => {
      console.warn("[daily-on-dot] host theme unavailable", error);
    });
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}
