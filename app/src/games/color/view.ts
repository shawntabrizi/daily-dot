import type { ViewHandle } from "../../home";
import type { DataSource } from "../../shared/data-source";
import { formatPoints } from "../../shared/percentile";
import { gameById, gameIdOf } from "../../shared/roster";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { hasGameBit } from "../../shared/streaks";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import { HUE_MAX, hsbCss, inkFor, PERCENT_MAX, roundScore, ROUNDS, type Hsb } from "./engine";
import { colorAnswer } from "./generate";
import {
  applyColorGuess,
  colorScore,
  loadColorProgress,
  prepareColorSubmissionRetry,
  saveColorProgress,
  submitColorOnce,
  type ColorProgress,
} from "./progress";

const GAME = gameById("color")!;
/** How long each colour is shown before it hides. */
export const LOOK_SECONDS = 5;
/** Where every colour's sliders start: the middle of each, so the start says nothing. */
const START_PICK: Hsb = { hue: 180, saturation: 50, brightness: 50 };

type Channel = keyof Hsb;

interface ChannelSpec {
  channel: Channel;
  label: string;
  max: number;
  text(value: number): string;
  /** The column's gradient, bottom (0) to top (max), around the current pick. */
  gradient(pick: Hsb): string;
}

const CHANNELS: readonly ChannelSpec[] = [
  {
    channel: "hue",
    label: "Hue",
    max: HUE_MAX,
    text: (value) => `Hue ${value}°`,
    // HSB is linear in RGB between the 60° primaries, so these stops draw it exactly.
    gradient: (pick) =>
      `linear-gradient(to top, ${[0, 60, 120, 180, 240, 300, 359]
        .map((hue) => `${hsbCss({ ...pick, hue })} ${((hue / HUE_MAX) * 100).toFixed(2)}%`)
        .join(", ")})`,
  },
  {
    channel: "saturation",
    label: "Saturation",
    max: PERCENT_MAX,
    text: (value) => `Saturation ${value}%`,
    gradient: (pick) =>
      `linear-gradient(to top, ${hsbCss({ ...pick, saturation: 0 })}, ${hsbCss({ ...pick, saturation: 100 })})`,
  },
  {
    channel: "brightness",
    label: "Brightness",
    max: PERCENT_MAX,
    text: (value) => `Brightness ${value}%`,
    gradient: (pick) =>
      `linear-gradient(to top, ${hsbCss({ ...pick, brightness: 0 })}, ${hsbCss({ ...pick, brightness: 100 })})`,
  },
];

function hsbText(colour: Hsb): string {
  return `H ${colour.hue}° S ${colour.saturation}% B ${colour.brightness}%`;
}

function paint(element: HTMLElement, colour: Hsb): void {
  element.style.background = hsbCss(colour);
  element.dataset.ink = inkFor(colour);
}

