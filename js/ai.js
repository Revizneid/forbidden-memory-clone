/* =========================================================================
 * Forbidden Memory Web Clone — AI Opponent
 * aiNextAction(s, pIdx) -> 1 action mỗi lần gọi (để UI animate từng bước).
 * difficulty: 0 = Dễ, 1 = Thường, 2 = Khá, 3 = Giỏi, 4 = Ác mã
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const E = FM.engine, C = FM.cards;

  const ROW2 = 2, ROW1 = 1, ROW0 = 0;
  const emptySlots = p => { const out = []; for (let i = 0; i < 9; i++) if (!p.field[i]) out.push(i); return out; };
  const frontEmpty = p => [6, 7, 8].filter(i => !p.field[i]);           // row 2 (front): idx 6,7,8
  const backEmpty = p => [0, 1, 2, 3, 4, 5].filter(i => !p.field[i]);   // row 0/1: idx 0..5
  const trapCount = p => p.field.filter(x => x && x.kind === 'TRAP').length;

  // Sức mạnh cột của đối thủ: quái gần nhất trong cột (front -> sâu) ở tư thế tấn công
  function columnThreat(s, enemyIdx, col) {
    const en = s.players[enemyIdx];
    for (let row = ROW2; row >= ROW0; row--) {
      const sl = en.field[row * 3 + col];
      if (sl && sl.kind === 'MONSTER') {
        const a = sl.faceDown ? 0 : E.effAtk(s, enemyIdx, sl);
        const d = sl.faceDown ? 1300 : (sl.pos === 'ATK' ? a : E.effDef(s, enemyIdx, sl));
        return { slotIdx: row * 3 + col, atk: a, def: d, faceDown: sl.faceDown };
      }
    }
    return null;
  }

  // Tìm mục tiêu đánh: quái ngửa pos ATK, cùng cột đối thủ, ưu tiên gần nhất; cột trống => direct.
  // (không phụ thuộc phase — dùng được cả khi MAIN để AI quyết định có vào Battle hay không)
  function findTarget(s, pIdx, slotIdx) {
    const p = s.players[pIdx];
    const sl = p.field[slotIdx];
    if (!sl || sl.kind !== 'MONSTER' || sl.faceDown || sl.pos !== 'ATK' || sl.attacked) return null;
    const col = E.slotCol(slotIdx);
    const en = s.players[1 - pIdx];
    for (let row = ROW2; row >= ROW0; row--) {
      const i = row * 3 + col;
      const es = en.field[i];
      if (es && es.kind === 'MONSTER') return { target: i, direct: false };
    }
    return { target: -1, direct: true };
  }

  // Điểm số khi quái của tôi ở slotIdx tấn công (dùng cả cho chọn lúc summon & battle)
  function attackScore(s, pIdx, slotIdx, lethal) {
    const t = findTarget(s, pIdx, slotIdx);
    if (!t) return null;
    const my = s.players[pIdx].field[slotIdx];
    const myAtk = E.effAtk(s, pIdx, my);
    if (t.direct) return { score: lethal ? 10000 + myAtk : myAtk, action: { type: 'ATTACK', slotIdx } };
    const enemyIdx = 1 - pIdx;
    const dslot = s.players[enemyIdx].field[t.target];
    const dAtkPos = dslot.pos === 'ATK';
    // Tường úp: AI không biết bài là gì — đoán sức phòng thủ 1200 (đủ tham để đánh)
    const dPower = dAtkPos ? E.effAtk(s, enemyIdx, dslot) : (dslot.faceDown ? 1200 : E.effDef(s, enemyIdx, dslot));
    let score;
    if (dAtkPos) {
      if (myAtk > dPower) score = 1000 + myAtk - dPower + (dPower >= 2000 ? 400 : 0);
      else if (myAtk === dPower) score = -300 - (myAtk >= 1500 ? 400 : 0);
      else score = -800 - (dPower - myAtk);
    } else {
      if (myAtk > dPower) score = 500 + (dPower >= 2000 ? 300 : 0);
      else score = -800 - (dPower - myAtk);
    }
    return { score, action: { type: 'ATTACK', slotIdx } };
  }

  /* ---------------- MAIN phase: chọn 1 hành động ---------------- */
  function mainAction(s, pIdx) {
    const p = s.players[pIdx], enemyIdx = 1 - pIdx, e = s.players[enemyIdx];
    const diff = s.difficulty;
    const hand = p.hand;
    const enemyMonsters = E.monsterCount(e);
    const myBestFieldAtk = Math.max(0, ...p.field.map(sl => (sl && sl.kind === 'MONSTER' && !sl.faceDown && sl.pos === 'ATK') ? E.effAtk(s, pIdx, sl) : 0));

    // --- 1. Magic tấn công ---
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (c.kind !== 'MAGIC') continue;
      const md = C.magics[c.mid];
      if (md.id === 'raigeki' && enemyMonsters >= (diff >= 2 ? 1 : 2)) return { type: 'MAGIC', handIdx: i };
      if (md.id === 'darkHole' && (enemyMonsters >= 2 || (enemyMonsters >= 1 && diff >= 3 && emptySlots(p).length === 0))) {
        const theirPower = e.field.reduce((a, sl) => a + (sl && sl.kind === 'MONSTER' && !sl.faceDown ? E.effAtk(s, enemyIdx, sl) : 0), 0);
        const myPower = p.field.reduce((a, sl) => a + (sl && sl.kind === 'MONSTER' && !sl.faceDown && sl.pos === 'ATK' ? E.effAtk(s, pIdx, sl) : 0), 0);
        if (diff === 0 || theirPower > myPower + 500 || enemyMonsters >= 3) return { type: 'MAGIC', handIdx: i };
      }
      if (md.id === 'fissure' && enemyMonsters > 0 && diff >= 1) {
        // có quái ngửa ATK thấp thì dùng
        const hasWeak = e.field.some(sl => sl && sl.kind === 'MONSTER' && !sl.faceDown && E.effAtk(s, enemyIdx, sl) <= 1500);
        if (hasWeak) return { type: 'MAGIC', handIdx: i };
      }
      if (md.id === 'dianKeto' && p.lp <= 3500) return { type: 'MAGIC', handIdx: i };
      // Equip
      if (md.atk && diff >= 1) {
        for (let si = 0; si < 9; si++) {
          const sl = p.field[si];
          if (sl && sl.kind === 'MONSTER' && !sl.faceDown && md.match(E.mdata(sl.card))) return { type: 'MAGIC', handIdx: i, targetSlot: si };
        }
      }
      // Terrain
      if (md.terrain && diff >= 1 && s.turnNo <= 3 && emptySlots(p).length >= 2) {
        if (!s.players.some(pl => pl.terrains.includes(md.id))) return { type: 'MAGIC', handIdx: i };
      }
    }

    // --- 2. SET bẫy ---
    if (diff >= 1 && trapCount(p) < 2) {
      for (let i = 0; i < hand.length; i++) {
        if (hand[i].kind === 'TRAP') {
          const slots = emptySlots(p);
          if (slots.length) return { type: 'SET_TRAP', handIdx: i, slotIdx: slots[slots.length - 1] }; // đặt ô sau cùng
        }
      }
    }

    // --- 3. Fusion ---
    if (diff >= 1) {
      const maxFusePerTurn = diff >= 3 ? 3 : 2;
      if (p._fusTurn !== s.turnNo) { p._fusTurn = s.turnNo; p._fusCount = 0; }
      if (p._fusCount < maxFusePerTurn) {
        let best = null;
        const consider = (a, b, fieldFusion) => {
          const r = E.peekFusion(s, pIdx, a, b);
          if (!r) return;
          const handBestAtk = Math.max(0, ...hand.filter(E.isMon).map(c => C.monsters[c.id].atk));
          const threshold = fieldFusion ? 350 : 200;
          const gain = r.atk - Math.max(handBestAtk, myBestFieldAtk);
          if (gain > threshold && r.atk >= 1500) {
            if (!best || r.atk > best.r.atk) best = { a, b, r, fieldFusion };
          }
        };
        for (let i = 0; i < hand.length; i++) {
          if (hand[i].kind !== 'MONSTER') continue;
          for (let j = i + 1; j < hand.length; j++) {
            if (hand[j].kind !== 'MONSTER') continue;
            consider({ src: 'HAND', idx: i }, { src: 'HAND', idx: j }, false);
          }
          for (let si = 0; si < 9; si++) {
            const sl = p.field[si];
            if (sl && sl.kind === 'MONSTER' && !sl.faceDown && E.effAtk(s, pIdx, sl) < 2000) {
              consider({ src: 'HAND', idx: i }, { src: 'FIELD', idx: si }, true);
            }
          }
        }
        if (best) {
          let targetSlot = null;
          if (!best.fieldFusion) {
            const fe = frontEmpty(p);
            targetSlot = fe.length ? fe[0] : (emptySlots(p)[0] !== undefined ? emptySlots(p)[0] : null);
          }
          if (targetSlot != null) {
            p._fusCount++;
            return { type: 'FUSION', a: best.a, b: best.b, targetSlot };
          }
        }
      }
    }

    // --- 4. Đổi tư thế (lật úp mạnh / DEF mạnh lên ATK) ---
    if (diff >= 1) {
      for (let si = 0; si < 9; si++) {
        const sl = p.field[si];
        if (!sl || sl.kind !== 'MONSTER') continue;
        const m = E.mdata(sl.card);
        if (sl.faceDown && sl.pos === 'DEF' && m.atk >= 1600) return { type: 'CHANGE_POS', slotIdx: si };
        if (!sl.faceDown && sl.pos === 'DEF' && m.atk >= 1800 && E.effAtk(s, pIdx, sl) > 1800) return { type: 'CHANGE_POS', slotIdx: si };
      }
    }

    // --- 5. Summon/Set ---
    const fe = frontEmpty(p), be = backEmpty(p);
    const monIdxs = hand.map((c, i) => ({ c, i })).filter(x => x.c.kind === 'MONSTER');
    if (monIdxs.length) {
      monIdxs.sort((a, b) => C.monsters[b.c.id].atk - C.monsters[a.c.id].atk);
      const strongest = monIdxs[0];
      const mAtk = C.monsters[strongest.c.id].atk;
      const weakest = monIdxs[monIdxs.length - 1];
      const wAtk = C.monsters[weakest.c.id].atk;
      const fdCount = p.field.filter(sl => sl && sl.kind === 'MONSTER' && sl.faceDown).length;
      const wallCap = diff >= 1 ? 3 : 4;

      // Tìm cột front tốt nhất: nơi quái mạnh nhất thắng hiện tại
      if (fe.length && (mAtk >= 1500 || diff === 0 || fdCount >= wallCap)) {
        let bestSlot = fe[0], bestScore = -Infinity;
        for (const si of fe) {
          const col = E.slotCol(si);
          const th = columnThreat(s, enemyIdx, col);
          let sc = 0;
          if (!th) sc = 5000 + mAtk;                    // cột trống => direct
          else if (mAtk > th.def || (th.faceDown && mAtk > 1300)) sc = 3000 + mAtk - th.def;
          else if (mAtk <= th.def && !th.faceDown && mAtk > th.atk) sc = 1500;
          else sc = 500 - th.def;
          if (sc > bestScore) { bestScore = sc; bestSlot = si; }
        }
        return { type: 'SUMMON', handIdx: strongest.i, slotIdx: bestSlot, faceDown: false };
      }
      // Quái yếu: set úp làm tường front (chặn direct) — tối đa wallCap tường
      if (fe.length && wAtk < 1500 && diff >= 1 && fdCount < wallCap) return { type: 'SUMMON', handIdx: weakest.i, slotIdx: fe[fe.length - 1], faceDown: true };
      if (be.length && diff >= 1 && wAtk < 1500 && fdCount < wallCap) return { type: 'SUMMON', handIdx: weakest.i, slotIdx: be[0], faceDown: true };
      if (be.length && mAtk >= 1500) return { type: 'SUMMON', handIdx: strongest.i, slotIdx: be[0], faceDown: false };
    }

    // --- 6. Không còn gì tốt hơn: chuyển sang battle nếu có đòn điểm, ngược lại end ---
    const battle = battlePhaseWorth(s, pIdx);
    if (battle) return { type: 'BATTLE_PHASE' };
    return { type: 'END' };
  }

  function battlePhaseWorth(s, pIdx) {
    for (let si = 0; si < 9; si++) {
      const r = attackScore(s, pIdx, si, false);
      if (r && r.score > 0) return true;
    }
    return false;
  }

  /* ---------------- BATTLE phase: chọn đòn đánh tốt nhất ---------------- */
  function battleAction(s, pIdx) {
    const p = s.players[pIdx], e = s.players[1 - pIdx];
    const diff = s.difficulty;
    // Lethal check (khó trở lên): tổng sát thương khả dụng >= LP đối thủ => đánh hết
    let lethal = false;
    if (diff >= 2) {
      let total = 0;
      for (let si = 0; si < 9; si++) {
        const r = attackScore(s, pIdx, si, true);
        if (r && r.score > 0) total += E.effAtk(s, pIdx, p.field[si]);
      }
      if (total >= e.lp) lethal = true;
    }
    let best = null;
    for (let si = 0; si < 9; si++) {
      const r = attackScore(s, pIdx, si, lethal);
      if (r && (lethal ? r.score > -800 : r.score > 0)) {
        if (!best || r.score > best.score) best = r;
      }
    }
    if (best) return best.action;
    // Còn quái chưa đánh mà đáng đánh thì đánh cái tệ nhất có lợi? -> nếu hết đòn điểm: end turn
    return { type: 'END' };
  }

  function aiNextAction(s, pIdx) {
    if (s.winner != null) return null;
    if (s.phase === 'MAIN') return mainAction(s, pIdx);
    if (s.phase === 'BATTLE') return battleAction(s, pIdx);
    return null;
  }

  FM.ai = { aiNextAction, columnThreat, attackScore };
})(typeof window !== 'undefined' ? window : globalThis);
