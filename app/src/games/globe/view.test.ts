import { afterEach, describe, expect, it, vi } from "vitest";
import { headerTitle } from "../../shared/ui/header";

import type { DataSource } from "../../shared/data-source";
import { GLOBE_COUNTRIES, globeAnswer } from "./generate";
import { countryDistanceKm, proximityRamp, type GeoPoint } from "./geography";
import type { CountryFill } from "./globe";
import { loadGlobeProgress } from "./progress";
import { renderGlobe } from "./view";

// jsdom has no 2D canvas; capture what the view asks the globe to show.
const globeCalls: { fills: ReadonlyMap<string, CountryFill>[]; focus: GeoPoint[] } = {
  fills: [],
  focus: [],
};
vi.mock("./globe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./globe")>()),
  createGlobe: () => ({
    setFills: (fills: ReadonlyMap<string, CountryFill>) => {
      globeCalls.fills.push(fills);
    },
    focus: (point: GeoPoint) => {
      globeCalls.focus.push(point);
    },
    zoom: () => 1,
    setZoom: () => undefined,
    dispose: () => undefined,
  }),
}));

function sourceFor(
  day: number,
  played = 0n,
  record: DataSource["record"] = async () => undefined,
): DataSource {
  return {
    currentDay: async () => day,
    wordAnswer: async () => "planet",
    dayBits: async () => ({ played, solved: played, ontime: played }),
    dayBitsRange: async () => [],
    record,
    histogram: async () => ({ total: 3, buckets: [{ bucket: 1, count: 3 }] }),
  };
}

function submitCountry(view: HTMLElement, country: string): void {
  const input = view.querySelector<HTMLInputElement>(
    "#globe-country-input",
  );
  const button = view.querySelector<HTMLButtonElement>(
    ".globe-form button[type=submit]",
  );
  if (!input || !button) {
    throw new Error("Globe form is unavailable");
  }
  input.value = country;
  button.click();
}

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
  globeCalls.fills.length = 0;
  globeCalls.focus.length = 0;
});

