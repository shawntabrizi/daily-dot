import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

import type { ChessPuzzle } from "../../shared/data-source";

export interface ParsedUciMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface PreparedChessPuzzle {
  moves: string[];
  firstAutoMove: string;
  firstPlayerMove: string;
  playerColor: Color;
}

export function parseUciMove(move: string): ParsedUciMove {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(move);
  if (!match) {
    throw new Error(`Invalid UCI move "${move}"`);
  }
  const parsed: ParsedUciMove = {
    from: match[1] as Square,
    to: match[2] as Square,
  };
  if (match[3]) {
    parsed.promotion = match[3] as PieceSymbol;
  }
  return parsed;
}

export function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function playUciMove(chess: Chess, uci: string): Move {
  try {
    return chess.move(parseUciMove(uci));
  } catch {
    throw new Error(`Puzzle line contains illegal move "${uci}"`);
  }
}

export function positionAfterMoves(
  puzzle: ChessPuzzle,
  moveCount: number,
): Chess {
  const moves = puzzle.moves.trim().split(/\s+/);
  if (!Number.isInteger(moveCount) || moveCount < 0 || moveCount > moves.length) {
    throw new RangeError("Move count is outside the puzzle line");
  }
  const chess = new Chess(puzzle.fen);
  for (const move of moves.slice(0, moveCount)) {
    playUciMove(chess, move);
  }
  return chess;
}

export function prepareChessPuzzle(
  puzzle: ChessPuzzle,
): PreparedChessPuzzle {
  const moves = puzzle.moves.trim().split(/\s+/);
  if (
    moves.length < 2
    || moves.length % 2 !== 0
    || moves.some((move) => !move)
  ) {
    throw new Error("Puzzle must end on a player move");
  }

  const afterOpponentMove = positionAfterMoves(puzzle, 1);
  positionAfterMoves(puzzle, moves.length);

  return {
    moves,
    firstAutoMove: moves[0]!,
    firstPlayerMove: moves[1]!,
    playerColor: afterOpponentMove.turn(),
  };
}

export function legalMovesFrom(chess: Chess, square: Square): Move[] {
  return chess.moves({ square, verbose: true });
}
