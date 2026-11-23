// Điều khiển giao diện, kéo thả quân cờ, đồng hồ tính giờ, FEN, gợi ý, âm thanh & chế độ chơi đặc biệt
// Cột của từng loại quân trong ảnh sprite vn_pieces.png (hàng trên: Đỏ = Trắng, hàng dưới: Xanh = Đen)
const VN_PIECE_COLS = { K: 0, Q: 1, R: 2, B: 3, N: 4, P: 5 };

class ChessApp {
  constructor() {
    this.engine = new ChessEngine();
    this.ai = new ChessAI();

    this.selectedSquare = null;
    this.legalMoves = [];
    this.hintMove = null;
    this.flipped = false;
    this.soundEnabled = true;
    this.isAiThinking = false;
    this.gameEndedByTimeout = false;
    this.audioCtx = null;

    this.clockInterval = null;
    this.timeLeft = { w: null, b: null };
    this.increment = 0;

    this.cacheDOM();
    this.bindEvents();
    this.syncSpecialModeFromSelect();
    this.setupClockFromSelect();
    this.syncOrientationWithPlayerSide();
    this.render();
  }

  cacheDOM() {
    this.boardEl = document.getElementById('chessBoard');
    this.turnEl = document.getElementById('turnIndicator');
    this.statusEl = document.getElementById('gameStatus');
    this.modeBadgeEl = document.getElementById('modeBadge');
    this.moveListEl = document.getElementById('moveList');
    this.topCapturedEl = document.getElementById('topCaptured');
    this.bottomCapturedEl = document.getElementById('bottomCaptured');
    this.topNameEl = document.getElementById('topPlayerName');
    this.bottomNameEl = document.getElementById('bottomPlayerName');
    this.topClockEl = document.getElementById('topClock');
    this.bottomClockEl = document.getElementById('bottomClock');

    this.specialModeEl = document.getElementById('specialMode');
    this.gameModeEl = document.getElementById('gameMode');
    this.playerSideEl = document.getElementById('playerSide');
    this.aiLevelEl = document.getElementById('aiLevel');
    this.timeControlEl = document.getElementById('timeControl');
    this.boardThemeEl = document.getElementById('boardTheme');

    this.btnNewGame = document.getElementById('btnNewGame');
    this.btnUndo = document.getElementById('btnUndo');
    this.btnHint = document.getElementById('btnHint');
    this.btnFlip = document.getElementById('btnFlip');
    this.btnSound = document.getElementById('btnSound');

    this.fenInputEl = document.getElementById('fenInput');
    this.btnCopyFen = document.getElementById('btnCopyFen');
    this.btnLoadFen = document.getElementById('btnLoadFen');

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
    this.gameOverModal.addEventListener('click', e => { if (e.target === this.gameOverModal) this.gameOverModal.classList.add('hidden'); });

    this.btnUndo.addEventListener('click', () => {
      if (this.isAiThinking || this.gameEndedByTimeout) return;
      const humanColor = this.getHumanColor();
      if (this.gameModeEl.value === 'pve' && this.engine.turn === humanColor && this.engine.history.length >= 2) {
        this.engine.undoMove();
        this.engine.undoMove();
      } else {
        this.engine.undoMove();
      }
      this.selectedSquare = null;
      this.legalMoves = [];
      this.hintMove = null;
      this.render();
    });

    this.btnHint.addEventListener('click', () => {
      if (this.isAiThinking || this.gameEndedByTimeout) return;
      const status = this.engine.getGameStatus();
      if (status.over) return;
      const best = this.ai.getBestMove(this.engine, 2);
      if (best) {
        this.hintMove = best;
        this.statusEl.textContent = `Gợi ý: ${this.engine.buildNotation(best)}`;
        this.renderBoard();
      }
    });

    this.btnFlip.addEventListener('click', () => {
      this.flipped = !this.flipped;
      this.render();
    });

    this.btnSound.addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      this.btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
    });

    this.boardThemeEl.addEventListener('change', () => {
      document.body.className = this.boardThemeEl.value;
    });

    if (this.specialModeEl) {
      this.specialModeEl.addEventListener('change', () => {
        this.newGame();
      });
    }

    this.gameModeEl.addEventListener('change', () => {
      const isPve = this.gameModeEl.value === 'pve';
      this.aiLevelEl.style.display = isPve ? 'inline-block' : 'none';
      this.playerSideEl.style.display = isPve ? 'inline-block' : 'none';
      this.newGame();
    });

    this.playerSideEl.addEventListener('change', () => {
      this.newGame();
    });

    this.timeControlEl.addEventListener('change', () => {
      this.newGame();
    });

    this.btnCopyFen.addEventListener('click', () => {
      const fen = this.engine.exportFEN();
      this.fenInputEl.value = fen;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fen).catch(() => {});
      }
      this.statusEl.textContent = 'Đã sao chép chuỗi FEN!';
    });

    this.btnLoadFen.addEventListener('click', () => {
      const ok = this.engine.loadFEN(this.fenInputEl.value);
      if (!ok) {
        this.statusEl.textContent = 'Chuỗi FEN không hợp lệ!';
        return;
      }
      this.syncSpecialModeFromSelect();
      this.selectedSquare = null;
      this.legalMoves = [];
      this.hintMove = null;
      this.isAiThinking = false;
      this.gameEndedByTimeout = false;
      this.gameOverModal.classList.add('hidden');
      this.setupClockFromSelect();
      this.render();
      this.statusEl.textContent = 'Đã nạp thế cờ từ FEN.';
      this.maybeTriggerAiTurn();
    });
  }

  // Trả về HTML của quân cờ: ảnh sprite (chế độ Việt Nam) hoặc SVG chuẩn
  pieceHTML(piece) {
    if (this.isVietnam) {
      const col = VN_PIECE_COLS[piece[1]];
      const row = piece[0] === 'w' ? 0 : 1;
      return `<span class="vn-piece" style="background-position:${col * 20}% ${row * 100}%"></span>`;
    }
    return PIECE_SVGS[piece];
  }

  syncSpecialModeFromSelect() {
    const mode = this.specialModeEl ? this.specialModeEl.value : 'classic';
    this.isVietnam = mode === 'vietnam';
    const isParasite = mode === 'parasite';
    if (this.engine.parasite) {
      this.engine.parasite.setEnabled(isParasite);
    }
    if (this.modeBadgeEl) {
      this.modeBadgeEl.textContent = isParasite ? '⚡ Chế độ: Ký Sinh Kỹ Năng' : this.isVietnam ? '🇻🇳 Chế độ: Cờ Vua Việt Nam' : 'Chế độ: Cờ Vua Chuẩn';
      this.modeBadgeEl.classList.toggle('parasite-active', isParasite);
    }
  }

  getHumanColor() {
    if (this.gameModeEl.value === 'pvp') return this.engine.turn;
    return this.playerSideEl.value === 'b' ? 'b' : 'w';
  }

  getAiColor() {
    return this.getHumanColor() === 'w' ? 'b' : 'w';
  }

  syncOrientationWithPlayerSide() {
    if (this.gameModeEl.value === 'pve') {
      this.flipped = this.playerSideEl.value === 'b';
    }
  }

  setupClockFromSelect() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }

    const val = this.timeControlEl.value;
    if (val === 'none') {
      this.timeLeft = { w: null, b: null };
      this.increment = 0;
      this.topClockEl.classList.add('hidden');
      this.bottomClockEl.classList.add('hidden');
      return;
    }

    const [baseStr, incStr] = val.split('+');
    const baseSec = parseInt(baseStr, 10);
    this.increment = parseInt(incStr || '0', 10);
    this.timeLeft = { w: baseSec, b: baseSec };

    this.topClockEl.classList.remove('hidden');
    this.bottomClockEl.classList.remove('hidden');
    this.updateClockDisplay();

    this.clockInterval = setInterval(() => {
      if (this.gameEndedByTimeout || this.isAiThinking) return;
      const status = this.engine.getGameStatus();
      if (status.over) {
        clearInterval(this.clockInterval);
        return;
      }

      const activeColor = this.engine.turn;
      if (this.timeLeft[activeColor] !== null) {
        this.timeLeft[activeColor] = Math.max(0, this.timeLeft[activeColor] - 1);
        this.updateClockDisplay();

        if (this.timeLeft[activeColor] <= 0) {
          clearInterval(this.clockInterval);
          this.gameEndedByTimeout = true;
          const winner = activeColor === 'w' ? 'Đen' : 'Trắng';
          this.showGameOver({
            over: true,
            winner,
            reason: `Hết giờ! Quân ${activeColor === 'w' ? 'Trắng' : 'Đen'} hết thời gian, ${winner} thắng.`
          });
        }
      }
    }, 1000);
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  updateClockDisplay() {
    if (this.timeLeft.w === null) return;
    const topColor = this.flipped ? 'w' : 'b';
    const bottomColor = this.flipped ? 'b' : 'w';

    this.topClockEl.textContent = this.formatTime(this.timeLeft[topColor]);
    this.bottomClockEl.textContent = this.formatTime(this.timeLeft[bottomColor]);

    this.topClockEl.classList.toggle('active', this.engine.turn === topColor);
    this.bottomClockEl.classList.toggle('active', this.engine.turn === bottomColor);

    this.topClockEl.classList.toggle('low-time', this.timeLeft[topColor] <= 20);
    this.bottomClockEl.classList.toggle('low-time', this.timeLeft[bottomColor] <= 20);
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
    this.syncSpecialModeFromSelect();
    this.selectedSquare = null;
    this.legalMoves = [];
    this.hintMove = null;
    this.isAiThinking = false;
    this.gameEndedByTimeout = false;
    this.promoModal.classList.add('hidden');
    this.gameOverModal.classList.add('hidden');
    this.syncOrientationWithPlayerSide();
    this.setupClockFromSelect();
    this.render();
    this.maybeTriggerAiTurn();
  }

  canHumanInteractSquare(r, c) {
    if (this.isAiThinking || this.gameEndedByTimeout) return false;
    if (this.engine.getGameStatus().over) return false;
    if (this.gameModeEl.value === 'pve' && this.engine.turn !== this.getHumanColor()) return false;
    return true;
  }

  handleSquareClick(r, c) {
    if (!this.canHumanInteractSquare(r, c)) return;

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
    this.renderBoard();
  }

  handleDropMove(fromR, fromC, toR, toC) {
    if (!this.canHumanInteractSquare(fromR, fromC)) return;
    const movesFromPiece = this.engine.getLegalMovesForSquare(fromR, fromC);
    const matchingMoves = movesFromPiece.filter(m => m.to.r === toR && m.to.c === toC);
    if (matchingMoves.length === 0) return;

    this.selectedSquare = { r: fromR, c: fromC };
    this.legalMoves = movesFromPiece;
    if (matchingMoves.length > 1) {
      this.showPromotionModal(matchingMoves);
    } else {
      this.executeMove(matchingMoves[0]);
    }
  }

  showPromotionModal(moves) {
    this.promoOptionsEl.innerHTML = '';
    moves.forEach(move => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.innerHTML = this.pieceHTML(move.promotion);
      btn.addEventListener('click', () => {
        this.promoModal.classList.add('hidden');
        this.executeMove(move);
      });
      this.promoOptionsEl.appendChild(btn);
    });
    this.promoModal.classList.remove('hidden');
  }

  executeMove(move) {
    const movedColor = this.engine.turn;
    const status = this.engine.makeMove(move);

    if (this.timeLeft[movedColor] !== null && this.increment > 0) {
      this.timeLeft[movedColor] += this.increment;
    }

    this.selectedSquare = null;
    this.legalMoves = [];
    this.hintMove = null;

    if (status.state === 'check' || status.state === 'checkmate') {
      this.playSound('check');
    } else if (move.captured) {
      this.playSound('capture');
    } else {
      this.playSound('move');
    }

    this.render();

    if (status.over) {
      if (this.clockInterval) clearInterval(this.clockInterval);
      this.showGameOver(status);
      return;
    }

    this.maybeTriggerAiTurn();
  }

  maybeTriggerAiTurn() {
    if (this.gameModeEl.value !== 'pve') return;
    if (this.engine.turn !== this.getAiColor()) return;
    if (this.engine.getGameStatus().over || this.gameEndedByTimeout) return;

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
    this.updateClockDisplay();
    if (this.fenInputEl) {
      this.fenInputEl.value = this.engine.exportFEN();
    }
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
        if (this.hintMove && ((this.hintMove.from.r === r && this.hintMove.from.c === c) || (this.hintMove.to.r === r && this.hintMove.to.c === c))) {
          sq.classList.add('hint-sq');
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
          pieceDiv.innerHTML = this.pieceHTML(piece);

          if (this.engine.parasite) {
            this.engine.parasite.decorateSquare(sq, pieceDiv, r, c);
          }

          const isOwnPiece = this.engine.getColor(piece) === this.engine.turn;
          const canDrag = isOwnPiece && !this.isAiThinking && !this.gameEndedByTimeout &&
            (this.gameModeEl.value === 'pvp' || this.engine.turn === this.getHumanColor());
          pieceDiv.draggable = canDrag;

          pieceDiv.addEventListener('dragstart', (e) => {
            if (!canDrag) {
              e.preventDefault();
              return;
            }
            this.selectedSquare = { r, c };
            this.legalMoves = this.engine.getLegalMovesForSquare(r, c);
            e.dataTransfer.setData('text/plain', `${r},${c}`);
          });

          sq.appendChild(pieceDiv);
        }

        sq.addEventListener('dragover', (e) => {
          e.preventDefault();
        });

        sq.addEventListener('drop', (e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData('text/plain');
          if (!raw) return;
          const [fromR, fromC] = raw.split(',').map(Number);
          this.handleDropMove(fromR, fromC, r, c);
        });

        const legalTargetMove = this.legalMoves.find(m => m.to.r === r && m.to.c === c);
        if (legalTargetMove) {
          const hint = document.createElement('div');
          hint.className = piece ? 'hint-capture' : 'hint-dot';
          if (this.engine.parasite) {
            this.engine.parasite.decorateHint(hint, legalTargetMove);
          }
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
    if (!this.isAiThinking && !this.gameEndedByTimeout) {
      this.statusEl.textContent = status.reason;
    }

    const isPve = this.gameModeEl.value === 'pve';
    const humanColor = this.getHumanColor();
    const topColor = this.flipped ? 'w' : 'b';
    const bottomColor = this.flipped ? 'b' : 'w';

    const labelFor = (color) => {
      if (!isPve) return color === 'w' ? 'Người chơi 1 (Trắng)' : 'Người chơi 2 (Đen)';
      if (color === humanColor) return color === 'w' ? 'Bạn (Trắng)' : 'Bạn (Đen)';
      return color === 'w' ? 'Máy (Trắng)' : 'Máy (Đen)';
    };

    this.topNameEl.textContent = labelFor(topColor);
    this.bottomNameEl.textContent = labelFor(bottomColor);
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

    this.topCapturedEl.innerHTML = topList.map(p => this.pieceHTML(p)).join('');
    this.bottomCapturedEl.innerHTML = bottomList.map(p => this.pieceHTML(p)).join('');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.chessApp = new ChessApp();
});
