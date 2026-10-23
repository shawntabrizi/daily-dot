import { describe, expect, it, vi } from "vitest";

import { followHostTheme, themeAttribute } from "./host-theme";

// Why: the host can run light; a dark-only page inside a light host reads as a
// broken embed. The token block keys on data-theme, so the attribute is the
// whole contract.
describe("followHostTheme", () => {
  it("sets data-theme from the host variant and clears the subscription on stop", async () => {
    const root = document.createElement("div");
    let deliver: ((theme: { name: { tag: "Default" }; variant: "Light" | "Dark" }) => void) | null = null;
    const unsubscribe = vi.fn();
    const provider = vi.fn(async () => ({
      subscribeTheme: (callback: typeof deliver) => {
        deliver = callback;
        return { unsubscribe, onInterrupt: () => () => {} };
      },
    }));
    const stop = followHostTheme(root, provider as never);
    await Promise.resolve();
    await Promise.resolve();
    deliver!({ name: { tag: "Default" }, variant: "Light" });
    expect(root.dataset.theme).toBe("light");
    deliver!({ name: { tag: "Default" }, variant: "Dark" });
    expect(root.dataset.theme).toBe("dark");
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("leaves the attribute off outside a host", async () => {
    const root = document.createElement("div");
    followHostTheme(root, (async () => null) as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(root.dataset.theme).toBeUndefined();
    expect(themeAttribute({ name: { tag: "Default" }, variant: "Dark" })).toBe("dark");
  });
});
