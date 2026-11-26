// Procedural character sprites in the chunky outlined style of the reference art.
// Every citizen is unique: sex, body fat, muscle, height, bust, skin, hair, beard, eyes,
// glasses and freckles come from their genes; clothes and armor come from era, role and nation.
import { PixBuf, C, rgba, shadeC, mixC, hexC, makeCanvas } from './pixel.js';
import { RNG } from '../core/rng.js';

export const SKIN = [[255, 226, 198], [247, 210, 172], [238, 194, 154], [226, 174, 130], [208, 152, 110], [188, 130, 90], [162, 106, 72], [136, 86, 58], [108, 68, 46], [82, 52, 36]];
export const HAIR = [[34, 26, 24], [62, 42, 30], [108, 68, 40], [142, 64, 38], [220, 116, 56], [232, 196, 108], [240, 234, 214], [158, 156, 156], [84, 124, 236], [236, 104, 176], [92, 206, 146]];
export const EYES = [[70, 132, 224], [82, 172, 92], [112, 72, 42], [154, 122, 62], [134, 144, 156], [204, 142, 42]];
const INK = rgba(26, 20, 32);
const ORC_SKIN = [[118, 196, 96], [96, 176, 84], [84, 150, 74], [72, 128, 64]];
const ELF_SKIN = [[214, 210, 246], [196, 190, 236], [176, 168, 222], [150, 140, 204]];
export function skinOf(p) {
  if (p.race === 'orc') return ORC_SKIN[Math.min(3, Math.floor(p.look.skin / 2.5))];
  if (p.race === 'elf') return ELF_SKIN[Math.min(3, Math.floor(p.look.skin / 2.5))];
  return SKIN[p.look.skin % SKIN.length];
}
const WHITE = rgba(250, 250, 246);

export const FW = 32, FH = 48, FRAMES = { idle: [0, 1], walk: [2, 3, 4, 5], work: [6, 7], fight: [8, 9] };
const POSES = [
  { bob: 0, lift: [0, 0], arm: [0, 0] }, { bob: 1, lift: [0, 0], arm: [0, 0], breathe: 1 },
  { bob: 0, lift: [2, 0], arm: [1, -1] }, { bob: 1, lift: [0, 0], arm: [0, 0] }, { bob: 0, lift: [0, 2], arm: [-1, 1] }, { bob: 1, lift: [0, 0], arm: [0, 0] },
  { bob: 0, lift: [0, 0], arm: [0, 0], raise: 1 }, { bob: 1, lift: [0, 0], arm: [0, 0], raise: 0.3 },
  { bob: 0, lift: [0, 1], arm: [0, 0], thrust: 0 }, { bob: 0, lift: [1, 0], arm: [0, 0], thrust: 1 },
];