function statusFor(progress: ColorProgress): string {
  const result = `${formatPoints(colorScore(progress))} of 50 points.`;
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

interface SliderHandle {
  element: HTMLElement;
  sync(pick: Hsb): void;
}

/**
 * One vertical slider column: a real `role="slider"` control, dragged by
 * touch or mouse (pointer capture, no page scroll) and moved by the arrow
 * keys, Page Up/Down (10) and Home/End.
 */
function createSlider(spec: ChannelSpec, onChange: (value: number) => void): SliderHandle {
  const slider = document.createElement("div");
  slider.className = "color-slider";
  slider.dataset.colorSlider = spec.channel;
  slider.tabIndex = 0;
  slider.setAttribute("role", "slider");
  slider.setAttribute("aria-label", spec.label);
  slider.setAttribute("aria-orientation", "vertical");
  slider.setAttribute("aria-valuemin", "0");
  slider.setAttribute("aria-valuemax", String(spec.max));
  const thumb = document.createElement("span");
  thumb.className = "color-slider-thumb";
  thumb.setAttribute("aria-hidden", "true");
  slider.append(thumb);

  let value = 0;
  const set = (next: number): void => {
    const clamped = Math.min(spec.max, Math.max(0, Math.round(next)));
    if (clamped !== value) {
      onChange(clamped);
    }
  };
  const fromPointer = (clientY: number): void => {
    const rect = slider.getBoundingClientRect();
    if (rect.height <= 0) {
      return;
    }
    set((1 - (clientY - rect.top) / rect.height) * spec.max);
  };

  let dragging: number | null = null;
  slider.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = event.pointerId;
    slider.setPointerCapture?.(event.pointerId);
    slider.focus();
    fromPointer(event.clientY);
  });
  slider.addEventListener("pointermove", (event) => {
    if (dragging === event.pointerId) {
      fromPointer(event.clientY);
    }
  });
  const release = (event: PointerEvent): void => {
    if (dragging === event.pointerId) {
      dragging = null;
    }
  };
  slider.addEventListener("pointerup", release);
  slider.addEventListener("pointercancel", release);
  slider.addEventListener("keydown", (event) => {
    const step: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    if (event.key in step) {
      set(value + step[event.key]!);
    } else if (event.key === "Home") {
      set(0);
    } else if (event.key === "End") {
      set(spec.max);
    } else {
      return;
    }
    event.preventDefault();
  });

  return {
    element: slider,
    sync(pick) {
      value = pick[spec.channel];
      slider.setAttribute("aria-valuenow", String(value));
      slider.setAttribute("aria-valuetext", spec.text(value));
      slider.style.background = spec.gradient(pick);
      slider.style.setProperty("--at", String(value / spec.max));
    },
  };
}

function createPair(target: Hsb, guess: Hsb | null, index: number): HTMLElement {
  const item = document.createElement("li");
  item.className = "color-pair";
  item.dataset.colorPair = String(index);
  const swatches = document.createElement("span");
  swatches.className = "color-pair-swatches";
  const shown = document.createElement("span");
  shown.className = "color-pair-swatch";
  paint(shown, target);
  shown.setAttribute("aria-label", `Colour ${index + 1}: ${hsbText(target)}`);
  shown.setAttribute("role", "img");
  swatches.append(shown);
  if (guess) {
    const yours = document.createElement("span");
    yours.className = "color-pair-swatch";
    paint(yours, guess);
    yours.setAttribute("aria-label", `Yours: ${hsbText(guess)}`);
    yours.setAttribute("role", "img");
    swatches.append(yours);
  }
  item.append(swatches);
  if (guess) {
    const score = document.createElement("strong");
    score.className = "color-pair-score";
    score.textContent = formatPoints(roundScore(target, guess));
    item.append(score);
  }
  return item;
}

