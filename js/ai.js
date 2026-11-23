/* =========================================================================
 * Forbidden Memory Web Clone — AI Opponent
 * aiNextAction(s, pIdx) -> 1 action mỗi lần gọi (để UI animate từng bước).
 * difficulty: 0 = Dễ, 1 = Thường, 2 = Khá, 3 = Giỏi, 4 = Ác mã
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const E = FM.engine, C = FM.cards;

  const MONSTER_SLOTS = 5, SPELL_SLOTS = 5;
  const emptyMonsterSlots = p => [0, 1, 2, 3, 4].filter(i => !p.field[i]);
  const emptyTrapSlots = p => [5, 6, 7, 8, 9].filter(i => !p.field[i]);
  const trapCount = p => [5, 6, 7, 8, 9].filter(i => p.field[i] && p.field[i].kind === 'TRAP').length;

  // Sức mạnh cột đối diện
  function columnThreat(s, enemyIdx, col) {
    const en = s.players[enemyIdx];
    const sl = en.field[col];
    if (sl && sl.kind === 'MONSTER') {
      const a = sl.faceDown ? 0 : E.effAtk(s, enemyIdx, sl);
      const d = sl.faceDown ? 1300 : (sl.pos === 'ATK' ? a : E.effDef(s, enemyIdx, sl));
      return { slotIdx: col, atk: a, def: d, faceDown: sl.faceDown };
    }
    return null;
  }

  // Điểm số khi quái ở slotIdx tấn công mục tiêu enemyTarget (-1 là direct)
  function attackScore(s, pIdx, slotIdx, enemyTarget, lethal) {
    const p = s.players[pIdx];
    const sl = p.field[slotIdx];
    if (!sl || sl.kind !== 'MONSTER' || sl.faceDown || sl.pos !== 'ATK' || sl.attacked) return null;
    const enemyIdx = 1 - pIdx;
    const en = s.players[enemyIdx];
    const myAtk = E.effAtk(s, pIdx, sl);

    const enemyMonsters = [];
    for (let i = 0; i < MONSTER_SLOTS; i++) {
      if (en.field[i] && en.field[i].kind === 'MONSTER') enemyMonsters.push(i);
    }
    // Nếu đối thủ không có quái vật -> Tấn công trực tiếp LP
    if (enemyMonsters.length === 0) {
      return { score: lethal ? 10000 + myAtk : myAtk, action: { type: 'ATTACK', slotIdx } };
    }

    // Nếu có quái -> bắt buộc tấn công một quái đối thủ
    const target = (enemyTarget != null && enemyMonsters.includes(enemyTarget)) ? enemyTarget : (enemyMonsters.includes(slotIdx) ? slotIdx : enemyMonsters[0]);
    const dslot = en.field[target];
    const dAtkPos = dslot.pos === 'ATK';
    var dPower = dAtkPos ? E.effAtk(s, enemyIdx, dslot) : (dslot.faceDown ? 1200 : E.effDef(s, enemyIdx, dslot));

    // Xét Guardian Star bonus (+500)
    var aStar = C.monsters[sl.card.id].stars ? C.monsters[sl.card.id].stars[sl.star || 0] : null;
    var dStar = C.monsters[dslot.card.id].stars ? C.monsters[dslot.card.id].stars[dslot.star || 0] : null;
    var aAtkCalc = myAtk + (C.starBeats(aStar, dStar) ? 500 : 0);
    var dPowerCalc = dPower + (C.starBeats(dStar, aStar) ? 500 : 0);

    let score;
    if (dAtkPos) {
      if (aAtkCalc > dPowerCalc) score = 1000 + (aAtkCalc - dPowerCalc) + (dPowerCalc >= 2000 ? 500 : 0);
      else if (aAtkCalc === dPowerCalc) score = -300 - (aAtkCalc >= 1500 ? 400 : 0);
      else score = -800 - (dPowerCalc - aAtkCalc);
    } else {
      if (aAtkCalc > dPowerCalc) score = 500 + (dPowerCalc >= 2000 ? 300 : 0);
      else score = -800 - (dPowerCalc - aAtkCalc);
    }
    return { score, action: { type: 'ATTACK', slotIdx, targetSlot: target } };
  }

  function bestAttackForMonster(s, pIdx, slotIdx, lethal) {
    const enemyIdx = 1 - pIdx, en = s.players[enemyIdx];
    const enemyMonsters = [];
    for (let i = 0; i < MONSTER_SLOTS; i++) {
      if (en.field[i] && en.field[i].kind === 'MONSTER') enemyMonsters.push(i);
    }
    if (enemyMonsters.length === 0) {
      return attackScore(s, pIdx, slotIdx, -1, lethal);
    }
    let best = null;
    for (const em of enemyMonsters) {
      const scr = attackScore(s, pIdx, slotIdx, em, lethal);
      if (scr && (!best || scr.score > best.score)) best = scr;
    }
    return best;
  }

  /* ---------------- MAIN phase: chọn 1 hành động ---------------- */
  function mainAction(s, pIdx) {
    const p = s.players[pIdx], enemyIdx = 1 - pIdx, e = s.players[enemyIdx];
    const diff = s.difficulty;
    const hand = p.hand;
    const enemyMonsters = E.monsterCount(e);
    const myBestFieldAtk = Math.max(0, ...p.field.map(sl => (sl && sl.kind === 'MONSTER' && !sl.faceDown && sl.pos === 'ATK') ? E.effAtk(s, pIdx, sl) : 0));

    // --- 1. Magic/Equip/Ritual (dispatch theo fx.kind) ---
    var enemyFaceDown = 0, enemyFaceUpAtkMax = 0, enemyTraps = 0;
    var raceCount = {};
    for (var ei = 0; ei < 10; ei++) {
      var es = e.field[ei];
      if (!es || es.kind !== 'MONSTER') { if (es && es.kind === 'TRAP') enemyTraps++; continue; }
      if (es.faceDown) enemyFaceDown++;
      else {
        var ea = E.effAtk(s, enemyIdx, es);
        if (ea > enemyFaceUpAtkMax) enemyFaceUpAtkMax = ea;
        var rn = E.mdata(es.card).race;
        raceCount[rn] = (raceCount[rn] || 0) + 1;
      }
    }
    for (var mi = 0; mi < hand.length; mi++) {
      var c = hand[mi];
      if (c.kind !== 'MAGIC') continue;
      var md = C.magics[c.mid];
      if (!md) continue;
      var mfx = md.fx || {};
      var usable = false;
      // Ritual: đủ 3 nguyên liệu trong tay+sân?
      if (mfx.kind === 'ritual') {
        var pool = {};
        for (var hi = 0; hi < hand.length; hi++) { var hc = hand[hi]; if (E.isMon(hc)) pool[hc.id] = (pool[hc.id] || 0) + 1; }
        for (var fi = 0; fi < MONSTER_SLOTS; fi++) { var fs = p.field[fi]; if (fs && fs.kind === 'MONSTER') pool[fs.card.id] = (pool[fs.card.id] || 0) + 1; }
        usable = (md.offerings || []).every(function (oid) { return (pool[oid] || 0) >= 1; });
      }
      else if (mfx.kind === 'equip') usable = p.field.slice(0, MONSTER_SLOTS).some(function (sl) { return sl && sl.kind === 'MONSTER' && !sl.faceDown && (typeof md.match === 'function' ? md.match(E.mdata(sl.card)) : (md.races || md.compat || []).indexOf(E.mdata(sl.card).race) >= 0); });
      else if (mfx.kind === 'terrain') usable = s.turnNo <= 3 && !s.players.some(function (pl) { return pl.terrains.indexOf(md.id) >= 0; });
      else if (mfx.kind === 'heal') usable = p.lp <= 4000;
      else if (mfx.kind === 'damage') usable = e.lp <= mfx.amount || e.lp <= 2500;
      else if (mfx.kind === 'destroyEnemyAll') usable = enemyMonsters >= 3;
      else if (mfx.kind === 'destroyAll') {
        var tp = e.field.slice(0, MONSTER_SLOTS).reduce(function (acc, sl) { return acc + (sl && sl.kind === 'MONSTER' && !sl.faceDown ? E.effAtk(s, enemyIdx, sl) : 0); }, 0);
        var mp = p.field.slice(0, MONSTER_SLOTS).reduce(function (acc, sl) { return acc + (sl && sl.kind === 'MONSTER' && !sl.faceDown && sl.pos === 'ATK' ? E.effAtk(s, pIdx, sl) : 0); }, 0);
        usable = enemyMonsters >= 3 || tp > mp + 800;
      }
      else if (mfx.kind === 'destroyRace') usable = (mfx.races || []).some(function (r) { return (raceCount[r] || 0) >= 2; });
      else if (mfx.kind === 'flipAllEnemyDef') usable = enemyFaceDown >= 2;
      else if (mfx.kind === 'clearTraps') usable = enemyTraps >= 1;
      else if (mfx.kind === 'forceDef') usable = enemyFaceUpAtkMax >= 1800;
      else if (mfx.kind === 'dragonsToDef') usable = raceCount['Dragon'] >= 1;
      if (!usable) continue;
      if (mfx.kind === 'equip') {
        for (var si2 = 0; si2 < MONSTER_SLOTS; si2++) {
          var es2 = p.field[si2];
          if (es2 && es2.kind === 'MONSTER' && !es2.faceDown && (typeof md.match === 'function' ? md.match(E.mdata(es2.card)) : (md.races || md.compat || []).indexOf(E.mdata(es2.card).race) >= 0)) return { type: 'MAGIC', handIdx: mi, targetSlot: si2 };
        }
        continue;
      }
      if (mfx.kind === 'forceDef') {
        for (var si3 = 0; si3 < MONSTER_SLOTS; si3++) {
          var es3 = e.field[si3];
          if (es3 && es3.kind === 'MONSTER' && !es3.faceDown && E.effAtk(s, enemyIdx, es3) === enemyFaceUpAtkMax) return { type: 'MAGIC', handIdx: mi, targetSlot: si3 };
        }
        continue;
      }
      if (mfx.kind === 'ritual') {
        var meR = emptyMonsterSlots(p);
        if (meR.length > 0) return { type: 'MAGIC', handIdx: mi, targetSlot: meR[0] };
        continue;
      }
      return { type: 'MAGIC', handIdx: mi };
    }

    // --- 2. SET bẫy ---
    if (diff >= 1 && trapCount(p) < 2) {
      for (let i = 0; i < hand.length; i++) {
        if (hand[i].kind === 'TRAP') {
          const slots = emptyTrapSlots(p);
          if (slots.length) return { type: 'SET_TRAP', handIdx: i, slotIdx: slots[0] };
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
          for (let si = 0; si < MONSTER_SLOTS; si++) {
            const sl = p.field[si];
            if (sl && sl.kind === 'MONSTER' && !sl.faceDown && E.effAtk(s, pIdx, sl) < 2000) {
              consider({ src: 'HAND', idx: i }, { src: 'FIELD', idx: si }, true);
            }
          }
        }
        if (best) {
          let targetSlot = null;
          if (!best.fieldFusion) {
            const meF = emptyMonsterSlots(p);
            targetSlot = meF.length ? meF[0] : null;
          }
          if (targetSlot != null || best.fieldFusion) {
            p._fusCount++;
            return { type: 'FUSION', a: best.a, b: best.b, targetSlot: best.fieldFusion ? (best.a.src === 'FIELD' ? best.a.idx : best.b.idx) : targetSlot };
          }
        }
      }
    }

    // --- 4. Đổi tư thế (lật úp mạnh / DEF mạnh lên ATK) ---
    if (diff >= 1) {
      for (let si = 0; si < MONSTER_SLOTS; si++) {
        const sl = p.field[si];
        if (!sl || sl.kind !== 'MONSTER') continue;
        const m = E.mdata(sl.card);
        if (sl.faceDown && sl.pos === 'DEF' && m.atk >= 1600) return { type: 'CHANGE_POS', slotIdx: si };
        if (!sl.faceDown && sl.pos === 'DEF' && m.atk >= 1800 && E.effAtk(s, pIdx, sl) > 1800) return { type: 'CHANGE_POS', slotIdx: si };
      }
    }

    // --- 5. Summon/Set ---
    const me = emptyMonsterSlots(p);
    const monIdxs = hand.map((c, i) => ({ c, i })).filter(x => x.c.kind === 'MONSTER');
    if (monIdxs.length && me.length) {
      monIdxs.sort((a, b) => C.monsters[b.c.id].atk - C.monsters[a.c.id].atk);
      const strongest = monIdxs[0];
      const mAtk = C.monsters[strongest.c.id].atk;
      const weakest = monIdxs[monIdxs.length - 1];
      const wAtk = C.monsters[weakest.c.id].atk;
      const fdCount = p.field.slice(0, MONSTER_SLOTS).filter(sl => sl && sl.kind === 'MONSTER' && sl.faceDown).length;
      const wallCap = diff >= 1 ? 2 : 3;

      if (mAtk >= 1500 || diff === 0 || fdCount >= wallCap) {
        return { type: 'SUMMON', handIdx: strongest.i, slotIdx: me[0], faceDown: false };
      }
      if (wAtk < 1500 && diff >= 1 && fdCount < wallCap) {
        return { type: 'SUMMON', handIdx: weakest.i, slotIdx: me[me.length - 1], faceDown: true };
      }
      return { type: 'SUMMON', handIdx: strongest.i, slotIdx: me[0], faceDown: false };
    }

    // --- 6. Không còn gì tốt hơn: chuyển sang battle nếu có đòn điểm, ngược lại end ---
    const battle = battlePhaseWorth(s, pIdx);
    if (battle) return { type: 'BATTLE_PHASE' };
    return { type: 'END' };
  }

  function battlePhaseWorth(s, pIdx) {
    if (s.turnNo === 1) return false; // Lượt 1 không tấn công
    for (let si = 0; si < MONSTER_SLOTS; si++) {
      const r = bestAttackForMonster(s, pIdx, si, false);
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
      for (let si = 0; si < MONSTER_SLOTS; si++) {
        const r = bestAttackForMonster(s, pIdx, si, true);
        if (r && r.score > 0 && p.field[si]) total += E.effAtk(s, pIdx, p.field[si]);
      }
      if (total >= e.lp) lethal = true;
    }
    let best = null;
    for (let si = 0; si < MONSTER_SLOTS; si++) {
      const r = bestAttackForMonster(s, pIdx, si, lethal);
      if (r && (lethal ? r.score > -800 : r.score > 0)) {
        if (!best || r.score > best.score) best = r;
      }
    }
    if (best) return best.action;
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