// ---------- outfits by era & role ----------
const pick = (r, a) => a[Math.floor(r.next() * a.length)];
const TONES = {
  earthy: [[132, 96, 64], [150, 118, 78], [112, 82, 54], [166, 140, 98]],
  linen: [[226, 214, 186], [210, 196, 160], [236, 228, 206]],
  dyed: [[156, 52, 52], [52, 92, 156], [62, 120, 72], [176, 132, 52], [112, 64, 140], [198, 112, 48]],
  modern: [[46, 52, 70], [214, 70, 70], [70, 140, 214], [240, 240, 236], [86, 170, 96], [244, 196, 72], [36, 36, 40], [200, 120, 180], [120, 200, 210], [150, 90, 60]],
  denim: [[56, 82, 132], [44, 60, 96], [70, 70, 76], [140, 120, 90]],
  sleek: [[232, 236, 244], [40, 44, 60], [180, 190, 210], [26, 30, 44]],
};
export function outfitFor(p, era, nationColor = '#e8c547') {
  const r = new RNG(p.id * 7919 + era * 31);
  const nc = hexC(nationColor), f = p.sex === 'f', kid = p.age < 14, role = p.role;
  const o = { top: null, sleeves: 'short', bottom: 'pants', bot: null, shoes: null, belt: null, over: null, hat: null, cape: null, accent: null, trim: null, item: null };
  const c = (arr) => C(arr);
  switch (era) {
    case 0: o.top = c(pick(r, TONES.earthy)); o.sleeves = 'none'; o.bottom = f ? 'skirt' : 'wrap'; o.bot = o.top; o.over = 'fur'; o.shoes = null; break;
    case 1: o.top = c(pick(r, TONES.linen)); o.sleeves = 'short'; o.bottom = f ? 'longskirt' : 'shorts'; o.bot = c(pick(r, TONES.earthy)); o.shoes = C([120, 88, 56]); o.belt = C([92, 64, 40]); break;
    case 2: o.top = c(pick(r, TONES.linen)); o.sleeves = 'none'; o.bottom = f ? 'longskirt' : 'skirt'; o.bot = o.top; o.belt = c(pick(r, TONES.dyed)); o.shoes = C([150, 108, 60]); o.accent = C([214, 160, 64]); break;
    case 3: o.top = c(pick(r, TONES.dyed)); o.sleeves = 'short'; o.bottom = f ? 'longskirt' : 'skirt'; o.bot = o.top; o.belt = C([90, 60, 40]); o.shoes = C([110, 76, 50]); if (r.chance(0.4)) o.cape = nc; break;
    case 4: o.top = c(pick(r, TONES.dyed)); o.sleeves = 'long'; o.bottom = f ? 'longskirt' : 'pants'; o.bot = f ? o.top : c(pick(r, TONES.earthy)); o.belt = C([70, 50, 36]); o.shoes = C([70, 50, 40]); if (f) o.over = 'bodice'; break;
    case 5: o.top = c(pick(r, TONES.dyed)); o.sleeves = 'puff'; o.bottom = f ? 'gown' : 'pants'; o.bot = f ? o.top : C([40, 40, 48]); o.shoes = C([50, 40, 36]); o.trim = WHITE; break;
    case 6: o.top = c(pick(r, [[236, 232, 222], [190, 200, 214], [214, 200, 170]])); o.sleeves = 'long'; o.bottom = f ? 'longskirt' : 'pants'; o.bot = c(pick(r, [[60, 56, 60], [92, 74, 56], [50, 58, 80]])); o.shoes = C([40, 34, 30]); if (!f && r.chance(0.6)) { o.over = 'vest'; o.accent = C([70, 60, 56]); } if (!f && r.chance(0.5)) o.hat = 'flatcap'; break;
    case 7: o.top = c(pick(r, TONES.modern)); o.sleeves = r.chance(0.5) ? 'short' : 'long'; o.bottom = f && r.chance(0.4) ? 'skirt' : 'pants'; o.bot = c(pick(r, TONES.denim)); o.shoes = c(pick(r, [[240, 240, 240], [200, 50, 50], [40, 40, 44]])); break;
    case 8: o.top = c(pick(r, TONES.sleek)); o.sleeves = 'long'; o.bottom = 'pants'; o.bot = o.top; o.shoes = C([30, 34, 46]); o.trim = C([80, 230, 240]); o.over = 'bodysuit'; break;
    default: o.top = C([226, 230, 238]); o.sleeves = 'long'; o.bottom = 'pants'; o.bot = o.top; o.shoes = C([70, 74, 90]); o.trim = nc; o.over = 'spacesuit'; break;
  }
  if (kid) { o.over = era === 0 ? 'fur' : null; o.hat = null; o.cape = null; }
  else if (role === 'soldier') {
    const armor = ['fur', 'leather', 'bronze', 'segmenta', 'chain', 'musketeer', 'uniform', 'fatigues', 'power', 'marine'][era];
    o.over = armor; o.hat = ['', 'band', 'bronzehelm', 'crest', 'kettle', 'tricorn', 'kepi', 'combathelm', 'visor', 'visor'][era] || null;
    o.trim = nc; if (era >= 6) { o.top = era === 7 ? C([96, 108, 66]) : era === 6 ? shadeC(nc, 0.7) : o.top; o.bot = era === 7 ? C([86, 96, 60]) : o.bot; o.bottom = 'pants'; o.sleeves = 'long'; }
    if (era === 4) o.cape = null;
  } else if (role === 'prophet') {
    o.over = 'robe'; o.top = C([246, 240, 220]); o.trim = C([240, 196, 72]); o.sleeves = 'long'; o.bottom = 'gown'; o.bot = o.top; o.hat = era >= 1 ? 'hood' : null;
  } else if (role === 'doctor' && era >= 5) {
    o.over = 'labcoat'; o.accent = C([60, 110, 200]); // white coat + blue tie like the reference
  } else if (role === 'leader') {
    o.hat = era >= 6 ? null : 'crown'; o.cape = era <= 5 ? shadeC(nc, 0.85) : null; if (era >= 6) { o.over = 'suit'; o.top = C([40, 44, 56]); o.bot = o.top; o.accent = nc; }
  }
  return o;
}

// ---------- body rig ----------
function rig(p) {
  const L = p.look, H = L.height || 1, f = p.sex === 'f';
  const fat = L.fat || 0, mus = L.muscle || 0;
  const r = {
    cx: 16, foot: 47,
    leg: Math.round(11 * H + 1), torso: Math.round(10 * H + 1),
    hip: Math.round(4 + fat * 2.2 + (f ? 1.2 : 0)), // half widths
    waist: Math.round(3.5 + fat * 3 - (f ? 0.9 : 0)),
    shoulder: Math.round(4.4 + mus * 1.4 + fat * 1.4 + (f ? -0.4 : 0.6)),
    legW: Math.round(2.6 + fat * 1.6 + mus * 0.4), armW: Math.max(2, Math.round(2 + fat * 1.3 + mus * 1.2)),
    chest: f ? L.chest || 0.5 : 0, belly: fat, mus, f,
  };
  r.hipY = r.foot - r.leg; r.shY = r.hipY - r.torso; r.headB = r.shY + 1; r.headT = r.headB - 13;
  return r;
}

function drawLegs(b, R, o, sk, pose, side = null) {
  const skin = C(sk), skinD = shadeC(skin, 0.82);
  for (const s of [-1, 1]) {
    if (side !== null && side !== s) continue;
    const lift = pose.lift[s < 0 ? 0 : 1];
    const x0 = s < 0 ? R.cx - R.hip + 0 : R.cx + R.hip - R.legW;
    const y0 = R.hipY, y1 = R.foot - lift;
    const pants = o.bottom === 'pants' || o.bottom === 'gown' && false;
    for (let y = y0; y <= y1; y++) {
      const legCol = (pants || (o.bottom === 'shorts' && y < y0 + 4)) ? o.bot : skin;
      const shade = legCol === skin ? skinD : shadeC(legCol, 0.8);
      for (let x = 0; x < R.legW; x++) b.set(x0 + x, y, x === (s < 0 ? 0 : R.legW - 1) ? shade : legCol);
    }
    if (o.shoes) { b.rect(x0 - (s < 0 ? 1 : 0), y1 - 1, R.legW + 1, 2, o.shoes); b.hline(x0 - (s < 0 ? 1 : 0), x0 + R.legW - (s < 0 ? 1 : 0), y1, shadeC(o.shoes, 0.7)); }
    else b.set(x0 + (s < 0 ? -1 : R.legW), y1, skinD);
  }
}

