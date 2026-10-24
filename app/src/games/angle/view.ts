import type { ViewHandle } from "../../home";
import type { DataSource } from "../../shared/data-source";
import { gameById, gameIdOf } from "../../shared/roster";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { hasGameBit } from "../../shared/streaks";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import { HEAT_MARKS, HEAT_WORDS, hintFor, MAX_ANGLE, MIN_ANGLE } from "./engine";
import { angleAnswer, type AnglePuzzle } from "./generate";
import {
  applyAngleGuess,
  loadAngleProgress,
  prepareAngleSubmissionRetry,
  saveAngleProgress,
  submitAngleOnce,
  type AngleProgress,
} from "./progress";

const GAME = gameById("angle")!;
const SIZE = 240;
const CENTER = SIZE / 2;
const RAY = 104;
const ARC = 30;

function xy(radius: number, degrees: number): [string, string] {
  const radians = (degrees * Math.PI) / 180;
  // SVG's y grows downward: counterclockwise on screen subtracts.
  return [(CENTER + radius * Math.cos(radians)).toFixed(2), (CENTER - radius * Math.sin(radians)).toFixed(2)];
}

function point(radius: number, degrees: number): string {
  return xy(radius, degrees).join(" ");
}

/**
 * The two rays from the vertex and the marked arc between them, swept
 * counterclockwise from the first ray, so a reflex angle is marked the long
 * way round. The value itself is never in the drawing.
 */
export function angleSvg(puzzle: AnglePuzzle): string {
  const start = puzzle.rotation;
  const end = puzzle.rotation + puzzle.degrees;
  const large = puzzle.degrees > 180 ? 1 : 0;
  const wedge = `M ${CENTER} ${CENTER} L ${point(ARC, start)} A ${ARC} ${ARC} 0 ${large} 0 ${point(ARC, end)} Z`;
  const [x1, y1] = xy(RAY, start);
  const [x2, y2] = xy(RAY, end);
  return `
    <svg class="angle-figure" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="The day's angle: two rays from a point with the angle between them marked">
      <circle cx="${CENTER}" cy="${CENTER}" r="${RAY}" class="angle-dial"/>
      <path d="${wedge}" class="angle-wedge"/>
      <line x1="${CENTER}" y1="${CENTER}" x2="${x1}" y2="${y1}" class="angle-ray"/>
      <line x1="${CENTER}" y1="${CENTER}" x2="${x2}" y2="${y2}" class="angle-ray"/>
      <circle cx="${CENTER}" cy="${CENTER}" r="4" class="angle-vertex"/>
    </svg>
  `;
}

function statusFor(progress: AngleProgress, alreadyRecorded: boolean): string {
  if (alreadyRecorded) {
    return "";
  }
  const result = `Found in ${progress.guesses.length} ${progress.guesses.length === 1 ? "guess" : "guesses"}.`;
  switch (progress.submission) {
    case "submitted":
      return `${result} Score recorded.`;
    case "submitting":
      return `${result} Recording your score…`;
    case "deferred":
      return `${result} Your result is safe on this device. Open Daily on Dot in the Polkadot app to record it.`;
    case "failed":
      return `${result} Your result is safe on this device. Recording failed.`;
    default:
      return result;
  }
}

function createGuessRow(guess: number, answer: number): HTMLElement {
  const hint = hintFor(guess, answer);
  const row = document.createElement("li");
  row.className = `angle-row angle-row--${hint.heat}`;
  row.dataset.angleGuess = String(guess);
  row.dataset.heat = hint.heat;
  const value = document.createElement("strong");
  value.className = "angle-row-value";
  value.textContent = `${guess}°`;
  const heat = document.createElement("span");
  heat.className = "angle-row-heat";
  heat.textContent = `${HEAT_MARKS[hint.heat]} ${HEAT_WORDS[hint.heat]}`;
  const arrow = document.createElement("span");
  arrow.className = "angle-row-arrow";
  arrow.textContent = hint.direction === "up" ? "⬆️" : hint.direction === "down" ? "⬇️" : "";
  arrow.setAttribute(
    "aria-label",
    hint.direction === "up" ? "The angle is larger" : hint.direction === "down" ? "The angle is smaller" : "Exact",
  );
  row.append(value, heat, arrow);
  return row;
}

