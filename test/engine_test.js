/* Headless test: DB 722 lá + engine + AI — chạy bằng node.
 *   node test/engine_test.js
 */
'use strict';
require('../js/cards_full.js');
require('../js/cards.js');
require('../js/engine.js');
require('../js/ai.js');

const FM = globalThis.FM;
const C = FM.cards, E = FM.engine, AI = FM.ai;

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('  ✗ FAIL: ' + msg); }
}

/* --- DB checks --- */
(function unit() {
  console.log('== DB checks ==');
  assert(C.total === 722, 'Tổng thẻ = 722, got ' + C.total);
  assert(C.monsterCount === 621, '621 quái, got ' + C.monsterCount);
  const be = C.idOf('Blue-eyes White Dragon');
  assert(be != null, 'Blue-eyes tồn tại');
  const beM = C.monsters[be];
  assert(beM.atk === 3000 && beM.def === 2500, 'Blue-eyes 3000/2500, got ' + beM.atk + '/' + beM.def);
  assert(beM.race === 'Dragon', 'Blue-eyes là Dragon');
  assert(Array.isArray(beM.stars) && beM.stars.length === 2, 'Blue-eyes có 2 guardian stars');
  const dm = C.idOf('Dark Magician');
  assert(C.monsters[dm].stars[0] === 'Sun' || C.monsters[dm].stars[1] === 'Sun', 'Dark Magician có Sun star');
  // Fusion thật
  const fm = C.idOf('Flame Manipulator'), ms = C.idOf('Masaki the Legendary Swordsman');
  const r = C.lookup(fm, ms);
  assert(r && r.name === 'Flame Swordsman', 'FM fusion: Flame Manipulator + Masaki = Flame Swordsman, got ' + (r && r.name));
  // Guardian star chart
  assert(C.starBeats('Sun', 'Moon'), 'Sun > Moon');
  assert(C.starBeats('Mars', 'Jupiter'), 'Mars > Jupiter');
  assert(C.starBeats('Neptune', 'Mars'), 'Neptune > Mars');
  assert(!C.starBeats('Moon', 'Sun'), 'Moon KHÔNG beats Sun');
  // Magic/trap/ritual/equip counts
  const magics = Object.values(C.magics);
  assert(magics.filter(m => m.kind === 'equip').length === 34, '34 equip, got ' + magics.filter(m => m.kind === 'equip').length);
  assert(Object.keys(C.rituals).length === 24, '24 ritual, got ' + Object.keys(C.rituals).length);
  assert(Object.keys(C.traps).length === 10, '10 trap, got ' + Object.keys(C.traps).length);
  // Fusion table lớn
  assert(Object.keys(C.fusions).length > 20000, 'Fusion table > 20000 entries, got ' + Object.keys(C.fusions).length);
  console.log('  DB done');
})();

/* --- Simulation: AI vs AI --- */
function simGame(deckA, deckB, diffA, diffB, maxTurns = 120) {
  const s = E.newDuel({
    p0name: 'A', p1name: 'B',
    p0deck: deckA.list, p1deck: deckB.list,
    difficulty: diffB,
  });
  let guard = 0;
  while (s.winner == null && guard++ < 5000) {
    const pIdx = s.active;
    const act = AI.aiNextAction(s, pIdx);
    if (!act) { E.endTurn(s); continue; }
    const r = E.perform(s, act);
    if (!r.ok) E.endTurn(s);
    for (const p of s.players) {
      assert(p.lp >= 0, 'LP >= 0');
      assert(p.hand.length <= 5, 'hand <= 5');
    }
    if (s.turnNo > maxTurns) {
      const w = s.players[0].lp >= s.players[1].lp ? 0 : 1;
      s.winner = w; s.phase = 'GAMEOVER';
      return { s, timeout: true };
    }
  }
  return { s, timeout: false };
}

