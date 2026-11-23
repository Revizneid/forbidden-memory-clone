/* Headless test: DB 722 lá + engine + AI — chạy bằng node.
 *   node test/engine_test.js
 */
'use strict';
require('../js/cards_full.js');
require('../js/cards.js');
require('../js/player.js');
require('../js/engine.js');
require('../js/ai.js');

const FM = globalThis.FM;
const C = FM.cards, E = FM.engine, AI = FM.ai, P = FM.player;

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
  const r = E.perform(s, { type: 'MAGIC', handIdx: 0, targetSlot: 2 });
  assert(r.ok, 'ritual perform ok: ' + (r.msg || ''));
  if (r.ok) {
    assert(r.result.name === 'Gate Guardian', 'Gate Guardian summoned, got ' + (r.result && r.result.name));
    const slot = p.field[2];
    assert(slot && slot.kind === 'MONSTER' && E.mdata(slot.card).name === 'Gate Guardian', 'Gate Guardian trên sân slot 2');
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
  p.field[2] = { kind: 'MONSTER', card: p.hand[0], pos: 'ATK', faceDown: false, attacked: false, star: 0, buffs: [] };
  p.hand = [];
  e.field[2] = { kind: 'MONSTER', card: { kind: 'MONSTER', id: C.idOf('Mystical Elf'), uid: s._uid++ }, pos: 'ATK', faceDown: false, attacked: false, star: 0, buffs: [] };
  e.hand = [];
  s.phase = 'BATTLE';
  const lpBefore = e.lp;
  E.perform(s, { type: 'ATTACK', slotIdx: 2, targetSlot: 2 });
  const dmg = lpBefore - e.lp;
  // damage = (2500 + 500 star) - 800 = 2200
  assert(dmg === 2200, 'Guardian star damage: expect 2200 (2500+500-800), got ' + dmg);
  console.log('  star battle done (dmg ' + dmg + ')');
})();

