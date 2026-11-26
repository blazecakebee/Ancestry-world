"""Build the Ancestry World character pack from a folder of 4-direction pixel characters.

Input:  <src>/0/*.png (back), <src>/1/*.png (left), <src>/2/*.png (front), <src>/3/*.png (right), 64x64 RGBA.
Output: <out>/atlas.png   - every character x 4 directions, cropped to a fixed cell
        <out>/mask.png    - per-pixel material classes (R channel): 1 skin, 2 hair, 3 cloth, 4 metal, 5 detail/ink
        <out>/meta.json   - cell size, grid layout, and per-character tags used to match citizens to sprites

The game edits these sprites at runtime (recolour skin/hair, era clothing, body shape, role gear).
Usage: python tools/build_character_pack.py <src_dir> assets/packs/characters
"""
import json, os, sys, colorsys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
X0, Y0, CW, CH = 8, 6, 48, 54  # fixed crop window inside the 64x64 source (feet land near the bottom)

ids = sorted(int(f[:-4]) for f in os.listdir(os.path.join(SRC, '2')) if f.endswith('.png'))
COLS = 32
rows_per_dir = (len(ids) + COLS - 1) // COLS
atlas = Image.new('RGBA', (COLS * CW, rows_per_dir * CH * 4), (0, 0, 0, 0))
mask = Image.new('L', atlas.size, 0)


def lum(c): return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
def sat(c):
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in c[:3])); return s, l, h


def dominant(pixels, k=6):
    if len(pixels) == 0: return []
    vals, counts = np.unique(pixels, axis=0, return_counts=True)
    order = np.argsort(-counts)
    return [tuple(int(v) for v in vals[i]) for i in order[:k]]


def near(c, ramp, tol=34):
    return any(sum(abs(int(a) - int(b)) for a, b in zip(c, r)) <= tol for r in ramp)


tags = []
for n, cid in enumerate(ids):
    imgs = [np.array(Image.open(os.path.join(SRC, str(d), f'{cid}.png')).convert('RGBA')) for d in range(4)]
    front = imgs[2]
    a = front[:, :, 3] > 0
    ys, xs = np.where(a)
    top, bot = ys.min(), ys.max()
    hgt = bot - top
    cx = int(xs.mean())
    # skin ramp from the face (centre of the head, below the hairline)
    fy0, fy1 = top + int(hgt * 0.22), top + int(hgt * 0.40)
    face = front[fy0:fy1, cx - 5:cx + 5]
    fp = face[face[:, :, 3] > 0][:, :3]
    fp = np.array([p for p in fp if lum(p) > 60]) if len(fp) else fp
    skin_ramp = dominant(fp, 4)
    # hair ramp from the top of the head, excluding skin
    hp = front[top:top + int(hgt * 0.14), :][front[top:top + int(hgt * 0.14), :, 3] > 0][:, :3]
    hp = np.array([p for p in hp if lum(p) > 40 and not near(p, skin_ramp)]) if len(hp) else hp
    hair_ramp = dominant(hp, 4)

    def classify(c):
        if c[3] == 0: return 0
        L = lum(c)
        if L < 42: return 5
        if near(c, skin_ramp, 38): return 1
        if near(c, hair_ramp, 30): return 2
        s, l, _ = sat(c)
        if s < 0.16 and 0.32 < l < 0.92: return 4
        return 3

    counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    head_metal = 0
    for d, im in enumerate(imgs):
        crop = im[Y0:Y0 + CH, X0:X0 + CW]
        m = np.zeros((CH, CW), np.uint8)
        for y in range(CH):
            for x in range(CW):
                k = classify(crop[y, x]); m[y, x] = k
                if d == 2 and k:
                    counts[k] += 1
                    if k == 4 and (y + Y0) < top + hgt * 0.3: head_metal += 1
        col, row = n % COLS, n // COLS
        px, py = col * CW, (d * rows_per_dir + row) * CH
        atlas.paste(Image.fromarray(crop, 'RGBA'), (px, py))
        mask.paste(Image.fromarray(m * 40, 'L'), (px, py))
    total = sum(counts.values()) or 1
    fb = front[fy0:fy1, cx - 4:cx + 4]
    fpx = [c for row in fb for c in row if c[3]]
    face_skin = sum(1 for c in fpx if classify(c) == 1) / max(1, len(fpx))
    skin = skin_ramp[0] if skin_ramp else (230, 190, 150)
    s, l, h = sat(skin)
    human = (0.0 <= h <= 0.12 or h > 0.95) and s > 0.12  # oranges/browns = human skin; greens/blues/greys = exotic
    hair_below = 0
    if hair_ramp:
        for y in range(top + int(hgt * 0.42), top + int(hgt * 0.7)):
            for x in range(64):
                if front[y, x, 3] and near(front[y, x], hair_ramp, 30): hair_below += 1
    tags.append({
        'id': cid, 'cell': n,
        'skin': list(skin), 'skinL': round(l, 3), 'human': bool(human),
        'hair': list(hair_ramp[0]) if hair_ramp else None,
        'longHair': hair_below > 10,
        'armor': counts[4] / total > 0.18, 'helmet': head_metal > 25,
        'bare': counts[1] / total > 0.42, 'faceSkin': round(face_skin, 2),
        'top': int(top - Y0), 'bottom': int(bot - Y0), 'cx': int(cx - X0),
    })
    if n % 100 == 0: print(n, '/', len(ids))

atlas.save(os.path.join(OUT, 'atlas.png'), optimize=True)
mask.save(os.path.join(OUT, 'mask.png'), optimize=True)
json.dump({'cell': [CW, CH], 'cols': COLS, 'rowsPerDir': rows_per_dir, 'dirs': ['back', 'left', 'front', 'right'],
           'count': len(ids), 'chars': tags}, open(os.path.join(OUT, 'meta.json'), 'w'), separators=(',', ':'))
print('done', len(ids), 'characters ->', OUT)
