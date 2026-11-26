// Procedural terrain tiles (32x32), trees, rocks, ore, bushes, crops — custom pixel art.
import { PixBuf, rgba, C, shadeC, mixC, makeCanvas } from './pixel.js';
import { BIOMES, B, F } from '../data/biomes.js';
import { RNG, hash2 } from '../core/rng.js';

export const TS = 32;
const cache = new Map();
const get = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); } return v; };

const PAL = {
  [B.DEEP]: [[22, 46, 96], [26, 54, 108], [18, 40, 86]],
  [B.OCEAN]: [[34, 76, 142], [40, 88, 158], [30, 68, 128]],
  [B.SHALLOW]: [[56, 130, 186], [70, 150, 200], [48, 116, 170]],
  [B.LAKE]: [[60, 132, 190], [74, 150, 204], [52, 118, 176]],
  [B.BEACH]: [[226, 208, 156], [236, 220, 172], [210, 190, 138]],
  [B.PLAINS]: [[118, 172, 74], [130, 184, 82], [104, 156, 66]],
  [B.FOREST]: [[74, 134, 60], [84, 146, 66], [64, 118, 52]],
  [B.TAIGA]: [[74, 112, 84], [84, 124, 92], [64, 98, 74]],
  [B.TUNDRA]: [[150, 160, 136], [162, 170, 148], [136, 146, 124]],
  [B.ICE]: [[230, 240, 248], [240, 246, 252], [212, 226, 238]],
  [B.DESERT]: [[228, 196, 122], [238, 208, 136], [214, 180, 108]],
  [B.SAVANNA]: [[188, 178, 88], [200, 190, 98], [170, 160, 76]],
  [B.JUNGLE]: [[48, 140, 62], [58, 154, 70], [40, 122, 54]],
  [B.SWAMP]: [[84, 110, 72], [94, 122, 80], [72, 96, 62]],
  [B.MOUNTAIN]: [[128, 118, 110], [142, 132, 122], [110, 102, 96]],
  [B.PEAK]: [[234, 236, 244], [246, 248, 252], [206, 210, 222]],
  [B.VOLCANIC]: [[66, 50, 50], [78, 60, 58], [54, 40, 40]],
  [B.ARCHIPELAGO]: [[140, 196, 96], [152, 208, 106], [124, 180, 84]],
};

