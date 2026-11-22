// Điều khiển giao diện, âm thanh Web Audio API và vòng lặp sự kiện
class ChessApp {
  constructor() {
    this.engine = new ChessEngine();
    this.ai = new ChessAI();

    this.selectedSquare = null;
    this.legalMoves = [];
    this.flipped = false;
    this.soundEnabled = true;
    this.isAiThinking = false;
    this.pendingPromotionMoves = null;
    this.audioCtx = null;

    this.cacheDOM();
    this.bindEvents();
    this.render();
  }

  cacheDOM() {
    this.boardEl = document.getElementById('chessBoard');
    this.turnEl = document.getElementById('turnIndicator');
    this.statusEl = document.getElementById('gameStatus');
    this.moveListEl = document.getElementById('moveList');
    this.topCapturedEl = document.getElementById('topCaptured');
    this.bottomCapturedEl = document.getElementById('bottomCaptured');
    this.topNameEl = document.getElementById('topPlayerName');
    this.bottomNameEl = document.getElementById('bottomPlayerName');

    this.gameModeEl = document.getElementById('gameMode');
    this.aiLevelEl = document.getElementById('aiLevel');
    this.btnNewGame = document.getElementById('btnNewGame');
    this.btnUndo = document.getElementById('btnUndo');
    this.btnFlip = document.getElementById('btnFlip');
    this.btnSound = document.getElementById('btnSound');

    this.promoModal = document.getElementById('promotionModal');
    this.promoOptionsEl = document.getElementById('promotionOptions');
    this.gameOverModal = document.getElementById('gameOverModal');
    this.gameOverTitle = document.getElementById('gameOverTitle');
    this.gameOverReason = document.getElementById('gameOverReason');
    this.btnModalNewGame = document.getElementById('btnModalNewGame');
  }

