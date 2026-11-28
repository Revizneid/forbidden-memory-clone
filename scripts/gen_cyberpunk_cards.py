#!/usr/bin/env python3
"""
Forbidden Memories Web Clone — Cyberpunk Holographic Legendary Card Generator
Combines the Cyberpunk Holographic Legendary Card architecture (portrait 5:7)
with full canonical PS1 dataset and CLI options.
"""

import os
import sys
import json
import math
import random
import time
import argparse
from contextlib import contextmanager
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
ROOT_DIR = PROJECT_DIR.parent
ASSETS_DIR = PROJECT_DIR / "assets" / "cards"
ART_DIR = ASSETS_DIR / "art"
FMDATA_CARDS = ROOT_DIR / "fmdata" / "cards_v.json"
CARDS_FULL_JS = PROJECT_DIR / "js" / "cards_full.js"
DB_CACHE = SCRIPT_DIR / "cards_db_cyberpunk.json"
FONT_DIR = SCRIPT_DIR / "fonts"

D = 1000.0

STAR_NAMES = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Pluto', 'Neptune', 'Mercury', 'Sun', 'Moon', 'Venus']
CARD_TYPES = [
    'Dragon', 'Spellcaster', 'Zombie', 'Warrior', 'Beast-Warrior',
    'Beast', 'Winged Beast', 'Fiend', 'Fairy', 'Insect',
    'Dinosaur', 'Reptile', 'Fish', 'Sea Serpent', 'Machine',
    'Thunder', 'Aqua', 'Pyro', 'Rock', 'Plant',
    'Magic', 'Trap', 'Ritual', 'Equip'
]
ATTR_NAMES = ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND', 'ILLUSION', 'DIVINE']

DISPLAY_CANDIDATES = [
    FONT_DIR / 'Orbitron-Bold.ttf',
    FONT_DIR / 'Rajdhani-Bold.ttf',
    FONT_DIR / 'ShareTechMono-Regular.ttf',
    'C:/Windows/Fonts/consolab.ttf',
    'C:/Windows/Fonts/consola.ttf',
    '/System/Library/Fonts/Monaco.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf',
]
EMOJI_CANDIDATES = [
    'C:/Windows/Fonts/seguiemj.ttf',
    '/System/Library/Fonts/Apple Color Emoji.ttc',
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
]

def _first_existing(paths):
    for p in paths:
        if os.path.exists(str(p)):
            return str(p)
    return None

class FontBank:
    def __init__(self):
        self.display_path = _first_existing(DISPLAY_CANDIDATES)
        self.emoji_path = _first_existing(EMOJI_CANDIDATES)
        self.emoji_native = 128
        if self.emoji_path and 'NotoColorEmoji' in self.emoji_path:
            self.emoji_native = 109
        elif self.emoji_path and 'Apple' in self.emoji_path:
            self.emoji_native = 160
        self._cache = {}

    def display(self, px):
        px = max(6, int(round(px)))
        f = self._cache.get(px)
        if f is None:
            if self.display_path:
                f = ImageFont.truetype(self.display_path, px)
            else:
                try:
                    f = ImageFont.load_default(size=px)
                except TypeError:
                    f = ImageFont.load_default()
            self._cache[px] = f
        return f

def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))

def rgba(c, a=255):
    return (int(c[0]), int(c[1]), int(c[2]), int(a))

def chamfer(x0, y0, x1, y1, c):
    tl, tr, br, bl = c if isinstance(c, (tuple, list)) else (c, c, c, c)
    return [(x0 + tl, y0), (x1 - tr, y0), (x1, y0 + tr), (x1, y1 - br),
            (x1 - br, y1), (x0 + bl, y1), (x0, y1 - bl), (x0, y0 + tl)]