/** Ground texture for a biome; water tiles have 4 animation frames. */
export function groundTile(biome, variant, frame = 0) {
  return get(`g${biome}|${variant}|${frame}`, () => {
    const pal = PAL[biome].map((c) => C(c));
    const b = new PixBuf(TS, TS);
    const r = new RNG(biome * 977 + variant * 131 + 7);
    const water = BIOMES[biome].water;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const n = hash2(x + variant * 37, y + biome * 53);
      b.set(x, y, n < 0.6 ? pal[0] : n < 0.82 ? pal[1] : pal[2]);
    }
    const light = shadeC(pal[1], 1.15), dark = shadeC(pal[2], 0.85);
    if (water) {
      for (let k = 0; k < 7; k++) { // wave crests shift per frame
        const y = (r.int(0, TS - 1) + frame * 2) % TS, x = (r.int(0, TS - 1) + frame * 3) % TS, len = r.int(3, 7);
        for (let i = 0; i < len; i++) b.set((x + i) % TS, y, shadeC(pal[1], biome === B.DEEP ? 1.15 : 1.3));
        b.set((x + len) % TS, (y + 1) % TS, shadeC(pal[1], 1.1));
      }
      return b.toCanvas();
    }
    const dots = (n, cols, w = 1, h = 1) => { for (let k = 0; k < n; k++) { const x = r.int(0, TS - 1), y = r.int(0, TS - 1), c = r.pick(cols); b.rect(x, y, w, h, c); } };
    switch (biome) {
      case B.PLAINS: case B.ARCHIPELAGO: case B.FOREST: case B.JUNGLE: {
        for (let k = 0; k < (biome === B.JUNGLE ? 22 : 14); k++) { const x = r.int(1, TS - 2), y = r.int(2, TS - 1); b.set(x, y, dark); b.set(x, y - 1, dark); b.set(x + 1, y - 2, light); b.set(x - 1, y - 1, dark); }
        if (biome === B.PLAINS || biome === B.ARCHIPELAGO) dots(r.int(0, 4), [rgba(246, 230, 90), rgba(250, 250, 250), rgba(236, 120, 160), rgba(140, 160, 240)]);
        if (biome === B.FOREST) dots(6, [rgba(120, 90, 50), rgba(150, 110, 60)]);
        break;
      }
      case B.TAIGA: dots(14, [dark, rgba(60, 86, 66)]); dots(3, [rgba(130, 130, 124)]); break;
      case B.TUNDRA: dots(10, [rgba(170, 178, 160), rgba(120, 128, 108)]); dots(4, [rgba(184, 150, 96)]); break;
      case B.ICE: for (let k = 0; k < 3; k++) { let x = r.int(0, TS), y = r.int(0, TS); for (let i = 0; i < 10; i++) { b.set(x, y, rgba(190, 210, 228)); x += r.int(-1, 1); y += 1; } } dots(4, [rgba(255, 255, 255)]); break;
      case B.DESERT: case B.BEACH: for (let k = 0; k < 5; k++) { const y = r.int(0, TS - 1), x0 = r.int(0, TS - 8); for (let i = 0; i < r.int(5, 12); i++) b.set(x0 + i, y + Math.round(Math.sin(i / 2)), dark); } if (biome === B.BEACH) dots(3, [rgba(250, 240, 230), rgba(240, 180, 170)]); break;
      case B.SAVANNA: for (let k = 0; k < 18; k++) { const x = r.int(0, TS - 1), y = r.int(2, TS - 1); b.set(x, y, light); b.set(x, y - 1, light); b.set(x + 1, y - 2, rgba(220, 206, 120)); } break;
      case B.SWAMP: for (let k = 0; k < 3; k++) b.ellipse(r.int(4, 28), r.int(4, 28), r.int(2, 4), r.int(1, 3), rgba(70, 96, 90)); dots(8, [dark]); break;
      case B.MOUNTAIN: case B.PEAK: for (let k = 0; k < 5; k++) { let x = r.int(0, TS), y = r.int(0, TS); for (let i = 0; i < 8; i++) { b.set(x, y, dark); x += r.int(0, 1); y += r.int(0, 1); } } dots(6, [light]); break;
      case B.VOLCANIC: for (let k = 0; k < 3; k++) { let x = r.int(0, TS), y = r.int(0, TS); for (let i = 0; i < 9; i++) { b.set(x, y, rgba(255, 120, 40)); b.set(x + 1, y, rgba(200, 70, 30)); x += r.int(-1, 1); y += 1; } } break;
    }
    return b.toCanvas();
  });
}
export const biomeColor = (b) => PAL[b][0];

