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
import { audioSupported, ensureAudio, playTone, startTone, TONE_SECONDS, type LiveTone } from "./audio";
import {
  centsToHz,
  clampCents,
  formatHundredths,
  formatHz,
  MAX_CENTS,
  MAX_HZ,
  MIN_HZ,
  positionToCents,
  ROUNDS,
  toneScore,
  verdictFor,
} from "./engine";
import { soundAnswer } from "./generate";
import {
  applySoundGuess,
  loadSoundProgress,
  prepareSoundSubmissionRetry,
  saveSoundProgress,
  soundHundredths,
  soundScore,
  submitSoundOnce,
  type SoundProgress,
} from "./progress";

const GAME = gameById("sound")!;
/** Where every tone's pitch starts: the middle of the range, so the start says nothing. */
const START_CENTS = MAX_CENTS / 2;
/** Arrow keys move one cent; with Shift (or Page Up/Down) fifty. */
const FINE_CENTS = 1;
const COARSE_CENTS = 50;
/** How long a key press keeps the tone sounding after the last press. */
const KEY_TONE_MS = 600;

const SPEAKER =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.3a8 8 0 0 1 0 11.4"/></svg>';
const ARROW =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/**
 * A light SVG sine for the board: more cycles the higher the pitch. Drawn
 * once per change, never animated in a loop.
 */
function wavePath(cents: number): string {
  const cycles = 2 + (cents / MAX_CENTS) * 10;
  const points: string[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const x = (i / 120) * 100;
    const y = 10 - 8 * Math.sin((i / 120) * cycles * 2 * Math.PI);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join(" ");
}

function createWave(): { element: SVGSVGElement; draw(cents: number): void } {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "sound-wave");
  svg.setAttribute("viewBox", "0 0 100 20");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.append(path);
  return {
    element: svg,
    draw(cents) {
      path.setAttribute("d", wavePath(cents));
    },
  };
}

