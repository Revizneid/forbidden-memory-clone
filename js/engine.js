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
  const MONSTER_SLOTS = 5;      // Hàng quái vật (row 0): slots 0..4
  const SPELL_SLOTS = 5;        // Hàng phép/bẫy (row 1): slots 5..9
  const FIELD_SIZE = 10;        // Mỗi bên 2 row x 5 cols = 10 slots
  const ROWS = 2, COLS = 5;
  const FRONT_ROW = 0;

  /* ---------------- helpers ---------------- */
  const rngInt = n => Math.floor(Math.random() * n);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rngInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const isMon = c => c && c.kind === 'MONSTER';
  const mdata = c => C.monsters[c.id];
  const isMonsterSlot = i => i >= 0 && i < MONSTER_SLOTS;
  const isSpellTrapSlot = i => i >= MONSTER_SLOTS && i < FIELD_SIZE;
  function slotRow(i) { return i < MONSTER_SLOTS ? 0 : 1; }
  function slotCol(i) { return i < MONSTER_SLOTS ? i : i - MONSTER_SLOTS; }

  /* ---------------- setup ---------------- */
  function makePlayer(name, deckList, isAI) {
    const deck = FM.decks.expandDeck(deckList);
    shuffle(deck);
    return {
      name, isAI: !!isAI, lp: LP_START,
      deck, hand: [], field: new Array(FIELD_SIZE).fill(null),
      graveyard: [], terrains: [],
    };
  }

  function newDuel(cfg) {
    const p1isAI = cfg.is2P ? false : (cfg.p1isAI !== undefined ? cfg.p1isAI : true);
    const s = {
      players: [
        makePlayer(cfg.p0name || 'Bạn', cfg.p0deck, false),
        makePlayer(cfg.p1name || (cfg.is2P ? 'Người chơi 2' : 'Máy'), cfg.p1deck, p1isAI),
      ],
      is2P: !!cfg.is2P,
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
      if (md && md.terrain && md.terrain.includes(m.race)) bonus += 500;
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
    // Bad Reaction to Simochi: đối thủ có bẫy fm688 set -> hồi máu trở thành mất máu, bẫy bị tiêu tốn
    const opp = s.players[1 - pIdx];
    for (let ti = 0; ti < opp.field.length; ti++) {
      const ts = opp.field[ti];
      if (ts && ts.kind === 'TRAP' && ts.tid === 'fm688') {
        pushLog(s, '🍭 Bad Reaction to Simochi! ' + p.name + ' hồi ' + amount + ' LP -> MẤT ' + amount + ' LP!', 'trap');
        fx(s, { type: 'trap', pIdx: 1 - pIdx, slotIdx: ti, name: 'Bad Reaction to Simochi', tid: 'fm688' });
        toGraveyard(s, 1 - pIdx, ts);
        opp.field[ti] = null;
        p.lp = Math.max(0, p.lp - amount);
        if (why) pushLog(s, '(nguồn: ' + why + ')', 'damage');
        checkWin(s);
        return;
      }
    }
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
    if (!isMonsterSlot(slotIdx)) return { ok: false, msg: 'Quái vật chỉ được triệu hồi vào hàng Quái (ô 1-5).' };
    if (p.field[slotIdx]) return { ok: false, msg: 'Ô đã có bài.' };
    p.hand.splice(handIdx, 1);
    const slot = { kind: 'MONSTER', card, pos: faceDown ? 'DEF' : 'ATK', faceDown: !!faceDown, attacked: false, posChanged: false, star: 0, buffs: [] };
    p.field[slotIdx] = slot;
    const m = mdata(card);
    if (faceDown) {
      pushLog(s, `🂠 ${p.name} SET 1 quái úp xuống.`, 'act');
      fx(s, { type: 'set', pIdx, slotIdx });
    } else {
      const starName = C.starName(m.stars ? m.stars[0] : 0);
      pushLog(s, `⬆ ${p.name} triệu hồi ${m.name} (${effAtk(s, pIdx, slot)}/${m.def}) ATK — ⭐${starName}!`, 'act');
      fx(s, { type: 'summon', pIdx, slotIdx, name: m.name, mid: m.id, atk: m.atk });
    }
    return { ok: true };
  }

  function setTrapCard(s, pIdx, handIdx, slotIdx) {
    if (s.phase !== 'MAIN' || s.winner != null) return { ok: false, msg: 'Chỉ làm được ở Main Phase.' };
    const p = s.players[pIdx];
    const card = p.hand[handIdx];
    if (!card || card.kind !== 'TRAP') return { ok: false, msg: 'Chỉ SET được thẻ Bẫy.' };
    if (!isSpellTrapSlot(slotIdx)) return { ok: false, msg: 'Bẫy chỉ được đặt vào hàng Phép/Bẫy (ô 6-10).' };
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
    let dest = isFieldFusion ? (slotA != null ? slotA : slotB) : targetSlot;
    if (dest == null || !isMonsterSlot(dest)) {
      dest = -1;
      for (let i = 0; i < MONSTER_SLOTS; i++) {
        if (!p.field[i] || (isFieldFusion && (i === slotA || i === slotB))) { dest = i; break; }
      }
      if (dest < 0) return { ok: false, msg: 'Không còn ô trống ở hàng Quái để đặt quái fusion.' };
    }
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
    if (!md) return { ok: false, msg: 'Thẻ phép không xác định.' };
    const enemy = 1 - pIdx;
    const mfx = md.fx || {};

    // ---- EQUIP: match theo compat/races (race của quái) ----
    if (mfx.kind === 'equip') {
      const slot = p.field[targetSlot];
      if (!slot || slot.kind !== 'MONSTER' || slot.faceDown) return { ok: false, msg: 'Chọn quái ngửa để gắn trang bị.' };
      const mRace = mdata(slot.card).race;
      const allowed = md.races || md.compat || [];
      if (!allowed.includes(mRace) && !(typeof md.match === 'function' && md.match(mdata(slot.card)))) {
        return { ok: false, msg: md.name + ' không dùng được cho quái ' + mRace + '.' };
      }
      p.hand.splice(handIdx, 1);
      slot.buffs = slot.buffs || [];
      slot.buffs.push({ mid: md.id, atk: md.atk, name: md.name });
      pushLog(s, '⚒️ ' + p.name + ' gắn ' + md.name + ' (+' + md.atk + ' ATK) lên ' + mdata(slot.card).name + '.', 'magic');
      fx(s, { type: 'magic', pIdx, slotIdx: targetSlot, name: md.name, mid: md.id, icon: md.icon });
      return { ok: true };
    }

    // ---- RITUAL: hi sinh 3 nguyên liệu đúng -> triệu hồi ----
    if (mfx.kind === 'ritual') {
      const need = (md.offerings || []).slice();
      const usedField = [], usedHand = [];
      for (const oid of need) {
        let found = null;
        for (let si = 0; si < MONSTER_SLOTS && !found; si++) {
          const sl = p.field[si];
          if (sl && sl.kind === 'MONSTER' && sl.card.id === oid && !usedField.includes(si)) found = { src: 'F', i: si };
        }
        if (!found) {
          for (let hi = 0; hi < p.hand.length && !found; hi++) {
            const c = p.hand[hi];
            if (isMon(c) && c.id === oid && !usedHand.includes(hi)) found = { src: 'H', i: hi };
          }
        }
        if (!found) return { ok: false, msg: 'Thiếu nguyên liệu ritual: ' + (C.monsters[oid] || { name: '#' + oid }).name + '.' };
        (found.src === 'F' ? usedField : usedHand).push(found.i);
      }
      for (const si of usedField) { toGraveyard(s, pIdx, p.field[si]); p.field[si] = null; }
      for (const hi of usedHand.slice().sort(function (a, b) { return b - a; })) {
        const c = p.hand.splice(hi, 1)[0]; p.graveyard.push(c);
      }
      let empty = (targetSlot != null && isMonsterSlot(targetSlot) && !p.field[targetSlot]) ? targetSlot : -1;
      if (empty < 0) {
        for (let i = 0; i < MONSTER_SLOTS; i++) {
          if (!p.field[i]) { empty = i; break; }
        }
      }
      if (empty < 0) return { ok: false, msg: 'Không có ô trống ở hàng Quái để triệu hồi ritual!' };
      p.hand.splice(handIdx, 1);
      p.graveyard.push(card);
      const result = C.monsters[md.result];
      p.field[empty] = { kind: 'MONSTER', card: { kind: 'MONSTER', id: result.id, uid: s._uid++ }, pos: 'ATK', faceDown: false, attacked: false, posChanged: false, star: 0, buffs: [] };
      pushLog(s, '👁️ RITUAL — ' + p.name + ' hi sinh 3 nguyên liệu, triệu hồi ' + result.name + ' (' + result.atk + '/' + result.def + ')!', 'fusion');
      fx(s, { type: 'fusion', pIdx, slotIdx: empty, name: result.name, mid: result.id, atk: result.atk });
      return { ok: true, result: result };
    }

    p.hand.splice(handIdx, 1);

    switch (mfx.kind) {
      case 'heal': {
        healLP(s, pIdx, mfx.amount, md.name);
        return { ok: true };
      }
      case 'damage': {
        damageLP(s, enemy, mfx.amount, md.name);
        checkWin(s);
        return { ok: true };
      }
      case 'destroyAll': {
        pushLog(s, '🕳️ ' + p.name + ' dùng ' + md.name + ' — TẤT CẢ quái bị phá hủy!', 'magic');
        fx(s, { type: 'magic', pIdx, name: md.name, mid: md.id, all: true });
        for (let i = 0; i < MONSTER_SLOTS; i++) { destroyMonster(s, pIdx, i, md.name); destroyMonster(s, enemy, i, md.name); }
        checkWin(s);
        return { ok: true };
      }
      case 'destroyEnemyAll': {
        pushLog(s, '⚡ ' + p.name + ' dùng ' + md.name + ' — phòng thủ đối thủ bị nghiền nát!', 'magic');
        fx(s, { type: 'magic', pIdx, name: md.name, mid: md.id, all: true });
        for (let i = 0; i < MONSTER_SLOTS; i++) destroyMonster(s, enemy, i, md.name);
        checkWin(s);
        return { ok: true };
      }
      case 'destroyRace': {
        const races = mfx.races || [];
        let n = 0;
        for (let i = 0; i < MONSTER_SLOTS; i++) {
          const sl = s.players[enemy].field[i];
          if (sl && sl.kind === 'MONSTER' && races.includes(mdata(sl.card).race)) { destroyMonster(s, enemy, i, md.name); n++; }
        }
        pushLog(s, '☠️ ' + md.name + ' — phá hủy ' + n + ' quái ' + races.join('/') + ' của đối thủ.', 'magic');
        fx(s, { type: 'magic', pIdx, name: md.name, mid: md.id, all: true });
        checkWin(s);
        return { ok: true };
      }
      case 'flipAllEnemyDef': {
        let cnt = 0;
        for (let i = 0; i < MONSTER_SLOTS; i++) {
          const sl = s.players[enemy].field[i];
          if (sl && sl.kind === 'MONSTER' && sl.faceDown) { sl.faceDown = false; fx(s, { type: 'flip', pIdx: enemy, slotIdx: i, name: mdata(sl.card).name }); cnt++; }
        }
        pushLog(s, '👁 ' + md.name + ' — lật ' + cnt + ' quái úp của đối thủ.', 'magic');
        fx(s, { type: 'magic', pIdx, name: md.name, mid: md.id });
        return { ok: true };
      }
      case 'flipAllEnemyAtk': {
        for (let i = 0; i < MONSTER_SLOTS; i++) {
          const sl = s.players[enemy].field[i];
          if (sl && sl.kind === 'MONSTER' && sl.faceDown) { sl.faceDown = false; sl.pos = 'ATK'; fx(s, { type: 'flip', pIdx: enemy, slotIdx: i, name: mdata(sl.card).name }); }
        }
        pushLog(s, '👁 ' + md.name + ' — ép quái úp của đối thủ ra mặt + tấn công!', 'magic');
        fx(s, { type: 'magic', pIdx, name: md.name, mid: md.id });
        return { ok: true };
      }
      case 'forceDef': {
        const sl = s.players[enemy].field[targetSlot];
        if (!sl || sl.kind !== 'MONSTER' || sl.faceDown) return { ok: false, msg: 'Chọn quái ngửa của đối thủ làm mục tiêu.' };
        sl.pos = 'DEF';
        pushLog(s, '🎯 ' + md.name + ' — ' + mdata(sl.card).name + ' bị ép về phòng thủ!', 'magic');
        fx(s, { type: 'magic', pIdx, slotIdx: targetSlot, name: md.name, mid: md.id, icon: md.icon });
        return { ok: true };
      }
      case 'dragonsToDef': {
        for (let i = 0; i < MONSTER_SLOTS; i++) {
          const sl = s.players[enemy].field[i];
          if (sl && sl.kind === 'MONSTER' && !sl.faceDown && mdata(sl.card).race === 'Dragon') { sl.pos = 'DEF'; fx(s, { type: 'flip', pIdx: enemy, slotIdx: i, name: mdata(sl.card).name }); }
        }
        pushLog(s, '🏺 ' + md.name + ' — toàn bộ Dragon của đối thủ bị ép về phòng thủ!', 'magic');
        fx(s, { type: 'magic', pIdx, name: md.name, mid: md.id });
        return { ok: true };
      }
      case 'clearTraps': {
        let n = 0;
        for (let i = MONSTER_SLOTS; i < FIELD_SIZE; i++) {
          const sl = s.players[enemy].field[i];
          if (sl && sl.kind === 'TRAP') { toGraveyard(s, enemy, sl); s.players[enemy].field[i] = null; n++; }
        }
        pushLog(s, '🧹 ' + md.name + ' — phá ' + n + ' bẫy của đối thủ!', 'magic');
        fx(s, { type: 'magic', pIdx, name: md.name, mid: md.id });
        return { ok: true };
      }
      case 'terrain': {
        if (s.players.some(pl => pl.terrains.includes(md.id))) return { ok: false, msg: 'Địa hình này đã có trên sân.' };
        p.terrains.push(md.id);
        pushLog(s, '🏞️ ' + p.name + ' kích hoạt địa hình ' + md.name + ' (' + (md.terrain || []).join('/') + ' +500).', 'magic');
        fx(s, { type: 'terrain', pIdx, name: md.name, mid: md.id, icon: md.icon });
        return { ok: true };
      }
      default:
        return { ok: false, msg: 'Hiệu ứng thẻ chưa hỗ trợ (' + md.name + ').' };
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

  function setStar(s, pIdx, slotIdx, starIdx) {
    if (s.phase !== 'MAIN' || s.winner != null) return { ok: false, msg: 'Chỉ làm được ở Main Phase.' };
    const p = s.players[pIdx];
    const slot = p.field[slotIdx];
    if (!slot || slot.kind !== 'MONSTER') return { ok: false, msg: 'Chọn ô quái vật.' };
    const stars = mdata(slot.card).stars || [];
    if (!stars[1] || stars[0] === stars[1]) return { ok: false, msg: 'Quái này chỉ có 1 Guardian Star.' };
    const target = starIdx != null ? starIdx : (slot.star ? 0 : 1);
    slot.star = target;
    pushLog(s, '⭐ ' + mdata(slot.card).name + ' hướng tới Guardian Star ' + C.starName(stars[target]) + '.', 'act');
    return { ok: true };
  }

  /* ---------------- battle phase ---------------- */
  function canAttack(s, pIdx, slotIdx) {
    if (s.phase !== 'BATTLE' || s.winner != null) return false;
    if (!isMonsterSlot(slotIdx)) return false;
    const p = s.players[pIdx];
    const slot = p.field[slotIdx];
    return !!slot && slot.kind === 'MONSTER' && !slot.faceDown && slot.pos === 'ATK' && !slot.attacked;
  }

  // Kết quả: { target: slotIdx | -1 (direct) | null (không đánh được) }
  function attackTargets(s, pIdx, slotIdx, targetSlot) {
    const p = s.players[pIdx];
    const slot = p.field[slotIdx];
    if (!canAttack(s, pIdx, slotIdx)) return null;
    const enemy = s.players[1 - pIdx];
    const enemyMonsters = [];
    for (let i = 0; i < MONSTER_SLOTS; i++) {
      const sl = enemy.field[i];
      if (sl && sl.kind === 'MONSTER') enemyMonsters.push(i);
    }
    // Nếu đối thủ không còn quái vật trên hàng quái -> Đánh trực tiếp LP
    if (enemyMonsters.length === 0) return { target: -1, direct: true };
    // Nếu chỉ định mục tiêu hợp lệ -> đánh mục tiêu đó
    if (targetSlot != null && isMonsterSlot(targetSlot) && enemy.field[targetSlot] && enemy.field[targetSlot].kind === 'MONSTER') {
      return { target: targetSlot, direct: false };
    }
    // Mặc định: đối diện cùng cột nếu có, nếu không thì lấy quái đầu tiên
    if (enemyMonsters.includes(slotIdx)) return { target: slotIdx, direct: false };
    return { target: enemyMonsters[0], direct: false };
  }

  function doAttack(s, pIdx, slotIdx, targetSlot) {
    const t = attackTargets(s, pIdx, slotIdx, targetSlot);
    if (!t) return { ok: false, msg: 'Quái này không thể tấn công.' };
    const p = s.players[pIdx], enemyIdx = 1 - pIdx, e = s.players[enemyIdx];
    const aslot = p.field[slotIdx];
    const aName = mdata(aslot.card).name;
    var aAtk = effAtk(s, pIdx, aslot);
    aslot.attacked = true;
    pushLog(s, `⚔️ ${aName} của ${p.name} tấn công (${aAtk})!`, 'battle');
    fx(s, { type: 'attack', pIdx, slotIdx, targetIdx: t.target, name: aName, atk: aAtk, mid: mdata(aslot.card).id });

    // Bẫy phòng thủ kích hoạt trước khi va chạm (dispatch theo fx.kind — FM gốc)
    var trapDone = false;
    for (var ti2 = 0; ti2 < e.field.length && !trapDone; ti2++) {
      var tsl = e.field[ti2];
      if (!tsl || tsl.kind !== 'TRAP') continue;
      var tfx = (C.traps[tsl.tid] || {}).fx || {};
      var fire = false;
      if (tfx.kind === 'destroyAttacker') fire = true;                                   // Widespread Ruin
      else if (tfx.kind === 'destroyBelow') fire = aAtk < tfx.atk;                       // House/Eatgaboon/Bear/Wire/Acid
      else if (tfx.kind === 'negateDirect') fire = t.direct;                             // Goblin Fan
      else if (tfx.kind === 'stripEquips') fire = (aslot.buffs || []).length > 0;        // Reverse Trap
      if (!fire) continue;
      var tname = C.traps[tsl.tid].name;
      pushLog(s, '🪤 Bẫy kích hoạt: ' + e.name + ' — ' + tname + '!', 'trap');
      fx(s, { type: 'trap', pIdx: enemyIdx, slotIdx: ti2, name: tname, tid: tsl.tid });
      toGraveyard(s, enemyIdx, tsl);
      e.field[ti2] = null;
      if (tfx.kind === 'destroyAttacker' || tfx.kind === 'destroyBelow') {
        destroyMonster(s, pIdx, slotIdx, tname);
        return { ok: true, negated: true };
      }
      if (tfx.kind === 'negateDirect' && t.direct) {
        pushLog(s, '🪤 Đòn đánh trực tiếp bị hủy — ' + p.name + ' mất 500 LP!', 'trap');
        damageLP(s, pIdx, 500, 'Goblin Fan');
        checkWin(s);
        return { ok: true, negated: true };
      }
      if (tfx.kind === 'stripEquips') {
        for (var bi = 0; bi < MONSTER_SLOTS; bi++) {
          var bsl = p.field[bi];
          if (bsl && bsl.kind === 'MONSTER' && (bsl.buffs || []).length) {
            for (var bk = 0; bk < bsl.buffs.length; bk++) p.graveyard.push({ kind: 'MAGIC', mid: bsl.buffs[bk].mid, used: true });
            bsl.buffs = [];
          }
        }
        pushLog(s, '🔄 Reverse Trap — toàn bộ trang bị của ' + p.name + ' mất tác dụng!', 'trap');
      }
      trapDone = true;
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
    var dPower = dAtkPos ? effAtk(s, enemyIdx, dslot) : effDef(s, enemyIdx, dslot);
    // Guardian Star: ngôi sao mạnh hơn được +500 trong trận đánh này (luật FM gốc)
    var aStar = mdata(aslot.card).stars ? mdata(aslot.card).stars[aslot.star || 0] : null;
    var dStar = mdata(dslot.card).stars ? mdata(dslot.card).stars[dslot.star || 0] : null;
    if (C.starBeats(aStar, dStar)) { aAtk += 500; pushLog(s, '⭐' + C.starName(aStar) + ' thắng ⭐' + C.starName(dStar) + ' — ' + aName + ' +500!', 'battle'); }
    else if (C.starBeats(dStar, aStar)) { dPower += 500; pushLog(s, '⭐' + C.starName(dStar) + ' chiếm ưu thế — ' + dName + ' +500!', 'battle'); }
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
      case 'SET_STAR': return setStar(s, pIdx, action.slotIdx, action.starIdx);
      case 'ATTACK': return doAttack(s, pIdx, action.slotIdx, action.targetSlot);
      case 'BATTLE_PHASE': return { ok: startBattlePhase(s) };
      case 'END': return { ok: endTurn(s) };
      default: return { ok: false, msg: 'Unknown action' };
    }
  }

  FM.engine = {
    LP_START, HAND_MAX, FRONT_ROW,
    MONSTER_SLOTS, SPELL_SLOTS, FIELD_SIZE,
    isMonsterSlot, isSpellTrapSlot,
    newDuel, perform, drainFx,
    effAtk, effDef, isMon, mdata, monsterCount,
    canAttack, attackTargets, peekFusion,
    summon, setTrapCard, playMagic, fuse, changePos, setStar, doAttack,
    startBattlePhase, endTurn,
    slotRow, slotCol,
    // tiện cho test
    _state: null,
  };
})(typeof window !== 'undefined' ? window : globalThis);
