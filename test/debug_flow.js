/* Debug script: xem flow AI vs AI */
'use strict';
require('../js/cards_full.js'); require('../js/cards.js'); require('../js/engine.js'); require('../js/ai.js');
const FM = globalThis.FM, E = FM.engine, AI = FM.ai, C = FM.cards;
const all = Object.values(FM.decks.DECKS);
const s = E.newDuel({ p0name: 'A', p1name: 'B', p0deck: all[0].list, p1deck: all[1].list, difficulty: 2 });
let guard = 0;
const acts = [];
while (s.winner == null && s.turnNo <= 30 && guard++ < 300) {
  const act = AI.aiNextAction(s, s.active);
  if (!act) { acts.push('NULL'); E.endTurn(s); continue; }
  const r = E.perform(s, act);
  acts.push((s.active === 0 ? 'A:' : 'B:') + act.type + (act.slotIdx !== undefined ? '#' + act.slotIdx : '') + (r.ok ? '' : '!BAD'));
}
for (const p of s.players) {
  const field = p.field.map(sl => sl ? (sl.kind === 'TRAP' ? 'TRAP' : (sl.faceDown ? '[FD]' : (sl.pos === 'ATK' ? 'ATK:' : 'DEF:') + E.mdata(sl.card).name + ' ' + E.effAtk(s, s.players.indexOf(p), sl))) : '.').join(' | ');
  console.log(p.name, 'LP', p.lp, 'field:', field);
  console.log('  hand:', p.hand.map(c => c.kind === 'MONSTER' ? E.mdata(c).name : (c.kind === 'MAGIC' ? C.magics[c.mid].name : C.traps[c.tid].name)).join(', '));
}
console.log('\nactions:\n' + acts.join(' , '));
console.log('\nLP after:', s.players.map(p => p.lp).join('/'), 'deck:', s.players.map(p => p.deck.length).join('/'), 'graves:', s.players.map(p => p.graveyard.length).join('/'));