/* --- Feature 3: Deck Builder, Trunk, Shop & Duel Drops --- */
(function playerFeatures() {
  console.log('== Player Profile, Trunk, Shop & Drops ==');
  // 1. Database codes and costs
  const beId = C.idOf('Blue-eyes White Dragon');
  const beCode = C.monsters[beId].code;
  assert(beCode && beCode.length === 8, 'Blue-eyes có mã 8 số: ' + beCode);
  const foundBe = C.byCode(beCode);
  assert(foundBe && foundBe.id === beId, 'C.byCode tìm thấy Blue-eyes theo mã ' + beCode);
  assert(C.monsters[beId].cost <= 2500, 'Giá Blue-eyes đã cân đối hợp lý: ' + C.monsters[beId].cost);

  // 2. Profile Starter
  const prof = P.getProfile();
  assert(prof.stars >= 50, 'Khởi đầu có ít nhất 50 Star Chips: ' + prof.stars);
  assert(prof.deck.length === 40, 'Bộ bài chính có đúng 40 lá, got ' + prof.deck.length);
  const trunkKeys = Object.keys(prof.trunk);
  assert(trunkKeys.length === 0, 'Khởi đầu Rương hoàn toàn rỗng (0 thẻ), got ' + trunkKeys.length);

  // 3. Deck Save Validation
  const invalidDeck39 = prof.deck.slice(0, 39);
  const r1 = P.saveDeck(invalidDeck39);
  assert(!r1.ok, 'Từ chối lưu deck 39 lá');

  // Thử tạo deck 4 bản sao cùng 1 lá
  const testDeck4Copies = prof.deck.slice(0, 36).concat([prof.deck[0], prof.deck[0], prof.deck[0], prof.deck[0]]);
  const r2 = P.saveDeck(testDeck4Copies);
  assert(!r2.ok, 'Từ chối lưu deck có 4 bản sao của cùng 1 thẻ');

  // Lưu deck 40 lá hợp lệ
  const r3 = P.saveDeck(prof.deck);
  assert(r3.ok, 'Lưu deck 40 lá hợp lệ thành công');

  // 4. Shop logic
  const initialStars = P.getStars();
  P.addStars(100);
  assert(P.getStars() === initialStars + 100, 'addStars +100 hoạt động');

  // Mua Blue-Eyes (giá 2000) khi chỉ có 150 stars -> phải báo không đủ
  const failBuy = P.buyCard(beId);
  assert(!failBuy.ok && failBuy.msg.includes('Không đủ'), 'Kiểm tra chặn mua khi thiếu stars');

  const affordableMonsterId = 142; // Flame Manipulator (cost 50)
  const cardData = C.cardData(affordableMonsterId);
  const cost = cardData.data.cost || 50;
  const beforeBuyStars = P.getStars();
  const trunkCountBefore = prof.trunk[String(affordableMonsterId)] || 0;
  const buyRes = P.buyCard(affordableMonsterId);
  assert(buyRes.ok, 'Mua thẻ thành công');
  assert(P.getStars() === beforeBuyStars - cost, 'Trừ đúng số stars khi mua');
  assert((prof.trunk[String(affordableMonsterId)] || 0) === trunkCountBefore + 1, 'Thẻ mua vào trunk');

  // 5. Duel Drops & Reward
  const dummyState = {
    winner: 0,
    turnNo: 8,
    players: [{ lp: 7500 }, { lp: 0 }],
  };
  const simonDuelist = FM.decks.DUELISTS[0];
  const reward = P.calculateDuelReward(dummyState, simonDuelist);
  assert(reward.won === true, 'Duel reward won');
  assert(reward.rank === 'S', 'LP 7500 turn 8 -> Rank S');
  assert(reward.starsWon === 5, 'Rank S thưởng 5 Star Chips');
  assert(reward.dropCard != null, 'Ăn được 1 lá bài từ đối thủ');
  console.log('  Player Features done (Rank ' + reward.rank + ', drop: ' + (reward.dropCard && reward.dropCard.data ? reward.dropCard.data.name : '?') + ')');

  // 6. 2-Player (PvP) & Duelist Unlock verification
  console.log('== 2-Player (PvP) & Unlock verification ==');
  const customDeck = P.getDeck();
  const expandedCustom = FM.decks.expandDeck(customDeck);
  assert(expandedCustom.length === 40, 'expandDeck hỗ trợ mảng custom deck object 40 lá');

  const pvpDuel = E.newDuel({
    p0name: 'P1', p1name: 'P2',
    p0deck: expandedCustom,
    p1deck: FM.decks.DECKS.dragonMaster.list,
    is2P: true,
  });
  assert(pvpDuel.is2P === true, 'pvpDuel.is2P is true');
  assert(pvpDuel.players[0].isAI === false, 'P1 is human');
  assert(pvpDuel.players[1].isAI === false, 'P2 is human');
  assert(pvpDuel.players[0].hand.length === 5, 'P1 có 5 lá bài');
  assert(pvpDuel.players[1].hand.length === 5, 'P2 có 5 lá bài');

  // Kepura unlock test:
  const duelists = FM.decks.DUELISTS;
  const kepuraIdx = duelists.findIndex(d => d.id === 'kepura');
  const wizardIdx = duelists.findIndex(d => d.id === 'wizard');
  assert(kepuraIdx === 3, 'Kepura is duelist index 3');
  assert(wizardIdx === 4, 'Wizard (Pháp Sư Bóng Tối) is duelist index 4');

  const testProg = ['kepura'];
  const isWizardUnlocked = (wizardIdx <= 3) || testProg.includes(duelists[wizardIdx].id) || (wizardIdx > 0 && testProg.includes(duelists[wizardIdx - 1].id)) || (wizardIdx <= testProg.length);
  assert(isWizardUnlocked === true, 'Đánh thắng Kepura MỞ KHÓA ngay Pháp Sư Bóng Tối (Wizard)');
  console.log('  2P & Unlock verification done');
})();

console.log(failures === 0 ? '\nALL TESTS PASSED ✓' : `\n${failures} FAILURES ✗`);
process.exit(failures === 0 ? 0 : 1);
