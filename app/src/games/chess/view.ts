import { Chess, type Color, type Move, type Square } from "chess.js";

import type { ViewHandle } from "../../home";
import type { ChessPuzzle, DataSource } from "../../shared/data-source";
import { gameById, gameIdOf } from "../../shared/roster";
import { hasGameBit } from "../../shared/streaks";
import { createPlayedNotice } from "../../shared/ui/played-notice";
import { createGameRule } from "../../shared/ui/game-rule";
import { setHeaderGame } from "../../shared/ui/header";
import { pendingSave, showsResult } from "../../shared/save-consent";
import { createResultPanel, syncResultChrome } from "../../shared/ui/result-panel";
import {
  legalMovesFrom,
  moveToUci,
  parseUciMove,
  playUciMove,
  positionAfterMoves,
  prepareChessPuzzle,
  type PreparedChessPuzzle,
} from "./engine";
import {
  applyOpponentReply,
  applyPlayerAttempt,
  loadChessProgress,
  prepareChessSubmissionRetry,
  saveChessProgress,
  submitChessOnce,
  type ChessProgress,
} from "./progress";
import { PIECE_SVG, type PieceType } from "./pieces";

const AUTO_MOVE_DELAY_MS = 360;
/** The puzzle's opening move waits longer: the player sees the position first, then the move. */
const OPENING_MOVE_DELAY_MS = 1_000;
/** How long the other side's piece takes to slide to its square. */
const SLIDE_MS = 320;

const pieceElement = (color: Color, type: string, className: string): HTMLSpanElement => {
  const token = document.createElement("span");
  token.className = className;
  token.dataset.piece = `${color}${type}`;
  token.setAttribute("aria-hidden", "true");
  token.innerHTML = PIECE_SVG[color][type as PieceType]!;
  return token;
};

const PIECE_NAMES: Record<string, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

type Phase = "opponent" | "player" | "solved" | "readonly";

interface PromotionChoice {
  from: Square;
  to: Square;
  moves: Move[];
}

interface LastMove {
  from: Square;
  to: Square;
  /** The piece already slid in (the other side's move): no arrival pop on top. */
  slid?: boolean;
}

/** The rook's slide when a move castles: king side h→f, queen side a→d. */
export function castlingRook(move: Move): { from: Square; to: Square } | null {
  const rank = move.color === "w" ? "1" : "8";
  if (move.flags.includes("k")) return { from: `h${rank}` as Square, to: `f${rank}` as Square };
  if (move.flags.includes("q")) return { from: `a${rank}` as Square, to: `d${rank}` as Square };
  return null;
}

function squareName(square: Square): string {
  return `${square[0]?.toUpperCase()}${square[1]}`;
}

function displayFiles(playerColor: Color): string[] {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return playerColor === "w" ? files : files.reverse();
}

function displayRanks(playerColor: Color): number[] {
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  return playerColor === "w" ? ranks : ranks.reverse();
}

/** The puzzle's player moves in SAN, for the result subline ("the answer was Nf3"). */
function playerMovesSan(puzzle: ChessPuzzle): string[] {
  const chess = new Chess(puzzle.fen);
  return puzzle.moves
    .trim()
    .split(/\s+/)
    .map((uci) => playUciMove(chess, uci).san)
    .filter((_, index) => index % 2 === 1);
}

