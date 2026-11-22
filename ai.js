// Trí tuệ nhân tạo Cờ Vua sử dụng Minimax + Alpha-Beta Pruning + Piece-Square Tables
class ChessAI {
  constructor() {
    this.pieceValues = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

    this.pst = {
      P: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [ 5,  5, 10, 25, 25, 10,  5,  5],
        [ 0,  0,  0, 20, 20,  0,  0,  0],
        [ 5, -5,-10,  0,  0,-10, -5,  5],
        [ 5, 10, 10,-20,-20, 10, 10,  5],
        [ 0,  0,  0,  0,  0,  0,  0,  0]
      ],
      N: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50]
      ],
      B: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20]
      ],
      R: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [ 0,  0,  0,  5,  5,  0,  0,  0]
      ],
      Q: [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [ -5,  0,  5,  5,  5,  5,  0, -5],
        [  0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20]
      ],
      K: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [ 20, 20,  0,  0,  0,  0, 20, 20],
        [ 20, 30, 10,  0,  0, 10, 30, 20]
      ]
    };
  }

  evaluateBoard(engine) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = engine.board[r][c];
        if (!piece) continue;
        const color = piece[0];
        const type = piece[1];
        const rowIdx = color === 'w' ? r : 7 - r;
        const val = this.pieceValues[type] + this.pst[type][rowIdx][c];
        score += color === 'w' ? val : -val;
      }
    }
    return score;
  }

  orderMoves(moves) {
    return moves.sort((a, b) => {
      const scoreA = (a.captured ? 10 * this.pieceValues[a.captured[1]] : 0) + (a.promotion ? 800 : 0);
      const scoreB = (b.captured ? 10 * this.pieceValues[b.captured[1]] : 0) + (b.promotion ? 800 : 0);
      return scoreB - scoreA;
    });
  }

  minimax(engine, depth, alpha, beta, isMaximizing) {
    if (depth === 0) {
      return this.evaluateBoard(engine);
    }

    const moves = this.orderMoves(engine.getAllLegalMoves(engine.turn));
    if (moves.length === 0) {
      if (engine.isInCheck(engine.turn)) {
        return isMaximizing ? -99999 - depth : 99999 + depth;
      }
      return 0;
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const saved = engine.cloneState();
        engine.applyMoveRaw(move);
        engine.turn = 'b';
        const ev = this.minimax(engine, depth - 1, alpha, beta, false);
        engine.restoreState(saved);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const saved = engine.cloneState();
        engine.applyMoveRaw(move);
        engine.turn = 'w';
        const ev = this.minimax(engine, depth - 1, alpha, beta, true);
        engine.restoreState(saved);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  getBestMove(engine, depth = 2) {
    const moves = this.orderMoves(engine.getAllLegalMoves(engine.turn));
    if (moves.length === 0) return null;

    // Cấp độ Dễ: thêm chút ngẫu nhiên để người mới dễ chơi
    if (depth === 1 && Math.random() < 0.35) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const isMaximizing = engine.turn === 'w';
    let bestMove = moves[0];
    let bestValue = isMaximizing ? -Infinity : Infinity;

    for (const move of moves) {
      const saved = engine.cloneState();
      engine.applyMoveRaw(move);
      engine.turn = isMaximizing ? 'b' : 'w';
      const val = this.minimax(engine, depth - 1, -Infinity, Infinity, !isMaximizing);
      engine.restoreState(saved);

      if (isMaximizing ? val > bestValue : val < bestValue) {
        bestValue = val;
        bestMove = move;
      }
    }
    return bestMove;
  }
}