describe("Globe view", () => {
  it("opens the full country list from an empty input", async () => {
    const view = renderGlobe(sourceFor(208), 208);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });
    const input = view.element.querySelector<HTMLInputElement>("#globe-country-input")!;
    const listbox = view.element.querySelector<HTMLElement>("#globe-country-options")!;

    expect(listbox.hidden).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    input.focus();

    expect(listbox.hidden).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(listbox.querySelectorAll("[role=option]")).toHaveLength(GLOBE_COUNTRIES.length);
    view.dispose();
  });

  it("filters the list to what has been typed", async () => {
    const view = renderGlobe(sourceFor(208), 208);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });
    const input = view.element.querySelector<HTMLInputElement>("#globe-country-input")!;
    input.focus();
    input.value = "fra";
    input.dispatchEvent(new Event("input"));

    const names = [...view.element.querySelectorAll("#globe-country-options [role=option]")]
      .map((option) => option.textContent ?? "");
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(GLOBE_COUNTRIES.length);
    expect(names.every((name) => name.toLowerCase().includes("fra"))).toBe(true);
    view.dispose();
  });

  it("greys out guessed countries and will not pick them", async () => {
    const day = 208;
    const answer = globeAnswer(day, "v1");
    const guess = GLOBE_COUNTRIES.find((country) => country.iso !== answer.iso)!;
    const view = renderGlobe(sourceFor(day), day);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });
    submitCountry(view.element, guess.name);

    const input = view.element.querySelector<HTMLInputElement>("#globe-country-input")!;
    input.focus();
    const options = [...view.element.querySelectorAll<HTMLElement>(
      "#globe-country-options [role=option]",
    )];
    const greyed = options.filter((option) => option.getAttribute("aria-disabled") === "true");
    expect(greyed).toHaveLength(1);
    expect(greyed[0]!.firstChild?.textContent).toBe(guess.name);

    greyed[0]!.click();
    expect(input.value).toBe("");
    expect(view.element.querySelectorAll(".globe-guess-row")).toHaveLength(1);
    view.dispose();
  });

  it("fills the input from a picked country and closes the list", async () => {
    const day = 208;
    const answer = globeAnswer(day, "v1");
    const guess = GLOBE_COUNTRIES.find((country) => country.iso !== answer.iso)!;
    const view = renderGlobe(sourceFor(day), day);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });
    const input = view.element.querySelector<HTMLInputElement>("#globe-country-input")!;
    input.focus();
    const option = [...view.element.querySelectorAll<HTMLElement>(
      "#globe-country-options [role=option]",
    )].find((candidate) => candidate.textContent === guess.name)!;
    option.click();

    expect(input.value).toBe(guess.name);
    expect(view.element.querySelector<HTMLElement>("#globe-country-options")!.hidden).toBe(true);
    // Picking only fills the input; the guess is spent on Guess.
    expect(view.element.querySelectorAll(".globe-guess-row")).toHaveLength(0);
    view.element.querySelector<HTMLButtonElement>(".globe-form button[type=submit]")!.click();
    expect(view.element.querySelectorAll(".globe-guess-row")).toHaveLength(1);
    view.dispose();
  });

  it("shows invalid feedback without consuming a guess", async () => {
    const view = renderGlobe(sourceFor(208), 208);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });

    submitCountry(view.element, "Atlantis");

    expect(view.element.textContent).toContain(
      "Choose a country from the list.",
    );
    expect(view.element.querySelectorAll(".globe-guess-row")).toHaveLength(0);
    expect(
      loadGlobeProgress(208, globeAnswer(208, "v1")).guesses,
    ).toHaveLength(0);
    view.dispose();
  });

  it("restores a long accepted guess list after the view is reloaded", async () => {
    const day = 208;
    const answer = globeAnswer(day, "v1");
    const source = sourceFor(day);
    const first = renderGlobe(source, day);
    document.body.append(first.element);
    await vi.waitFor(() => {
      expect(first.element.querySelector(".globe-form")).not.toBeNull();
    });
    for (const country of GLOBE_COUNTRIES.filter(
      (candidate) => candidate.iso !== answer.iso,
    ).slice(0, 15)) {
      submitCountry(first.element, country.name);
    }
    expect(first.element.querySelectorAll(".globe-guess-row")).toHaveLength(15);
    first.dispose();
    first.element.remove();

    const reloaded = renderGlobe(source, day);
    document.body.append(reloaded.element);
    await vi.waitFor(() => {
      expect(
        reloaded.element.querySelectorAll(".globe-guess-row"),
      ).toHaveLength(15);
    });

    expect(loadGlobeProgress(day, answer).guesses).toHaveLength(15);
    expect(
      reloaded.element
        .querySelector(".globe-guess-list")
        ?.getAttribute("tabindex"),
    ).toBe("0");
    reloaded.dispose();
  });

  it("renders distance, direction, and proximity for an accepted guess", async () => {
    const day = 208;
    const answer = globeAnswer(day, "v1");
    const wrong = GLOBE_COUNTRIES.find(
      (country) => country.iso !== answer.iso,
    )!;
    const view = renderGlobe(sourceFor(day), day);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });

    submitCountry(view.element, wrong.name);

    const row = view.element.querySelector<HTMLElement>(".globe-guess-row");
    expect(row?.textContent).toContain(wrong.name);
    expect(row?.textContent).toMatch(/[\d,]+ km/);
    expect(
      row?.querySelector(".globe-direction")?.getAttribute("aria-label"),
    ).toContain("toward the answer");
    expect(row?.style.getPropertyValue("--proximity-mix")).toMatch(/%$/);
    view.dispose();
  });

  it("colours the guessed country on the globe with the list's ramp and turns to it", async () => {
    const day = 208;
    const answer = globeAnswer(day, "v1");
    const wrong = GLOBE_COUNTRIES.find(
      (country) => country.iso !== answer.iso,
    )!;
    const view = renderGlobe(sourceFor(day), day);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });

    const stage = view.element.querySelector(".globe-stage")!;
    const canvas = stage.querySelector("canvas");
    expect(canvas?.parentElement).toBe(stage.firstElementChild);
    expect(
      stage.querySelector(".globe-form")!.compareDocumentPosition(canvas!)
        & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(globeCalls.fills.at(-1)?.size).toBe(0);

    submitCountry(view.element, wrong.name);

    const fills = globeCalls.fills.at(-1)!;
    expect(fills.get(wrong.iso)).toEqual({
      kind: "guess",
      ...proximityRamp(countryDistanceKm(wrong, answer)),
    });
    expect(fills.has(answer.iso)).toBe(false);
    expect(globeCalls.focus.at(-1)).toEqual(wrong);
    expect(canvas?.getAttribute("aria-label")).toContain(wrong.name);
    // The same canvas survives the re-render, so rotation is not lost.
    expect(view.element.querySelector("canvas")).toBe(canvas);

    submitCountry(view.element, answer.name);
    expect(globeCalls.fills.at(-1)?.get(answer.iso)).toEqual({ kind: "answer" });
    expect(globeCalls.focus.at(-1)).toEqual(answer);
    view.dispose();
  });

  it("records one completion with guesses used as the score", async () => {
    const day = 208;
    const answer = globeAnswer(day, "v1");
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const view = renderGlobe(sourceFor(day, 0n, record), day);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-form")).not.toBeNull();
    });

    submitCountry(view.element, answer.name);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("Score recorded.");
    });

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(3, day, 1, true);
    // One guess, in the best bucket with two others (the player is one of the
    // three counted): top 33% of three.
    await vi.waitFor(() => {
      expect(view.element.querySelector("[data-result-rank-tile] .result-tile-value")?.textContent).toBe("33%");
    });
    expect(view.element.querySelector("[data-distribution-total]")?.textContent).toBe("3 finished today");
    expect(view.element.querySelector("[data-result-subline]")?.textContent).toBe(
      `1 guess · the country was ${answer.name}`,
    );
    expect(view.element.querySelector(".game-heading")?.hasAttribute("hidden")).toBe(true);
    expect(view.element.querySelector(".globe-form")).toBeNull();
    expect(record).toHaveBeenCalledOnce();
    view.dispose();
  });

  it("reopens a day finished on this device with its result, though the chain says recorded", async () => {
    const day = 208;
    const answer = globeAnswer(day, "v1");
    const first = renderGlobe(sourceFor(day), day);
    document.body.append(first.element);
    await vi.waitFor(() => {
      expect(first.element.querySelector(".globe-form")).not.toBeNull();
    });
    submitCountry(first.element, answer.name);
    await vi.waitFor(() => {
      expect(first.element.textContent).toContain("Score recorded.");
    });
    first.dispose();

    // The local copy is the history: the reopened day shows the result, not a read-only line.
    const record = vi.fn<DataSource["record"]>(async () => undefined);
    const reopened = renderGlobe(sourceFor(day, 1n << 3n, record), day);
    document.body.append(reopened.element);
    await vi.waitFor(() => {
      expect(reopened.element.querySelector("[data-result-headline]")).not.toBeNull();
    });
    expect(reopened.element.classList.contains("page--result")).toBe(true);
    expect(record).not.toHaveBeenCalled();
    reopened.dispose();
  });

  it("opens a recorded day read-only without another write", async () => {
    const record = vi.fn<DataSource["record"]>(async () => {
      throw new Error("record must not be called");
    });
    const view = renderGlobe(sourceFor(208, 1n << 3n, record), 100);
    document.body.append(view.element);
    await vi.waitFor(() => {
      expect(view.element.textContent).toContain("You already played this");
    });

    expect(headerTitle()).toBe("Globe · Day 100");
    expect(view.element.querySelector(".globe-form")).toBeNull();
    expect(view.element.textContent).toContain(
      `Answer: ${globeAnswer(100, "v1").name}.`,
    );
    expect(record).not.toHaveBeenCalled();
    view.dispose();
  });

  it("carries data-game, names the game on <html>, and ends with the rule line", async () => {
    const view = renderGlobe(sourceFor(208), 208);
    document.body.append(view.element);
    expect(view.element.dataset.game).toBe("globe");
    // The header reads the open game from <html> (decision 9); dispose clears it.
    expect(document.documentElement.dataset.game).toBe("globe");
    await vi.waitFor(() => {
      expect(view.element.querySelector(".globe-stage")).not.toBeNull();
    });
    const rule = view.element.querySelector<HTMLElement>(".game-rule");
    expect(rule?.hidden).toBe(false);
    expect(rule?.querySelector("svg")).not.toBeNull();
    expect(view.element.lastElementChild).toBe(rule);
    view.dispose();
    expect(document.documentElement.dataset.game).toBeUndefined();
    view.element.remove();
  });
});
