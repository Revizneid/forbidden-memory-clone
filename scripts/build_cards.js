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

/* Specific icons cho các lá bài nổi tiếng và đặc trưng FM gốc (map theo tên chuẩn) */
const FAMOUS_BY_NAME = {
  'blue-eyes white dragon': '🐉⚡',
  'blue-eyes ultimate dragon': '🐲👑',
  'dark magician': '🧙‍♂️🔮',
  'dark magician girl': '🧙‍♀️💖',
  'red-eyes b. dragon': '🌑🐉',
  'red-eyes black metal dragon': '🤖🐲',
  'b. skull dragon': '💀🐉',
  'black skull dragon': '💀🐉',
  'summoned skull': '💀⚡',
  'celtic guardian': '🧝‍♂️🗡️',
  'mystical elf': '🧝‍♀️✨',
  'hitotsu-me giant': '👁️👹',
  'baby dragon': '🐣🐲',
  'flame swordsman': '🔥⚔️',
  'time wizard': '⏰🧙‍♂️',
  'kuriboh': '🌰✨',
  'sangan': '👁️🐾',
  'harpie lady': '🪶💃',
  'harpie lady sisters': '🪶💃',
  'gaia the fierce knight': '🏇⚔️',
  'gaia the dragon champion': '🏇🐉',
  'curse of dragon': '🐉🔥',
  'meteor dragon': '☄️🐉',
  'meteor b. dragon': '☄️🐲',
  'gate guardian': '⛩️💥',
  'sanga of the thunder': '⚡🗿',
  'kazejin': '🌪️🗿',
  'suijin': '🌊🗿',
  'black luster soldier': '🛡️⚔️',
  'magician of black chaos': '🧙‍♂️🌑',
  'exodia the forbidden one': '👑⚡',
  'right leg of the forbidden one': '🦵✨',
  'left leg of the forbidden one': '🦵✨',
  'right arm of the forbidden one': '🖐️⚡',
  'left arm of the forbidden one': '🖐️⚡',
  'skull servant': '💀🦴',
  'feral imp': '😈🗡️',
  'ryu-kishin': '👿🪨',
  'ryu-kishin powered': '👿⚡',
  'battle ox': '🐂🪓',
  'beaver warrior': '🦫🗡️',
  'silver fang': '🐺❄️',
  'kairyu-shin': '🐉🌊',
  'great mammoth of goldfine': '🦣☠️',
  'zoa': '👹💥',
  'metalzoa': '🤖👹',
  'giltia the d. knight': '🤺⚔️',
  'swordsman of landstar': '🗡️⭐',
  'twin-headed thunder dragon': '⚡🐲',
  'thunder dragon': '⚡🐉',
  'kaminari attack': '⚡🦅',
  'machine king': '👑🤖',
  'cyber tech alligator': '🤖🐊',
  'dark hole': '🕳️🌀',
  'raigeki': '⚡🌩️',
  'fissure': '🪨⚡',
  'trap hole': '🕳️🕸️',
  'widespread ruin': '💥🚀',
  'bear trap': '🪤🐻',
  'invisible wire': '🪤⚡',
  'acid trap hole': '🧪🕳️',
  'goblin fan': '🪭💨',
  'bad reaction to simochi': '🍭☠️',
  'reverse trap': '🔄🪤',
  'fake trap': '🎭🪤',
  'dian keto the cure maiden': '💚✨',
  'mooyan curry': '🍛✨',
  'red medicine': '🧪❤️',
  'goblin\'s secret remedy': '🏺💚',
  'soul of the pure': '🕊️💖',
  'sparks': '✨⚡',
  'hinotama': '🔥☄️',
  'final flame': '🌋🔥',
  'ookazi': '💥🔥',
  'tremendous fire': '🔥🌋',
  'swords of revealing light': '🗡️✨',
  'spellbinding circle': '✡️🔒',
  'dark-piercing light': '☀️✨',
  'salamandra': '🦎🔥',
  'dark energy': '🔮🌑',
  'dragon treasure': '🐉💎',
  'beast fangs': '🦷🐺',
  'forest': '🌲🦌',
  'wasteland': '🏜️🦖',
  'mountain': '⛰️🦅',
  'sogen': '🌾⚔️',
  'umi': '🌊⚓',
  'yami': '🌌🌑',
  'harpie\'s feather duster': '🪶🧹',
  'crush card': '🧪🦠',
  'megamorph': '💪✨',
  'gate guardian ritual': '⛩️⚡',
  'black luster ritual': '🛡️🗡️',
  'magician of black chaos ritual': '🧙‍♂️🌑',
  'ultimate dragon ritual': '🐲👑',
};