function statusFor(progress: SoundProgress): string {
  const result = `${formatPoints(soundScore(progress))} of 50 points.`;
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

function createPair(target: number, guess: number | null, index: number): HTMLElement {
  const item = document.createElement("li");
  item.className = "sound-pair";
  item.dataset.soundPair = String(index);
  const which = document.createElement("span");
  which.className = "sound-pair-index";
  which.textContent = String(index + 1);
  const values = document.createElement("span");
  values.className = "sound-pair-values";
  const heard = document.createElement("strong");
  heard.dataset.soundPairTarget = "";
  heard.textContent = formatHz(target);
  values.append(heard);
  if (guess !== null) {
    const yours = document.createElement("span");
    yours.textContent = `yours ${formatHz(guess)}`;
    values.append(yours);
  }
  item.append(which, values);
  if (guess !== null) {
    const score = document.createElement("strong");
    score.className = "sound-pair-score";
    score.textContent = formatHundredths(toneScore(target, guess));
    item.append(score);
  }
  return item;
}

export function renderSound(source: DataSource, requestedDay?: number): ViewHandle {
  const page = document.createElement("section");
  page.className = "page sound-page";
  page.dataset.game = "sound";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Find the tone.</h1>
      </div>
    </div>
    <div class="sound-shell" data-sound-shell>
      <div class="game-loading">Loading today's tones…</div>
    </div>
  `;
  document.documentElement.dataset.game = "sound";
  const gameRule = createGameRule(
    "Needs sound. Each tone plays once; then hold and drag up or down to find it. Up to 10 points a tone.",
  );
  page.append(gameRule);
  const shell = page.querySelector<HTMLElement>("[data-sound-shell]")!;

  let disposed = false;
  let targets: number[] | null = null;
  let progress: SoundProgress | null = null;
  let alreadyRecorded = false;
  let today = 0;
  let loadRequest = 0;
  /** The round in hand: waiting to be heard, playing, being found, or just scored. */
  let phase: "listen" | "playing" | "find" | "reveal" | "done" = "listen";
  /** Why sound cannot play, when it cannot. */
  let audioProblem: "unsupported" | "blocked" | null = null;
  let timer: number | null = null;
  let cents = START_CENTS;
  let liveTone: LiveTone | null = null;
  let keyTimer: number | null = null;
  const resultPanel = createResultPanel(source, GAME);

  const stopTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const stopLiveTone = (): void => {
    if (keyTimer !== null) {
      window.clearTimeout(keyTimer);
      keyTimer = null;
    }
    liveTone?.stop();
    liveTone = null;
  };

  const startListen = (): void => {
    stopTimer();
    stopLiveTone();
    phase = "listen";
    cents = START_CENTS;
  };

  const listen = async (): Promise<void> => {
    if (!progress || !targets || phase !== "listen") {
      return;
    }
    const round = progress.guesses.length;
    phase = "playing";
    renderGame();
    const ready = await ensureAudio();
    if (disposed || phase !== "playing") {
      return;
    }
    if (!ready) {
      phase = "listen";
      audioProblem = "blocked";
      renderGame();
      shell.querySelector<HTMLElement>("[data-sound-listen]")?.focus();
      return;
    }
    audioProblem = null;
    void playTone(targets[round]!, TONE_SECONDS);
    // The board moves on by the clock, not on the tone's end event, which a
    // suspended device might never send.
    timer = window.setTimeout(() => {
      timer = null;
      phase = "find";
      renderGame();
      shell.querySelector<HTMLElement>("[data-sound-pitch]")?.focus();
    }, TONE_SECONDS * 1_000 + 150);
  };

  const submitAndRender = (): void => {
    if (!progress) {
      return;
    }
    void submitSoundOnce(source, progress)
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          renderGame();
        }
      });
  };

  const meta = (round: number): HTMLElement => {
    const row = document.createElement("div");
    row.className = "sound-meta";
    const which = document.createElement("span");
    which.dataset.soundRound = String(round + 1);
    which.textContent = `Tone ${round + 1} of ${ROUNDS}`;
    const total = document.createElement("span");
    total.dataset.soundTotal = "";
    total.textContent = `${formatHundredths(soundHundredths(progress!))} points`;
    row.append(which, total);
    return row;
  };

  const listenBoard = (round: number): HTMLElement => {
    const board = document.createElement("div");
    board.className = "sound-board sound-board--listen";
    board.dataset.soundPhase = phase;
    const note = document.createElement("p");
    note.className = "sound-board-note";
    note.dataset.soundNote = "";
    if (audioProblem === "unsupported") {
      note.setAttribute("role", "alert");
      note.textContent = "Sound can't play in this browser. Daily Sound needs Web Audio; try another browser.";
      board.append(note);
      return board;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sound-listen";
    button.dataset.soundListen = "";
    const label = document.createElement("span");
    if (phase === "playing") {
      button.disabled = true;
      button.dataset.playing = "";
      label.textContent = "Listen…";
      const wave = createWave();
      wave.draw(START_CENTS);
      board.append(wave.element);
    } else {
      label.textContent = audioProblem === "blocked" ? "Try again" : "Listen";
    }
    button.innerHTML = SPEAKER;
    button.append(label);
    button.addEventListener("click", () => void listen());
    if (audioProblem === "blocked") {
      note.setAttribute("role", "alert");
      note.textContent = "Sound is blocked on this device. Check it isn't muted or silenced, then try again.";
    } else {
      note.textContent = phase === "playing"
        ? `Tone ${round + 1} plays once. Listen closely.`
        : "This game needs sound. Turn your volume up: each tone plays once.";
    }
    board.append(button, note);
    return board;
  };

  const findBoard = (): HTMLElement[] => {
    const board = document.createElement("div");
    board.className = "sound-board sound-board--find";
    board.dataset.soundPhase = "find";
    board.dataset.soundPitch = "";
    board.tabIndex = 0;
    board.setAttribute("role", "slider");
    board.setAttribute("aria-label", "Pitch");
    board.setAttribute("aria-orientation", "vertical");
    board.setAttribute("aria-valuemin", String(MIN_HZ));
    board.setAttribute("aria-valuemax", String(MAX_HZ));
    const wave = createWave();
    const marker = document.createElement("span");
    marker.className = "sound-marker";
    marker.setAttribute("aria-hidden", "true");
    const readout = document.createElement("span");
    readout.className = "sound-readout";
    readout.dataset.soundReadout = "";
    marker.append(readout);
    const hint = document.createElement("span");
    hint.className = "sound-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "Hold and drag";
    board.append(wave.element, marker, hint);

    const sync = (): void => {
      const hz = centsToHz(cents);
      board.setAttribute("aria-valuenow", hz.toFixed(2));
      board.setAttribute("aria-valuetext", formatHz(hz));
      board.style.setProperty("--at", String(cents / MAX_CENTS));
      readout.textContent = formatHz(hz);
      wave.draw(cents);
      liveTone?.set(hz);
    };
    const set = (next: number): void => {
      const clamped = clampCents(next);
      if (clamped !== cents) {
        cents = clamped;
        sync();
      }
    };
    const fromPointer = (clientY: number): void => {
      const rect = board.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      set(positionToCents((clientY - rect.top) / rect.height));
    };

    let dragging: number | null = null;
    board.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dragging = event.pointerId;
      board.setPointerCapture?.(event.pointerId);
      board.focus();
      board.dataset.held = "";
      fromPointer(event.clientY);
      stopLiveTone();
      // Wakes a context the device suspended since the listen; this is a tap.
      void ensureAudio();
      liveTone = startTone(centsToHz(cents));
    });
    board.addEventListener("pointermove", (event) => {
      if (dragging === event.pointerId) {
        fromPointer(event.clientY);
      }
    });
    const release = (event: PointerEvent): void => {
      if (dragging === event.pointerId) {
        dragging = null;
        delete board.dataset.held;
        stopLiveTone();
      }
    };
    board.addEventListener("pointerup", release);
    board.addEventListener("pointercancel", release);
    board.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? COARSE_CENTS : FINE_CENTS;
      const steps: Record<string, number> = {
        ArrowUp: step,
        ArrowRight: step,
        ArrowDown: -step,
        ArrowLeft: -step,
        PageUp: COARSE_CENTS,
        PageDown: -COARSE_CENTS,
      };
      if (event.key in steps) {
        set(cents + steps[event.key]!);
      } else if (event.key === "Home") {
        set(0);
      } else if (event.key === "End") {
        set(MAX_CENTS);
      } else {
        return;
      }
      event.preventDefault();
      // The keyboard path hears the pitch too: it sounds while keys are pressed.
      if (dragging === null) {
        liveTone ??= startTone(centsToHz(cents));
        if (keyTimer !== null) {
          window.clearTimeout(keyTimer);
        }
        keyTimer = window.setTimeout(() => {
          keyTimer = null;
          stopLiveTone();
        }, KEY_TONE_MS);
      }
    });

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "sound-submit";
    submit.dataset.soundSubmit = "";
    submit.textContent = "Submit";
    submit.addEventListener("click", () => {
      if (!progress || progress.complete) {
        return;
      }
      stopLiveTone();
      progress = applySoundGuess(progress, centsToHz(cents));
      saveSoundProgress(progress);
      phase = "reveal";
      renderGame();
      shell.querySelector<HTMLElement>("[data-sound-next]")?.focus();
    });
    sync();
    return [board, submit];
  };

  const revealBoard = (round: number): HTMLElement => {
    const target = targets![round]!;
    const guess = progress!.guesses[round]!;
    const score = toneScore(target, guess);
    const board = document.createElement("div");
    board.className = "sound-board sound-board--reveal";
    board.dataset.soundPhase = "reveal";
    const count = document.createElement("p");
    count.className = "sound-reveal-round";
    count.textContent = `${round + 1} / ${ROUNDS}`;
    const result = document.createElement("div");
    result.className = "sound-reveal-score";
    result.setAttribute("role", "status");
    const value = document.createElement("strong");
    value.dataset.soundRoundScore = String(score);
    value.textContent = formatHundredths(score);
    const verdict = document.createElement("span");
    verdict.className = "sound-verdict";
    verdict.textContent = verdictFor(score);
    result.append(value, verdict);
    const rows = document.createElement("dl");
    rows.className = "sound-reveal-values";
    const row = (term: string, hz: number, key: string): void => {
      const label = document.createElement("dt");
      label.textContent = term;
      const amount = document.createElement("dd");
      amount.dataset[key] = "";
      amount.textContent = formatHz(hz);
      rows.append(label, amount);
    };
    row("Target", target, "soundTarget");
    row("Yours", guess, "soundGuess");
    const next = document.createElement("button");
    next.type = "button";
    next.className = "sound-next";
    next.dataset.soundNext = "";
    const last = round === ROUNDS - 1;
    next.setAttribute("aria-label", last ? "See your total" : "Next tone");
    next.innerHTML = ARROW;
    next.addEventListener("click", () => {
      if (!progress) {
        return;
      }
      if (progress.complete) {
        phase = "done";
        renderGame();
        submitAndRender();
      } else {
        // Only the first tone waits for Listen: this tap plays the next one.
        startListen();
        void listen();
      }
    });
    board.append(count, result, rows, next);
    return board;
  };

  const summary = (): HTMLElement => {
    const box = document.createElement("div");
    box.className = "sound-summary";
    const total = document.createElement("p");
    total.className = "sound-final";
    if (alreadyRecorded) {
      total.textContent = "Today's tones";
    } else {
      const value = document.createElement("strong");
      value.dataset.soundFinal = String(soundScore(progress!));
      value.textContent = formatPoints(soundScore(progress!));
      total.append(value, " / 50");
    }
    const list = document.createElement("ol");
    list.className = "sound-pairs";
    list.setAttribute("aria-label", alreadyRecorded ? "The day's tones" : "The tones and yours");
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
    stage.className = "sound-stage";
    stage.classList.toggle("sound-stage--done", finished);

    if (finished) {
      stage.append(summary());
      const result = document.createElement("p");
      result.className = "sound-result";
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
          prepareSoundSubmissionRetry(progress);
          renderGame();
          submitAndRender();
        });
        stage.append(retry);
      }
    } else if (phase === "reveal") {
      const round = progress.guesses.length - 1;
      stage.append(meta(round), revealBoard(round));
    } else if (phase === "find") {
      stage.append(meta(progress.guesses.length), ...findBoard());
    } else {
      const round = progress.guesses.length;
      stage.append(meta(round), listenBoard(round));
    }

    const onSave = finished && !alreadyRecorded && progress.submission === "pending"
      ? submitAndRender
      : undefined;
    const shown = finished && !alreadyRecorded && showsResult(progress.submission);
    resultPanel.update({
      day: progress.day,
      score: soundScore(progress),
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
      const generated = soundAnswer(day, "v1");
      const bits = await source.dayBits(day);
      if (disposed || request !== loadRequest) {
        return;
      }
      setHeaderGame(GAME, day);
      targets = generated;
      progress = loadSoundProgress(day, generated);
      audioProblem = audioSupported() ? null : "unsupported";
      // A day finished on this device shows from its local copy; the chain only
      // confirms the record. A recorded day with no local copy opens read-only.
      const onChain = hasGameBit(bits.played, gameIdOf("sound"));
      if (onChain && progress.complete) {
        progress.submission = "submitted";
      }
      alreadyRecorded = onChain && !progress.complete;
      if (progress.complete || alreadyRecorded) {
        phase = "done";
      } else {
        // A reload mid-round starts that tone's one listen again (D1).
        startListen();
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
        heading.textContent = "Sound unavailable";
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
      stopLiveTone();
      if (document.documentElement.dataset.game === "sound") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
