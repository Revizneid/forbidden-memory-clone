/* Build script: chuyển data FM gốc (cards_v.json + fusions + equips) -> js/cards_full.js
 * Chạy: node scripts/build_cards.js
 * Nguồn dữ liệu: github.com/falsepopsky/YGO-FM-Database (GPL-3.0) — credit trong README.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', '..', 'fmdata');
const OUT = path.join(__dirname, '..', 'js', 'cards_full.js');

const cards = require(path.join(DATA, 'cards_v.json'));
const starNames = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Pluto', 'Neptune', 'Mercury', 'Sun', 'Moon', 'Venus'];
const cardTypes = ['Dragon', 'Spellcaster', 'Zombie', 'Warrior', 'Beast-Warrior', 'Beast', 'Winged Beast', 'Fiend', 'Fairy', 'Insect', 'Dinosaur', 'Reptile', 'Fish', 'Sea Serpent', 'Machine', 'Thunder', 'Aqua', 'Pyro', 'Rock', 'Plant', 'Magic', 'Trap', 'Ritual', 'Equip'];
// FM internal attribute id -> TCG attribute (verify: DM=1 DARK, Mystical Elf=0 LIGHT, Man-eater=2 EARTH, Suijin=3 WATER, Flame Manipulator=4 FIRE, Harpie=5 WIND)
const ATTRS = ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND', 'ILLUSION', 'DIVINE'];

/* equipsList[monsterTypeIndex] = [equip card ids compatible]  -> invert */
const equipsSrc = fs.readFileSync(path.join(DATA, 'equips.js'), 'utf8');
const equipsList = new Function(equipsSrc + '; return equipsList;')();
const equipTypes = {}; // equipId -> [race names]
equipsList.forEach((list, typeIdx) => {
  if (!list) return;
  const race = cardTypes[typeIdx];
  if (!race || race === 'Magic' || race === 'Trap' || race === 'Ritual' || race === 'Equip') return;
  for (const eid of list) (equipTypes[eid] = equipTypes[eid] || []).push(race);
});

/* Equip ATK bonus (xấp xỉ theo FM FAQ — compat lấy từ equipsList) */
const EQUIP_BONUS = {
  301: 300, 302: 400, 303: 500, 304: 700, 305: 500, 306: 500, 307: 300, 308: 400, 309: 500,
  310: 300, 311: 500, 312: 300, 313: 300, 314: 400, 315: 500, 316: 300, 317: 300, 318: 300,
  319: 500, 321: 500, 322: 400, 323: 200, 324: 400, 325: 300, 326: 400, 327: 200, 328: 300,
  651: 500, 652: 300, 654: 500, 657: 500, 658: 400, 659: 300, 668: 300,
};

