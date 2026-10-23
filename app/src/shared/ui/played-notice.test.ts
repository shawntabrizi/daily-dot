import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayedNotice } from "./played-notice";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("played notice", () => {
  it("on today's game, says so and counts down to the next set, ticking each second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 22, 16, 47, 27));
    const notice = createPlayedNotice({ short: "Word" }, 294, 294);
    document.body.append(notice);
    expect(notice.textContent).toBe("You already played today's Word! Next one in 07:12:33");
    vi.advanceTimersByTime(1_000);
    expect(notice.textContent).toBe("You already played today's Word! Next one in 07:12:32");
  });

  it("on a past day, points back to today and shows no countdown", () => {
    const notice = createPlayedNotice({ short: "Chess" }, 200, 294);
    expect(notice.textContent).toBe("You already played this Chess! Today's is waiting.");
    expect(notice.querySelector(".played-notice-clock")).toBeNull();
  });
});
