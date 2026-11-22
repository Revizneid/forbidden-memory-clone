/* =========================================================================
 * Forbidden Memory Web Clone — Card Database & Fusion Table
 * Fan-made clone inspired by Yu-Gi-Oh! Forbidden Memories (PS1, 1999).
 * Pure data layer: no DOM access.
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};

  /* ------------------------------------------------------------------ */
  /* Monster database                                                     */
  /*   id: { name, race, attr, atk, def, fusionOnly? }                    */
  /* ------------------------------------------------------------------ */
  const M = {};                 // monsters by id
  let mid = 0;
  function mon(name, race, attr, atk, def, opts) {
    mid += 1;
    M[mid] = Object.assign({ id: mid, name, race, attr, atk, def }, opts || {});
    return mid;
  }

  /* --- Monsters (stats ~ Forbidden Memories / classic early TCG) --- */
  mon('Petit Dragon', 'Dragon', 'WIND', 600, 700);
  mon('Flame Manipulator', 'Pyro', 'FIRE', 800, 600);
  mon('Skelengel', 'Fairy', 'LIGHT', 900, 400);
  mon('Ryu-Kishin', 'Fiend', 'DARK', 1000, 800);
  mon('Claw Reacher', 'Zombie', 'DARK', 1000, 800);
  mon('Ancient Brain', 'Fiend', 'DARK', 1000, 700);
  mon("Fiend's Hand", 'Zombie', 'DARK', 900, 700);
  mon('Skull Servant', 'Zombie', 'DARK', 300, 200);
  mon('Armored Zombie', 'Zombie', 'DARK', 1000, 900);
  mon('Mystical Elf', 'Fairy', 'LIGHT', 800, 2000);
  mon('Arlownay', 'Fairy', 'LIGHT', 1000, 1000);
  mon('Mysterious Guard', 'Warrior', 'EARTH', 700, 1500);
  mon('Basic Insect', 'Insect', 'EARTH', 500, 700);
  mon('Tomozaurus', 'Dinosaur', 'EARTH', 700, 400);
  mon('Hitotsu-Me Giant', 'Beast-Warrior', 'EARTH', 1200, 1000);
  mon('Masaki the Legendary Swordsman', 'Warrior', 'EARTH', 1300, 1200);
  mon('Lesser Dragon', 'Dragon', 'FIRE', 1200, 1000);
  mon('Silver Fang', 'Beast', 'LIGHT', 1200, 800);
  mon('Wodan the Resident of the Forest', 'Beast', 'EARTH', 1200, 1000);
  mon('Water Omotics', 'Aqua', 'WATER', 1200, 1400);
  mon('M-Warrior #1', 'Warrior', 'EARTH', 1000, 1500);
  mon('M-Warrior #2', 'Warrior', 'EARTH', 1000, 1500);
  mon('Saggi the Dark Clown', 'Fiend', 'DARK', 800, 1300);
  mon('Feral Imp', 'Fiend', 'DARK', 1300, 1500);
  mon('Giant Soldier of Stone', 'Rock', 'EARTH', 1300, 2000);
  mon('Celtic Guardian', 'Warrior', 'EARTH', 1400, 1200);
  mon('Mystic Horseman', 'Beast-Warrior', 'EARTH', 1300, 1500);
  mon('Winged Dragon, Guardian of the Fortress #1', 'Winged Beast', 'WIND', 1400, 1200);
  mon('Mavelus', 'Winged Beast', 'WIND', 1300, 1400);
  mon('Rabid Horseman', 'Beast-Warrior', 'EARTH', 950, 1300);
  mon('Armaill', 'Fiend', 'DARK', 700, 1300);
  mon('Rare Fish', 'Fish', 'WATER', 1300, 1000);
  mon('Swordstalker', 'Fiend', 'DARK', 1200, 1000);
  mon('Ray & Temperature', 'Fiend', 'DARK', 1300, 1000);
  mon('Kojikocy', 'Warrior', 'EARTH', 1500, 1000);
  mon('Uraby', 'Dragon', 'EARTH', 1500, 1200);
  mon('Koumori Dragon', 'Dragon', 'DARK', 1500, 1200);
  mon('Blackland Fire Dragon', 'Dragon', 'DARK', 1100, 1200);
  mon('Hyosube', 'Aqua', 'WATER', 1500, 900);
  mon('Rogue Doll', 'Spellcaster', 'LIGHT', 1600, 1000);
  mon('Mystic Clown', 'Fiend', 'DARK', 1500, 1300);
  mon('Dark King of the Abyss', 'Fiend', 'DARK', 1370, 1200);
  mon('Ushi Oni', 'Fiend', 'DARK', 1350, 1600);
  mon('Crawling Dragon', 'Dragon', 'EARTH', 1600, 1400);
  mon('Ryu-Kishin Powered', 'Zombie', 'DARK', 1600, 1500);
  mon('Two-Headed King Rex', 'Dinosaur', 'FIRE', 1600, 1200);
  mon('Doma the Angel of Silence', 'Fairy', 'LIGHT', 1600, 1300);
  mon('Ocubeam', 'Fairy', 'LIGHT', 1550, 1250);
  mon('Battle Ox', 'Beast-Warrior', 'EARTH', 1700, 1000);
  mon('La Jinn the Mystical Genie of the Lamp', 'Fiend', 'DARK', 1800, 1000);
  mon('Barox', 'Fiend', 'DARK', 1800, 1200);
  mon('Sword Arm of Dragon', 'Dragon', 'DARK', 1750, 1800);
  mon('Gearfried the Iron Knight', 'Warrior', 'EARTH', 1800, 1600);
  mon('Dragon Zombie', 'Zombie', 'DARK', 1800, 1500);
  mon('Kairyu-Shin', 'Sea Serpent', 'WATER', 1800, 1500);
  mon('High Tide Geki', 'Fish', 'WATER', 1900, 1400);
  mon('Steel Ogre Grotto #1', 'Machine', 'EARTH', 1900, 2200);
  mon('Nekogal #2', 'Beast', 'EARTH', 1900, 2000);
  mon('Kaminari Attack', 'Thunder', 'WIND', 1900, 1400);
  mon('Roaring Ocean Snake', 'Aqua', 'WATER', 2100, 1800);
  mon('Zombyra the Dark', 'Zombie', 'DARK', 2100, 500);
  mon('Dark Elf', 'Spellcaster', 'DARK', 2000, 800);
  mon('Mystic Clown Prime', 'Fiend', 'DARK', 2050, 1350);
  mon('Curse of Dragon', 'Dragon', 'DARK', 2000, 1500);
  mon('King of Yamimakai', 'Fiend', 'DARK', 2000, 1500);
  mon('The Snake Hair', 'Reptile', 'DARK', 2000, 1000);
  mon('Machine King', 'Machine', 'EARTH', 2200, 2000);
  mon('Ryu-Ran', 'Dragon', 'FIRE', 2200, 2000);
  mon('Gaia the Fierce Knight', 'Warrior', 'EARTH', 2300, 2100);
  mon('Beast of Talwar', 'Fiend', 'DARK', 2400, 2150);
  mon('Red-Eyes Black Dragon', 'Dragon', 'DARK', 2400, 2000);
  mon('Kazejin', 'Thunder', 'WIND', 2400, 2000);
  mon('Suijin', 'Aqua', 'WATER', 2500, 2000);
  mon('Sanga of the Thunder', 'Thunder', 'LIGHT', 2600, 2200);
  mon('Summoned Skull', 'Fiend', 'DARK', 2500, 1200);
  mon('Dark Magician', 'Spellcaster', 'DARK', 2500, 2100);
  mon('Gaia the Dragon Champion', 'Dragon', 'WIND', 2600, 2100);
  mon('Tri-Horned Dragon', 'Dragon', 'DARK', 2850, 2300);
  mon('Twin-Headed Thunder Dragon', 'Thunder', 'LIGHT', 2800, 2200);
  mon('Blue-Eyes White Dragon', 'Dragon', 'LIGHT', 3000, 2500);
  mon('Black Luster Soldier', 'Warrior', 'EARTH', 3000, 2500);
  mon('Sengenjin', 'Beast', 'EARTH', 2750, 2500);
  mon('B. Skull Dragon', 'Dragon', 'DARK', 3200, 2500);
  mon('Gate Guardian', 'Thunder', 'LIGHT', 3750, 3400);
  mon('Blue-Eyes Ultimate Dragon', 'Dragon', 'LIGHT', 4500, 3800);
  /* --- Fusion-only results referenced by table --- */
  mon('Flame Swordsman', 'Warrior', 'FIRE', 1800, 1500);
  mon('Darkfire Dragon', 'Dragon', 'FIRE', 1500, 1250);
  mon('Dragoness the Wicked Knight', 'Dragon', 'EARTH', 1500, 1200);
  mon('Crimson Sunbird', 'Winged Beast', 'LIGHT', 2300, 1800);
  mon('Punished Eagle', 'Winged Beast', 'WIND', 1800, 1650);
  mon('Mystic Sand Warrior', 'Warrior', 'EARTH', 2000, 1300);
  mon('Zombie Warrior', 'Zombie', 'EARTH', 1200, 1000);
  mon('Firewing Pegasus', 'Winged Beast', 'FIRE', 1700, 1300);
  mon('Thunder Dragon', 'Thunder', 'LIGHT', 1600, 1000);
  mon('Megazowler', 'Dinosaur', 'EARTH', 1800, 1500);
  mon('Wall Shadow', 'Fiend', 'DARK', 1600, 1700);
  mon('Twin-Headed Fire Dragon', 'Dragon', 'FIRE', 1300, 1300);

  /* ------------------------------------------------------------------ */
  /* Magic & Trap cards                                                   */
  /* ------------------------------------------------------------------ */
  const MAGICS = {
    darkHole:  { id: 'darkHole',  name: 'Dark Hole',  icon: '🕳️', desc: 'Phá hủy TẤT CẢ quái vật trên sân (cả 2 bên).' },
    raigeki:   { id: 'raigeki',   name: 'Raigeki',    icon: '⚡', desc: 'Phá hủy toàn bộ quái vật đối thủ.' },
    fissure:   { id: 'fissure',   name: 'Fissure',    icon: '🌋', desc: 'Phá hủy quái vật ngửa có ATK thấp nhất của đối thủ.' },
    dianKeto:  { id: 'dianKeto',  name: 'Dian Keto the Cure Master', icon: '💚', desc: 'Hồi 1000 LP.' },
    // Equip (tăng ATK quái vật khớp điều kiện, gắn vĩnh viễn vào 1 quái)
    darkEnergy:{ id: 'darkEnergy', name: 'Dark Energy',  icon: '🔮', atk: 300, match: s => s.race === 'Fiend',           etext: 'Fiend +300 ATK' },
    bookArts:  { id: 'bookArts',   name: 'Book of Secret Arts', icon: '📖', atk: 200, match: s => s.race === 'Spellcaster', etext: 'Spellcaster +200 ATK' },
    beastFangs:{ id: 'beastFangs', name: 'Beast Fangs',  icon: '🦷', atk: 400, match: s => s.race === 'Beast' || s.race === 'Beast-Warrior', etext: 'Beast/Beast-Warrior +400 ATK' },
    salamandra:{ id: 'salamandra', name: 'Salamandra',   icon: '🦎', atk: 700, match: s => s.attr === 'FIRE',           etext: 'Quái FIRE +700 ATK' },
    machineConv:{id: 'machineConv',name: 'Machine Conversion Factory', icon: '⚙️', atk: 700, match: s => s.race === 'Machine', etext: 'Machine +700 ATK' },
    kaishin:   { id: 'kaishin',    name: 'Power of Kaishin', icon: '🔱', atk: 500, match: s => ['Aqua','Fish','Sea Serpent','Reptile'].includes(s.race), etext: 'Thủy tộc +500 ATK' },
    invigoration:{id:'invigoration',name:'Invigoration',  icon: '🌿', atk: 500, match: s => s.attr === 'EARTH',           etext: 'Quái EARTH +500 ATK' },
    // Terrain (+500 ATK/DEF cho cả 2 bên theo race, tồn tại cả trận)
    sogen:     { id: 'sogen',   name: 'Sogen',   icon: '🏜️', terrain: ['Warrior', 'Beast-Warrior'],              ttext: 'Warrior/Beast-Warrior +500' },
    forest:    { id: 'forest',  name: 'Forest',  icon: '🌲', terrain: ['Beast', 'Beast-Warrior', 'Insect', 'Plant'], ttext: 'Beast/Insect/Plant +500' },
    mountain:  { id: 'mountain',name: 'Mountain',icon: '⛰️', terrain: ['Dragon', 'Winged Beast', 'Thunder'],     ttext: 'Dragon/Winged Beast/Thunder +500' },
    umi:       { id: 'umi',     name: 'Umi',     icon: '🌊', terrain: ['Aqua', 'Fish', 'Sea Serpent'],           ttext: 'Thủy tộc +500' },
    yami:      { id: 'yami',    name: 'Yami',    icon: '🌑', terrain: ['Fiend', 'Zombie'],                       ttext: 'Fiend/Zombie +500' },
  };

  const TRAPS = {
    trapHole:  { id: 'trapHole',  name: 'Trap Hole',       icon: '🪤', desc: 'Khi đối thủ SUMMON quái ATK ≥ 1000: phá hủy quái đó ngay.' },
    widespread:{ id: 'widespread',name: 'Widespread Ruin', icon: '💥', desc: 'Khi đối thủ tấn công: phá hủy quái tấn công.' },
    desserts:  { id: 'desserts',  name: 'Just Desserts',   icon: '🍮', desc: 'Khi đối thủ tấn công: đối thủ mất 300 LP × số quái họ đang giữ.' },
    captureJar:{ id: 'captureJar',name: 'Dragon Capture Jar', icon: '🏺', desc: 'Khi đối thủ tấn công bằng Dragon: hủy đòn + ép về phòng thủ.' },
    antiRaigeki:{id: 'antiRaigeki',name: 'Anti Raigeki',   icon: '🛡️', desc: 'Khi đối thủ dùng Raigeki: hủy nó và phá hủy toàn bộ quái đối thủ.' },
  };

  /* ------------------------------------------------------------------ */
  /* Fusion table — cặp id -> kết quả (override trên ladder cùng race)     */
  /* ------------------------------------------------------------------ */
  function idOf(name) { for (const k in M) if (M[k].name === name) return +k; return null; }
  const FUSIONS = {};          // "minId|maxId" -> resultId
  function fuse(aName, bName, rName) {
    const a = idOf(aName), b = idOf(bName), r = idOf(rName);
    if (a == null || b == null || r == null) throw new Error('Fusion ref missing: ' + aName + '|' + bName + '=' + rName);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    FUSIONS[lo + '|' + hi] = r;
  }

  /* Fusion nổi tiếng + công thức nội bộ nhất quán */
  fuse('Flame Manipulator', 'Masaki the Legendary Swordsman', 'Flame Swordsman');
  fuse('Flame Manipulator', 'Lesser Dragon', 'Darkfire Dragon');
  fuse('Petit Dragon', 'Flame Manipulator', 'Darkfire Dragon');
  fuse('Twin-Headed Fire Dragon', 'Flame Manipulator', 'Darkfire Dragon');
  fuse('Crawling Dragon', 'Flame Manipulator', 'Ryu-Ran');
  fuse('Crawling Dragon', 'Petit Dragon', 'Ryu-Ran');
  fuse('Lesser Dragon', 'Ryu-Kishin', 'Blackland Fire Dragon');
  fuse('Petit Dragon', 'Ryu-Kishin', 'Blackland Fire Dragon');
  fuse('Koumori Dragon', 'Ryu-Kishin', 'Blackland Fire Dragon');
  fuse('Curse of Dragon', 'Gaia the Fierce Knight', 'Gaia the Dragon Champion');
  fuse('Curse of Dragon', 'Celtic Guardian', 'Dragoness the Wicked Knight');
  fuse('Uraby', 'Mystic Horseman', 'Dragoness the Wicked Knight');
  fuse('Red-Eyes Black Dragon', 'Summoned Skull', 'B. Skull Dragon');
  fuse('Blue-Eyes White Dragon', 'Blue-Eyes White Dragon', 'Blue-Eyes Ultimate Dragon');
  fuse('Sanga of the Thunder', 'Kazejin', 'Gate Guardian');
  fuse('Suijin', 'Kazejin', 'Gate Guardian');
  fuse('Suijin', 'Sanga of the Thunder', 'Gate Guardian');
  fuse('Thunder Dragon', 'Thunder Dragon', 'Twin-Headed Thunder Dragon');
  fuse('Thunder Dragon', 'Kaminari Attack', 'Twin-Headed Thunder Dragon');
  fuse('Thunder Dragon', 'Koumori Dragon', 'Twin-Headed Thunder Dragon');
  fuse('Winged Dragon, Guardian of the Fortress #1', 'Flame Manipulator', 'Crimson Sunbird');
  fuse('Winged Dragon, Guardian of the Fortress #1', 'Skelengel', 'Punished Eagle');
  fuse('Mavelus', 'Flame Manipulator', 'Firewing Pegasus');
  fuse('Hitotsu-Me Giant', 'Masaki the Legendary Swordsman', 'Mystic Sand Warrior');
  fuse('Hitotsu-Me Giant', 'Battle Ox', 'Megazowler');
  fuse('Two-Headed King Rex', 'Tomozaurus', 'Megazowler');
  fuse('Two-Headed King Rex', 'Crawling Dragon', 'Megazowler');
  fuse('Saggi the Dark Clown', 'Mysterious Guard', 'Wall Shadow');
  fuse('Saggi the Dark Clown', 'Giant Soldier of Stone', 'Wall Shadow');
  fuse('Claw Reacher', "Fiend's Hand", 'Zombie Warrior');
  fuse('Claw Reacher', 'Skull Servant', 'Zombie Warrior');
  fuse('Armored Zombie', 'Masaki the Legendary Swordsman', 'Zombie Warrior');
  fuse('Mystical Elf', 'Ryu-Kishin', 'Dark Elf');
  fuse('Arlownay', 'Skelengel', 'Doma the Angel of Silence');
  fuse('Water Omotics', 'Ryu-Kishin', 'Rare Fish');
  fuse('Water Omotics', 'Skelengel', 'Roaring Ocean Snake');
  fuse('Hyosube', 'Kairyu-Shin', 'Roaring Ocean Snake');
  fuse('Silver Fang', 'Hitotsu-Me Giant', 'Nekogal #2');
  fuse('Wodan the Resident of the Forest', 'Hitotsu-Me Giant', 'Nekogal #2');
  fuse('Rogue Doll', 'Masaki the Legendary Swordsman', 'Gearfried the Iron Knight');
  fuse('Rogue Doll', 'Celtic Guardian', 'Gearfried the Iron Knight');
  fuse('Dark Magician', 'Celtic Guardian', 'Dark Magician');
  fuse('Steel Ogre Grotto #1', 'Giant Soldier of Stone', 'Machine King');
  fuse('Steel Ogre Grotto #1', 'M-Warrior #1', 'Machine King');
  fuse('Rare Fish', 'Skelengel', 'High Tide Geki');
  fuse('Kairyu-Shin', 'Water Omotics', 'Kairyu-Shin');
  fuse('Ryu-Ran', 'Lesser Dragon', 'Ryu-Ran');
  fuse('Darkfire Dragon', 'Lesser Dragon', 'Sword Arm of Dragon');
  fuse('Darkfire Dragon', 'Petit Dragon', 'Sword Arm of Dragon');
  fuse('Dragon Zombie', 'Claw Reacher', 'Ryu-Kishin Powered');
  fuse('Dragon Zombie', 'Armored Zombie', 'Ryu-Kishin Powered');
  fuse('Summoned Skull', 'Ryu-Kishin', 'Beast of Talwar');
  fuse('Summoned Skull', 'La Jinn the Mystical Genie of the Lamp', 'Beast of Talwar');
  fuse('King of Yamimakai', 'Ryu-Kishin', 'Barox');
  fuse('King of Yamimakai', 'Feral Imp', 'Barox');
  fuse('La Jinn the Mystical Genie of the Lamp', 'Feral Imp', 'La Jinn the Mystical Genie of the Lamp');
  fuse('Feral Imp', 'Saggi the Dark Clown', 'Ushi Oni');
  fuse('Dark Magician', 'Rogue Doll', 'Dark Magician');
  fuse('Machine King', 'Steel Ogre Grotto #1', 'Machine King');
  fuse('Zombyra the Dark', 'Armored Zombie', 'Zombyra the Dark');
  fuse('The Snake Hair', 'Hyosube', 'The Snake Hair');

  /* ------------------------------------------------------------------ */
  /* API                                                                  */
  /* ------------------------------------------------------------------ */
  const RACE_ICONS = {
    'Dragon': '🐉', 'Zombie': '🧟', 'Fiend': '👹', 'Spellcaster': '🧙', 'Warrior': '⚔️',
    'Beast-Warrior': '🐗', 'Beast': '🐅', 'Fairy': '🧚', 'Machine': '🤖', 'Dinosaur': '🦖',
    'Reptile': '🦎', 'Fish': '🐟', 'Sea Serpent': '🐍', 'Thunder': '⚡', 'Plant': '🌱',
    'Insect': '🐜', 'Pyro': '🔥', 'Aqua': '🌊', 'Rock': '🪨', 'Winged Beast': '🦅',
  };
  const ATTR_COLORS = { FIRE: '#e4572e', WATER: '#2e86de', EARTH: '#a37728', WIND: '#54b878', LIGHT: '#e3c567', DARK: '#8c54d4' };

  const cards = {
    monsters: M,
    magics: MAGICS,
    traps: TRAPS,
    fusions: FUSIONS,
    idOf,
    raceIcon: r => RACE_ICONS[r] || '❔',
    attrColor: a => ATTR_COLORS[a] || '#999',
    fusionKey: (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + '|' + hi; },
    lookup(aId, bId) {
      if (!M[aId] || !M[bId]) return null;
      const r = FUSIONS[cards.fusionKey(aId, bId)];
      if (r != null) return M[r];
      // Fallback cùng race: thằng yếu hơn trong race nâng lên rung kế tiếp (ATK > max)
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

  /* ------------------------------------------------------------------ */
  /* Deck presets: [ [cardName | '#magicId' | '$trapId', count], ... ]     */
  /* ------------------------------------------------------------------ */
  function expandDeck(list) {
    const out = [];
    for (const [key, n] of list) {
      for (let i = 0; i < n; i++) {
        if (key[0] === '#') out.push({ kind: 'MAGIC', mid: key.slice(1) });
        else if (key[0] === '$') out.push({ kind: 'TRAP', tid: key.slice(1) });
        else {
          const id = idOf(key);
          if (id == null) throw new Error('Unknown card in deck: ' + key);
          out.push({ kind: 'MONSTER', id });
        }
      }
    }
    return out;
  }

  const DECKS = {
    // ---- Deck cho người chơi ----
    flameSwordsman: { name: 'Kiếm Sĩ Hỏa (Fusion)', list: [
      ['Flame Manipulator', 3], ['Masaki the Legendary Swordsman', 3], ['Winged Dragon, Guardian of the Fortress #1', 2],
      ['Petit Dragon', 2], ['Lesser Dragon', 2], ['Ryu-Kishin', 2], ['Celtic Guardian', 2], ['Hitotsu-Me Giant', 2],
      ['Giant Soldier of Stone', 2], ['Mystical Elf', 2], ['Feral Imp', 2], ['Kojikocy', 2], ['Mystic Horseman', 1],
      ['Crawling Dragon', 1], ['Gearfried the Iron Knight', 1], ['Curse of Dragon', 1],
      ['#salamandra', 1], ['#darkEnergy', 1], ['#sogen', 1], ['#dianKeto', 1],
      ['#raigeki', 1], ['#darkHole', 1], ['#fissure', 1],
      ['$trapHole', 1], ['$widespread', 1], ['$desserts', 1],
    ]},
    dragonMaster: { name: 'Chúa Tể Rồng', list: [
      ['Blue-Eyes White Dragon', 1], ['Red-Eyes Black Dragon', 1], ['Curse of Dragon', 3], ['Gaia the Fierce Knight', 1],
      ['Crawling Dragon', 2], ['Lesser Dragon', 3], ['Petit Dragon', 3], ['Koumori Dragon', 2], ['Uraby', 2],
      ['Blackland Fire Dragon', 1], ['Sword Arm of Dragon', 1], ['Two-Headed King Rex', 1], ['Ryu-Kishin', 2],
      ['Celtic Guardian', 1], ['Hitotsu-Me Giant', 1], ['Kojikocy', 1], ['Giant Soldier of Stone', 1], ['Mystical Elf', 1],
      ['#mountain', 2], ['#salamandra', 1], ['#raigeki', 1], ['#darkHole', 1], ['#fissure', 1], ['#dianKeto', 1],
      ['$trapHole', 1], ['$widespread', 1], ['$captureJar', 1], ['$desserts', 1],
    ]},
    shadowLegion: { name: 'Quân Đoàn Bóng Tối', list: [
      ['Summoned Skull', 1], ['Dark Magician', 1], ['La Jinn the Mystical Genie of the Lamp', 3], ['King of Yamimakai', 2],
      ['Ryu-Kishin', 3], ['Feral Imp', 3], ['Saggi the Dark Clown', 2], ['Claw Reacher', 2], ["Fiend's Hand", 2],
      ['Armored Zombie', 2], ['Dragon Zombie', 1], ['Swordstalker', 2], ['Ancient Brain', 2], ['Armaill', 1],
      ['Mysterious Guard', 2], ['Ushi Oni', 1],
      ['#yami', 2], ['#darkEnergy', 2], ['#raigeki', 1], ['#darkHole', 1], ['#dianKeto', 1], ['#fissure', 1],
      ['$trapHole', 1], ['$widespread', 1], ['$antiRaigeki', 1],
    ]},
    stormMachine: { name: 'Sấm Sét & Máy Móc', list: [
      ['Machine King', 1], ['Steel Ogre Grotto #1', 2], ['Thunder Dragon', 3], ['Kaminari Attack', 2], ['Sanga of the Thunder', 1],
      ['Kazejin', 1], ['Suijin', 1], ['Gearfried the Iron Knight', 2], ['Celtic Guardian', 1], ['Battle Ox', 2],
      ['Hitotsu-Me Giant', 2], ['Mystic Horseman', 2], ['Rabid Horseman', 1], ['Kojikocy', 2], ['Giant Soldier of Stone', 1],
      ['Mystical Elf', 1], ['Winged Dragon, Guardian of the Fortress #1', 2],
      ['#machineConv', 2], ['#mountain', 2], ['#sogen', 1], ['#raigeki', 1], ['#darkHole', 1], ['#dianKeto', 1], ['#fissure', 1],
      ['$trapHole', 1], ['$widespread', 1], ['$desserts', 1],
    ]},
  };

  /* ---- AI Duelists (campaign, tăng dần độ khó) ---- */
  const DUELISTS = [
    { id: 'simon',   name: 'Simon Muran',       diff: 0, portrait: '🧓', deck: [
      ['Skull Servant', 3], ['Basic Insect', 3], ['Tomozaurus', 3], ['M-Warrior #1', 2], ['M-Warrior #2', 2],
      ['Arlownay', 2], ['Skelengel', 2], ["Fiend's Hand", 2], ['Ancient Brain', 2], ['Mysterious Guard', 2],
      ['Mystical Elf', 2], ['Silver Fang', 2], ['Saggi the Dark Clown', 1], ['Ryu-Kishin', 2], ['Petit Dragon', 2],
      ['#sogen', 1], ['#dianKeto', 1], ['#fissure', 1], ['$trapHole', 1], ['$desserts', 1],
    ]},
    { id: 'tea',     name: 'Tea',               diff: 0, portrait: '👧', deck: [
      ['Celtic Guardian', 2], ['Masaki the Legendary Swordsman', 2], ['Flame Manipulator', 2], ['Hitotsu-Me Giant', 2],
      ['Mystical Elf', 3], ['Mysterious Guard', 2], ['Kojikocy', 2], ['Giant Soldier of Stone', 2], ['Silver Fang', 2],
      ['Ryu-Kishin', 2], ['Swordstalker', 2], ['M-Warrior #1', 2], ['Wodan the Resident of the Forest', 2], ['Arlownay', 1],
      ['#sogen', 2], ['#dianKeto', 1], ['#fissure', 1], ['#invigoration', 1], ['$trapHole', 2], ['$desserts', 1],
    ]},
    { id: 'priest',  name: 'Tư Tế Điện Ngọc',   diff: 1, portrait: '🧙‍♂️', deck: [
      ['Rogue Doll', 2], ['Mystic Clown', 2], ['Feral Imp', 2], ['Ushi Oni', 2], ['Dark King of the Abyss', 2],
      ['Saggi the Dark Clown', 2], ['Armaill', 2], ['Ancient Brain', 2], ['Mystical Elf', 2], ['Doma the Angel of Silence', 2],
      ['Ryu-Kishin', 2], ['Swordstalker', 2], ['La Jinn the Mystical Genie of the Lamp', 1], ['King of Yamimakai', 1],
      ['#yami', 2], ['#darkEnergy', 1], ['#dianKeto', 1], ['#fissure', 1], ['$trapHole', 2], ['$widespread', 1], ['$desserts', 1],
    ]},
    { id: 'kepura',  name: 'Đại Tư Tế Kepura',  diff: 1, portrait: '👽', deck: [
      ['Suijin', 1], ['Kairyu-Shin', 2], ['Hyosube', 2], ['Water Omotics', 2], ['Rare Fish', 2], ['High Tide Geki', 2],
      ['Roaring Ocean Snake', 1], ['Skelengel', 2], ['Mystical Elf', 2], ['Giant Soldier of Stone', 2], ['Feral Imp', 2],
      ['Ray & Temperature', 2], ['Swordstalker', 2], ['La Jinn the Mystical Genie of the Lamp', 2],
      ['#umi', 2], ['#kaishin', 1], ['#dianKeto', 1], ['#darkHole', 1], ['#fissure', 1],
      ['$trapHole', 2], ['$widespread', 1], ['$captureJar', 1],
    ]},
    { id: 'wizard',  name: 'Pháp Sư Bóng Tối',  diff: 2, portrait: '🔮', deck: [
      ['Dark Magician', 1], ['Rogue Doll', 2], ['Dark Elf', 2], ['Mystic Clown', 2], ['Mystic Clown Prime', 1],
      ['Saggi the Dark Clown', 2], ['Feral Imp', 2], ['King of Yamimakai', 2], ['Ushi Oni', 1], ['Barox', 1],
      ['La Jinn the Mystical Genie of the Lamp', 2], ['Summoned Skull', 1], ['Ryu-Kishin', 2], ['Ancient Brain', 2],
      ['Swordstalker', 2], ['Armaill', 1], ['Mystical Elf', 1],
      ['#yami', 2], ['#darkEnergy', 2], ['#bookArts', 1], ['#raigeki', 1], ['#darkHole', 1], ['#dianKeto', 1],
      ['$trapHole', 1], ['$widespread', 2], ['$antiRaigeki', 1],
    ]},
    { id: 'seto1',   name: 'Seto 1st',          diff: 2, portrait: '🐲', deck: [
      ['Blue-Eyes White Dragon', 1], ['Red-Eyes Black Dragon', 1], ['Tri-Horned Dragon', 1], ['Curse of Dragon', 2],
      ['Crawling Dragon', 2], ['Koumori Dragon', 2], ['Uraby', 2], ['Lesser Dragon', 2], ['Petit Dragon', 1],
      ['Sword Arm of Dragon', 1], ['Two-Headed King Rex', 1], ['Blackland Fire Dragon', 1], ['Gaia the Fierce Knight', 1],
      ['Ryu-Kishin', 2], ['Kojikocy', 2], ['Battle Ox', 1], ['Mystical Elf', 1], ['Giant Soldier of Stone', 1],
      ['#mountain', 2], ['#salamandra', 1], ['#raigeki', 1], ['#darkHole', 1], ['#fissure', 1],
      ['$trapHole', 1], ['$widespread', 2], ['$desserts', 1],
    ]},
    { id: 'martis',  name: 'Đại Tư Tế Martis',  diff: 3, portrait: '🦅', deck: [
      ['Winged Dragon, Guardian of the Fortress #1', 2], ['Mavelus', 2], ['Crimson Sunbird', 1], ['Punished Eagle', 1],
      ['Firewing Pegasus', 1], ['Nekogal #2', 2], ['Silver Fang', 2], ['Wodan the Resident of the Forest', 2],
      ['Hitotsu-Me Giant', 2], ['Battle Ox', 2], ['Mystic Horseman', 2], ['Rabid Horseman', 1], ['Kojikocy', 2],
      ['Gearfried the Iron Knight', 1], ['Celtic Guardian', 2], ['Mystical Elf', 1], ['Skelengel', 1],
      ['#forest', 2], ['#mountain', 1], ['#beastFangs', 1], ['#raigeki', 1], ['#darkHole', 1], ['#dianKeto', 1],
      ['$trapHole', 1], ['$widespread', 1], ['$desserts', 2],
    ]},
    { id: 'necro',   name: 'Tử Linh Sư',        diff: 3, portrait: '💀', deck: [
      ['Summoned Skull', 2], ['Beast of Talwar', 1], ['King of Yamimakai', 2], ['Barox', 1], ['Ushi Oni', 1],
      ['Dragon Zombie', 2], ['Ryu-Kishin Powered', 2], ['Armored Zombie', 2], ['Claw Reacher', 2], ["Fiend's Hand", 1],
      ['Zombyra the Dark', 1], ['Swordstalker', 2], ['La Jinn the Mystical Genie of the Lamp', 2], ['Feral Imp', 2],
      ['Ryu-Kishin', 2], ['Mystical Elf', 1],
      ['#yami', 2], ['#darkEnergy', 2], ['#raigeki', 1], ['#darkHole', 1], ['#fissure', 1], ['#dianKeto', 1],
      ['$widespread', 2], ['$trapHole', 1], ['$antiRaigeki', 1],
    ]},
    { id: 'darknite',name: 'DarkNite',          diff: 4, portrait: '😈', deck: [
      ['Blue-Eyes White Dragon', 1], ['B. Skull Dragon', 1], ['Summoned Skull', 2], ['Red-Eyes Black Dragon', 1],
      ['Dark Magician', 1], ['Gate Guardian', 1], ['Sanga of the Thunder', 1], ['Kazejin', 1], ['Suijin', 1],
      ['Thunder Dragon', 2], ['Kaminari Attack', 1], ['La Jinn the Mystical Genie of the Lamp', 2], ['King of Yamimakai', 1],
      ['Curse of Dragon', 1], ['Gaia the Fierce Knight', 1], ['Ryu-Kishin', 2], ['Feral Imp', 2], ['Kojikocy', 1],
      ['Mystical Elf', 1], ['Swordstalker', 1],
      ['#yami', 1], ['#mountain', 1], ['#raigeki', 1], ['#darkHole', 1], ['#darkEnergy', 1], ['#dianKeto', 1],
      ['$widespread', 2], ['$trapHole', 1], ['$desserts', 1],
    ]},
  ];

  FM.decks = { DECKS, DUELISTS, expandDeck };
})(typeof window !== 'undefined' ? window : globalThis);