/* Magic effect templates (theo tên FM gốc) */
const MAGIC_FX = {
  320: { kind: 'flipAllEnemyAtk' },                       // Stop Defense: lật úp + ép ATK
  329: { kind: 'dragonsToDef' },                          // Dragon Capture Jar
  336: { kind: 'destroyAll' },                            // Dark Hole
  337: { kind: 'destroyEnemyAll' },                       // Raigeki
  338: { kind: 'heal', amount: 200 },                     // Mooyan Curry
  339: { kind: 'heal', amount: 300 },                     // Red Medicine
  340: { kind: 'heal', amount: 600 },                     // Goblin's Secret Remedy
  341: { kind: 'heal', amount: 800 },                     // Soul of the Pure
  342: { kind: 'heal', amount: 1000 },                    // Dian Keto
  343: { kind: 'damage', amount: 200 },                   // Sparks
  344: { kind: 'damage', amount: 600 },                   // Hinotama
  345: { kind: 'damage', amount: 1200 },                  // Final Flame
  346: { kind: 'damage', amount: 800 },                   // Ookazi
  347: { kind: 'damage', amount: 1000 },                  // Tremendous Fire
  348: { kind: 'flipAllEnemyDef' },                       // Swords of Revealing Light
  349: { kind: 'forceDef', target: 'enemy' },             // Spellbinding Circle
  350: { kind: 'flipAllEnemyDef' },                       // Dark-piercing Light
  653: { kind: 'destroyRace', races: ['Warrior'] },       // Warrior Elimination
  655: { kind: 'clearTraps' },                            // Cursebreaker
  656: { kind: 'destroyRace', races: ['Zombie'] },        // Eternal Rest
  660: { kind: 'destroyRace', races: ['Winged Beast'] },  // Stain Storm
  661: { kind: 'destroyRace', races: ['Fiend'] },         // Crush Card
  662: { kind: 'destroyRace', races: ['Insect'] },        // Eradicating Aerosol
  663: { kind: 'destroyRace', races: ['Rock'] },          // Breath of Light
  664: { kind: 'destroyRace', races: ['Reptile', 'Sea Serpent'] }, // Eternal Draught
  669: { kind: 'forceDef', target: 'enemy' },             // Shadow Spell
  672: { kind: 'clearTraps' },                            // Harpie's Feather Duster
};
const TERRAIN = {
  330: { terrain: ['Beast', 'Insect', 'Plant', 'Beast-Warrior'] },   // Forest
  331: { terrain: ['Dinosaur', 'Zombie', 'Rock'] },                  // Wasteland
  332: { terrain: ['Dragon', 'Thunder', 'Winged Beast'] },           // Mountain
  333: { terrain: ['Warrior', 'Beast-Warrior'] },                    // Sogen
  334: { terrain: ['Aqua', 'Fish', 'Sea Serpent'] },                 // Umi
  335: { terrain: ['Fiend', 'Zombie'] },                             // Yami
};

/* Trap templates (ngưỡng ATK hủy attacker — giá trị FM) */
const TRAP_FX = {
  681: { kind: 'destroyBelow', atk: 500 },   // House of Adhesive Tape
  682: { kind: 'destroyBelow', atk: 500 },   // Eatgaboon
  683: { kind: 'destroyBelow', atk: 1000 },  // Bear Trap
  684: { kind: 'destroyBelow', atk: 1500 },  // Invisible Wire
  685: { kind: 'destroyBelow', atk: 2000 },  // Acid Trap Hole
  686: { kind: 'destroyAttacker' },          // Widespread Ruin
  687: { kind: 'negateDirect' },             // Goblin Fan
  688: { kind: 'simochi' },                  // Bad Reaction to Simochi
  689: { kind: 'stripEquips' },              // Reverse Trap
  690: { kind: 'fake' },                     // Fake Trap
};

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = s => s.replace(/\s+/g, ' ').trim();

/* ---------- monsters (Type 0..19) ---------- */
const monsters = {};
const magic = {};
const traps = {};
const rituals = {};
let monsterCount = 0;
for (const c of cards) {
  const name = clean(c.Name);
  if (c.Type <= 19) {
    monsters[c.Id] = {
      id: c.Id, name,
      race: cardTypes[c.Type], attr: ATTRS[c.Attribute],
      atk: c.Attack, def: c.Defense,
      stars: [starNames[c.GuardianStarA], starNames[c.GuardianStarB]],
    };
    monsterCount++;
  } else if (c.Type === 20) { // Magic
    const fx = MAGIC_FX[c.Id] || TERRAIN[c.Id];
    magic['fm' + c.Id] = Object.assign({
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: fx && fx.terrain ? '🏞️' : '✨',
      desc: '',
    }, fx || { kind: 'generic' });
  } else if (c.Type === 21) { // Trap
    const fx = TRAP_FX[c.Id] || { kind: 'fake' };
    traps['fm' + c.Id] = Object.assign({
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: '🪤', desc: '',
    }, fx);
  } else if (c.Type === 22 && c.Ritual) { // Ritual
    const r = Array.isArray(c.Ritual) ? c.Ritual[0] : c.Ritual;
    rituals['fm' + c.Id] = {
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: '👁️', kind: 'ritual',
      offerings: [r.Card1, r.Card2, r.Card3], result: r.Result,
      desc: '',
    };
  } else if (c.Type === 23) { // Equip
    const compat = equipTypes[c.Id] || [];
    magic['fm' + c.Id] = {
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: '⚒️', kind: 'equip', atk: EQUIP_BONUS[c.Id] != null ? EQUIP_BONUS[c.Id] : 300,
      races: compat,
      desc: '',
    };
  }
}

