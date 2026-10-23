import { describe, expect, it, vi } from "vitest";

import { requestAutoSigning } from "./chain-bindings";
import { autoSignOutcome, GRANTED_BEFORE_KEY } from "./save-consent";

// Why: every record would otherwise raise the host's signing sheet. The
// AutoSigning allowance is asked for once, and a refusal must never block a
// write: the per-call prompt is the fallback, not an error.
describe("requestAutoSigning", () => {
  it("asks the host for the AutoSigning allowance and reports the outcome", async () => {
    const request = vi.fn(async () => ({ ok: true as const, value: ["Allocated" as const] }));
    await expect(requestAutoSigning(request as never)).resolves.toBe("Allocated");
    expect(request).toHaveBeenCalledWith([{ tag: "AutoSigning", value: undefined }]);
  });

  it("turns a refusal or a host error into a value, never a throw", async () => {
    const rejected = vi.fn(async () => ({ ok: true as const, value: ["Rejected" as const] }));
    await expect(requestAutoSigning(rejected as never)).resolves.toBe("Rejected");
    const failed = vi.fn(async () => ({ ok: false as const, error: { message: "no host" } }));
    await expect(requestAutoSigning(failed as never)).resolves.toBe("Failed");
    const threw = vi.fn(async () => { throw new Error("boom"); });
    await expect(requestAutoSigning(threw as never)).resolves.toBe("Failed");
  });

  // Why: the grant is what lets later finishes save with no prompt; a refusal
  // must keep the prompt and drop its "approve" promise. The host drops the
  // grant on an app restart, so the outcome lives for this run only and no
  // grant is stored on the device.
  it("remembers the outcome for this run only, never as a stored grant", async () => {
    window.localStorage.clear();
    const allocated = vi.fn(async () => ({ ok: true as const, value: ["Allocated" as const] }));
    await requestAutoSigning(allocated as never);
    expect(autoSignOutcome()).toBe("Allocated");
    const rejected = vi.fn(async () => ({ ok: true as const, value: ["Rejected" as const] }));
    await requestAutoSigning(rejected as never);
    expect(autoSignOutcome()).toBe("Rejected");
    // Only the "granted before" hint is stored; nothing reads it as a grant.
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe(GRANTED_BEFORE_KEY);
    window.localStorage.clear();
  });
});
