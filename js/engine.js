/* =========================================================================
 * Forbidden Memory Web Clone — Duel Engine
 * State machine + battle math. No DOM access (headless-testable).
 *
 * Field layout: mỗi người 1 lưới 3x3. Slot index = row*3 + col.
 *   row 0 = xa đối thủ nhất, row 2 = FRONT (gần đối thủ nhất).
 *   Cột col của ta đối diện cột col của đối thủ.
 * Target rule (kiểu FM): quái tấn công quái ở cùng cột phía đối thủ,
 *   ưu tiên quái gần nhất (front -> về sau). Nếu cột trống => đánh trực tiếp LP.
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const C = FM.cards;

  const LP_START = 8000;
  const HAND_MAX = 5;
  const ROWS = 3, COLS = 3;
  const FRONT_ROW = 2;

  /* ---------------- helpers ---------------- */
  const rngInt = n => Math.floor(Math.random() * n);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rngInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const isMon = c => c && c.kind === 'MONSTER';
  const mdata = c => C.monsters[c.id];
  function slotRow(i) { return Math.floor(i / 3); }
  function slotCol(i) { return i % 3; }

  /* ---------------- setup ---------------- */
  function makePlayer(name, deckList, isAI) {
    const deck = FM.decks.expandDeck(deckList);
    shuffle(deck);
    return {
      name, isAI: !!isAI, lp: LP_START,
      deck, hand: [], field: new Array(ROWS * COLS).fill(null),
      graveyard: [], terrains: [],
    };
  }

  function newDuel(cfg) {
    const s = {
      players: [
        makePlayer(cfg.p0name || 'Bạn', cfg.p0deck, false),
        makePlayer(cfg.p1name || 'Máy', cfg.p1deck, true),
      ],
      difficulty: cfg.difficulty != null ? cfg.difficulty : 2,
      active: 0, turnNo: 1, phase: 'MAIN', winner: null, loser: null,
      log: [], fx: [],      // fx: animation events consumed by UI
      _uid: 1,
    };
    for (const p of s.players) { for (let i = 0; i < 5; i++) drawCard(s, s.players.indexOf(p), true); }
    // Tổng số bài của mỗi người (deck + tay) — dùng kiểm tra bảo toàn bài khi restore
    for (const p of s.players) p._total = p.deck.length + p.hand.length;
    pushLog(s, `⚔️ Đấu giữa ${s.players[0].name} (LP ${LP_START}) và ${s.players[1].name} (LP ${LP_START})!`);
    pushLog(s, `▶ Lượt 1 — ${s.players[0].name} bắt đầu (không rút bài ở lượt đầu).`);
    return s;
  }

  /* ---------------- logging / fx ---------------- */
  function pushLog(s, text, cls) { s.log.push({ t: text, cls: cls || '', turn: s.turnNo }); if (s.log.length > 400) s.log.shift(); }
  function fx(s, ev) { s.fx.push(ev); }
  function drainFx(s) { const e = s.fx; s.fx = []; return e; }

  /* ---------------- stats ---------------- */
  function terrainBonus(s, pIdx, m) {
    let bonus = 0;
    for (const pl of s.players) for (const t of pl.terrains) {
      const md = C.magics[t];
      if (md.terrain.includes(m.race)) bonus += 500;
    }
    return bonus;
  }
  function effAtk(s, pIdx, slot) {
    if (!slot || !isMon(slot.card)) return 0;
    const m = mdata(slot.card);
    return m.atk + (slot.buffs || []).reduce((a, b) => a + b.atk, 0) + terrainBonus(s, pIdx, m);
  }
  function effDef(s, pIdx, slot) {
    if (!slot || !isMon(slot.card)) return 0;
    const m = mdata(slot.card);
    return m.def + terrainBonus(s, pIdx, m);
  }
  function monsterCount(p) { return p.field.filter(x => x && x.kind === 'MONSTER').length; }

  /* ---------------- deck/hand ---------------- */
  function drawCard(s, pIdx, silent) {
    const p = s.players[pIdx];
    if (p.deck.length === 0) return false;
    if (p.hand.length >= HAND_MAX) { if (!silent) pushLog(s, `${p.name} đã đủ ${HAND_MAX} bài trên tay — không rút được.`); return false; }
    const card = p.deck.shift();
    card.uid = s._uid++;
    p.hand.push(card);
    if (!silent) pushLog(s, `${p.name} rút 1 bài.`);
    return true;
  }

  function toGraveyard(s, pIdx, slot) {
    const p = s.players[pIdx];
    if (!slot) return;
    if (slot.kind === 'MONSTER') {
      p.graveyard.push(slot.card);
      if (slot.buffs) for (const b of slot.buffs) p.graveyard.push({ kind: 'MAGIC', mid: b.mid, used: true });
    } else {
      p.graveyard.push(slot.kind === 'TRAP' ? { kind: 'TRAP', tid: slot.tid, used: true } : { kind: 'MAGIC', mid: slot.mid, used: true });
    }
  }

  function destroyMonster(s, pIdx, slotIdx, cause) {
    const p = s.players[pIdx], slot = p.field[slotIdx];
    if (!slot || slot.kind !== 'MONSTER') return false;
    const name = mdata(slot.card).name;
    const attr = mdata(slot.card).attr;
    toGraveyard(s, pIdx, slot);
    p.field[slotIdx] = null;
    pushLog(s, `💀 ${name} của ${p.name} bị phá hủy${cause ? ' (' + cause + ')' : ''}.`, 'destroy');
    fx(s, { type: 'destroy', pIdx, slotIdx, name, attr, cause });
    return true;
  }

  function damageLP(s, pIdx, amount, why) {
    if (amount <= 0) return;
    const p = s.players[pIdx];
    p.lp = Math.max(0, p.lp - amount);
    pushLog(s, `🔥 ${p.name} mất ${amount} LP${why ? ' (' + why + ')' : ''} → còn ${p.lp}.`, 'damage');
    fx(s, { type: 'damage', pIdx, amount, lp: p.lp });
  }
  function healLP(s, pIdx, amount, why) {
    const p = s.players[pIdx];
    p.lp += amount;
    pushLog(s, `💚 ${p.name} hồi ${amount} LP${why ? ' (' + why + ')' : ''} → lên ${p.lp}.`, 'heal');
    fx(s, { type: 'heal', pIdx, amount, lp: p.lp });
  }

  /* ---------------- traps ---------------- */
  // Trả về trap slot đầu tiên của defender khớp điều kiện; trap bị tiêu tốn.
  function triggerTraps(s, defenderIdx, predicate, eventName) {
    const def = s.players[defenderIdx];
    for (let i = 0; i < def.field.length; i++) {
      const slot = def.field[i];
      if (!slot || slot.kind !== 'TRAP') continue;
      if (predicate(C.traps[slot.tid])) {
        const tname = C.traps[slot.tid].name;
        pushLog(s, `🪤 Bẫy kích hoạt: ${def.name} — ${tname}!`, 'trap');
          fx(s, { type: 'trap', pIdx: defenderIdx, slotIdx: i, name: tname, tid: C.traps[slot.tid].id });
        toGraveyard(s, defenderIdx, slot);
        def.field[i] = null;
        return C.traps[slot.tid];
      }
    }
    return null;
  }

  /* ---------------- main phase actions ---------------- */
  function summon(s, pIdx, handIdx, slotIdx, faceDown) {
    if (s.phase !== 'MAIN' || s.winner != null) return { ok: false, msg: 'Chỉ làm được ở Main Phase.' };
    const p = s.players[pIdx];
    const card = p.hand[handIdx];
    if (!card) return { ok: false, msg: 'Không có bài ở vị trí đó.' };
    if (!isMon(card)) return { ok: false, msg: 'Chỉ summon quái vật.' };
    if (p.field[slotIdx]) return { ok: false, msg: 'Ô đã có bài.' };
    p.hand.splice(handIdx, 1);
    const slot = { kind: 'MONSTER', card, pos: faceDown ? 'DEF' : 'ATK', faceDown: !!faceDown, attacked: false, posChanged: false, buffs: [] };
    p.field[slotIdx] = slot;
    const m = mdata(card);
    if (faceDown) {
      pushLog(s, `🂠 ${p.name} SET 1 quái úp xuống.`, 'act');
      fx(s, { type: 'set', pIdx, slotIdx });
    } else {
      pushLog(s, `⬆ ${p.name} triệu hồi ${m.name} (${effAtk(s, pIdx, slot)}/${m.def}) ATK!`, 'act');
      fx(s, { type: 'summon', pIdx, slotIdx, name: m.name, mid: m.id, atk: m.atk });
      // Trap Hole của đối thủ: triệu hồi ATK >= 1000 => phá hủy
      const enemy = 1 - pIdx;
      const trap = triggerTraps(s, enemy, t => t.id === 'trapHole' && effAtk(s, pIdx, slot) >= 1000, 'summon');
      if (trap) destroyMonster(s, pIdx, slotIdx, 'Trap Hole');
    }
    return { ok: true };
  }

  function setTrapCard(s, pIdx, handIdx, slotIdx) {
    if (s.phase !== 'MAIN' || s.winner != null) return { ok: false, msg: 'Chỉ làm được ở Main Phase.' };
    const p = s.players[pIdx];
    const card = p.hand[handIdx];
    if (!card || card.kind !== 'TRAP') return { ok: false, msg: 'Chỉ SET được thẻ Bẫy.' };
    if (p.field[slotIdx]) return { ok: false, msg: 'Ô đã có bài.' };
    p.hand.splice(handIdx, 1);
    p.field[slotIdx] = { kind: 'TRAP', tid: card.tid, faceDown: true };
    pushLog(s, `🪤 ${p.name} SET bẫy ${C.traps[card.tid].name}.`, 'act');
    fx(s, { type: 'set', pIdx, slotIdx });
    return { ok: true };
  }

  /* Fusion: handIdxA (trên tay) + thứ hai là tay HOẶC slot trên sân (quái ngửa).
     Trả về kết quả để UI hiển thị trước khi gọi placeFusion. */
  function peekFusion(s, pIdx, a, b) {
    // a/b: {src:'HAND'|'FIELD', idx}
    const p = s.players[pIdx];
    const ca = a.src === 'HAND' ? p.hand[a.idx] : (p.field[a.idx] && p.field[a.idx].kind === 'MONSTER' && !p.field[a.idx].faceDown ? p.field[a.idx].card : null);
    const cb = b.src === 'HAND' ? p.hand[b.idx] : (p.field[b.idx] && p.field[b.idx].kind === 'MONSTER' && !p.field[b.idx].faceDown ? p.field[b.idx].card : null);
    if (!isMon(ca) || !isMon(cb)) return null;
    return C.lookup(ca.id, cb.id);
  }

  function fuse(s, pIdx, a, b, targetSlot) {
    if (s.phase !== 'MAIN' || s.winner != null) return { ok: false, msg: 'Chỉ fusion ở Main Phase.' };
    const p = s.players[pIdx];
    const result = peekFusion(s, pIdx, a, b);
    if (!result) return { ok: false, msg: 'Hai thẻ này không hợp nhất được.' };
    const slotA = a.src === 'FIELD' ? a.idx : null;
    const slotB = b.src === 'FIELD' ? b.idx : null;
    const isFieldFusion = slotA != null || slotB != null;
    const dest = isFieldFusion ? (slotA != null ? slotA : slotB) : targetSlot;
    if (dest == null || dest < 0 || dest > 8) return { ok: false, msg: 'Chọn ô đặt kết quả fusion.' };
    if (isFieldFusion && p.field[dest] && p.field[dest] !== (slotA != null ? p.field[slotA] : p.field[slotB])) {
      return { ok: false, msg: 'Field fusion phải thay đúng ô quái nguyên liệu.' };
    }
    if (!isFieldFusion && p.field[dest]) return { ok: false, msg: 'Ô đã có bài.' };
    // Xoá nguyên liệu khỏi tay/sân (nguyên liệu tay cũng vào mộ như bản gốc)
    const takeHand = idx => { const c = p.hand.splice(idx, 1)[0]; if (c) p.graveyard.push(c); };
    if (a.src === 'HAND') takeHand(a.idx);
    if (b.src === 'HAND') { const i = a.src === 'HAND' ? b.idx - (a.idx < b.idx ? 1 : 0) : b.idx; takeHand(i); }
    if (slotA != null) { toGraveyard(s, pIdx, p.field[slotA]); p.field[slotA] = null; }
    if (slotB != null) { toGraveyard(s, pIdx, p.field[slotB]); p.field[slotB] = null; }
    const card = { kind: 'MONSTER', id: result.id, uid: s._uid++ };
    p.field[dest] = { kind: 'MONSTER', card, pos: 'ATK', faceDown: false, attacked: false, posChanged: false, buffs: [] };
    pushLog(s, `🧪 ${p.name} FUSION → ${result.name} (${result.atk}/${result.def})!`, 'fusion');
    fx(s, { type: 'fusion', pIdx, slotIdx: dest, name: result.name });
    // Bẫy Trap Hole vẫn ăn fusion triệu hồi mới (không phải field fusion đè lên cũ)
    if (!isFieldFusion && effAtk(s, pIdx, p.field[dest]) >= 1000) {
      const trap = triggerTraps(s, 1 - pIdx, t => t.id === 'trapHole', 'fusion');
      if (trap) destroyMonster(s, pIdx, dest, 'Trap Hole');
    }
    return { ok: true, result };
  }

  function playMagic(s, pIdx, handIdx, targetSlot) {
    if (s.phase !== 'MAIN' || s.winner != null) return { ok: false, msg: 'Chỉ làm được ở Main Phase.' };
    const p = s.players[pIdx];
    const card = p.hand[handIdx];
    if (!card || card.kind !== 'MAGIC') return { ok: false, msg: 'Không phải thẻ Phép.' };
    const md = C.magics[card.mid];
    const enemy = 1 - pIdx;
    if (md.atk) { // Equip
      const slot = p.field[targetSlot];
      if (!slot || slot.kind !== 'MONSTER' || slot.faceDown) return { ok: false, msg: 'Chọn quái ngửa để gắn trang bị.' };
      if (!md.match(mdata(slot.card))) return { ok: false, msg: `${md.etext} — không khớp quái này.` };
      p.hand.splice(handIdx, 1);
      slot.buffs = slot.buffs || [];
      slot.buffs.push({ mid: md.id, atk: md.atk, name: md.name });
      pushLog(s, `✨ ${p.name} gắn ${md.name} (+${md.atk} ATK) lên ${mdata(slot.card).name}.`, 'magic');
      fx(s, { type: 'magic', pIdx, slotIdx: targetSlot, name: md.name, mid: md.id, icon: md.icon });
      return { ok: true };
    }
    if (md.terrain) {
      if (s.players.some(pl => pl.terrains.includes(md.id))) return { ok: false, msg: 'Địa hình này đã có trên sân.' };
      p.hand.splice(handIdx, 1);
      p.terrains.push(md.id);
      pushLog(s, `🏞️ ${p.name} kích hoạt địa hình ${md.name} (${md.ttext}).`, 'magic');
      fx(s, { type: 'terrain', pIdx, name: md.name, mid: md.id, icon: md.icon });
      return { ok: true };
    }
    switch (md.id) {
      case 'darkHole': {
        const trap = triggerTraps(s, enemy, t => t.id === 'antiRaigeki', 'darkHole');
        if (trap) { // Anti Raigeki phản công
          pushLog(s, `🛡️ Anti Raigeki phản hồi! Toàn bộ quái của ${p.name} bị phá hủy!`, 'trap');
          for (let i = 0; i < p.field.length; i++) destroyMonster(s, pIdx, i, 'Anti Raigeki');
          p.hand.splice(handIdx, 1);
          return { ok: true };
        }
        p.hand.splice(handIdx, 1);
        pushLog(s, `🕳️ ${p.name} dùng Dark Hole — TẤT CẢ quái bị phá hủy!`, 'magic');
        fx(s, { type: 'magic', pIdx, name: 'Dark Hole', mid: 'darkHole', all: true });
        for (let i = 0; i < 9; i++) { destroyMonster(s, pIdx, i, 'Dark Hole'); destroyMonster(s, enemy, i, 'Dark Hole'); }
        return { ok: true };
      }
      case 'raigeki': {
        const trap = triggerTraps(s, enemy, t => t.id === 'antiRaigeki', 'raigeki');
        if (trap) {
          pushLog(s, `🛡️ Anti Raigeki phản hồi! Toàn bộ quái của ${p.name} bị phá hủy!`, 'trap');
          for (let i = 0; i < p.field.length; i++) destroyMonster(s, pIdx, i, 'Anti Raigeki');
          p.hand.splice(handIdx, 1);
          return { ok: true };
        }
        p.hand.splice(handIdx, 1);
        pushLog(s, `⚡ ${p.name} dùng Raigeki — sấm sét nghiền nát phòng thủ đối thủ!`, 'magic');
        fx(s, { type: 'magic', pIdx, name: 'Raigeki', mid: 'raigeki', all: true });
        for (let i = 0; i < 9; i++) destroyMonster(s, enemy, i, 'Raigeki');
        return { ok: true };
      }
      case 'fissure': {
        let best = -1, bestAtk = Infinity;
        const e = s.players[enemy];
        for (let i = 0; i < 9; i++) {
          const sl = e.field[i];
          if (sl && sl.kind === 'MONSTER' && !sl.faceDown) {
            const a = effAtk(s, enemy, sl);
            if (a < bestAtk) { bestAtk = a; best = i; }
          }
        }
        p.hand.splice(handIdx, 1);
        if (best < 0) { pushLog(s, `🌋 ${p.name} dùng Fissure — không có quái ngửa nào để phá.`, 'magic'); return { ok: true, fizzled: true }; }
        pushLog(s, `🌋 ${p.name} dùng Fissure — mặt đất nứt toác!`, 'magic');
        fx(s, { type: 'magic', pIdx, name: 'Fissure', mid: 'fissure', all: true });
        destroyMonster(s, enemy, best, 'Fissure');
        return { ok: true };
      }
      case 'dianKeto':
        p.hand.splice(handIdx, 1);
        healLP(s, pIdx, 1000, 'Dian Keto');
        return { ok: true };
      default:
        return { ok: false, msg: 'Thẻ phép chưa hỗ trợ.' };
    }
  }

  function changePos(s, pIdx, slotIdx) {
    if (s.phase !== 'MAIN' || s.winner != null) return { ok: false, msg: 'Chỉ làm được ở Main Phase.' };
    const p = s.players[pIdx];
    const slot = p.field[slotIdx];
    if (!slot || slot.kind !== 'MONSTER') return { ok: false, msg: 'Chọn ô quái vật.' };
    if (slot.posChanged) return { ok: false, msg: 'Quái này đã đổi tư thế trong lượt này.' };
    slot.posChanged = true;
    if (slot.faceDown) { slot.faceDown = false; slot.pos = 'DEF'; pushLog(s, `🔄 ${p.name} lật ${mdata(slot.card).name} sang phòng thủ ngửa (${effDef(s, pIdx, slot)} DEF).`, 'act'); fx(s, { type: 'flip', pIdx, slotIdx, name: mdata(slot.card).name }); }
    else if (slot.pos === 'ATK') { slot.pos = 'DEF'; pushLog(s, `🛡️ ${mdata(slot.card).name} của ${p.name} về phòng thủ.`, 'act'); fx(s, { type: 'flip', pIdx, slotIdx, name: mdata(slot.card).name }); }
    else { slot.pos = 'ATK'; pushLog(s, `⚔️ ${mdata(slot.card).name} của ${p.name} lên tấn công.`, 'act'); fx(s, { type: 'flip', pIdx, slotIdx, name: mdata(slot.card).name }); }
    return { ok: true };
  }

  /* ---------------- battle phase ---------------- */
  function canAttack(s, pIdx, slotIdx) {
    if (s.phase !== 'BATTLE' || s.winner != null) return false;
    const p = s.players[pIdx];
    const slot = p.field[slotIdx];
    return !!slot && slot.kind === 'MONSTER' && !slot.faceDown && slot.pos === 'ATK' && !slot.attacked;
  }

  // Kết quả: { target: slotIdx | -1 (direct) | null (không đánh được) }
  function attackTargets(s, pIdx, slotIdx) {
    const p = s.players[pIdx];
    const slot = p.field[slotIdx];
    if (!canAttack(s, pIdx, slotIdx)) return null;
    const col = slotCol(slotIdx);
    const enemy = s.players[1 - pIdx];
    for (let row = FRONT_ROW; row >= 0; row--) {
      const i = row * 3 + col;
      const sl = enemy.field[i];
      if (sl && sl.kind === 'MONSTER') return { target: i, direct: false };
    }
    return { target: -1, direct: true };
  }

  function doAttack(s, pIdx, slotIdx) {
    const t = attackTargets(s, pIdx, slotIdx);
    if (!t) return { ok: false, msg: 'Quái này không thể tấn công.' };
    const p = s.players[pIdx], enemyIdx = 1 - pIdx, e = s.players[enemyIdx];
    const aslot = p.field[slotIdx];
    const aName = mdata(aslot.card).name;
    const aAtk = effAtk(s, pIdx, aslot);
    aslot.attacked = true;
    pushLog(s, `⚔️ ${aName} của ${p.name} tấn công (${aAtk})!`, 'battle');
    fx(s, { type: 'attack', pIdx, slotIdx, targetIdx: t.target, name: aName, atk: aAtk, mid: mdata(aslot.card).id });

    // Bẫy phòng thủ kích hoạt trước khi va chạm
    const trap = triggerTraps(s, enemyIdx, tr => {
      if (tr.id === 'widespread') return true;
      if (tr.id === 'captureJar') return mdata(aslot.card).race === 'Dragon';
      if (tr.id === 'desserts') return true;
      return false;
    });
    if (trap) {
      if (trap.id === 'widespread') { destroyMonster(s, pIdx, slotIdx, 'Widespread Ruin'); return { ok: true, negated: true }; }
      if (trap.id === 'captureJar') {
        pushLog(s, `🏺 ${aName} bị Dragon Capture Jar hủy đòn tấn công, bị ép về phòng thủ!`, 'trap');
        aslot.pos = 'DEF';
        return { ok: true, negated: true };
      }
      if (trap.id === 'desserts') {
        const n = monsterCount(p);
        damageLP(s, pIdx, 300 * n, 'Just Desserts');
        // đòn tấn công vẫn tiếp diễn
      }
    }
    if (s.winner != null) return { ok: true };

    if (t.direct) {
      pushLog(s, `🎯 Đòn đánh TRỰC TIẾP vào LP!`, 'battle');
      damageLP(s, enemyIdx, aAtk, 'direct');
      checkWin(s);
      return { ok: true, direct: true, dmg: aAtk };
    }

    const dslot = e.field[t.target];
    if (dslot.faceDown) {
      dslot.faceDown = false;
      pushLog(s, `👁 Quái úp của ${e.name} bị lật ra: ${mdata(dslot.card).name}!`, 'battle');
      fx(s, { type: 'flip', pIdx: enemyIdx, slotIdx: t.target, name: mdata(dslot.card).name });
    }
    const dName = mdata(dslot.card).name;
    const dAtkPos = dslot.pos === 'ATK';
    const dPower = dAtkPos ? effAtk(s, enemyIdx, dslot) : effDef(s, enemyIdx, dslot);
    pushLog(s, `🛡 ${dName} (${dAtkPos ? 'ATK ' : 'DEF '}${dPower}) chặn đường!`, 'battle');
    fx(s, { type: 'defender', pIdx: enemyIdx, slotIdx: t.target, name: dName, power: dPower, atkPos: dAtkPos });

    if (dAtkPos) {
      if (aAtk > dPower) {
        destroyMonster(s, enemyIdx, t.target, 'thua trận đánh');
        damageLP(s, enemyIdx, aAtk - dPower, 'sát thương chiến đấu');
      } else if (aAtk < dPower) {
        damageLP(s, pIdx, dPower - aAtk, 'phản đòn');
        pushLog(s, `💢 ${aName} bị đẩy lùi, không bị phá hủy.`);
      } else {
        pushLog(s, '🤝 Cân sức paro — cả hai cùng bị phá hủy!');
        destroyMonster(s, enemyIdx, t.target, 'đòn đối đòn');
        destroyMonster(s, pIdx, slotIdx, 'đòn đối đòn');
      }
    } else {
      if (aAtk > dPower) {
        destroyMonster(s, enemyIdx, t.target, 'thủ vỡ');
        pushLog(s, `🧱 Phòng tuyến vỡ, không có sát thương LP.`);
      } else if (aAtk < dPower) {
        damageLP(s, pIdx, dPower - aAtk, 'phản đòn phòng thủ');
        pushLog(s, `💢 ${aName} không xuyên nổi phòng thủ.`);
      } else {
        pushLog(s, '🤝 Bất phân thắng bại.');
      }
    }
    checkWin(s);
    return { ok: true };
  }

  /* ---------------- turn flow ---------------- */
  function startBattlePhase(s) {
    if (s.phase !== 'MAIN') return false;
    s.phase = 'BATTLE';
    pushLog(s, `🗡 Battle Phase!`);
    return true;
  }

  function endTurn(s) {
    if (s.winner != null) return false;
    const nextIdx = 1 - s.active;
    s.active = nextIdx;
    s.turnNo += 1;
    // reset flags của người sắp đi
    for (const sl of s.players[nextIdx].field) {
      if (sl && sl.kind === 'MONSTER') { sl.attacked = false; sl.posChanged = false; }
    }
    s.phase = 'MAIN';
    pushLog(s, `▶ Lượt ${s.turnNo} — ${s.players[nextIdx].name}.`, 'turn');
    // Giới hạn lượt: sau lượt 100, ai LP thấp hơn thua (chống bế tắc vĩnh viễn)
    if (s.turnNo > 100) {
      const [a, b] = s.players;
      if (a.lp !== b.lp) finish(s, a.lp > b.lp ? 0 : 1, 'hết thời gian — LP cao hơn thắng');
      else finish(s, 1 - nextIdx, 'hết thời gian');
      return true;
    }
    // Deck-out
    if (s.players[nextIdx].deck.length === 0 && s.players[nextIdx].hand.length === 0 && monsterCount(s.players[nextIdx]) === 0) {
      finish(s, 1 - nextIdx, 'hết bài hoàn toàn');
    } else if (s.players[nextIdx].deck.length === 0) {
      pushLog(s, `📚 ${s.players[nextIdx].name} đã hết deck!`);
      finish(s, 1 - nextIdx, 'deck-out');
    } else {
      // Draw Phase tường minh: rút đầu lượt; tay đầy 5/5 thì bỏ lượt rút (luật FM gốc)
      const p = s.players[nextIdx];
      const full = p.hand.length >= HAND_MAX;
      if (full) {
        pushLog(s, `🎴 Draw Phase — tay ${p.name} đầy (${HAND_MAX}/${HAND_MAX}), bỏ lượt rút.`, 'turn');
        fx(s, { type: 'draw', pIdx: nextIdx, drew: false, hand: HAND_MAX });
      } else if (drawCard(s, nextIdx, true)) {
        pushLog(s, `🎴 Draw Phase — ${p.name} rút 1 bài (tay ${p.hand.length}/${HAND_MAX}).`, 'turn');
        fx(s, { type: 'draw', pIdx: nextIdx, drew: true, hand: p.hand.length });
      }
    }
    return true;
  }

  function finish(s, winnerIdx, why) {
    s.winner = winnerIdx;
    s.loser = 1 - winnerIdx;
    s.phase = 'GAMEOVER';
    pushLog(s, `🏆 ${s.players[winnerIdx].name} THẮNG${why ? ' — ' + why : ''}!`, 'win');
    fx(s, { type: 'gameover', winner: winnerIdx });
  }

  function checkWin(s) {
    if (s.winner != null) return;
    if (s.players[0].lp <= 0) finish(s, 1, 'LP về 0');
    else if (s.players[1].lp <= 0) finish(s, 0, 'LP về 0');
  }

  /* Tiến hành 1 action của AI (engine không tự gọi AI; ai.js điều phối) */
  function perform(s, action) {
    const pIdx = s.active;
    switch (action.type) {
      case 'SUMMON': return summon(s, pIdx, action.handIdx, action.slotIdx, action.faceDown);
      case 'SET_TRAP': return setTrapCard(s, pIdx, action.handIdx, action.slotIdx);
      case 'MAGIC': return playMagic(s, pIdx, action.handIdx, action.targetSlot);
      case 'FUSION': return fuse(s, pIdx, action.a, action.b, action.targetSlot);
      case 'CHANGE_POS': return changePos(s, pIdx, action.slotIdx);
      case 'ATTACK': return doAttack(s, pIdx, action.slotIdx);
      case 'BATTLE_PHASE': return { ok: startBattlePhase(s) };
      case 'END': return { ok: endTurn(s) };
      default: return { ok: false, msg: 'Unknown action' };
    }
  }

  FM.engine = {
    LP_START, HAND_MAX, FRONT_ROW,
    newDuel, perform, drainFx,
    effAtk, effDef, isMon, mdata, monsterCount,
    canAttack, attackTargets, peekFusion,
    summon, setTrapCard, playMagic, fuse, changePos, doAttack,
    startBattlePhase, endTurn,
    slotRow, slotCol,
    // tiện cho test
    _state: null,
  };
})(typeof window !== 'undefined' ? window : globalThis);