/* ---------- fusions (bảng thật từ data) ---------- */
const fusions = {};
let fusionCount = 0;
for (const c of cards) {
  if (!c.Fusions) continue;
  for (const f of c.Fusions) {
    if (!f || f._card1 == null || f._card2 == null || f._result == null) continue;
    // Chỉ lấy fusion quái+quái (fusion có nguyên liệu magic/equip: xem README - future work)
    const m1 = cards[f._card1], m2 = cards[f._card2];
    if (!monsters[f._card1] || !monsters[f._card2]) continue;
    const lo = Math.min(f._card1, f._card2), hi = Math.max(f._card1, f._card2);
    const key = lo + '|' + hi;
    if (!(key in fusions)) { fusions[key] = f._result; fusionCount++; }
  }
}

/* ---------- magic/trap descriptions ---------- */
const DESC = {
  fm320: 'Lật toàn bộ quái úp của đối thủ ra mặt và ép sang tấn công.',
  fm329: 'Toàn bộ Dragon của đối thủ bị ép về phòng thủ.',
  fm330: 'Địa hình: Beast/Insect/Plant/Beast-Warrior +500 ATK & DEF (cả 2 bên).',
  fm331: 'Địa hình: Dinosaur/Zombie/Rock +500 ATK & DEF (cả 2 bên).',
  fm332: 'Địa hình: Dragon/Thunder/Winged Beast +500 ATK & DEF (cả 2 bên).',
  fm333: 'Địa hình: Warrior/Beast-Warrior +500 ATK & DEF (cả 2 bên).',
  fm334: 'Địa hình: Aqua/Fish/Sea Serpent +500 ATK & DEF (cả 2 bên).',
  fm335: 'Địa hình: Fiend/Zombie +500 ATK & DEF (cả 2 bên).',
  fm336: 'Phá hủy TẤT CẢ quái vật trên sân (cả 2 bên).',
  fm337: 'Phá hủy toàn bộ quái vật của đối thủ.',
  fm338: 'Hồi 200 LP.', fm339: 'Hồi 300 LP.', fm340: 'Hồi 600 LP.', fm341: 'Hồi 800 LP.', fm342: 'Hồi 1000 LP.',
  fm343: 'Gây 200 sát thương LP đối thủ.', fm344: 'Gây 600 sát thương.', fm345: 'Gây 1200 sát thương.', fm346: 'Gây 800 sát thương.', fm347: 'Gây 1000 sát thương.',
  fm348: 'Lật toàn bộ quái úp của đối thủ ra mặt (giữ phòng thủ).',
  fm349: 'Ép 1 quái của đối thủ về phòng thủ — không thể tấn công.',
  fm350: 'Lật toàn bộ quái úp của đối thủ ra mặt.',
  fm653: 'Phá hủy toàn bộ quái Warrior của đối thủ.',
  fm655: 'Phá hủy toàn bộ bẫy đã SET của đối thủ.',
  fm656: 'Phá hủy toàn bộ quái Zombie của đối thủ.',
  fm660: 'Phá hủy toàn bộ quái Winged Beast của đối thủ.',
  fm661: 'Phá hủy toàn bộ quái Fiend của đối thủ.',
  fm662: 'Phá hủy toàn bộ quái Insect của đối thủ.',
  fm663: 'Phá hủy toàn bộ quái Rock của đối thủ.',
  fm664: 'Phá hủy toàn bộ quái Reptile/Sea Serpent của đối thủ.',
  fm669: 'Ép 1 quái của đối thủ về phòng thủ — không thể tấn công.',
  fm672: 'Phá hủy toàn bộ bẫy đã SET của đối thủ.',
  fm681: 'Attacker ATK < 500 bị phá hủy khi tấn công.',
  fm682: 'Attacker ATK < 500 bị phá hủy khi tấn công.',
  fm683: 'Attacker ATK < 1000 bị phá hủy khi tấn công.',
  fm684: 'Attacker ATK < 1500 bị phá hủy khi tấn công.',
  fm685: 'Attacker ATK < 2000 bị phá hủy khi tấn công.',
  fm686: 'Phá hủy quái tấn công của đối thủ.',
  fm687: 'Hủy đòn đánh trực tiếp + đối thủ mất 500 LP.',
  fm688: 'LP đối thủ hồi bao nhiêu mất bấy nhiêu (khi bẫy còn set).',
  fm689: 'Xóa toàn bộ trang bị trên quái của đối thủ.',
  fm690: 'Không làm gì cả — nó là bẫy giả mà!',
};
for (const k in magic) if (DESC[magic[k].id]) magic[k].desc = DESC[magic[k].id];
for (const k in traps) if (DESC[traps[k].id]) traps[k].desc = DESC[traps[k].id];
for (const k in rituals) rituals[k].desc = 'Ritual: hi sinh 3 nguyên liệu đúng quy định để triệu hồi ' + (monsters[rituals[k].result] || {}).name + '.';
for (const k in magic) if (magic[k].kind === 'equip') magic[k].desc = 'Trang bị (+' + magic[k].atk + ' ATK): ' + magic[k].races.join(', ') + '.';

