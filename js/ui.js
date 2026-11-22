/* =========================================================================
 * Forbidden Memory Web Clone — UI layer
 * Render + input + animation + sound. Duel engine ở engine.js, AI ở ai.js.
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM;
  const C = FM.cards, E = FM.engine;
  const $ = id => document.getElementById(id);

  const UI = FM.ui = {};
  let S = null;               // duel state hiện tại
  let mode = 'idle';          // idle|handSel|fusing|equipTarget|trapSlot|summonSlot|fuseSlot|fieldSel
  let selHand = -1;
  let selField = -1;
  let pending = {};           // dữ liệu tạm cho mode
  let session = 0;            // token hủy loop cũ khi restart
  let aiRunning = false;
  let muted = false;
  let cfg = null;             // { duelist, deckId, difficulty, campaign }

  /* ---------------- Sound (WebAudio, không cần file) ---------------- */
  let actx = null;
  function tone(f0, f1, dur, type, vol) {
    if (muted) return;
    try {
      actx = actx || new (root.AudioContext || root.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f0, actx.currentTime);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, actx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.08, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }
  const sfx = {
    select: () => tone(660, 0, 0.05, 'square', 0.05),
    summon: () => { tone(392, 660, 0.16, 'square', 0.07); },
    set: () => tone(330, 220, 0.12, 'square', 0.06),
    attack: () => { tone(200, 90, 0.18, 'sawtooth', 0.1); tone(400, 150, 0.12, 'square', 0.06); },
    damage: () => tone(140, 60, 0.3, 'sawtooth', 0.11),
    heal: () => { tone(523, 0, 0.12, 'sine', 0.08); setTimeout(() => tone(659, 0, 0.14, 'sine', 0.08), 90); },
    trap: () => tone(980, 120, 0.35, 'sawtooth', 0.09),
    fusion: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0, 0.14, 'square', 0.07), i * 90)); },
    magic: () => { tone(880, 1320, 0.2, 'sine', 0.07); },
    win: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0, 0.22, 'square', 0.08), i * 130)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0, 0.26, 'sawtooth', 0.08), i * 150)); },
  };

  /* ---------------- Card helpers ---------------- */
  function nameOf(card) {
    if (card.kind === 'MONSTER') return C.monsters[card.id].name;
    if (card.kind === 'MAGIC') return C.magics[card.mid].name;
    return C.traps[card.tid].name;
  }
  function iconOf(card) {
    if (card.kind === 'MONSTER') return C.raceIcon(C.monsters[card.id].race);
    if (card.kind === 'MAGIC') return C.magics[card.mid].icon;
    return C.traps[card.tid].icon;
  }
  function cardEl(card, faceDown, trapFaceDown) {
    const el = document.createElement('div');
    if (faceDown) {
      el.className = 'card face-down' + (card.kind === 'TRAP' || trapFaceDown ? ' trap' : '');
      return el;
    }
    el.className = 'card ' + (card.kind === 'MAGIC' ? 'magic' : card.kind === 'TRAP' ? 'trap' : '');
    const m = card.kind === 'MONSTER' ? C.monsters[card.id] : null;
    const md = card.kind === 'MAGIC' ? C.magics[card.mid] : null;
    const td = card.kind === 'TRAP' ? C.traps[card.tid] : null;
    const attrBg = m ? C.attrColor(m.attr) : (card.kind === 'MAGIC' ? '#2e86de' : '#c2457e');
    el.innerHTML =
      `<div class="cname">${m ? m.name : md ? md.name : td.name}</div>` +
      `<div class="cart" style="${m ? `background: radial-gradient(circle at 50% 35%, rgba(255,255,255,.8), ${C.attrColor(m.attr)}66)` : ''}">${m ? C.raceIcon(m.race) : md ? md.icon : td.icon}</div>` +
      `<div class="cstats">${m ? `<span class="catk">ATK ${m.atk}</span><span class="cdef">DEF ${m.def}</span>` : `<span>${card.kind === 'MAGIC' ? '✨ PHÉP' : '🪤 BẪY'}</span><span></span>`}</div>` +
      `<div class="cbadge" style="background:${attrBg}">${m ? m.attr : card.kind === 'MAGIC' ? 'MAGIC' : 'TRAP'}</div>`;
    return el;
  }

  /* ---------------- DOM refs / slot mapping ---------------- */
  function gridEl(pIdx) { return pIdx === 0 ? $('player-grid') : $('enemy-grid'); }
  function slotEl(pIdx, slotIdx) { return gridEl(pIdx).querySelector(`[data-i="${slotIdx}"]`); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------------- Render ---------------- */
  function renderTop() {
    const [p0, p1] = S.players;
    $('enemy-name').textContent = p1.name;
    $('enemy-portrait').textContent = cfg && cfg.duelist ? cfg.duelist.portrait : '👹';
    $('player-name').textContent = p0.name;
    for (const [p, pre] of [[p1, 'enemy'], [p0, 'player']]) {
      const pct = Math.max(0, Math.min(100, (p.lp / E.LP_START) * 100));
      const fill = $(pre + '-lpfill');
      fill.style.width = pct + '%';
      fill.classList.toggle('low', p.lp <= 2000);
      $(pre + '-lp').textContent = p.lp;
      $(pre + '-deck').textContent = '🂠 ' + p.deck.length;
      $(pre === 'player' ? 'player-handcount' : 'enemy-hand').textContent = '✋ ' + p.hand.length;
      $(pre + '-grave').textContent = '⚰️ ' + p.graveyard.length;
    }
    $('turn-num').textContent = 'Lượt ' + S.turnNo;
    const ph = $('phase-ind');
    ph.textContent = S.phase === 'BATTLE' ? 'Battle Phase' : S.phase === 'MAIN' ? 'Main Phase' : 'Kết thúc';
    ph.className = S.phase === 'BATTLE' ? 'phase-battle' : 'phase-main';
    // hand rows
    const eh = $('enemy-handrow'); eh.innerHTML = '';
    for (let i = 0; i < S.players[1].hand.length; i++) { const d = document.createElement('div'); d.className = 'mini-back'; eh.appendChild(d); }
    // terrains
    const ts = $('terrain-strip'); ts.innerHTML = '';
    const seen = new Set();
    for (const pl of S.players) for (const t of pl.terrains) {
      if (seen.has(t)) continue; seen.add(t);
      const md = C.magics[t];
      const chip = document.createElement('span'); chip.className = 'terrain-chip';
      chip.textContent = md.icon + ' ' + md.name + ' — ' + md.ttext;
      ts.appendChild(chip);
    }
    showTurnBanner();
  }

  /* Banner chuyển lượt */
  let bannerKey = '';
  function showTurnBanner() {
    if (!S || S.winner != null) return;
    const key = S.turnNo + '|' + S.active;
    if (key === bannerKey) return;
    bannerKey = key;
    const bn = $('turn-banner');
    if (!bn) return;
    const isMe = S.active === 0;
    $('turn-banner-text').textContent = isMe ? '⚡ LƯỢT CỦA BẠN' : '☠ LƯỢT CỦA ' + S.players[1].name.toUpperCase();
    bn.classList.toggle('enemy', !isMe);
    bn.classList.remove('hidden');
    clearTimeout(bn._h);
    bn._h = setTimeout(() => bn.classList.add('hidden'), 1250);
  }

  function renderGrid(pIdx) {
    const p = S.players[pIdx];
    const g = gridEl(pIdx);
    g.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'slotcell';
      cell.dataset.i = i;
      const sl = p.field[i];
      if (sl) {
        const wrap = document.createElement('div');
        wrap.className = 'slotcard';
        const el = cardEl(sl.kind === 'TRAP' ? { kind: 'TRAP', tid: sl.tid } : sl.card, !!sl.faceDown, sl.kind === 'TRAP');
        if (sl.kind === 'MONSTER' && !sl.faceDown) {
          if ((sl.buffs || []).length) el.classList.add('equipped');
          // ATK/DEF hiệu dụng hiện tại (equip + địa hình) đè lên stat gốc — thắng/thua nhìn là biết
          const base = C.monsters[sl.card.id];
          const curAtk = E.effAtk(S, pIdx, sl), curDef = E.effDef(S, pIdx, sl);
          const catk = el.querySelector('.catk'), cdef = el.querySelector('.cdef');
          if (sl.pos === 'ATK') {
            catk.textContent = '⚔' + curAtk;
            catk.classList.toggle('buffed', curAtk > base.atk);
            catk.classList.toggle('nerfed', curAtk < base.atk);
            cdef.style.opacity = '.4';
          } else {
            cdef.textContent = '🛡' + curDef;
            cdef.classList.toggle('buffed', curDef > base.def);
            cdef.classList.toggle('nerfed', curDef < base.def);
            catk.style.opacity = '.4';
          }
          const pos = document.createElement('div');
          pos.className = 'posico ' + (sl.pos === 'ATK' ? 'atk' : 'def');
          pos.textContent = sl.pos === 'ATK' ? '⚔ ATK' : '🛡 DEF';
          el.appendChild(pos);
        }
        wrap.appendChild(el);
        cell.appendChild(wrap);
        // highlight cho tương tác
        if (myTurnMain()) {
          if (mode === 'fusing' && validFuseB(pIdx, i)) el.classList.add('targetable');
          if (mode === 'equipTarget' && pending.handIdx != null && equipMatch(pending.handIdx, pIdx, i)) el.classList.add('targetable');
          if (mode === 'fieldSel' && selField === i) el.classList.add('selected');
        }
        if (myTurnBattle() && E.canAttack(S, 0, i)) el.classList.add('attackable');
      } else if (myTurnMain() && (mode === 'trapSlot' || mode === 'summonSlot' || mode === 'fuseSlot')) {
        cell.classList.add('empty-target');
      }
      cell.addEventListener('click', () => onSlotClick(pIdx, i));
      g.appendChild(cell);
    }
  }

  function renderHand() {
    const p = S.players[0];
    const h = $('player-hand');
    h.innerHTML = '';
    p.hand.forEach((card, i) => {
      const el = cardEl(card, false);
      if (myTurnMain()) {
        // highlight bài chơi được ngay (UX: nhìn là biết bài nào dùng được)
        if (isPlayable(card)) el.classList.add('playable');
        if (mode === 'handSel' && selHand === i) el.classList.add('selected');
        if (mode === 'fusing' && pending.a && pending.a.src === 'FIELD' && card.kind === 'MONSTER') el.classList.add('targetable');
        if (mode === 'fusing' && pending.a && pending.a.src === 'HAND' && card.kind === 'MONSTER') el.classList.add('targetable');
        el.addEventListener('click', ev => { ev.stopPropagation(); onHandClick(i); });
      } else {
        el.addEventListener('click', ev => { ev.stopPropagation(); showPreview(card, 'Bài trên tay của bạn'); });
      }
      h.appendChild(el);
    });
  }

  function renderLog() {
    const lp = $('log-list');
    lp.innerHTML = '';
    S.log.slice(-70).forEach(l => {
      const d = document.createElement('div');
      d.className = l.cls || '';
      d.textContent = l.t;
      lp.appendChild(d);
    });
    lp.scrollTop = lp.scrollHeight;
    const ticker = $('log-ticker');
    ticker.innerHTML = '';
    S.log.slice(-5).forEach(l => {
      const d = document.createElement('div'); d.className = 'lt'; d.textContent = l.t; ticker.appendChild(d);
    });
  }

  function renderActionBar() {
    const ab = $('actionbar');
    ab.innerHTML = '';
    const addBtn = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; ab.appendChild(b); };
    const hint = t => { const d = document.createElement('div'); d.style.cssText = 'font-size:11.5px;color:#8b86a0;line-height:1.5;padding:2px'; d.textContent = t; ab.appendChild(d); };

    if (!S || S.winner != null) { hint('Trận đấu kết thúc.'); return; }
    if (S.active === 1) { hint('🤖 ' + S.players[1].name + ' đang suy nghĩ...'); return; }
    if (S.phase === 'BATTLE') {
      hint('⚔ Battle Phase — chọn quái có viền sáng để TẤN CÔNG. Cột trống = đánh thẳng LP!');
      addBtn('⏭ Kết Thúc Lượt', () => doEndTurn(), 'primary');
      return;
    }
    // MAIN, lượt người chơi
    if (mode === 'handSel' && selHand >= 0) {
      const card = S.players[0].hand[selHand];
      hint('Đã chọn: ' + nameOf(card));
      if (card.kind === 'MONSTER') {
        addBtn('⬆ Triệu Hồi ATK', () => enterSummonSlot(false), 'primary');
        addBtn('🂠 Set Úp (DEF)', () => enterSummonSlot(true));
        addBtn('🧪 Fusion với thẻ khác…', () => enterFusing({ src: 'HAND', idx: selHand }));
      } else if (card.kind === 'MAGIC') {
        const md = C.magics[card.mid];
        if (md.atk) addBtn('✨ Gắn Trang Bị…', () => { mode = 'equipTarget'; pending = { handIdx: selHand }; renderAll(); });
        else addBtn('🪄 Kích Hoạt', () => doMagic(selHand, null), 'primary');
        hint(md.desc || (md.terrain ? 'Địa hình toàn trận: ' + md.ttext : md.etext));
      } else if (card.kind === 'TRAP') {
        addBtn('🪤 Set Bẫy…', () => { mode = 'trapSlot'; pending = { handIdx: selHand }; renderAll(); });
        hint(C.traps[card.tid].desc);
      }
      addBtn('✖ Bỏ chọn', resetMode);
    } else if (mode === 'fusing') {
      hint('🧪 Chọn nguyên liệu fusion THỨ HAI (bài tay hoặc quái ngửa của bạn).');
      addBtn('✖ Huỷ Fusion', resetMode);
    } else if (mode === 'summonSlot') {
      hint('Chọn một ô TRỐNG trên sân để đặt bài.');
      addBtn('✖ Huỷ', resetMode);
    } else if (mode === 'trapSlot') {
      hint('Chọn ô TRỐNG để SET bẫy (bẫy tự kích hoạt khi đối thủ hành động).');
      addBtn('✖ Huỷ', resetMode);
    } else if (mode === 'equipTarget') {
      hint('Chọn quái ngửa khớp điều kiện để gắn trang bị.');
      addBtn('✖ Huỷ', resetMode);
    } else if (mode === 'fuseSlot') {
      hint('Chọn ô TRỐNG để triệu hồi kết quả fusion.');
      addBtn('✖ Huỷ', resetMode);
    } else if (mode === 'fieldSel' && selField >= 0) {
      const sl = S.players[0].field[selField];
      if (sl && sl.kind === 'MONSTER') {
        hint('Quái: ' + E.mdata(sl.card).name + (sl.faceDown ? ' (úp)' : sl.pos === 'ATK' ? ' (ATK)' : ' (DEF)'));
        if (!sl.faceDown) addBtn('🧪 Fusion quái này + bài tay…', () => enterFusing({ src: 'FIELD', idx: selField }));
        if (!sl.posChanged) addBtn('🔄 Đổi Tư Thế', () => { E.perform(S, { type: 'CHANGE_POS', slotIdx: selField }); resetMode(); postAction(); }, 'primary');
      }
      addBtn('✖ Bỏ chọn', resetMode);
    } else {
      hint('▶ Main Phase: chọn bài trên tay để triệu hồi / set / fusion / dùng phép.');
    }
  }

  function renderPreview(sel) {
    const pv = $('preview');
    pv.innerHTML = '';
    if (!sel) {
      pv.innerHTML = `<div class="pdesc" style="padding:8px;text-align:center">👆 Chọn một thẻ để xem chi tiết.<br><br>💡 Cùng hệ/race + công thức đặc biệt = FUSION thành quái mạnh hơn!</div>`;
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'preview-card';
    const el = cardEl(sel.card, false);
    wrap.appendChild(el);
    let desc = '';
    if (sel.card.kind === 'MONSTER') {
      const m = C.monsters[sel.card.id];
      desc = `${m.race} · ${m.attr}`;
      // gợi ý công thức có mốc monster này
      const recipes = [];
      for (const key in C.fusions) {
        const [a, b] = key.split('|').map(Number);
        const r = C.monsters[C.fusions[key]];
        if (a === sel.card.id || b === sel.card.id) recipes.push(`${C.monsters[a].name} + ${C.monsters[b].name} → ${r.name}`);
      }
      if (recipes.length) {
        const f = document.createElement('div'); f.className = 'pfusion';
        f.innerHTML = '<b>🧪 Công thức:</b><br>' + recipes.slice(0, 3).map(x => '• ' + x).join('<br>');
        wrap.appendChild(f);
      }
    } else if (sel.card.kind === 'MAGIC') {
      const md = C.magics[sel.card.mid];
      desc = md.desc || (md.terrain ? 'Địa hình toàn trận: ' + md.ttext : md.etext);
    } else {
      desc = C.traps[sel.card.tid].desc;
    }
    const d = document.createElement('div'); d.className = 'pdesc'; d.textContent = (sel.note ? sel.note + ' — ' : '') + desc;
    wrap.appendChild(d);
    pv.appendChild(wrap);
  }

  function renderAll() {
    renderTop();
    renderGrid(0);
    renderGrid(1);
    renderHand();
    renderLog();
    renderActionBar();
    renderPreview(previewCard());
    $('btn-battle').classList.toggle('hidden', !(S && S.phase === 'MAIN' && S.active === 0 && S.winner == null));
    $('btn-endturn').classList.toggle('hidden', !(S && S.phase === 'MAIN' && S.active === 0 && S.winner == null));
    saveDuel();
  }

  /* Lưu / khôi phục trận đang đánh (chống mất khi F5/tab reload) */
  function saveDuel() {
    if (!S || S.winner != null) { try { localStorage.removeItem('fm_duel_v1'); } catch (e) {} return; }
    try {
      const duelistId = cfg && cfg.duelist ? cfg.duelist.id : null;
      localStorage.setItem('fm_duel_v1', JSON.stringify({
        s: S, duelistId, deckId: cfg && cfg.deckId, difficulty: cfg && cfg.difficulty,
      }));
    } catch (e) { /* storage đầy: bỏ qua */ }
  }

  UI.restoreDuel = function () {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('fm_duel_v1') || 'null'); } catch (e) { return false; }
    if (!saved || !saved.s || saved.s.winner != null) return false;
    cfg = { duelist: FM.decks.DUELISTS.find(d => d.id === saved.duelistId) || FM.decks.DUELISTS[0], deckId: saved.deckId, difficulty: saved.difficulty != null ? saved.difficulty : 1, campaign: true };
    session += 1;
    mode = 'idle'; selHand = -1; selField = -1; pending = {}; previewSel = null; bannerKey = '';
    S = saved.s;
    // đèn hiệu: đã khôi phục
    if (FM.fx && FM.fx.boot) {
      FM.fx.boot();
      FM.fx.setArena(ARENA_BY_DUELIST[cfg.duelist.id] || 'temple');
      // khôi phục weather theo terrain đã có
      const t = S.players.some(pl => pl.terrains.length) ? S.players.flatMap(pl => pl.terrains)[0] : null;
      FM.fx.setWeather(t || null);
    }
    $('menu').classList.add('hidden');
    $('battle').classList.remove('hidden');
    renderAll();
    toast('🔄 Đã khôi phục trận đang đánh — ' + cfg.duelist.name);
    if (S.winner == null && S.active === 1) startAiLoop();
    return true;
  };

  let previewSel = null;
  function previewCard() {
    if (previewSel) return previewSel;
    if (mode === 'handSel' && selHand >= 0) { const c = S.players[0].hand[selHand]; return c ? { card: c } : null; }
    if (selField >= 0) { const sl = S.players[0].field[selField]; if (sl && sl.kind === 'MONSTER' && !sl.faceDown) return { card: sl.card }; }
    return null;
  }

  function showPreview(card, note) { previewSel = { card, note }; renderPreview(previewSel); setTimeout(() => { previewSel = null; renderPreview(null); }, 4000); }

  /* ---------------- Mode helpers ---------------- */
  function isPlayable(card) {
    if (!S || S.winner != null) return false;
    const p = S.players[0];
    const hasEmpty = p.field.some(x => !x);
    if (card.kind === 'MONSTER') return hasEmpty;
    if (card.kind === 'TRAP') return hasEmpty;
    const md = C.magics[card.mid];
    if (md.atk) return p.field.some(sl => sl && sl.kind === 'MONSTER' && !sl.faceDown && md.match(E.mdata(sl.card)));
    if (md.terrain) return !s.players.some(pl => pl.terrains.includes(md.id));
    if (md.id === 'fissure') return E.monsterCount(s.players[1]) > 0 && s.players[1].field.some(sl => sl && sl.kind === 'MONSTER' && !sl.faceDown);
    return true; // darkHole/raigeki/dianKeto
  }

  function resetMode() { mode = 'idle'; selHand = -1; selField = -1; pending = {}; renderAll(); }
  function myTurnMain() { return S && S.winner == null && S.phase === 'MAIN' && S.active === 0 && !aiRunning; }
  function myTurnBattle() { return S && S.winner == null && S.phase === 'BATTLE' && S.active === 0 && !aiRunning; }
  function equipMatch(handIdx, pIdx, slotIdx) {
    const card = S.players[0].hand[handIdx];
    if (!card || card.kind !== 'MAGIC') return false;
    const md = C.magics[card.mid];
    const sl = S.players[pIdx].field[slotIdx];
    return !!(md.atk && sl && sl.kind === 'MONSTER' && !sl.faceDown && md.match(E.mdata(sl.card)));
  }
  function validFuseB(pIdx, slotIdx) {
    if (!pending.a) return false;
    const sl = S.players[pIdx].field[slotIdx];
    if (!sl || sl.kind !== 'MONSTER' || sl.faceDown) return false;
    if (pending.a.src === 'FIELD' && pending.a.idx === slotIdx) return false; // không tự fusing với chính mình
    return true;
  }
  function enterSummonSlot(faceDown) { mode = 'summonSlot'; pending = { handIdx: selHand, faceDown }; renderAll(); }
  function enterFusing(a) { mode = 'fusing'; pending = { a }; sfx.select(); renderAll(); }

  /* ---------------- Human actions ---------------- */
  function onHandClick(i) {
    if (!myTurnMain()) return;
    if (mode === 'fusing' && pending.a && pending.a.src !== 'HAND2' && (pending.a.src === 'FIELD' || pending.a.src === 'HAND')) {
      // chọn nguyên liệu B từ tay
      if (i === pending.a.idx && pending.a.src === 'HAND') { resetMode(); return; }
      const a = pending.a;
      const result = E.peekFusion(S, 0, a, { src: 'HAND', idx: i });
      if (!result) { toast('❌ Hai thẻ này không hợp nhất được!'); sfx.set(); return; }
      confirmFusion(a, { src: 'HAND', idx: i }, result);
      return;
    }
    const card = S.players[0].hand[i];
    sfx.select();
    if (mode === 'handSel' && selHand === i) { resetMode(); return; }
    mode = 'handSel'; selHand = i; selField = -1; renderAll();
  }

  function onSlotClick(pIdx, i) {
    if (!myTurnMain() && !myTurnBattle()) {
      // xem bài đối thủ (ngửa)
      const sl = S.players[pIdx].field[i];
      if (sl && (sl.kind !== 'MONSTER' || !sl.faceDown)) {
        const card = sl.kind === 'MONSTER' ? sl.card : (sl.kind === 'TRAP' ? { kind: 'TRAP', tid: sl.tid } : { kind: 'MAGIC', mid: sl.mid });
        showPreview(card, 'Thẻ của đối thủ');
      }
      return;
    }
    if (pIdx === 1) return; // lượt mình thì không click sân đối thủ
    const p = S.players[0];
    const sl = p.field[i];

    // Battle phase: tấn công
    if (myTurnBattle()) {
      if (sl && sl.kind === 'MONSTER' && E.canAttack(S, 0, i)) { doAttack(i); }
      else if (sl && sl.kind === 'MONSTER' && !sl.faceDown) { showPreview(sl.card, 'Quái của bạn'); }
      return;
    }

    // Main phase theo mode
    if (mode === 'summonSlot' && !sl) {
      E.perform(S, { type: 'SUMMON', handIdx: pending.handIdx, slotIdx: i, faceDown: pending.faceDown });
      resetMode(); postAction(); return;
    }
    if (mode === 'trapSlot' && !sl) {
      E.perform(S, { type: 'SET_TRAP', handIdx: pending.handIdx, slotIdx: i });
      resetMode(); postAction(); return;
    }
    if (mode === 'fuseSlot' && !sl && pending.fuseAB) {
      const { a, b } = pending.fuseAB;
      const r = E.perform(S, { type: 'FUSION', a, b, targetSlot: i });
      pending = {};
      if (!r.ok) toast('❌ ' + (r.msg || 'Fusion thất bại'));
      resetMode(); postAction(r); return;
    }
    if (mode === 'fusing' && sl && sl.kind === 'MONSTER' && !sl.faceDown && validFuseB(0, i)) {
      const a = pending.a;
      if (a.src === 'FIELD' && a.idx === i) return;
      const b = { src: 'FIELD', idx: i };
      const result = E.peekFusion(S, 0, a, b);
      if (!result) { toast('❌ Hai thẻ này không hợp nhất được!'); sfx.set(); return; }
      confirmFusion(a, b, result);
      return;
    }
    if (mode === 'equipTarget' && equipMatch(pending.handIdx, 0, i)) {
      E.perform(S, { type: 'MAGIC', handIdx: pending.handIdx, targetSlot: i });
      resetMode(); postAction(); return;
    }
    if (mode === 'fieldSel' && selField === i) { resetMode(); return; }

    // idle/other: chọn quái trên sân
    if (sl) {
      sfx.select();
      if (sl.kind === 'MONSTER') {
        if (!sl.faceDown) previewSel = null;
        mode = 'fieldSel'; selField = i; selHand = -1;
        if (!sl.faceDown) showPreviewInstant(sl.card);
        renderAll();
      } else {
        showPreview({ kind: 'TRAP', tid: sl.tid }, 'Bẫy đã SET (ẩn cho đối thủ)');
      }
    } else {
      resetMode();
    }
  }

  function showPreviewInstant(card) { previewSel = { card }; }

  function confirmFusion(a, b, result) {
    // field fusion (A hoặc B trên sân): đích cố định tại ô nguyên liệu sân
    const fieldSlot = a.src === 'FIELD' ? a.idx : (b.src === 'FIELD' ? b.idx : null);
    openModal(`
      <h1 style="font-size:24px">🧪 FUSION</h1>
      <div class="msub">${nameOf(cardOf(a))} + ${nameOf(cardOf(b))}</div>
      <div id="fusion-preview"></div>
      <div class="mbtns">
        <button class="primary" id="fuse-ok">✔ Xác Nhận</button>
        <button id="fuse-no">✖ Huỷ</button>
      </div>
    `, true);
    $('fusion-preview').innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'preview-card';
    wrap.appendChild(cardEl({ kind: 'MONSTER', id: result.id }, false));
    const d = document.createElement('div'); d.className = 'pdesc';
    d.textContent = result.name + ' — ATK ' + result.atk + ' / DEF ' + result.def + (fieldSlot == null ? '. Chọn ô trống để triệu hồi.' : '. Thay thế tại ô nguyên liệu trên sân.');
    wrap.appendChild(d);
    $('fusion-preview').appendChild(wrap);
    $('fuse-ok').onclick = () => {
      closeModal();
      sfx.fusion();
      if (fieldSlot != null) {
        const r = E.perform(S, { type: 'FUSION', a, b, targetSlot: fieldSlot });
        if (!r.ok) toast('❌ ' + (r.msg || 'Fusion thất bại'));
        resetMode(); postAction(r);
      } else {
        mode = 'fuseSlot'; pending = { fuseAB: { a, b } }; renderAll();
        toast('👉 Chọn một ô trống để đặt ' + result.name);
      }
    };
    $('fuse-no').onclick = () => { closeModal(); renderAll(); };
  }

  function cardOf(src) {
    return src.src === 'HAND' ? S.players[0].hand[src.idx] : S.players[0].field[src.idx].card;
  }

  function doMagic(handIdx, targetSlot) {
    const card = S.players[0].hand[handIdx];
    const md = C.magics[card.mid];
    // equip cần chọn đích — đã qua mode equipTarget
    const r = E.perform(S, { type: 'MAGIC', handIdx, targetSlot });
    if (!r.ok) { toast('❌ ' + (r.msg || 'Không dùng được')); return; }
    resetMode();
    postAction(r);
    if (md.id === 'dianKeto') sfx.heal(); else sfx.magic();
  }

  function doAttack(slotIdx) {
    sfx.attack();
    const r = E.perform(S, { type: 'ATTACK', slotIdx });
    postAction(r);
  }

  function doEndTurn() {
    resetMode();
    E.perform(S, { type: 'END' });
    postAction();
  }

  /* Sau mỗi action: animate fx rồi render; khởi động AI nếu đến lượt máy */
  function postAction(result) {
    if (result && result.ok === false) { renderAll(); return; }
    startFxThen(S).then(() => {
      renderAll();
      maybeGameOver();
      if (S && S.winner == null && S.active === 1) startAiLoop();
    });
  }

  /* ---------------- FX animation ---------------- */
  async function startFxThen(st) {
    const events = E.drainFx(st);
    let lastAttack = null;   // nhớ đòn đánh mới nhất cho hiệu ứng bẫy
    for (const ev of events) {
      await applyFx(ev, lastAttack);
      if (ev.type === 'attack') lastAttack = ev;
    }
  }

  function overlayDiv(cls, atEl, html) {
    const d = document.createElement('div');
    d.className = cls;
    if (html) d.innerHTML = html;
    document.body.appendChild(d);
    if (atEl) {
      const r = atEl.getBoundingClientRect();
      d.style.left = (r.left + r.width / 2) + 'px';
      d.style.top = (r.top + r.height / 2) + 'px';
      d.style.transform = 'translate(-50%, -50%)';
    }
    setTimeout(() => d.remove(), 1100);
    return d;
  }
  function hitLp(pIdx) {
    const bar = $(pIdx === 0 ? 'player-lpfill' : 'enemy-lpfill');
    if (!bar) return null;
    bar.parentElement.classList.remove('hitflash');
    void bar.parentElement.offsetWidth;
    bar.parentElement.classList.add('hitflash');
    return bar;
  }
  const attrBurstColors = {
    FIRE: ['#ff8844', '#ffcc44', '#ff5533'], WATER: ['#44aaff', '#88ddff', '#2288dd'],
    EARTH: ['#cca244', '#887744', '#e0c080'], WIND: ['#66dd99', '#aaffcc', '#44bb77'],
    LIGHT: ['#fff2b0', '#ffe066', '#ffffff'], DARK: ['#aa55ff', '#6633cc', '#2a1a4a'],
  };

  async function applyFx(ev, lastAttack) {
    const el = (ev.pIdx != null && ev.slotIdx != null) ? slotEl(ev.pIdx, ev.slotIdx) : null;
    const cardIn = el ? el.querySelector('.card') : null;
    const F = FM.fx;
    switch (ev.type) {
      case 'summon': {
        renderAll(); // thẻ mới xuất hiện trước rồi mới animate
        sfx.summon();
        const el2 = slotEl(ev.pIdx, ev.slotIdx);
        const card2 = el2 && el2.querySelector('.card');
        if (card2) card2.classList.add('newfx');
        if (el2) F.ringAt(el2, ev.atk >= 2400 ? 'rgba(255,225,130,.95)' : 'rgba(140,190,255,.8)');
        if (ev.atk >= 2400) {
          F.pillarAt(el2, '#ffe98a');
          toast('👑 ' + ev.name + ' xuất hiện!');
          [...document.querySelectorAll('.grid')].forEach(g => g.classList.add('dimmed'));
          await sleep(800);
          [...document.querySelectorAll('.grid')].forEach(g => g.classList.remove('dimmed'));
        }
        await sleep(420);
        if (card2) card2.classList.remove('newfx');
        break;
      }
      case 'set':
        sfx.set();
        if (cardIn) cardIn.classList.add('newfx');
        await sleep(280);
        if (cardIn) cardIn.classList.remove('newfx');
        break;
      case 'fusion': {
        renderAll();
        sfx.fusion();
        toast('🧪 FUSION → ' + ev.name + '!');
        const el2 = slotEl(ev.pIdx, ev.slotIdx);
        if (el2) {
          const r = el2.getBoundingClientRect();
          F.vortexAt(r.left + r.width / 2, r.top + r.height / 2, 700, { maxR: 120 });
          F.burstAt(el2, { colors: ['#c9a0ff', '#8a4fff', '#ffffff'], count: 30, power: 320 });
          const card2 = el2.querySelector('.card');
          if (card2) card2.classList.add('newfx');
        }
        await sleep(700);
        const card2b = slotEl(ev.pIdx, ev.slotIdx);
        const c3 = card2b && card2b.querySelector('.card');
        if (c3) c3.classList.remove('newfx');
        break;
      }
      case 'attack': {
        sfx.attack();
        const tgt = ev.targetIdx != null && ev.targetIdx >= 0 ? slotEl(1 - ev.pIdx, ev.targetIdx) : null;
        if (cardIn) {
          cardIn.classList.add(ev.pIdx === 0 ? 'lunge-up' : 'lunge-down');
        }
        await sleep(240);
        if (ev.targetIdx === -1) {
          // direct: comet bay vào LP bar
          const lpBar = $(ev.pIdx === 0 ? 'enemy-lpfill' : 'player-lpfill');
          if (cardIn && lpBar) F.comet(cardIn, lpBar, { color: '#ff8844' });
          await sleep(320);
        } else if (tgt) {
          F.ringAt(tgt, 'rgba(255,160,80,.9)');
          F.burstAt(tgt, { colors: ['#ffd75e', '#ff8844', '#ffffff'], count: 16, power: 260 });
        }
        if (cardIn) cardIn.classList.remove('lunge-up', 'lunge-down');
        await sleep(140);
        break;
      }
      case 'defender':
        if (cardIn) {
          cardIn.classList.add('shake');
          F.ringAt(cardIn, ev.atkPos ? 'rgba(255,120,80,.85)' : 'rgba(90,160,255,.85)');
          await sleep(320);
          cardIn.classList.remove('shake');
        }
        break;
      case 'destroy': {
        sfx.damage();
        const colors = attrBurstColors[ev.attr] || ['#ff8844', '#ffffff'];
        if (cardIn) {
          F.burstAt(cardIn, { colors, count: 30, power: 330 });
          cardIn.classList.add('dying');
          await sleep(430);
          cardIn.classList.remove('dying');
        }
        break;
      }
      case 'damage': {
        sfx.damage();
        F.shake(Math.min(14, 4 + ev.amount / 90));
        const bar = hitLp(ev.pIdx);
        if (ev.amount >= 1500) F.flash('rgba(255,60,40,', 0.22, 320);
        floatText(ev.pIdx === 0 ? $('player-lpfill') : $('enemy-lpfill'), '-' + ev.amount, false);
        await sleep(520);
        break;
      }
      case 'heal':
        sfx.heal();
        F.emojiBurst($(ev.pIdx === 0 ? 'player-lpfill' : 'enemy-lpfill'), '💚', 7);
        floatText(ev.pIdx === 0 ? $('player-lpfill') : $('enemy-lpfill'), '+' + ev.amount, true);
        await sleep(420);
        break;
      case 'trap': {
        sfx.trap();
        F.flash('rgba(255,80,180,', 0.18, 260);
        toast('🪤 ' + ev.name + ' kích hoạt!');
        // lật bẫy cho thấy mặt rồi biến mất (DOM pre-render còn thẻ bẫy)
        if (cardIn && cardIn.classList.contains('face-down')) cardIn.classList.add('trap-reveal');
        await sleep(500);
        // hiệu ứng riêng theo loại bẫy
        const atkEl = lastAttack ? slotEl(lastAttack.pIdx, lastAttack.slotIdx) : null;
        if (ev.tid === 'trapHole' && atkEl) {
          overlayDiv('pit-hole', atkEl);
          const aCard = atkEl.querySelector('.card');
          if (aCard) aCard.classList.add('falling');
          F.emojiBurst(atkEl, '🕳️', 5);
          await sleep(800);
        } else if (ev.tid === 'widespread' && atkEl) {
          F.ringAt(atkEl, 'rgba(255,60,60,.95)');
          F.ringAt(atkEl, 'rgba(255,220,80,.9)');
          overlayDiv('chains-overlay', atkEl, '🎯');
          F.burstAt(atkEl, { colors: ['#ff5533', '#ffd75e'], count: 34, power: 380 });
          F.shake(10);
          await sleep(500);
        } else if (ev.tid === 'desserts') {
          const lpBar = $(lastAttack && lastAttack.pIdx === 0 ? 'player-lpfill' : 'enemy-lpfill');
          for (let i = 0; i < 3; i++) { F.emojiBurst(lpBar, '🍮', 6, 1.6); await sleep(160); }
          await sleep(400);
        } else if (ev.tid === 'captureJar' && atkEl) {
          overlayDiv('chains-overlay', atkEl, '🔗🔗🔗');
          F.emojiBurst(atkEl, '🏺', 6);
          await sleep(600);
        } else if (ev.tid === 'antiRaigeki') {
          const trapSide = $(ev.pIdx === 0 ? 'player-lpfill' : 'enemy-lpfill');
          const dome = overlayDiv('shield-dome', trapSide);
          await sleep(450);
          F.lightningStrike(trapSide, { count: 3 });
          await sleep(400);
        }
        break;
      }
      case 'magic': {
        sfx.magic();
        toast('✨ ' + ev.name + '!');
        switch (ev.mid) {
          case 'raigeki': {
            F.flash('rgba(220,235,255,', 0.4, 380);
            const targets = [...document.querySelectorAll('#enemy-grid .slotcell .card')].filter(c => !c.classList.contains('face-down')).slice(0, 6);
            for (const t of targets) F.lightningStrike(t, { count: 2 });
            F.shake(12);
            await sleep(700);
            break;
          }
          case 'darkHole': {
            const gr = document.getElementById('player-grid').getBoundingClientRect();
            const cx = gr.left + gr.width / 2, cy = (gr.top + gr.bottom) / 2 - 60;
            F.vortexAt(cx, cy, 1100, { maxR: 190, color: 'rgba(120,40,200,.55)' });
            F.flash('rgba(30,0,50,', 0.3, 600);
            F.shake(9);
            await sleep(1000);
            break;
          }
          case 'fissure': {
            const crack = document.createElement('div');
            crack.className = 'ground-crack';
            crack.style.top = (window.innerHeight / 2 - 10) + 'px';
            document.body.appendChild(crack);
            setTimeout(() => crack.remove(), 900);
            F.shake(11);
            await sleep(550);
            break;
          }
          case 'dianKeto': {
            const lpBar = $(ev.pIdx === 0 ? 'player-lpfill' : 'enemy-lpfill');
            F.emojiBurst(lpBar, '💚', 8);
            F.burstAt(lpBar, { colors: ['#55ff88', '#aaffcc'], count: 20, power: 200 });
            await sleep(420);
            break;
          }
          default: {
            if (ev.slotIdx != null) {
              const el2 = slotEl(ev.pIdx, ev.slotIdx);
              if (el2) {
                F.burstAt(el2, { colors: ['#9ecbff', '#ffffff', '#ffd75e'], count: 20, power: 220 });
                F.ringAt(el2, 'rgba(140,200,255,.9)');
                overlayDiv('chains-overlay', el2, ev.icon || '✨');
                const card2 = el2.querySelector('.card');
                if (card2) card2.classList.add('shielded');
                setTimeout(() => card2 && card2.classList.remove('shielded'), 1400);
              }
            }
            await sleep(380);
          }
        }
        break;
      }
      case 'terrain': {
        sfx.magic();
        FM.fx.setWeather(ev.mid);
        toast('🏞️ Địa hình: ' + ev.name + ' — môi trường biến đổi!');
        F.flash('rgba(255,240,200,', 0.22, 500);
        const gr = document.getElementById('board-area');
        if (gr) F.burstAt(gr, { colors: ['#ffe98a', '#a5e8a0', '#9ecbff'], count: 40, power: 380 });
        overlayDiv('chains-overlay', gr, ev.icon + ' ' + ev.name);
        await sleep(750);
        break;
      }
      case 'flip': {
        renderAll();
        const card2 = slotEl(ev.pIdx, ev.slotIdx);
        const c3 = card2 && card2.querySelector('.card');
        if (c3) c3.classList.add('newfx');
        sfx.set();
        await sleep(320);
        if (c3) c3.classList.remove('newfx');
        break;
      }
      case 'gameover':
        await sleep(500);
        break;
    }
    renderTop();
    renderLog();
  }

  function floatText(anchor, text, heal) {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'float-dmg' + (heal ? ' heal' : '');
    d.textContent = text;
    d.style.left = (r.left + r.width / 2 - 30) + 'px';
    d.style.top = (r.top - 14) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), 1500);
  }

  /* ---------------- AI turn loop ---------------- */
  async function startAiLoop() {
    const mySession = session;
    aiRunning = true;
    renderAll();
    await sleep(650);
    while (S && S.winner == null && S.active === 1 && session === mySession) {
      const act = FM.ai.aiNextAction(S, 1);
      if (!act) { E.endTurn(S); break; }
      E.perform(S, act);
      await startFxThen(S);
      renderAll();
      if (S.winner != null) break;
      if (act.type === 'END') break;
      await sleep(430);
      maybeGameOver();
    }
    aiRunning = false;
    if (session === mySession && S && S.winner == null) { renderAll(); }
    maybeGameOver();
  }

  /* ---------------- Game over ---------------- */
  function maybeGameOver() {
    if (!S || S.winner == null || S._overShown) return;
    S._overShown = true;
    const won = S.winner === 0;
    (won ? sfx.win : sfx.lose)();
    let unlockMsg = '';
    if (won && cfg.campaign && cfg.duelist) {
      const ds = FM.decks.DUELISTS;
      const idx = ds.findIndex(d => d.id === cfg.duelist.id);
      const prog = UI.getProgress();
      if (!prog.includes(cfg.duelist.id)) prog.push(cfg.duelist.id);
      localStorage.setItem('fm_unlock_v1', JSON.stringify(prog));
      const next = ds[idx + 1];
      unlockMsg = `<div class="msub">🔓 Bạn đã hạ <b>${cfg.duelist.name}</b>!${next ? ' Mục tiêu tiếp theo: <b>' + next.name + '</b>' : ' Bạn đã chinh phục TẤT CẢ đối thủ!'}</div>`;
    }
    if (won && cfg.duelist && !cfg.campaign) {
      const prog = UI.getProgress();
      if (!prog.includes(cfg.duelist.id)) { prog.push(cfg.duelist.id); localStorage.setItem('fm_unlock_v1', JSON.stringify(prog)); }
    }
    openModal(`
      <h1 class="${won ? 'win' : 'lose'}">${won ? '🏆 CHIẾN THẮNG!' : '💀 THẤT BẠI'}</h1>
      <div class="msub">${won ? S.players[1].name + ' đã gục ngã trước bạn!' : S.players[1].name + ' đã đánh bại bạn. Hãy thử lại!'}</div>
      ${unlockMsg}
      <div class="msub">LP cuối: Bạn <b>${S.players[0].lp}</b> — ${S.players[1].name} <b>${S.players[1].lp}</b> · Số lượt: ${S.turnNo}</div>
      <div class="mbtns">
        <button class="primary" id="go-rematch">⚔ Đấu Lại</button>
        <button id="go-menu">🚪 Về Menu</button>
      </div>
    `);
    $('go-rematch').onclick = () => { closeModal(); UI.startDuel(cfg); };
    $('go-menu').onclick = () => { closeModal(); UI.showMenu(); };
  }

  /* ---------------- Modal helpers ---------------- */
  function openModal(html, noClose) {
    const ov = $('overlay');
    ov.innerHTML = `<div class="modal">${html}</div>`;
    ov.classList.remove('hidden');
    ov.onclick = noClose ? null : e => { if (e.target === ov) closeModal(); };
  }
  function closeModal() { $('overlay').classList.add('hidden'); $('overlay').innerHTML = ''; }

  /* ---------------- Help & fusion table ---------------- */
  function showHelp() {
    openModal(`
      <div class="help">
        <h1 style="font-size:24px;text-align:center">📜 Luật Chơi (lối Forbidden Memories)</h1>
        <h3>🎯 Mục tiêu</h3>
        <p>Hạ LP đối thủ từ <b>8000</b> về 0. Hết deck cũng thua. Sau lượt 100, ai LP thấp hơn thua.</p>
        <h3>🃏 Lượt đấu</h3>
        <ul>
          <li><b>Main Phase:</b> triệu hồi quái (không giới hạn số lần), SET úp, fusion, dùng phép, set bẫy, đổi tư thế.</li>
          <li><b>Battle Phase:</b> mỗi quái ATK ngửa được tấn công 1 lần.</li>
          <li>Tay tối đa <b>5 bài</b>, rút 1 bài mỗi lượt.</li>
        </ul>
        <h3>🗺 Sân 3×3 &amp; tấn công</h3>
        <ul>
          <li>Mỗi bên có lưới <b>3×3</b>; hàng gần đối thủ là <b>hàng trước</b>.</li>
          <li>Quái đánh <b>quái phía trước cùng cột</b> (ưu tiên gần nhất). Cột trống → <b>đánh trực tiếp LP</b>!</li>
          <li>Quái úp là tường chắn cột — set quái yếu úp để chặn đòn direct.</li>
        </ul>
        <h3>⚔ Tính sát thương</h3>
        <ul>
          <li>ATK vs ATK: bên yếu hơn bị phá, chủ nhân mất chênh lệch LP. Bằng nhau → cả hai gục.</li>
          <li>ATK vs DEF: ATK lớn hơn → phá tường (không mất LP). ATK nhỏ hơn → chủ nhân attacker mất (DEF − ATK) LP.</li>
        </ul>
        <h3>🧪 FUSION (vũ khí tối thượng)</h3>
        <ul>
          <li>Hai quái trên tay hoặc quái sân + bài tay → quái mới mạnh hơn.</li>
          <li>Cùng <b>race</b> (hệ) thường hợp nhất được; nhiều cặp nổi tiếng có công thức riêng (Flame Manipulator + Masaki = <b>Flame Swordsman</b>…). Xem bảng: nút 🧪 Fusion.</li>
        </ul>
        <h3>✨ Phép &amp; 🪤 Bẫy</h3>
        <ul>
          <li><b>Phép:</b> dùng ngay từ tay. Equip gắn lên quái khớp điều kiện; địa hình buff toàn trận theo hệ.</li>
          <li><b>Bẫy:</b> SET úp lên ô sân, <b>tự kích hoạt</b> khi đối thủ triệu hồi/tấn công.</li>
        </ul>
        <div class="mbtns"><button class="primary" onclick="document.getElementById('overlay').classList.add('hidden')">Đã hiểu!</button></div>
      </div>
    `, true);
  }

  function showFusionTable() {
    const rows = [];
    for (const key in C.fusions) {
      const [a, b] = key.split('|').map(Number);
      rows.push(`<div class="frow"><span>${C.monsters[a].name}</span><span class="farrow">+</span><span>${C.monsters[b].name}</span><span class="farrow">→</span><span class="fres">${C.monsters[C.fusions[key]].name}</span></div>`);
    }
    openModal(`
      <h1 style="font-size:22px">🧪 Bảng Fusion (${rows.length} công thức đặc biệt)</h1>
      <div class="msub">Ngoài bảng này: 2 quái <b>cùng hệ</b> vẫn có thể hợp nhất thành quái mạnh hơn cùng hệ.</div>
      <div class="fusion-table" style="max-height:52vh;overflow:auto">${rows.join('')}</div>
      <div class="mbtns"><button class="primary" onclick="document.getElementById('overlay').classList.add('hidden')">Đóng</button></div>
    `, true);
  }

  /* ---------------- Public API ---------------- */
  UI.startDuel = function (c) {
    cfg = c;
    session += 1;
    mode = 'idle'; selHand = -1; selField = -1; pending = {}; previewSel = null;
    bannerKey = '';
    const duelist = c.duelist || FM.decks.DUELISTS[0];
    const deckList = FM.decks.DECKS[c.deckId] || FM.decks.DECKS.flameSwordsman;
    S = E.newDuel({
      p0name: 'Bạn', p1name: duelist.name,
      p0deck: deckList.list, p1deck: duelist.deck,
      difficulty: c.difficulty,
    });
    // Môi trường đấu trường theo đối thủ + reset thời tiết
    if (FM.fx && FM.fx.boot) {
      FM.fx.boot();
      FM.fx.setArena(ARENA_BY_DUELIST[duelist.id] || 'temple');
      FM.fx.setWeather(null);
    }
    $('menu').classList.add('hidden');
    $('battle').classList.remove('hidden');
    renderAll();
    toast('⚔ Đấu với ' + duelist.name + ' — lượt của bạn trước!');
  };

  const ARENA_BY_DUELIST = {
    simon: 'temple', tea: 'meadow', priest: 'shrine', kepura: 'abyss', wizard: 'tower',
    seto1: 'volcano', martis: 'sky', necro: 'graveyard', darknite: 'shadowrealm',
  };

  UI.showMenu = function () {
    session += 1;
    aiRunning = false; S = null;
    $('battle').classList.add('hidden');
    $('menu').classList.remove('hidden');
    UI.buildMenu();
  };

  UI.getProgress = function () {
    try { return JSON.parse(localStorage.getItem('fm_unlock_v1') || '[]'); } catch (e) { return []; }
  };

  UI.buildMenu = function () {
    const prog = UI.getProgress();
    // duelists
    const dl = $('duelist-list');
    dl.innerHTML = '';
    FM.decks.DUELISTS.forEach((d, i) => {
      const el = document.createElement('div');
      const defeated = prog.includes(d.id);
      const unlocked = i <= Math.max(3, prog.length);
      el.className = 'duelist-card' + (defeated ? ' sel' : '') + (unlocked ? '' : ' locked');
      el.innerHTML = `<div class="dp">${unlocked ? d.portrait : '🔒'}</div><div class="dn">${d.name}</div><div class="dd">${'⭐'.repeat(Math.min(5, d.diff + 1))}${defeated ? '<br>✅ Đã hạ' : ''}</div>`;
      if (unlocked) el.onclick = () => {
        UI._selDuelist = d;
        document.querySelectorAll('.duelist-card').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
        sfx.select();
      };
      dl.appendChild(el);
    });
    if (!UI._selDuelist) UI._selDuelist = FM.decks.DUELISTS[0];
    // decks
    const deckDescs = {
      flameSwordsman: 'Cân bằng · nhiều cặp fusion kinh điển (Flame Swordsman, Darkfire Dragon)',
      dragonMaster: 'Rồng · mountain buff, Blue-Eyes & Red-Eyes, fusion thành B. Skull Dragon',
      shadowLegion: 'Fiend/Zombie · yami + Dark Energy, triệu hồi Summoned Skull nhanh',
      stormMachine: 'Thunder/Machine · Thunder Dragon fusion thành Twin-Headed Thunder Dragon',
    };
    const dkl = $('deck-list');
    dkl.innerHTML = '';
    Object.entries(FM.decks.DECKS).forEach(([id, d]) => {
      const el = document.createElement('div');
      el.className = 'deck-card' + (UI._selDeck === id || (!UI._selDeck && id === 'flameSwordsman') ? ' sel' : '');
      el.innerHTML = `<div class="dk">${d.name}</div><div class="dd">${deckDescs[id] || ''}</div>`;
      el.onclick = () => {
        UI._selDeck = id;
        document.querySelectorAll('.deck-card').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
        sfx.select();
      };
      dkl.appendChild(el);
    });
    if (!UI._selDeck) UI._selDeck = 'flameSwordsman';
    // difficulty
    const diffs = ['Dễ 😴', 'Thường 🙂', 'Khá 😏', 'Giỏi 😠', 'Ác mã 😈'];
    const dfl = $('diff-list');
    dfl.innerHTML = '';
    diffs.forEach((t, i) => {
      const b = document.createElement('button');
      b.textContent = t;
      if ((UI._selDiff == null ? 1 : UI._selDiff) === i) b.classList.add('sel');
      b.onclick = () => { UI._selDiff = i; document.querySelectorAll('.diff-list button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sfx.select(); };
      dfl.appendChild(b);
    });
    $('menu-progress').textContent = `Tiến độ: đã hạ ${prog.length}/${FM.decks.DUELISTS.length} đối thủ · Lưu tự động trên máy này.`;
  };

  UI.getSelectedConfig = function () {
    return {
      duelist: UI._selDuelist,
      deckId: UI._selDeck,
      difficulty: UI._selDiff == null ? 1 : UI._selDiff,
      campaign: true,
    };
  };

  UI.showHelp = showHelp;
  UI.showFusionTable = showFusionTable;
  UI.toggleMute = function () { muted = !muted; return muted; };
  UI.closeModal = closeModal;
  UI.handlePhaseAction = function (kind) {
    if (!S || S.winner != null || S.active !== 0 || aiRunning) return;
    if (kind === 'battle' && S.phase === 'MAIN') {
      E.perform(S, { type: 'BATTLE_PHASE' });
      resetMode();
      postAction();
    } else if (kind === 'endturn' && S.phase === 'MAIN') {
      doEndTurn();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
