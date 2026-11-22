/* Headless test: AI vs AI stress test — chạy bằng node.
 *   node test/engine_test.js
 * Kiểm tra: engine không crash, ván đấu kết thúc, LP luôn >= 0, fusion hoạt động. */
'use strict';
require('../js/cards.js');
require('../js/engine.js');
require('../js/ai.js');

const FM = globalThis.FM;
const C = FM.cards, E = FM.engine, AI = FM.ai;

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('  ✗ FAIL: ' + msg); }
}

/* --- Unit-ish checks --- */
(function unit() {
  console.log('== Unit checks ==');
  const flame = C.idOf('Flame Manipulator');
  const masaki = C.idOf('Masaki the Legendary Swordsman');
  const res = C.lookup(flame, masaki);
  assert(res && res.name === 'Flame Swordsman', 'fusion Flame Manipulator + Masaki = Flame Swordsman');
  const pet = C.idOf('Petit Dragon');
  const pet2 = C.idOf('Petit Dragon');
  const r2 = C.lookup(pet, pet2);
  assert(r2 && r2.race === 'Dragon' && r2.atk > 600, 'ladder fusion same race Petit+Petit => stronger dragon, got ' + (r2 && r2.name));
  const ryu = C.idOf('Ryu-Kishin');
  const r3 = C.lookup(pet, ryu);
  assert(r3 && r3.name === 'Blackland Fire Dragon', 'Petit Dragon + Ryu-Kishin = Blackland Fire Dragon, got ' + (r3 && r3.name));
  const sq = C.idOf('Saggi the Dark Clown');
  const r4 = C.lookup(flame, sq);
  assert(r4 === null, 'khác race không có recipe => không fusion');
  const deckNames = new Set();
  for (const d of Object.values(FM.decks.DECKS)) deckNames.add(d.name);
  assert(deckNames.size >= 4, 'có >= 4 deck người chơi');
  assert(FM.decks.DUELISTS.length >= 9, 'có >= 9 đối thủ máy, got ' + FM.decks.DUELISTS.length);
  for (const d of Object.values(FM.decks.DECKS)) {
    assert(d.list.length >= 25, 'deck ' + d.name + ' đủ loại bài');
  }
  console.log('  unit done');
})();

/* --- Simulation: AI vs AI --- */
function simGame(deckA, deckB, diffA, diffB, maxTurns = 120) {
  const s = E.newDuel({
    p0name: 'A', p1name: 'B',
    p0deck: deckA.list, p1deck: deckB.list,
    difficulty: diffB,
  });
  // cho cả 2 dùng AI (đánhMech qua perform với active player)
  let guard = 0;
  while (s.winner == null && guard++ < 4000) {
    const pIdx = s.active;
    const act = AI.aiNextAction(s, pIdx);
    if (!act) { E.endTurn(s); continue; }
    const r = E.perform(s, act);
    assert(r && r.ok !== undefined, 'perform returns result');
    if (!r.ok) {
      // action không hợp lệ — AI bế tắc? end turn để tránh treo
      E.endTurn(s);
    }
    // kiểm bất biến
    for (const p of s.players) {
      assert(p.lp >= 0, 'LP >= 0');
      assert(p.hand.length <= 5, 'hand <= 5');
      assert(p.field.length === 9, 'field 9');
    }
    if (s.turnNo > maxTurns) {
      // quá dài: tuyên bố hòa bằng LP
      const w = s.players[0].lp >= s.players[1].lp ? 0 : 1;
      s.winner = w; s.phase = 'GAMEOVER';
      return { s, timeout: true };
    }
  }
  return { s, timeout: false };
}