const RACE_SUB_EMOJIS = {
  'Dragon': ['🔥', '⚡', '🌊', '🌪️', '✨', '🌑', '💎', '🌋'],
  'Spellcaster': ['🔮', '📜', '✨', '🌑', '🕯️', '🪄', '🌟', '📿'],
  'Zombie': ['💀', '🦴', '⚰️', '👻', '🥩', '🌑', '🩸', '🕸️'],
  'Warrior': ['🛡️', '🗡️', '🏹', '🔱', '🪓', '🥊', '🏆', '🎖️'],
  'Beast-Warrior': ['🪓', '⚔️', '🛡️', '🐺', '🐂', '🐾', '🌲', '⚡'],
  'Beast': ['🐾', '🌿', '🌙', '🌲', '🪵', '❄️', '🐾', '⚡'],
  'Winged Beast': ['🪶', '🌪️', '🎯', '⚡', '🌲', '🌤️', '🏔️', '🌙'],
  'Fiend': ['😈', '💀', '⛓️', '🌑', '🔥', '🩸', '👁️', '🗡️'],
  'Fairy': ['✨', '💖', '🌸', '👼', '🌟', '🕊️', '🪞', '🌈'],
  'Insect': ['🌱', '🌳', '🍯', '🕸️', '🍃', '🏜️', '🌿', '🌾'],
  'Dinosaur': ['🔥', '🌋', '🦴', '🌿', '🥚', '⚡', '🐾', '💥'],
  'Reptile': ['🌿', '🍃', '🐍', '🏜️', '💧', '🪵', '🐾', '🌴'],
  'Fish': ['🌊', '🫧', '🐚', '🪸', '💧', '⚓', '🐬', '🎣'],
  'Sea Serpent': ['🌊', '⚡', '🫧', '🌪️', '⚓', '🌀', '🧊', '🌊'],
  'Machine': ['⚙️', '🚀', '🛞', '🔋', '📡', '🔧', '💡', '🏭'],
  'Thunder': ['🌩️', '💥', '🌪️', '☁️', '☄️', '🔋', '🌟', '🔮'],
  'Aqua': ['💧', '🫧', '🧊', '❄️', '🌧️', '⚓', '🪸', '🐚'],
  'Pyro': ['💥', '🌋', '☄️', '🕯️', '🧨', '☀️', '🎇', '♨️'],
  'Rock': ['⛰️', '🗿', '🏜️', '💎', '⛏️', '🌋', '🧱', '🏰'],
  'Plant': ['🌺', '🍄', '🌹', '🌲', '🍇', '🍂', '🌻', '🌿'],
};

