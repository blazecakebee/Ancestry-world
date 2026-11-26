// Health: body-part injuries with bleeding, infection, diseases with an immunity race, pain and death.
import { clamp } from '../core/util.js';
import { maxHp } from './pawn.js';

export const PARTS = ['head', 'torso', 'left arm', 'right arm', 'left leg', 'right leg'];
const PART_W = [1, 4, 1.5, 1.5, 1.6, 1.6];
export const DISEASES = {
  flu:       { name: 'Flu', sevRate: 0.22, immRate: 0.26, pain: 0.05, lethal: true, contagious: 0.03 },
  plague:    { name: 'Plague', sevRate: 0.42, immRate: 0.32, pain: 0.2, lethal: true, contagious: 0.06 },
  malaria:   { name: 'Malaria', sevRate: 0.3, immRate: 0.28, pain: 0.12, lethal: true, contagious: 0 },
  gutWorms:  { name: 'Gut worms', sevRate: 0.1, immRate: 0.12, pain: 0.15, lethal: false, contagious: 0 },
  infection: { name: 'Wound infection', sevRate: 0.4, immRate: 0.36, pain: 0.1, lethal: true, contagious: 0 },
  hypothermia: { name: 'Hypothermia', env: true, pain: 0.1, lethal: true },
  heatstroke:  { name: 'Heatstroke', env: true, pain: 0.1, lethal: true },
  smogLung:  { name: 'Smog lung', sevRate: 0.04, immRate: 0.05, pain: 0.06, lethal: false, contagious: 0 },
};
export const MED_QUALITY = [0.1, 0.18, 0.22, 0.24, 0.28, 0.34, 0.45, 0.55, 0.7, 0.8]; // by era

export function injure(p, rng, dmg, kind = 'cut', partHint = null) {
  if (p.dead) return null;
  dmg *= Math.max(0.15, 1 + (p.fx.dmgTaken || 0));
  if (p.buff.championUntil) dmg *= 0.6;
  const part = partHint ?? rng.weighted(PARTS.map((n, i) => [i, PART_W[i]]));
  const inj = { part, kind, sev: dmg, bleed: kind === 'blunt' || kind === 'burn' ? 0 : dmg * 0.03, tq: 0, inf: 0 };
  if (part === 0) inj.bleed *= 1.6;
  // merge with an existing wound of the same kind on the same part
  const ex = p.injuries.find((j) => j.part === part && j.kind === kind && j.tq === 0);
  if (ex) { ex.sev += dmg; ex.bleed += inj.bleed; } else p.injuries.push(inj);
  return inj;
}

export function addDisease(p, id, sev = 0.05) {
  if (p.dead || p.diseases.some((d) => d.id === id)) return false;
  p.diseases.push({ id, sev, imm: 0 });
  return true;
}

export const isBleeding = (p) => p.injuries.some((j) => j.bleed > 0 && j.tq === 0);
export const needsTending = (p) => !p.dead && (p.injuries.some((j) => j.tq === 0) || p.diseases.some((d) => !DISEASES[d.id].env && !d.tended));
export const isSick = (p) => p.diseases.length > 0;

/** Advance health by dt days. Returns a death cause string, or null. */
export function stepHealth(p, dt, rng, ctx) {
  if (p.dead) return null;
  const inBed = ctx.inBed;
  let bleedRate = 0, painSum = 0, dmgSum = 0;
  for (const j of p.injuries) {
    if (j.tq === 0) bleedRate += j.bleed;
    // healing: tended wounds heal fast; untended ones only once they stop bleeding
    const heal = j.tq > 0 ? 9 * (0.5 + j.tq) * (inBed ? 1.4 : 1) : (j.bleed === 0 ? 2 : 0.6);
    j.sev -= heal * dt;
    if (j.tq === 0 && j.bleed > 0) j.bleed = Math.max(0, j.bleed - dt * 0.15); // clotting
    // infection risk for poorly tended open wounds
    if (j.kind !== 'blunt' && j.sev > 6 && (j.tq < 0.3) && rng.chance(dt * 0.12 * (1 - j.tq * 2))) addDisease(p, 'infection', 0.05);
    painSum += j.sev * (j.kind === 'burn' ? 0.019 : 0.0125);
    dmgSum += j.sev;
  }
  p.injuries = p.injuries.filter((j) => j.sev > 0.5);
  if (p.injuries.length === 0 && p.injuries.scarCheck) p.injuries.scarCheck = false;

  p.blood = clamp(p.blood - bleedRate * dt + (bleedRate === 0 ? 0.35 * dt : 0), 0, 1);

  for (const d of p.diseases) {
    const D = DISEASES[d.id];
    if (D.env) { // environmental: resolved by context (temperature) below
      d.sev = clamp(d.sev + (ctx.envStress?.[d.id] || -0.6) * dt, 0, 1);
    } else {
      const tendBonus = d.tended ? 0.55 : 1;
      d.sev = clamp(d.sev + D.sevRate * tendBonus * dt, 0, 1);
      d.imm = clamp(d.imm + D.immRate * (1 + (p.fx.immunity || 0)) * (inBed ? 1.25 : 1) * (p.needs.rest > 0.3 ? 1 : 0.8) * dt * (1 + (d.tq || 0)), 0, 1);
    }
    painSum += D.pain * d.sev;
  }
  for (const d of p.diseases) if (DISEASES[d.id].lethal && d.sev >= 1) return DISEASES[d.id].name;
  const cured = p.diseases.filter((d) => (!DISEASES[d.id].env && d.imm >= 1) || (DISEASES[d.id].env && d.sev <= 0));
  if (cured.length) {
    p.diseases = p.diseases.filter((d) => !cured.includes(d));
    for (const c of cured) if (c.id === 'plague' && !p.traits.includes('plagueSurvivor')) { p.traits.push('plagueSurvivor'); ctx.recompute = true; }
  }

  p.pain = clamp(painSum * (1 - (p.fx.pain || 0)), 0, 1);
  p.hp = maxHp(p) - dmgSum;
  const shock = p.traits.includes('wimp') ? 0.3 : 0.8;
  p.downed = p.hp < maxHp(p) * 0.25 || p.blood < 0.45 || p.pain >= shock || p.diseases.some((d) => d.sev > 0.85);
  if (p.hp <= 0) return 'Wounds';
  if (p.injuries.some((j) => j.part === 0 && j.sev > 40)) return 'Head trauma';
  if (p.blood <= 0.02) return 'Blood loss';
  return null;
}

/** A doctor tends a patient. quality 0..1 */
export function tend(patient, doctor, medQuality, inBed) {
  const skill = doctor ? doctor.skills.medical.lvl : 0;
  const q = clamp(0.15 + skill * 0.035 + medQuality + (inBed ? 0.1 : 0) + (doctor === patient ? -0.2 : 0), 0.05, 1);
  for (const j of patient.injuries) if (j.tq === 0) { j.tq = q; j.bleed = 0; }
  for (const d of patient.diseases) if (!DISEASES[d.id].env) { d.tended = true; d.tq = q * 0.5; }
  return q;
}
