#!/usr/bin/env python3
"""
Forbidden Memories Web Clone — Cyberpunk 3.0 "HUD Card" Art Generator

Layout theo ảnh mẫu (HUD card):
  [ Header: ID | PASS-progress bar | ATTR ]
  [ Tab CHARACTER/ITEM CARD | LV. n | ★ sparkles ]
  [ Viewport: lens xanh + lưới + vòng HUD tím + crosshair + sprite pixel-art ]
  [ Footer: TÊN [RACE] | ATK | DEF | dot-matrix ]

Dữ liệu: fmdata/cards_v.json (722 lá) + js/cards_full.js (icon) -> cards_db_cyberpunk.json

Chạy:
    python generate_cyberpunk_cards.py                  # toàn bộ 722 lá, 480x480
    python generate_cyberpunk_cards.py --only 1,2,3     # thử vài lá
    python generate_cyberpunk_cards.py --size 240       # kích thước cũ
    python generate_cyberpunk_cards.py --workers 4      # chạy đa tiến trình
Font đẹp hơn (tuỳ chọn, không cần admin): bỏ Orbitron-Bold.ttf vào thư mục scripts/fonts/
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

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
ROOT_DIR = PROJECT_DIR.parent
ASSETS_DIR = PROJECT_DIR / "assets" / "cards"
FMDATA_CARDS = ROOT_DIR / "fmdata" / "cards_v.json"
CARDS_FULL_JS = PROJECT_DIR / "js" / "cards_full.js"
DB_CACHE = SCRIPT_DIR / "cards_db_cyberpunk.json"
FONT_DIR = SCRIPT_DIR / "fonts"

D = 1000.0  # không gian thiết kế 1000x1000, mọi toạ độ bên dưới dùng đơn vị này

STAR_NAMES = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Pluto', 'Neptune', 'Mercury', 'Sun', 'Moon', 'Venus']
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
    'DARK':     {'neon': (255, 30, 200),  'sub': (160, 60, 255),  'bg': (14, 5, 28)},
    'ILLUSION': {'neon': (225, 60, 255),  'sub': (120, 90, 255),  'bg': (14, 6, 30)},
    'FIRE':     {'neon': (255, 85, 20),   'sub': (255, 200, 30),  'bg': (24, 8, 6)},
    'WATER':    {'neon': (0, 215, 255),   'sub': (0, 130, 255),   'bg': (6, 16, 30)},
    'EARTH':    {'neon': (0, 255, 135),   'sub': (210, 175, 40),  'bg': (8, 20, 10)},
    'WIND':     {'neon': (20, 255, 200),  'sub': (130, 255, 150), 'bg': (6, 22, 18)},
    'DIVINE':   {'neon': (255, 215, 0),   'sub': (255, 130, 0),   'bg': (24, 18, 6)},
    'MAGIC':    {'neon': (0, 255, 215),   'sub': (70, 160, 255),  'bg': (6, 16, 28)},
    'TRAP':     {'neon': (255, 20, 100),  'sub': (255, 130, 0),   'bg': (26, 6, 16)},
    'RITUAL':   {'neon': (255, 205, 30),  'sub': (170, 50, 255),  'bg': (20, 8, 30)},
    'EQUIP':    {'neon': (140, 120, 255), 'sub': (0, 230, 255),   'bg': (14, 10, 28)},
}

CYAN = (0, 214, 255)
YELLOW = (255, 214, 40)
RED = (255, 64, 80)
GREEN = (50, 255, 130)


# ─────────────────────────────────────────────────────────────
# Tiện ích màu / hình
# ─────────────────────────────────────────────────────────────
def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def rgba(c, a=255):
    return (int(c[0]), int(c[1]), int(c[2]), int(a))


def chamfer(x0, y0, x1, y1, c):
    """Hình chữ nhật vát góc. c = số hoặc (tl, tr, br, bl)."""
    tl, tr, br, bl = c if isinstance(c, (tuple, list)) else (c, c, c, c)
    return [(x0 + tl, y0), (x1 - tr, y0), (x1, y0 + tr), (x1, y1 - br),
            (x1 - br, y1), (x0 + bl, y1), (x0, y1 - bl), (x0, y0 + tl)]


# ─────────────────────────────────────────────────────────────
# Font
# ─────────────────────────────────────────────────────────────
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
            self.emoji_native = 109   # Noto bitmap emoji chỉ có 1 cỡ
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


# ─────────────────────────────────────────────────────────────
# Canvas: supersampling + glow cộng sáng (screen)
# ─────────────────────────────────────────────────────────────
class Pen:
    """Vẽ theo toạ độ thiết kế 1000x1000."""
    def __init__(self, cv, d):
        self.cv, self.d, self.k = cv, d, cv.k

    def _p(self, pts):
        return [(x * self.k, y * self.k) for x, y in pts]

    def w(self, v):
        return max(1, int(round(v * self.k)))

    def line(self, pts, fill, width=1):
        self.d.line(self._p(pts), fill=fill, width=self.w(width), joint='curve')

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.rectangle([x0 * self.k, y0 * self.k, x1 * self.k, y1 * self.k],
                         fill=fill, outline=outline, width=self.w(width))

    def poly(self, pts, fill=None, outline=None, width=1):
        P = self._p(pts)
        if fill:
            self.d.polygon(P, fill=fill)
        if outline:
            self.d.line(P + [P[0]], fill=outline, width=self.w(width), joint='curve')

    def ellipse(self, cx, cy, r, fill=None, outline=None, width=1):
        self.d.ellipse([(cx - r) * self.k, (cy - r) * self.k, (cx + r) * self.k, (cy + r) * self.k],
                       fill=fill, outline=outline, width=self.w(width))

    def arc(self, cx, cy, r, a0, a1, fill, width=1):
        self.d.arc([(cx - r) * self.k, (cy - r) * self.k, (cx + r) * self.k, (cy + r) * self.k],
                   a0, a1, fill=fill, width=self.w(width))

    def pie(self, cx, cy, rx, ry, a0, a1, fill):
        self.d.pieslice([(cx - rx) * self.k, (cy - ry) * self.k, (cx + rx) * self.k, (cy + ry) * self.k],
                        a0, a1, fill=fill)

    def sparkle(self, cx, cy, r, fill):
        t = 0.30
        pts = [(cx, cy - r), (cx + r * t, cy - r * t), (cx + r, cy), (cx + r * t, cy + r * t),
               (cx, cy + r), (cx - r * t, cy + r * t), (cx - r, cy), (cx - r * t, cy - r * t)]
        self.poly(pts, fill=fill)

    def text(self, x, y, s, font, fill, tracking=0.0, align='l'):
        """Chữ có letter-spacing. y = giữa dòng."""
        trk = tracking * self.k
        widths = [font.getlength(ch) for ch in s]
        total = sum(widths) + trk * max(0, len(s) - 1)
        cx = x * self.k
        if align == 'r':
            cx -= total
        elif align == 'c':
            cx -= total / 2
        for ch, wd in zip(s, widths):
            self.d.text((cx, y * self.k), ch, font=font, fill=fill, anchor='lm')
            cx += wd + trk


def text_width(font, s, tracking_px):
    return sum(font.getlength(ch) for ch in s) + tracking_px * max(0, len(s) - 1)


class Canvas:
    def __init__(self, size, ss, bg):
        self.out = int(size)
        self.px = int(size * ss)
        self.k = self.px / D
        self.img = Image.new('RGB', (self.px, self.px), bg)

    def new_layer(self, rgb=(0, 0, 0)):
        return Image.new('RGBA', (self.px, self.px), rgba(rgb, 0))

    def pen_layer(self, rgb=(0, 0, 0)):
        ov = self.new_layer(rgb)
        return ov, Pen(self, ImageDraw.Draw(ov))

    def commit(self, ov, glow=0.0, gain=1.0, mask=None, crisp=True):
        if mask is not None:
            ov.putalpha(ImageChops.multiply(ov.getchannel('A'), mask))
        if glow > 0:
            black = Image.new('RGB', ov.size, (0, 0, 0))
            black.paste(ov.convert('RGB'), (0, 0), ov.getchannel('A'))
            half = (self.px // 2, self.px // 2)
            small = black.resize(half, Image.BILINEAR).filter(ImageFilter.GaussianBlur(glow * self.k / 2))
            big = small.resize(self.img.size, Image.BILINEAR)
            if gain != 1.0:
                big = big.point(lambda v: min(255, int(v * gain)))
            self.img = ImageChops.screen(self.img, big)
        if crisp:
            self.img.paste(ov.convert('RGB'), (0, 0), ov.getchannel('A'))

    @contextmanager
    def fx(self, glow=0.0, gain=1.0, mask=None, crisp=True, rgb=(0, 0, 0)):
        ov, pen = self.pen_layer(rgb)
        yield pen
        self.commit(ov, glow, gain, mask, crisp)

    def radial(self, cx, cy, R, color, a_max, power=1.5, steps=56, soften=4, mask=None):
        ov, pen = self.pen_layer(color)
        for i in range(steps):
            t = i / steps
            pen.ellipse(cx, cy, R * (1 - t), fill=rgba(color, a_max * (t ** power)))
        ov = ov.filter(ImageFilter.GaussianBlur(soften * self.k))
        self.commit(ov, mask=mask)

    def poly_mask(self, pts, feather=0.0):
        m = Image.new('L', (self.px, self.px), 0)
        ImageDraw.Draw(m).polygon([(x * self.k, y * self.k) for x, y in pts], fill=255)
        if feather:
            m = m.filter(ImageFilter.GaussianBlur(feather * self.k))
        return m

    def circle_mask(self, cx, cy, r, feather=0.0):
        m = Image.new('L', (self.px, self.px), 0)
        ImageDraw.Draw(m).ellipse([(cx - r) * self.k, (cy - r) * self.k, (cx + r) * self.k, (cy + r) * self.k], fill=255)
        if feather:
            m = m.filter(ImageFilter.GaussianBlur(feather * self.k))
        return m


# ─────────────────────────────────────────────────────────────
# Sprite pixel-art từ emoji icon (giống nhân vật pixel trong ảnh mẫu)
# ─────────────────────────────────────────────────────────────
def make_sprite(bank, icon, fallback, target_px, tint, pix=30):
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

    low = sq.resize((pix, pix), Image.BOX)
    r, g, b, a = low.split()
    a = a.point(lambda v: 255 if v > 96 else 0)
    rgb = Image.merge('RGB', (r, g, b)).point(lambda v: min(255, (v // 40) * 40 + 20))  # posterize
    low = Image.merge('RGBA', (*rgb.split(), a))

    pad = 2
    base = Image.new('RGBA', (pix + 2 * pad, pix + 2 * pad), (0, 0, 0, 0))
    base.paste(low, (pad, pad))
    dil = base.getchannel('A').filter(ImageFilter.MaxFilter(3))   # viền đen 1 pixel
    outline = Image.new('RGBA', base.size, (0, 0, 0, 255))
    outline.putalpha(dil)
    spr = Image.alpha_composite(outline, base)

    scale = max(1, int(target_px // spr.width))
    spr = spr.resize((spr.width * scale, spr.height * scale), Image.NEAREST)

    # scanline ngang như ảnh mẫu
    step = max(2, scale // 2)
    stripes = Image.new('RGBA', spr.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(stripes)
    for y in range(0, spr.height, step * 2):
        sd.rectangle([0, y, spr.width, y + step - 1], fill=(0, 0, 0, 70))
    alpha = spr.getchannel('A')
    spr = Image.alpha_composite(spr, stripes)
    spr.putalpha(alpha)
    return spr


# ─────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────
# Vẽ icon vector nhỏ
# ─────────────────────────────────────────────────────────────
def icon_person(p, cx, cy, col):
    p.ellipse(cx, cy - 7, 6.5, fill=col)
    p.pie(cx, cy + 14, 12, 12, 180, 360, col)


def icon_cube(p, cx, cy, r, col):
    pts = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
           for a in (-90, -30, 30, 90, 150, 210)]
    p.poly(pts, fill=rgba(col, 235))
    for a in (-90, 30, 150):
        p.line([(cx, cy), (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))],
               fill=(255, 255, 255, 230), width=1.6)


def icon_swords(p, x, y, col):
    p.line([(x - 13, y + 15), (x + 13, y - 15)], fill=col, width=4.5)
    p.line([(x + 13, y + 15), (x - 13, y - 15)], fill=col, width=4.5)
    p.line([(x - 17, y + 8), (x - 6, y + 18)], fill=col, width=3)
    p.line([(x + 17, y + 8), (x + 6, y + 18)], fill=col, width=3)


def icon_shield(p, x, y, col):
    pts = [(x - 15, y - 14), (x, y - 20), (x + 15, y - 14), (x + 15, y + 2), (x, y + 20), (x - 15, y + 2)]
    p.poly(pts, fill=rgba(col, 235))
    p.poly([(x, y - 20), (x + 15, y - 14), (x + 15, y + 2), (x, y + 20)], fill=rgba(mix(col, (255, 255, 255), 0.35), 200))


def fit_font(bank, cv, text, max_w, size, min_size, tracking=0.0):
    """Thu nhỏ font, nếu vẫn dài thì cắt chữ + '.'."""
    s = size
    while s > min_size:
        f = bank.display(s * cv.k)
        if text_width(f, text, tracking * cv.k) <= max_w * cv.k:
            return f, text
        s -= 1
    f = bank.display(min_size * cv.k)
    while len(text) > 3 and text_width(f, text, tracking * cv.k) > max_w * cv.k:
        text = text[:-2].rstrip() + '.'
    return f, text


# ─────────────────────────────────────────────────────────────
# Render 1 lá bài
# ─────────────────────────────────────────────────────────────
def generate_card_image(card, out_path, bank, size=480, ss=2, show_log=True):
    cid = card['id']
    name = (card.get('name') or f'Card #{cid}').upper()
    cat = card.get('cat', 'MONSTER')
    race = (card.get('race') or '').upper()
    attr = card.get('attr', 'LIGHT')
    level = int(card.get('level') or 0)
    atk = int(card.get('atk') or 0)
    dfn = int(card.get('def') or 0)
    stars = [s for s in (card.get('starA'), card.get('starB')) if s]
    code = str(card.get('code') or '00000000')
    desc = card.get('desc') or ''
    icon = (card.get('icon') or '✨').strip().split()[0][:8] if card.get('icon') else '✨'
    subtype = (card.get('subtype') or '').upper()
    is_mon = (cat == 'MONSTER')

    pal = PALETTES.get(cat if cat in PALETTES else attr, PALETTES['LIGHT'])
    neon, sub, bg = pal['neon'], pal['sub'], pal['bg']
    lens = mix(sub, (30, 90, 255), 0.55)
    rim = mix(neon, (255, 255, 255), 0.35)

    cv = Canvas(size, ss, mix(bg, (0, 0, 0), 0.45))
    rng = random.Random(cid * 52919 + 71)
    k = cv.k
    CX, CY = 500, 451   # tâm lens

    # ── 1. Nền
    cv.radial(500, 430, 720, mix(bg, lens, 0.35), 150, power=1.3, soften=10)

    # ── 2. Panel viewport + lens
    panel_pts = chamfer(28, 148, 972, 728, (34, 34, 0, 0))
    panel_mask = cv.poly_mask(panel_pts)
    with cv.fx() as p:
        p.poly(panel_pts, fill=(6, 8, 26, 120))
    cv.radial(CX, CY, 400, lens, 175, power=1.1, soften=6, mask=panel_mask)

    lens_mask = ImageChops.multiply(cv.circle_mask(CX, CY, 392, feather=5), panel_mask)
    ov, p = cv.pen_layer(lens)
    for x in range(0, 1001, 24):
        p.line([(x, 0), (x, 1000)], fill=rgba(mix(lens, (255, 255, 255), 0.3), 55), width=1)
    for y in range(0, 1001, 24):
        p.line([(0, y), (1000, y)], fill=rgba(mix(lens, (255, 255, 255), 0.3), 55), width=1)
    cv.commit(ov, mask=lens_mask)

    with cv.fx(glow=3, mask=panel_mask) as p:
        p.arc(CX, CY, 400, 0, 360, rgba(lens, 150), 2)
    with cv.fx(glow=6, gain=1.2) as p:
        p.poly(panel_pts, outline=rgba(mix(sub, (90, 90, 255), 0.5), 200), width=2)

    # ── 3. Mạch điện 2 bên + đường ngang
    with cv.fx(glow=4) as p:
        for sx in (1, -1):
            X = (lambda x: x) if sx == 1 else (lambda x: 1000 - x)
            p.line([(X(80), 226), (X(98), 244), (X(98), 340)], fill=rgba(neon, 150), width=2)
            p.ellipse(X(98), 349, 8, fill=rgba(neon, 255))
            p.ellipse(X(46), 533, 3.5, fill=rgba(neon, 230))
            p.line([(X(44), 560), (X(60), 576), (X(60), 700)], fill=rgba(lens, 150), width=2)
        p.line([(75, 642), (925, 642)], fill=rgba(sub, 95), width=1.5)
        p.ellipse(75, 642, 3.5, fill=rgba(sub, 220))
        p.ellipse(925, 642, 3.5, fill=rgba(sub, 220))

    # ── 4. Bụi dữ liệu
    with cv.fx(glow=2) as p:
        for _ in range(34):
            a = rng.uniform(0, math.tau)
            r = rng.uniform(60, 370)
            x, y = CX + r * math.cos(a), CY + r * math.sin(a)
            if 160 < y < 710:
                col = rgba(rim, rng.randint(60, 190))
                p.rect(x, y, x + rng.choice((2, 3, 4)), y + 2, fill=col)

    # ── 5. Vòng HUD
    cv.radial(CX, CY, 230, neon, 105, power=2.0, soften=8)
    with cv.fx(glow=9, gain=1.4) as p:
        for a0 in range(-90, 270, 20):                       # vòng dày chia đoạn
            p.arc(CX, CY, 211, a0 + 2, a0 + 15, rgba(rim, 255), 10)
    with cv.fx(glow=5) as p:
        p.arc(CX, CY, 193, 0, 360, rgba(neon, 140), 2)
        for a0 in range(0, 360, 7):                          # vòng đứt nét ngoài
            p.arc(CX, CY, 238, a0, a0 + 3.5, rgba(neon, 190), 2.5)
        for a0 in (20, 110, 200, 290):                       # cung tím ngoài cùng
            p.arc(CX, CY, 264, a0, a0 + 55, rgba(sub, 130), 2)
            for t in range(6):
                p.arc(CX, CY, 276, a0 + 8 + t * 7, a0 + 11 + t * 7, rgba(sub, 150), 2)
        for ang in (-60, -30, 30, 60, 120, 150, 210, 240):   # tick la bàn
            rr = math.radians(ang)
            p.line([(CX + 214 * math.cos(rr), CY + 214 * math.sin(rr)),
                    (CX + 252 * math.cos(rr), CY + 252 * math.sin(rr))], fill=rgba(rim, 235), width=3)

    # ── 6. Crosshair
    with cv.fx(glow=7, gain=1.3) as p:
        c = rgba(neon, 255)
        for i in range(4):                                   # trên/dưới: thanh đứt nét
            y0 = CY - 286 + i * 26
            p.line([(CX, y0), (CX, y0 + 17)], fill=c, width=5)
            y1 = CY + 286 - i * 26
            p.line([(CX, y1), (CX, y1 - 17)], fill=c, width=5)
        p.line([(CX - 286, CY), (CX - 205, CY)], fill=c, width=4)
        p.line([(CX + 205, CY), (CX + 286, CY)], fill=c, width=4)
        p.line([(CX - 340, CY), (CX - 296, CY)], fill=rgba(neon, 120), width=2)
        p.line([(CX + 296, CY), (CX + 340, CY)], fill=rgba(neon, 120), width=2)

    # ── 7. Sprite pixel-art
    spr = make_sprite(bank, icon, name, int(250 * k), neon)
    sx = int(CX * k - spr.width / 2)
    sy = int(CY * k - spr.height / 2 - 4 * k)
    sil = cv.new_layer(neon)
    alpha = Image.new('L', cv.img.size, 0)
    alpha.paste(spr.getchannel('A'), (sx, sy))
    sil.putalpha(alpha.point(lambda v: int(v * 0.85)))
    cv.commit(sil, glow=22, gain=1.6, crisp=False)
    cv.img.paste(spr.convert('RGB'), (sx, sy), spr.getchannel('A'))

    with cv.fx(glow=3) as p:                                 # vạch scanner chấm
        x = CX + 178
        p.poly([(x, 355), (x + 6, 361), (x, 367), (x - 6, 361)], fill=(255, 255, 255, 255))
        for i in range(14):
            p.rect(x - 5, 376 + i * 12.5, x + 5, 376 + i * 12.5 + 7, fill=(255, 255, 255, 235))

    # ── 8. Header
    with cv.fx(glow=7, gain=1.3) as p:
        p.poly(chamfer(24, 18, 977, 114, 22), outline=rgba(neon, 255), width=4.5)
        p.line([(180, 118), (820, 118)], fill=rgba(neon, 230), width=2.5)
    with cv.fx(glow=3) as p:
        p.poly(chamfer(35, 28, 966, 104, 14), outline=rgba(mix(CYAN, sub, 0.4), 170), width=1.8)
        p.poly([(44, 36), (238, 36), (260, 66), (238, 96), (44, 96)], fill=(8, 12, 32, 210), outline=rgba(CYAN, 90), width=1.2)
        p.line([(715, 31), (745, 22), (910, 22), (925, 31)], fill=rgba(CYAN, 200), width=3)

    f_id = bank.display(46 * k)
    with cv.fx(glow=4) as p:
        p.text(62, 67, f'FM-{cid:03d}', f_id, rgba(YELLOW), tracking=1, align='l')

    num = int(code) if code.isdigit() else 0
    frac = max(0.04, min(1.0, num / 99999999.0))
    f_num = bank.display(33 * k)
    with cv.fx(glow=3) as p:
        p.text(300, 57, f'{num:08d} / 99999999', f_num, (214, 236, 255, 255), tracking=1)
        p.rect(300, 82, 690, 90, fill=(20, 40, 90, 170), outline=rgba(CYAN, 90), width=1)
        n = 48
        for i in range(n):
            if i / n > frac:
                break
            col = mix((0, 120, 255), (230, 250, 255), i / n)
            p.rect(300 + i * 390 / n, 82, 300 + (i + 1) * 390 / n + 0.6, 90, fill=rgba(col, 255))
    f_s = bank.display(19 * k)
    f_m = bank.display(25 * k)
    with cv.fx(glow=5, gain=1.2) as p:
        p.line([(812, 40), (802, 40), (802, 94), (812, 94)], fill=rgba(neon, 255), width=3)
        p.text(822, 56, 'ATTR' if is_mon else 'CLASS', f_s, rgba(neon, 255), tracking=2)
        p.text(822, 82, (attr if is_mon else cat), f_m, rgba(neon, 255), tracking=2)
        p.sparkle(940, 52, 10, rgba(neon, 255))
        p.sparkle(940, 82, 10, rgba(neon, 255))

    # ── 9. Tab + LV + sparkles
    f_tab = bank.display(19 * k)
    tabs = [
        (47, 'CHARACTER', is_mon, icon_person),
        (247, 'ITEM', not is_mon, None),
    ]
    for x0, label, active, ic in tabs:
        x1 = x0 + (187 if label == 'CHARACTER' else 170)
        shape = chamfer(x0, 122, x1, 184, (0, 12, 0, 12))
        edge = rgba(CYAN, 255) if active else rgba(mix(CYAN, (60, 60, 160), 0.6), 190)
        with cv.fx(glow=6 if active else 0, gain=1.2) as p:
            p.poly(shape, fill=(10, 30, 75, 230) if active else (12, 16, 42, 220), outline=edge, width=3 if active else 1.8)
            icol = rgba(CYAN, 255) if active else rgba((60, 130, 255), 235)
            if ic:
                icon_person(p, x0 + 33, 153, icol)
            else:
                icon_cube(p, x0 + 33, 153, 17, (50, 130, 255))
            tcol = (235, 248, 255, 255) if active else (190, 205, 235, 255)
            p.text(x0 + 66, 143, label, f_tab, tcol, tracking=1)
            p.text(x0 + 66, 165, 'CARD', f_tab, tcol, tracking=1)

    if is_mon:
        f_lv = bank.display(31 * k)
        with cv.fx(glow=4) as p:
            p.text(596, 141, f'LV. {level}', f_lv, rgba(YELLOW), tracking=0)
    else:
        lab = subtype or cat
        f_lv, lab = fit_font(bank, cv, lab, 108, 28, 14, 1)
        with cv.fx(glow=4) as p:
            p.text(596, 141, lab, f_lv, rgba(YELLOW), tracking=1)
    with cv.fx(glow=5) as p:
        p.poly(chamfer(716, 122, 884, 160, 8), fill=(45, 32, 0, 170), outline=rgba(YELLOW, 255), width=2)
        if is_mon:
            for i in range(8):
                on = i < min(level, 8)
                p.sparkle(734 + i * 19, 141, 8.5, rgba(YELLOW, 255 if on else 60))
        else:
            p.text(800, 141, 'ARMED', bank.display(19 * k), rgba(GREEN), tracking=2, align='c')

    # ── 10. Guardian Star chip + log
    if is_mon and stars:
        f_gs = bank.display(17 * k)
        slots = [(62, stars[0])] + ([(808, stars[1])] if len(stars) > 1 else [])
        for x0, s in slots:
            with cv.fx(glow=4) as p:
                p.poly(chamfer(x0, 672, x0 + 130, 706, 7), fill=(10, 14, 38, 220), outline=rgba(sub, 190), width=1.6)
                p.sparkle(x0 + 15, 689, 7.5, rgba(YELLOW))
                p.text(x0 + 30, 689, s.upper(), f_gs, (225, 235, 255, 255), tracking=1)
    if show_log and desc:
        f_log, txt = fit_font(bank, cv, '// LOG: ' + desc, 560, 13, 11)
        with cv.fx() as p:
            p.text(500, 706, txt, f_log, (125, 175, 205, 205), align='c')

    # ── 11. Footer
    foot = [(24, 762), (54, 732), (300, 732), (328, 722), (672, 722), (700, 732), (946, 732),
            (977, 762), (977, 960), (947, 990), (54, 990), (24, 960)]
    with cv.fx(glow=8, gain=1.3) as p:
        p.poly(foot, fill=(5, 7, 22, 245), outline=rgba(neon, 255), width=4.5)
    with cv.fx(glow=3) as p:
        p.poly(chamfer(37, 752, 964, 978, 20), outline=rgba(mix(neon, sub, 0.5), 200), width=2)
        for i in range(4):
            p.line([(40 + i * 8, 972), (52 + i * 8, 984)], fill=rgba(neon, 220), width=2)
            p.line([(960 - i * 8, 972), (948 - i * 8, 984)], fill=rgba(neon, 220), width=2)

    race_tag = f'[{race}]' if race else f'[{cat}]'
    f_tag, race_tag = fit_font(bank, cv, race_tag, 330, 34, 16, 2)
    tag_w = text_width(f_tag, race_tag, 2 * k) / k
    f_name, nm = fit_font(bank, cv, name, 850 - tag_w - 74, 44, 20, 2)
    with cv.fx(glow=4) as p:
        p.text(74, 786, nm, f_name, (245, 250, 255, 255), tracking=2)
    with cv.fx(glow=5, gain=1.2) as p:
        p.text(923, 786, race_tag, f_tag, rgba(neon, 255), tracking=2, align='r')
    with cv.fx(glow=3) as p:
        n = 60
        for i in range(n):
            col = mix(CYAN, neon, i / n)
            p.line([(63 + i * 874 / n, 820), (63 + (i + 1) * 874 / n + 1, 820)], fill=rgba(col, 255), width=2.5)

    f_stat = bank.display(40 * k)
    if is_mon:
        with cv.fx(glow=6, gain=1.2) as p:
            p.poly(chamfer(63, 842, 318, 904, 9), fill=(64, 6, 14, 215), outline=rgba(RED, 255), width=2.5)
            icon_swords(p, 98, 873, rgba(mix(RED, (255, 255, 255), 0.25)))
            p.text(145, 873, f'{atk}', f_stat, rgba(RED), tracking=1)
        with cv.fx(glow=6, gain=1.2) as p:
            p.poly(chamfer(343, 842, 619, 904, 9), fill=(6, 28, 66, 215), outline=rgba(CYAN, 255), width=2.5)
            icon_shield(p, 378, 873, CYAN)
            p.text(424, 873, f'{dfn}', f_stat, rgba(CYAN), tracking=1)
    else:
        fn = f'SYS: {subtype or cat}'
        f_fn, fn = fit_font(bank, cv, fn, 340, 30, 16, 2)
        with cv.fx(glow=6, gain=1.2) as p:
            p.poly(chamfer(63, 842, 460, 904, 9), fill=(6, 40, 30, 215), outline=rgba(GREEN, 255), width=2.5)
            p.text(88, 873, fn, f_fn, rgba(GREEN), tracking=2)

    # dot-matrix (sinh từ mã PS1 thật)
    bits = int(code) if code.isdigit() else 0
    with cv.fx(glow=2) as p:
        for r in range(6):
            for c in range(9):
                lit = ((bits >> ((r * 9 + c) % 27)) & 1) or (rng.random() < 0.35)
                p.ellipse(772 + c * 8.8, 852 + r * 10.4, 2.5,
                          fill=rgba((150, 190, 240), 230 if lit else 85))

    # ── 12. Scanline CRT + lưu
    out = cv.img.resize((cv.out, cv.out), Image.LANCZOS).convert('RGBA')
    scan = Image.new('RGBA', out.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(scan)
    step = max(2, round(cv.out / 160))
    for y in range(0, cv.out, step):
        sd.line([(0, y), (cv.out, y)], fill=(0, 0, 0, 22), width=1)
    out = Image.alpha_composite(out, scan).convert('RGB')
    out.save(out_path, 'PNG', optimize=True)


# ─────────────────────────────────────────────────────────────
# Chạy hàng loạt
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
    ap = argparse.ArgumentParser(description='Cyberpunk HUD card art generator')
    ap.add_argument('--size', type=int, default=480, help='kích thước ảnh xuất ra (px), mặc định 480')
    ap.add_argument('--ss', type=int, default=2, help='supersampling (1=nhanh, 2=đẹp, 3=rất mượt)')
    ap.add_argument('--only', type=str, default='', help='chỉ render các id, vd: 1,2,3')
    ap.add_argument('--out', type=str, default='', help='thư mục xuất (mặc định assets/cards)')
    ap.add_argument('--workers', type=int, default=max(1, min(4, (os.cpu_count() or 2) - 1)))
    ap.add_argument('--no-log', action='store_true', help='không vẽ dòng // LOG: mô tả')
    args = ap.parse_args()

    out_dir = Path(args.out) if args.out else ASSETS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 65)
    print(" Yu-Gi-Oh! Forbidden Memories — Cyberpunk 3.0 HUD Card Generator")
    print("=" * 65)

    cards = load_canonical_database()
    if args.only:
        wanted = {int(x) for x in args.only.split(',') if x.strip()}
        cards = [c for c in cards if c['id'] in wanted]

    bank = FontBank()
    print(f"Font hiển thị : {bank.display_path or '(mặc định PIL)'}")
    print(f"Font emoji    : {bank.emoji_path or '(không có -> dùng chữ cái đầu)'}")
    print(f"Cards: {len(cards)} | {args.size}px (ss x{args.ss}) | workers: {args.workers}")

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

    print("=" * 65)
    print(f"XONG: {total} ảnh trong {time.time() - t0:.1f}s -> {out_dir}")
    print("=" * 65)


if __name__ == '__main__':
    main()