function resolveMonsterIcon(id, name, race, attr) {
  const norm = name.toLowerCase().trim();
  const cleanKey = norm.replace(/[^a-z0-9]/g, '');
  for (const [k, ico] of Object.entries(FAMOUS_BY_NAME)) {
    if (k.replace(/[^a-z0-9]/g, '') === cleanKey) return ico;
  }
  const n = norm;
  if (n.includes('blue-eyes ultimate') || n.includes('blue eyes ultimate')) return '🐲👑';
  if (n.includes('blue-eyes') || n.includes('blue eyes')) return '🐉⚡';
  if (n.includes('hitotsu-me') || n.includes('hitotsume') || n.includes('cyclops')) return '👁️👹';
  if (n.includes('dragon')) {
    if (attr === 'FIRE' || n.includes('fire') || n.includes('flame')) return '🔥🐉';
    if (attr === 'WATER' || n.includes('sea') || n.includes('aqua')) return '🌊🐉';
    if (attr === 'THUNDER' || n.includes('thunder') || n.includes('lightning')) return '⚡🐉';
    if (attr === 'DARK' || n.includes('dark') || n.includes('black')) return '🌑🐉';
    if (attr === 'LIGHT' || n.includes('white') || n.includes('light')) return '✨🐉';
    if (attr === 'WIND' || n.includes('winged') || n.includes('sky')) return '🦅🐉';
    return '🐉';
  }
  if (n.includes('magician') || n.includes('wizard') || n.includes('sorcerer') || n.includes('mage') || n.includes('witch') || n.includes('shaman')) {
    if (n.includes('witch')) return '🧙‍♀️✨';
    if (attr === 'DARK' || n.includes('dark')) return '🧙‍♂️🌑';
    if (attr === 'FIRE' || n.includes('flame')) return '🧙‍♂️🔥';
    return '🧙‍♂️🔮';
  }
  if (n.includes('knight') || n.includes('swordsman') || n.includes('warrior') || n.includes('blade') || n.includes('sword') || n.includes('samurai') || n.includes('ninja') || n.includes('guard')) {
    if (n.includes('ninja')) return '🥷⚔️';
    if (n.includes('samurai')) return '🤺⚔️';
    if (n.includes('archer') || n.includes('bow')) return '🏹⚔️';
    if (attr === 'FIRE') return '🔥⚔️';
    if (attr === 'DARK') return '🗡️🌑';
    if (attr === 'LIGHT') return '🛡️✨';
    return '⚔️🛡️';
  }
  if (n.includes('zombie') || n.includes('skeleton') || n.includes('skull') || n.includes('bone') || n.includes('mummy') || n.includes('ghost') || n.includes('specter') || n.includes('phantom') || n.includes('lich') || n.includes('ghoul')) {
    if (n.includes('ghost') || n.includes('specter') || n.includes('phantom')) return '👻🌑';
    if (n.includes('mummy')) return '🧟📜';
    if (n.includes('skull') || n.includes('skeleton') || n.includes('bone')) return '💀🦴';
    return '🧟🥩';
  }
  if (n.includes('fiend') || n.includes('demon') || n.includes('devil') || n.includes('imp') || n.includes('abyss') || n.includes('gargoyle')) {
    if (n.includes('gargoyle')) return '🗿😈';
    if (n.includes('imp')) return '😈🗡️';
    return '👹🔥';
  }
  if (n.includes('angel') || n.includes('fairy') || n.includes('goddess') || n.includes('maiden') || n.includes('elf') || n.includes('valkyrie') || n.includes('pixie')) {
    if (n.includes('angel')) return '👼✨';
    if (n.includes('valkyrie')) return '🛡️✨';
    if (n.includes('maiden') || n.includes('goddess')) return '👸✨';
    return '🧚‍♀️✨';
  }
  if (n.includes('machine') || n.includes('robot') || n.includes('cyber') || n.includes('mech') || n.includes('cannon') || n.includes('tank') || n.includes('gear')) {
    if (n.includes('cannon') || n.includes('tank')) return '🚀🤖';
    if (n.includes('gear')) return '⚙️🤖';
    return '🤖🦾';
  }
  if (n.includes('insect') || n.includes('beetle') || n.includes('wasp') || n.includes('bee') || n.includes('spider') || n.includes('ant') || n.includes('mantis') || n.includes('moth') || n.includes('worm')) {
    if (n.includes('spider')) return '🕷️🕸️';
    if (n.includes('wasp') || n.includes('bee')) return '🐝🍯';
    if (n.includes('mantis')) return '🦗🗡️';
    if (n.includes('beetle')) return '🪲🌳';
    return '🐜🌱';
  }
  if (n.includes('bird') || n.includes('eagle') || n.includes('hawk') || n.includes('falcon') || n.includes('crow') || n.includes('harpie') || n.includes('wing') || n.includes('owl')) {
    if (n.includes('owl')) return '🦉🌙';
    if (n.includes('crow') || n.includes('raven')) return '🐦‍⬛🌑';
    if (n.includes('harpie')) return '🪶💃';
    return '🦅🪶';
  }
  if (n.includes('fish') || n.includes('shark') || n.includes('whale') || n.includes('sea') || n.includes('ocean') || n.includes('aqua') || n.includes('crab') || n.includes('turtle') || n.includes('kraken') || n.includes('squid')) {
    if (n.includes('shark')) return '🦈🌊';
    if (n.includes('whale')) return '🐋🌊';
    if (n.includes('crab') || n.includes('lobster')) return '🦀🌊';
    if (n.includes('turtle')) return '🐢🌊';
    return '🐟🌊';
  }
  if (n.includes('dinosaur') || n.includes('rex') || n.includes('raptor') || n.includes('tomozaurus')) {
    if (n.includes('rex')) return '🦖🔥';
    return '🦖🌿';
  }
  if (n.includes('snake') || n.includes('serpent') || n.includes('cobra') || n.includes('viper') || n.includes('lizard') || n.includes('croc')) {
    if (n.includes('snake') || n.includes('cobra') || n.includes('viper')) return '🐍🩸';
    if (n.includes('croc')) return '🐊🌊';
    return '🦎🌿';
  }
  if (n.includes('plant') || n.includes('tree') || n.includes('flower') || n.includes('vine') || n.includes('mushroom') || n.includes('rose')) {
    if (n.includes('rose') || n.includes('flower')) return '🌹✨';
    if (n.includes('mushroom')) return '🍄🌱';
    if (n.includes('tree') || n.includes('wood')) return '🌲🪵';
    return '🌱🌿';
  }
  if (n.includes('rock') || n.includes('stone') || n.includes('boulder') || n.includes('statue') || n.includes('golem')) {
    if (n.includes('statue') || n.includes('golem')) return '🗿🪨';
    return '🪨⛰️';
  }
  if (n.includes('fire') || n.includes('flame') || n.includes('pyro') || n.includes('lava') || n.includes('magma') || n.includes('burn')) {
    if (n.includes('lava') || n.includes('magma')) return '🌋🔥';
    return '🔥💥';
  }
  if (n.includes('thunder') || n.includes('lightning') || n.includes('electric') || n.includes('spark') || n.includes('volt')) {
    return '⚡🌩️';
  }
  if (n.includes('beast') || n.includes('wolf') || n.includes('lion') || n.includes('tiger') || n.includes('bear') || n.includes('hound') || n.includes('dog') || n.includes('boar') || n.includes('bull') || n.includes('ox') || n.includes('horse') || n.includes('cat') || n.includes('fox')) {
    if (n.includes('wolf') || n.includes('hound')) return '🐺🌙';
    if (n.includes('lion')) return '🦁👑';
    if (n.includes('tiger')) return '🐅🌿';
    if (n.includes('bear')) return '🐻🐾';
    if (n.includes('fox')) return '🦊🔥';
    if (n.includes('cat') || n.includes('neko')) return '🐱🐾';
    if (n.includes('boar')) return '🐗🪵';
    if (n.includes('bull') || n.includes('ox')) return '🐂⚡';
    if (n.includes('horse') || n.includes('steed')) return '🐎💨';
    return '🐾🌿';
  }
  // Fallback: kết hợp race + flair theo id
  const subs = RACE_SUB_EMOJIS[race] || ['✨', '🔥', '⚡', '🌙'];
  const sub = subs[id % subs.length];
  const base = {
    Dragon: '🐉', Spellcaster: '🧙', Zombie: '🧟', Warrior: '⚔️', 'Beast-Warrior': '🐗',
    Beast: '🐅', 'Winged Beast': '🦅', Fiend: '👹', Fairy: '🧚', Insect: '🪲',
    Dinosaur: '🦖', Reptile: '🦎', Fish: '🐟', 'Sea Serpent': '🐍', Machine: '🤖',
    Thunder: '⚡', Aqua: '🌊', Pyro: '🔥', Rock: '🪨', Plant: '🌱',
  }[race] || '❔';
  return base + sub;
}

