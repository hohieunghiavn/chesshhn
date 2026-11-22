// Module tính năng riêng: Cờ Vua Ký Sinh (Hấp Thụ Kỹ Năng Sau Khi Ăn Quân)
class ParasiteFeature {
  constructor() {
    this.enabled = false;
    this.parasites = {}; // Key: `${r},${c}` -> 'P' | 'N' | 'B' | 'R' | 'Q'
    this.labels = {
      P: 'Tốt (tiến thẳng 1 ô)',
      N: 'Mã (nhảy chữ L)',
      B: 'Tượng (trượt chéo)',
      R: 'Xe (trượt thẳng)',
      Q: 'Hậu (thẳng & chéo)'
    };
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.reset();
    }
  }

  reset() {
    this.parasites = {};
  }

  getAt(r, c) {
    if (!this.enabled) return null;
    return this.parasites[`${r},${c}`] || null;
  }

  cloneState() {
    return {
      enabled: this.enabled,
      parasites: { ...this.parasites }
    };
  }

  restoreState(state) {
    if (!state) {
      this.enabled = false;
      this.parasites = {};
      return;
    }
    this.enabled = Boolean(state.enabled);
    this.parasites = state.parasites ? { ...state.parasites } : {};
  }

  // Sinh thêm các nước đi hợp lệ từ kỹ năng ký sinh của quân tại (r, c)
  getExtraPseudoMoves(engine, r, c, existingMoves, addMoveFn) {
    if (!this.enabled) return;
    const parasite = this.getAt(r, c);
    const piece = engine.board[r][c];
    if (!parasite || !piece) return;

    const color = engine.getColor(piece);
    const type = engine.getType(piece);
    if (parasite === type) return;

    const enemy = color === 'w' ? 'b' : 'w';
    const seen = new Set(existingMoves.map(m => `${m.to.r},${m.to.c}`));

    const pushExtra = (toR, toC, extra = {}) => {
      const key = `${toR},${toC}`;
      if (!seen.has(key)) {
        seen.add(key);
        addMoveFn(toR, toC, { ...extra, usedParasite: parasite });
      }
    };

    if (parasite === 'P') {
      const dir = color === 'w' ? -1 : 1;
      if (engine.inBounds(r + dir, c) && !engine.board[r + dir][c]) {
        pushExtra(r + dir, c);
      }
    } else if (parasite === 'N') {
      const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of offsets) {
        const nr = r + dr, nc = c + dc;
        if (engine.inBounds(nr, nc) && engine.getColor(engine.board[nr][nc]) !== color) {
          pushExtra(nr, nc);
        }
      }
    } else if (parasite === 'B' || parasite === 'R' || parasite === 'Q') {
      const dirs = [];
      if (parasite === 'R' || parasite === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      if (parasite === 'B' || parasite === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (engine.inBounds(nr, nc)) {
          const target = engine.board[nr][nc];
          if (!target) {
            pushExtra(nr, nc);
          } else {
            if (engine.getColor(target) === enemy) pushExtra(nr, nc);
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    }
  }

  // Cập nhật kỹ năng ký sinh sau khi 1 nước đi được áp dụng lên bàn cờ
  onMoveApplied(engine, move) {
    if (!this.enabled) return;

    const prev = { ...this.parasites };
    const fromKey = `${move.from.r},${move.from.c}`;
    const toKey = `${move.to.r},${move.to.c}`;
    const movedSkill = prev[fromKey] || null;

    const next = {};
    for (const [key, skill] of Object.entries(prev)) {
      if (key !== fromKey && key !== toKey) {
        next[key] = skill;
      }
    }

    // Nếu quân vừa di chuyển có kỹ năng ký sinh và vừa dùng nó -> tiêu hao;
    // nếu không dùng kỹ năng ký sinh -> giữ tiếp cho đúng lượt kế tiếp.
    if (movedSkill && !move.usedParasite) {
      next[toKey] = movedSkill;
    }

    // Nếu ăn được quân đối phương (trừ Vua) -> hấp thụ kỹ năng của quân bị ăn
    if (move.captured && engine.getType(move.captured) !== 'K') {
      next[toKey] = engine.getType(move.captured);
    }

    this.parasites = next;
  }

  // Điểm thưởng đánh giá thế cờ cho AI
  evaluatePieceBonus(r, c, pieceValues) {
    const skill = this.getAt(r, c);
    if (!skill) return 0;
    return Math.round((pieceValues[skill] || 100) * 0.18);
  }

  // Gắn badge hiển thị lên quân cờ trên giao diện
  decorateSquare(sq, pieceDiv, r, c) {
    const skill = this.getAt(r, c);
    if (!skill || !pieceDiv) return;
    sq.classList.add('has-parasite');
    const badge = document.createElement('span');
    badge.className = 'parasite-badge';
    badge.title = `Ký sinh: ${this.labels[skill] || skill}`;
    badge.textContent = `⚡${skill}`;
    pieceDiv.appendChild(badge);
  }

  // Tô dấu gợi ý riêng cho ô đi được bằng kỹ năng ký sinh
  decorateHint(hintEl, move) {
    if (this.enabled && move && move.usedParasite && hintEl) {
      hintEl.classList.add('parasite-hint');
    }
  }
}