  bindEvents() {
    this.btnNewGame.addEventListener('click', () => this.newGame());
    this.btnModalNewGame.addEventListener('click', () => this.newGame());

    this.btnUndo.addEventListener('click', () => {
      if (this.isAiThinking) return;
      if (this.gameModeEl.value === 'pve' && this.engine.turn === 'w' && this.engine.history.length >= 2) {
        this.engine.undoMove();
        this.engine.undoMove();
      } else {
        this.engine.undoMove();
      }
      this.selectedSquare = null;
      this.legalMoves = [];
      this.render();
    });

    this.btnFlip.addEventListener('click', () => {
      this.flipped = !this.flipped;
      this.render();
    });

    this.btnSound.addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      this.btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
    });

    this.gameModeEl.addEventListener('change', () => {
      this.aiLevelEl.style.display = this.gameModeEl.value === 'pve' ? 'inline-block' : 'none';
      this.newGame();
    });
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (type === 'move') {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'capture') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.14);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'check') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(660, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {}
  }

  newGame() {
    this.engine.reset();
    this.selectedSquare = null;
    this.legalMoves = [];
    this.isAiThinking = false;
    this.promoModal.classList.add('hidden');
    this.gameOverModal.classList.add('hidden');
    this.render();
  }

  handleSquareClick(r, c) {
    if (this.isAiThinking) return;
    if (this.gameModeEl.value === 'pve' && this.engine.turn === 'b') return;

    const matchingMoves = this.legalMoves.filter(m => m.to.r === r && m.to.c === c);
    if (matchingMoves.length > 0) {
      if (matchingMoves.length > 1) {
        this.showPromotionModal(matchingMoves);
      } else {
        this.executeMove(matchingMoves[0]);
      }
      return;
    }

    const piece = this.engine.board[r][c];
    if (piece && this.engine.getColor(piece) === this.engine.turn) {
      this.selectedSquare = { r, c };
      this.legalMoves = this.engine.getLegalMovesForSquare(r, c);
    } else {
      this.selectedSquare = null;
      this.legalMoves = [];
    }
    this.render();
  }

  showPromotionModal(moves) {
    this.promoOptionsEl.innerHTML = '';
    moves.forEach(move => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.innerHTML = PIECE_SVGS[move.promotion];
      btn.addEventListener('click', () => {
        this.promoModal.classList.add('hidden');
        this.executeMove(move);
      });
      this.promoOptionsEl.appendChild(btn);
    });
    this.promoModal.classList.remove('hidden');
  }

  executeMove(move) {
    const status = this.engine.makeMove(move);
    this.selectedSquare = null;
    this.legalMoves = [];

    if (status.state === 'check' || status.state === 'checkmate') {
      this.playSound('check');
    } else if (move.captured) {
      this.playSound('capture');
    } else {
      this.playSound('move');
    }

    this.render();

    if (status.over) {
      this.showGameOver(status);
      return;
    }

    if (this.gameModeEl.value === 'pve' && this.engine.turn === 'b') {
      this.isAiThinking = true;
      this.statusEl.textContent = 'Máy đang suy nghĩ...';
      setTimeout(() => {
        const depth = parseInt(this.aiLevelEl.value, 10);
        const aiMove = this.ai.getBestMove(this.engine, depth);
        this.isAiThinking = false;
        if (aiMove) {
          this.executeMove(aiMove);
        }
      }, 220);
    }
  }

  showGameOver(status) {
    this.gameOverTitle.textContent = status.winner ? `Chiến Thắng: Quân ${status.winner}!` : 'Ván Đấu Hòa!';
    this.gameOverReason.textContent = status.reason;
    this.gameOverModal.classList.remove('hidden');
  }

  render() {
    this.renderBoard();
    this.renderStatus();
    this.renderHistory();
    this.renderCaptured();
  }

  renderBoard() {
    this.boardEl.innerHTML = '';
    const files = 'abcdefgh';
    const lastEntry = this.engine.history[this.engine.history.length - 1];
    const lastMove = lastEntry ? lastEntry.move : null;
    const inCheckColor = this.engine.isInCheck(this.engine.turn) ? this.engine.turn : null;
    const kingPos = inCheckColor ? this.engine.findKing(inCheckColor) : null;

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const r = this.flipped ? 7 - i : i;
        const c = this.flipped ? 7 - j : j;

        const sq = document.createElement('div');
        const isLight = (r + c) % 2 === 0;
        sq.className = `square ${isLight ? 'light' : 'dark'}`;

        if (this.selectedSquare && this.selectedSquare.r === r && this.selectedSquare.c === c) {
          sq.classList.add('selected');
        }
        if (lastMove && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c))) {
          sq.classList.add('last-move');
        }
        if (kingPos && kingPos.r === r && kingPos.c === c) {
          sq.classList.add('in-check');
        }

        if (j === 0) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord-rank';
          rankLabel.textContent = 8 - r;
          sq.appendChild(rankLabel);
        }
        if (i === 7) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord-file';
          fileLabel.textContent = files[c];
          sq.appendChild(fileLabel);
        }

        const piece = this.engine.board[r][c];
        if (piece) {
          const pieceDiv = document.createElement('div');
          pieceDiv.className = 'piece';
          pieceDiv.innerHTML = PIECE_SVGS[piece];
          sq.appendChild(pieceDiv);
        }

        const isLegalTarget = this.legalMoves.some(m => m.to.r === r && m.to.c === c);
        if (isLegalTarget) {
          const hint = document.createElement('div');
          hint.className = piece ? 'hint-capture' : 'hint-dot';
          sq.appendChild(hint);
        }

        sq.addEventListener('click', () => this.handleSquareClick(r, c));
        this.boardEl.appendChild(sq);
      }
    }
  }

  renderStatus() {
    const status = this.engine.getGameStatus();
    this.turnEl.textContent = `Lượt: ${this.engine.turn === 'w' ? 'Trắng' : 'Đen'}`;
    if (!this.isAiThinking) {
      this.statusEl.textContent = status.reason;
    }

    const isPve = this.gameModeEl.value === 'pve';
    const topColor = this.flipped ? 'w' : 'b';
    const bottomColor = this.flipped ? 'b' : 'w';

    this.topNameEl.textContent = topColor === 'b'
      ? (isPve ? 'Máy (Đen)' : 'Người chơi 2 (Đen)')
      : (isPve ? 'Bạn (Trắng)' : 'Người chơi 1 (Trắng)');

    this.bottomNameEl.textContent = bottomColor === 'w'
      ? (isPve ? 'Bạn (Trắng)' : 'Người chơi 1 (Trắng)')
      : (isPve ? 'Máy (Đen)' : 'Người chơi 2 (Đen)');
  }

  renderHistory() {
    this.moveListEl.innerHTML = '';
    for (let i = 0; i < this.engine.history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const num = document.createElement('span');
      num.className = 'move-num';
      num.textContent = `${Math.floor(i / 2) + 1}.`;

      const whiteMove = document.createElement('span');
      whiteMove.textContent = this.engine.history[i].notation;

      const blackMove = document.createElement('span');
      blackMove.textContent = this.engine.history[i + 1] ? this.engine.history[i + 1].notation : '';

      row.append(num, whiteMove, blackMove);
      this.moveListEl.appendChild(row);
    }
    this.moveListEl.scrollTop = this.moveListEl.scrollHeight;
  }

  renderCaptured() {
    const capturedByWhite = [];
    const capturedByBlack = [];
    this.engine.history.forEach(h => {
      if (h.move.captured) {
        if (h.move.piece[0] === 'w') capturedByWhite.push(h.move.captured);
        else capturedByBlack.push(h.move.captured);
      }
    });

    const topColor = this.flipped ? 'w' : 'b';
    const topList = topColor === 'w' ? capturedByWhite : capturedByBlack;
    const bottomList = topColor === 'w' ? capturedByBlack : capturedByWhite;

    this.topCapturedEl.innerHTML = topList.map(p => PIECE_SVGS[p]).join('');
    this.bottomCapturedEl.innerHTML = bottomList.map(p => PIECE_SVGS[p]).join('');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ChessApp();
});