function resolveEquipIcon(id, name) {
  const norm = name.toLowerCase().trim();
  const cleanKey = norm.replace(/[^a-z0-9]/g, '');
  for (const [k, ico] of Object.entries(FAMOUS_BY_NAME)) {
    if (k.replace(/[^a-z0-9]/g, '') === cleanKey) return ico;
  }
  const n = norm;
  if (n.includes('sword') || n.includes('blade')) return '🗡️✨';
  if (n.includes('bow') || n.includes('arrow')) return '🏹✨';
  if (n.includes('armor') || n.includes('mail') || n.includes('shield')) return '🛡️✨';
  if (n.includes('fang') || n.includes('claw')) return '🦷🐺';
  if (n.includes('horn')) return '📯✨';
  if (n.includes('laser') || n.includes('cannon')) return '🔫⚡';
  if (n.includes('treasure') || n.includes('jewel') || n.includes('gem')) return '💎✨';
  if (n.includes('book') || n.includes('scroll') || n.includes('secret')) return '📖✨';
  if (n.includes('energy') || n.includes('power')) return '🔮✨';
  if (n.includes('fire') || n.includes('flame')) return '🔥⚒️';
  return '⚒️✨';
}

function resolveRitualIcon(id, name) {
  const norm = name.toLowerCase().trim();
  const cleanKey = norm.replace(/[^a-z0-9]/g, '');
  for (const [k, ico] of Object.entries(FAMOUS_BY_NAME)) {
    if (k.replace(/[^a-z0-9]/g, '') === cleanKey) return ico;
  }
  const n = norm;
  if (n.includes('chaos') || n.includes('black')) return '🧙‍♂️🌑';
  if (n.includes('soldier') || n.includes('luster')) return '🛡️🗡️';
  if (n.includes('dragon')) return '🐲👑';
  if (n.includes('guardian') || n.includes('gate')) return '⛩️⚡';
  return '👁️✨';
}

