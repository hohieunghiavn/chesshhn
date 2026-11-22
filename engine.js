// Bộ máy luật cờ vua chuẩn FIDE (Di chuyển, Nhập thành, En Passant, Phong cấp, Chiếu, Hòa)
class ChessEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = [
      ['bR','bN','bB','bQ','bK','bB','bN','bR'],
      ['bP','bP','bP','bP','bP','bP','bP','bP'],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ['wP','wP','wP','wP','wP','wP','wP','wP'],
      ['wR','wN','wB','wQ','wK','wB','wN','wR']
    ];
    this.turn = 'w';
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null; // {r, c}
    this.halfMoveClock = 0;
    this.history = [];
    this.positionCounts = {};
    this.recordPosition();
  }

  cloneState() {
    return {
      board: this.board.map(row => [...row]),
      turn: this.turn,
      castling: { ...this.castling },
      enPassant: this.enPassant ? { ...this.enPassant } : null,
      halfMoveClock: this.halfMoveClock
    };
  }

  restoreState(state) {
    this.board = state.board.map(row => [...row]);
    this.turn = state.turn;
    this.castling = { ...state.castling };
    this.enPassant = state.enPassant ? { ...state.enPassant } : null;
    this.halfMoveClock = state.halfMoveClock;
  }

  getPositionKey() {
    return JSON.stringify({
      b: this.board,
      t: this.turn,
      c: this.castling,
      e: this.enPassant
    });
  }

  recordPosition() {
    const key = this.getPositionKey();
    this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
  }

  inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  getColor(piece) {
    return piece ? piece[0] : null;
  }

  getType(piece) {
    return piece ? piece[1] : null;
  }

  findKing(color) {
    const kingCode = color + 'K';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === kingCode) return { r, c };
      }
    }
    return null;
  }

  isSquareAttacked(r, c, byColor) {
    // Tốt tấn công
    const pawnDir = byColor === 'w' ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = r + pawnDir, pc = c + dc;
      if (this.inBounds(pr, pc) && this.board[pr][pc] === byColor + 'P') return true;
    }

    // Mã tấn công
    const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of knightMoves) {
      const nr = r + dr, nc = c + dc;
      if (this.inBounds(nr, nc) && this.board[nr][nc] === byColor + 'N') return true;
    }

    // Vua tấn công
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const kr = r + dr, kc = c + dc;
        if (this.inBounds(kr, kc) && this.board[kr][kc] === byColor + 'K') return true;
      }
    }

    // Xe / Hậu (thẳng & ngang)
    const rookDirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of rookDirs) {
      let nr = r + dr, nc = c + dc;
      while (this.inBounds(nr, nc)) {
        const p = this.board[nr][nc];
        if (p) {
          if (p === byColor + 'R' || p === byColor + 'Q') return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }

    // Tượng / Hậu (chéo)
    const bishopDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of bishopDirs) {
      let nr = r + dr, nc = c + dc;
      while (this.inBounds(nr, nc)) {
        const p = this.board[nr][nc];
        if (p) {
          if (p === byColor + 'B' || p === byColor + 'Q') return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }

    return false;
  }

  isInCheck(color) {
    const king = this.findKing(color);
    if (!king) return false;
    const enemy = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(king.r, king.c, enemy);
  }

  generatePseudoMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece) return [];
    const color = this.getColor(piece);
    const type = this.getType(piece);
    const enemy = color === 'w' ? 'b' : 'w';
    const moves = [];

    const addMove = (toR, toC, extra = {}) => {
      moves.push({
        from: { r, c },
        to: { r: toR, c: toC },
        piece,
        captured: this.board[toR][toC],
        ...extra
      });
    };

    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;

      // Tiến 1 ô
      if (this.inBounds(r + dir, c) && !this.board[r + dir][c]) {
        if (r + dir === promoRow) {
          ['Q','R','B','N'].forEach(p => addMove(r + dir, c, { promotion: color + p }));
        } else {
          addMove(r + dir, c);
        }
        // Tiến 2 ô
        if (r === startRow && !this.board[r + 2 * dir][c]) {
          addMove(r + 2 * dir, c, { doublePawn: true });
        }
      }

      // Ăn chéo & En Passant
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (!this.inBounds(nr, nc)) continue;
        const target = this.board[nr][nc];
        if (target && this.getColor(target) === enemy) {
          if (nr === promoRow) {
            ['Q','R','B','N'].forEach(p => addMove(nr, nc, { promotion: color + p }));
          } else {
            addMove(nr, nc);
          }
        } else if (this.enPassant && this.enPassant.r === nr && this.enPassant.c === nc) {
          addMove(nr, nc, { enPassant: true, captured: enemy + 'P' });
        }
      }
    } else if (type === 'N') {
      const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of offsets) {
        const nr = r + dr, nc = c + dc;
        if (this.inBounds(nr, nc) && this.getColor(this.board[nr][nc]) !== color) {
          addMove(nr, nc);
        }
      }
    } else if (type === 'B' || type === 'R' || type === 'Q') {
      const dirs = [];
      if (type === 'R' || type === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      if (type === 'B' || type === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (this.inBounds(nr, nc)) {
          const target = this.board[nr][nc];
          if (!target) {
            addMove(nr, nc);
          } else {
            if (this.getColor(target) === enemy) addMove(nr, nc);
            break;
          }
          nr += dr; nc += dc;
        }
      }
    } else if (type === 'K') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (this.inBounds(nr, nc) && this.getColor(this.board[nr][nc]) !== color) {
            addMove(nr, nc);
          }
        }
      }

      // Nhập thành
      const homeRow = color === 'w' ? 7 : 0;
      if (r === homeRow && c === 4 && !this.isInCheck(color)) {
        // Cánh Vua (O-O)
        if (this.castling[color + 'K'] &&
            !this.board[homeRow][5] && !this.board[homeRow][6] &&
            !this.isSquareAttacked(homeRow, 5, enemy) &&
            !this.isSquareAttacked(homeRow, 6, enemy)) {
          addMove(homeRow, 6, { castle: 'K' });
        }
        // Cánh Hậu (O-O-O)
        if (this.castling[color + 'Q'] &&
            !this.board[homeRow][3] && !this.board[homeRow][2] && !this.board[homeRow][1] &&
            !this.isSquareAttacked(homeRow, 3, enemy) &&
            !this.isSquareAttacked(homeRow, 2, enemy)) {
          addMove(homeRow, 2, { castle: 'Q' });
        }
      }
    }

    return moves;
  }

  getLegalMovesForSquare(r, c) {
    const piece = this.board[r][c];
    if (!piece || this.getColor(piece) !== this.turn) return [];
    const pseudo = this.generatePseudoMoves(r, c);
    return pseudo.filter(move => {
      const saved = this.cloneState();
      this.applyMoveRaw(move);
      const valid = !this.isInCheck(this.getColor(piece));
      this.restoreState(saved);
      return valid;
    });
  }

  getAllLegalMoves(color = this.turn) {
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.getColor(this.board[r][c]) === color) {
          all.push(...this.getLegalMovesForSquare(r, c));
        }
      }
    }
    return all;
  }

  applyMoveRaw(move) {
    const { from, to, piece, promotion, enPassant, castle, doublePawn } = move;
    const color = this.getColor(piece);
    const type = this.getType(piece);

    this.board[to.r][to.c] = promotion || piece;
    this.board[from.r][from.c] = null;

    if (enPassant) {
      const capRow = color === 'w' ? to.r + 1 : to.r - 1;
      this.board[capRow][to.c] = null;
    }

    if (castle === 'K') {
      this.board[from.r][5] = this.board[from.r][7];
      this.board[from.r][7] = null;
    } else if (castle === 'Q') {
      this.board[from.r][3] = this.board[from.r][0];
      this.board[from.r][0] = null;
    }

    // Cập nhật quyền nhập thành
    if (type === 'K') {
      this.castling[color + 'K'] = false;
      this.castling[color + 'Q'] = false;
    }
    if (from.r === 7 && from.c === 0) this.castling.wQ = false;
    if (from.r === 7 && from.c === 7) this.castling.wK = false;
    if (from.r === 0 && from.c === 0) this.castling.bQ = false;
    if (from.r === 0 && from.c === 7) this.castling.bK = false;
    if (to.r === 7 && to.c === 0) this.castling.wQ = false;
    if (to.r === 7 && to.c === 7) this.castling.wK = false;
    if (to.r === 0 && to.c === 0) this.castling.bQ = false;
    if (to.r === 0 && to.c === 7) this.castling.bK = false;

    this.enPassant = doublePawn ? { r: (from.r + to.r) / 2, c: from.c } : null;
  }

  makeMove(move) {
    const prevState = this.cloneState();
    const notation = this.buildNotation(move);

    if (this.getType(move.piece) === 'P' || move.captured) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    this.applyMoveRaw(move);
    this.turn = this.turn === 'w' ? 'b' : 'w';

    const status = this.getGameStatus();
    let finalNotation = notation;
    if (status.state === 'checkmate') finalNotation += '#';
    else if (this.isInCheck(this.turn)) finalNotation += '+';

    this.history.push({
      move,
      prevState,
      notation: finalNotation
    });

    this.recordPosition();
    return status;
  }

  undoMove() {
    if (this.history.length === 0) return false;
    const currentKey = this.getPositionKey();
    if (this.positionCounts[currentKey]) {
      this.positionCounts[currentKey]--;
    }
    const last = this.history.pop();
    this.restoreState(last.prevState);
    return true;
  }

  buildNotation(move) {
    if (move.castle === 'K') return 'O-O';
    if (move.castle === 'Q') return 'O-O-O';
    const files = 'abcdefgh';
    const type = this.getType(move.piece);
    const toSq = files[move.to.c] + (8 - move.to.r);
    let str = '';
    if (type !== 'P') str += type;
    if (move.captured) {
      if (type === 'P') str += files[move.from.c];
      str += 'x';
    }
    str += toSq;
    if (move.promotion) str += '=' + this.getType(move.promotion);
    return str;
  }

  isInsufficientMaterial() {
    const pieces = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c]) pieces.push(this.board[r][c]);
      }
    }
    if (pieces.length === 2) return true; // K vs K
    if (pieces.length === 3) {
      return pieces.some(p => p[1] === 'B' || p[1] === 'N'); // K+B vs K hoặc K+N vs K
    }
    return false;
  }

  getGameStatus() {
    const legalMoves = this.getAllLegalMoves(this.turn);
    const inCheck = this.isInCheck(this.turn);

    if (legalMoves.length === 0) {
      if (inCheck) {
        return {
          over: true,
          state: 'checkmate',
          winner: this.turn === 'w' ? 'Đen' : 'Trắng',
          reason: `Chiếu hết! Quân ${this.turn === 'w' ? 'Đen' : 'Trắng'} giành chiến thắng.`
        };
      }
      return {
        over: true,
        state: 'stalemate',
        winner: null,
        reason: 'Hòa cờ do hết nước đi hợp lệ (Stalemate).'
      };
    }

    if (this.isInsufficientMaterial()) {
      return {
        over: true,
        state: 'draw',
        winner: null,
        reason: 'Hòa cờ do không đủ lực lượng chiếu hết.'
      };
    }

    if (this.halfMoveClock >= 100) {
      return {
        over: true,
        state: 'draw',
        winner: null,
        reason: 'Hòa cờ theo luật 50 nước không ăn quân hoặc đẩy tốt.'
      };
    }

    const key = this.getPositionKey();
    if ((this.positionCounts[key] || 0) >= 3) {
      return {
        over: true,
        state: 'draw',
        winner: null,
        reason: 'Hòa cờ do lặp lại thế cờ 3 lần.'
      };
    }

    return {
      over: false,
      state: inCheck ? 'check' : 'playing',
      reason: inCheck ? 'Chiếu tướng!' : 'Trận đấu đang diễn ra'
    };
  }
}
