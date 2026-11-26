// Melee & ranged combat for pawns and animals. Hits create body-part injuries; strong hits knock targets back (ragdoll fx).
import { injure } from './health.js';
import { eraOf } from '../data/eras.js';
import { gainXp, addThought } from './pawn.js';
import { emitFx } from './world.js';
import { dist, dx } from '../core/util.js';

export const ANIMALS = {
  deer:     { name: 'Deer', hp: 40, dmg: 3, speed: 60, meat: 8, hide: 3, biomes: [4, 5, 6, 10], predator: false, size: 1 },
  boar:     { name: 'Boar', hp: 55, dmg: 7, speed: 45, meat: 9, hide: 2, biomes: [5, 11, 12, 4], predator: false, fights: true, size: 0.9 },
  wolf:     { name: 'Wolf', hp: 45, dmg: 9, speed: 62, meat: 5, hide: 3, biomes: [6, 7, 5], predator: true, size: 0.9 },
  bear:     { name: 'Bear', hp: 110, dmg: 16, speed: 44, meat: 16, hide: 6, biomes: [5, 6, 13], predator: true, size: 1.4 },
  camel:    { name: 'Camel', hp: 70, dmg: 4, speed: 40, meat: 12, hide: 4, biomes: [9, 10], predator: false, size: 1.3 },
  elephant: { name: 'Elephant', hp: 220, dmg: 22, speed: 34, meat: 40, hide: 10, biomes: [10, 11], predator: false, fights: true, size: 2 },
  mammoth:  { name: 'Mammoth', hp: 260, dmg: 24, speed: 32, meat: 50, hide: 14, biomes: [7, 6], predator: false, fights: true, size: 2.2, era0: true },
  sheep:    { name: 'Wild Sheep', hp: 35, dmg: 2, speed: 40, meat: 6, hide: 5, biomes: [4, 13, 7], predator: false, size: 0.8 },
};

export function weaponOf(world, p) {
  const n = world.nations[p.nationId];
  return eraOf(p.gearEra ?? n?.era ?? 0).weapon;
}
export function armorOf(world, p) { return eraOf(p.gearEra ?? 0).armor; }

/** Pawn attacks a pawn or animal. Returns true when a blow was struck. */
export function pawnAttack(world, p, target, rng) {
  const w = weaponOf(world, p);
  const d = dist(p.x, p.y, target.x, target.y, world.W);
  const ranged = w.ranged > 0 && d > 1.4 && p.role === 'soldier';
  if (!ranged && d > 1.4) return false;
  if (ranged && d > w.range) return false;
  const skill = ranged ? p.skills.shooting.lvl : p.skills.melee.lvl;
  const hitChance = Math.min(0.95, (ranged ? 0.45 : 0.6) + skill * 0.022 - (target.fx?.speed || 0) * 0.1);
  p.facing = dx(p.x, target.x, world.W) >= 0 ? 1 : -1;
  p.attackAnim = 1;
  if (ranged) emitFx(world, { type: 'projectile', x: p.x, y: p.y - 0.8, tx: target.x, ty: target.y - 0.6, era: p.gearEra });
  gainXp(p, ranged ? 'shooting' : 'melee', 40);
  if (!rng.chance(hitChance)) return true;
  let dmg = (ranged ? w.ranged : w.melee) * (1 + skill * 0.04) * (1 + ((ranged ? p.fx.ranged : p.fx.melee) || 0));
  if (p.buff.valorUntil > world.time) dmg *= 1.35;
  if (p.buff.championUntil) dmg *= 1.6;
  if (target.look) { // pawn target
    dmg *= 1 - armorOf(world, target);
    const kind = ranged ? (p.gearEra >= 5 ? 'gunshot' : 'cut') : p.gearEra === 0 ? 'cut' : rng.chance(0.3) ? 'blunt' : 'cut';
    injure(target, rng, dmg * rng.range(0.6, 1.3), kind);
    target.lastAttacker = p.id;
    if (dmg > 14 && rng.chance(0.4)) emitFx(world, { type: 'knock', pid: target.id, ix: p.facing * (2 + dmg * 0.1), iy: -2 });
  } else { // animal
    target.hp -= dmg; target.lastAttacker = p.id;
    if (ANIMALS[target.kind].fights || ANIMALS[target.kind].predator) target.angry = p.id;
  }
  emitFx(world, { type: 'hit', x: target.x, y: target.y - 0.6, blood: true });
  return true;
}

export function animalAttack(world, a, p, rng) {
  if (dist(a.x, a.y, p.x, p.y, world.W) > 1.3) return false;
  const A = ANIMALS[a.kind];
  injure(p, rng, A.dmg * rng.range(0.6, 1.3) * (1 - armorOf(world, p)), 'bite');
  emitFx(world, { type: 'hit', x: p.x, y: p.y - 0.6, blood: true });
  if (A.size > 1.5 && rng.chance(0.5)) emitFx(world, { type: 'knock', pid: p.id, ix: (p.x > a.x ? 1 : -1) * 5, iy: -3 });
  addThought(p, 'pain', world.time);
  return true;
}
