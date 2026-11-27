#!/usr/bin/env python3
"""Pack LimeZu 'Modern Farm' animals (32x32 set) into compact sheets: assets/packs/farm/<kind>_<n>.png
Each sheet: row0 = idle (6 frames), row1 = walk (6 frames), all side-view facing right, tightly cropped.
Usage: build_farm.py <SRC_DIR containing 32x32/> [REPO]"""
import sys, os, json
from PIL import Image
import numpy as np
SRC = sys.argv[1]; REPO = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..')
A = os.path.join(SRC, '32x32/Animals_32x32/'); OUT = os.path.join(REPO, 'assets/packs/farm'); os.makedirs(OUT, exist_ok=True)
# kind: (folder, [files or (file, cell w, cell h)], default cell w, cell h, idle row, walk row)
# Baby/duckling sheets use smaller cells; each variant is cropped on its own and bottom-centre aligned into a shared cell.
CFG = {
 'cow':     ('Cows_32x32', ['Cow_32x32', 'Cow_Caramel_32x32', 'Cow_Big_Black_32x32', 'Cow_Big_Caramel_32x32', 'Cow_Big_White_32x32', ('Cow_Baby_32x32', 64, 64), ('Cow_Baby_Caramel_32x32', 64, 64)], 96, 96, 1, 1),
 'sheep':   ('Sheeps_32x32', ['Sheep_White_32x32', 'Sheep_Black_32x32', 'Sheep_Brown_32x32', 'Sheep_Gray_32x32', 'Sheep_Yellow_32x32', ('Sheep_Baby_White_32x32', 64, 64), ('Sheep_Baby_Brown_32x32', 64, 64)], 64, 64, 1, 1),
 'dog':     ('Dogs_32x32', ['Dog_Labrador_Brown_32x32', 'Dog_Basenji_Orange_32x32', 'Dog_German_Shepherd_Brown_32x32', 'Dog_Labrador_White_32x32', 'Dog_Basenji_Brown_32x32', 'Dog_Basenji_Gray_32x32', 'Dog_German_Shepherd_Dark_Brown_32x32', 'Dog_German_Shepherd_Gray_32x32', 'Dog_Labrador_Dark_Brown_32x32'], 96, 64, 2, 4),
 'cat':     ('Cats_32x32', ['Cat_Hugo_32x32', 'Cat_Kira_32x32', 'Cat_Roxy_32x32', 'Cat_Rengy_32x32', 'Cat_Summer_32x32', 'Cat_Angel_32x32', 'Cat_Kitkat_32x32', 'Cat_Snacks_32x32', 'Cat_Truffle_32x32'], 64, 64, 4, 6),
 'horse':   ('Donkeys_32x32', ['Donkey_32x32', 'Donkey_Caramel_32x32', 'Donkey_Grey_32x32', 'Donkey_Light_Brown_32x32', ('Donkey_Baby_Brown_32x32', 64, 64), ('Donkey_Baby_Gray_32x32', 64, 64)], 96, 96, 1, 1),
 'pig':     ('Pigs_32x32', ['Pig_Pink_32x32', 'Pig_Pink_and_Brown_32x32', 'Pig_Spotted_Pink_32x32', 'Pig_Pink_Light_32x32', 'Pig_Spotted_Gray_32x32', 'Piglet_Gray_32x32', 'Piglet_Pink_Light_32x32'], 64, 64, 1, 1),
 'goat':    ('Goats_32x32', ['Goat_White_32x32', 'Goat_Brown_32x32', 'Goat_Black_Head_32x32', 'Goat_Brown_2_32x32', ('Goat_Baby_Brown_32x32', 64, 64), ('Goat_Baby_White_32x32', 64, 64)], 64, 96, 1, 1),
 'chicken': ('Chickens_and_Roosters_32x32', ['Chicken_Brown_32x32', 'Chicken_White_32x32', 'Chicken_Golden_32x32', 'Chicken_Gray_32x32', 'Rooster_Brown_32x32', 'Chicken_Brown_2_32x32', 'Chicken_Yellow_32x32', 'Chicken_Black_and_Brown_32x32', 'Rooster_Black_and_Brown_32x32', 'Rooster_Golden_32x32', 'Rooster_Gray_32x32', 'Rooster_White_32x32', 'Rooster_Yellow_32x32', 'Rooster_Brown_2_32x32', 'Chick_32x32'], 32, 32, 1, 1),
 'rabbit':  ('Rabbits_32x32', ['Rabbit_Brown_32x32', 'Rabbit_Gray_32x32', 'Rabbit_White_32x32', 'Rabbit_Spotted_32x32', 'Rabbit_Brown_Dark_Ears_32x32', 'Rabbit_Gray_and_White_32x32', ('Rabbit_Baby_Brown_32x32', 32, 32), ('Rabbit_Baby_Gray_32x32', 32, 32), ('Rabbit_Baby_White_32x32', 32, 32)], 64, 64, 1, 1),
 'duck':    ('Ducks_32x32', ['Duck_Brown_32x32', 'Duck_Green_Head_32x32', 'Duck_Red_Eyes_32x32', 'Duck_White_32x32', ('Duckling_Brown_32x32', 32, 32), ('Duckling_Yellow_32x32', 32, 32)], 64, 64, 1, 1),
}
man = {}
for kind, (folder, files, dcw, dch, ir, wr) in CFG.items():
    crops = []  # (frames {(row,col): Image}, w, h)
    for f in files:
        name, cw, ch = (f, dcw, dch) if isinstance(f, str) else f
        p = f'{A}{folder}/{name}.png'
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGBA'); a = np.array(im)[..., 3]
        bx0 = by0 = 9999; bx1 = by1 = 0
        for r in (ir, wr):
            for c in range(6):
                fr = a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]; ys, xs = np.nonzero(fr)
                if len(xs): bx0 = min(bx0, xs.min()); bx1 = max(bx1, xs.max() + 1); by0 = min(by0, ys.min()); by1 = max(by1, ys.max() + 1)
        if bx1 == 0: continue
        frames = {(ri, c): im.crop((c * cw + bx0, r * ch + by0, c * cw + bx1, r * ch + by1)) for ri, r in enumerate((ir, wr)) for c in range(6)}
        crops.append((frames, bx1 - bx0, by1 - by0))
    if not crops: print('skip', kind); continue
    W = max(c[1] for c in crops); H = max(c[2] for c in crops)
    names = []
    for n, (frames, w, h) in enumerate(crops):
        sheet = Image.new('RGBA', (6 * W, 2 * H))
        for (ri, c), fr in frames.items(): sheet.paste(fr, (c * W + (W - w) // 2, ri * H + (H - h)))
        nm = f'{kind}_{n}'; sheet.save(f'{OUT}/{nm}.png', optimize=True); names.append(nm)
    man[kind] = {'variants': names, 'w': int(W), 'h': int(H)}
    print(kind, len(names), W, H)
json.dump(man, open(f'{OUT}/manifest.json', 'w'))
import shutil; shutil.copy(os.path.join(SRC, 'LICENSE.txt'), f'{OUT}/LICENSE-ModernFarm.txt')

# ---- crops: every plant's 7 growth frames. Each source sheet has its '1 2 3' guide banner as the dark row;
# the plant rows sit just above it (tall plants use two stacked 32px rows). crops.png = 7 columns x 64px per crop (small plants bottom-aligned).
import numpy as np
CROPS = ['Wheat', 'Carrot', 'Cabbage', 'Corn', 'Pumpkin', 'Onion', 'Turnip', 'Tomato', 'Radish', 'Cauliflower', 'Pepper', 'Grape', 'Watermelon', 'Zuchini', 'Cotton', 'Pineapple', 'Prickly_Pear', 'Coffee']
SPECIAL = {'Turnip': (None, 1), 'Grape': (0, 1)}  # (upper row, lower row) overrides
rowsimg = []; tall = []
for c in CROPS:
    p = os.path.join(SRC, f'32x32/Crops_Growth_32x32/{c}_Growth_Stages_32x32.png')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGBA'); al = np.array(im)[..., 3]; n = im.height // 32
    cnt = [int((al[r * 32:(r + 1) * 32] > 0).sum()) for r in range(n)]
    b = next(r for r in range(n) if cnt[r] > 6000)  # the banner row
    up, lo = SPECIAL.get(c, (b - 2 if b >= 2 and cnt[b - 2] > 300 else None, b - 1))
    cell = Image.new('RGBA', (224, 64))
    cell.paste(im.crop((0, lo * 32, 224, lo * 32 + 32)), (0, 32))
    if up is not None: cell.paste(im.crop((0, up * 32, 224, up * 32 + 32)), (0, 0))
    rowsimg.append(cell); tall.append(1 if up is not None else 0)
sheet = Image.new('RGBA', (224, 64 * len(rowsimg)))
for i, r in enumerate(rowsimg): sheet.paste(r, (0, 64 * i))
sheet.save(f'{OUT}/crops.png', optimize=True)
json.dump({'tall': tall, 'names': CROPS}, open(f'{OUT}/crops.json', 'w'))
