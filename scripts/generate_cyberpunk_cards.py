#!/usr/bin/env python3
"""
Forbidden Memories Web Clone — Cyberpunk 2.0 Card Art Generator
Upgraded to incorporate full canonical PS1 metadata:
  - Source: fmdata/cards_v.json (722 canonical cards) + js/cards_full.js (curated icons)
  - Canonical Attributes: LIGHT, DARK, EARTH, WATER, FIRE, WIND, ILLUSION, DIVINE
  - Canonical Guardian Stars: Mars, Jupiter, Saturn, Uranus, Pluto, Neptune, Mercury, Sun, Moon, Venus
  - Canonical Level stars (1-8) & real 8-digit PS1 CardCode passwords
  - Authentic PS1 game lore descriptions formatted as cyber telemetry logs
  - Procedural cyber barcodes, 3D cyberspace grid, dual holographic HUD rings, and CRT scanlines
"""

import os
import sys
import json
import math
import random
import time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
ROOT_DIR = PROJECT_DIR.parent
ASSETS_DIR = PROJECT_DIR / "assets" / "cards"
FMDATA_CARDS = ROOT_DIR / "fmdata" / "cards_v.json"
CARDS_FULL_JS = PROJECT_DIR / "js" / "cards_full.js"
DB_CACHE = SCRIPT_DIR / "cards_db_cyberpunk.json"

STAR_NAMES = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Pluto', 'Neptune', 'Mercury', 'Sun', 'Moon', 'Venus']
STAR_SYMBOLS = {
    'Sun': '☀️',
    'Moon': '🌙',
    'Mercury': '☿',
    'Venus': '♀',
    'Mars': '♂',
    'Jupiter': '♃',
    'Saturn': '♄',
    'Uranus': '♅',
    'Neptune': '♆',
    'Pluto': '♇'
}
STAR_ABBR = {
    'Sun': 'SUN',
    'Moon': 'MON',
    'Mercury': 'MER',
    'Venus': 'VEN',
    'Mars': 'MAR',
    'Jupiter': 'JUP',
    'Saturn': 'SAT',
    'Uranus': 'URN',
    'Neptune': 'NEP',
    'Pluto': 'PLU'
}

CARD_TYPES = [
    'Dragon', 'Spellcaster', 'Zombie', 'Warrior', 'Beast-Warrior',
    'Beast', 'Winged Beast', 'Fiend', 'Fairy', 'Insect',
    'Dinosaur', 'Reptile', 'Fish', 'Sea Serpent', 'Machine',
    'Thunder', 'Aqua', 'Pyro', 'Rock', 'Plant',
    'Magic', 'Trap', 'Ritual', 'Equip'
]

ATTR_NAMES = ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND', 'ILLUSION', 'DIVINE']

PALETTES = {
    'LIGHT':    {'neon': (0, 245, 255),   'sub': (255, 230, 110), 'bg': (7, 12, 24)},
    'DARK':     {'neon': (255, 30, 160),  'sub': (180, 50, 255),  'bg': (16, 6, 26)},
    'FIRE':     {'neon': (255, 85, 20),   'sub': (255, 200, 30),  'bg': (24, 8, 6)},
    'WATER':    {'neon': (0, 215, 255),   'sub': (0, 130, 255),   'bg': (6, 16, 30)},
    'EARTH':    {'neon': (0, 255, 135),   'sub': (210, 175, 40),  'bg': (8, 20, 10)},
    'WIND':     {'neon': (20, 255, 200),  'sub': (130, 255, 150), 'bg': (6, 22, 18)},
    'DIVINE':   {'neon': (255, 215, 0),   'sub': (255, 130, 0),   'bg': (24, 18, 6)},
    'MAGIC':    {'neon': (0, 255, 215),   'sub': (70, 160, 255),  'bg': (6, 16, 28)},
    'TRAP':     {'neon': (255, 20, 100),  'sub': (255, 130, 0),   'bg': (26, 6, 16)},
    'RITUAL':   {'neon': (255, 205, 30),  'sub': (170, 50, 255),  'bg': (20, 8, 30)},
    'EQUIP':    {'neon': (140, 120, 255), 'sub': (0, 230, 255),   'bg': (14, 10, 28)}
}

