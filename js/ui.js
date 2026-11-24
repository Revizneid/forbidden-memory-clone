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
    if (C.cardIcon) return C.cardIcon(card);
    if (card.kind === 'MONSTER') return C.raceIcon(C.monsters[card.id].race);
    if (card.kind === 'MAGIC') return C.magics[card.mid] ? C.magics[card.mid].icon : '✨';
    return C.traps[card.tid] ? C.traps[card.tid].icon : '🪤';
  }
  function cardImageId(card) {
    if (!card) return null;
    if (card.kind === 'MONSTER') return card.id;
    if (card.kind === 'MAGIC') {
      const md = C.magics[card.mid];
      return md ? (md.fid || Number(String(card.mid).replace(/\D/g, ''))) : Number(String(card.mid).replace(/\D/g, ''));
    }
    if (card.kind === 'TRAP') {
      const td = C.traps[card.tid];
      return td ? (td.fid || Number(String(card.tid).replace(/\D/g, ''))) : Number(String(card.tid).replace(/\D/g, ''));
    }
    return null;
  }
  function cardEl(card, faceDown, trapFaceDown) {
    const el = document.createElement('div');
    if (faceDown) {
      el.className = 'card face-down' + (card.kind === 'TRAP' || trapFaceDown ? ' trap' : '');
      return el;
    }
    el.className = 'card ' + (card.kind === 'MAGIC' ? 'magic' : card.kind === 'TRAP' ? 'trap' : '');
    const m = card.kind === 'MONSTER' ? (C.monsters[card.id] || { name: 'Quái #' + card.id, atk: 0, def: 0, attr: 'LIGHT', race: 'Warrior' }) : null;
    const md = card.kind === 'MAGIC' ? (C.magics[card.mid] || { name: 'Phép #' + card.mid }) : null;
    const td = card.kind === 'TRAP' ? (C.traps[card.tid] || { name: 'Bẫy #' + card.tid }) : null;
    const attrBg = m ? C.attrColor(m.attr) : (card.kind === 'MAGIC' ? '#2e86de' : '#c2457e');
    const icon = C.cardIcon ? C.cardIcon(card) : (m ? C.raceIcon(m.race) : md ? md.icon : td ? td.icon : '✨');
    const fid = cardImageId(card);
    const cardName = m ? m.name : md ? md.name : td ? td.name : 'Thẻ';
    const artContent = fid
      ? `<img class="cart-img" src="assets/cards/${fid}.png" alt="${escapeHtml(cardName)}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"><span class="cart-fallback" style="display:none">${icon}</span>`
      : `<span class="cart-fallback">${icon}</span>`;
    el.innerHTML =
      `<div class="cname">${escapeHtml(cardName)}</div>` +
      `<div class="cart">${artContent}</div>` +
      `<div class="cstats">${m ? `<span class="catk">ATK ${m.atk}</span><span class="cdef">DEF ${m.def}</span>` : `<span>${card.kind === 'MAGIC' ? '✨ PHÉP' : card.kind === 'TRAP' ? '🪤 BẪY' : '👁 RITUAL'}</span><span></span>`}${m && m.stars ? `<span class="cstar">${C.starIcon(C.starName(m.stars[0]))}</span>` : ''}</div>` +
      `<div class="cbadge" style="background:${attrBg}">${m ? m.attr : card.kind === 'MAGIC' ? 'MAGIC' : 'TRAP'}</div>`;
    return el;
  }

  /* ---------------- Perspective & DOM refs / slot mapping ---------------- */
  UI.myPlayerIndex = 0;   // 0: P1 (hoặc chơi máy), 1: P2 (khách online)
  UI.isOnline = false;

  function myIdx() { return UI.myPlayerIndex || 0; }
  function oppIdx() { return 1 - myIdx(); }
  function isMyTurn() { return S && S.winner == null && S.active === myIdx(); }
  function isCurrentHuman() {
    if (UI.isOnline) return isMyTurn();
    return S && S.winner == null && !S.players[S.active].isAI && !aiRunning;
  }

  function toVisual(pIdx) { return pIdx === myIdx() ? 0 : 1; }
  function fromVisual(vIdx) { return vIdx === 0 ? myIdx() : oppIdx(); }

  function gridEl(vIdx) { return vIdx === 0 ? $('player-grid') : $('enemy-grid'); }
  function slotEl(pIdx, slotIdx) {
    const vIdx = toVisual(pIdx);
    return gridEl(vIdx).querySelector(`[data-i="${slotIdx}"]`);
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------------- Render ---------------- */
  function renderTop() {
    const me = myIdx();
    const opp = oppIdx();
    const pMe = S.players[me];
    const pOpp = S.players[opp];
    const isOnline = UI.isOnline;

    $('enemy-name').textContent = pOpp.name;
    $('enemy-portrait').textContent = isOnline ? (opp === 0 ? '🧙' : '🧝') : (cfg && cfg.duelist ? cfg.duelist.portrait : '👹');
    $('player-name').textContent = pMe.name;
    $('player-portrait').textContent = isOnline ? (me === 0 ? '🧙' : '🧝') : ((FM.player && FM.player.getAvatar()) || '👑');

    for (const [p, pre] of [[pOpp, 'enemy'], [pMe, 'player']]) {
      const pct = Math.max(0, Math.min(100, (p.lp / E.LP_START) * 100));
      const fill = $(pre + '-lpfill');
      fill.style.width = pct + '%';
      fill.classList.toggle('low', p.lp <= 2000);
      $(pre + '-lp').textContent = p.lp;
      $(pre + '-deck').textContent = '🂠 ' + p.deck.length;
      $(pre === 'player' ? 'player-handcount' : 'enemy-hand').textContent = '✋ ' + p.hand.length;
      $(pre + '-grave').textContent = '⚰️ ' + p.graveyard.length;
    }

    // Đánh dấu người chơi đang trong lượt
    $('player-info').classList.toggle('active-turn', S.active === me);
    $('enemy-info').classList.toggle('active-turn', S.active === opp);
    const pGrid = $('player-grid-wrap');
    if (pGrid) pGrid.classList.toggle('active-turn', S.active === me);
    const eGrid = $('enemy-grid-wrap');
    if (eGrid) eGrid.classList.toggle('active-turn', S.active === opp);

    $('turn-num').textContent = 'Lượt ' + S.turnNo;
    const ph = $('phase-ind');
    ph.textContent = S.phase === 'BATTLE' ? 'Battle Phase' : S.phase === 'MAIN' ? 'Main Phase' : 'Kết thúc';
    ph.className = S.phase === 'BATTLE' ? 'phase-battle' : 'phase-main';

    // hand rows cho đối thủ (trên đỉnh)
    const eh = $('enemy-handrow'); eh.innerHTML = '';
    for (let i = 0; i < pOpp.hand.length; i++) {
      const d = document.createElement('div'); d.className = 'mini-back'; eh.appendChild(d);
    }

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
    const isMyTurnNow = S.active === myIdx();
    $('turn-banner-text').textContent = isMyTurnNow ? '⚡ LƯỢT CỦA BẠN' : '☠ LƯỢT CỦA ' + S.players[oppIdx()].name.toUpperCase();
    bn.classList.toggle('enemy', !isMyTurnNow);
    bn.classList.remove('hidden');
    clearTimeout(bn._h);
    bn._h = setTimeout(() => bn.classList.add('hidden'), 1250);
  }

  function renderGrid(vIdx) {
    const pIdx = fromVisual(vIdx);
    const p = S.players[pIdx];
    const g = gridEl(vIdx);
    g.innerHTML = '';
    // Layout FM gốc: mỗi bên 2 hàng x 5 cột = 10 ô
    // Người chơi: Hàng 0 = Quái vật (0..4), Hàng 1 = Phép/Bẫy (5..9)
    // Đối thủ: Hàng 0 = Phép/Bẫy (5..9), Hàng 1 = Quái vật (0..4) (đối diện hàng quái người chơi)
    const slotIndices = vIdx === 0
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      : [5, 6, 7, 8, 9, 0, 1, 2, 3, 4];

    for (let k = 0; k < slotIndices.length; k++) {
      const i = slotIndices[k];
      const cell = document.createElement('div');
      cell.className = 'slotcell ' + (i < 5 ? 'slot-monster' : 'slot-spelltrap');
      cell.dataset.i = i;
      const sl = p.field[i];
      if (sl) {
        const wrap = document.createElement('div');
        wrap.className = 'slotcard';
        const el = cardEl(sl.kind === 'TRAP' ? { kind: 'TRAP', tid: sl.tid } : sl.card, !!sl.faceDown, sl.kind === 'TRAP');
        
        // Huy hiệu chỉ số nổi bật trên sân (ATK / DEF)
        const statPill = document.createElement('div');
        statPill.className = 'card-stat-pill';

        if (sl.kind === 'MONSTER') {
          const curAtk = E.effAtk(S, pIdx, sl);
          const curDef = E.effDef(S, pIdx, sl);
          const base = C.monsters[sl.card.id] || { atk: curAtk, def: curDef };

          if (sl.pos === 'DEF') {
            el.classList.add('pos-def');
          }

          if (!sl.faceDown) {
            if ((sl.buffs || []).length) el.classList.add('equipped');
            const catk = el.querySelector('.catk'), cdef = el.querySelector('.cdef');
            if (sl.pos === 'ATK') {
              if (catk) {
                catk.textContent = '⚔' + curAtk;
                catk.classList.toggle('buffed', curAtk > base.atk);
                catk.classList.toggle('nerfed', curAtk < base.atk);
              }
              if (cdef) cdef.style.opacity = '.4';
              statPill.classList.add('pill-atk');
              statPill.innerHTML = `⚔ <b>${curAtk}</b>`;
            } else {
              if (cdef) {
                cdef.textContent = '🛡' + curDef;
                cdef.classList.toggle('buffed', curDef > base.def);
                cdef.classList.toggle('nerfed', curDef < base.def);
              }
              if (catk) catk.style.opacity = '.4';
              statPill.classList.add('pill-def');
              statPill.innerHTML = `🛡 <b>${curDef}</b>`;
            }
          } else {
            // Quái đang úp thủ
            if (vIdx === 0) {
              // Là quái úp của chính mình: hiện chỉ số DEF để người chơi nhận biết
              statPill.classList.add('pill-def', 'pill-fdown-me');
              statPill.innerHTML = `🛡 <b>${curDef}</b> (Úp)`;
            } else {
              // Quái úp của đối thủ: ẩn chỉ số
              statPill.classList.add('pill-fdown-opp');
              statPill.innerHTML = `🛡 <b>ÚP THỦ</b>`;
            }
          }
        } else if (sl.kind === 'TRAP') {
          statPill.classList.add('pill-trap');
          statPill.innerHTML = vIdx === 0 ? `🪤 <b>BẪY</b>` : `🂠 <b>BẪY</b>`;
        }
        wrap.appendChild(el);
        wrap.appendChild(statPill);
        cell.appendChild(wrap);
        // highlight cho tương tác
        if (myTurnMain()) {
          if (mode === 'fusing' && validFuseB(pIdx, i)) el.classList.add('targetable');
          if (mode === 'equipTarget' && pending.handIdx != null && equipMatch(pending.handIdx, pIdx, i)) el.classList.add('targetable');
          if (mode === 'fieldSel' && selField === i && vIdx === 0) el.classList.add('selected');
        }
        if (myTurnBattle()) {
          if (vIdx === 0 && E.canAttack(S, myIdx(), i)) el.classList.add('attackable');
          if (mode === 'battleTarget' && vIdx === 0 && pending.attackerSlot === i) el.classList.add('selected');
          if (mode === 'battleTarget' && vIdx === 1 && sl.kind === 'MONSTER') el.classList.add('targetable');
        }
        if (mode === 'enemyTarget' && vIdx === 1 && sl.kind === 'MONSTER' && !sl.faceDown) el.classList.add('targetable');
      } else if (myTurnMain()) {
        if (vIdx === 0) {
          if ((mode === 'summonSlot' || mode === 'fuseSlot') && i < 5) cell.classList.add('empty-target');
          else if (mode === 'trapSlot' && i >= 5) cell.classList.add('empty-target');
        }
      }
      cell.addEventListener('click', () => onSlotClick(vIdx, i));
      g.appendChild(cell);
    }
  }

  function renderHand() {
    const me = myIdx();
    const p = S ? S.players[me] : null;
    const h = $('player-hand');
    h.innerHTML = '';
    if (!p) return;
    p.hand.forEach((card, i) => {
      const el = cardEl(card, false);
      if (myTurnMain()) {
        // highlight bài chơi được ngay (UX: nhìn là biết bài nào dùng được)
        if (isPlayable(card)) el.classList.add('playable');
        if (mode === 'handSel' && selHand === i) el.classList.add('selected');
        if (mode === 'fusing' && pending.a && (pending.a.src === 'FIELD' || pending.a.src === 'HAND') && card.kind === 'MONSTER') el.classList.add('targetable');
        el.addEventListener('click', ev => { ev.stopPropagation(); onHandClick(i); });
      } else {
        el.addEventListener('click', ev => { ev.stopPropagation(); showPreview(card, 'Bài trên tay (' + p.name + ')'); });
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
    const me = S.active;
    if (S.players[me].isAI) { hint('🤖 ' + S.players[me].name + ' đang suy nghĩ...'); return; }
    if (mode === 'battleTarget' && pending.attackerSlot != null) {
      const atkSl = S.players[me].field[pending.attackerSlot];
      const aName = atkSl ? E.mdata(atkSl.card).name : 'Quái';
      hint('⚔ ' + aName + ' sẵn sàng! Nhấp vào một quái đối thủ để chọn mục tiêu.');
      addBtn('🎯 Tấn Công Quái Cùng Cột (mặc định)', () => {
        const as = pending.attackerSlot;
        resetMode();
        doAttack(as, null);
      }, 'primary');
      addBtn('✖ Huỷ Đòn Đánh', resetMode);
      return;
    }
    if (S.phase === 'BATTLE') {
      hint('⚔ Battle Phase (' + S.players[me].name + ') — chọn quái viền vàng để tấn công. Có thể chọn mục tiêu bất kỳ quái đối thủ!');
      addBtn('⏭ Kết Thúc Lượt', () => doEndTurn(), 'primary');
      return;
    }
    // MAIN, lượt người chơi
    if (mode === 'handSel' && selHand >= 0) {
      const card = S.players[me].hand[selHand];
      hint('Đã chọn: ' + nameOf(card));
      if (card.kind === 'MONSTER') {
        addBtn('⬆ Triệu Hồi ATK', () => enterSummonSlot(false), 'primary');
        addBtn('🂠 Set Úp (DEF)', () => enterSummonSlot(true));
        addBtn('🧪 Fusion với thẻ khác…', () => enterFusing({ src: 'HAND', idx: selHand }));
      } else if (card.kind === 'MAGIC') {
        const md = C.magics[card.mid];
        const mfx = md ? (md.fx || {}) : {};
        if (md && md.kind === 'ritual') {
          addBtn('👁 Triệu Hồi Ritual', () => confirmRitual(selHand), 'primary');
          hint(md.desc);
        } else if (mfx.kind === 'forceDef') {
          addBtn('🎯 Ép Phòng Thủ…', () => { mode = 'enemyTarget'; pending = { handIdx: selHand }; closeSidebarMobile(); toast('👉 Chọn quái đối thủ'); renderAll(); }, 'primary');
          hint(md.desc);
        } else if (md.atk) addBtn('✨ Gắn Trang Bị…', () => { mode = 'equipTarget'; pending = { handIdx: selHand }; closeSidebarMobile(); toast('👉 Chọn quái ngửa để gắn trang bị'); renderAll(); });
        else addBtn('🪄 Kích Hoạt', () => { closeSidebarMobile(); doMagic(selHand, null); }, 'primary');
        hint(md ? md.desc : '');
      } else if (card.kind === 'TRAP') {
        addBtn('🪤 Set Bẫy…', () => { mode = 'trapSlot'; pending = { handIdx: selHand }; closeSidebarMobile(); toast('👉 Chọn ô trống ở hàng Phép/Bẫy (dưới)'); renderAll(); });
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
      const sl = S.players[me].field[selField];
      if (sl && sl.kind === 'MONSTER') {
        hint('Quái: ' + E.mdata(sl.card).name + (sl.faceDown ? ' (Đang ÚP THỦ)' : sl.pos === 'ATK' ? ' (ATK)' : ' (DEF)'));
        if (!sl.faceDown && E.mdata(sl.card).stars && E.mdata(sl.card).stars[1]) addBtn('⭐ Đổi Guardian Star (hiện: ' + C.starName(E.mdata(sl.card).stars[sl.star || 0]) + ')', () => { E.perform(S, { type: 'SET_STAR', slotIdx: selField }); postAction(); }, 'primary');
        addBtn('🧪 Fusion quái này + bài khác…', () => enterFusing({ src: 'FIELD', idx: selField }));
        if (sl.faceDown) {
          addBtn('🔄 Lật Ngửa Quái Vật', () => { E.perform(S, { type: 'CHANGE_POS', slotIdx: selField }); resetMode(); postAction(); }, 'primary');
        } else if (!sl.posChanged) {
          addBtn('🔄 Đổi Tư Thế', () => { E.perform(S, { type: 'CHANGE_POS', slotIdx: selField }); resetMode(); postAction(); }, 'primary');
        }
      }
      addBtn('✖ Bỏ chọn', resetMode);
    } else {
      hint('▶ Main Phase (' + S.players[me].name + '): chọn bài trên tay để triệu hồi / set / fusion / dùng phép.');
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
      desc = `${m.race} · ${m.attr} · ⭐ ${C.starName(m.stars ? m.stars[0] : 0)} / ${C.starName(m.stars ? m.stars[1] : 0)}`;
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
      desc = md ? (md.desc || '') : '';
      if (md && md.kind === 'ritual') {
        const offerNames = (md.offerings || []).map(oid => (C.monsters[oid] || { name: '?' }).name);
        desc = 'Nguyên liệu: ' + offerNames.join(' + ') + ' → ' + (C.monsters[md.result] || { name: '?' }).name + '. ' + desc;
      }
    } else {
      desc = C.traps[sel.card.tid] ? C.traps[sel.card.tid].desc : '';
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
    const isHuman = isCurrentHuman();
    const canBattle = isHuman && S.phase === 'MAIN' && S.turnNo > 1;
    $('btn-battle').classList.toggle('hidden', !canBattle);
    $('btn-endturn').classList.toggle('hidden', !(isHuman && S.phase === 'MAIN'));
    saveDuel();
  }

  /* Lưu / khôi phục trận đang đánh (chống mất khi F5/tab reload) */
  function saveDuel() {
    if (!S || S.winner != null) { try { localStorage.removeItem('fm_duel_v1'); } catch (e) {} return; }
    try {
      const duelistId = cfg && cfg.duelist ? cfg.duelist.id : null;
      localStorage.setItem('fm_duel_v1', JSON.stringify({
        s: Object.assign({}, S, { fx: [] }), duelistId, deckId: cfg && cfg.deckId, difficulty: cfg && cfg.difficulty,
      }));
    } catch (e) { /* storage đầy: bỏ qua */ }
  }

  UI.restoreDuel = function () {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('fm_duel_v1') || 'null'); } catch (e) { return false; }
    if (!saved || !saved.s || saved.s.winner != null) return false;
    // Kiểm tra hợp lệ: đủ 2 người chơi + bảo toàn bài (deck+tay+sân+mộ == tổng đầu trận)
    const s0 = saved.s;
    if (!Array.isArray(s0.players) || s0.players.length !== 2) return false;
    for (const p of s0.players) {
      if (!Array.isArray(p.deck) || !Array.isArray(p.hand) || !Array.isArray(p.field) || p.field.length !== 10 || !Array.isArray(p.graveyard) || typeof p._total !== 'number') return false;
      const onField = p.field.filter(Boolean).length;
      if (p.deck.length + p.hand.length + onField + p.graveyard.length !== p._total) return false;
    }
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
    if (S.winner == null && S.players[S.active].isAI) startAiLoop();
    return true;
  };

  let previewSel = null;
  let previewTimer = 0;
  function previewCard() {
    if (previewSel) return previewSel;
    const me = S ? S.active : 0;
    if (mode === 'handSel' && selHand >= 0) { const c = S.players[me].hand[selHand]; return c ? { card: c } : null; }
    if (selField >= 0) { const sl = S.players[me].field[selField]; if (sl && sl.kind === 'MONSTER' && !sl.faceDown) return { card: sl.card }; }
    return null;
  }

  function openSidebarMobile() {
    const sb = $('sidebar'); if (sb) sb.classList.add('open');
    const sbb = $('sidebar-backdrop'); if (sbb) sbb.classList.remove('hidden');
  }
  function closeSidebarMobile() {
    const sb = $('sidebar'); if (sb) sb.classList.remove('open');
    const sbb = $('sidebar-backdrop'); if (sbb) sbb.classList.add('hidden');
  }

  function showPreview(card, note) {
    // Mỗi preview mới huỷ timer của preview cũ — tránh preview mới bị preview cũ xoá mất
    previewSel = { card, note };
    renderPreview(previewSel);
    openSidebarMobile();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { previewSel = null; renderPreview(null); }, 4000);
  }

  /* ---------------- Mode helpers ---------------- */
  function isPlayable(card) {
    if (!S || S.winner != null) return false;
    const me = S.active;
    const opp = 1 - me;
    const p = S.players[me];
    const oppP = S.players[opp];
    const hasMonsterEmpty = [0, 1, 2, 3, 4].some(i => !p.field[i]);
    const hasTrapEmpty = [5, 6, 7, 8, 9].some(i => !p.field[i]);
    if (card.kind === 'MONSTER') return hasMonsterEmpty;
    if (card.kind === 'TRAP') return hasTrapEmpty;
    const md = C.magics[card.mid];
    if (!md) return false;
    const mfx = md.fx || {};
    if (mfx.kind === 'equip') {
      const allowed = md.races || md.compat || [];
      return p.field.slice(0, 5).some(sl => sl && sl.kind === 'MONSTER' && !sl.faceDown && (typeof md.match === 'function' ? md.match(E.mdata(sl.card)) : allowed.includes(E.mdata(sl.card).race)));
    }
    if (mfx.kind === 'terrain') return !S.players.some(pl => pl.terrains.includes(md.id));
    if (mfx.kind === 'ritual') {
      const need = (md.offerings || []).slice();
      const pool = {};
      p.hand.forEach(c => { if (E.isMon(c)) pool[c.id] = (pool[c.id] || 0) + 1; });
      p.field.slice(0, 5).forEach(sl => { if (sl && sl.kind === 'MONSTER') pool[sl.card.id] = (pool[sl.card.id] || 0) + 1; });
      return hasMonsterEmpty && need.every(oid => (pool[oid] || 0) >= 1);
    }
    if (mfx.kind === 'forceDef' || mfx.kind === 'dragonsToDef') return oppP.field.slice(0, 5).some(sl => sl && sl.kind === 'MONSTER' && !sl.faceDown);
    if (mfx.kind === 'flipAllEnemyDef' || mfx.kind === 'flipAllEnemyAtk') return oppP.field.slice(0, 5).some(sl => sl && sl.kind === 'MONSTER' && sl.faceDown);
    if (mfx.kind === 'clearTraps') return oppP.field.slice(5, 10).some(sl => sl && sl.kind === 'TRAP');
    if (mfx.kind === 'destroyRace') return oppP.field.slice(0, 5).some(sl => sl && sl.kind === 'MONSTER' && !sl.faceDown && (mfx.races || []).includes(E.mdata(sl.card).race));
    if (mfx.kind === 'destroyEnemyAll') return E.monsterCount(oppP) > 0;
    return true; // heal/damage/destroyAll
  }

  function resetMode() { mode = 'idle'; selHand = -1; selField = -1; pending = {}; previewSel = null; closeSidebarMobile(); renderAll(); }
  function isCurrentHuman() { return S && S.winner == null && !S.players[S.active].isAI && !aiRunning; }
  function myTurnMain() { return isCurrentHuman() && S.phase === 'MAIN'; }
  function myTurnBattle() { return isCurrentHuman() && S.phase === 'BATTLE'; }
  function equipMatch(handIdx, pIdx, slotIdx) {
    const card = S.players[S.active].hand[handIdx];
    if (!card || card.kind !== 'MAGIC') return false;
    const md = C.magics[card.mid];
    const sl = S.players[pIdx].field[slotIdx];
    return !!(md.atk && sl && sl.kind === 'MONSTER' && !sl.faceDown && md.match(E.mdata(sl.card)));
  }
  function validFuseB(pIdx, slotIdx) {
    if (!pending.a) return false;
    const sl = S.players[pIdx].field[slotIdx];
    if (!sl || sl.kind !== 'MONSTER') return false;
    if (pending.a.src === 'FIELD' && pending.a.idx === slotIdx) return false; // không tự fusing với chính mình
    return true;
  }
  function enterSummonSlot(faceDown) { mode = 'summonSlot'; pending = { handIdx: selHand, faceDown }; closeSidebarMobile(); toast('👉 Chọn một ô trống ở hàng Quái (trên)'); renderAll(); }
  function enterFusing(a) { mode = 'fusing'; pending = { a }; sfx.select(); closeSidebarMobile(); toast('👉 Chọn nguyên liệu thứ hai (bài tay hoặc quái sân)'); renderAll(); }

  /* ---------------- Human actions ---------------- */
  function onHandClick(i) {
    if (!myTurnMain()) return;
    const me = myIdx();
    if (mode === 'summonSlot' || mode === 'trapSlot' || mode === 'fuseSlot' || mode === 'equipTarget') {
      toast('↩ Huỷ thao tác đang chọn ô');
      resetMode();
    }
    if (mode === 'fusing' && pending.a && pending.a.src !== 'HAND2' && (pending.a.src === 'FIELD' || pending.a.src === 'HAND')) {
      // chọn nguyên liệu B từ tay
      if (i === pending.a.idx && pending.a.src === 'HAND') { resetMode(); return; }
      const a = pending.a;
      const result = E.peekFusion(S, me, a, { src: 'HAND', idx: i });
      if (!result) { toast('❌ Hai thẻ này không hợp nhất được!'); sfx.set(); return; }
      confirmFusion(a, { src: 'HAND', idx: i }, result);
      return;
    }
    const card = S.players[me].hand[i];
    sfx.select();
    if (mode === 'handSel' && selHand === i) { resetMode(); return; }
    mode = 'handSel'; selHand = i; selField = -1; openSidebarMobile(); renderAll();
  }

  function onSlotClick(vIdx, i) {
    const me = myIdx();
    const opp = oppIdx();
    if (!myTurnMain() && !myTurnBattle()) {
      // xem bài
      const sl = S.players[vIdx === 0 ? me : opp].field[i];
      if (sl && sl.kind === 'MONSTER') {
        if (vIdx === 0) {
          // Bài của chính mình: xem được kể cả khi đang úp
          showPreview(sl.card, sl.faceDown ? 'Quái của bạn (Đang ÚP THỦ)' : 'Quái của bạn');
        } else if (!sl.faceDown) {
          showPreview(sl.card, 'Quái của đối thủ');
        } else {
          toast('🛡 Quái úp của đối thủ (ẩn danh)');
        }
      } else if (sl && sl.kind === 'TRAP') {
        toast('🂠 Bẫy đã SET (ẩn)');
      }
      return;
    }
    if (vIdx === 1) { // Sân đối thủ
      const es = S.players[opp].field[i];
      if (mode === 'battleTarget') {
        if (es && es.kind === 'MONSTER') {
          const atkSlot = pending.attackerSlot;
          resetMode();
          doAttack(atkSlot, i);
          return;
        }
        toast('🎯 Chọn quái vật đối thủ để tấn công!');
        return;
      }
      if (mode === 'enemyTarget') {
        if (es && es.kind === 'MONSTER' && !es.faceDown) {
          dispatchAction({ type: 'MAGIC', handIdx: pending.handIdx, targetSlot: i });
          return;
        }
        toast('🎯 Chọn quái NGỦA của đối thủ làm mục tiêu');
        return;
      }
      if (es && es.kind === 'MONSTER' && !es.faceDown) showPreview(es.card, 'Quái của đối thủ');
      else if (es && es.kind === 'TRAP') toast('🂠 Bẫy đã SET (ẩn)');
      return;
    }

    // vIdx === 0: Sân của bạn
    const p = S.players[me];
    const sl = p.field[i];

    // Battle phase: tấn công
    if (myTurnBattle()) {
      if (mode === 'battleTarget') {
        if (sl && sl.kind === 'MONSTER' && E.canAttack(S, me, i)) {
          pending.attackerSlot = i;
          renderAll();
          return;
        }
        resetMode();
        return;
      }
      if (sl && sl.kind === 'MONSTER' && E.canAttack(S, me, i)) {
        // Kiểm tra đối thủ có quái không
        const enemyMonsters = [0, 1, 2, 3, 4].filter(idx => S.players[opp].field[idx] && S.players[opp].field[idx].kind === 'MONSTER');
        if (enemyMonsters.length === 0) {
          doAttack(i, null);
        } else {
          mode = 'battleTarget';
          pending = { attackerSlot: i };
          toast('🎯 Chọn một quái đối thủ để tấn công');
          renderAll();
        }
      } else if (sl && sl.kind === 'MONSTER') {
        showPreview(sl.card, sl.faceDown ? 'Quái của bạn (Đang ÚP THỦ)' : 'Quái của bạn');
      }
      return;
    }

    // Main phase theo mode
    if (mode === 'summonSlot') {
      if (i >= 5) { toast('⚠️ Quái vật chỉ được triệu hồi ở hàng Quái (trên)!'); return; }
      if (!sl) {
        dispatchAction({ type: 'SUMMON', handIdx: pending.handIdx, slotIdx: i, faceDown: pending.faceDown });
        return;
      }
    }
    if (mode === 'trapSlot') {
      if (i < 5) { toast('⚠️ Bẫy chỉ được đặt ở hàng Phép/Bẫy (dưới)!'); return; }
      if (!sl) {
        dispatchAction({ type: 'SET_TRAP', handIdx: pending.handIdx, slotIdx: i });
        return;
      }
    }
    if (mode === 'fuseSlot') {
      if (i >= 5) { toast('⚠️ Quái vật chỉ được triệu hồi ở hàng Quái (trên)!'); return; }
      if (!sl && pending.fuseAB) {
        const { a, b } = pending.fuseAB;
        pending = {};
        dispatchAction({ type: 'FUSION', a, b, targetSlot: i });
        return;
      }
    }
    if (mode === 'fusing' && sl && sl.kind === 'MONSTER' && validFuseB(me, i)) {
      const a = pending.a;
      if (a.src === 'FIELD' && a.idx === i) return;
      const b = { src: 'FIELD', idx: i };
      const result = E.peekFusion(S, me, a, b);
      if (!result) { toast('❌ Hai thẻ này không hợp nhất được!'); sfx.set(); return; }
      confirmFusion(a, b, result);
      return;
    }
    if (mode === 'equipTarget' && equipMatch(pending.handIdx, me, i)) {
      dispatchAction({ type: 'MAGIC', handIdx: pending.handIdx, targetSlot: i });
      return;
    }
    if (mode === 'fieldSel' && selField === i) { resetMode(); return; }

    // idle/other: chọn quái trên sân
    if (sl) {
      sfx.select();
      if (sl.kind === 'MONSTER') {
        mode = 'fieldSel'; selField = i; selHand = -1;
        showPreview(sl.card, sl.faceDown ? 'Quái của bạn (Đang ÚP THỦ)' : 'Quái của bạn');
        openSidebarMobile();
        renderAll();
      } else {
        showPreview({ kind: 'TRAP', tid: sl.tid }, 'Bẫy đã SET (ẩn cho đối thủ)');
      }
    } else {
      if (mode === 'fusing') toast('↩ Đã huỷ fusion');
      resetMode();
    }
  }

  function showPreviewInstant(card) { showPreview(card, "Trên sân"); }

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
        dispatchAction({ type: 'FUSION', a, b, targetSlot: fieldSlot });
      } else {
        mode = 'fuseSlot'; pending = { fuseAB: { a, b } }; renderAll();
        toast('👉 Chọn một ô trống để đặt ' + result.name);
      }
    };
    $('fuse-no').onclick = () => { closeModal(); renderAll(); };
  }

  function cardOf(src) {
    const me = myIdx();
    return src.src === 'HAND' ? S.players[me].hand[src.idx] : S.players[me].field[src.idx].card;
  }

  function confirmRitual(handIdx) {
    const me = myIdx();
    const card = S.players[me].hand[handIdx];
    const md = C.magics[card.mid];
    if (!md || md.kind !== 'ritual') return;
    const pool = {};
    S.players[me].hand.forEach(c => { if (E.isMon(c)) pool[c.id] = (pool[c.id] || 0) + 1; });
    S.players[me].field.forEach(sl => { if (sl && sl.kind === 'MONSTER') pool[sl.card.id] = (pool[sl.card.id] || 0) + 1; });
    const rows = (md.offerings || []).map(oid => {
      const m = C.monsters[oid];
      const ok = (pool[oid] || 0) >= 1;
      return `<div style='font-size:13px;padding:2px'>${ok ? '✅' : '❌'} ${m ? m.name : '?'} (${m ? m.atk + '/' + m.def : ''})</div>`;
    }).join('');
    const result = C.monsters[md.result];
    const empty = S.players[me].field.slice(0, 5).some(x => !x);
    openModal(`
      <h1 style='font-size:24px'>👁 RITUAL</h1>
      <div class='msub'>${md.name}</div>
      <div>${rows}</div>
      <div class='msub'>→ Triệu hồi <b>${result.name}</b> (${result.atk}/${result.def}) · ${empty ? 'còn ô quái trống ✅' : 'KHÔNG còn ô quái trống ❌'}</div>
      <div class='mbtns'>
        <button class='primary' id='rit-ok' ${empty ? '' : 'disabled'}>✔ Xác Nhận</button>
        <button id='rit-no'>✖ Huỷ</button>
      </div>
    `, true);
    $('rit-ok').onclick = () => {
      closeModal();
      doMagic(handIdx, null);
    };
    $('rit-no').onclick = () => { closeModal(); renderAll(); };
  }

  function dispatchAction(action) {
    if (UI.isOnline && myIdx() === 1) {
      // Guest gửi action cho Host qua WebRTC
      FM.net.sendAction(action);
      resetMode();
      return { ok: true };
    }
    // Host hoặc Chơi đơn
    const r = E.perform(S, action);
    if (r && r.ok === false) {
      toast('❌ ' + (r.msg || 'Thao tác không hợp lệ'));
      resetMode();
      renderAll();
      return r;
    }
    resetMode();
    if (UI.isOnline && myIdx() === 0) {
      const fxEvents = E.drainFx(S);
      FM.net.syncState(S, fxEvents);
      startFxThenDirect(fxEvents).then(() => {
        renderAll();
        maybeGameOver();
      });
      return r;
    }
    postAction(r);
    return r;
  }

  function doMagic(handIdx, targetSlot) {
    const me = myIdx();
    const card = S.players[me].hand[handIdx];
    if (!card) return;
    const md = C.magics[card.mid];
    if (md && md.id === 'dianKeto') sfx.heal(); else sfx.magic();
    dispatchAction({ type: 'MAGIC', handIdx, targetSlot });
  }

  function doAttack(slotIdx, targetSlot) {
    sfx.attack();
    dispatchAction({ type: 'ATTACK', slotIdx, targetSlot });
  }

  function doEndTurn() {
    resetMode();
    dispatchAction({ type: 'END' });
  }

  /* Sau mỗi action: animate fx rồi render; khởi động AI nếu đến lượt máy */
  function postAction(result) {
    if (result && result.ok === false) { renderAll(); return; }
    startFxThen(S).then(() => {
      renderAll();
      maybeGameOver();
      if (!UI.isOnline && S && S.winner == null && S.players[S.active].isAI) startAiLoop();
    });
  }

  /* ---------------- FX animation ---------------- */
  async function startFxThenDirect(events) {
    let lastAttack = null;   // nhớ đòn đánh mới nhất cho hiệu ứng bẫy
    for (const ev of (events || [])) {
      await applyFx(ev, lastAttack);
      if (ev.type === 'attack') lastAttack = ev;
    }
  }

  async function startFxThen(st) {
    const events = E.drainFx(st);
    await startFxThenDirect(events);
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
      case 'draw':
        // Rút bài diễn ra ở ĐẦU lượt (Draw Phase). Nếu bỏ rút do tay đầy -> giải thích rõ.
        if (ev.pIdx === 0 && !ev.drew) {
          toast('✋ Tay đầy ' + ev.hand + '/' + E.HAND_MAX + ' — chơi bớt bài để rút được lượt sau.');
          await sleep(350);
        }
        break;
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

  /* ---------------- Helper string sanitize ---------------- */
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- Game over ---------------- */
  function maybeGameOver() {
    if (!S || S.winner == null || S._overShown) return;
    S._overShown = true;
    if (UI.isOnline) {
      const won = S.winner === myIdx();
      (won ? sfx.win : sfx.lose)();
      if (FM.player && FM.player.recordDuelMatch) {
        FM.player.recordDuelMatch(won, won ? 'S' : null, won ? 5 : 0);
      }
      const meName = S.players[myIdx()].name;
      const oppName = S.players[oppIdx()].name;
      openModal(`
        <h1 class="${won ? 'win' : 'lose'}">${won ? '🏆 BẠN CHIẾN THẮNG!' : '💀 BẠN THẤT BẠI!'}</h1>
        <div class="msub">${won ? 'Chúc mừng! Bạn đã xuất sắc đánh bại đối thủ online!' : 'Rất tiếc! Đối thủ đã giành chiến thắng lần này.'}</div>
        <div class="msub" style="margin-top:10px;font-size:13px">LP cuối: ${escapeHtml(meName)} <b>${S.players[myIdx()].lp}</b> — ${escapeHtml(oppName)} <b>${S.players[oppIdx()].lp}</b> · Số lượt: ${S.turnNo}</div>
        <div class="mbtns" style="margin-top:20px">
          <button class="primary" id="go-menu">🏠 Về Trang Chủ</button>
        </div>
      `, true);
      $('go-menu').onclick = () => { closeModal(); UI.showMenu(); };
      return;
    }
    const is2P = !!S.is2P;
    if (is2P) {
      sfx.win();
      const winnerName = S.players[S.winner].name;
      openModal(`
        <h1 class="win">🏆 ${escapeHtml(winnerName.toUpperCase())} CHIẾN THẮNG!</h1>
        <div class="msub">Trận đấu PvP 2 người kết thúc đầy kịch tính!</div>
        <div class="msub" style="margin-top:10px;font-size:13px">LP cuối: ${escapeHtml(S.players[0].name)} <b>${S.players[0].lp}</b> — ${escapeHtml(S.players[1].name)} <b>${S.players[1].lp}</b> · Số lượt: ${S.turnNo}</div>
        <div class="mbtns" style="margin-top:20px">
          <button class="primary" id="go-menu">🏠 Về Trang Chủ</button>
          <button id="go-rematch">⚔ Đấu Tiếp</button>
          <button id="go-deck">🃏 Xếp Bài</button>
        </div>
      `, true);
      $('go-menu').onclick = () => { closeModal(); UI.showMenu(); };
      $('go-rematch').onclick = () => { closeModal(); UI.startDuel(cfg); };
      $('go-deck').onclick = () => { closeModal(); UI.showDeckEditor(); };
      return;
    }
    const won = S.winner === 0;
    (won ? sfx.win : sfx.lose)();
    let unlockMsg = '';
    if (won && cfg && cfg.duelist) {
      const ds = FM.decks.DUELISTS;
      const idx = ds.findIndex(d => d.id === cfg.duelist.id);
      const prog = UI.getProgress();
      if (!prog.includes(cfg.duelist.id)) {
        prog.push(cfg.duelist.id);
        localStorage.setItem('fm_unlock_v1', JSON.stringify(prog));
      }
      const next = ds[idx + 1];
      unlockMsg = `<div class="msub">🔓 Bạn đã hạ <b>${cfg.duelist.name}</b>!${next ? ' Đã mở khóa đối thủ tiếp theo: <b>' + next.name + '</b>!' : ' Bạn đã chinh phục TẤT CẢ đối thủ!'}</div>`;
    }

    if (won && FM.player) {
      const reward = FM.player.calculateDuelReward(S, cfg.duelist);
      let dropCardHtml = '';
      if (reward.dropCard && reward.dropCard.data) {
        const d = reward.dropCard.data;
        const kind = reward.dropCard.kind;
        const dropCardObj = { kind, id: reward.dropCard.id, mid: reward.dropCard.mid, tid: reward.dropCard.tid };
        const icon = C.cardIcon ? C.cardIcon(dropCardObj) : (d.attr ? '🐉' : '✨');
        const dropFid = cardImageId(dropCardObj);
        const dropArt = dropFid
          ? `<img class="cart-img" src="assets/cards/${dropFid}.png" alt="${escapeHtml(d.name)}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"><span class="cart-fallback" style="display:none">${icon}</span>`
          : `<span class="cart-fallback">${icon}</span>`;
        dropCardHtml = `
          <div class="drop-card-container">
            <div class="drop-label">🎁 CHIẾN LỢI PHẨM (ĂN BÀI ĐỐI THỦ)</div>
            <div class="drop-card-center">
              <div class="card ${kind === 'MAGIC' ? 'magic' : kind === 'TRAP' ? 'trap' : ''} newfx">
                <div class="cname">${escapeHtml(d.name)}</div>
                <div class="cart">${dropArt}</div>
                <div class="cstats">${kind === 'MONSTER' ? `<span class="catk">ATK ${d.atk}</span><span class="cdef">DEF ${d.def}</span>` : `<span>${kind === 'MAGIC' ? '✨ PHÉP' : '🪤 BẪY'}</span>`}</div>
                <div class="cbadge">${d.attr || kind}</div>
              </div>
            </div>
            <div class="drop-meta">
              <b>${d.name}</b> ${kind === 'MONSTER' ? `(ATK ${d.atk} / DEF ${d.def})` : ''}
              <div class="drop-note">✅ Đã được tự động chuyển vào <b>Rương Bài (Trunk)</b> của bạn!</div>
            </div>
          </div>
        `;
      }

      openModal(`
        <h1 class="win">🏆 CHIẾN THẮNG!</h1>
        <div class="rank-container">
          <span class="rank-title">RANK CHIẾN ĐẤU</span>
          <span class="rank-stamp rank-${reward.rank}">${reward.rank}</span>
        </div>
        <div class="msub">${S.players[1].name} đã gục ngã trước bạn!</div>
        ${unlockMsg}
        <div class="reward-box">
          <div class="reward-stars-earned">
            <span class="rw-star-icon">⭐</span>
            <span class="rw-star-text">+<b>${reward.starsWon}</b> Star Chips</span>
            <span class="rw-star-total">(Tổng tích luỹ: <b>${reward.totalStars}</b> ⭐)</span>
          </div>
          ${dropCardHtml}
        </div>
        <div class="msub" style="margin-top:10px;font-size:12px">LP cuối: Bạn <b>${S.players[0].lp}</b> — ${S.players[1].name} <b>${S.players[1].lp}</b> · Số lượt: ${S.turnNo}</div>
        <div class="mbtns">
          <button class="primary" id="go-menu">🏠 Về Trang Chủ</button>
          <button id="go-rematch">⚔ Đấu Tiếp (Tái Đấu)</button>
          <button id="go-deck">🃏 Xếp Bài (Vào Trunk)</button>
          <button id="go-shop">🏪 Tiệm Bài (Card Shop)</button>
        </div>
      `, true);

      $('go-menu').onclick = () => { closeModal(); UI.showMenu(); };
      $('go-rematch').onclick = () => { closeModal(); UI.startDuel(cfg); };
      $('go-deck').onclick = () => { closeModal(); UI.showDeckEditor(); };
      $('go-shop').onclick = () => { closeModal(); UI.showCardShop(); };
      return;
    }

    openModal(`
      <h1 class="lose">💀 THẤT BẠI</h1>
      <div class="msub">${S.players[1].name} đã đánh bại bạn. Hãy nâng cấp bộ bài và thử lại!</div>
      <div class="msub">LP cuối: Bạn <b>${S.players[0].lp}</b> — ${S.players[1].name} <b>${S.players[1].lp}</b> · Số lượt: ${S.turnNo}</div>
      <div class="mbtns">
        <button class="primary" id="go-menu">🏠 Về Trang Chủ</button>
        <button id="go-rematch">⚔ Đấu Tiếp (Tái Đấu)</button>
        <button id="go-deck">🃏 Xếp Bài (Vào Trunk)</button>
        <button id="go-shop">🏪 Tiệm Bài (Card Shop)</button>
      </div>
    `);
    $('go-menu').onclick = () => { closeModal(); UI.showMenu(); };
    $('go-rematch').onclick = () => { closeModal(); UI.startDuel(cfg); };
    $('go-deck').onclick = () => { closeModal(); UI.showDeckEditor(); };
    $('go-shop').onclick = () => { closeModal(); UI.showCardShop(); };
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
          <li><b>Draw Phase:</b> rút 1 bài ở ĐẦU mỗi lượt. Tay tối đa <b>5 bài</b> — nếu tay đầy 5/5 thì <b>bỏ lượt rút</b> (luật FM gốc), hãy chơi bớt bài.</li>
        </ul>
        <h3>🗺 Sàn Đấu 2 Hàng (FM gốc 1999)</h3>
        <ul>
          <li>Mỗi bên có <b>2 hàng</b>: hàng trên là <b>5 ô Quái Vật</b> (đối diện nhau ở giữa sân), hàng dưới là <b>5 ô Phép &amp; Bẫy</b>.</li>
          <li>Quái vật có thể <b>chọn tấn công</b> bất kỳ quái nào của đối thủ. Nếu đối thủ không còn quái → <b>đánh trực tiếp LP</b>!</li>
          <li>Quái úp (DEF) là tường chắn đòn tấn công trực tiếp. Bẫy đặt ở hàng dưới tự kích hoạt khi đối thủ hành động.</li>
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

  /* =========================================================================
   * GIAO DIỆN DECK BUILDER (TRUNK & 40-CARD MAIN DECK)
   * ========================================================================= */
  function cardKeyOf(c) {
    if (!c) return null;
    if (typeof c === 'string' || typeof c === 'number') return String(c);
    if (c.kind === 'MONSTER') return String(c.id);
    if (c.kind === 'MAGIC') return c.mid;
    if (c.kind === 'TRAP') return c.tid;
    return null;
  }

  function showDeckEditor() {
    const P = FM.player;
    if (!P) return;
    let deck = P.getDeck().slice();
    let trunk = Object.assign({}, P.getTrunk());

    let trunkFilter = 'ALL';
    let trunkSearch = '';

    function renderEditorModal() {
      openModal(`
        <div class="deck-editor">
          <div class="de-header">
            <h2>🃏 QUẢN LÝ BỘ BÀI &amp; RƯƠNG (DECK &amp; TRUNK)</h2>
            <div class="de-stats">
              <span class="de-deck-stat ${deck.length === 40 ? 'ok' : 'warn'}">Bộ bài: <b>${deck.length}/40</b> lá</span>
              <span class="de-star-stat">⭐ <b>${P.getStars()}</b> Star Chips</span>
            </div>
          </div>
          <div class="de-body">
            <!-- CỘT BỘ BÀI ĐANG CHỌN (MAIN DECK) -->
            <div class="de-section de-deck-col">
              <div class="de-sec-title">
                <span>🎴 BỘ BÀI THI ĐẤU (${deck.length}/40)</span>
                <span class="de-sec-hint">Nhấp vào thẻ để đưa về Rương bài</span>
              </div>
              <div id="de-deck-grid" class="de-grid de-deck-grid"></div>
            </div>

            <!-- CỘT RƯƠNG BÀI (TRUNK) -->
            <div class="de-section de-trunk-col">
              <div class="de-sec-title">
                <span>📦 RƯƠNG BÀI (TRUNK)</span>
                <span class="de-sec-hint">Nhấp vào thẻ để thêm vào Deck (tối đa 3 lá trùng)</span>
              </div>
              <div class="de-filter-bar">
                <input id="de-search-input" type="text" placeholder="🔍 Tìm tên thẻ, hệ, race..." value="${escapeHtml(trunkSearch)}">
                <div class="de-filter-pills">
                  <button class="pill ${trunkFilter === 'ALL' ? 'sel' : ''}" data-f="ALL">Tất cả</button>
                  <button class="pill ${trunkFilter === 'MONSTER' ? 'sel' : ''}" data-f="MONSTER">Quái</button>
                  <button class="pill ${trunkFilter === 'MAGIC' ? 'sel' : ''}" data-f="MAGIC">Phép</button>
                  <button class="pill ${trunkFilter === 'TRAP' ? 'sel' : ''}" data-f="TRAP">Bẫy</button>
                </div>
              </div>
              <div id="de-trunk-grid" class="de-grid de-trunk-grid"></div>
            </div>
          </div>

          <div class="de-actions">
            <button class="primary" id="de-btn-save" ${deck.length === 40 ? '' : 'disabled'}>💾 Lưu Bộ Bài (40 Lá)</button>
            <button id="de-btn-autofill">⚡ Tự Điền Đủ 40 Lá</button>
            <button id="de-btn-reset">🔄 Khôi Phục Deck Mẫu</button>
            <button id="de-btn-close">✕ Đóng</button>
          </div>
        </div>
      `, true);

      // Event search & filter
      const searchInput = $('de-search-input');
      if (searchInput) {
        searchInput.oninput = () => { trunkSearch = searchInput.value.trim().toLowerCase(); renderTrunkGrid(); };
      }
      document.querySelectorAll('.de-filter-pills .pill').forEach(btn => {
        btn.onclick = () => {
          trunkFilter = btn.dataset.f;
          document.querySelectorAll('.de-filter-pills .pill').forEach(x => x.classList.remove('sel'));
          btn.classList.add('sel');
          renderTrunkGrid();
        };
      });

      // Actions
      $('de-btn-save').onclick = () => {
        const res = P.saveDeck(deck, trunk);
        if (res.ok) {
          sfx.select();
          toast('✅ Đã lưu bộ bài 40 lá thành công!');
          if (!S || S.winner != null) {
            UI.showMenu();
          } else {
            UI.buildMenu();
          }
        } else {
          toast('❌ ' + res.msg);
        }
      };

      $('de-btn-autofill').onclick = () => {
        if (deck.length >= 40) { toast('Bộ bài đã đủ 40 lá!'); return; }
        const keys = Object.keys(trunk).filter(k => trunk[k] > 0);
        for (const k of keys) {
          while (trunk[k] > 0 && deck.length < 40) {
            const inDeckCount = deck.filter(c => cardKeyOf(c) === k).length;
            if (inDeckCount >= 3) break;
            const cd = C.cardData(k);
            if (!cd) break;
            trunk[k]--;
            deck.push(cd.isMonster ? { kind: 'MONSTER', id: cd.id } : cd.isMagic ? { kind: 'MAGIC', mid: cd.mid } : { kind: 'TRAP', tid: cd.tid });
          }
          if (deck.length >= 40) break;
        }
        if (deck.length < 40) toast(`Rương không đủ bài để điền đủ 40 lá! (Hiện có ${deck.length}/40)`);
        else toast('⚡ Đã tự động điền đủ 40 lá vào bộ bài!');
        renderDeckGrid();
        renderTrunkGrid();
        updateDeckCount();
      };

      $('de-btn-reset').onclick = () => {
        if (confirm('Khôi phục bộ bài về Deck Khởi Đầu (Kiếm Sĩ Hỏa)? Các thẻ khác được chuyển về Trunk.')) {
          P.resetDeckToPreset('flameSwordsman');
          deck = P.getDeck().slice();
          trunk = Object.assign({}, P.getTrunk());
          toast('🔄 Đã khôi phục Deck Khởi Đầu!');
          renderDeckGrid();
          renderTrunkGrid();
          updateDeckCount();
          UI.buildMenu();
        }
      };

      $('de-btn-close').onclick = () => {
        closeModal();
        if (!S || S.winner != null) {
          UI.showMenu();
        } else {
          UI.buildMenu();
        }
      };

      renderDeckGrid();
      renderTrunkGrid();
    }

    function updateDeckCount() {
      const el = document.querySelector('.de-deck-stat');
      if (el) {
        el.className = 'de-deck-stat ' + (deck.length === 40 ? 'ok' : 'warn');
        el.innerHTML = `Bộ bài: <b>${deck.length}/40</b> lá`;
      }
      const title = document.querySelector('.de-deck-col .de-sec-title span');
      if (title) title.textContent = `🎴 BỘ BÀI THI ĐẤU (${deck.length}/40)`;
      const saveBtn = $('de-btn-save');
      if (saveBtn) saveBtn.disabled = (deck.length !== 40);
    }

    function renderDeckGrid() {
      const grid = $('de-deck-grid');
      if (!grid) return;
      grid.innerHTML = '';
      if (deck.length === 0) {
        grid.innerHTML = '<div class="de-empty">Bộ bài đang trống. Hãy nhấp thẻ từ Rương để thêm vào!</div>';
        return;
      }
      deck.forEach((card, idx) => {
        const item = document.createElement('div');
        item.className = 'de-card-slot';
        const el = cardEl(card, false);
        item.appendChild(el);
        item.onclick = () => {
          const removed = deck.splice(idx, 1)[0];
          const k = cardKeyOf(removed);
          trunk[k] = (trunk[k] || 0) + 1;
          sfx.set();
          renderDeckGrid();
          renderTrunkGrid();
          updateDeckCount();
        };
        grid.appendChild(item);
      });
    }

    function renderTrunkGrid() {
      const grid = $('de-trunk-grid');
      if (!grid) return;
      grid.innerHTML = '';
      const keys = Object.keys(trunk).filter(k => trunk[k] > 0);
      const filtered = [];
      for (const k of keys) {
        const cd = C.cardData(k);
        if (!cd || !cd.data) continue;
        const d = cd.data;
        if (trunkFilter === 'MONSTER' && !cd.isMonster) continue;
        if (trunkFilter === 'MAGIC' && !cd.isMagic) continue;
        if (trunkFilter === 'TRAP' && !cd.isTrap) continue;
        if (trunkSearch) {
          const match = (d.name && d.name.toLowerCase().includes(trunkSearch)) ||
                        (d.race && d.race.toLowerCase().includes(trunkSearch)) ||
                        (d.attr && d.attr.toLowerCase().includes(trunkSearch)) ||
                        (cd.code && cd.code.includes(trunkSearch)) ||
                        (String(cd.id || '').includes(trunkSearch));
          if (!match) continue;
        }
        filtered.push({ key: k, cd, count: trunk[k] });
      }

      // Sắp xếp: Quái ATK giảm dần, sau đó Phép/Bẫy
      filtered.sort((a, b) => {
        const isMonA = a.cd.kind === 'MONSTER' || a.cd.isMonster;
        const isMonB = b.cd.kind === 'MONSTER' || b.cd.isMonster;
        const atkA = isMonA ? (a.cd.data ? a.cd.data.atk : 0) : -1;
        const atkB = isMonB ? (b.cd.data ? b.cd.data.atk : 0) : -1;
        if (atkB !== atkA) return atkB - atkA;
        return (a.cd.data ? a.cd.data.name : '').localeCompare(b.cd.data ? b.cd.data.name : '');
      });

      if (filtered.length === 0) {
        grid.innerHTML = '<div class="de-empty">Không có thẻ nào trong rương phù hợp với bộ lọc.</div>';
        return;
      }

      filtered.forEach(item => {
        const wrap = document.createElement('div');
        wrap.className = 'de-trunk-item';
        const isMon = item.cd.kind === 'MONSTER' || item.cd.isMonster;
        const isMag = item.cd.kind === 'MAGIC' || item.cd.isMagic;
        const cardObj = isMon
          ? { kind: 'MONSTER', id: item.cd.id }
          : isMag
          ? { kind: 'MAGIC', mid: item.cd.mid }
          : { kind: 'TRAP', tid: item.cd.tid };
        const el = cardEl(cardObj, false);
        wrap.appendChild(el);

        const inDeckCount = deck.filter(c => cardKeyOf(c) === item.key).length;
        const badge = document.createElement('div');
        badge.className = 'de-item-badge';
        badge.innerHTML = `Rương: <b>x${item.count}</b> · Deck: <b>${inDeckCount}/3</b>`;
        wrap.appendChild(badge);

        wrap.onclick = () => {
          if (deck.length >= 40) {
            toast('❌ Bộ bài đã đủ 40 lá! Hãy gỡ bớt thẻ khỏi Deck trước.');
            return;
          }
          if (inDeckCount >= 3) {
            toast('❌ Tối đa 3 bản sao của mỗi lá bài trong Deck!');
            return;
          }
          trunk[item.key]--;
          if (trunk[item.key] <= 0) delete trunk[item.key];
          deck.push(cardObj);
          sfx.select();
          renderDeckGrid();
          renderTrunkGrid();
          updateDeckCount();
        };
        grid.appendChild(wrap);
      });
    }

    renderEditorModal();
  }

  /* =========================================================================
   * GIAO DIỆN CARD SHOP (CATALOG 722 LÁ + MẬT MÃ TCG 8 CHỮ SỐ)
   * ========================================================================= */
  function showCardShop(initialTab) {
    const P = FM.player;
    if (!P) return;
    let curTab = initialTab === 'password' ? 'password' : 'catalog';
    let catFilter = 'ALL';
    let catSearch = '';
    let catPage = 1;
    const PER_PAGE = 30;

    let pwInput = '';

    function renderShopModal() {
      openModal(`
        <div class="card-shop">
          <div class="cs-header">
            <h2>🏪 TIỆM BÀI PHÙ THỦY (CARD SHOP)</h2>
            <div class="cs-stars">⭐ <span id="cs-star-val">${P.getStars()}</span> <span class="cs-star-label">Star Chips</span></div>
          </div>
          <div class="cs-nav">
            <button class="cs-tab ${curTab === 'catalog' ? 'active' : ''}" id="cs-tab-cat">📚 Danh Mục 722 Lá</button>
            <button class="cs-tab ${curTab === 'password' ? 'active' : ''}" id="cs-tab-pw">🔢 Nhập Mật Mã 8 Số (Password)</button>
            <button class="cs-close" id="cs-btn-close">✕ Đóng</button>
          </div>
          <div class="cs-content" id="cs-content"></div>
        </div>
      `, true);

      $('cs-tab-cat').onclick = () => { curTab = 'catalog'; renderShopModal(); };
      $('cs-tab-pw').onclick = () => { curTab = 'password'; renderShopModal(); };
      $('cs-btn-close').onclick = () => {
        closeModal();
        if (!S || S.winner != null) {
          UI.showMenu();
        } else {
          UI.buildMenu();
        }
      };

      if (curTab === 'catalog') {
        renderCatalogView();
      } else {
        renderPasswordView();
      }
    }

    function renderCatalogView() {
      const container = $('cs-content');
      if (!container) return;
      container.innerHTML = `
        <div class="cs-cat-tools">
          <input id="cs-cat-search" type="text" placeholder="🔍 Tìm kiếm tên thẻ, race, hệ..." value="${escapeHtml(catSearch)}">
          <div class="cs-cat-filters">
            <button class="pill ${catFilter === 'ALL' ? 'sel' : ''}" data-f="ALL">Tất cả</button>
            <button class="pill ${catFilter === 'MONSTER' ? 'sel' : ''}" data-f="MONSTER">Quái</button>
            <button class="pill ${catFilter === 'MAGIC' ? 'sel' : ''}" data-f="MAGIC">Phép</button>
            <button class="pill ${catFilter === 'TRAP' ? 'sel' : ''}" data-f="TRAP">Bẫy</button>
            <button class="pill ${catFilter === 'RITUAL' ? 'sel' : ''}" data-f="RITUAL">Ritual</button>
          </div>
        </div>
        <div id="cs-cat-grid" class="cs-cat-grid"></div>
        <div id="cs-cat-pagination" class="cs-pagination"></div>
      `;

      const searchInput = $('cs-cat-search');
      if (searchInput) {
        searchInput.oninput = () => {
          catSearch = searchInput.value.trim().toLowerCase();
          catPage = 1;
          renderCatalogCards();
        };
      }
      container.querySelectorAll('.cs-cat-filters .pill').forEach(btn => {
        btn.onclick = () => {
          catFilter = btn.dataset.f;
          container.querySelectorAll('.cs-cat-filters .pill').forEach(x => x.classList.remove('sel'));
          btn.classList.add('sel');
          catPage = 1;
          renderCatalogCards();
        };
      });

      renderCatalogCards();
    }

    function renderCatalogCards() {
      const grid = $('cs-cat-grid');
      const pag = $('cs-cat-pagination');
      if (!grid) return;
      const all = C.allCards ? C.allCards() : [];
      const filtered = all.filter(c => {
        if (!c || !c.data) return false;
        const isMonster = c.kind === 'MONSTER' || c.isMonster;
        const isMagic = c.kind === 'MAGIC' || c.isMagic;
        const isTrap = c.kind === 'TRAP' || c.isTrap;
        if (catFilter === 'MONSTER' && !isMonster) return false;
        if (catFilter === 'MAGIC' && !isMagic) return false;
        if (catFilter === 'TRAP' && !isTrap) return false;
        if (catFilter === 'RITUAL' && (c.data.kind !== 'ritual')) return false;
        if (catSearch) {
          const d = c.data;
          const match = (d.name && d.name.toLowerCase().includes(catSearch)) ||
                        (d.race && d.race.toLowerCase().includes(catSearch)) ||
                        (d.attr && d.attr.toLowerCase().includes(catSearch)) ||
                        (c.code && String(c.code).includes(catSearch)) ||
                        (d.code && String(d.code).includes(catSearch)) ||
                        (String(c.id || '').includes(catSearch));
          if (!match) return false;
        }
        return true;
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
      if (catPage > totalPages) catPage = totalPages;
      const start = (catPage - 1) * PER_PAGE;
      const slice = filtered.slice(start, start + PER_PAGE);

      grid.innerHTML = '';
      if (slice.length === 0) {
        grid.innerHTML = '<div class="cs-empty">Không tìm thấy thẻ bài nào khớp với tìm kiếm.</div>';
      } else {
        const curStars = P.getStars();
        slice.forEach(item => {
          const cardDiv = document.createElement('div');
          cardDiv.className = 'cs-card-item';
          const isMon = item.kind === 'MONSTER' || item.isMonster;
          const isMag = item.kind === 'MAGIC' || item.isMagic;
          const cardObj = isMon ? { kind: 'MONSTER', id: item.id } : isMag ? { kind: 'MAGIC', mid: item.mid } : { kind: 'TRAP', tid: item.tid };
          const el = cardEl(cardObj, false);
          cardDiv.appendChild(el);

          const cost = item.data.cost || 50;
          const owned = P.totalOwned(item.key);
          const meta = document.createElement('div');
          meta.className = 'cs-item-meta';
          meta.innerHTML = `
            <div class="cs-item-price">⭐ <b>${cost}</b></div>
            <div class="cs-item-owned">Đã có: <b>${owned}</b></div>
          `;
          const buyBtn = document.createElement('button');
          buyBtn.className = 'primary cs-btn-buy';
          buyBtn.innerHTML = `Mua`;
          buyBtn.disabled = (curStars < cost);
          buyBtn.onclick = () => {
            const r = P.buyCard(item.key);
            if (r.ok) {
              sfx.win();
              toast(`🎉 Đã mua thành công ${item.data.name}! Đã chuyển vào Rương.`);
              const valEl = $('cs-star-val');
              if (valEl) valEl.textContent = r.stars;
              renderCatalogCards();
              UI.buildMenu();
            } else {
              toast('❌ ' + r.msg);
            }
          };
          meta.appendChild(buyBtn);
          cardDiv.appendChild(meta);
          grid.appendChild(cardDiv);
        });
      }

      // Pagination controls
      if (pag) {
        pag.innerHTML = `
          <button id="cs-prev" ${catPage <= 1 ? 'disabled' : ''}>« Trang Trước</button>
          <span>Trang <b>${catPage}</b> / <b>${totalPages}</b> (${filtered.length} thẻ)</span>
          <button id="cs-next" ${catPage >= totalPages ? 'disabled' : ''}>Trang Sau »</button>
        `;
        $('cs-prev').onclick = () => { if (catPage > 1) { catPage--; renderCatalogCards(); grid.scrollTop = 0; } };
        $('cs-next').onclick = () => { if (catPage < totalPages) { catPage++; renderCatalogCards(); grid.scrollTop = 0; } };
      }
    }

    function renderPasswordView() {
      const container = $('cs-content');
      if (!container) return;
      container.innerHTML = `
        <div class="cs-pw-view">
          <div class="cs-pw-desc">
            <h3>🔢 BÀN PHÍM NHẬP MẬT MÃ TCG (8 CHỮ SỐ)</h3>
            <p>Nhập mật mã 8 số in ở góc dưới thẻ bài Yu-Gi-Oh! để tìm và mua trực tiếp bất kỳ lá bài nào!</p>
          </div>
          <div class="cs-pw-display-box">
            <input id="cs-pw-input" type="text" maxlength="8" placeholder="00000000" value="${escapeHtml(pwInput)}">
          </div>
          <div class="cs-pw-keypad">
            <div class="pw-row">
              <button class="pw-key" data-k="1">1</button>
              <button class="pw-key" data-k="2">2</button>
              <button class="pw-key" data-k="3">3</button>
            </div>
            <div class="pw-row">
              <button class="pw-key" data-k="4">4</button>
              <button class="pw-key" data-k="5">5</button>
              <button class="pw-key" data-k="6">6</button>
            </div>
            <div class="pw-row">
              <button class="pw-key" data-k="7">7</button>
              <button class="pw-key" data-k="8">8</button>
              <button class="pw-key" data-k="9">9</button>
            </div>
            <div class="pw-row">
              <button class="pw-key func" data-k="C">Xoá Hết</button>
              <button class="pw-key" data-k="0">0</button>
              <button class="pw-key func" data-k="BS">⌫ Lùi</button>
            </div>
          </div>
          <div class="cs-pw-result" id="cs-pw-result"></div>
        </div>
      `;

      const input = $('cs-pw-input');
      const updateResult = () => {
        pwInput = input.value.replace(/[^0-9]/g, '').slice(0, 8);
        input.value = pwInput;
        const resDiv = $('cs-pw-result');
        if (pwInput.length < 8) {
          resDiv.innerHTML = `<div class="pw-hint">Đã nhập: ${pwInput.length}/8 chữ số...</div>`;
          return;
        }
        const cardMatch = C.byCode ? C.byCode(pwInput) : null;
        if (!cardMatch || !cardMatch.data) {
          resDiv.innerHTML = `<div class="pw-error">❌ Mật mã "${pwInput}" không khớp với bất kỳ lá bài nào trong cơ sở dữ liệu 722 lá.</div>`;
          return;
        }
        const d = cardMatch.data;
        const cost = d.cost || 50;
        const curStars = P.getStars();
        const isMon = cardMatch.kind === 'MONSTER' || cardMatch.isMonster;
        const isMag = cardMatch.kind === 'MAGIC' || cardMatch.isMagic;
        const cardObj = isMon ? { kind: 'MONSTER', id: cardMatch.id } : isMag ? { kind: 'MAGIC', mid: cardMatch.mid } : { kind: 'TRAP', tid: cardMatch.tid };
        const owned = P.totalOwned(cardMatch.key);

        resDiv.innerHTML = '';
        const foundBox = document.createElement('div');
        foundBox.className = 'pw-found-box';
        const el = cardEl(cardObj, false);
        foundBox.appendChild(el);

        const info = document.createElement('div');
        info.className = 'pw-found-info';
        info.innerHTML = `
          <div class="pw-found-name">🎯 ${d.name}</div>
          <div class="pw-found-type">${cardMatch.isMonster ? `${d.race} · ${d.attr} · ATK ${d.atk} / DEF ${d.def}` : `${cardMatch.kind === 'MAGIC' ? 'PHÉP' : 'BẪY'}`}</div>
          <div class="pw-found-cost">Giá: ⭐ <b>${cost}</b> Star Chips · Đã có: <b>${owned}</b></div>
        `;
        const buyBtn = document.createElement('button');
        buyBtn.className = 'primary big';
        buyBtn.innerHTML = `🛒 Mua Thẻ Này (⭐ ${cost})`;
        buyBtn.disabled = (curStars < cost);
        buyBtn.onclick = () => {
          const r = P.buyCard(cardMatch.key);
          if (r.ok) {
            sfx.win();
            toast(`🎉 Đã mua thành công ${d.name}! Đã chuyển vào Rương.`);
            const valEl = $('cs-star-val');
            if (valEl) valEl.textContent = r.stars;
            updateResult();
            UI.buildMenu();
          } else {
            toast('❌ ' + r.msg);
          }
        };
        info.appendChild(buyBtn);
        foundBox.appendChild(info);
        resDiv.appendChild(foundBox);
      };

      input.oninput = updateResult;
      container.querySelectorAll('.pw-key').forEach(btn => {
        btn.onclick = () => {
          const k = btn.dataset.k;
          if (k === 'C') pwInput = '';
          else if (k === 'BS') pwInput = pwInput.slice(0, -1);
          else if (pwInput.length < 8) pwInput += k;
          input.value = pwInput;
          sfx.select();
          updateResult();
        };
      });

      updateResult();
    }

    renderShopModal();
  }

  /* ---------------- Account Profile Modal ---------------- */
  function showProfile() {
    const P = FM.player;
    if (!P) return;

    const avatars = ['👑', '🧙', '🧝', '🐲', '⚔️', '🛡️', '🦁', '🦅', '⚡', '🔮', '🃏', '👹', '🐺', '🦊', '💀', '🔥'];

    function renderProfileModal() {
      const prof = P.getProfile();
      const stats = P.getStats();
      const ranks = prof.ranks || { S: 0, A: 0, B: 0, C: 0, D: 0 };
      const wins = stats.wins || 0;
      const losses = stats.losses || 0;
      const totalMatches = wins + losses;
      const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
      const coll = P.getUniqueCardCount();
      const stars = P.getStars();
      const title = P.getTitle();
      const curAvatar = P.getAvatar();
      const curName = P.getName();

      openModal(`
        <div class="profile-modal">
          <div class="pm-header">
            <div class="pm-avatar-big" id="pm-cur-avatar">${curAvatar}</div>
            <div class="pm-info">
              <div class="pm-name-row">
                <input type="text" id="pm-name-input" class="pm-name-input" maxlength="18" value="${escapeHtml(curName)}" placeholder="Tên bài thủ">
                <button class="primary" id="pm-save-name" type="button" style="padding:5px 12px;font-size:12px">💾 Lưu</button>
              </div>
              <div class="pm-title-badge">🎖 ${escapeHtml(title)}</div>
            </div>
          </div>

          <div style="font-size:12px;color:var(--dim);margin-bottom:8px;text-align:left;font-weight:700">🎭 CHỌN ẢNH ĐẠI DIỆN:</div>
          <div class="pm-avatar-picker">
            ${avatars.map(a => `<button class="pm-avatar-opt ${a === curAvatar ? 'active' : ''}" type="button" data-av="${a}">${a}</button>`).join('')}
          </div>

          <div class="pm-stats-grid">
            <div class="pm-stat-card">
              <span class="pm-stat-num" style="color:#2ecc71">${wins}</span>
              <span class="pm-stat-lbl">Trận Thắng</span>
            </div>
            <div class="pm-stat-card">
              <span class="pm-stat-num" style="color:#e74c3c">${losses}</span>
              <span class="pm-stat-lbl">Trận Thua</span>
            </div>
            <div class="pm-stat-card">
              <span class="pm-stat-num" style="color:#3498db">${winRate}%</span>
              <span class="pm-stat-lbl">Tỉ Lệ Thắng</span>
            </div>
            <div class="pm-stat-card">
              <span class="pm-stat-num" style="color:#f1c40f">⭐ ${stars}</span>
              <span class="pm-stat-lbl">Star Chips</span>
            </div>
            <div class="pm-stat-card">
              <span class="pm-stat-num" style="color:#e67e22">🎁 ${stats.drops || 0}</span>
              <span class="pm-stat-lbl">Lá Bài Đã Drop</span>
            </div>
            <div class="pm-stat-card">
              <span class="pm-stat-num" style="color:#9b59b6">🃏 ${P.getDeck().length}</span>
              <span class="pm-stat-lbl">Bài Trong Deck</span>
            </div>
          </div>

          <div class="pm-progress-box">
            <div class="pm-progress-header">
              <span>📚 BỘ SƯU TẬP BÀI (722 THẺ)</span>
              <b>${coll.count} / ${coll.total} thẻ (${coll.percent}%)</b>
            </div>
            <div class="pm-progress-bar">
              <div class="pm-progress-fill" style="width: ${coll.percent}%"></div>
            </div>
          </div>

          <div style="font-size:12px;color:var(--dim);margin-bottom:6px;text-align:left;font-weight:700">🏆 CHIẾN TÍCH THEO RANK CHIẾN ĐẤU:</div>
          <div class="pm-rank-pills">
            <span class="pm-rank-badge" style="color:#f1c40f;border-color:#f1c40f">Rank S: <b>${ranks.S || 0}</b></span>
            <span class="pm-rank-badge" style="color:#2ecc71;border-color:#2ecc71">Rank A: <b>${ranks.A || 0}</b></span>
            <span class="pm-rank-badge" style="color:#3498db;border-color:#3498db">Rank B: <b>${ranks.B || 0}</b></span>
            <span class="pm-rank-badge" style="color:#95a5a6;border-color:#95a5a6">Rank C: <b>${ranks.C || 0}</b></span>
            <span class="pm-rank-badge" style="color:#7f8c8d;border-color:#7f8c8d">Rank D: <b>${ranks.D || 0}</b></span>
          </div>

          <div class="pm-backup-box">
            <div style="font-size:12px;font-weight:700;color:var(--gold2)">💾 SAO LƯU TIẾN TRÌNH &amp; DỮ LIỆU TÀI KHOẢN</div>
            <div class="pm-backup-btns">
              <button id="pm-btn-export" type="button" style="font-size:12px;padding:6px 12px">📋 Xuất Mã Sao Lưu</button>
              <button id="pm-btn-import" type="button" style="font-size:12px;padding:6px 12px">📥 Nhập Mã Sao Lưu</button>
              <button id="pm-btn-reset-prof" type="button" style="font-size:12px;padding:6px 12px;border-color:#e74c3c;color:#e74c3c">⚠️ Đặt Lại Nick</button>
            </div>
          </div>

          <div class="mbtns" style="margin-top:16px">
            <button id="pm-btn-close" class="primary" type="button" style="min-width:140px">✕ Đóng</button>
          </div>
        </div>
      `, true);

      // Event: Lưu tên
      const nameInput = $('pm-name-input');
      const saveNameBtn = $('pm-save-name');
      const doSaveName = () => {
        if (!nameInput) return;
        const val = nameInput.value.trim();
        if (!val) { toast('⚠️ Tên không được để trống!'); return; }
        const saved = P.setName(val);
        toast('✅ Đã đổi tên thành công: ' + saved + '!');
        UI.buildMenu();
        renderProfileModal();
      };
      if (saveNameBtn) saveNameBtn.onclick = doSaveName;
      if (nameInput) {
        nameInput.onkeydown = e => { if (e.key === 'Enter') doSaveName(); };
      }

      // Event: Chọn avatar
      document.querySelectorAll('.pm-avatar-opt').forEach(btn => {
        btn.onclick = () => {
          const av = btn.dataset.av;
          P.setAvatar(av);
          toast('✅ Đã đổi Avatar: ' + av);
          UI.buildMenu();
          renderProfileModal();
        };
      });

      // Event: Export backup
      const btnExport = $('pm-btn-export');
      if (btnExport) {
        btnExport.onclick = () => {
          const json = P.exportSaveData();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).then(() => {
              toast('📋 Đã sao chép mã sao lưu vào Clipboard!');
            }).catch(() => {
              prompt('Sao chép mã sao lưu dưới đây:', json);
            });
          } else {
            prompt('Sao chép mã sao lưu dưới đây:', json);
          }
        };
      }

      // Event: Import backup
      const btnImport = $('pm-btn-import');
      if (btnImport) {
        btnImport.onclick = () => {
          const code = prompt('Dán chuỗi mã sao lưu tài khoản vào đây:');
          if (code) {
            const res = P.importSaveData(code);
            if (res.ok) {
              toast('✅ Khôi phục tài khoản thành công!');
              UI.buildMenu();
              renderProfileModal();
            } else {
              toast('❌ ' + (res.msg || 'Mã sao lưu không hợp lệ!'));
            }
          }
        };
      }

      // Event: Reset Nick
      const btnReset = $('pm-btn-reset-prof');
      if (btnReset) {
        btnReset.onclick = () => {
          if (confirm('⚠️ Bạn có chắc muốn đặt lại tài khoản? Toàn bộ Star Chips, Rương và Chiến tích sẽ về mặc định ban đầu!')) {
            P.resetProfile();
            toast('🔄 Đã khởi tạo lại tài khoản mặc định!');
            UI.buildMenu();
            renderProfileModal();
          }
        };
      }

      // Event: Close
      const btnClose = $('pm-btn-close');
      if (btnClose) {
        btnClose.onclick = () => {
          closeModal();
          UI.buildMenu();
        };
      }
    }

    renderProfileModal();
  }

  /* ---------------- Public API ---------------- */
  UI._gameMode = 'ai';
  UI.setGameMode = function (mode) {
    UI._gameMode = mode;
    const isAi = mode === 'ai';
    const isOnline = mode === 'online';
    const is2P = mode === '2p';

    const tabAi = $('tab-mode-ai');
    const tabOnline = $('tab-mode-online');
    const tab2p = $('tab-mode-2p');
    if (tabAi) tabAi.classList.toggle('active', isAi);
    if (tabOnline) tabOnline.classList.toggle('active', isOnline);
    if (tab2p) tab2p.classList.toggle('active', is2P);

    const secAi = $('sec-ai-wrap');
    const secOnline = $('sec-online-wrap');
    const sec2p = $('sec-2p-wrap');
    if (secAi) secAi.classList.toggle('hidden', !isAi);
    if (secOnline) secOnline.classList.toggle('hidden', !isOnline);
    if (sec2p) sec2p.classList.toggle('hidden', !is2P);
  };

  UI.startDuel = function (c) {
    cfg = c;
    session += 1;
    mode = 'idle'; selHand = -1; selField = -1; pending = {}; previewSel = null;
    bannerKey = '';
    const is2P = !!c.is2P;

    // P0 deck (P1)
    let p0deckList;
    if (c.deckId === 'custom' || !c.deckId) {
      p0deckList = FM.player ? FM.player.getDeck() : FM.decks.DECKS.flameSwordsman.list;
    } else {
      const d = FM.decks.DECKS[c.deckId];
      p0deckList = d ? d.list : FM.decks.DECKS.flameSwordsman.list;
    }
    const p0deckExpanded = Array.isArray(p0deckList) && p0deckList.length === 40 && typeof p0deckList[0] === 'object' && p0deckList[0].kind
      ? p0deckList
      : FM.decks.expandDeck(p0deckList);

    if (p0deckExpanded.length !== 40) {
      toast('❌ Bộ bài của ' + (is2P ? 'Người chơi 1 (P1)' : 'bạn') + ' chưa đủ 40 lá! Hãy vào Xếp Bài để kiểm tra.');
      UI.showDeckEditor();
      return;
    }

    // P1 deck (P2 hoặc AI)
    let p1deckExpanded;
    let duelist = null;
    if (is2P) {
      let p1deckList;
      if (c.p1deckId === 'custom') {
        p1deckList = FM.player ? FM.player.getDeck() : FM.decks.DECKS.dragonMaster.list;
      } else {
        const d = FM.decks.DECKS[c.p1deckId || 'dragonMaster'];
        p1deckList = d ? d.list : FM.decks.DECKS.dragonMaster.list;
      }
      p1deckExpanded = Array.isArray(p1deckList) && p1deckList.length === 40 && typeof p1deckList[0] === 'object' && p1deckList[0].kind
        ? p1deckList
        : FM.decks.expandDeck(p1deckList);
      if (p1deckExpanded.length !== 40) {
        toast('❌ Bộ bài của Người chơi 2 (P2) chưa đủ 40 lá!');
        return;
      }
    } else {
      duelist = c.duelist || FM.decks.DUELISTS[0];
      p1deckExpanded = duelist.deck;
    }

    const playerName = (FM.player && FM.player.getName()) || 'Bạn';
    S = E.newDuel({
      p0name: is2P ? 'Người chơi 1 (P1)' : playerName,
      p1name: is2P ? 'Người chơi 2 (P2)' : duelist.name,
      p0deck: p0deckExpanded,
      p1deck: p1deckExpanded,
      difficulty: c.difficulty,
      is2P: is2P,
    });

    // Môi trường đấu trường theo đối thủ + reset thời tiết
    if (FM.fx && FM.fx.boot) {
      FM.fx.boot();
      FM.fx.setArena(is2P ? 'temple' : (ARENA_BY_DUELIST[duelist.id] || 'temple'));
      FM.fx.setWeather(null);
    }
    $('menu').classList.add('hidden');
    $('battle').classList.remove('hidden');
    renderAll();
    toast(is2P ? '⚔ TRẬN ĐẤU 2 NGƯỜI (PvP) BẮT ĐẦU — P1 đi trước!' : '⚔ Đấu với ' + duelist.name + ' — lượt của bạn trước!');
  };

  const ARENA_BY_DUELIST = {
    simon: 'temple', tea: 'meadow', priest: 'shrine', kepura: 'abyss', wizard: 'tower',
    seto1: 'volcano', martis: 'sky', necro: 'graveyard', darknite: 'shadowrealm',
  };

  UI.showMenu = function () {
    session += 1;
    aiRunning = false; S = null;
    UI.isOnline = false;
    UI.myPlayerIndex = 0;
    const rbar = $('online-reaction-bar');
    if (rbar) rbar.classList.add('hidden');
    $('battle').classList.add('hidden');
    $('menu').classList.remove('hidden');
    UI.buildMenu();
  };

  UI.getProgress = function () {
    try { return JSON.parse(localStorage.getItem('fm_unlock_v1') || '[]'); } catch (e) { return []; }
  };

  function renderDeckListTo(containerId, currentSel, onSelect) {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = '';
    const playerDeck = FM.player ? FM.player.getDeck() : [];

    // Custom Deck card
    const customCard = document.createElement('div');
    const isCustomSel = (currentSel === 'custom' || !currentSel);
    customCard.className = 'deck-card' + (isCustomSel ? ' sel' : '');
    customCard.innerHTML = `
      <div class="dk">🎴 Bộ Bài Của Bạn (Custom Deck)</div>
      <div class="dd">${playerDeck.length}/40 lá · Tự build từ Rương bài</div>
    `;
    customCard.onclick = () => {
      onSelect('custom');
      el.querySelectorAll('.deck-card').forEach(x => x.classList.remove('sel'));
      customCard.classList.add('sel');
      sfx.select();
    };
    el.appendChild(customCard);

    // Starter presets
    const deckDescs = {
      flameSwordsman: 'Cân bằng · nhiều cặp fusion (Flame Swordsman, Darkfire Dragon)',
      dragonMaster: 'Rồng · Mountain buff, Blue-Eyes & Red-Eyes, B. Skull Dragon',
      shadowLegion: 'Fiend/Zombie · Yami + Dark Energy, Summoned Skull',
      stormMachine: 'Thunder/Machine · Twin-Headed Thunder Dragon',
    };
    Object.entries(FM.decks.DECKS).forEach(([id, d]) => {
      const c = document.createElement('div');
      c.className = 'deck-card' + (currentSel === id ? ' sel' : '');
      c.innerHTML = `<div class="dk">${d.name}</div><div class="dd">${deckDescs[id] || ''}</div>`;
      c.onclick = () => {
        onSelect(id);
        el.querySelectorAll('.deck-card').forEach(x => x.classList.remove('sel'));
        c.classList.add('sel');
        sfx.select();
      };
      el.appendChild(c);
    });
  }

  UI.buildMenu = function () {
    const prog = UI.getProgress();
    // Cập nhật Profile Bar ở màn hình chính
    const starValEl = $('player-star-count');
    if (starValEl && FM.player) starValEl.textContent = FM.player.getStars();
    const avEl = $('player-avatar-display');
    if (avEl && FM.player) avEl.textContent = FM.player.getAvatar();
    const nameEl = $('player-name-display');
    if (nameEl && FM.player) nameEl.textContent = FM.player.getName();
    const titleEl = $('player-title-display');
    if (titleEl && FM.player) titleEl.textContent = FM.player.getTitle();

    // duelists
    const dl = $('duelist-list');
    if (dl) {
      dl.innerHTML = '';
      if (!UI._selDuelist) UI._selDuelist = FM.decks.DUELISTS[0];
      FM.decks.DUELISTS.forEach((d, i) => {
        const el = document.createElement('div');
        const defeated = prog.includes(d.id);
        // Sửa logic mở khóa: 4 đối thủ đầu mặc định mở, hoặc đã thắng đối thủ này, hoặc đã thắng đối thủ liền trước!
        const unlocked = (i <= 3) || prog.includes(d.id) || (i > 0 && prog.includes(FM.decks.DUELISTS[i - 1].id)) || (i <= prog.length);
        const isSel = UI._selDuelist.id === d.id;
        el.className = 'duelist-card' + (isSel ? ' sel' : '') + (unlocked ? '' : ' locked');
        el.innerHTML = `<div class="dp">${unlocked ? d.portrait : '🔒'}</div><div class="dn">${d.name}</div><div class="dd">${'⭐'.repeat(Math.min(5, d.diff + 1))}${defeated ? '<br><span style="color:#27ae60;font-weight:700">✅ Đã hạ</span>' : ''}</div>`;
        if (unlocked) el.onclick = () => {
          UI._selDuelist = d;
          document.querySelectorAll('.duelist-card').forEach(x => x.classList.remove('sel'));
          el.classList.add('sel');
          sfx.select();
        };
        dl.appendChild(el);
      });
      if (!UI._selDuelist) UI._selDuelist = FM.decks.DUELISTS[0];
    }

    // AI deck list
    if (!UI._selDeck) UI._selDeck = 'custom';
    renderDeckListTo('deck-list', UI._selDeck, id => { UI._selDeck = id; });

    // Online deck list
    if (!UI._selDeckOnline) UI._selDeckOnline = 'custom';
    renderDeckListTo('deck-list-online', UI._selDeckOnline, id => { UI._selDeckOnline = id; });

    // 2P (Hotseat) deck lists
    if (!UI._selDeckP1) UI._selDeckP1 = 'custom';
    if (!UI._selDeckP2) UI._selDeckP2 = 'dragonMaster';
    renderDeckListTo('deck-list-p1', UI._selDeckP1, id => { UI._selDeckP1 = id; });
    renderDeckListTo('deck-list-p2', UI._selDeckP2, id => { UI._selDeckP2 = id; });

    // difficulty
    const diffs = ['Dễ 😴', 'Thường 🙂', 'Khá 😏', 'Giỏi 😠', 'Ác mã 😈'];
    const dfl = $('diff-list');
    if (dfl) {
      dfl.innerHTML = '';
      diffs.forEach((t, i) => {
        const b = document.createElement('button');
        b.textContent = t;
        if ((UI._selDiff == null ? 1 : UI._selDiff) === i) b.classList.add('sel');
        b.onclick = () => { UI._selDiff = i; document.querySelectorAll('.diff-list button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sfx.select(); };
        dfl.appendChild(b);
      });
    }

    const progEl = $('menu-progress');
    if (progEl) {
      progEl.textContent = `Tiến độ: đã hạ ${prog.length}/${FM.decks.DUELISTS.length} đối thủ · Lưu tự động trên máy này.`;
    }
  };

  UI.getSelectedConfig = function () {
    const is2P = UI._gameMode === '2p';
    return {
      is2P,
      duelist: UI._selDuelist,
      deckId: is2P ? (UI._selDeckP1 || 'custom') : UI._selDeck,
      p1deckId: UI._selDeckP2 || 'dragonMaster',
      difficulty: UI._selDiff == null ? 1 : UI._selDiff,
      campaign: !is2P,
    };
  };

  UI.getOnlineDeck = function () {
    const deckId = UI._selDeckOnline || 'custom';
    if (deckId === 'custom') {
      return FM.player ? FM.player.getDeck() : FM.decks.DECKS.flameSwordsman.list;
    }
    const d = FM.decks.DECKS[deckId];
    return d ? d.list : FM.decks.DECKS.flameSwordsman.list;
  };

  UI.startOnlineDuelAsHost = function (p0deckList, p1deckList, p1name) {
    session += 1;
    mode = 'idle'; selHand = -1; selField = -1; pending = {}; previewSel = null;
    bannerKey = '';
    UI.isOnline = true;
    UI.myPlayerIndex = 0;

    const p0deckExpanded = FM.decks.expandDeck(p0deckList);
    const p1deckExpanded = FM.decks.expandDeck(p1deckList);

    S = E.newDuel({
      p0name: 'Bạn (P1)',
      p1name: p1name || 'Đối thủ (P2)',
      p0deck: p0deckExpanded,
      p1deck: p1deckExpanded,
      is2P: true,
      p1isAI: false,
    });

    if (FM.fx && FM.fx.boot) {
      FM.fx.boot();
      FM.fx.setArena('temple');
      FM.fx.setWeather(null);
    }

    // Gửi START_DUEL kèm state ban đầu cho Guest
    FM.net.sendStartDuel({
      state: S,
      hostName: 'Đối thủ (P1)',
      guestName: 'Bạn (P2)',
    });

    $('menu').classList.add('hidden');
    $('battle').classList.remove('hidden');
    const rbar = $('online-reaction-bar');
    if (rbar) rbar.classList.remove('hidden');
    renderAll();
    toast('⚔ TRẬN ĐẤU ONLINE BẮT ĐẦU — Lượt của bạn trước!');
  };

  UI.startOnlineDuelAsGuest = function (payload) {
    session += 1;
    mode = 'idle'; selHand = -1; selField = -1; pending = {}; previewSel = null;
    bannerKey = '';
    UI.isOnline = true;
    UI.myPlayerIndex = 1; // Khách luôn là P2
    S = payload.state;

    if (FM.fx && FM.fx.boot) {
      FM.fx.boot();
      FM.fx.setArena('temple');
      FM.fx.setWeather(null);
    }

    $('menu').classList.add('hidden');
    $('battle').classList.remove('hidden');
    const rbar = $('online-reaction-bar');
    if (rbar) rbar.classList.remove('hidden');
    renderAll();
    toast('⚔ TRẬN ĐẤU ONLINE BẮT ĐẦU — Đang chờ P1 đi trước!');
  };

  UI.onRemoteAction = function (action) {
    if (!S || S.winner != null || S.active !== 1) return;
    const r = E.perform(S, action);
    const fxEvents = E.drainFx(S);
    FM.net.syncState(S, fxEvents);
    startFxThenDirect(fxEvents).then(() => {
      renderAll();
      maybeGameOver();
    });
  };

  UI.onRemoteSync = function (payload) {
    if (!payload || !payload.state) return;
    S = payload.state;
    startFxThenDirect(payload.fx || []).then(() => {
      renderAll();
      maybeGameOver();
    });
  };

  UI.showFloatingEmoji = function (emoji, isMe) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    const anchor = $(isMe ? 'player-portrait' : 'enemy-portrait') || document.body;
    const rect = anchor.getBoundingClientRect();
    el.style.left = (rect.left + rect.width / 2) + 'px';
    el.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(el);
    sfx.select();
    setTimeout(() => el.remove(), 2100);
  };

  UI.showHelp = showHelp;
  UI.showFusionTable = showFusionTable;
  UI.showProfile = showProfile;
  UI.showDeckEditor = showDeckEditor;
  UI.showCardShop = showCardShop;
  UI.toggleMute = function () { muted = !muted; return muted; };
  UI.closeModal = closeModal;
  UI.openSidebarMobile = openSidebarMobile;
  UI.closeSidebarMobile = closeSidebarMobile;
  UI.handlePhaseAction = function (kind) {
    if (!S || S.winner != null || !isCurrentHuman()) return;
    if (kind === 'battle' && S.phase === 'MAIN') {
      dispatchAction({ type: 'BATTLE_PHASE' });
    } else if (kind === 'endturn' && S.phase === 'MAIN') {
      doEndTurn();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
