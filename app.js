// Điều khiển giao diện, kéo thả quân cờ, đồng hồ tính giờ, FEN, gợi ý & âm thanh
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
    this.onlineRole = null;
    this.onlineSeq = 0;
    this.isApplyingRemote = false;

    this.clockInterval = null;
    this.timeLeft = { w: null, b: null };
    this.increment = 0;

    this.cacheDOM();
    this.bindEvents();
    this.setupClockFromSelect();
    this.syncOrientationWithPlayerSide();
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
    this.topClockEl = document.getElementById('topClock');
    this.bottomClockEl = document.getElementById('bottomClock');

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

    this.btnUndo.addEventListener('click', () => {
      if (this.onlineRole) { this.statusEl.textContent = 'Không thể đi lại trong ván online.'; return; }
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
      if (this.onlineRole) { this.statusEl.textContent = 'Gợi ý được tắt trong ván online.'; return; }
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
    if (this.onlineRole) { this.statusEl.textContent = 'Trong phòng online, chỉ chủ phòng có thể khởi tạo ván mới.'; return; }
    this.engine.reset();
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
    if (this.isAiThinking || this.gameEndedByTimeout || this.onlineSyncPending) return false;
    if (this.engine.getGameStatus().over) return false;
    if (this.gameModeEl.value === 'pve' && this.engine.turn !== this.getHumanColor()) return false;
    if (this.onlineRole && this.engine.turn !== (this.onlineRole === 'host' ? 'w' : 'b')) return false;
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

    if (window.OnlineChess?.active && !this.isApplyingRemote) {
      const seq = this.onlineSeq;
      this.onlineSyncPending = true;
      const payload = { fen: this.engine.exportFEN(), history: this.engine.history.map(h => ({ move: h.move, notation: h.notation })) };
      window.OnlineChess.publishMove(payload, seq).then(ok => { if (ok) this.onlineSeq = Math.max(this.onlineSeq, seq + 1); else this.statusEl.textContent = 'Đồng bộ bị từ chối; hãy kiểm tra kết nối.'; }).catch(err => { this.statusEl.textContent = 'Lỗi đồng bộ: ' + err.message; }).finally(() => { this.onlineSyncPending = false; });
    }

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

  enterOnlineGame(role) {
    this.onlineRole = role; this.onlineSyncPending = false;
    this.gameModeEl.value = 'pvp'; this.gameModeEl.disabled = true;
    this.aiLevelEl.style.display = 'none'; this.playerSideEl.style.display = 'none';
    this.btnNewGame.disabled = true; this.btnUndo.disabled = true; this.btnHint.disabled = true;
    this.btnLoadFen.disabled = true;
    this.engine.reset(); this.onlineSeq = 0; this.selectedSquare = null; this.legalMoves = [];
    this.hintMove = null; this.isAiThinking = false; this.gameEndedByTimeout = false;
    this.gameOverModal.classList.add('hidden'); this.promoModal.classList.add('hidden');
    this.flipped = role === 'guest'; this.setupClockFromSelect(); this.render();
    this.statusEl.textContent = role === 'host' ? 'Online: Bạn cầm quân Trắng.' : 'Online: Bạn cầm quân Đen.';
  }

  exitOnlineGame() {
    this.onlineRole = null; this.onlineSeq = 0; this.onlineSyncPending = false; this.gameModeEl.value = 'pve'; this.gameModeEl.disabled = false;
    this.btnNewGame.disabled = false; this.btnUndo.disabled = false; this.btnHint.disabled = false; this.btnLoadFen.disabled = false;
    this.aiLevelEl.style.display = 'inline-block'; this.playerSideEl.style.display = 'inline-block';
    this.newGame();
  }

  receiveOnlineState(game, role) {
    if (!game?.fen || !this.onlineRole) return;
    if (Number(game.seq || 0) <= this.onlineSeq) return;
    this.isApplyingRemote = true;
    let loaded = false;
    // Replay legal moves from the initial position to retain repetition/history data.
    this.engine.reset();
    const remoteHistory = game.history || [];
    for (const entry of remoteHistory) {
      const m = entry.move;
      if (!m?.from || !m?.to) { loaded = false; break; }
      const legal = this.engine.getLegalMovesForSquare(m.from.r, m.from.c);
      const match = legal.find(x => x.to.r === m.to.r && x.to.c === m.to.c && (x.promotion || null) === (m.promotion || null));
      if (!match) { loaded = false; break; }
      this.engine.makeMove(match); loaded = true;
    }
    const replayMatches = loaded && this.engine.exportFEN() === game.fen;
    if (!replayMatches) loaded = this.engine.loadFEN(game.fen);
    if (loaded) {
      // If replay failed, still display move list/captured pieces from the received payload.
      if (!replayMatches) this.engine.history = remoteHistory.map(h => ({ move: h.move, notation: h.notation || '', prevState: null }));
      this.onlineSeq = Number(game.seq || 0); this.selectedSquare = null; this.legalMoves = []; this.hintMove = null;
      this.render();
      const status = this.engine.getGameStatus();
      if (status.over) this.showGameOver(status);
      else this.statusEl.textContent = this.engine.turn === (role === 'host' ? 'w' : 'b') ? 'Đến lượt bạn.' : 'Đang chờ đối thủ đi...';
    }
    this.isApplyingRemote = false;
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
          pieceDiv.innerHTML = PIECE_SVGS[piece];

          const isOwnPiece = this.engine.getColor(piece) === this.engine.turn;
          const canDrag = isOwnPiece && !this.isAiThinking && !this.gameEndedByTimeout &&
            (this.gameModeEl.value === 'pvp' || this.engine.turn === this.getHumanColor()) &&
            (!this.onlineRole || this.engine.turn === (this.onlineRole === 'host' ? 'w' : 'b'));
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
    if (!this.isAiThinking && !this.gameEndedByTimeout) {
      this.statusEl.textContent = status.reason;
    }

    const isPve = this.gameModeEl.value === 'pve';
    const humanColor = this.getHumanColor();
    const topColor = this.flipped ? 'w' : 'b';
    const bottomColor = this.flipped ? 'b' : 'w';

    const labelFor = (color) => {
      if (this.onlineRole) return color === (this.onlineRole === 'host' ? 'w' : 'b') ? `Bạn (${color === 'w' ? 'Trắng' : 'Đen'})` : `Đối thủ (${color === 'w' ? 'Trắng' : 'Đen'})`;
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

    this.topCapturedEl.innerHTML = topList.map(p => PIECE_SVGS[p]).join('');
    this.bottomCapturedEl.innerHTML = bottomList.map(p => PIECE_SVGS[p]).join('');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.chessApp = new ChessApp();
});