def get_fonts():
    """Load system fonts with proper fallbacks for Windows and cross-platform."""
    mono_paths = [
        'C:/Windows/Fonts/consolab.ttf',
        'C:/Windows/Fonts/consola.ttf',
        '/System/Library/Fonts/Monaco.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
    ]
    emoji_paths = [
        'C:/Windows/Fonts/seguiemj.ttf',
        '/System/Library/Fonts/Apple Color Emoji.ttc',
        '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
    ]
    sans_paths = [
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/segoeui.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    ]

    mono_path = next((p for p in mono_paths if os.path.exists(p)), None)
    emoji_path = next((p for p in emoji_paths if os.path.exists(p)), None)
    sans_path = next((p for p in sans_paths if os.path.exists(p)), None)

    if mono_path:
        f_title = ImageFont.truetype(mono_path, 11)
        f_mono = ImageFont.truetype(mono_path, 9)
        f_micro = ImageFont.truetype(mono_path, 8)
        f_nano = ImageFont.truetype(mono_path, 7)
    else:
        f_title = f_mono = f_micro = f_nano = ImageFont.load_default()

    if emoji_path:
        f_emoji = ImageFont.truetype(emoji_path, 50)
        f_emoji_sm = ImageFont.truetype(emoji_path, 11)
    else:
        f_emoji = f_title
        f_emoji_sm = f_micro

    if sans_path:
        f_sans = ImageFont.truetype(sans_path, 9)
    else:
        f_sans = f_mono

    return {
        'title': f_title,
        'mono': f_mono,
        'micro': f_micro,
        'nano': f_nano,
        'emoji': f_emoji,
        'emoji_sm': f_emoji_sm,
        'sans': f_sans
    }