export function renderChess(
  source: DataSource,
  requestedDay?: number,
): ViewHandle {
  const page = document.createElement("section");
  page.className = "page chess-page";
  page.innerHTML = `
    <div class="game-heading">
      <div>
        <h1>Find the tactic.</h1>
      </div>
    </div>
    <div class="chess-shell" data-chess-shell>
      <div class="game-loading">Loading today's position…</div>
    </div>
  `;
  page.dataset.game = "chess";
  document.documentElement.dataset.game = "chess";
  const gameRule = createGameRule("Find the best move for your side. The opponent replies.");
  page.append(gameRule);

  const shell = page.querySelector<HTMLElement>("[data-chess-shell]");
  if (!shell) {
    throw new Error("Chess shell failed to render");
  }

  let disposed = false;
  let loadRequest = 0;
  let autoMoveTimer = 0;
  let feedbackTimer = 0;
  let puzzle: ChessPuzzle | null = null;
  let prepared: PreparedChessPuzzle | null = null;
  let progress: ChessProgress | null = null;
  let chess: Chess | null = null;
  let phase: Phase = "opponent";
  let message = "Watch the last move…";
  let selected: Square | null = null;
  let legalMoves: Move[] = [];
  let promotion: PromotionChoice | null = null;
  let lastMove: LastMove | null = null;
  let wrongSquare: Square | null = null;
  let alreadyRecorded = false;
  let today = 0;
  const resultPanel = createResultPanel(source, gameById("chess")!, { unit: "move" });

  const clearTimers = (): void => {
    window.clearTimeout(autoMoveTimer);
    window.clearTimeout(feedbackTimer);
    autoMoveTimer = 0;
    feedbackTimer = 0;
  };

  const renderPromotion = (wrap: HTMLElement): void => {
    if (!promotion || !prepared) {
      return;
    }
    const picker = document.createElement("div");
    picker.className = "chess-promotion";
    picker.dataset.chessPromotion = "";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-modal", "true");
    picker.setAttribute("aria-label", "Choose promotion piece");

    const title = document.createElement("strong");
    title.textContent = "PROMOTE TO";
    const choices = document.createElement("div");
    choices.className = "chess-promotion-choices";
    for (const piece of ["q", "r", "b", "n"] as const) {
      const move = promotion.moves.find((candidate) => candidate.promotion === piece);
      if (!move) {
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.chessPromote = piece;
      button.append(pieceElement(prepared.playerColor, piece, "chess-piece"));
      button.setAttribute("aria-label", `Promote to ${PIECE_NAMES[piece]}`);
      button.addEventListener("click", () => submitPlayerMove(moveToUci(move)));
      choices.append(button);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "chess-promotion-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      promotion = null;
      renderGame();
    });
    picker.append(title, choices, cancel);
    wrap.append(picker);
  };

  const renderBoard = (): HTMLElement => {
    if (!chess || !prepared || !progress) {
      throw new Error("Chess board rendered before initialization");
    }
    const wrap = document.createElement("div");
    wrap.className = "chess-board-wrap";
    const board = document.createElement("div");
    board.className = "chess-board";
    board.dataset.chessBoard = "";
    board.setAttribute("role", "grid");
    board.setAttribute(
      "aria-label",
      `Chess position, ${prepared.playerColor === "w" ? "White" : "Black"} to move at the bottom`,
    );

    const files = displayFiles(prepared.playerColor);
    const ranks = displayRanks(prepared.playerColor);
    const interactive =
      phase === "player"
      && !progress.complete
      && !alreadyRecorded
      && promotion === null;
    for (const rank of ranks) {
      for (const file of files) {
        const square = `${file}${rank}` as Square;
        const piece = chess.get(square);
        const destinationMoves = legalMoves.filter((move) => move.to === square);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chess-square";
        button.dataset.chessSquare = square;
        button.dataset.file = file;
        button.dataset.rank = String(rank);
        button.setAttribute("role", "gridcell");
        button.disabled = !interactive;
        button.classList.add(
          (file.charCodeAt(0) - 97 + rank) % 2 === 1
            ? "chess-square--dark"
            : "chess-square--light",
        );
        button.classList.toggle("chess-square--selected", selected === square);
        button.classList.toggle(
          "chess-square--legal",
          destinationMoves.length > 0 && destinationMoves.every((move) => !move.captured),
        );
        button.classList.toggle(
          "chess-square--capture",
          destinationMoves.some((move) => Boolean(move.captured)),
        );
        button.classList.toggle(
          "chess-square--last",
          lastMove?.from === square || lastMove?.to === square,
        );
        button.classList.toggle("chess-square--wrong", wrongSquare === square);
        const occupant = piece
          ? `${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}`
          : "empty";
        button.setAttribute("aria-label", `${squareName(square)}, ${occupant}`);
        button.setAttribute("aria-pressed", String(selected === square));
        button.addEventListener("click", () => handleSquare(square));

        if (piece) {
          const token = pieceElement(piece.color, piece.type, "chess-piece");
          token.classList.toggle(
            "chess-piece--arriving",
            lastMove?.to === square && !lastMove.slid,
          );
          button.append(token);
        }
        if (file === files[0]) {
          const rankLabel = document.createElement("i");
          rankLabel.className = "chess-rank-label";
          rankLabel.textContent = String(rank);
          button.append(rankLabel);
        }
        if (rank === ranks[ranks.length - 1]) {
          const fileLabel = document.createElement("i");
          fileLabel.className = "chess-file-label";
          fileLabel.textContent = file;
          button.append(fileLabel);
        }
        board.append(button);
      }
    }
    wrap.append(board);
    renderPromotion(wrap);
    return wrap;
  };

  const renderStatus = (stage: HTMLElement): void => {
    if (!progress) {
      return;
    }
    const status = document.createElement("div");
    status.className = "chess-status";
    status.setAttribute("role", "status");

    const attempts = document.createElement("strong");
    attempts.dataset.chessAttempts = "";
    attempts.textContent = alreadyRecorded
      ? "DONE"
      : `${progress.attempts} MOVE${progress.attempts === 1 ? "" : "S"}`;
    const text = document.createElement("span");
    if (alreadyRecorded) {
      text.replaceChildren(createPlayedNotice(gameById("chess")!, progress.day, today));
    } else {
      text.textContent = message;
    }
    status.append(attempts, text);

    if (progress.complete && progress.submission === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button-link chess-retry";
      retry.textContent = "Try recording again";
      retry.addEventListener("click", () => {
        if (!progress) {
          return;
        }
        prepareChessSubmissionRetry(progress);
        renderGame();
        void submitChessOnce(source, progress)
          .catch(() => undefined)
          .finally(() => {
            if (!disposed) {
              updateCompletionMessage();
              renderGame();
            }
          });
      });
      status.append(retry);
    }
    stage.append(status, resultPanel.element);
    // Save from the unsaved result (after Not now): the prompt opens again.
    const finished = progress;
    const onSave = progress.complete && progress.submission === "pending"
      ? () => {
        void submitChessOnce(source, finished)
          .catch(() => undefined)
          .finally(() => {
            if (!disposed) {
              updateCompletionMessage();
              renderGame();
            }
          });
      }
      : undefined;
    const shown = progress.complete && showsResult(progress.submission);
    const moves = puzzle ? playerMovesSan(puzzle) : [];
    resultPanel.update({
      day: progress.day,
      score: progress.attempts,
      recorded: shown && progress.submission === "submitted",
      pendingSave: shown ? pendingSave(progress.submission) : undefined,
      late: progress.day < today,
      detail: `the answer was ${moves.join(" ")}`,
      onSave,
    });
    syncResultChrome(page, gameById("chess")!, progress.day, shown);
  };

  const updateCompletionMessage = (): void => {
    if (!progress) {
      return;
    }
    if (alreadyRecorded) {
      message = "";
    } else if (progress.submission === "submitted") {
      message = "Solved. Score recorded.";
    } else if (progress.submission === "submitting") {
      message = "Solved. Recording your score…";
    } else if (progress.submission === "deferred") {
      message =
        "Solved and safe on this device. Open Daily on Dot in the Polkadot app to record.";
    } else if (progress.submission === "failed") {
      message = "Solved and safe on this device. Recording failed.";
    } else {
      message = "Puzzle solved.";
    }
  };

  function renderGame(): void {
    if (!progress || !chess || !prepared) {
      return;
    }
    const stage = document.createElement("div");
    stage.className = "chess-stage";
    stage.dataset.chessPhase = phase;
    gameRule.hidden = phase === "solved" || phase === "readonly";

    const toolbar = document.createElement("div");
    toolbar.className = "chess-toolbar";
    const turn = document.createElement("span");
    turn.className = "chess-turn";
    turn.textContent =
      phase === "readonly"
        ? "DONE"
        : phase === "solved"
          ? "SOLVED"
          : phase === "opponent"
            ? "OPPONENT MOVE"
            : "YOUR MOVE";
    const side = document.createElement("span");
    side.className = "chess-side";
    side.textContent = `${prepared.playerColor === "w" ? "WHITE" : "BLACK"} AT BOTTOM`;
    toolbar.append(turn, side);

    stage.append(toolbar, renderBoard());
    renderStatus(stage);
    shell!.replaceChildren(stage);
  }

  /**
   * Slides each piece now on `to` from `from` (a castling rook with its
   * king), so the other side's move is seen, not just inferred from the
   * highlight. Resolves when the slides end; at once for reduced motion or
   * where the Web Animations API is missing.
   */
  const slidePieces = (moves: readonly { from: Square; to: Square }[]): Promise<void> => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return Promise.resolve();
    }
    const slides = moves.map(({ from, to }) => {
      const piece = shell.querySelector<HTMLElement>(`[data-chess-square="${to}"] .chess-piece`);
      const origin = shell.querySelector<HTMLElement>(`[data-chess-square="${from}"]`);
      if (!piece || !origin || typeof piece.animate !== "function") {
        return Promise.resolve();
      }
      const start = origin.getBoundingClientRect();
      const end = piece.parentElement!.getBoundingClientRect();
      piece.classList.add("chess-piece--sliding");
      return piece
        .animate(
          [
            { transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: SLIDE_MS, easing: "ease-in-out" },
        )
        .finished.then(() => undefined, () => undefined)
        .finally(() => piece.classList.remove("chess-piece--sliding"));
    });
    return Promise.all(slides).then(() => undefined);
  };

  const scheduleOpponentMove = (): void => {
    if (!puzzle || !prepared || !progress || !chess || alreadyRecorded) {
      return;
    }
    phase = "opponent";
    message =
      progress.nextMoveIndex === 0
        ? "Watch the last move…"
        : "Opponent is replying…";
    selected = null;
    legalMoves = [];
    promotion = null;
    renderGame();
    window.clearTimeout(autoMoveTimer);
    autoMoveTimer = window.setTimeout(() => {
      if (
        disposed
        || !puzzle
        || !prepared
        || !progress
        || !chess
        || progress.nextMoveIndex % 2 !== 0
      ) {
        return;
      }
      const expected = prepared.moves[progress.nextMoveIndex]!;
      const played = playUciMove(chess, expected);
      progress = applyOpponentReply(progress, puzzle);
      saveChessProgress(progress);
      lastMove = {
        from: played.from,
        to: played.to,
        slid: true,
      };
      // The board stays locked while the piece slides: no move on a half-drawn position.
      message = "Find the best move.";
      renderGame();
      const rook = castlingRook(played);
      void slidePieces([{ from: played.from, to: played.to }, ...(rook ? [rook] : [])]).then(() => {
        if (disposed || phase !== "opponent") {
          return;
        }
        phase = "player";
        renderGame();
      });
    }, progress.nextMoveIndex === 0 ? OPENING_MOVE_DELAY_MS : AUTO_MOVE_DELAY_MS);
  };

  const submitCompletedPuzzle = (): void => {
    if (!progress || alreadyRecorded) {
      return;
    }
    updateCompletionMessage();
    renderGame();
    void submitChessOnce(source, progress)
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) {
          updateCompletionMessage();
          renderGame();
        }
      });
  };

  function submitPlayerMove(uci: string): void {
    if (
      !puzzle
      || !prepared
      || !progress
      || !chess
      || phase !== "player"
      || progress.complete
      || alreadyRecorded
    ) {
      return;
    }
    const { to } = parseUciMove(uci);
    const result = applyPlayerAttempt(progress, puzzle, uci);
    progress = result.progress;
    saveChessProgress(progress);
    promotion = null;
    selected = null;
    legalMoves = [];

    if (!result.correct) {
      wrongSquare = to;
      message = "Not the move. Try again.";
      renderGame();
      window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => {
        wrongSquare = null;
        if (!disposed) {
          renderGame();
        }
      }, 520);
      return;
    }

    const played = playUciMove(chess, uci);
    lastMove = { from: played.from, to: played.to };
    wrongSquare = null;
    if (progress.complete) {
      phase = "solved";
      updateCompletionMessage();
      submitCompletedPuzzle();
    } else {
      scheduleOpponentMove();
    }
  }

  function handleSquare(square: Square): void {
    if (
      !chess
      || !prepared
      || !progress
      || phase !== "player"
      || progress.complete
      || alreadyRecorded
      || promotion
    ) {
      return;
    }
    const piece = chess.get(square);
    if (piece?.color === prepared.playerColor) {
      selected = square;
      legalMoves = legalMovesFrom(chess, square);
      message =
        legalMoves.length === 0
          ? `${squareName(square)} has no legal moves.`
          : "Choose a highlighted square.";
      renderGame();
      return;
    }
    if (!selected) {
      message = "Tap one of your pieces first.";
      renderGame();
      return;
    }

    const destinations = legalMoves.filter((move) => move.to === square);
    if (destinations.length === 0) {
      message = "Choose a highlighted square.";
      renderGame();
      return;
    }
    if (destinations.some((move) => Boolean(move.promotion))) {
      promotion = { from: selected, to: square, moves: destinations };
      message = "Choose a promotion piece.";
      renderGame();
      return;
    }
    submitPlayerMove(moveToUci(destinations[0]!));
  }

  const loadGame = async (): Promise<void> => {
    const request = ++loadRequest;
    clearTimers();
    gameRule.hidden = true;
    shell.innerHTML = '<div class="game-loading">Loading today\'s position…</div>';

    try {
      today = await source.currentDay();
      const day = requestedDay ?? today;
      if (!Number.isInteger(day) || day < 0 || day > today) {
        throw new RangeError("That day is outside the playable archive.");
      }
      setHeaderGame(gameById("chess")!, day);
      if (!source.chessPuzzle) {
        throw new Error("This data source does not provide chess puzzles.");
      }
      const [loadedPuzzle, bits] = await Promise.all([
        source.chessPuzzle(day),
        source.dayBits(day),
      ]);
      if (disposed || request !== loadRequest) {
        return;
      }

      puzzle = loadedPuzzle;
      prepared = prepareChessPuzzle(puzzle);
      progress = loadChessProgress(day, puzzle);
      alreadyRecorded = hasGameBit(bits.played, gameIdOf("chess"));
      selected = null;
      legalMoves = [];
      promotion = null;
      lastMove = null;
      wrongSquare = null;

      if (alreadyRecorded) {
        chess = positionAfterMoves(puzzle, prepared.moves.length);
        phase = "readonly";
        updateCompletionMessage();
        renderGame();
        return;
      }

      chess = positionAfterMoves(puzzle, progress.nextMoveIndex);
      if (progress.complete) {
        phase = "solved";
        updateCompletionMessage();
        renderGame();
        if (
          progress.submission === "pending"
          || progress.submission === "deferred"
        ) {
          submitCompletedPuzzle();
        }
      } else if (progress.nextMoveIndex % 2 === 0) {
        scheduleOpponentMove();
      } else {
        phase = "player";
        message = "Find the best move.";
        renderGame();
      }
    } catch (error) {
      if (!disposed && request === loadRequest) {
        const failure = document.createElement("div");
        failure.className = "game-error";
        const heading = document.createElement("strong");
        heading.textContent = "Puzzle unavailable";
        const detail = document.createElement("p");
        detail.textContent =
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
        failure.append(heading, detail, retry, back);
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
      clearTimers();
      if (document.documentElement.dataset.game === "chess") {
        delete document.documentElement.dataset.game;
      }
    },
  };
}