export function renderColor(source: DataSource, requestedDay?: number): ViewHandle {
  const page = document.createElement("section");
  page.className = "page color-page";
  page.dataset.game = "color";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Remember the colour.</h1>
      </div>
    </div>
    <div class="color-shell" data-color-shell>
      <div class="game-loading">Loading today's colours…</div>
    </div>
  `;
  document.documentElement.dataset.game = "color";
  const gameRule = createGameRule(
    `Each colour shows for ${LOOK_SECONDS} seconds. Rebuild it from hue, saturation and brightness: up to 10 points a colour.`,
  );
  page.append(gameRule);
  const shell = page.querySelector<HTMLElement>("[data-color-shell]")!;

  let disposed = false;
  let targets: Hsb[] | null = null;
  let progress: ColorProgress | null = null;
  let alreadyRecorded = false;
  let today = 0;
  let loadRequest = 0;
  /** The round in hand: shown (look), being rebuilt (pick), or just scored (reveal). */
  let phase: "look" | "pick" | "reveal" | "done" = "look";
  let remaining = LOOK_SECONDS;
  let timer: number | null = null;
  let pick: Hsb = { ...START_PICK };
  const resultPanel = createResultPanel(source, GAME);

  const stopTimer = (): void => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const startLook = (): void => {
    stopTimer();
    phase = "look";
    remaining = LOOK_SECONDS;
    pick = { ...START_PICK };
    timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        const countdown = shell.querySelector<HTMLElement>("[data-color-countdown]");
        if (countdown) {
          countdown.textContent = String(remaining);
        }
        return;
      }
      stopTimer();
      phase = "pick";
      renderGame();
      shell.querySelector<HTMLElement>("[data-color-slider]")?.focus();
    }, 1_000);
  };

  const submitAndRender = (): void => {
    if (!progress) {
      return;
    }
    void submitColorOnce(source, progress)
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          renderGame();
        }
      });
  };

  const meta = (round: number): HTMLElement => {
    const row = document.createElement("div");
    row.className = "color-meta";
    const which = document.createElement("span");
    which.dataset.colorRound = String(round + 1);
    which.textContent = `Colour ${round + 1} of ${ROUNDS}`;
    const total = document.createElement("span");
    total.dataset.colorTotal = "";
    total.textContent = `${formatPoints(colorScore(progress!))} points`;
    row.append(which, total);
    return row;
  };

  const lookBoard = (round: number): HTMLElement => {
    const board = document.createElement("div");
    board.className = "color-board color-board--look";
    board.dataset.colorPhase = "look";
    board.setAttribute("role", "img");
    board.setAttribute("aria-label", `Colour ${round + 1} of ${ROUNDS}. Remember it; it hides in ${LOOK_SECONDS} seconds.`);
    paint(board, targets![round]!);
    const countdown = document.createElement("span");
    countdown.className = "color-countdown";
    countdown.dataset.colorCountdown = "";
    countdown.setAttribute("aria-hidden", "true");
    countdown.textContent = String(remaining);
    const note = document.createElement("span");
    note.className = "color-board-note";
    note.setAttribute("aria-hidden", "true");
    note.textContent = "Remember this colour";
    board.append(countdown, note);
    return board;
  };

  const pickBoard = (): HTMLElement => {
    const board = document.createElement("div");
    board.className = "color-board color-board--pick";
    board.dataset.colorPhase = "pick";
    const sliders = document.createElement("div");
    sliders.className = "color-sliders";
    const handles: SliderHandle[] = [];
    const sync = (): void => {
      paint(board, pick);
      for (const handle of handles) {
        handle.sync(pick);
      }
    };
    for (const spec of CHANNELS) {
      const handle = createSlider(spec, (value) => {
        pick = { ...pick, [spec.channel]: value };
        sync();
      });
      handles.push(handle);
      sliders.append(handle.element);
    }
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "color-submit";
    submit.dataset.colorSubmit = "";
    submit.textContent = "Submit";
    submit.addEventListener("click", () => {
      if (!progress || progress.complete) {
        return;
      }
      progress = applyColorGuess(progress, pick);
      saveColorProgress(progress);
      phase = "reveal";
      renderGame();
      shell.querySelector<HTMLElement>("[data-color-next]")?.focus();
    });
    board.append(sliders, submit);
    sync();
    return board;
  };

  const revealBoard = (round: number): HTMLElement[] => {
    const target = targets![round]!;
    const guess = progress!.guesses[round]!;
    const board = document.createElement("div");
    board.className = "color-board color-board--reveal";
    board.dataset.colorPhase = "reveal";
    const half = (colour: Hsb, label: string): HTMLElement => {
      const element = document.createElement("div");
      element.className = "color-half";
      paint(element, colour);
      const name = document.createElement("strong");
      name.textContent = label;
      const values = document.createElement("span");
      values.textContent = hsbText(colour);
      element.append(name, values);
      return element;
    };
    const score = document.createElement("p");
    score.className = "color-reveal-score";
    score.dataset.colorRoundScore = String(roundScore(target, guess));
    score.setAttribute("role", "status");
    const value = document.createElement("strong");
    value.textContent = formatPoints(roundScore(target, guess));
    score.append(value, " / 10");
    board.append(half(target, "Colour"), half(guess, "Yours"), score);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "color-next";
    next.dataset.colorNext = "";
    const last = round === ROUNDS - 1;
    next.textContent = last ? "See your total" : "Next colour";
    next.addEventListener("click", () => {
      if (!progress) {
        return;
      }
      if (progress.complete) {
        phase = "done";
        renderGame();
        submitAndRender();
      } else {
        startLook();
        renderGame();
      }
    });
    return [board, next];
  };

  const summary = (): HTMLElement => {
    const box = document.createElement("div");
    box.className = "color-summary";
    const total = document.createElement("p");
    total.className = "color-final";
    if (alreadyRecorded) {
      total.textContent = "Today's colours";
    } else {
      const value = document.createElement("strong");
      value.dataset.colorFinal = String(colorScore(progress!));
      value.textContent = formatPoints(colorScore(progress!));
      total.append(value, " / 50");
    }
    const list = document.createElement("ol");
    list.className = "color-pairs";
    list.setAttribute("aria-label", alreadyRecorded ? "The day's colours" : "The colours and yours");
    targets!.forEach((target, index) => {
      list.append(createPair(target, alreadyRecorded ? null : (progress!.guesses[index] ?? null), index));
    });
    box.append(total, list);
    return box;
  };

  const renderGame = (): void => {
    if (!progress || !targets) {
      return;
    }
    const finished = alreadyRecorded || (progress.complete && phase === "done");
    gameRule.hidden = finished;
    const stage = document.createElement("div");
    stage.className = "color-stage";
    stage.classList.toggle("color-stage--done", finished);

    if (finished) {
      stage.append(summary());
      const result = document.createElement("p");
      result.className = "color-result";
      result.setAttribute("role", "status");
      if (alreadyRecorded) {
        result.replaceChildren(createPlayedNotice(GAME, progress.day, today));
      } else {
        result.textContent = statusFor(progress);
      }
      stage.append(result, resultPanel.element);
      if (!alreadyRecorded && progress.submission === "failed") {
        const retry = document.createElement("button");
        retry.className = "button-link button-link--button";
        retry.type = "button";
        retry.textContent = "Try recording again";
        retry.addEventListener("click", () => {
          if (!progress) {
            return;
          }
          prepareColorSubmissionRetry(progress);
          renderGame();
          submitAndRender();
        });
        stage.append(retry);
      }
    } else if (phase === "reveal") {
      const round = progress.guesses.length - 1;
      stage.append(meta(round), ...revealBoard(round));
    } else {
      const round = progress.guesses.length;
      stage.append(meta(round), phase === "look" ? lookBoard(round) : pickBoard());
    }

    const onSave = finished && !alreadyRecorded && progress.submission === "pending"
      ? submitAndRender
      : undefined;
    const shown = finished && !alreadyRecorded && showsResult(progress.submission);
    resultPanel.update({
      day: progress.day,
      score: colorScore(progress),
      recorded: shown && progress.submission === "submitted",
      pendingSave: shown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      detail: "out of 50",
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
      const generated = colorAnswer(day, "v1");
      const bits = await source.dayBits(day);
      if (disposed || request !== loadRequest) {
        return;
      }
      setHeaderGame(GAME, day);
      targets = generated;
      progress = loadColorProgress(day, generated);
      // A day finished on this device shows from its local copy; the chain only
      // confirms the record. A recorded day with no local copy opens read-only.
      const onChain = hasGameBit(bits.played, gameIdOf("color"));
      if (onChain && progress.complete) {
        progress.submission = "submitted";
      }
      alreadyRecorded = onChain && !progress.complete;
      if (progress.complete || alreadyRecorded) {
        phase = "done";
      } else {
        // A reload mid-round shows that colour again from the start (D1).
        startLook();
      }
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
        heading.textContent = "Color unavailable";
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
      stopTimer();
      if (document.documentElement.dataset.game === "color") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