function torsoHalf(R, y) {
  const t = (y - R.shY) / R.torso; // 0 at shoulders, 1 at hips
  let hw = t < 0.55 ? R.shoulder + (R.waist - R.shoulder) * (t / 0.55) : R.waist + (R.hip - R.waist) * ((t - 0.55) / 0.45);
  if (R.chest > 0 && t > 0.18 && t < 0.5) hw += R.chest * 1.4 * Math.sin(((t - 0.18) / 0.32) * Math.PI);
  if (R.belly > 0.35 && t > 0.45 && t < 0.95) hw += (R.belly - 0.35) * 3.2 * Math.sin(((t - 0.45) / 0.5) * Math.PI);
  return Math.max(2, Math.round(hw));
}

function drawTorso(b, R, o, sk, pose) {
  const skin = C(sk);
  const shirtless = o.sleeves === 'none' && (o.over === 'fur' || !o.top);
  const top = o.top || skin, topD = shadeC(top, 0.78), topL = shadeC(top, 1.12);
  const breathe = pose.breathe ? 1 : 0;
  for (let y = R.shY; y < R.hipY; y++) {
    const hw = torsoHalf(R, y) + (breathe && y < R.shY + 4 ? 0 : 0);
    for (let x = -hw; x < hw; x++) {
      let col = top;
      if (x === -hw) col = topD; else if (x === hw - 1) col = shadeC(top, 0.88);
      b.set(R.cx + x, y, col);
    }
  }
  // neckline
  b.set(R.cx - 1, R.shY, skin); b.set(R.cx, R.shY, skin); b.set(R.cx, R.shY + 1, shadeC(skin, 0.9));
  // chest shaping
  if (R.chest > 0.05) {
    const yb = R.shY + Math.round(R.torso * 0.45), hw = torsoHalf(R, yb);
    for (let x = -hw + 1; x < hw - 1; x++) if (Math.abs(x + 0.5) > 0.6) b.paintIf(R.cx + x, yb, topD);
    b.paintIf(R.cx - 1, yb - 1, topD); b.paintIf(R.cx, yb - 1, topD);
    b.paintIf(R.cx - 3, yb - 2, topL); b.paintIf(R.cx + 2, yb - 2, topL);
    if (R.chest > 0.55) { b.paintIf(R.cx - hw, yb - 1, topD); b.paintIf(R.cx + hw - 1, yb - 1, topD); b.paintIf(R.cx - 2, yb - 3, topL); b.paintIf(R.cx + 1, yb - 3, topL); }
  } else if (shirtless || R.mus > 0.55) {
    const yb = R.shY + Math.round(R.torso * 0.36);
    const sh = shadeC(top, 0.82);
    b.paintIf(R.cx - 3, yb, sh); b.paintIf(R.cx - 2, yb, sh); b.paintIf(R.cx + 1, yb, sh); b.paintIf(R.cx + 2, yb, sh); b.paintIf(R.cx, yb - 1, sh);
    if (shirtless && R.mus > 0.5 && R.belly < 0.5) for (let k = 0; k < 2; k++) { b.paintIf(R.cx - 1, yb + 2 + k * 2, sh); b.paintIf(R.cx, yb + 2 + k * 2, sh); }
  }
  if (R.belly > 0.45) { const yb = R.hipY - 2; for (let x = -2; x <= 1; x++) b.paintIf(R.cx + x, yb, shadeC(top, 0.8)); b.paintIf(R.cx, yb - 3, shadeC(top, 0.85)); }
  // overlays
  const ov = o.over;
  if (ov === 'fur') { // hide wrap over one shoulder
    const fur = C([128, 92, 58]), furD = C([96, 66, 40]);
    for (let y = R.shY + 2; y < R.hipY + 2; y++) { const hw = torsoHalf(R, Math.min(y, R.hipY - 1)); for (let x = -hw; x < hw; x++) if (y > R.shY + 3 + (x + hw) * 0.6 || y > R.hipY - 4) b.set(R.cx + x, y, (x + y) % 3 === 0 ? furD : fur); }
    b.line(R.cx + R.shoulder - 2, R.shY, R.cx - R.waist, R.hipY - 4, furD);
  } else if (ov === 'labcoat' || ov === 'robe' || ov === 'suit' || ov === 'vest') {
    const coat = ov === 'labcoat' ? rgba(244, 246, 248) : ov === 'robe' ? o.top : ov === 'vest' ? o.accent : o.top;
    for (let y = R.shY; y < R.hipY + (ov === 'labcoat' || ov === 'robe' ? 7 : 0); y++) {
      const hw = torsoHalf(R, Math.min(y, R.hipY - 1)) + (y >= R.hipY ? 1 : 0);
      for (let x = -hw; x < hw; x++) if (Math.abs(x + 0.5) > (ov === 'vest' ? 1.5 : 1)) b.set(R.cx + x, y, x === -hw ? shadeC(coat, 0.8) : coat);
    }
    if (ov === 'labcoat' || ov === 'suit') { // tie
      const tie = o.accent || rgba(60, 110, 200);
      b.vline(R.cx, R.shY + 1, R.shY + 6, tie); b.vline(R.cx - 1, R.shY + 1, R.shY + 5, shadeC(tie, 0.8));
      if (ov === 'labcoat') { b.set(R.cx + 2, R.shY + 3, rgba(220, 160, 60)); b.set(R.cx + 3, R.shY + 3, rgba(220, 160, 60)); }
    }
    if (o.trim && ov === 'robe') { b.vline(R.cx - 1, R.shY + 1, R.hipY + 6, o.trim); }
  } else if (['bronze', 'segmenta', 'chain', 'leather', 'musketeer', 'uniform', 'fatigues', 'power', 'marine', 'bodysuit', 'spacesuit', 'bodice'].includes(ov)) {
    const A = { bronze: rgba(206, 150, 70), segmenta: rgba(170, 176, 186), chain: rgba(150, 156, 166), leather: rgba(120, 84, 52), musketeer: o.trim, uniform: o.top, fatigues: o.top, power: rgba(90, 100, 120), marine: rgba(200, 206, 220), bodysuit: o.top, spacesuit: o.top, bodice: shadeC(o.top, 0.7) }[ov];
    const y0 = R.shY + (ov === 'bodice' ? 4 : 1), y1 = R.hipY - (ov === 'bodice' ? 1 : 0);
    for (let y = y0; y < y1; y++) { const hw = torsoHalf(R, y); for (let x = -hw; x < hw; x++) { let col = A; if (ov === 'chain' && (x + y) % 2) col = shadeC(A, 0.85); if (ov === 'segmenta' && y % 2) col = shadeC(A, 0.8); if (x === -hw) col = shadeC(col, 0.75); b.set(R.cx + x, y, col); } }
    if (ov === 'bronze' || ov === 'power' || ov === 'marine') { b.paintIf(R.cx - 2, y0 + 2, shadeC(A, 1.25)); b.paintIf(R.cx + 1, y0 + 2, shadeC(A, 1.25)); }
    if (ov === 'chain' && o.trim) for (let y = y0 + 2; y < y1; y++) for (let x = -2; x < 2; x++) b.set(R.cx + x, y, o.trim); // tabard
    if ((ov === 'bodysuit' || ov === 'spacesuit' || ov === 'power') && o.trim) { b.hline(R.cx - torsoHalf(R, y0 + 3), R.cx + torsoHalf(R, y0 + 3) - 1, y0 + 3, o.trim); b.vline(R.cx, y0, y1, o.trim); }
    if (ov === 'uniform' || ov === 'fatigues') { b.set(R.cx - 2, y0 + 2, rgba(230, 200, 90)); b.vline(R.cx, y0, y1, shadeC(A, 0.75)); }
  }
  if (o.belt) b.hline(R.cx - torsoHalf(R, R.hipY - 1), R.cx + torsoHalf(R, R.hipY - 1) - 1, R.hipY - 1, o.belt);
  if (o.trim && ['puff'].includes(o.sleeves)) b.hline(R.cx - 2, R.cx + 1, R.shY, o.trim);
  // lower garment over hips
  if (o.bottom === 'skirt' || o.bottom === 'longskirt' || o.bottom === 'wrap' || o.bottom === 'gown') {
    const len = o.bottom === 'skirt' || o.bottom === 'wrap' ? 5 : o.bottom === 'longskirt' ? Math.round(R.leg * 0.8) : R.leg - 1;
    const col = o.bot || o.top;
    for (let y = R.hipY; y < R.hipY + len; y++) {
      const hw = R.hip + 1 + Math.floor((y - R.hipY) / 4);
      for (let x = -hw; x < hw; x++) b.set(R.cx + x, y, x === -hw ? shadeC(col, 0.75) : (o.bottom === 'wrap' && (x + y) % 4 === 0) ? shadeC(col, 0.85) : col);
    }
    if (o.bottom === 'wrap') b.hline(R.cx - R.hip - 2, R.cx + R.hip + 1, R.hipY + len - 1, shadeC(col, 0.7));
  } else {
    // crotch gap shading between legs for pants
    const pc = o.bottom === 'pants' || o.bottom === 'shorts' ? o.bot : C(sk);
    for (let x = -R.hip; x < R.hip; x++) b.set(R.cx + x, R.hipY, pc); b.set(R.cx, R.hipY + 1, shadeC(pc, 0.7));
  }
}

