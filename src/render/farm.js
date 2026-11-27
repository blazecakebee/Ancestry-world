// LimeZu "Modern Farm" animals: animated side-view sheets (idle row + walk row, 6 frames, facing right).
export const FARM = { ready: false, man: null, imgs: new Map() };
const base = new URL('../../assets/packs/farm/', import.meta.url).href;
export async function loadFarm(onReady) {
  try {
    FARM.man = await (await fetch(base + 'manifest.json')).json();
    const names = Object.values(FARM.man).flatMap((k) => k.variants);
    await Promise.all(names.map((n) => new Promise((res) => { const im = new Image(); im.onload = () => { FARM.imgs.set(n, im); res(); }; im.onerror = res; im.src = base + n + '.png'; })));
    try { FARM.cropMeta = await (await fetch(base + 'crops.json')).json(); } catch (e) { FARM.cropMeta = null; }
    FARM.crops = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = base + 'crops.png'; });
    FARM.ready = true; onReady?.();
  } catch (e) { /* optional pack: procedural fallback stays */ }
}
/** Frame for an animal kind. id picks a stable colour variant. Returns {im,x,y,w,h} or null. */
export function farmFrame(kind, id, t, moving) {
  if (!FARM.ready) return null; const k = FARM.man[kind]; if (!k) return null;
  const nm = k.variants[Math.abs(Math.floor(id * 977)) % k.variants.length], im = FARM.imgs.get(nm); if (!im) return null;
  const f = Math.floor(t * (moving ? 9 : 3.5)) % 6;
  return { im, x: f * k.w, y: moving ? k.h : 0, w: k.w, h: k.h };
}

/** Crop plant sprite: kind index, growth stage 0..4 (4 = ripe). Source cells are 32x64; tall plants return the whole cell (h 64),
 *  short ones just the lower 32. flat = never return the tall top half (for tiles on a chunk's top edge). */
export const CROP_KINDS = 18;
export function cropFrame(kind, stage, flat = false) {
  if (!FARM.crops) return null; const n = Math.floor(FARM.crops.height / 64); if (!n) return null;
  const k = kind % n, tall = !flat && FARM.cropMeta?.tall?.[k];
  return { im: FARM.crops, x: [0, 1, 2, 3, 5][Math.max(0, Math.min(4, stage))] * 32, y: k * 64 + (tall ? 0 : 32), w: 32, h: tall ? 64 : 32 };
}
