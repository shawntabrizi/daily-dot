import type { ViewHandle } from "../../home";
import type { DataSource } from "../../shared/data-source";
import { gameById, gameIdOf } from "../../shared/roster";
import { hasGameBit } from "../../shared/streaks";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import {
  countryDistanceKm,
  directionTo,
  proximityRamp,
} from "./geography";
import {
  GLOBE_COUNTRIES,
  globeAnswer,
  type Country,
} from "./generate";
import { countryFills, createGlobe, type GlobeHandle } from "./globe";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "./projection";
import {
  applyGlobeGuess,
  countryByIso,
  loadGlobeProgress,
  prepareGlobeSubmissionRetry,
  saveGlobeProgress,
  submitGlobeOnce,
  type GlobeProgress,
} from "./progress";

function completionMessage(
  progress: GlobeProgress,
  _answer: Country,
  alreadyRecorded: boolean,
): string {
  if (alreadyRecorded) {
    return "";
  }

  const result =
    `Solved in ${progress.guesses.length} `
    + `${progress.guesses.length === 1 ? "guess" : "guesses"}.`;
  if (progress.submission === "submitted") {
    return `${result} Score recorded.`;
  }
  if (progress.submission === "submitting") {
    return `${result} Recording your score…`;
  }
  if (progress.submission === "deferred") {
    return `${result} Your result is safe on this device. Open Daily on Dot in the Polkadot app to record it.`;
  }
  if (progress.submission === "failed") {
    return `${result} Your result is safe on this device. Recording failed.`;
  }
  return result;
}

function createGuessRow(guess: Country, answer: Country): HTMLElement {
  const distance = countryDistanceKm(guess, answer);
  const direction = directionTo(guess, answer);
  const ramp = proximityRamp(distance);
  const row = document.createElement("article");
  row.className =
    `globe-guess-row globe-guess-row--${ramp.segment}`;
  row.style.setProperty("--proximity-mix", `${ramp.mix.toFixed(2)}%`);

  const identity = document.createElement("div");
  identity.className = "globe-guess-country";
  const name = document.createElement("strong");
  name.textContent = guess.name;
  const continent = document.createElement("span");
  continent.textContent = guess.continent;
  identity.append(name, continent);

  const kilometres = document.createElement("strong");
  kilometres.className = "globe-distance";
  kilometres.textContent = `${Math.round(distance).toLocaleString("en")} km`;

  const arrow = document.createElement("span");
  arrow.className = "globe-direction";
  arrow.textContent = direction.arrow;
  arrow.setAttribute(
    "aria-label",
    direction.label === "the answer"
      ? "This country is the answer"
      : `${direction.label} toward the answer`,
  );
  arrow.title = arrow.getAttribute("aria-label") ?? "";

  row.append(identity, kilometres, arrow);
  return row;
}

function createCountryOptions(): HTMLDataListElement {
  const datalist = document.createElement("datalist");
  datalist.id = "globe-country-options";
  for (const country of GLOBE_COUNTRIES) {
    const option = document.createElement("option");
    option.value = country.name;
    datalist.append(option);
  }
  return datalist;
}

