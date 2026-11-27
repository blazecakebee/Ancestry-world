#!/usr/bin/env python3
"""Tool art for the crafting system.

  python3 tools/build_tools.py <GandalfHardcore Emojis and Icons folder> <repo>

* Item icons (32x32) for every tool kind x material, cut from the Raven Fantasy Icons sheet that ships with the
  GandalfHardcore pack: iron and gold come straight from the sheet, wood and stone are recoloured from the iron ones.
* Held-item layers for the layered characters (assets/packs/gchar/hand): stone axes/picks/swords recoloured from
  iron, sickles from the hoe (every material), shovels drawn onto the stick at its tip (every material) and the
  fishing rod (the stick; the renderer adds the line). The manifest's hand lists are updated.
"""
import json, os, sys, colorsys
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
RAVEN = os.path.join(SRC, 'Free - Raven Fantasy Icons', 'Full Spritesheet', '32x32.png')
ITEMS = os.path.join(OUT, 'assets/packs/mfarm/items')
GCH = os.path.join(OUT, 'assets/packs/gchar')

# raven (row, col) of the iron version; the gold version sits 5 rows lower
ICON = {'axe': (91, 8), 'pickaxe': (91, 1), 'sword': (90, 7), 'shovel': (91, 13), 'sickle': (90, 11)}
ROD = {'wood': (21, 0), 'stone': (21, 0), 'iron': (21, 1), 'gold': (21, 1)}
PAL = {  # blade colours by material: dark -> light
    'wood': ((84, 52, 30), (184, 132, 80)),
    'stone': ((70, 70, 72), (170, 166, 158)),
    'gold': ((150, 96, 18), (255, 230, 112)),
}


def is_blade(px):
    r, g, b, a = px
    if a < 10: return False
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return s < 0.28 and v > 0.42


def recolor(im, mat, test=is_blade):
    if mat == 'iron': return im.copy()
    lo, hi = PAL[mat]
    out = im.copy(); px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            if not test(p): continue
            v = max(p[:3]) / 255
            t = min(1, max(0, (v - 0.42) / 0.58))
            px[x, y] = tuple(int(lo[i] + (hi[i] - lo[i]) * t) for i in range(3)) + (p[3],)
    return out


def icons():
    sheet = Image.open(RAVEN).convert('RGBA')
    cut = lambda r, c: sheet.crop((c * 32, r * 32, c * 32 + 32, r * 32 + 32))
    for kind, (r, c) in ICON.items():
        iron, gold = cut(r, c), cut(r + 5, c)
        iron.save(f'{ITEMS}/{kind}_iron.png'); gold.save(f'{ITEMS}/{kind}_gold.png')
        recolor(iron, 'wood').save(f'{ITEMS}/{kind}_wood.png'); recolor(iron, 'stone').save(f'{ITEMS}/{kind}_stone.png')
    for mat, (r, c) in ROD.items():
        im = cut(r, c)
        if mat == 'stone': im = recolor(im, 'stone', lambda p: p[3] > 10 and colorsys.rgb_to_hsv(*(q / 255 for q in p[:3]))[1] < 0.35)
        if mat == 'gold': im = recolor(im, 'gold', lambda p: p[3] > 10 and colorsys.rgb_to_hsv(*(q / 255 for q in p[:3]))[1] < 0.35)
        im.save(f'{ITEMS}/rod_{mat}.png')


def shovel_from(stick, axe, mat):
    """Paint a small spade blade on the stick tip nearest to where the axe head is, frame by frame."""
    W, H = 64, 56
    out = stick.copy(); op = out.load(); sp = stick.load(); ap = axe.load()
    lo, hi = PAL.get(mat, ((120, 120, 126), (226, 228, 232)))
    for fy in range(stick.height // H):
        for fx in range(stick.width // W):
            x0, y0 = fx * W, fy * H
            head = [(x, y) for y in range(y0, y0 + H) for x in range(x0, x0 + W) if is_blade(ap[x, y])]
            sticks = [(x, y) for y in range(y0, y0 + H) for x in range(x0, x0 + W) if sp[x, y][3] > 10]
            if not head or not sticks: continue
            hx = sum(p[0] for p in head) / len(head); hy = sum(p[1] for p in head) / len(head)
            tx, ty = min(sticks, key=lambda p: (p[0] - hx) ** 2 + (p[1] - hy) ** 2)
            # blade: a 4x4 rounded plate centred just past the tip, lit from the top-left
            for dy in range(-2, 2):
                for dx in range(-2, 2):
                    if abs(dx + 0.5) + abs(dy + 0.5) > 3: continue
                    x, y = tx + dx, ty + dy
                    if not (x0 <= x < x0 + W and y0 <= y < y0 + H): continue
                    t = 0.85 if (dx + dy) < -1 else 0.55 if (dx + dy) < 1 else 0.3
                    op[x, y] = tuple(int(lo[i] + (hi[i] - lo[i]) * t) for i in range(3)) + (255,)
            # dark rim so it reads on grass
            for dy in range(-3, 3):
                for dx in range(-3, 3):
                    x, y = tx + dx, ty + dy
                    if not (x0 <= x < x0 + W and y0 <= y < y0 + H) or op[x, y][3] > 10: continue
                    if any(0 <= x + a - x0 < W and 0 <= y + b - y0 < H and op[x + a, y + b][3] > 10 and op[x + a, y + b] != sp[x + a, y + b]
                           for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        op[x, y] = (40, 34, 30, 255)
    return out


def hands():
    man = json.load(open(f'{GCH}/manifest.json'))
    for s in ('m', 'f'):
        L = man['layers']['hand'][s]
        def save(name, im):
            im.save(f'{GCH}/hand/{s}_{name}.png')
            if name not in L: L.append(name)
        load = lambda n: Image.open(f'{GCH}/hand/{s}_{n}.png').convert('RGBA')
        for k in ('axe', 'pickaxe', 'sword'): save(f'stone_{k}', recolor(load(f'iron_{k}'), 'stone'))
        hoe = load('hoe_' + s)
        for mat in ('wood', 'stone', 'iron', 'gold'): save(f'{mat}_sickle', recolor(hoe, mat))
        stick, axe = load('stick'), load('iron_axe')
        for mat in ('wood', 'stone', 'iron', 'gold'): save(f'{mat}_shovel', shovel_from(stick, axe, mat if mat != 'iron' else None))
        save('rod', stick)
    json.dump(man, open(f'{GCH}/manifest.json', 'w'), separators=(',', ':'))


icons(); hands(); print('tool art written')
