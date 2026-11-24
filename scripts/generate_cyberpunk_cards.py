#!/usr/bin/env python3
"""
Forbidden Memories Web Clone — Cyberpunk Card Art Generator
Generates high-tech, futuristic cyberpunk artwork for all 722 cards.
Style features:
  - Deep cyber dark background with perspective cyberspace grid
  - Glowing attribute neon color palettes (Cyan, Magenta, Laser Orange, Matrix Green, etc.)
  - Dual neon HUD holographic rings with targeting reticles and tick marks
  - High-res central stylized glyph & emoji icon with back-glow
  - Top telemetry header (#FM-XXX, Attribute badge, sys indicators)
  - Bottom status HUD bar (Name, Type, ATK/DEF, Race)
  - Chamfered cyber corner brackets & horizontal CRT scanlines
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
ASSETS_DIR = PROJECT_DIR / "assets" / "cards"
DB_PATH = SCRIPT_DIR / "cards_db.json"

# Color Palettes by Attribute & Card Type
PALETTES = {
    'LIGHT':  {'neon': (0, 240, 255),   'sub': (0, 140, 210),  'bg': (6, 12, 24)},
    'DARK':   {'neon': (255, 0, 140),   'sub': (160, 0, 210),  'bg': (18, 6, 24)},
    'FIRE':   {'neon': (255, 75, 0),    'sub': (220, 0, 45),   'bg': (24, 8, 6)},
    'WATER':  {'neon': (0, 205, 255),   'sub': (0, 95, 230),   'bg': (6, 16, 28)},
    'EARTH':  {'neon': (0, 255, 125),   'sub': (185, 145, 0),  'bg': (8, 20, 10)},
    'WIND':   {'neon': (0, 255, 195),   'sub': (0, 175, 115),  'bg': (6, 22, 18)},
    'MAGIC':  {'neon': (0, 245, 212),   'sub': (0, 135, 255),  'bg': (6, 15, 28)},
    'TRAP':   {'neon': (255, 0, 85),    'sub': (205, 0, 135),  'bg': (24, 6, 16)},
    'RITUAL': {'neon': (255, 190, 11),  'sub': (135, 0, 235),  'bg': (20, 8, 28)}
}

def get_fonts():
    """Load system fonts with fallback."""
    font_paths = [
        'C:/Windows/Fonts/consolab.ttf',
        '/System/Library/Fonts/Monaco.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
    ]
    emoji_paths = [
        'C:/Windows/Fonts/seguiemj.ttf',
        '/System/Library/Fonts/Apple Color Emoji.ttc',
        '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
    ]

    mono_path = next((p for p in font_paths if os.path.exists(p)), None)
    emoji_path = next((p for p in emoji_paths if os.path.exists(p)), None)

    if mono_path:
        font_mono = ImageFont.truetype(mono_path, 10)
        font_mono_small = ImageFont.truetype(mono_path, 8)
    else:
        font_mono = ImageFont.load_default()
        font_mono_small = ImageFont.load_default()

    if emoji_path:
        font_emoji = ImageFont.truetype(emoji_path, 44)
    else:
        font_emoji = font_mono

    return font_mono, font_mono_small, font_emoji

def ensure_cards_db():
    """Ensure cards_db.json exists by generating from js/cards_full.js if needed."""
    if DB_PATH.exists():
        with open(DB_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)

    print("Extracting cards database from js/cards_full.js...")
    import subprocess
    cmd = [
        'node', '-e',
        """
        const fs = require('fs');
        require('./js/cards_full.js');
        const F = globalThis.FM.FULLDB;
        const list = [];
        for (const k in F.monsters) {
          const m = F.monsters[k];
          list.push({ id: m.id, name: m.name, type: 'MONSTER', race: m.race, attr: m.attr, atk: m.atk, def: m.def, icon: m.icon, stars: m.stars, code: m.code });
        }
        for (const k in F.magics) {
          const m = F.magics[k];
          list.push({ id: m.fid, name: m.name, type: 'MAGIC', kind: m.kind, desc: m.desc, icon: m.icon, code: m.code });
        }
        for (const k in F.traps) {
          const t = F.traps[k];
          list.push({ id: t.fid, name: t.name, type: 'TRAP', kind: t.kind, desc: t.desc, icon: t.icon, code: t.code });
        }
        for (const k in F.rituals) {
          const r = F.rituals[k];
          list.push({ id: r.fid, name: r.name, type: 'RITUAL', kind: 'ritual', desc: r.desc, icon: r.icon, code: r.code });
        }
        list.sort((a,b) => a.id - b.id);
        fs.writeFileSync('./scripts/cards_db.json', JSON.stringify(list, null, 2), 'utf8');
        """
    ]
    subprocess.run(cmd, cwd=str(PROJECT_DIR), check=True)
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_card_image(card, out_path, fonts):
    w, h = 200, 200
    font_mono, font_mono_small, font_emoji = fonts

    cid = card['id']
    name = card.get('name', f'Card #{cid}')
    kind = card.get('type', 'MONSTER')
    attr = card.get('attr') or kind
    race = card.get('race') or ''
    atk = card.get('atk', 0)
    df = card.get('def', 0)
    icon = card.get('icon') or '✨'

    pal = PALETTES.get(attr, PALETTES.get(kind, PALETTES['LIGHT']))
    neon = pal['neon']
    sub = pal['sub']
    bg = pal['bg']

    img = Image.new('RGBA', (w, h), (bg[0], bg[1], bg[2], 255))
    draw = ImageDraw.Draw(img)

    rng = random.Random(cid * 43911)

    # 1. Background central neon glow
    cx, cy = w // 2, h // 2 - 6
    for r in range(86, 16, -6):
        alpha = int(48 * (1 - r / 86))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(neon[0], neon[1], neon[2], alpha))

    # 2. Digital data stars / matrix particles
    for _ in range(24):
        px = rng.randint(12, w - 12)
        py = rng.randint(24, 118)
        pa = rng.randint(40, 160)
        draw.point((px, py), fill=(neon[0], neon[1], neon[2], pa))
        if rng.random() < 0.22:
            draw.line([(px, py), (px + rng.randint(3, 8), py)], fill=(neon[0], neon[1], neon[2], pa // 2))

    # 3. Perspective Cyberspace Synthwave Grid
    horizon_y = 120
    for gy in range(horizon_y + 2, h - 28, 5):
        dist = (gy - horizon_y)
        py = horizon_y + dist**1.28 * 0.16
        if py < h - 26:
            draw.line([(8, py), (w - 8, py)], fill=(sub[0], sub[1], sub[2], 55), width=1)
    for gx in range(12, w - 8, 20):
        draw.line([(cx + (gx - cx) * 0.22, horizon_y), (gx, h - 26)], fill=(sub[0], sub[1], sub[2], 45), width=1)

    # 4. Circuit board traces on left and right borders
    draw.line([(10, 35), (22, 35), (28, 41), (28, 65)], fill=(neon[0], neon[1], neon[2], 90), width=1)
    draw.ellipse([27, 64, 30, 67], fill=(neon[0], neon[1], neon[2], 180))
    draw.line([(w - 10, 35), (w - 22, 35), (w - 28, 41), (w - 28, 65)], fill=(neon[0], neon[1], neon[2], 90), width=1)
    draw.ellipse([w - 30, 64, w - 27, 67], fill=(neon[0], neon[1], neon[2], 180))

    # 5. Dual Neon HUD Holographic Rings & Tech Ticks
    draw.ellipse([cx - 44, cy - 44, cx + 44, cy + 44], outline=(neon[0], neon[1], neon[2], 100), width=1)
    draw.ellipse([cx - 39, cy - 39, cx + 39, cy + 39], outline=(neon[0], neon[1], neon[2], 210), width=2)
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        x1 = cx + 40 * math.cos(rad)
        y1 = cy + 40 * math.sin(rad)
        x2 = cx + 46 * math.cos(rad)
        y2 = cy + 46 * math.sin(rad)
        draw.line([(x1, y1), (x2, y2)], fill=(neon[0], neon[1], neon[2], 220), width=1)

    # Targeting Crosshairs
    draw.line([(cx - 50, cy), (cx - 43, cy)], fill=(neon[0], neon[1], neon[2], 240), width=2)
    draw.line([(cx + 43, cy), (cx + 50, cy)], fill=(neon[0], neon[1], neon[2], 240), width=2)
    draw.line([(cx, cy - 50), (cx, cy - 43)], fill=(neon[0], neon[1], neon[2], 240), width=2)
    draw.line([(cx, cy + 43), (cx, cy + 50)], fill=(neon[0], neon[1], neon[2], 240), width=2)

    # 6. Central Glyph / Icon
    clean_icon = icon.split()[0] if icon else '✨'
    if len(clean_icon) > 2:
        clean_icon = clean_icon[:2]
    try:
        bbox = draw.textbbox((0, 0), clean_icon, font=font_emoji, embedded_color=True)
        ew, eh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - ew // 2, cy - eh // 2 - 2), clean_icon, font=font_emoji, embedded_color=True)
    except Exception:
        draw.text((cx - 15, cy - 15), clean_icon, fill=(255, 255, 255), font=font_mono)

    # 7. Top Telemetry Header
    draw.rectangle([6, 6, w - 6, 21], fill=(5, 8, 16, 220), outline=(neon[0], neon[1], neon[2], 90), width=1)
    draw.text((10, 8), f'#FM{cid:03d}', fill=(255, 230, 80), font=font_mono_small)
    tag = f'[{attr}]' if kind == 'MONSTER' else f'[{kind}]'
    tw = len(tag) * 5.5
    draw.text((w - 12 - tw, 8), tag, fill=neon, font=font_mono_small)

    # 8. Bottom Status HUD Bar
    draw.rectangle([6, h - 30, w - 6, h - 6], fill=(5, 8, 16, 235), outline=(neon[0], neon[1], neon[2], 130), width=1)
    if kind == 'MONSTER':
        nm = (name[:14] + '..') if len(name) > 16 else name
        draw.text((10, h - 28), nm.upper(), fill=(255, 255, 255), font=font_mono_small)
        draw.text((w - 48, h - 28), race[:6].upper(), fill=neon, font=font_mono_small)
        # Stats
        draw.text((10, h - 17), f'⚔ {atk}', fill=(255, 100, 100), font=font_mono_small)
        draw.text((70, h - 17), f'🛡 {df}', fill=(100, 180, 255), font=font_mono_small)
    else:
        nm = (name[:18] + '..') if len(name) > 20 else name
        draw.text((10, h - 28), nm.upper(), fill=(255, 255, 255), font=font_mono_small)
        sub_type = card.get('kind', kind).upper()
        draw.text((10, h - 17), f'// SYS: {sub_type}', fill=neon, font=font_mono_small)
        draw.text((w - 45, h - 17), kind, fill=(255, 230, 80), font=font_mono_small)

    # 9. Outer Tech Corner Brackets
    k = 9
    for ox, oy, dx, dy in [(6, 6, 1, 1), (w - 6, 6, -1, 1), (6, h - 6, 1, -1), (w - 6, h - 6, -1, -1)]:
        draw.line([(ox, oy), (ox + dx * k, oy)], fill=neon, width=2)
        draw.line([(ox, oy), (ox, oy + dy * k)], fill=neon, width=2)

    # 10. Horizontal CRT Scanlines Overlay
    for sy in range(0, h, 3):
        draw.line([(0, sy), (w, sy)], fill=(0, 0, 0, 35), width=1)

    img.save(out_path, 'PNG', optimize=True)

def main():
    print("=" * 60)
    print(" Yu-Gi-Oh! Forbidden Memories — Cyberpunk Art Generator")
    print("=" * 60)

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    cards = ensure_cards_db()
    fonts = get_fonts()

    total = len(cards)
    print(f"Loaded {total} cards. Generating cyberpunk artwork into {ASSETS_DIR}...")
    start_time = time.time()

    for idx, card in enumerate(cards, start=1):
        cid = card['id']
        out_file = ASSETS_DIR / f"{cid}.png"
        generate_card_image(card, out_file, fonts)
        if idx % 100 == 0 or idx == total:
            elapsed = time.time() - start_time
            print(f"  [{idx:3d}/{total}] images generated ({elapsed:.2f}s)...")

    duration = time.time() - start_time
    print("=" * 60)
    print(f"SUCCESS: Generated all {total} cyberpunk card images in {duration:.2f}s!")
    print(f"Location: {ASSETS_DIR}")
    print("=" * 60)

if __name__ == '__main__':
    main()

