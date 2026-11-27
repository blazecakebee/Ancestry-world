#!/usr/bin/env python3
"""Fetch the UI icons we use from Pixel Atlas (pixelatlas.org — 1.4M CC0 16x16 sprites; made with Krea 2, see its licence note).
Needs network access to cdn.pixelatlas.org. Output: assets/packs/atlas/<ui-name>.png (16x16).
Each pick is (subject, column): the column-th of 10 evenly-spaced samples of that subject, exactly as the contact sheets showed them.
Usage: build_atlas.py [REPO]"""
import sys, os, json, urllib.request
import numpy as np
from PIL import Image
REPO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(REPO, 'assets/packs/atlas'); os.makedirs(OUT, exist_ok=True)
CACHE = '/tmp/pa'; os.makedirs(CACHE, exist_ok=True); B = 'https://cdn.pixelatlas.org/atlas/v1'
def get(name):
    p = f'{CACHE}/{name.replace("/", "_")}'
    if not os.path.exists(p):
        req = urllib.request.Request(f'{B}/{name}', headers={'User-Agent': 'Mozilla/5.0'}); open(p, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    return p
meta = json.load(open(get('meta.json'))); subj = json.load(open(get('subjects.json')))
cells = np.fromfile(get('cells.bin'), dtype='<u4'); off = np.concatenate([[0], np.cumsum([c for _, c in subj])]); names = [s for s, _ in subj]
def pick(subject, col, n=10):
    j = names.index(subject); a = cells[off[j]:off[j + 1]]
    return int(a[int(col * len(a) / n)]) if len(a) > n else int(a[col])
def sprite(e):
    side = meta['side']; i = meta['l2']['cells']; x, y = e % side, e // side
    t = Image.open(get(f'l2/{x // i}_{y // i}.webp')).convert('RGBA'); px, py = (x % i) * 16, (y % i) * 16
    return t.crop((px, py, px + 16, py + 16))
PICKS = {
  'globe': ('globe icon', 0), 'cloud': ('cloud icon', 0), 'gear': ('gear icon', 0), 'settings': ('gear icon', 0), 'save': ('floppy disk icon', 0), 'load': ('download arrow icon', 0),
  'inspect': ('magnifying glass icon', 0), 'flag': ('flag icon', 1), 'pin': ('map pin icon', 2), 'trophy': ('trophy icon', 0), 'book': ('book icon', 2), 'house': ('home icon', 2),
  'eye': ('eye icon', 3), 'star': ('star icon', 0), 'glitter': ('sparkle icon', 3), 'heart': ('heart icon', 0), 'crown': ('crown icon', 2), 'sword': ('sword icon', 2),
  'shield': ('shield icon', 5), 'skull': ('skull icon', 1), 'sun': ('sun icon', 0), 'rain': ('water drop icon', 0), 'wind': ('wind gust icon', 0), 'storm': ('storm cloud icon', 0),
  'fire': ('fire icon', 0), 'bulb': ('lightbulb icon', 0), 'lock': ('lock icon', 3), 'unlock': ('open padlock icon', 6), 'flask': ('potion icon', 2), 'medicine': ('potion icon', 4),
  'chat': ('speech bubble icon', 0), 'angry': ('anger mark icon', 1), 'research': ('spellbook', 0), 'rocket': ('rocket ship', 0), 'baby': ('baby rattle', 0), 'cradle': ('baby rattle', 3),
  'wheat': ('wheat plant', 0), 'rations': ('loaf of bread', 0), 'wood': ('wooden log', 3), 'stone': ('rock pile', 3), 'metal': ('ingot stack', 0), 'cloth': ('folded cloth', 5),
  'shirt': ('t-shirt', 0), 'meals': ('meat on a bone', 4), 'food': ('apple', 0), 'satellite': ('satellite', 0), 'sickle': ('sickle', 5), 'wave': ('ocean wave', 0), 'moon': ('crescent moon', 0),
  'pop': ('villager', 2), 'users': ('villager', 4), 'map': ('world map', 0), 'plan': ('blueprint', 5), 'hammer': ('hammer', 1), 'possess': ('ghost', 2), 'scroll': ('open scroll', 0),
  'love': ('heart map marker', 2), 'dove': ('white dove', 9), 'tree': ('oak tree', 3), 'hand': ('power fist', 6), 'temple': ('stone pillar', 6), 'ring': ('band ring', 1), 'volume': ('speaker icon', 7),
  'mountain': ('pointed rock', 0), 'info': ('question mark', 0), 'warning': ('electric shock icon', 0),
}
for k, (s, c) in PICKS.items():
    if k == 'multiplayer': continue  # hand-supplied harpy sprite (Pixel Atlas #507912), kept as-is
    sprite(pick(s, c)).save(f'{OUT}/{k}.png'); print(k, '<-', s, c)
open(f'{OUT}/README.txt', 'w').write('Icons from Pixel Atlas (https://pixelatlas.org) - sprites released CC0; generated with Krea 2 so Krea terms also apply to commercial use. Rebuild with tools/build_atlas.py\n')