def make_sprite(bank, icon, fallback, target_px, tint, pix=72):
    tmp = None
    if bank.emoji_path and icon:
        try:
            size = bank.emoji_native
            font = ImageFont.truetype(bank.emoji_path, size)
            canvas = Image.new('RGBA', (size * 3, size * 3), (0, 0, 0, 0))
            ImageDraw.Draw(canvas).text((size // 2, size // 2), icon, font=font,
                                        embedded_color=True, fill=(255, 255, 255, 255))
            if canvas.getbbox():
                tmp = canvas
        except Exception:
            tmp = None
    if tmp is None:
        canvas = Image.new('RGBA', (400, 400), (0, 0, 0, 0))
        ImageDraw.Draw(canvas).text((200, 200), fallback[:1].upper() or '?', font=bank.display(240),
                                    fill=rgba(tint), anchor='mm')
        tmp = canvas

    tmp = tmp.crop(tmp.getbbox())
    side = max(tmp.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(tmp, ((side - tmp.width) // 2, (side - tmp.height) // 2))

    low = sq.resize((pix, pix), Image.Resampling.BILINEAR if pix >= 64 else Image.Resampling.BOX)
    r, g, b, a = low.split()
    a = a.point(lambda v: 255 if v > 64 else 0)
    low = Image.merge('RGBA', (r, g, b, a))

    pad = 2
    base = Image.new('RGBA', (pix + 2 * pad, pix + 2 * pad), (0, 0, 0, 0))
    base.paste(low, (pad, pad))
    dil = base.getchannel('A').filter(ImageFilter.MaxFilter(3))
    outline = Image.new('RGBA', base.size, (0, 0, 0, 255))
    outline.putalpha(dil)
    spr = Image.alpha_composite(outline, base)

    scale = max(1, int(target_px // spr.width))
    spr = spr.resize((spr.width * scale, spr.height * scale), Image.Resampling.LANCZOS if scale > 1 else Image.Resampling.NEAREST)

    step = max(2, scale // 2)
    stripes = Image.new('RGBA', spr.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(stripes)
    for y in range(0, spr.height, step * 2):
        sd.rectangle([0, y, spr.width, y + step - 1], fill=(0, 0, 0, 50))
    alpha = spr.getchannel('A')
    spr = Image.alpha_composite(spr, stripes)
    spr.putalpha(alpha)
    return spr

def load_canonical_database():
    if DB_CACHE.exists():
        try:
            with open(DB_CACHE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if len(data) == 722:
                    return data
        except Exception:
            pass

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

# ─────────────────────────────────────────────────────────────
# Cyberpunk Holographic Legendary Card renderer (portrait 5:7)
# ─────────────────────────────────────────────────────────────
def generate_card_image(card, out_path, bank, size=480, ss=2, show_log=True):
    cid = int(card.get('id') or 0)
    name = str(card.get('name') or f'Card #{cid}').strip()
    cat = str(card.get('cat') or 'MONSTER').upper()
    race = str(card.get('race') or cat).upper()
    attr = str(card.get('attr') or 'LIGHT').upper()
    level = max(0, int(card.get('level') or 0))
    atk = int(card.get('atk') or 0)
    dfn = int(card.get('def') or 0)
    code = str(card.get('code') or '00000000')
    desc = str(card.get('desc') or '').strip()
    icon = (str(card.get('icon') or '✨').strip().split() or ['✨'])[0][:8]
    subtype = str(card.get('subtype') or '').upper()
    is_mon = (cat == 'MONSTER')

    # Portrait 5:7 design space: 1000 x 1400. Output width follows size.
    W, H = 1000, 1400
    scale = max(1, int(ss))
    out_w = int(size)
    out_h = int(round(size * H / W))
    k = (out_w * scale) / W
    CW, CH = int(W * k), int(H * k)
    rng = random.Random(cid * 52919 + 71)

    palettes = {
        'LIGHT':    ((0, 224, 255), (255, 213, 92), (5, 15, 34)),
        'DARK':     ((238, 55, 255), (125, 75, 255), (15, 5, 30)),
        'WATER':    ((0, 220, 255), (35, 115, 255), (4, 14, 35)),
        'FIRE':     ((255, 90, 28), (255, 205, 70), (30, 8, 5)),
        'EARTH':    ((65, 255, 170), (213, 174, 70), (7, 22, 18)),
        'WIND':     ((60, 255, 215), (160, 255, 230), (5, 22, 27)),
        'DIVINE':   ((255, 220, 75), (255, 135, 35), (26, 17, 5)),
        'ILLUSION': ((218, 75, 255), (100, 120, 255), (17, 7, 32)),
        'MAGIC':    ((0, 245, 215), (70, 160, 255), (6, 16, 28)),
        'TRAP':     ((255, 40, 100), (255, 140, 0), (26, 6, 16)),
        'RITUAL':   ((255, 210, 30), (170, 60, 255), (20, 8, 30)),
        'EQUIP':    ((150, 125, 255), (0, 230, 255), (14, 10, 28))
    }
    pal_key = cat if cat in palettes else attr
    neon, accent, bg = palettes.get(pal_key, palettes['LIGHT'])
    gold = (226, 185, 82)
    pale_gold = (255, 232, 157)
    cyan = (76, 224, 255)

    im = Image.new('RGB', (CW, CH), bg)
    d = ImageDraw.Draw(im)

    def xy(v):
        return int(round(v * k))

    def box(coords):
        return tuple(xy(v) for v in coords)

    def font(px, bold=True):
        return bank.display(max(7, xy(px)))

    def fit_text(text, max_width, px, min_px=18):
        s = px
        while s > min_px:
            f = font(s)
            if d.textbbox((0, 0), text, font=f)[2] <= xy(max_width):
                return f
            s -= 1
        return font(min_px)

    def glow_rounded(rect, radius, outline, width=3, blur=12, alpha=170):
        layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.rounded_rectangle(box(rect), radius=xy(radius),
                             outline=(*outline, alpha), width=max(1, xy(width)))
        blurred = layer.filter(ImageFilter.GaussianBlur(xy(blur)))
        im.paste(ImageChops.screen(im, blurred.convert('RGB')))
        im.paste(layer.convert('RGB'), (0, 0), layer.getchannel('A'))

    # 1. Deep navy / cyberpunk background gradient + subtle radial light
    for y in range(CH):
        t = y / max(1, CH - 1)
        c = tuple(int(bg[i] * (1 - t * .42) + (2, 8, 24)[i] * (t * .42)) for i in range(3))
        d.line((0, y, CW, y), fill=c)

    # Soft radial aura behind the artwork
    aura = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ad = ImageDraw.Draw(aura)
    cx, cy = xy(500), xy(600)
    for r in range(420, 20, -12):
        alpha = int(2 + 18 * (1 - r / 420))
        ad.ellipse((cx-xy(r), cy-xy(r), cx+xy(r), cy+xy(r)), fill=(*neon, alpha))
    aura = aura.filter(ImageFilter.GaussianBlur(xy(30)))
    im.paste(ImageChops.screen(im, aura.convert('RGB')))

    # Fine digital circuit traces in the background
    circuit = Image.new('RGBA', im.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(circuit)
    for side in (0, 1):
        x = 38 if side == 0 else 962
        sign = 1 if side == 0 else -1
        for yy in (300, 430, 850, 960):
            pts = [(xy(x), xy(yy)), (xy(x + sign*22), xy(yy+18)), (xy(x + sign*22), xy(yy+78))]
            cd.line(pts, fill=(*neon, 105), width=xy(2))
            cd.ellipse((xy(x-3), xy(yy-3), xy(x+3), xy(yy+3)), fill=(*pale_gold, 170))
    im.paste(circuit.convert('RGB'), (0, 0), circuit.getchannel('A'))

    # 2. Outer card body and layered metallic frame
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(box((15, 15, 985, 1385)), radius=xy(34),
                        fill=(8, 13, 27), outline=(80, 92, 112), width=xy(8))
    d.rounded_rectangle(box((28, 28, 972, 1372)), radius=xy(27),
                        outline=gold, width=xy(13))
    d.rounded_rectangle(box((43, 43, 957, 1357)), radius=xy(20),
                        outline=pale_gold, width=xy(3))
    d.rounded_rectangle(box((53, 53, 947, 1347)), radius=xy(16),
                        outline=(94, 117, 145), width=xy(2))

    # 3. Gold title plate
    d.rounded_rectangle(box((76, 76, 790, 188)), radius=xy(12),
                        fill=(32, 36, 43), outline=gold, width=xy(5))
    d.rounded_rectangle(box((88, 88, 778, 176)), radius=xy(8),
                        fill=(13, 24, 40), outline=(127, 103, 55), width=xy(2))
    title = name.upper()
    title_font = fit_text(title, 650, 48, 22)
    d.text((xy(112), xy(132)), title, font=title_font, fill=(255, 239, 184),
           anchor='lm', stroke_width=max(0, xy(1)), stroke_fill=(89, 66, 32))

    # 4. Attribute orb on title row
    orb_x, orb_y, orb_r = 865, 132, 43
    orb = Image.new('RGBA', im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    od.ellipse(box((orb_x-orb_r, orb_y-orb_r, orb_x+orb_r, orb_y+orb_r)),
               fill=(*neon, 210), outline=(*pale_gold, 255), width=xy(5))
    orb = orb.filter(ImageFilter.GaussianBlur(xy(10)))
    im.paste(ImageChops.screen(im, orb.convert('RGB')))
    d = ImageDraw.Draw(im)
    d.ellipse(box((orb_x-orb_r, orb_y-orb_r, orb_x+orb_r, orb_y+orb_r)),
              fill=neon, outline=pale_gold, width=xy(5))
    d.ellipse(box((orb_x-25, orb_y-25, orb_x+25, orb_y+25)),
              fill=accent, outline=(255, 248, 210), width=xy(3))
    d.ellipse(box((orb_x-13, orb_y-13, orb_x+13, orb_y+13)), fill=(255, 248, 215))

    # 5. Level stars
    if is_mon:
        star_count = min(12, max(0, level))
        star_y = 226
        for i in range(star_count):
            sx = 104 + i * 72
            d.ellipse(box((sx-28, star_y-28, sx+28, star_y+28)),
                      fill=(118, 35, 18), outline=(255, 211, 88), width=xy(4))
            pts = []
            for j in range(10):
                a = -math.pi/2 + j*math.pi/5
                rr = 20 if j % 2 == 0 else 9
                pts.append((xy(sx + math.cos(a)*rr), xy(star_y + math.sin(a)*rr)))
            d.polygon(pts, fill=(255, 236, 132), outline=(255, 255, 220))
    else:
        d.text((xy(110), xy(226)), subtype or cat, font=font(28),
               fill=(*neon,), anchor='lm')

    # 6. Artwork window: dark glass, bevel, cyan holographic rim
    art_rect = (88, 275, 912, 1000)
    glow_rounded(art_rect, 18, neon, 5, 18, 190)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(box(art_rect), radius=xy(18), fill=(4, 12, 29),
                        outline=(181, 207, 228), width=xy(7))
    inner = (105, 292, 895, 983)
    d.rounded_rectangle(box(inner), radius=xy(12), fill=(5, 17, 39),
                        outline=(28, 115, 164), width=xy(3))

    # Check for dedicated artwork
    art_candidates = [
        ASSETS_DIR / 'art' / f'{cid}.png',
        PROJECT_DIR / 'assets' / 'card_art' / f'{cid}.png',
        ASSETS_DIR / f'{cid}_art.png',
    ]
    art_path = next((p for p in art_candidates if p.exists()), None)
    art_box = box((112, 299, 888, 976))
    aw, ah = art_box[2] - art_box[0], art_box[3] - art_box[1]
    if art_path:
        art = Image.open(art_path).convert('RGB')
        ratio = max(aw / art.width, ah / art.height)
        nw, nh = int(art.width * ratio), int(art.height * ratio)
        art = art.resize((nw, nh), Image.Resampling.LANCZOS)
        left, top = max(0, (nw-aw)//2), max(0, (nh-ah)//2)
        art = art.crop((left, top, left+aw, top+ah))
        art = ImageEnhance.Contrast(art).enhance(1.12)
        art = ImageEnhance.Color(art).enhance(1.18)
        tint = Image.new('RGB', art.size, (15, 115, 180))
        art = Image.blend(art, tint, 0.13)
        im.paste(art, (art_box[0], art_box[1]))
    else:
        spr = make_sprite(bank, icon, name, int(min(aw, ah) * 0.72), neon, pix=72)
        spr = spr.convert('RGBA')
        spr.thumbnail((int(aw*.78), int(ah*.78)), Image.Resampling.NEAREST)
        sx = art_box[0] + (aw - spr.width)//2
        sy = art_box[1] + (ah - spr.height)//2
        halo = Image.new('RGBA', im.size, (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo)
        hd.ellipse((sx-xy(55), sy-xy(55), sx+spr.width+xy(55), sy+spr.height+xy(55)),
                   fill=(*neon, 65))
        halo = halo.filter(ImageFilter.GaussianBlur(xy(42)))
        im.paste(ImageChops.screen(im, halo.convert('RGB')))
        im.paste(spr.convert('RGB'), (sx, sy), spr.getchannel('A'))

    # Holographic overlays: radial rings, scan lines, corner brackets
    overlay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for r in (250, 315, 380):
        od.ellipse(box((500-r, 640-r, 500+r, 640+r)),
                   outline=(*cyan, 55), width=xy(2))
    for y in range(305, 976, 9):
        od.line((xy(112), xy(y), xy(888), xy(y)), fill=(135, 225, 255, 16), width=xy(1))
    for x, y, sx, sy in ((112,299,1,1),(888,299,-1,1),(112,976,1,-1),(888,976,-1,-1)):
        od.line((xy(x),xy(y),xy(x+sx*45),xy(y)), fill=(*pale_gold,170), width=xy(4))
        od.line((xy(x),xy(y),xy(x),xy(y+sy*45)), fill=(*pale_gold,170), width=xy(4))
    im.paste(overlay.convert('RGB'), (0, 0), overlay.getchannel('A'))

    # 7. Description panel and stats block
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(box((88, 1025, 565, 1184)), radius=xy(12),
                        fill=(24, 30, 37), outline=(222, 157, 54), width=xy(7))
    d.rounded_rectangle(box((101, 1038, 552, 1171)), radius=xy(7),
                        fill=(12, 22, 37), outline=(117, 91, 48), width=xy(2))
    desc_text = desc if desc else f'{race} / {cat} CARD'
    max_chars = 43
    words, lines, line = desc_text.split(), [], ''
    for word in words:
        candidate = (line + ' ' + word).strip()
        if len(candidate) > max_chars and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    desc_font = font(19)
    for i, line_str in enumerate(lines[:5]):
        d.text((xy(120), xy(1060 + i*23)), line_str, font=desc_font,
               fill=(224, 214, 177), anchor='lm')

    # 8. ATK / DEF panel with illuminated dividers
    d.rounded_rectangle(box((592, 1025, 912, 1184)), radius=xy(12),
                        fill=(42, 36, 20), outline=(225, 190, 92), width=xy(5))
    d.rounded_rectangle(box((606, 1039, 898, 1170)), radius=xy(7),
                        fill=(17, 28, 43), outline=(114, 105, 69), width=xy(2))
    d.line((xy(620), xy(1104), xy(884), xy(1104)), fill=(125, 171, 194), width=xy(2))
    stat_font = font(39)
    d.text((xy(630), xy(1070)), f'ATK  {atk:04d}', font=stat_font,
           fill=(255, 105, 92), anchor='lm', stroke_width=xy(1), stroke_fill=(80, 15, 25))
    d.text((xy(630), xy(1138)), f'DEF  {dfn:04d}', font=stat_font,
           fill=(89, 220, 255), anchor='lm', stroke_width=xy(1), stroke_fill=(5, 48, 80))

    # 9. Footer metadata strip
    d.rounded_rectangle(box((88, 1210, 912, 1318)), radius=xy(10),
                        fill=(8, 15, 29), outline=gold, width=xy(3))
    type_label = f'{race}  |  {attr}'
    d.text((xy(112), xy(1245)), type_label[:48], font=font(22),
           fill=(220, 229, 239), anchor='lm')
    d.text((xy(112), xy(1285)), f'FM-{cid:03d}   •   CODE {code}',
           font=font(18), fill=(120, 190, 218), anchor='lm')
    d.text((xy(888), xy(1280)), 'LEGENDARY', font=font(20),
           fill=(*pale_gold,), anchor='rm')

    # Tiny gold corner screws and controlled CRT finish
    d = ImageDraw.Draw(im)
    for x in (62, 938):
        for y in (62, 1338):
            d.ellipse(box((x-7, y-7, x+7, y+7)), fill=(37, 43, 53),
                      outline=pale_gold, width=xy(2))
            d.line((xy(x-3),xy(y),xy(x+3),xy(y)), fill=(180,160,110), width=xy(1))

    scan = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(scan)
    for y in range(0, CH, max(2, xy(5))):
        sd.line((0, y, CW, y), fill=(0, 8, 20, 15), width=1)
    im = Image.alpha_composite(im.convert('RGBA'), scan)

    im = im.convert('RGB').resize((out_w, out_h), Image.Resampling.LANCZOS)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    im.save(out_path, 'PNG', optimize=True)

# ─────────────────────────────────────────────────────────────
# Multiprocess worker & main
# ─────────────────────────────────────────────────────────────
_BANK = None

def _worker(job):
    global _BANK
    card, out_file, size, ss, log = job
    if _BANK is None:
        _BANK = FontBank()
    generate_card_image(card, out_file, _BANK, size, ss, log)
    return card['id']

def main():
    ap = argparse.ArgumentParser(description='Cyberpunk Holographic Legendary Card generator')
    ap.add_argument('--size', type=int, default=480, help='kích thước chiều ngang (px), mặc định 480')
    ap.add_argument('--ss', type=int, default=2, help='supersampling (1=nhanh, 2=đẹp)')
    ap.add_argument('--only', type=str, default='', help='chỉ render các id, vd: 1,2,3')
    ap.add_argument('--out', type=str, default='', help='thư mục xuất (mặc định assets/cards)')
    ap.add_argument('--workers', type=int, default=max(1, min(5, (os.cpu_count() or 2) - 1)))
    ap.add_argument('--no-log', action='store_true', help='không vẽ log')
    args = ap.parse_args()

    out_dir = Path(args.out) if args.out else ASSETS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 68)
    print(" Yu-Gi-Oh! Forbidden Memories — Cyberpunk Holographic Legendary Cards")
    print("=" * 68)

    cards = load_canonical_database()
    if args.only:
        wanted = {int(x) for x in args.only.split(',') if x.strip()}
        cards = [c for c in cards if c['id'] in wanted]

    bank = FontBank()
    print(f"Font hiển thị : {bank.display_path or '(mặc định PIL)'}")
    print(f"Font emoji    : {bank.emoji_path or '(không có -> dùng chữ cái đầu)'}")
    print(f"Cards: {len(cards)} | {args.size}x{int(round(args.size*14/10))}px (ss x{args.ss}) | workers: {args.workers}")

    jobs = [(c, out_dir / f"{c['id']}.png", args.size, args.ss, not args.no_log) for c in cards]
    t0 = time.time()
    total = len(jobs)
    if args.workers > 1 and total > 4:
        with ProcessPoolExecutor(max_workers=args.workers) as ex:
            for i, _ in enumerate(ex.map(_worker, jobs, chunksize=4), start=1):
                if i % 50 == 0 or i == total:
                    print(f"  [{i:3d}/{total}] {time.time() - t0:.1f}s")
    else:
        for i, job in enumerate(jobs, start=1):
            generate_card_image(job[0], job[1], bank, job[2], job[3], job[4])
            if i % 50 == 0 or i == total:
                print(f"  [{i:3d}/{total}] {time.time() - t0:.1f}s")

    print("=" * 68)
    print(f"XONG: {total} ảnh trong {time.time() - t0:.1f}s -> {out_dir}")
    print("=" * 68)

if __name__ == '__main__':
    main()