function drawArm(b, R, o, sk, pose, s, item) {
  const skin = C(sk), skinD = shadeC(skin, 0.82);
  const hw = torsoHalf(R, R.shY + 1);
  const x0 = s < 0 ? R.cx - hw - R.armW + 1 : R.cx + hw - 1;
  const len = R.torso + 1;
  const swing = pose.arm[s < 0 ? 0 : 1];
  const raise = s > 0 ? pose.raise : null;
  const sleeveLen = o.sleeves === 'none' ? 0 : o.sleeves === 'short' ? 3 : o.sleeves === 'puff' ? len - 2 : len - 2;
  const sleeveCol = o.over === 'labcoat' ? rgba(244, 246, 248) : ['segmenta', 'chain', 'power', 'marine', 'bodysuit', 'spacesuit', 'uniform', 'fatigues'].includes(o.over) ? (o.over === 'segmenta' ? o.top : o.over === 'chain' ? rgba(150, 156, 166) : o.over === 'power' ? rgba(90, 100, 120) : o.over === 'marine' ? rgba(200, 206, 220) : o.top) : o.top;
  if (raise !== null && raise !== undefined && raise > 0.5) {
    // arm up, holding the tool overhead
    for (let k = 0; k < len; k++) { const y = R.shY + 1 - Math.round(k * 0.6), x = x0 + Math.round(k * 0.45); const col = k < sleeveLen ? sleeveCol : skin; for (let w = 0; w < R.armW; w++) b.set(x + w, y, col); }
    const hx = x0 + Math.round(len * 0.45), hy = R.shY + 1 - Math.round(len * 0.6);
    if (item) drawItem(b, item, hx + 1, hy, 'up');
    return;
  }
  const thrust = s > 0 && pose.thrust !== undefined ? pose.thrust : null;
  for (let k = 0; k < len; k++) {
    const y = R.shY + 1 + k + (k > len * 0.5 ? swing : 0) - (thrust ? (k > len * 0.4 ? Math.round((k - len * 0.4) * 0.7) : 0) : 0);
    const x = x0 + (thrust ? (k > len * 0.4 ? Math.round((k - len * 0.4) * 0.9) : 0) : 0);
    const col = k < sleeveLen ? (o.sleeves === 'puff' && k < 3 ? shadeC(sleeveCol, 1.15) : sleeveCol) : skin;
    for (let w = 0; w < R.armW; w++) b.set(x + w + (o.sleeves === 'puff' && k < 3 && w === 0 ? -1 : 0), y, w === (s < 0 ? 0 : R.armW - 1) ? (col === skin ? skinD : shadeC(col, 0.8)) : col);
  }
  if (s > 0 && item) {
    const hx = x0 + (thrust ? Math.round(len * 0.55) : 0) + 1, hy = R.shY + len + (thrust ? -Math.round(len * 0.4) : swing);
    drawItem(b, item, hx, hy, thrust ? 'fwd' : 'down');
  }
}