def load_canonical_database():
    """Load and merge cards_v.json with cards_full.js metadata."""
    if DB_CACHE.exists():
        try:
            with open(DB_CACHE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if len(data) == 722:
                    return data
        except Exception:
            pass

    print("Building canonical cards database from fmdata/cards_v.json...")
    import subprocess
    cmd = [
        'node', '-e',
        r"""
        const fs = require('fs');
        const path = require('path');
        const fmCards = JSON.parse(fs.readFileSync(path.resolve('./fmdata/cards_v.json'), 'utf8'));
        require(path.resolve('./yugioh-fm-clone/js/cards_full.js'));
        const F = globalThis.FM.FULLDB;

        const starNames = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Pluto', 'Neptune', 'Mercury', 'Sun', 'Moon', 'Venus'];
        const cardTypes = ['Dragon', 'Spellcaster', 'Zombie', 'Warrior', 'Beast-Warrior', 'Beast', 'Winged Beast', 'Fiend', 'Fairy', 'Insect', 'Dinosaur', 'Reptile', 'Fish', 'Sea Serpent', 'Machine', 'Thunder', 'Aqua', 'Pyro', 'Rock', 'Plant', 'Magic', 'Trap', 'Ritual', 'Equip'];
        const ATTRS = ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND', 'ILLUSION', 'DIVINE'];

        const merged = fmCards.map(c => {
          const id = c.Id;
          const race = cardTypes[c.Type] || 'Unknown';
          let cat = 'MONSTER';
          if (race === 'Magic') cat = 'MAGIC';
          else if (race === 'Trap') cat = 'TRAP';
          else if (race === 'Ritual') cat = 'RITUAL';
          else if (race === 'Equip') cat = 'EQUIP';

          let icon = '✨';
          let subtype = '';
          if (F.monsters[id]) {
            icon = F.monsters[id].icon;
          } else if (F.magics['fm' + id]) {
            icon = F.magics['fm' + id].icon;
            subtype = F.magics['fm' + id].kind || '';
          } else if (F.traps['fm' + id]) {
            icon = F.traps['fm' + id].icon;
            subtype = F.traps['fm' + id].kind || '';
          } else if (F.rituals['fm' + id]) {
            icon = F.rituals['fm' + id].icon;
            subtype = 'Ritual';
          }

          const starA = (c.GuardianStarA >= 0 && c.GuardianStarA < 10) ? starNames[c.GuardianStarA] : null;
          const starB = (c.GuardianStarB >= 0 && c.GuardianStarB < 10) ? starNames[c.GuardianStarB] : null;

          return {
            id: id,
            name: c.Name,
            desc: (c.Description || '').replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim(),
            cat: cat,
            race: race,
            attr: ATTRS[c.Attribute] || 'LIGHT',
            level: c.Level || 0,
            atk: c.Attack || 0,
            def: c.Defense || 0,
            starA: starA,
            starB: starB,
            code: c.CardCode || '00000000',
            stars: c.Stars || 0,
            icon: icon,
            subtype: subtype
          };
        });

        fs.writeFileSync(path.resolve('./yugioh-fm-clone/scripts/cards_db_cyberpunk.json'), JSON.stringify(merged, null, 2), 'utf8');
        """
    ]
    subprocess.run(cmd, cwd=str(ROOT_DIR), check=True)
    with open(DB_CACHE, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_card_image(card, out_path, fonts):
    """
    Renders high-detail 240x240 Cyberpunk card artwork.
    """
    w, h = 240, 240
    cid = card['id']
    name = card.get('name', f'Card #{cid}')
    cat = card.get('cat', 'MONSTER')
    race = card.get('race', '')
    attr = card.get('attr', 'LIGHT')
    level = card.get('level', 0)
    atk = card.get('atk', 0)
    df = card.get('def', 0)
    star_a = card.get('starA')
    star_b = card.get('starB')
    code = card.get('code', '00000000')
    desc = card.get('desc', '')
    icon = card.get('icon', '✨')
    subtype = card.get('subtype', '')

    # Palette
    pal_key = cat if cat in PALETTES else attr
    pal = PALETTES.get(pal_key, PALETTES['LIGHT'])
    neon = pal['neon']
    sub = pal['sub']
    bg = pal['bg']

    img = Image.new('RGBA', (w, h), (bg[0], bg[1], bg[2], 255))
    draw = ImageDraw.Draw(img)
    rng = random.Random(cid * 52919 + 71)

    # -------------------------------------------------------------
    # 1. Dark Cyber Gradient + Central Neon Bloom
    # -------------------------------------------------------------
    cx, cy = w // 2, 106
    for r in range(96, 12, -6):
        alpha = int(45 * (1.0 - (r / 96.0)))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(neon[0], neon[1], neon[2], alpha))

    # -------------------------------------------------------------
    # 2. Digital Matrix Energy Dust & Binary Particles
    # -------------------------------------------------------------
    for _ in range(26):
        px = rng.randint(12, w - 12)
        py = rng.randint(28, 160)
        pa = rng.randint(35, 175)
        draw.point((px, py), fill=(neon[0], neon[1], neon[2], pa))
        if rng.random() < 0.25:
            blip_len = rng.randint(3, 7)
            draw.line([(px, py), (px + blip_len, py)], fill=(sub[0], sub[1], sub[2], pa // 2))

    # -------------------------------------------------------------
    # 3. 3D Cyberspace Synthwave Perspective Grid
    # -------------------------------------------------------------
    horizon_y = 138
    grid_bottom_y = 180
    # Horizon glowing pulse line
    draw.line([(10, horizon_y), (w - 10, horizon_y)], fill=(neon[0], neon[1], neon[2], 120), width=1)
    draw.line([(cx - 40, horizon_y), (cx + 40, horizon_y)], fill=(255, 255, 255, 180), width=1)

    # Perspective depth lines
    for i in range(1, 6):
        dy = int((i / 5.0) ** 1.35 * (grid_bottom_y - horizon_y))
        gy = horizon_y + dy
        alpha = int(35 + (i / 5.0) * 55)
        draw.line([(10, gy), (w - 10, gy)], fill=(sub[0], sub[1], sub[2], alpha), width=1)

    # Perspective vertical fan rays
    for gx in range(14, w - 10, 24):
        vx = cx + int((gx - cx) * 0.22)
        draw.line([(vx, horizon_y), (gx, grid_bottom_y)], fill=(sub[0], sub[1], sub[2], 45), width=1)

    # -------------------------------------------------------------
    # 4. Sci-Fi Cyber Circuit Traces
    # -------------------------------------------------------------
    # Left circuit trace
    draw.line([(8, 45), (18, 45), (24, 51), (24, 76), (19, 81), (10, 81)], fill=(neon[0], neon[1], neon[2], 85), width=1)
    draw.ellipse([22, 74, 26, 78], fill=(neon[0], neon[1], neon[2], 180))
    # Right circuit trace
    draw.line([(w - 8, 45), (w - 18, 45), (w - 24, 51), (w - 24, 76), (w - 19, 81), (w - 10, 81)], fill=(neon[0], neon[1], neon[2], 85), width=1)
    draw.ellipse([w - 26, 74, w - 22, 78], fill=(neon[0], neon[1], neon[2], 180))

    # -------------------------------------------------------------
    # 5. Dual Neon Holographic HUD Rings & Targeting Reticles
    # -------------------------------------------------------------
    r_outer = 52
    r_inner = 46
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], outline=(neon[0], neon[1], neon[2], 90), width=1)
    draw.ellipse([cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner], outline=(neon[0], neon[1], neon[2], 210), width=2)

    # Compass degree tick marks
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        x1 = cx + (r_inner - 2) * cos_a
        y1 = cy + (r_inner - 2) * sin_a
        x2 = cx + (r_outer + 3) * cos_a
        y2 = cy + (r_outer + 3) * sin_a
        draw.line([(x1, y1), (x2, y2)], fill=(neon[0], neon[1], neon[2], 220), width=1)

    # Tactical Targeting Crosshairs
    cross_len = 8
    draw.line([(cx - r_outer - cross_len, cy), (cx - r_outer + 2, cy)], fill=(neon[0], neon[1], neon[2], 240), width=2)
    draw.line([(cx + r_outer - 2, cy), (cx + r_outer + cross_len, cy)], fill=(neon[0], neon[1], neon[2], 240), width=2)
    draw.line([(cx, cy - r_outer - cross_len), (cx, cy - r_outer + 2)], fill=(neon[0], neon[1], neon[2], 240), width=2)
    draw.line([(cx, cy + r_outer - 2), (cx, cy + r_outer + cross_len)], fill=(neon[0], neon[1], neon[2], 240), width=2)

    # -------------------------------------------------------------
    # 6. Central Iconic Hologram
    # -------------------------------------------------------------
    clean_icon = icon.split()[0] if icon else '✨'
    if len(clean_icon) > 2:
        clean_icon = clean_icon[:2]
    try:
        bbox = draw.textbbox((0, 0), clean_icon, font=fonts['emoji'], embedded_color=True)
        ew = bbox[2] - bbox[0]
        eh = bbox[3] - bbox[1]
        draw.text((cx - ew // 2, cy - eh // 2 - 3), clean_icon, font=fonts['emoji'], embedded_color=True)
    except Exception:
        draw.text((cx - 16, cy - 16), clean_icon, fill=(255, 255, 255), font=fonts['title'])

    # -------------------------------------------------------------
    # 7. Top Cyber Telemetry Header Bar
    # -------------------------------------------------------------
    draw.rectangle([6, 6, w - 6, 23], fill=(5, 8, 16, 230), outline=(neon[0], neon[1], neon[2], 110), width=1)
    # Card ID
    draw.text((10, 8), f'#FM-{cid:03d}', fill=(255, 225, 80), font=fonts['mono'])
    # Serial / PS1 Code
    draw.text((70, 9), f'PASS: {code}', fill=(150, 180, 205), font=fonts['nano'])
    # Attribute / Category tag
    tag_text = f'[{attr}]' if cat == 'MONSTER' else f'[{cat}]'
    tw = len(tag_text) * 5.8
    draw.text((w - 10 - tw, 8), tag_text, fill=neon, font=fonts['mono'])

    # -------------------------------------------------------------
    # 8. Guardian Star & Level Badges Row
    # -------------------------------------------------------------
    if cat == 'MONSTER':
        # Guardian Star Badges (Left)
        gx = 10
        for s_name in [star_a, star_b]:
            if s_name and s_name in STAR_ABBR:
                sym = STAR_SYMBOLS.get(s_name, '★')
                abbr = STAR_ABBR.get(s_name, s_name[:3])
                badge_str = f'{sym}{abbr}'
                draw.rectangle([gx, 26, gx + 38, 38], fill=(12, 18, 30, 220), outline=(neon[0], neon[1], neon[2], 130), width=1)
                draw.text((gx + 3, 27), badge_str, fill=(230, 240, 255), font=fonts['micro'])
                gx += 42

        # Level Stars (Right)
        if level > 0:
            stars_str = '★' * min(level, 8)
            draw.text((w - 10 - len(stars_str) * 7.2 - 28, 27), f'LV.{level}', fill=(255, 220, 80), font=fonts['micro'])
            draw.text((w - 10 - len(stars_str) * 7.2, 27), stars_str, fill=(255, 195, 25), font=fonts['micro'])
    else:
        # Non-monster tech protocol line
        proto_tag = f'// PROTOCOL: {subtype.upper() if subtype else cat} SCRIPT'
        draw.text((10, 27), proto_tag, fill=(sub[0], sub[1], sub[2]), font=fonts['nano'])
        draw.text((w - 68, 27), 'STATUS: ARMED', fill=(50, 255, 120), font=fonts['nano'])

    # -------------------------------------------------------------
    # 9. Authentic PS1 Lore Excerpt / Terminal Log
    # -------------------------------------------------------------
    if desc:
        clean_desc = desc
        if len(clean_desc) > 42:
            clean_desc = clean_desc[:40] + '..'
        draw.text((10, 166), f'// LOG: {clean_desc}', fill=(140, 195, 215, 210), font=fonts['nano'])

    # -------------------------------------------------------------
    # 10. Bottom Combat Telemetry Module
    # -------------------------------------------------------------
    bot_y1 = 178
    bot_y2 = h - 6
    draw.rectangle([6, bot_y1, w - 6, bot_y2], fill=(5, 8, 16, 245), outline=(neon[0], neon[1], neon[2], 150), width=1)

    # Line 1: Name and Race badge
    nm = name.upper()
    if len(nm) > 20:
        nm = nm[:19] + '.'
    draw.text((10, bot_y1 + 4), nm, fill=(255, 255, 255), font=fonts['title'])
    race_badge = f'[{race.upper()}]' if race else f'[{cat}]'
    rw = len(race_badge) * 5.6
    draw.text((w - 10 - rw, bot_y1 + 5), race_badge, fill=neon, font=fonts['micro'])

    # Line 2: Combat Stats / Actions & Procedural Barcode
    stat_y = bot_y1 + 22
    if cat == 'MONSTER':
        # ATK Pill
        draw.rectangle([10, stat_y, 68, stat_y + 14], fill=(60, 10, 15, 200), outline=(255, 70, 70, 180), width=1)
        draw.text((13, stat_y + 1), f'⚔ {atk}', fill=(255, 120, 120), font=fonts['micro'])
        # DEF Pill
        draw.rectangle([74, stat_y, 132, stat_y + 14], fill=(10, 30, 60, 200), outline=(50, 170, 255, 180), width=1)
        draw.text((77, stat_y + 1), f'🛡 {df}', fill=(100, 205, 255), font=fonts['micro'])
    else:
        # Tech Function Pill
        fn_label = f'SYS: {subtype.upper() if subtype else cat}'
        draw.rectangle([10, stat_y, 115, stat_y + 14], fill=(10, 35, 30, 200), outline=(0, 230, 180, 180), width=1)
        draw.text((14, stat_y + 1), fn_label, fill=(0, 240, 200), font=fonts['micro'])

    # Procedural Mini Barcode Strip (Right side)
    bx = w - 66
    by = stat_y + 2
    for char in code[-8:]:
        val = int(char) if char.isdigit() else 3
        bw = 2 if val % 2 == 1 else 1
        b_alpha = 180 if val > 4 else 120
        draw.line([(bx, by), (bx, by + 10)], fill=(200, 230, 255, b_alpha), width=bw)
        bx += bw + 1

    # -------------------------------------------------------------
    # 11. Sci-Fi Chamfered Tech Corners & Accent Ticks
    # -------------------------------------------------------------
    k = 10
    for ox, oy, dx, dy in [(6, 6, 1, 1), (w - 6, 6, -1, 1), (6, h - 6, 1, -1), (w - 6, h - 6, -1, -1)]:
        draw.line([(ox, oy), (ox + dx * k, oy)], fill=neon, width=2)
        draw.line([(ox, oy), (ox, oy + dy * k)], fill=neon, width=2)
        # Small corner accent node
        draw.point((ox + dx * 3, oy + dy * 3), fill=(255, 255, 255, 220))

    # -------------------------------------------------------------
    # 12. Fine Horizontal CRT Scanline Overlay
    # -------------------------------------------------------------
    for sy in range(0, h, 3):
        draw.line([(0, sy), (w, sy)], fill=(0, 0, 0, 28), width=1)

    img.save(out_path, 'PNG', optimize=True)

def main():
    print("=" * 65)
    print(" Yu-Gi-Oh! Forbidden Memories — Cyberpunk 2.0 Card Art Generator")
    print(" Upgraded with full canonical PS1 dataset & 722 cards")
    print("=" * 65)

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    cards = load_canonical_database()
    fonts = get_fonts()

    total = len(cards)
    print(f"Loaded {total} cards. Generating high-resolution cyberpunk art into {ASSETS_DIR}...")
    start_time = time.time()

    for idx, card in enumerate(cards, start=1):
        cid = card['id']
        out_file = ASSETS_DIR / f"{cid}.png"
        generate_card_image(card, out_file, fonts)
        if idx % 100 == 0 or idx == total:
            elapsed = time.time() - start_time
            print(f"  [{idx:3d}/{total}] cards generated ({elapsed:.2f}s)...")

    duration = time.time() - start_time
    print("=" * 65)
    print(f"SUCCESS: Generated all {total} cyberpunk card images in {duration:.2f}s!")
    print(f"Target Directory: {ASSETS_DIR}")
    print("=" * 65)

if __name__ == '__main__':
    main()
