#!/usr/bin/env python3
"""Build the game-ready art packs from the purchased/downloaded asset folders.
Usage: python3 tools/build_assets.py <SRC_DIR> [<REPO_DIR>]
SRC_DIR = folder containing the extracted packs (GandalfHardcore..., VerArc..., Pixel Fire..., Super Pixel Effects...).
Writes assets/packs/{gandalf,verarc,fx}/ and manifests. Needs Pillow + numpy + scipy."""
import sys, os, re, json, shutil, glob
from PIL import Image
import numpy as np
from scipy import ndimage

SRC = sys.argv[1]; REPO = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
G = os.path.join(SRC, 'GandalfHardcore Emojis and Icons')
PLAT = os.path.join(G, 'GandalfHardcore FREE Platformer Assets')
OUT = os.path.join(REPO, 'assets', 'packs')

def comps(im, gap=1, minpx=5, region=None):
    a = np.array(im.convert('RGBA'))[:, :, 3] > 8
    d = ndimage.binary_dilation(a, iterations=gap) if gap else a
    lab, n = ndimage.label(d); out = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        ys, xs = sl; m = (lab[sl] == i) & a[sl]
        if m.sum() < minpx: continue
        # tight bbox of real pixels
        yy, xx = np.nonzero(m); x0, y0 = xs.start + xx.min(), ys.start + yy.min()
        r = [int(x0), int(y0), int(xx.max() - xx.min() + 1), int(yy.max() - yy.min() + 1)]
        if region and not (region[0] <= r[0] < region[2] and region[1] <= r[1] < region[3]): continue
        out.append(r)
    out.sort(key=lambda r: (r[1] // 10, r[0])); return out

def tone(im, r):
    """'g'reen / 'a'utumn / 's'now class of a sprite rect by mean colour."""
    c = np.array(im.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])).convert('RGBA')).reshape(-1, 4)
    c = c[c[:, 3] > 8][:, :3].astype(float)
    if not len(c): return 'g'
    R, Gc, B = c.mean(0)
    if B > R + 4 and B > 150: return 's'
    if R > Gc + 18: return 'a'
    return 'g'

