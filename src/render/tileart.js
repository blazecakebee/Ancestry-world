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
  [B.STEPPE]: [[176, 164, 98], [190, 178, 108], [160, 148, 86]],
  [B.BADLANDS]: [[190, 110, 70], [204, 124, 80], [168, 94, 60]],
  [B.BLOSSOM]: [[132, 176, 98], [146, 190, 108], [118, 160, 88]],
  [B.AUTUMN]: [[142, 116, 58], [156, 128, 66], [126, 100, 50]],
  [B.RAINFOREST]: [[40, 104, 76], [48, 118, 86], [32, 90, 64]],
  [B.MANGROVE]: [[74, 122, 88], [84, 136, 98], [62, 106, 78]],
  [B.SALTFLAT]: [[228, 228, 216], [238, 238, 228], [210, 210, 198]],
  [B.ALPINE]: [[122, 164, 112], [134, 176, 122], [108, 148, 100]],
  [B.ASHLAND]: [[98, 92, 88], [112, 106, 100], [84, 78, 74]],
  [B.GLOWFEN]: [[62, 90, 112], [72, 104, 128], [52, 78, 98]],
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
      case B.STEPPE: for (let k = 0; k < 16; k++) { const x = r.int(0, TS - 1), y = r.int(2, TS - 1); b.set(x, y, light); b.set(x, y - 1, light); b.set(x + 1, y - 2, rgba(206, 194, 122)); } dots(3, [rgba(150, 120, 80)]); break;
      case B.BADLANDS: for (let k = 0; k < 4; k++) { const y = r.int(0, TS - 1); b.rect(0, y, TS, 1, k % 2 ? dark : light); } dots(8, [rgba(150, 80, 50), rgba(214, 140, 96)]); break;
      case B.BLOSSOM: for (let k = 0; k < 10; k++) { const x = r.int(1, TS - 2), y = r.int(2, TS - 1); b.set(x, y, dark); b.set(x, y - 1, dark); b.set(x + 1, y - 2, light); } dots(r.int(4, 9), [rgba(250, 190, 210), rgba(255, 230, 240), rgba(236, 140, 180)]); break;
      case B.AUTUMN: dots(16, [rgba(196, 98, 38), rgba(214, 150, 50), rgba(120, 70, 40)], 2, 1); dots(6, [dark]); break;
      case B.RAINFOREST: for (let k = 0; k < 20; k++) { const x = r.int(1, TS - 2), y = r.int(2, TS - 1); b.set(x, y, dark); b.set(x, y - 1, dark); b.set(x + 1, y - 2, light); } dots(5, [rgba(30, 70, 56), rgba(120, 150, 90)]); break;
      case B.MANGROVE: for (let k = 0; k < 3; k++) b.ellipse(r.int(4, 28), r.int(4, 28), r.int(2, 5), r.int(1, 3), rgba(70, 120, 120)); dots(10, [dark, rgba(110, 90, 60)]); break;
      case B.SALTFLAT: for (let k = 0; k < 6; k++) { const x = r.int(0, TS - 8), y = r.int(0, TS - 1); for (let i = 0; i < 7; i++) b.set(x + i, y + (i % 3 === 0 ? 1 : 0), rgba(196, 200, 196)); } dots(5, [rgba(250, 250, 244)]); break;
      case B.ALPINE: for (let k = 0; k < 12; k++) { const x = r.int(1, TS - 2), y = r.int(2, TS - 1); b.set(x, y, dark); b.set(x, y - 1, dark); b.set(x + 1, y - 2, light); } dots(r.int(3, 6), [rgba(250, 240, 120), rgba(200, 160, 250), rgba(240, 240, 250)]); dots(3, [rgba(140, 140, 136)]); break;
      case B.ASHLAND: dots(18, [rgba(70, 64, 62), rgba(130, 124, 118)]); dots(3, [rgba(210, 90, 40)]); break;
      case B.GLOWFEN: for (let k = 0; k < 3; k++) b.ellipse(r.int(4, 28), r.int(4, 28), r.int(2, 4), r.int(1, 3), rgba(52, 80, 104)); dots(7, [rgba(120, 220, 230), rgba(190, 140, 250)]); dots(8, [dark]); break;
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


// ---------- mountains: chunky pixel peaks (light on the north-west face, dark on the south-east) ----------
export function mountainSprite(variant, snowy) {
  return get(`m${variant}|${snowy}`, () => {
    const W = 96, H = 84, b = new PixBuf(W, H), r = new RNG(variant * 313 + 5);
    const L = rgba(162, 150, 136), M = rgba(126, 114, 106), D = rgba(88, 80, 78), LL = rgba(184, 172, 156), DD = rgba(66, 60, 62);
    const SN = rgba(244, 248, 255), SNS = rgba(196, 210, 232), base = H - 7;
    const peaks = [
      { cx: 22 + r.int(-4, 4), top: 34 + r.int(-4, 6), hw: 24 },
      { cx: 74 + r.int(-4, 4), top: 30 + r.int(-4, 6), hw: 25 },
      { cx: 47 + r.int(-5, 5), top: 5 + r.int(0, 8), hw: 36 },
    ];
    for (const pk of peaks) {
      for (let y = pk.top; y <= base; y++) {
        const t = (y - pk.top) / (base - pk.top), half = pk.hw * Math.pow(t, 0.85) + (hash2(y, pk.cx) - 0.5) * 3;
        for (let x = Math.floor(pk.cx - half); x <= Math.ceil(pk.cx + half); x++) {
          const side = x - pk.cx, n = hash2(x * 3 + pk.cx, y * 5);
          let c = side < -half * 0.12 ? (n < 0.16 ? M : n > 0.9 ? LL : L) : (n < 0.2 ? DD : n > 0.82 ? M : D);
          if ((x + y * 2 + pk.cx) % 7 === 0 && n < 0.5) c = side < 0 ? M : DD; // striations
          const snowLine = pk.top + (base - pk.top) * (snowy ? 0.4 : 0.1) + (hash2(x, pk.top) - 0.5) * 6;
          if (y < snowLine && (snowy || pk.top < 12)) c = side < -half * 0.1 ? SN : SNS;
          b.set(x, y, c);
        }
      }
    }
    // foot shadow
    for (let x = 6; x < W - 6; x++) if (hash2(x, 99) > 0.3) b.set(x, base + 1 + (hash2(x, 7) > 0.6 ? 1 : 0), rgba(40, 36, 44, 150));
    b.outline(rgba(34, 28, 38), 0.2);
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
