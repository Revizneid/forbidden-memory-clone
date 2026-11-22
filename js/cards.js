/* =========================================================================
 * Forbidden Memory Web Clone — Card DB loader (FULL 722 lá FM gốc)
 * Nạp FM.FULLDB (sinh từ scripts/build_cards.js — data FM gốc 001-722).
 * Cung cấp API: monsters/magics/traps/fusions/idOf/lookup/stars/decks.
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const F = FM.FULLDB;
  if (!F) throw new Error('cards_full.js phải được nạp TRƯỚC cards.js');

  /* ---------------- Guardian Stars (cơ chế FM gốc) ---------------- */
  const STAR_ICONS = { Sun: '☀️', Moon: '🌙', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇' };
  // Chu kỳ 1: Sun > Moon > Venus > Mercury > Sun · Chu kỳ 2: Mars > Jupiter > Saturn > Uranus > Pluto > Neptune > Mars
  const STAR_BEATS = { Sun: 'Moon', Moon: 'Venus', Venus: 'Mercury', Mercury: 'Sun', Mars: 'Jupiter', Jupiter: 'Saturn', Saturn: 'Uranus', Uranus: 'Pluto', Pluto: 'Neptune', Neptune: 'Mars' };

  const M = F.monsters;               // 621 quái: {id, name, race, attr, atk, def, stars:[a,b]}
  const magics = F.magics;            // 33 magic + 34 equip (+ ritual merge ở dưới)
  const traps = F.traps;              // 10 bẫy
  for (const k in F.rituals) magics[k] = F.rituals[k]; // ritual xử lý như spell
  // Chuẩn hóa: mọi spell/trap có fx = {kind, ...params} (engine đọc md.fx.kind)
  for (const k in magics) {
    const md = magics[k];
    if (md.terrain) md.kind = 'terrain';
    if (!md.fx) md.fx = { kind: md.kind, amount: md.amount, races: md.races, target: md.target, terrain: md.terrain };
    if (md.kind === 'equip') {
      md.compat = md.races || [];
      md.match = function (m) {
        return !!(m && (md.races || []).includes(m.race));
      };
      if (!md.fx.compat) md.fx.compat = md.compat;
    }
  }
  for (const k in traps) { const md = traps[k]; if (!md.fx) md.fx = { kind: md.kind, atk: md.atk }; }

  /* ---------------- lookup nhanh theo tên ---------------- */
  const byName = {};
  for (const k in M) byName[M[k].name.toLowerCase().replace(/[^a-z0-9]/g, '')] = M[k].id;

  /* ---------------- icons / màu ---------------- */
  const RACE_ICONS = {
    Dragon: '🐉', Zombie: '🧟', Fiend: '👹', Spellcaster: '🧙', Warrior: '⚔️',
    'Beast-Warrior': '🐗', Beast: '🐅', Fairy: '🧚', Machine: '🤖', Dinosaur: '🦖',
    Reptile: '🦎', Fish: '🐟', 'Sea Serpent': '🐍', Thunder: '⚡', Plant: '🌱',
    Insect: '🐜', Pyro: '🔥', Aqua: '🌊', Rock: '🪨', 'Winged Beast': '🦅',
  };
  const ATTR_COLORS = { FIRE: '#e4572e', WATER: '#2e86de', EARTH: '#a37728', WIND: '#54b878', LIGHT: '#e3c567', DARK: '#8c54d4', ILLUSION: '#d4a5e8', DIVINE: '#f5e6a8' };

  const cards = {
    monsters: M,
    magics,
    traps,
    rituals: F.rituals,
    fusions: F.fusions,
    total: F.total,
    monsterCount: F.monsterCount,
    starNames: F.starNames,
    starIcon: n => STAR_ICONS[n] || '⭐',
    starBeats: (a, b) => !!a && !!b && STAR_BEATS[a] === b,
    starName: function (i) { return F.starNames[i]; },
    raceIcon: r => RACE_ICONS[r] || '❔',
    attrColor: a => ATTR_COLORS[a] || '#999',
    fusionKey: (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + '|' + hi; },
    idOf(name) {
      const hit = byName[String(name).toLowerCase().replace(/[^a-z0-9]/g, '')];
      return hit != null ? hit : null;
    },
    /* Fusion: bảng thật (24956 cặp) trước -> fallback cùng race (nâng bậc) */
    lookup(aId, bId) {
      if (!M[aId] || !M[bId]) return null;
      const r = F.fusions[cards.fusionKey(aId, bId)];
      if (r != null) return M[r];
      const A = M[aId], B = M[bId];
      if (A.race !== B.race) return null;
      const top = Math.max(A.atk, B.atk);
      let best = null;
      for (const k in M) {
        const c = M[k];
        if (c.race === A.race && c.atk > top && (!best || c.atk < best.atk)) best = c;
      }
      return best;
    },
  };

  FM.cards = cards;
  FM.starNames = F.starNames;

  /* ------------------------------------------------------------------
   * Deck presets — tên theo FM gốc. '#fmXXX' = magic/trap/ritual FM.
   * ------------------------------------------------------------------ */
  function expandDeck(list) {
    const out = [];
    for (const [key, n] of list) {
      for (let i = 0; i < n; i++) {
        if (key[0] === '#' || key[0] === '$') {
          const id = key.slice(1);
          if (cards.traps[id]) out.push({ kind: 'TRAP', tid: id });
          else out.push({ kind: 'MAGIC', mid: id });
        } else {
          const id = cards.idOf(key);
          if (id == null) throw new Error('Deck card không tồn tại trong DB FM: ' + key);
          out.push({ kind: 'MONSTER', id });
        }
      }
    }
    return out;
  }

  const DECKS = {
    flameSwordsman: { name: 'Kiếm Sĩ Hỏa (Fusion)', list: [
      ['Flame Manipulator', 3], ['Masaki the Legendary Swordsman', 3], ['Winged Dragon #1', 2],
      ['Petit Dragon', 2], ['Lesser Dragon', 2], ['Ryu-Kishin', 2], ['Celtic Guardian', 2], ['Hitotsu-me Giant', 2],
      ['Giant Soldier of Stone', 2], ['Mystical Elf', 2], ['Feral Imp', 2], ['Kojikocy', 2], ['Mystic Horseman', 1],
      ['Crawling Dragon', 1], ['Giltia the D. Knight', 1], ['Curse of Dragon', 1],
      ['#fm654', 1], ['#fm303', 1], ['#fm333', 1], ['#fm342', 1],
      ['#fm337', 1], ['#fm336', 1], ['#fm346', 1],
      ['#fm683', 1], ['#fm686', 1], ['#fm690', 1],
    ]},
    dragonMaster: { name: 'Chúa Tể Rồng', list: [
      ['Blue-eyes White Dragon', 1], ['Red-eyes B. Dragon', 1], ['Tri-Horned Dragon', 1], ['Curse of Dragon', 3], ['Gaia The Fierce Knight', 1],
      ['Crawling Dragon', 2], ['Lesser Dragon', 3], ['Petit Dragon', 3], ['Koumori Dragon', 2], ['Uraby', 2],
      ['Blackland Fire Dragon', 1], ['Sword Arm of Dragon', 1], ['Two-Headed King Rex', 1], ['Ryu-Kishin', 2],
      ['Celtic Guardian', 1], ['Hitotsu-me Giant', 1], ['Kojikocy', 1], ['Giant Soldier of Stone', 1], ['Mystical Elf', 1],
      ['#fm332', 2], ['#fm654', 1], ['#fm315', 1], ['#fm337', 1], ['#fm336', 1], ['#fm346', 1], ['#fm342', 1],
      ['#fm683', 1], ['#fm686', 1], ['#fm690', 1], ['#fm685', 1],
    ]},
    shadowLegion: { name: 'Quân Đoàn Bóng Tối', list: [
      ['Summoned Skull', 1], ['Dark Magician', 1], ['La Jinn the Mystical Genie', 3], ['King of Yamimakai', 2],
      ['Ryu-Kishin', 3], ['Feral Imp', 3], ['Saggi the Dark Clown', 2], ['Claw Reacher', 2], ["Fiend's Hand", 2],
      ['Armored Zombie', 2], ['Dragon Zombie', 1], ['Swordstalker', 2], ['Ancient Brain', 2], ['Armaill', 1],
      ['Mysterious Puppeteer', 2], ['Ushi Oni', 1],
      ['#fm335', 2], ['#fm303', 2], ['#fm311', 1], ['#fm337', 1], ['#fm336', 1], ['#fm342', 1], ['#fm343', 1],
      ['#fm683', 1], ['#fm686', 1], ['#fm669', 1],
    ]},
    stormMachine: { name: 'Sấm Sét & Máy Móc', list: [
      ['Machine King', 1], ['Steel Ogre Grotto #1', 2], ['Thunder Dragon', 3], ['Kaminari Attack', 2], ['Sanga of the Thunder', 1],
      ['Kazejin', 1], ['Suijin', 1], ['Giltia the D. Knight', 2], ['Celtic Guardian', 1], ['Battle Ox', 2],
      ['Hitotsu-me Giant', 2], ['Mystic Horseman', 2], ['Rabid Horseman', 1], ['Kojikocy', 2], ['Giant Soldier of Stone', 1],
      ['Mystical Elf', 1], ['Winged Dragon #1', 2],
      ['#fm325', 2], ['#fm332', 2], ['#fm333', 1], ['#fm337', 1], ['#fm336', 1], ['#fm342', 1], ['#fm346', 1],
      ['#fm683', 1], ['#fm686', 1], ['#fm690', 1],
    ]},
  };

  /* ---- 9 đối thủ campaign — deck theo chủ đề, tăng dần độ khó ---- */
  const DUELISTS = [
    { id: 'simon', name: 'Simon Muran', diff: 0, portrait: '🧓', deck: [
      ['Skull Servant', 3], ['Basic Insect', 3], ['Tomozaurus', 3], ['M-Warrior #1', 2], ['M-Warrior #2', 2],
      ['Arlownay', 2], ['Skelengel', 2], ["Fiend's Hand", 2], ['Ancient Brain', 2], ['Mysterious Puppeteer', 2],
      ['Mystical Elf', 2], ['Silver Fang', 2], ['Saggi the Dark Clown', 1], ['Ryu-Kishin', 2], ['Petit Dragon', 2],
      ['#fm333', 1], ['#fm342', 1], ['#fm343', 1], ['#fm683', 1], ['#fm690', 1],
    ]},
    { id: 'tea', name: 'Tea', diff: 0, portrait: '👧', deck: [
      ['Celtic Guardian', 2], ['Masaki the Legendary Swordsman', 2], ['Flame Manipulator', 2], ['Hitotsu-me Giant', 2],
      ['Mystical Elf', 3], ['Mysterious Puppeteer', 2], ['Kojikocy', 2], ['Giant Soldier of Stone', 2], ['Silver Fang', 2],
      ['Ryu-Kishin', 2], ['Swordstalker', 2], ['M-Warrior #1', 2], ['Wodan the Resident of the Forest', 2], ['Arlownay', 1],
      ['#fm333', 2], ['#fm342', 1], ['#fm343', 1], ['#fm324', 1], ['#fm683', 2], ['#fm690', 1],
    ]},
    { id: 'priest', name: 'Tư Tế Điện Ngọc', diff: 1, portrait: '🧙‍♂️', deck: [
      ['Rogue Doll', 2], ['Mystic Clown', 2], ['Feral Imp', 2], ['Ushi Oni', 2], ['Dark King of the Abyss', 2],
      ['Saggi the Dark Clown', 2], ['Armaill', 2], ['Ancient Brain', 2], ['Mystical Elf', 2], ['Doma the Angel of Silence', 2],
      ['Ryu-Kishin', 2], ['Swordstalker', 2], ['La Jinn the Mystical Genie', 1], ['King of Yamimakai', 1],
      ['#fm335', 2], ['#fm303', 1], ['#fm342', 1], ['#fm343', 1], ['#fm683', 2], ['#fm686', 1], ['#fm669', 1],
    ]},
    { id: 'kepura', name: 'Đại Tư Tế Kepura', diff: 1, portrait: '👽', deck: [
      ['Suijin', 1], ['Kairyu-Shin', 2], ['Hyosube', 2], ['Water Omotics', 2], ['Rare Fish', 2], ['High Tide Gyojin', 2],
      ['Roaring Ocean Snake', 1], ['Skelengel', 2], ['Mystical Elf', 2], ['Giant Soldier of Stone', 2], ['Feral Imp', 2],
      ['Ray & Temperature', 2], ['Swordstalker', 2], ['La Jinn the Mystical Genie', 2],
      ['#fm334', 2], ['#fm328', 1], ['#fm309', 1], ['#fm342', 1], ['#fm336', 1], ['#fm343', 1],
      ['#fm683', 2], ['#fm684', 1], ['#fm686', 1],
    ]},
    { id: 'wizard', name: 'Pháp Sư Bóng Tối', diff: 2, portrait: '🔮', deck: [
      ['Dark Magician', 1], ['Rogue Doll', 2], ['Dark Elf', 2], ['Mystic Clown', 2], ['Crass Clown', 1],
      ['Saggi the Dark Clown', 2], ['Feral Imp', 2], ['King of Yamimakai', 2], ['Ushi Oni', 1], ['Barox', 1],
      ['La Jinn the Mystical Genie', 2], ['Summoned Skull', 1], ['Ryu-Kishin', 2], ['Ancient Brain', 2],
      ['Swordstalker', 2], ['Armaill', 1], ['Mystical Elf', 1],
      ['#fm335', 2], ['#fm303', 2], ['#fm323', 1], ['#fm337', 1], ['#fm336', 1], ['#fm342', 1], ['#fm346', 1],
      ['#fm683', 1], ['#fm686', 2], ['#fm669', 1],
    ]},
    { id: 'seto1', name: 'Seto 1st', diff: 2, portrait: '🐲', deck: [
      ['Blue-eyes White Dragon', 1], ['Red-eyes B. Dragon', 1], ['Tri-Horned Dragon', 1], ['Curse of Dragon', 2],
      ['Crawling Dragon', 2], ['Koumori Dragon', 2], ['Uraby', 2], ['Lesser Dragon', 2], ['Petit Dragon', 1],
      ['Sword Arm of Dragon', 1], ['Two-Headed King Rex', 1], ['Blackland Fire Dragon', 1], ['Gaia The Fierce Knight', 1],
      ['Ryu-Kishin', 2], ['Kojikocy', 2], ['Battle Ox', 1], ['Mystical Elf', 1], ['Giant Soldier of Stone', 1],
      ['#fm332', 2], ['#fm654', 1], ['#fm315', 1], ['#fm337', 1], ['#fm336', 1], ['#fm346', 1],
      ['#fm683', 1], ['#fm686', 2], ['#fm690', 1],
    ]},
    { id: 'martis', name: 'Đại Tư Tế Martis', diff: 3, portrait: '🦅', deck: [
      ['Winged Dragon #1', 2], ['Mavelus', 2], ['Crimson Sunbird', 1], ['Punished Eagle', 1], ['Firewing Pegasus', 1],
      ['Nekogal #2', 2], ['Silver Fang', 2], ['Wodan the Resident of the Forest', 2],
      ['Hitotsu-me Giant', 2], ['Battle Ox', 2], ['Mystic Horseman', 2], ['Rabid Horseman', 1], ['Kojikocy', 2],
      ['Giltia the D. Knight', 1], ['Celtic Guardian', 2], ['Mystical Elf', 1], ['Skelengel', 1],
      ['#fm330', 2], ['#fm332', 1], ['#fm308', 1], ['#fm337', 1], ['#fm336', 1], ['#fm342', 1],
      ['#fm683', 1], ['#fm686', 1], ['#fm690', 2],
    ]},
    { id: 'necro', name: 'Tử Linh Sư', diff: 3, portrait: '💀', deck: [
      ['Summoned Skull', 2], ['Zoa', 1], ['King of Yamimakai', 2], ['Barox', 1], ['Ushi Oni', 1],
      ['Dragon Zombie', 2], ['Ryu-Kishin Powered', 2], ['Armored Zombie', 2], ['Claw Reacher', 2], ["Fiend's Hand", 1],
      ['Great Mammoth of Goldfine', 1], ['Swordstalker', 2], ['La Jinn the Mystical Genie', 2], ['Feral Imp', 2],
      ['Ryu-Kishin', 2], ['Mystical Elf', 1],
      ['#fm335', 2], ['#fm303', 2], ['#fm337', 1], ['#fm336', 1], ['#fm346', 1], ['#fm342', 1],
      ['#fm686', 2], ['#fm683', 1], ['#fm685', 1],
    ]},
    { id: 'darknite', name: 'DarkNite', diff: 4, portrait: '😈', deck: [
      ['Blue-eyes White Dragon', 1], ['B. Skull Dragon', 1], ['Summoned Skull', 2], ['Red-eyes B. Dragon', 1],
      ['Dark Magician', 1], ['Gate Guardian', 1], ['Sanga of the Thunder', 1], ['Kazejin', 1], ['Suijin', 1],
      ['Thunder Dragon', 2], ['Kaminari Attack', 1], ['La Jinn the Mystical Genie', 2], ['King of Yamimakai', 1],
      ['Curse of Dragon', 1], ['Gaia The Fierce Knight', 1], ['Ryu-Kishin', 2], ['Feral Imp', 2], ['Kojikocy', 1],
      ['Mystical Elf', 1], ['Swordstalker', 1], ['#fm667', 1],
      ['#fm335', 1], ['#fm332', 1], ['#fm337', 1], ['#fm336', 1], ['#fm303', 1], ['#fm342', 1], ['#fm657', 1],
      ['#fm686', 2], ['#fm683', 1], ['#fm689', 1],
    ]},
  ];

  FM.decks = { DECKS, DUELISTS, expandDeck };
})(typeof window !== 'undefined' ? window : globalThis);