(function sims() {
  console.log('== Simulation: AI vs AI (722-card DB) ==');
  const decks = Object.values(FM.decks.DECKS);
  const duelistDecks = FM.decks.DUELISTS.map(d => ({ name: d.id, list: d.deck }));
  const all = decks.concat(duelistDecks);
  let wins = [0, 0], timeouts = 0, games = 0, totalTurns = 0, maxTurns = 0;
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    const A = all[i % all.length], B = all[(i * 7 + 3) % all.length];
    const { s, timeout } = simGame(A, B, i % 5, (i + 2) % 5);
    games++;
    totalTurns += s.turnNo;
    maxTurns = Math.max(maxTurns, s.turnNo);
    if (timeout) timeouts++;
    else if (s.winner === 0 || s.winner === 1) wins[s.winner]++;
    assert(s.phase === 'GAMEOVER', 'game over');
    assert(s.log.length > 5, 'log có nội dung');
  }
  console.log(`  ${games} games, avg ${Math.round(totalTurns / games)} turns, max ${maxTurns}, timeout ${timeouts}, wins A/B = ${wins[0]}/${wins[1]}, ${Date.now() - t0}ms`);
  assert(timeouts < games * 0.05, 'ít ván timeout (<5%)');
  assert(wins[0] + wins[1] + timeouts === games, 'mọi ván đều kết thúc');
})();

/* --- Ritual smoke test --- */
(function ritualSmoke() {
  console.log('== Ritual smoke ==');
  // Gate Guardian Ritual: offerings 371,372,373 (Sanga/Kazejin/Suijin) -> result 374 Gate Guardian
  const list = [['Sanga of the Thunder', 2], ['Kazejin', 2], ['Suijin', 2], ['La Jinn the Mystical Genie', 4], ['#fm667', 4], ['#fm342', 8]];
  const s = E.newDuel({ p0name: 'R', p1name: 'X', p0deck: list, p1deck: list, difficulty: 0 });
  const p = s.players[0];
  p.hand = []; // dọn tay
  const ritual = { kind: 'MAGIC', mid: 'fm667', uid: s._uid++ };
  p.hand.push(ritual);
  p.hand.push({ kind: 'MONSTER', id: C.idOf('Sanga of the Thunder'), uid: s._uid++ });
  p.hand.push({ kind: 'MONSTER', id: C.idOf('Kazejin'), uid: s._uid++ });
  p.hand.push({ kind: 'MONSTER', id: C.idOf('Suijin'), uid: s._uid++ });
  const r = E.perform(s, { type: 'MAGIC', handIdx: 0, targetSlot: 6 });
  assert(r.ok, 'ritual perform ok: ' + (r.msg || ''));
  if (r.ok) {
    assert(r.result.name === 'Gate Guardian', 'Gate Guardian summoned, got ' + (r.result && r.result.name));
    const slot = p.field[6];
    assert(slot && slot.kind === 'MONSTER' && E.mdata(slot.card).name === 'Gate Guardian', 'Gate Guardian trên sân slot 6');
    assert(p.hand.length === 0, 'hand rỗng sau ritual (3 nguyên liệu + ritual consumed), got ' + p.hand.length);
    assert(p.graveyard.length >= 4, 'nguyên liệu + ritual vào mộ');
  }
  console.log('  ritual done');
})();

/* --- Guardian star battle test --- */
(function starBattle() {
  console.log('== Guardian star battle ==');
  const list = [['Dark Magician', 3], ['Mystical Elf', 3], ['#fm336', 5], ['#fm342', 9]];
  const s = E.newDuel({ p0name: 'S', p1name: 'X', p0deck: list, p1deck: list, difficulty: 0 });
  const p = s.players[0], e = s.players[1];
  // DM (2500 ATK, Sun star) vs Mystical Elf (800 ATK, Moon star): Sun > Moon -> attacker +500
  p.hand = [{ kind: 'MONSTER', id: C.idOf('Dark Magician'), uid: s._uid++ }];
  e.hand = [{ kind: 'MONSTER', id: C.idOf('Mystical Elf'), uid: s._uid++ }];
  p.field[6] = { kind: 'MONSTER', card: p.hand[0], pos: 'ATK', faceDown: false, attacked: false, star: 0, buffs: [] };
  p.hand = [];
  e.field[6] = { kind: 'MONSTER', card: { kind: 'MONSTER', id: C.idOf('Mystical Elf'), uid: s._uid++ }, pos: 'ATK', faceDown: false, attacked: false, star: 0, buffs: [] };
  e.hand = [];
  s.phase = 'BATTLE';
  const lpBefore = e.lp;
  E.perform(s, { type: 'ATTACK', slotIdx: 6 });
  const dmg = lpBefore - e.lp;
  // damage = (2500 + 500 star) - 800 = 2200
  assert(dmg === 2200, 'Guardian star damage: expect 2200 (2500+500-800), got ' + dmg);
  console.log('  star battle done (dmg ' + dmg + ')');
})();

console.log(failures === 0 ? '\nALL TESTS PASSED ✓' : `\n${failures} FAILURES ✗`);
process.exit(failures === 0 ? 0 : 1);