function drawItem(b, item, x, y, dir) {
  const wood = rgba(132, 92, 56), stone = rgba(150, 150, 156), metal = rgba(196, 200, 210), dark = rgba(50, 50, 56), gold = rgba(230, 190, 70);
  const L = (len, col, head, hc) => {
    for (let k = 0; k < len; k++) { const [px, py] = dir === 'up' ? [x + k * 0.3, y - k] : dir === 'fwd' ? [x + k, y] : [x + 1, y - 4 + k]; b.set(px, py, col); }
    const [hx, hy] = dir === 'up' ? [x + len * 0.3, y - len] : dir === 'fwd' ? [x + len, y] : [x + 1, y - 4];
    if (head) { b.set(hx, hy, hc); b.set(hx + 1, hy, hc); b.set(hx, hy - 1, hc); }
  };
  switch (item) {
    case 'spear': L(10, wood, true, stone); break;
    case 'axe': L(6, wood, true, stone); break;
    case 'pick': L(6, wood, true, metal); break;
    case 'sword': L(8, metal, true, gold); break;
    case 'musket': L(11, wood, true, dark); break;
    case 'rifle': L(9, dark, true, dark); break;
    case 'plasma': L(8, rgba(200, 220, 240), true, rgba(80, 240, 255)); break;
    case 'staff': L(11, wood, true, gold); break;
    case 'clipboard': b.rect(x, y - 3, 3, 4, rgba(170, 120, 60)); b.set(x + 1, y - 3, metal); break;
  }
}

function drawHead(b, R, p, o, sk, pose, facing = 1) {
  const L = p.look, skin = C(sk), skinD = shadeC(skin, 0.84), skinL = shadeC(skin, 1.05);
  const top = R.headT + pose.bob, bot = R.headB + pose.bob;
  const fatC = Math.round((L.fat || 0) * 1.5);
  const halfW = 6 + (L.face === 1 ? 0 : 0) + (fatC > 1 ? 1 : 0);
  const cx = R.cx;
  // head shape: rounded box with jaw shape
  for (let y = top; y <= bot; y++) {
    const ty = (y - top) / (bot - top);
    let hw = halfW;
    if (ty < 0.15) hw -= 2; else if (ty < 0.25) hw -= 1;
    if (ty > 0.75) hw -= L.face === 2 ? 2 : L.face === 1 ? 0 : 1;
    if (ty > 0.9) hw -= L.face === 1 ? 1 : 2;
    if (fatC && ty > 0.6) hw += 1;
    for (let x = -hw; x < hw; x++) b.set(cx + x, y, x === -hw ? skinD : x >= hw - 1 ? skinD : skin);
  }
  // ears (elves: long and pointed)
  b.set(cx - halfW - 1, top + 7, skinD); b.set(cx + halfW, top + 7, skinD);
  if (p.race === 'elf') { b.set(cx - halfW - 2, top + 6, skinD); b.set(cx - halfW - 3, top + 5, skinD); b.set(cx + halfW + 1, top + 6, skinD); b.set(cx + halfW + 2, top + 5, skinD); }
  // eyes (look toward facing)
  const ey = top + 7, eo = facing > 0 ? 1 : 0;
  const iris = C(EYES[L.eyes % EYES.length]);
  for (const s of [-1, 1]) {
    const ex = cx + s * 3 - (s < 0 ? 1 : 0);
    b.set(ex, ey, WHITE); b.set(ex + 1, ey, WHITE); b.set(ex, ey + 1, WHITE); b.set(ex + 1, ey + 1, WHITE);
    b.set(ex + eo, ey, iris); b.set(ex + eo, ey + 1, INK);
    // brows
    const browCol = C(HAIR[L.hairColor % HAIR.length]);
    const bc = p.sex === 'm' || L.brow === 2 ? shadeC(browCol, 0.8) : browCol;
    b.set(ex, ey - 2 + (L.brow === 1 && s < 0 ? 0 : 0), bc); b.set(ex + 1, ey - 2, bc);
    if (p.sex === 'm' && L.brow !== 1) b.set(ex + (s < 0 ? -1 : 2), ey - 2 + (L.brow === 2 ? 1 : 0), bc);
    if (p.sex === 'f') b.set(ex + (s < 0 ? -1 : 2), ey, INK); // lashes
  }
  if (L.glasses) { const g = rgba(40, 36, 44); for (const s of [-1, 1]) { const ex = cx + s * 3 - (s < 0 ? 1 : 0); b.hline(ex - 1, ex + 2, ey - 1, g); b.hline(ex - 1, ex + 2, ey + 2, g); b.set(ex - 1, ey, g); b.set(ex + 2, ey, g); b.set(ex - 1, ey + 1, g); b.set(ex + 2, ey + 1, g); } b.set(cx, ey, g); }
  // nose & mouth
  b.set(cx + (facing > 0 ? 0 : -1), top + 9 + (L.nose === 2 ? 1 : 0), skinD); if (L.nose === 1) b.set(cx + (facing > 0 ? 1 : -2), top + 9, skinD);
  const mouth = p.mood > 60 ? 'smile' : p.mood < 30 ? 'frown' : 'flat';
  const my = top + 11;
  b.set(cx - 1, my, rgba(150, 70, 70)); b.set(cx, my, rgba(150, 70, 70));
  if (mouth === 'smile') { b.set(cx - 2, my - 1, rgba(150, 70, 70)); b.set(cx + 1, my - 1, rgba(150, 70, 70)); }
  if (mouth === 'frown') { b.set(cx - 2, my + 1, rgba(150, 70, 70)); b.set(cx + 1, my + 1, rgba(150, 70, 70)); }
  if (p.race === 'orc') { b.set(cx - 2, my - 1, rgba(250, 246, 230)); b.set(cx + 1, my - 1, rgba(250, 246, 230)); }
  if (p.sex === 'f') { b.set(cx - 4, top + 9, mixC(skin, rgba(240, 120, 120), 0.35)); b.set(cx + 3, top + 9, mixC(skin, rgba(240, 120, 120), 0.35)); }
  if (L.freckles) for (const [fx, fy] of [[-4, 9], [-3, 10], [3, 9], [2, 10]]) b.set(cx + fx, top + fy, shadeC(skin, 0.75));
  if (p.age > 55) { b.set(cx - 4, ey + 2, skinD); b.set(cx + 3, ey + 2, skinD); }
  if (p.traits?.includes('scarred')) b.line(cx + 2, top + 5, cx + 4, top + 10, rgba(170, 90, 90));
  // beard
  const hairC = C(HAIR[(p.age > 58 ? 7 : L.hairColor) % HAIR.length]), hairD = shadeC(hairC, 0.75), hairL = shadeC(hairC, 1.2);
  if (L.beard && p.age >= 17) {
    if (L.beard === 1) for (let x = -4; x < 4; x++) for (let y = 10; y <= 12; y++) if ((x + y) % 2 === 0) b.paintIf(cx + x, top + y, mixC(skin, hairC, 0.45));
    if (L.beard === 2) { b.rect(cx - 2, top + 12, 4, 2, hairC); b.hline(cx - 2, cx + 1, top + 10, hairC); }
    if (L.beard === 3) { for (let y = 9; y <= 14; y++) { const hw = y < 12 ? halfW : halfW - (y - 11); for (let x = -hw; x < hw; x++) if (y > 10 || Math.abs(x) > 2) b.set(cx + x, top + y, (x + y) % 3 ? hairC : hairD); } b.hline(cx - 2, cx + 1, top + 11, rgba(140, 60, 60)); }
    if (L.beard === 4) b.hline(cx - 3, cx + 2, top + 10, hairC);
  }
  drawHair(b, R, p, o, top, halfW, hairC, hairD, hairL, 'front');
  drawHat(b, o, cx, top, halfW);
}