/* ---------- guards: mọi tham chiếu fusion phải có trong monsters ---------- */
let missingRef = 0;
for (const k in fusions) {
  const [a, b, r] = k.split('|').concat(fusions[k]);
  for (const id of [a, b, fusions[k]]) if (!monsters[id]) missingRef++;
}
/* rituals: offerings/result phải là monsters */
for (const k in rituals) {
  for (const oid of rituals[k].offerings) if (!monsters[oid]) { missingRef++; delete rituals[k]; break; }
  if (rituals[k] && !monsters[rituals[k].result]) { missingRef++; delete rituals[k]; }
}

/* ---------- write ---------- */
const total = Object.keys(monsters).length + Object.keys(magic).length + Object.keys(traps).length + Object.keys(rituals).length;
const banner = `/* =========================================================================
 * FORBIDDEN MEMORIES — FULL CARD DATABASE (tự sinh từ data FM gốc)
 * Nguồn: github.com/falsepopsky/YGO-FM-Database (data của duke1102) — GPL-3.0
 * Sinh bởi scripts/build_cards.js — KHÔNG sửa tay file này.
 * Quái: ${monsterCount} · Magic: ${Object.keys(magic).length} · Trap: ${Object.keys(traps).length}
 * Ritual: ${Object.keys(rituals).length} · Fusion entries: ${fusionCount} · Tổng thẻ: ${total}/722
 * ========================================================================= */`;
const out = banner + '\n(function (root) {\n  \'use strict\';\n  const FM = root.FM = root.FM || {};\n  FM.FULLDB = {\n    monsterCount: ' + monsterCount + ',\n    total: ' + total + ',\n    starNames: ' + JSON.stringify(starNames) + ',\n    monsters: ' + JSON.stringify(monsters) + ',\n    magics: ' + JSON.stringify(magic) + ',\n    traps: ' + JSON.stringify(traps) + ',\n    rituals: ' + JSON.stringify(rituals) + ',\n    fusions: ' + JSON.stringify(fusions) + '\n  };\n})(typeof window !== "undefined" ? window : globalThis);\n';
fs.writeFileSync(OUT, out);
console.log('monsters:', monsterCount, '| magics:', Object.keys(magic).length, '| traps:', Object.keys(traps).length, '| rituals:', Object.keys(rituals).length, '| fusions:', fusionCount, '| TOTAL:', total, '/722 | missingRefs:', missingRef, '| size:', (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