export function renderGlobe(
  source: DataSource,
  requestedDay?: number,
): ViewHandle {
  const page = document.createElement("section");
  page.className = "page globe-page";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Find the country.</h1>
      </div>
    </div>
    <div class="globe-shell" data-globe-shell>
      <div class="game-loading">Loading today's country…</div>
    </div>
  `;
  page.dataset.game = "globe";
  document.documentElement.dataset.game = "globe";
  const gameRule = createGameRule("Guess a country. Distance and direction guide you.");
  page.append(gameRule);

  const shell = page.querySelector<HTMLElement>("[data-globe-shell]");
  if (!shell) {
    throw new Error("Globe shell failed to render");
  }

  let disposed = false;
  let progress: GlobeProgress | null = null;
  let answer: Country | null = null;
  let alreadyRecorded = false;
  let today = 0;
  const resultPanel = createResultPanel(source, gameById("globe")!, { unit: "guess" });
  let loadRequest = 0;
  let globe: GlobeHandle | null = null;
  let globeBox: HTMLElement | null = null;
  let globeCanvas: HTMLCanvasElement | null = null;
  let focusedIso: string | null = null;

  // One canvas for the life of the view: re-renders move it, so the player's
  // rotation and the drawn frame survive each guess.
  const ensureGlobe = (): HTMLElement => {
    if (globeBox && globeCanvas && globe) {
      return globeBox;
    }
    globeBox = document.createElement("div");
    globeBox.className = "globe-globe";
    globeCanvas = document.createElement("canvas");
    globeCanvas.setAttribute("role", "img");
    // Buttons for keyboard and mouse users; touch pinches, the wheel zooms.
    const zoomControls = document.createElement("div");
    zoomControls.className = "globe-zoom";
    const zoomIn = document.createElement("button");
    zoomIn.className = "icon-button";
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "Zoom in");
    const zoomOut = document.createElement("button");
    zoomOut.className = "icon-button";
    zoomOut.type = "button";
    zoomOut.textContent = "−";
    zoomOut.setAttribute("aria-label", "Zoom out");
    zoomControls.append(zoomIn, zoomOut);
    globeBox.append(globeCanvas, zoomControls);
    const showZoom = (zoom: number): void => {
      zoomIn.disabled = zoom >= ZOOM_MAX;
      zoomOut.disabled = zoom <= ZOOM_MIN;
    };
    const handle = createGlobe(globeCanvas, GLOBE_COUNTRIES, { onZoom: showZoom });
    zoomIn.addEventListener("click", () => handle.setZoom(handle.zoom() * ZOOM_STEP));
    zoomOut.addEventListener("click", () => handle.setZoom(handle.zoom() / ZOOM_STEP));
    showZoom(handle.zoom());
    globe = handle;
    return globeBox;
  };

  const renderGame = (): void => {
    if (!progress || !answer) {
      return;
    }

    const readOnly = alreadyRecorded || progress.complete;
    gameRule.hidden = readOnly;
    const stage = document.createElement("div");
    stage.className = "globe-stage";
    // The found country earns the accent (decision 1).
    stage.classList.toggle("globe-stage--done", readOnly);

    const guessed = progress.guesses
      .map((identity) => countryByIso(identity))
      .filter((country): country is Country => country !== undefined);
    stage.append(ensureGlobe());
    if (globe && globeCanvas) {
      globe.setFills(countryFills(guessed, answer, readOnly));
      const shown = readOnly ? [...guessed, answer] : guessed;
      globeCanvas.setAttribute(
        "aria-label",
        shown.length === 0
          ? "Globe. No countries marked yet. Drag to rotate, pinch or scroll to zoom."
          : `Globe. Marked: ${shown.map((country) => country.name).join(", ")}. Drag to rotate, pinch or scroll to zoom.`,
      );
      // Turn to the newest guess (or the answer once revealed); the first
      // frame jumps so a restored game opens already centred.
      const target = readOnly ? answer : guessed[guessed.length - 1];
      if (target && target.iso !== focusedIso) {
        globe.focus(target, focusedIso !== null);
        focusedIso = target.iso;
      }
    }

    const meta = document.createElement("div");
    meta.className = "globe-meta";
    const metaLabel = document.createElement("span");
    metaLabel.textContent = "COUNTRY PROXIMITY";
    const metaValue = document.createElement("strong");
    metaValue.textContent =
      `${progress.guesses.length} `
      + `${progress.guesses.length === 1 ? "GUESS" : "GUESSES"}`;
    meta.append(metaLabel, metaValue);
    stage.append(meta);

    if (!readOnly) {
      const form = document.createElement("form");
      form.className = "globe-form";
      const label = document.createElement("label");
      label.htmlFor = "globe-country-input";
      label.textContent = "COUNTRY";
      const inputRow = document.createElement("div");
      inputRow.className = "globe-input-row";
      const input = document.createElement("input");
      input.id = "globe-country-input";
      input.name = "country";
      input.type = "text";
      input.setAttribute("list", "globe-country-options");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocapitalize", "words");
      input.placeholder = "Start typing a country";
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Guess";
      const message = document.createElement("p");
      message.className = "globe-message";
      message.setAttribute("role", "status");
      message.setAttribute("aria-live", "polite");
      message.textContent = "Choose from the country list.";
      inputRow.append(input, submit);
      form.append(label, inputRow, createCountryOptions(), message);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!progress) {
          return;
        }
        const result = applyGlobeGuess(progress, input.value);
        if (!result.accepted) {
          message.textContent = result.message;
          input.setAttribute("aria-invalid", "true");
          input.focus();
          return;
        }

        progress = result.progress;
        saveGlobeProgress(progress);
        renderGame();
        if (progress.complete) {
          void submitGlobeOnce(source, progress)
            .catch(() => undefined)
            .finally(() => {
              if (!disposed) {
                renderGame();
              }
            });
        }
      });
      stage.append(form);
    } else {
      const result = document.createElement("p");
      result.className = "globe-result";
      result.setAttribute("role", "status");
      result.textContent = completionMessage(
        progress,
        answer,
        alreadyRecorded,
      );
      if (alreadyRecorded) {
        result.replaceChildren(
          createPlayedNotice(gameById("globe")!, progress.day, today),
          ` The country was ${answer.name}.`,
        );
      }
      stage.append(result, resultPanel.element);
    }
    // Save from the unsaved result (after Not now): the prompt opens again.
    const finished = progress;
    const onSave = !alreadyRecorded && progress.complete && progress.submission === "pending"
      ? () => {
        void submitGlobeOnce(source, finished)
          .catch(() => undefined)
          .finally(() => {
            if (!disposed) {
              renderGame();
            }
          });
      }
      : undefined;
    const shown = !alreadyRecorded && progress.complete && showsResult(progress.submission);
    resultPanel.update({
      day: progress.day,
      score: progress.guesses.length,
      recorded: shown && progress.submission === "submitted",
      pendingSave: shown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      detail: `the country was ${answer.name}`,
      onSave,
    });
    syncResultChrome(page, gameById("globe")!, progress.day, shown);

    const list = document.createElement("div");
    list.className = "globe-guess-list";
    list.dataset.globeGuesses = "";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Globe guesses");
    if (progress.guesses.length === 0) {
      const empty = document.createElement("p");
      empty.className = "globe-empty";
      empty.textContent = readOnly
        ? `Answer: ${answer.name}.`
        : "Your guesses will appear here.";
      list.append(empty);
    } else {
      for (const identity of progress.guesses) {
        const country = countryByIso(identity);
        if (country) {
          list.append(createGuessRow(country, answer));
        }
      }
    }
    stage.append(list);

    if (
      !alreadyRecorded
      && progress.complete
      && progress.submission === "failed"
    ) {
      const actions = document.createElement("div");
      actions.className = "globe-actions";
      const retry = document.createElement("button");
      retry.className = "button-link button-link--button";
      retry.type = "button";
      retry.textContent = "Try recording again";
      retry.addEventListener("click", () => {
        if (!progress) {
          return;
        }
        prepareGlobeSubmissionRetry(progress);
        renderGame();
        void submitGlobeOnce(source, progress)
          .catch(() => undefined)
          .finally(() => {
            if (!disposed) {
              renderGame();
            }
          });
      });
      actions.append(retry);
      stage.append(actions);
    }

    shell.replaceChildren(stage);
    list.scrollTop = list.scrollHeight;
  };

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    gameRule.hidden = true;
    shell.innerHTML =
      '<div class="game-loading">Loading today\'s country…</div>';

    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      const generated = globeAnswer(day, "v1");
      const bits = await source.dayBits(day);
      if (disposed || request !== loadRequest) {
        return;
      }

      setHeaderGame(gameById("globe")!, day);
      answer = generated;
      progress = loadGlobeProgress(day, answer);
      // A day finished on this device shows from its local copy; the chain
      // only confirms the record. A recorded day with no local copy opens read-only.
      const onChain = hasGameBit(bits.played, gameIdOf("globe"));
      if (onChain && progress.complete) {
        progress.submission = "submitted";
      }
      alreadyRecorded = onChain && !progress.complete;
      renderGame();

      if (
        progress.complete
        && (progress.submission === "pending"
          || progress.submission === "deferred")
        && !alreadyRecorded
      ) {
        try {
          await submitGlobeOnce(source, progress);
        } catch {
          // Reload recovery follows the same local-first completion path.
        }
        if (!disposed) {
          renderGame();
        }
      }
    } catch (error) {
      if (!disposed && request === loadRequest) {
        const failure = document.createElement("div");
        failure.className = "game-error";
        const heading = document.createElement("strong");
        heading.textContent = "Country unavailable";
        const message = document.createElement("p");
        message.textContent =
          error instanceof Error ? error.message : "Please try again.";
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try again";
        retry.addEventListener("click", () => void loadGame());
        const back = document.createElement("a");
        back.className = "button-link game-error-back";
        back.href = "#/";
        back.textContent = "Back to home";
        failure.append(heading, message, retry, back);
        shell.replaceChildren(failure);
      }
    }
  };
  void loadGame();

  return {
    element: page,
    dispose() {
      disposed = true;
      loadRequest += 1;
      globe?.dispose();
      if (document.documentElement.dataset.game === "globe") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