function drawHair(b, R, p, o, top, halfW, hc, hd, hl, layer) {
  const s = p.look.hairStyle, cx = R.cx;
  const helmet = o.hat && !['crown', 'band', 'flatcap'].includes(o.hat);
  if (layer === 'back') {
    if (helmet && ![5, 6, 11].includes(s)) return;
    const long = { 5: 10, 6: 12, 11: 11, 9: 3, 7: 0, 12: 4 }[s];
    if (long) { const y0 = top + 4, y1 = top + 12 + long; for (let y = y0; y < y1; y++) { const hw = halfW + (s === 6 ? 2 + ((y >> 1) & 1) : s === 9 ? 3 : 1); for (let x = -hw; x < hw; x++) b.set(cx + x, y, (x + y) % 4 === 0 ? hd : hc); } }
    if (s === 7) { b.rect(cx + halfW - 1, top + 5, 2, 9, hc); b.vline(cx + halfW, top + 5, top + 13, hd); }
    return;
  }
  if (helmet) return;
  if (s === 0) { b.hline(cx - 3, cx + 2, top, shadeC(hc, 0)); return; }
  const cap = (rows, extra = 0) => { for (let y = 0; y < rows; y++) { const hw = halfW - (y === 0 ? 2 : y === 1 ? 1 : 0) + extra; for (let x = -hw; x < hw; x++) b.set(cx + x, top - 1 + y, y === 0 || x === -hw ? hd : (x + y) % 5 === 0 ? hl : hc); } };
  switch (s) {
    case 1: cap(2); break;
    case 2: cap(4); b.vline(cx - halfW, top + 2, top + 5, hc); b.vline(cx + halfW - 1, top + 2, top + 5, hc); break;
    case 3: cap(4); for (let k = -halfW; k < halfW; k += 2) { b.set(cx + k, top - 2, hc); b.set(cx + k + 1, top - 3 + (k & 1), hd); } b.rect(cx - 3, top + 3, 4, 1, hc); break; // messy spikes
    case 4: cap(4); b.hline(cx - 4, cx + 3, top + 3, hc); b.set(cx - 2, top, hl); b.vline(cx - halfW, top + 2, top + 6, hc); break;
    case 5: case 11: cap(4); b.vline(cx - halfW, top + 2, top + 10, hc); b.vline(cx + halfW - 1, top + 2, top + 10, hc); b.hline(cx - 4, cx + 1, top + 3, hc); if (s === 11) for (let y = top + 10; y < top + 18; y += 2) { b.set(cx - halfW, y, hd); b.set(cx + halfW - 1, y, hd); } break;
    case 6: cap(5, 1); for (let y = top + 2; y < top + 12; y++) { b.set(cx - halfW - 1, y, y % 2 ? hc : hd); b.set(cx - halfW, y, hc); b.set(cx + halfW - 1, y, hc); b.set(cx + halfW, y, y % 2 ? hd : hc); } b.hline(cx - 5, cx + 2, top + 3, hc); b.set(cx - 3, top + 4, hc); break; // big wavy (reference)
    case 7: cap(4); b.hline(cx - 4, cx + 3, top + 2, hc); break;
    case 8: cap(4); b.ellipse(cx - halfW, top, 2.6, 2.6, hc); b.ellipse(cx + halfW - 1, top, 2.6, 2.6, hc); b.set(cx - halfW, top - 1, hl); b.set(cx + halfW - 1, top - 1, hl); b.vline(cx - halfW, top + 2, top + 7, hc); b.vline(cx + halfW - 1, top + 2, top + 7, hc); break; // twin buns
    case 9: b.ellipse(cx, top + 3, halfW + 2.5, 6, hc); for (let k = 0; k < 10; k++) b.set(cx - halfW + ((k * 7) % (halfW * 2)), top - 1 + (k % 3) * 2, hd); for (let y = top + 5; y <= top + 9; y++) for (let x = -halfW + 2; x < halfW - 2; x++) if (y > top + 5) b.set(cx + x, y, 0); break;
    case 10: b.rect(cx - 1, top - 3, 2, 6, hc); b.vline(cx - 1, top - 3, top + 2, hd); b.hline(cx - halfW + 1, cx + halfW - 2, top + 1, shadeC(hc, 0.6)); break;
    case 12: cap(4); b.vline(cx - halfW, top + 2, top + 9, hc); b.vline(cx + halfW - 1, top + 2, top + 9, hc); b.vline(cx - halfW - 1, top + 4, top + 9, hd); b.vline(cx + halfW, top + 4, top + 9, hd); b.hline(cx - 5, cx + 4, top + 3, hc); break;
    case 13: cap(3); b.hline(cx - 4, cx + 4, top + 1, hl); break;
    case 14: cap(4); b.rect(cx - 5, top + 3, 5, 1, hc); b.set(cx - 5, top + 4, hc); break;
    default: cap(3);
  }
  if (s === 9) { // re-draw face area cleared by afro
    // (afro sits behind; the face drawn earlier is preserved by drawing the afro in the back layer instead)
  }
}