export function renderAngle(source: DataSource, requestedDay?: number): ViewHandle {
  const page = document.createElement("section");
  page.className = "page angle-page";
  page.dataset.game = "angle";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Name the angle.</h1>
      </div>
    </div>
    <div class="angle-shell" data-angle-shell>
      <div class="game-loading">Loading today's angle…</div>
    </div>
  `;
  document.documentElement.dataset.game = "angle";
  const gameRule = createGameRule("Guess the marked angle in whole degrees. Hot and cold, and an arrow, guide you.");
  page.append(gameRule);
  const shell = page.querySelector<HTMLElement>("[data-angle-shell]")!;

  let disposed = false;
  let puzzle: AnglePuzzle | null = null;
  let progress: AngleProgress | null = null;
  let alreadyRecorded = false;
  let today = 0;
  let loadRequest = 0;
  const resultPanel = createResultPanel(source, GAME, { unit: "guess" });

  const submitAndRender = (): void => {
    if (!progress) {
      return;
    }
    void submitAngleOnce(source, progress)
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          renderGame();
        }
      });
  };

  const renderGame = (message = ""): void => {
    if (!progress || !puzzle) {
      return;
    }
    const readOnly = alreadyRecorded || progress.complete;
    gameRule.hidden = readOnly;
    const stage = document.createElement("div");
    stage.className = "angle-stage";
    stage.classList.toggle("angle-stage--done", readOnly);

    const figure = document.createElement("div");
    figure.className = "angle-figure-box";
    figure.innerHTML = angleSvg(puzzle);
    if (readOnly) {
      const label = document.createElement("span");
      label.className = "angle-answer";
      label.textContent = `${puzzle.degrees}°`;
      figure.append(label);
    }
    stage.append(figure);

    if (!readOnly) {
      const form = document.createElement("form");
      form.className = "angle-form";
      // The game's own message, not the webview's validation bubble.
      form.noValidate = true;
      const label = document.createElement("label");
      label.htmlFor = "angle-input";
      label.className = "angle-label";
      label.textContent = "DEGREES";
      const row = document.createElement("div");
      row.className = "angle-input-row";
      const input = document.createElement("input");
      input.id = "angle-input";
      input.name = "degrees";
      input.type = "number";
      input.inputMode = "numeric";
      input.min = String(MIN_ANGLE);
      input.max = String(MAX_ANGLE);
      input.step = "1";
      input.placeholder = `${MIN_ANGLE}–${MAX_ANGLE}`;
      input.setAttribute("autocomplete", "off");
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Guess";
      const status = document.createElement("p");
      status.className = "angle-message";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent = message;
      row.append(input, submit);
      form.append(label, row, status);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!progress) {
          return;
        }
        const value = input.value.trim() === "" ? Number.NaN : Number(input.value);
        const result = applyAngleGuess(progress, value);
        if (!result.accepted) {
          renderGame(result.message);
          document.querySelector<HTMLInputElement>("#angle-input")?.focus();
          return;
        }
        progress = result.progress;
        saveAngleProgress(progress);
        renderGame();
        if (progress.complete) {
          submitAndRender();
        } else {
          document.querySelector<HTMLInputElement>("#angle-input")?.focus();
        }
      });
      stage.append(form);
    } else {
      const result = document.createElement("p");
      result.className = "angle-result";
      result.setAttribute("role", "status");
      result.textContent = statusFor(progress, alreadyRecorded);
      if (alreadyRecorded) {
        result.replaceChildren(
          createPlayedNotice(GAME, progress.day, today),
          ` The angle was ${puzzle.degrees}°.`,
        );
      }
      stage.append(result, resultPanel.element);
      if (!alreadyRecorded && progress.complete && progress.submission === "failed") {
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try recording again";
        retry.addEventListener("click", () => {
          if (!progress) {
            return;
          }
          prepareAngleSubmissionRetry(progress);
          renderGame();
          submitAndRender();
        });
        stage.append(retry);
      }
    }

    const list = document.createElement("ol");
    list.className = "angle-list";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Your guesses");
    if (progress.guesses.length === 0) {
      const empty = document.createElement("li");
      empty.className = "angle-empty";
      empty.textContent = readOnly ? `The angle was ${puzzle.degrees}°.` : "Tip: 180° tells you at once whether it is reflex.";
      list.append(empty);
    } else {
      // Newest first: the last hint is the one the next guess needs.
      for (const guess of [...progress.guesses].reverse()) {
        list.append(createGuessRow(guess, progress.answer));
      }
    }
    stage.append(list);

    const onSave = !alreadyRecorded && progress.complete && progress.submission === "pending"
      ? submitAndRender
      : undefined;
    const shown = !alreadyRecorded && progress.complete && showsResult(progress.submission);
    resultPanel.update({
      day: progress.day,
      score: progress.guesses.length,
      recorded: shown && progress.submission === "submitted",
      pendingSave: shown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      detail: `the angle was ${puzzle.degrees}°`,
      onSave,
    });
    syncResultChrome(page, GAME, progress.day, shown);

    shell.replaceChildren(stage);
  };

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    gameRule.hidden = true;
    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      const generated = angleAnswer(day, "v1");
      const bits = await source.dayBits(day);
      if (disposed || request !== loadRequest) {
        return;
      }
      setHeaderGame(GAME, day);
      puzzle = generated;
      progress = loadAngleProgress(day, generated.degrees);
      // A day finished on this device shows from its local copy; the chain only
      // confirms the record. A recorded day with no local copy opens read-only.
      const onChain = hasGameBit(bits.played, gameIdOf("angle"));
      if (onChain && progress.complete) {
        progress.submission = "submitted";
      }
      alreadyRecorded = onChain && !progress.complete;
      renderGame();
      if (
        progress.complete
        && (progress.submission === "pending" || progress.submission === "deferred")
        && !alreadyRecorded
      ) {
        submitAndRender();
      }
    } catch (error) {
      if (!disposed && request === loadRequest) {
        const failure = document.createElement("div");
        failure.className = "game-error";
        const heading = document.createElement("strong");
        heading.textContent = "Angle unavailable";
        const text = document.createElement("p");
        text.textContent = error instanceof Error ? error.message : "Please try again.";
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try again";
        retry.addEventListener("click", () => void loadGame());
        const back = document.createElement("a");
        back.className = "button-link game-error-back";
        back.href = "#/";
        back.textContent = "Back to home";
        failure.append(heading, text, retry, back);
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
      if (document.documentElement.dataset.game === "angle") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