(function sims() {
  console.log('== Simulation: AI vs AI ==');
  const decks = Object.values(FM.decks.DECKS);
  const duelistDecks = FM.decks.DUELISTS.map(d => ({ name: d.id, list: d.deck }));
  const all = decks.concat(duelistDecks);
  let wins = [0, 0], timeouts = 0, games = 0, totalTurns = 0, maxTurns = 0;
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    const A = all[i % all.length], B = all[(i * 7 + 3) % all.length];
    const diffA = i % 5, diffB = (i + 2) % 5;
    const { s, timeout } = simGame(A, B, diffA, diffB);
    games++;
    totalTurns += s.turnNo;
    maxTurns = Math.max(maxTurns, s.turnNo);
    if (timeout) timeouts++;
    else if (s.winner === 0 || s.winner === 1) wins[s.winner]++;
    for (const p of s.players) {
      assert(p.lp >= 0, 'final LP >= 0');
      for (const sl of p.field) {
        if (sl && sl.kind === 'MONSTER') {
          const a = E.effAtk(s, s.players.indexOf(p), sl);
          assert(a >= 0, 'atk >= 0');
        }
      }
    }
    assert(s.phase === 'GAMEOVER', 'game over');
    assert(s.log.length > 5, 'log có nội dung');
  }
  console.log(`  ${games} games, avg ${Math.round(totalTurns / games)} turns, max ${maxTurns} turns, timeout ${timeouts}, wins A/B = ${wins[0]}/${wins[1]}, ${Date.now() - t0}ms`);
  assert(timeouts < games * 0.05, 'ít ván timeout (<5%)');
  assert(wins[0] + wins[1] + timeouts === games, 'mọi ván đều kết thúc có kết quả');
})();

/* --- Fusion smoke test trong duel (deterministic) --- */
(function fusionSmoke() {
  console.log('== Fusion in-duelist smoke ==');
  const list = [['Flame Manipulator', 3], ['Masaki the Legendary Swordsman', 3], ['Kojikocy', 4], ['#dianKeto', 10]];
  const s = E.newDuel({ p0name: 'F', p1name: 'X', p0deck: list, p1deck: list, difficulty: 1 });
  // Đặt thẳng 2 nguyên liệu vào tay p0 (loại trừ yếu tố shuffle)
  const p0 = s.players[0];
  p0.hand = [];
  const fmId = C.idOf('Flame Manipulator'), msId = C.idOf('Masaki the Legendary Swordsman');
  p0.hand.push({ kind: 'MONSTER', id: fmId, uid: s._uid++ });
  p0.hand.push({ kind: 'MONSTER', id: msId, uid: s._uid++ });
  p0.hand.push({ kind: 'MAGIC', mid: 'dianKeto', uid: s._uid++ });
  const r = E.perform(s, { type: 'FUSION', a: { src: 'HAND', idx: 0 }, b: { src: 'HAND', idx: 1 }, targetSlot: 6 });
  assert(r.ok, 'fusion perform ok: ' + (r.msg || ''));
  assert(r.result && r.result.name === 'Flame Swordsman', 'kết quả là Flame Swordsman');
  const slot = p0.field[6];
  assert(slot && slot.kind === 'MONSTER' && E.mdata(slot.card).name === 'Flame Swordsman', 'Flame Swordsman ở slot 6');
  assert(p0.hand.length === 1, 'tay còn 1 bài sau fusion, got ' + p0.hand.length);
  assert(p0.graveyard.length === 2, '2 nguyên liệu vào mộ, got ' + p0.graveyard.length);
  // Field fusion: summon Kojikocy rồi fusion với Flame... không còn Flame — dùng slot 6 + dianKeto? Magic không fusion.
  // Thay vào đó: test field fusion bằng cặp cùng race từ tay còn lại? Tay chỉ còn DianKeto — kiểm tra refusal:
  const bad = E.perform(s, { type: 'FUSION', a: { src: 'FIELD', idx: 6 }, b: { src: 'HAND', idx: 0 }, targetSlot: 6 });
  assert(!bad.ok, 'magic không fusion được với quái');
  console.log('  fusion smoke done');
})();

console.log(failures === 0 ? '\nALL TESTS PASSED ✓' : `\n${failures} FAILURES ✗`);
process.exit(failures === 0 ? 0 : 1);