def main():
    shutil.rmtree(os.path.join(OUT, 'gandalf'), ignore_errors=True)
    for d in ('gandalf', 'verarc', 'fx'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
    gd = os.path.join(OUT, 'gandalf'); man = {'sheets': {}, 'frames': {}}

    # ---- whole sheets copied as-is (all tiny) ----
    keep = ['Tree1', 'Tree2', 'Tree3', 'Tree4', 'Birch1', 'Birch2', 'Birch3', 'Flowering Tree', 'Large Pine Tree',
            'Weeping Willow1', 'Weeping Willow2', 'Weeping Willow3', 'Large Tent', 'Small Tent', 'Workbench', 'Torch',
            'Bonsai', 'Ores', 'Wheat', 'Tall Grass', 'Boat', 'Alchemy Decor', 'Angel Statue', 'Decor', 'Garden Decorations',
            'Pine Trees', 'Furnace and Sawmill', 'Cooking area', 'Christmas tree', 'sun', 'hot air balloon', 'cloud6', 'cloud5', 'cloud4']
    ims = {}
    for k in keep:
        f = os.path.join(PLAT, k + '.png'); slug = re.sub(r'[^a-z0-9]+', '_', k.lower()).strip('_')
        shutil.copy(f, os.path.join(gd, slug + '.png')); ims[slug] = Image.open(f).convert('RGBA'); man['sheets'][slug] = [ims[slug].width, ims[slug].height]
    for n in ('Campfire sheet', 'Campfire with food sheet'):
        f = os.path.join(PLAT, 'Animated Sprites', n + '.png'); slug = re.sub(r'[^a-z0-9]+', '_', n.lower()).strip('_')
        shutil.copy(f, os.path.join(gd, slug + '.png')); man['sheets'][slug] = list(Image.open(f).size)

    # ---- decor: named props + classified tufts/rocks/bushes ----
    dec = ims['decor']; c1 = comps(dec, 1); c0 = comps(dec, 0)
    named = {  # gap=1 component index -> name (see tools/decor_index.png for the numbering)
        1: 'chopblock', 2: 'stump_axe', 3: 'table_set', 5: 'barrel', 6: 'barrels2', 7: 'stool', 8: 'cauldron', 9: 'table_small',
        10: 'apples_s', 11: 'apples_l', 12: 'bottles', 15: 'basket_apples', 17: 'logpile', 18: 'table', 19: 'basket', 20: 'basket2',
        22: 'grave1', 23: 'grave2', 24: 'grave3', 25: 'cross', 26: 'grave4', 30: 'pumpkin_j', 33: 'cattails', 34: 'wall',
        53: 'scarecrow', 60: 'pumpkin', 62: 'pumpkins', 69: 'statue', 77: 'clothesline', 4: 'crate_wide'}
    for i, nm in named.items():
        if i < len(c1): man['frames']['decor:' + nm] = ['decor'] + c1[i]
    # tents: two canvas tents sit side by side in the top band (merged with the cauldron stand, so crop by hand)
    def tight(im, box):
        arr = np.array(im.crop(box))[:, :, 3] > 8; yy, xx = np.nonzero(arr)
        return [box[0] + int(xx.min()), box[1] + int(yy.min()), int(xx.max() - xx.min() + 1), int(yy.max() - yy.min() + 1)]
    man['frames']['decor:tent0'] = ['decor'] + tight(dec, (0, 56, 96, 94))
    man['frames']['decor:tent1'] = ['decor'] + tight(dec, (97, 56, 193, 94))
    # big props
    # crate stack = tall one in first band
    for r in c1:
        if r[1] < 5 and r[3] > 40 and r[0] < 120 and r[0] > 80: man['frames']['decor:crates'] = ['decor'] + r
    # classified nature bits (below y=300, left of x=860, ignoring the named ones already used)
    used = {tuple(man['frames'][k][1:]) for k in man['frames']}
    cls = {'tuft': [], 'rock': [], 'bigrock': [], 'bush': [], 'pile': []}
    for r in c0:
        if r[1] < 140 or tuple(r) in used: continue
        x, y, w, h = r
        if x > 855 and y < 600: continue            # cattails / wall / scarecrow / pumpkins region handled by name
        if x > 1100 // 3: pass
        t = tone(dec, r)
        if h > 50 and w < 14: continue                       # clothesline poles
        if h <= 12 and w <= 40: cls['tuft'].append(r + [t])
        elif w >= 80 and h >= 38 and y < 330: cls['bigrock'].append(r + [t])
        elif y > 330 and h < 60 and w > 36 and 'bush' == 'x': pass
        elif y >= 400 and h >= 22 and w >= 40:
            cls['bush'].append(r + [t])
        elif w / max(1, h) >= 2.6 and w > 55: cls['pile'].append(r + [t])
        elif h > 14: cls['rock'].append(r + [t])
    man['nature'] = {k: [['decor'] + v for v in vs] for k, vs in cls.items()}

    # ---- garden decor / pine trees / furnace / cooking: grid frames ----
    gar = ims['garden_decorations']; man['garden'] = [['garden_decorations'] + r for r in comps(gar, 1)]
    pin = ims['pine_trees']; man['pines'] = [['pine_trees'] + r + [tone(pin, r)] for r in comps(pin, 0, minpx=40) if r[3] >= 100]
    man['grid'] = {'cooking_area': [64, 64, 12], 'furnace_and_sawmill': [64, 64, 12], 'torch': [32, 32, 6], 'campfire_sheet': [32, 32, 5],
                   'campfire_with_food_sheet': [32, 32, 5], 'tall_grass': [32, 32, 3], 'wheat': [32, 32, 8], 'ores': [64, 64, 2]}

    # ---- VerArc skill icons (16x16) ----
    va = os.path.join(SRC, '[VerArc Stash] Basic_Skills_and_Buffs'); names = []
    for sub, pre in (('Buffs', 'buff_'), ('Debuffs', 'debuff_')):
        for i, f in enumerate(sorted(os.listdir(os.path.join(va, sub))), 1):
            shutil.copy(os.path.join(va, sub, f), os.path.join(OUT, 'verarc', f'{pre}{i}.png')); names.append(f'{pre}{i}')
    for f in sorted(os.listdir(os.path.join(va, 'Spells'))):
        stem = re.sub(r'[()]', '', f[:-4]); shutil.copy(os.path.join(va, 'Spells', f), os.path.join(OUT, 'verarc', stem + '.png')); names.append(stem)
    json.dump(names, open(os.path.join(OUT, 'verarc', 'index.json'), 'w'))

    # ---- fire (frame strips) + smoke ----
    fx = {}; fo = os.path.join(OUT, 'fx')
    base = os.path.join(SRC, 'Pixel Fire Asset Pack Colored')
    for col in ('red', 'yellow', 'blue', 'green', 'purple', 'white'):
        d = os.path.join(base, f'fire asset {col}')
        for gname in sorted(os.listdir(d)):
            p = os.path.join(d, gname, gname + '.png')
            if os.path.exists(p):
                key = f'fire_{col}_{re.sub(r"[^0-9]+", "_", gname).strip("_")}'; shutil.copy(p, os.path.join(fo, key + '.png')); fx[key] = list(Image.open(p).size)
    sd = os.path.join(base, 'fire asset smoke')
    for gname in sorted(os.listdir(sd)):
        p = os.path.join(sd, gname, gname + '.png')
        if os.path.exists(p):
            key = 'smoke_' + ('dark' if 'Dark' in gname else 'light') + '_' + re.sub(r'[^0-9]+', '', gname); shutil.copy(p, os.path.join(fo, key + '.png')); fx[key] = list(Image.open(p).size)
    # Super Pixel Effects: copy the 'small' spritesheet+txt of every free animation (sheet png + frame rects)
    sp = os.path.join(SRC, 'Super Pixel Effects Gigapack (Free Version)', 'spritesheet'); spx = {}
    for png in glob.glob(os.path.join(sp, '*', '*', '*', 'spritesheet.png')):
        parts = png.split(os.sep); anim = parts[-2]; sz = 'large' if '_large_' in anim else 'small'
        if sz != 'small': continue
        name = re.sub(r'_small_[a-z]+$', '', anim)
        rects = []
        for ln in open(png[:-4] + '.txt'):
            m = re.search(r'= (\d+) (\d+) (\d+) (\d+)', ln)
            if m: rects.append([int(v) for v in m.groups()])
        key = 'spx_' + name; shutil.copy(png, os.path.join(fo, key + '.png')); spx[key] = {'size': list(Image.open(png).size), 'frames': rects, 'cat': parts[-4]}
    man['fx'] = fx; man['spx'] = spx
    json.dump(man, open(os.path.join(gd, 'manifest.json'), 'w'), separators=(',', ':'))
    shutil.copy(os.path.join(SRC, 'Super Pixel Effects Gigapack (Free Version)', 'license.txt'), os.path.join(fo, 'SPEG-license.txt'))
    print('frames', len(man['frames']), {k: len(v) for k, v in man['nature'].items()}, 'garden', len(man['garden']), 'pines', len(man['pines']), 'fire', len(fx), 'spx', len(spx))

main()

# ---------------------------------------------------------------------------------------------------------------
# Gandalf layered characters -> compact sheets. Source frames are 80x64 in an 800x448 sheet (10 x 7). We keep every
# animation row and crop each frame to a 64x56 cell:  0 idle(5)  1 walk(8)  2 run(8)  3 jump(4)  4 flail(4)
# 5 attack(6)  6 death(10, last = lying).
CELL_W, CELL_H, CROP_X, CROP_Y = 64, 56, 8, 8

def compact(path):
    im = Image.open(path).convert('RGBA')
    big = Image.new('RGBA', (800, 448), (0, 0, 0, 0)); big.paste(im, (0, 0))
    out = Image.new('RGBA', (CELL_W * 10, CELL_H * 7), (0, 0, 0, 0))
    for row in range(7):
        for c in range(10):
            out.paste(big.crop((c * 80 + CROP_X, row * 64 + CROP_Y, c * 80 + CROP_X + CELL_W, row * 64 + CROP_Y + CELL_H)), (c * CELL_W, row * CELL_H))
    return out

def build_gchar():
    root = os.path.join(OUT, 'gchar'); shutil.rmtree(root, ignore_errors=True); os.makedirs(root)
    def slug(n): return re.sub(r'[^a-z0-9]+', '_', n.lower()).strip('_')
    man = {}
    def add(cat, sex, path, name=None):
        name = slug(name or os.path.splitext(os.path.basename(path))[0])
        d = os.path.join(root, cat); os.makedirs(d, exist_ok=True)
        compact(path).save(os.path.join(d, f'{sex}_{name}.png'), optimize=True)
        man.setdefault(cat, {}).setdefault(sex, []).append(name)
    CAP = os.path.join(G, 'GandalfHardcore Character Asset Pack')
    for sx, sex in (('Male', 'm'), ('Female', 'f')):
        for i in range(1, 6): add('skin', sex, os.path.join(CAP, 'Character skin colors', f'{sx} Skin{i}.png'), f'skin{i}')
        for k in ('Orc', 'Zombie', 'Ghost', 'Demon', 'Devil'): add('skin', sex, os.path.join(G, 'GandalfHardcore Special skin', f'{sx} {k} skin.png'), k.lower())
        for i in range(1, 6): add('ears', sex, os.path.join(G, f'{sx} Ears', f'Elven Ears{i}.png'), f'elf{i}')
        for f in sorted(os.listdir(os.path.join(CAP, f'{sx} Hair'))): add('hair', sex, os.path.join(CAP, f'{sx} Hair', f))
        hd = os.path.join(G, 'GandalfHardcore 58x Hair', '28x Male Hair' if sex == 'm' else '30x Female Hair')
        for f in sorted(os.listdir(hd)): add('hair', sex, os.path.join(hd, f))
        for f in sorted(os.listdir(os.path.join(G, 'GandalfHardcore 41x Hats', f'{sx} Hat'))): add('hat', sex, os.path.join(G, 'GandalfHardcore 41x Hats', f'{sx} Hat', f))
        for f in sorted(os.listdir(os.path.join(G, 'GandalfHardcore 35x Hand Items', f'{sx} Hand'))): add('hand', sex, os.path.join(G, 'GandalfHardcore 35x Hand Items', f'{sx} Hand', f))
        for f in sorted(os.listdir(os.path.join(CAP, f'{sx} Hand'))): add('hand', sex, os.path.join(CAP, f'{sx} Hand', f))
        for f in sorted(os.listdir(os.path.join(CAP, f'{sx} Clothing'))): add('cloth', sex, os.path.join(CAP, f'{sx} Clothing', f), 'c_' + os.path.splitext(f)[0])
        for f in sorted(os.listdir(os.path.join(G, 'GandalfHardcore Arm Layers', sx))): add('arms', sex, os.path.join(G, 'GandalfHardcore Arm Layers', sx, f))
    for f in sorted(os.listdir(os.path.join(G, 'GandalfHardcore 7x Male Clothing'))):
        if f.endswith('.png'): add('cloth', 'm', os.path.join(G, 'GandalfHardcore 7x Male Clothing', f))
    for f in sorted(os.listdir(os.path.join(G, 'GandalfHardcore 43x Female Clothing'))):
        if f.endswith('.png') and 'RATE' not in f: add('cloth', 'f', os.path.join(G, 'GandalfHardcore 43x Female Clothing', f))
    for f in sorted(os.listdir(os.path.join(G, 'GandalfHardcore Back layers s'))):
        if not f.endswith('.png'): continue
        sex = 'f' if f.startswith('Female') else 'm' if f.startswith('Male') else 'u'
        for sx in (('m', 'f') if sex == 'u' else (sex,)): add('back', sx, os.path.join(G, 'GandalfHardcore Back layers s', f), re.sub(r'^(male|female)_', '', slug(f[:-4])))
    for f in sorted(os.listdir(os.path.join(G, 'GandalfHardcore Masks'))):
        if f.endswith('.png'): add('mask', 'f' if f.startswith('Female') else 'm', os.path.join(G, 'GandalfHardcore Masks', f), re.sub(r'^(male|female)_', '', slug(f[:-4])))
    json.dump({'cell': [CELL_W, CELL_H], 'layers': man}, open(os.path.join(root, 'manifest.json'), 'w'), separators=(',', ':'))
    print('gchar', {c: {s: len(v) for s, v in d.items()} for c, d in man.items()})
build_gchar()

def build_pets():
    d = os.path.join(OUT, 'gandalf'); P = os.path.join(G, 'GandalfHardcore Pet companion'); S = os.path.join(G, 'GandalfHardcore Slime Enemy')
    for src, dst in ((os.path.join(P, 'GandalfHardcore doggy sheet.png'), 'pet_dog.png'), (os.path.join(P, 'GandalfHardcore doggy sheet 2.png'), 'pet_dog2.png'),
                     (os.path.join(P, 'GandalfHardcore doggy sheet 3.png'), 'pet_dog3.png'), (os.path.join(P, 'GandalfHardcore fat cat.png'), 'pet_cat.png'),
                     (os.path.join(P, 'GandalfHardcore fox.png'), 'pet_fox.png'), (os.path.join(P, 'GandalfHardcore Wisp.png'), 'pet_wisp.png'),
                     (os.path.join(S, 'Slime green.png'), 'slime_green.png'), (os.path.join(S, 'Slime blue.png'), 'slime_blue.png'), (os.path.join(S, 'Slime red.png'), 'slime_red.png')):
        shutil.copy(src, os.path.join(d, dst))
    fxd = os.path.join(G, 'GandalfHardcore character effects')
    os.makedirs(os.path.join(OUT, 'fx'), exist_ok=True)
    for f in ('Character effects buff.png', 'Character effects debuff.png', 'Character effects hearts.png', 'Character effects stars.png', 'Character effects blood.png', 'Character effects lines.png', 'Character effects curved lines.png'):
        shutil.copy(os.path.join(fxd, f), os.path.join(OUT, 'fx', 'ce_' + re.sub(r'[^a-z0-9]+', '_', f[18:-4].lower()).strip('_') + '.png'))
build_pets()