// ---------- trees ----------
export function treeSprite(kind, variant, snow = false) {
  return get(`t${kind}|${variant}|${snow}`, () => {
    const b = new PixBuf(32, 48), r = new RNG(kind.length * 101 + variant * 17);
    const trunk = rgba(110, 78, 50), trunkD = rgba(82, 58, 38);
    const leaf = { oak: [72, 140, 56], pine: [44, 104, 70], palm: [80, 168, 70], jungle: [36, 132, 56], acacia: [120, 150, 60], willow: [96, 138, 74], dead: [0, 0, 0], cactus: [78, 150, 82] }[kind] || [72, 140, 56];
    const L = C(leaf), LD = shadeC(L, 0.72), LL = shadeC(L, 1.25);
    const snowC = rgba(244, 248, 252);
    if (kind === 'pine') {
      b.rect(15, 38, 3, 9, trunk); b.vline(15, 38, 46, trunkD);
      for (let t = 0; t < 4; t++) { const y0 = 8 + t * 8, w = 4 + t * 3; for (let y = 0; y < 10; y++) { const hw = Math.round((y / 10) * w) + 1; for (let x = -hw; x <= hw; x++) b.set(16 + x, y0 + y, x < -hw / 3 ? LD : x > hw / 2 ? LL : L); } if (snow) for (let x = -w / 2; x < w / 2; x++) b.set(16 + x, y0 + 3, snowC); }
    } else if (kind === 'palm') {
      for (let y = 18; y < 47; y++) { const x = 14 + Math.round(Math.sin(y / 9) * 2); b.set(x, y, trunk); b.set(x + 1, y, trunkD); if (y % 3 === 0) b.set(x, y, trunkD); }
      for (const [dx, dy] of [[-10, 4], [10, 4], [-8, -2], [8, -2], [0, -6], [-12, 8], [12, 8]]) b.line(15, 16, 15 + dx, 16 + dy, L), b.line(15, 17, 15 + dx, 17 + dy + 1, LD);
      b.ellipse(15, 18, 2, 2, rgba(120, 80, 40));
    } else if (kind === 'cactus') {
      b.rect(14, 22, 5, 25, L); b.vline(14, 22, 46, LD); b.vline(17, 22, 46, LL); b.rect(9, 28, 3, 8, L); b.rect(9, 34, 6, 3, L); b.rect(21, 25, 3, 9, L); b.rect(18, 32, 5, 3, L);
      if (r.chance(0.5)) b.set(16, 21, rgba(240, 90, 140));
    } else if (kind === 'dead') {
      b.rect(15, 24, 3, 23, rgba(90, 80, 72)); b.line(16, 30, 9, 20, rgba(90, 80, 72)); b.line(16, 27, 23, 18, rgba(90, 80, 72)); b.line(11, 22, 8, 16, rgba(90, 80, 72));
    } else {
      b.rect(14, 30, 4, 17, trunk); b.vline(14, 30, 46, trunkD); b.set(13, 46, trunk); b.set(18, 46, trunk);
      const blobs = kind === 'acacia' ? [[16, 18, 13, 5]] : kind === 'willow' ? [[16, 20, 11, 12]] : kind === 'jungle' ? [[16, 16, 12, 11], [9, 24, 6, 5], [23, 23, 6, 5]] : [[16, 18, 11, 10], [10, 24, 6, 5], [22, 24, 6, 5]];
      for (const [cx, cy, rx, ry] of blobs) { const jx = r.int(-1, 1); b.ellipse(cx + jx, cy, rx, ry, L); b.ellipse(cx + jx + 2, cy + 2, rx - 2, ry - 2, LD); b.ellipse(cx + jx - 2, cy - 2, rx - 4, ry - 4, L); b.ellipse(cx + jx - 3, cy - 4, Math.max(2, rx - 7), Math.max(2, ry - 7), LL); }
      if (kind === 'willow') for (let x = 6; x < 27; x += 3) b.vline(x, 24, 33 + r.int(0, 4), LD);
      if (kind === 'oak' && r.chance(0.3)) for (let k = 0; k < 4; k++) b.set(r.int(9, 23), r.int(12, 26), rgba(220, 60, 60));
      if (snow) for (const [cx, cy, rx] of blobs) for (let x = -rx + 2; x < rx - 2; x++) b.set(cx + x, cy - (blobs[0][3]) + 1 + Math.abs(x) % 2, snowC);
    }
    b.outline(rgba(24, 30, 24), 0.3);
    return b.toCanvas();
  });
}