function resolveMagicIcon(id, name, fx) {
  const norm = name.toLowerCase().trim();
  const cleanKey = norm.replace(/[^a-z0-9]/g, '');
  for (const [k, ico] of Object.entries(FAMOUS_BY_NAME)) {
    if (k.replace(/[^a-z0-9]/g, '') === cleanKey) return ico;
  }
  const n = norm;
  if (n.includes('dian keto')) return '💚✨';
  if (n.includes('curry')) return '🍛✨';
  if (n.includes('medicine')) return '🧪❤️';
  if (n.includes('remedy')) return '🏺💚';
  if (n.includes('soul')) return '🕊️💖';
  if (n.includes('sparks')) return '✨⚡';
  if (n.includes('hinotama')) return '🔥☄️';
  if (n.includes('flame') || n.includes('fire')) return '🔥🌋';
  if (n.includes('ookazi')) return '💥🔥';
  if (fx && fx.terrain) return '🏞️';
  return '🪄✨';
}

function resolveTrapIcon(id, name) {
  const norm = name.toLowerCase().trim();
  const cleanKey = norm.replace(/[^a-z0-9]/g, '');
  for (const [k, ico] of Object.entries(FAMOUS_BY_NAME)) {
    if (k.replace(/[^a-z0-9]/g, '') === cleanKey) return ico;
  }
  const n = norm;
  if (n.includes('adhesive')) return '🩹🪤';
  if (n.includes('eatgaboon')) return '🦷🪤';
  if (n.includes('wire')) return '🪤⚡';
  if (n.includes('bear')) return '🪤🐻';
  if (n.includes('acid')) return '🧪🕳️';
  if (n.includes('ruin') || n.includes('widespread')) return '💥🚀';
  if (n.includes('fan')) return '🪭💨';
  if (n.includes('simochi')) return '🍭☠️';
  if (n.includes('reverse')) return '🔄🪤';
  if (n.includes('fake')) return '🎭🪤';
  if (n.includes('trap hole')) return '🕳️🕸️';
  return '🪤';
}

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
    const race = cardTypes[c.Type], attr = ATTRS[c.Attribute];
    monsters[c.Id] = {
      id: c.Id, name,
      icon: resolveMonsterIcon(c.Id, name, race, attr),
      race, attr,
      atk: c.Attack, def: c.Defense,
      stars: [starNames[c.GuardianStarA], starNames[c.GuardianStarB]],
    };
    monsterCount++;
  } else if (c.Type === 20) { // Magic
    const fx = MAGIC_FX[c.Id] || TERRAIN[c.Id];
    magic['fm' + c.Id] = Object.assign({
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: resolveMagicIcon(c.Id, name, fx),
      desc: '',
    }, fx || { kind: 'generic' });
  } else if (c.Type === 21) { // Trap
    const fx = TRAP_FX[c.Id] || { kind: 'fake' };
    traps['fm' + c.Id] = Object.assign({
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: resolveTrapIcon(c.Id, name), desc: '',
    }, fx);
  } else if (c.Type === 22 && c.Ritual) { // Ritual
    const r = Array.isArray(c.Ritual) ? c.Ritual[0] : c.Ritual;
    rituals['fm' + c.Id] = {
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: resolveRitualIcon(c.Id, name), kind: 'ritual',
      offerings: [r.Card1, r.Card2, r.Card3], result: r.Result,
      desc: '',
    };
  } else if (c.Type === 23) { // Equip
    const compat = equipTypes[c.Id] || [];
    magic['fm' + c.Id] = {
      id: 'fm' + c.Id, fid: c.Id, name,
      icon: resolveEquipIcon(c.Id, name), kind: 'equip', atk: EQUIP_BONUS[c.Id] != null ? EQUIP_BONUS[c.Id] : 300,
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