function drawHat(b, o, cx, top, hw) {
  const h = o.hat; if (!h) return;
  const metal = rgba(186, 190, 200), bronze = rgba(210, 156, 72);
  const dome = (col, rows = 5) => { for (let y = 0; y < rows; y++) { const w = hw + 1 - (y < 2 ? 2 - y : 0); for (let x = -w; x < w; x++) b.set(cx + x, top - 2 + y, x === -w ? shadeC(col, 0.7) : col); } b.set(cx - 2, top - 1, shadeC(col, 1.3)); };
  switch (h) {
    case 'band': b.hline(cx - hw, cx + hw - 1, top + 2, rgba(170, 60, 50)); b.set(cx + hw - 2, top, rgba(240, 240, 240)); b.set(cx + hw - 1, top - 1, rgba(240, 240, 240)); break;
    case 'bronzehelm': dome(bronze); b.vline(cx - hw, top + 2, top + 8, bronze); b.vline(cx + hw - 1, top + 2, top + 8, bronze); break;
    case 'crest': dome(metal); for (let x = -3; x < 4; x++) b.set(cx + x, top - 3 - (x === 0 ? 1 : 0), rgba(200, 40, 40)); break;
    case 'kettle': dome(metal, 4); b.hline(cx - hw - 2, cx + hw + 1, top + 2, shadeC(metal, 0.8)); break;
    case 'tricorn': b.rect(cx - hw - 1, top, hw * 2 + 2, 2, rgba(40, 36, 40)); b.rect(cx - hw + 2, top - 3, hw * 2 - 4, 3, rgba(50, 44, 50)); b.set(cx - hw - 2, top - 1, rgba(40, 36, 40)); b.set(cx + hw + 1, top - 1, rgba(40, 36, 40)); break;
    case 'kepi': b.rect(cx - hw + 1, top - 2, hw * 2 - 2, 4, o.trim ? shadeC(o.trim, 0.6) : rgba(60, 70, 100)); b.hline(cx - hw + 2, cx + hw, top + 2, rgba(30, 30, 30)); break;
    case 'combathelm': dome(rgba(92, 104, 64)); break;
    case 'visor': dome(rgba(70, 80, 100), 6); b.hline(cx - hw + 1, cx + hw - 2, top + 6, rgba(80, 230, 240)); b.hline(cx - hw + 1, cx + hw - 2, top + 7, rgba(60, 180, 200)); break;
    case 'flatcap': b.rect(cx - hw, top - 1, hw * 2, 3, rgba(84, 76, 70)); b.hline(cx - hw + 2, cx + hw + 1, top + 2, rgba(60, 54, 50)); break;
    case 'crown': for (let x = -4; x < 4; x++) b.set(cx + x, top - 1, rgba(240, 196, 60)); for (const x of [-4, -1, 2]) b.set(cx + x, top - 2, rgba(240, 196, 60)); b.set(cx - 1, top - 1, rgba(220, 60, 80)); break;
    case 'hood': for (let y = 0; y < 8; y++) { const w = hw + 1 - (y < 2 ? 2 - y : 0); for (let x = -w; x < w; x++) if (y < 3 || Math.abs(x) > w - 3) b.set(cx + x, top - 2 + y, x === -w ? rgba(200, 190, 160) : rgba(240, 232, 206)); } break;
  }
}

function heldItem(p, era, state) {
  if (state === 'fight' || (p.role === 'soldier' && state !== 'sleep')) return ['spear', 'spear', 'sword', 'sword', 'sword', 'musket', 'rifle', 'rifle', 'plasma', 'plasma'][era];
  if (state === 'work') return p.job === 'gather_stone' ? 'pick' : 'axe';
  if (p.role === 'prophet') return 'staff';
  if (p.role === 'doctor' && era >= 5) return 'clipboard';
  return null;
}