export function featureSprite(feat, variant, extra = 0) {
  return get(`f${feat}|${variant}|${extra}`, () => {
    const b = new PixBuf(32, 32), r = new RNG(feat * 71 + variant * 13);
    switch (feat) {
      case F.ROCK: case F.ORE: case F.GOLD: {
        const stone = feat === F.GOLD ? rgba(120, 110, 96) : rgba(140, 138, 134);
        for (let k = 0; k < (variant % 3) + 1; k++) { const cx = r.int(9, 22), cy = r.int(16, 24), rx = r.int(4, 8), ry = r.int(3, 6); b.ellipse(cx, cy, rx, ry, stone); b.ellipse(cx - 1, cy - 1, rx - 2, ry - 2, shadeC(stone, 1.15)); b.hline(cx - rx + 2, cx + rx - 2, cy + ry - 1, shadeC(stone, 0.7)); }
        if (feat !== F.ROCK) { const oc = feat === F.GOLD ? [rgba(255, 220, 80), rgba(255, 250, 180)] : extra ? [rgba(220, 120, 60), rgba(240, 160, 90)] : [rgba(200, 120, 70), rgba(120, 200, 230)]; for (let k = 0; k < 9; k++) b.paintIf(r.int(5, 27), r.int(10, 28), r.pick(oc)); }
        b.outline(rgba(30, 28, 32), 0.3);
        break;
      }
      case F.BERRY: { const g = rgba(60, 130, 60); b.ellipse(16, 22, 9, 6, g); b.ellipse(15, 20, 7, 4, shadeC(g, 1.2)); for (let k = 0; k < 8 + extra; k++) b.paintIf(r.int(8, 24), r.int(17, 27), r.pick([rgba(220, 40, 70), rgba(120, 60, 200), rgba(240, 90, 90)])); b.outline(rgba(24, 40, 24), 0.3); break; }
      case F.STUMP: b.ellipse(16, 22, 4, 2, rgba(150, 110, 70)); b.rect(12, 22, 9, 4, rgba(110, 78, 50)); b.outline(); break;
      case F.RUBBLE: for (let k = 0; k < 7; k++) b.rect(r.int(6, 24), r.int(14, 26), r.int(2, 4), r.int(1, 3), r.pick([rgba(120, 110, 100), rgba(90, 80, 74), rgba(140, 120, 90)])); break;
      case F.CRATER: b.ellipse(16, 18, 12, 8, rgba(60, 50, 46)); b.ellipse(16, 17, 9, 5, rgba(40, 34, 32)); b.ellipse(14, 15, 3, 2, rgba(255, 140, 50)); break;
    }
    return b.toCanvas();
  });
}

/** Farmland tile with crop stage 0..4 (0 = bare tilled soil). */
export function farmTile(stage, era, frost = false) {
  return get(`farm${stage}|${era >= 8 ? 'h' : 's'}|${frost}`, () => {
    const b = new PixBuf(TS, TS);
    const soil = era >= 8 ? rgba(170, 190, 200) : rgba(118, 82, 52), soilD = era >= 8 ? rgba(140, 160, 176) : rgba(92, 62, 40);
    b.rect(0, 0, TS, TS, soil);
    for (let y = 2; y < TS; y += 6) b.hline(0, TS - 1, y, soilD);
    if (stage > 0) {
      const ripe = stage >= 4;
      const g = ripe ? rgba(226, 196, 80) : rgba(90, 170, 70), gd = ripe ? rgba(196, 160, 60) : rgba(64, 132, 52);
      for (let y = 4; y < TS; y += 6) for (let x = 2; x < TS; x += 4) {
        const h = Math.min(5, stage + 1);
        b.vline(x, y - h + 1, y, gd); b.set(x - 1, y - h + 2, g); b.set(x + 1, y - h + 1, g);
        if (ripe) { b.set(x, y - h, rgba(246, 222, 120)); b.set(x + 1, y - h, rgba(246, 222, 120)); }
      }
    }
    if (frost) for (let k = 0; k < 40; k++) b.set((k * 7) % TS, (k * 13) % TS, rgba(230, 240, 250));
    return b.toCanvas();
  });
}

export function roadTile(era) {
  return get(`road${Math.min(era, 6)}`, () => {
    const b = new PixBuf(TS, TS);
    const c = era < 3 ? rgba(150, 120, 84) : era < 6 ? rgba(150, 146, 140) : rgba(70, 72, 78);
    b.rect(0, 0, TS, TS, c);
    const r = new RNG(era);
    for (let k = 0; k < 30; k++) b.set(r.int(0, 31), r.int(0, 31), shadeC(c, r.range(0.85, 1.1)));
    if (era >= 3 && era < 6) for (let y = 0; y < TS; y += 8) for (let x = (y / 8) % 2 * 4; x < TS; x += 8) b.rect(x, y, 7, 7, shadeC(c, 1.06));
    return b.toCanvas();
  });
}
