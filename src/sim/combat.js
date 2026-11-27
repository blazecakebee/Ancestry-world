// Melee & ranged combat for pawns and animals. Hits create body-part injuries; strong hits knock targets back (ragdoll fx).
import { injure } from './health.js';
import { eraOf } from '../data/eras.js';
import { gainXp, addThought } from './pawn.js';
import { emitFx } from './world.js';
import { dist, dx } from '../core/util.js';

export const ANIMALS = {
  // Natural wildlife (non-empty biomes): spawns, grazes and breeds across the whole map. art = the Modern Farm sprite it wears,
  // scale = size relative to that sprite, w = how common it is in its biomes, herd = herd size on spawn, litter = young per birth.
  cow:      { name: 'Wild Cattle', hp: 80, dmg: 4, speed: 30, meat: 14, hide: 5, biomes: [4, 5, 20, 21, 25], predator: false, friendly: true, size: 1.2, art: 'cow', w: 3, herd: [2, 4], litter: 1 },
  horse:    { name: 'Wild Horse', hp: 75, dmg: 5, speed: 66, meat: 12, hide: 4, biomes: [4, 10, 18, 25], predator: false, size: 1.3, art: 'horse', w: 2, herd: [2, 4], litter: 1 },
  sheep:    { name: 'Wild Sheep', hp: 35, dmg: 2, speed: 40, meat: 6, hide: 5, biomes: [13, 6, 7, 18, 25, 19], predator: false, size: 0.8, art: 'sheep', w: 3, herd: [3, 6], litter: 1 },
  goat:     { name: 'Mountain Goat', hp: 38, dmg: 4, speed: 46, meat: 7, hide: 3, biomes: [13, 25, 19, 18, 24], predator: false, friendly: true, size: 0.8, art: 'goat', w: 3, herd: [2, 5], litter: 1 },
  pig:      { name: 'Wild Pig', hp: 45, dmg: 3, speed: 34, meat: 10, hide: 2, biomes: [5, 11, 12, 22, 21, 23], predator: false, friendly: true, size: 0.8, art: 'pig', w: 3, herd: [2, 4], litter: 2 },
  chicken:  { name: 'Junglefowl', hp: 8, dmg: 1, speed: 36, meat: 2, hide: 0, biomes: [5, 11, 22, 10, 4], predator: false, friendly: true, size: 0.4, art: 'chicken', w: 2, herd: [3, 6], litter: 3 },
  duck:     { name: 'Wild Duck', hp: 10, dmg: 1, speed: 34, meat: 2, hide: 0, biomes: [12, 23, 27, 3, 4], predator: false, friendly: true, size: 0.45, art: 'duck', w: 2, herd: [2, 5], litter: 3 },
  rabbit:   { name: 'Wild Rabbit', hp: 9, dmg: 0, speed: 52, meat: 1, hide: 1, biomes: [4, 5, 6, 7, 18, 20, 21, 25, 10], predator: false, friendly: true, size: 0.4, art: 'rabbit', w: 3, herd: [2, 5], litter: 3 },
  // Summoned-only kinds (empty biomes = never spawn naturally). friendly: never flees people; float: roams any land;
  // noHunt: hunters should leave it be; glitter: dropped for the killer's nation; fights: strikes back only when attacked.
  dog:      { name: 'Dog', hp: 40, dmg: 5, speed: 56, meat: 2, hide: 1, biomes: [], predator: false, friendly: true, noHunt: true, size: 0.7 },
  cat:      { name: 'Cat', hp: 22, dmg: 3, speed: 52, meat: 1, hide: 1, biomes: [], predator: false, friendly: true, noHunt: true, size: 0.5 },
  fox:      { name: 'Fox', hp: 28, dmg: 4, speed: 58, meat: 3, hide: 2, biomes: [5, 6, 21, 22, 25], predator: false, size: 0.6, w: 1, herd: [1, 2], litter: 2 },
  wisp:     { name: 'Wisp Spirit', hp: 16, dmg: 0, speed: 26, meat: 1, hide: 0, biomes: [], predator: false, friendly: true, float: true, noHunt: true, glitter: 6, size: 0.5 },
  slime_green: { name: 'Green Slime', hp: 18, dmg: 2, speed: 14, meat: 1, hide: 0, biomes: [], predator: false, friendly: true, fights: true, glitter: 1, size: 0.6 },
  slime_blue:  { name: 'Blue Slime', hp: 22, dmg: 2, speed: 13, meat: 1, hide: 0, biomes: [], predator: false, friendly: true, fights: true, glitter: 1.5, size: 0.6 },
  slime_red:   { name: 'Red Slime', hp: 28, dmg: 4, speed: 16, meat: 1, hide: 0, biomes: [], predator: false, friendly: true, fights: true, glitter: 2.5, size: 0.7 },
};

export function weaponOf(world, p) {
  const n = world.nations[p.nationId];
  return eraOf(p.gearEra ?? n?.era ?? 0).weapon;
}
export function armorOf(world, p) { return eraOf(p.gearEra ?? 0).armor; }

/** Pawn attacks a pawn or animal. Returns true when a blow was struck. */
export function pawnAttack(world, p, target, rng, opts = {}) {
  const w = opts.fists ? { melee: 3, ranged: 0, range: 1.2 } : weaponOf(world, p); // opts.fists: bare-handed punch; opts.melee: never shoot
  const d = dist(p.x, p.y, target.x, target.y, world.W);
  const ranged = !opts.fists && !opts.melee && w.ranged > 0 && d > 1.4 && p.role === 'soldier';
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