/** Build one frame into a PixBuf. */
export function drawFrame(p, era, nationColor, frameIdx, facing = 1) {
  const b = new PixBuf(FW, FH);
  const R = rig(p), o = outfitFor(p, era, nationColor), sk = skinOf(p);
  const pose = POSES[frameIdx];
  const state = frameIdx >= 8 ? 'fight' : frameIdx >= 6 ? 'work' : 'idle';
  const item = heldItem(p, era, state);
  const bob = pose.bob;
  const shift = (fn) => { const tmp = new PixBuf(FW, FH); fn(tmp); for (let y = FH - 1; y >= 0; y--) for (let x = 0; x < FW; x++) { const c = tmp.d[y * FW + x]; if (c) b.set(x, y + (y < R.hipY ? bob : 0), c); } };
  // cape & long hair behind
  if (o.cape) { const cc = o.cape; for (let y = R.shY + 1; y < R.hipY + 6; y++) { const hw = R.shoulder + 1 + ((y - R.shY) >> 2); for (let x = -hw; x < hw; x++) b.set(R.cx + x, y + bob, x === -hw ? shadeC(cc, 0.7) : cc); } }
  const hb = new PixBuf(FW, FH); drawHair(hb, R, p, o, R.headT + bob, 6 + ((p.look.fat || 0) > 0.66 ? 1 : 0), C(HAIR[(p.age > 58 ? 7 : p.look.hairColor) % HAIR.length]), shadeC(C(HAIR[(p.age > 58 ? 7 : p.look.hairColor) % HAIR.length]), 0.75), 0, 'back'); b.blit(hb, 0, 0);
  drawLegs(b, R, o, sk, pose);
  shift((t) => { drawArm(t, R, o, sk, pose, -1, null); drawTorso(t, R, o, sk, pose); drawArm(t, R, o, sk, pose, 1, item); });
  drawHead(b, R, p, o, sk, pose, facing);
  b.outline();
  return b;
}

// ---------- sprite cache ----------
const cache = new Map();
export function pawnKey(p, era, nationColor) {
  const L = p.look;
  return `${p.id}|${era}|${p.role}|${p.age < 14 ? 'c' : p.age > 58 ? 'o' : 'a'}|${p.mood > 60 ? 2 : p.mood < 30 ? 0 : 1}|${nationColor}|${L.hairStyle}|${(p.traits || []).includes('scarred') ? 1 : 0}`;
}
/** Returns a canvas strip of 10 frames (FW*10 x FH). */
export function pawnSheet(p, era, nationColor) {
  const key = pawnKey(p, era, nationColor);
  let e = cache.get(key);
  if (e) { e.t = performance.now(); return e.c; }
  const c = makeCanvas(FW * 10, FH);
  for (let f = 0; f < 10; f++) drawFrame(p, era, nationColor, f).toCanvas(c, f * FW, 0);
  cache.set(key, { c, t: performance.now() });
  if (cache.size > 900) { // evict least recently used
    const arr = [...cache.entries()].sort((a, b) => a[1].t - b[1].t);
    for (let i = 0; i < 200; i++) cache.delete(arr[i][0]);
  }
  return c;
}
/** Portrait (head & shoulders) for UI, scaled up. */
export function pawnPortrait(p, era, nationColor, scale = 4) {
  const b = drawFrame(p, era, nationColor, 0);
  const R = rig(p);
  const y0 = Math.max(0, R.headT - 5), h = Math.min(FH - y0, 26);
  const c = makeCanvas(FW * scale, h * scale);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(b.toCanvas(), 0, y0, FW, h, 0, 0, FW * scale, h * scale);
  return c;
}

/** Separate body parts for the ragdoll. Returns {head, torso, armL, armR, legL, legR} each {c, ax, ay, len}. */
export function pawnParts(p, era, nationColor) {
  const R = rig(p), o = outfitFor(p, era, nationColor), sk = skinOf(p), pose = POSES[0];
  const crop = (b, ax, ay) => { b.outline(); let x0 = FW, y0 = FH, x1 = 0, y1 = 0; for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (b.d[y * FW + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } const w = x1 - x0 + 1, h = y1 - y0 + 1; const nb = new PixBuf(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nb.d[y * w + x] = b.d[(y0 + y) * FW + x0 + x]; return { c: nb.toCanvas(), ax: ax - x0, ay: ay - y0, w, h }; };
  const mk = (fn) => { const b = new PixBuf(FW, FH); fn(b); return b; };
  const head = crop(mk((b) => { const hb = new PixBuf(FW, FH); drawHair(hb, R, p, o, R.headT, 6, C(HAIR[p.look.hairColor % HAIR.length]), shadeC(C(HAIR[p.look.hairColor % HAIR.length]), 0.75), 0, 'back'); for (let i = 0; i < hb.d.length; i++) if ((i / FW | 0) <= R.headB + 2) b.d[i] = hb.d[i]; drawHead(b, R, p, o, sk, pose); }), R.cx, R.headB);
  const torso = crop(mk((b) => drawTorso(b, R, o, sk, pose)), R.cx, R.shY);
  const armL = crop(mk((b) => drawArm(b, R, o, sk, pose, -1, null)), R.cx - torsoHalf(R, R.shY + 1), R.shY + 1);
  const armR = crop(mk((b) => drawArm(b, R, o, sk, pose, 1, null)), R.cx + torsoHalf(R, R.shY + 1), R.shY + 1);
  const legL = crop(mk((b) => drawLegs(b, R, o, sk, pose, -1)), R.cx - R.hip + 1, R.hipY);
  const legR = crop(mk((b) => drawLegs(b, R, o, sk, pose, 1)), R.cx + R.hip - 1, R.hipY);
  return { head, torso, armL, armR, legL, legR, rig: R };
}
