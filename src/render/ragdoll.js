// Verlet ragdolls. Any character can be knocked down (blasts, gusts, heavy blows, quakes)
// or killed, and their body tumbles as a chain of parts: head - torso - legs (+ swinging arms).
// Simulated in sprite pixels: x = horizontal, z = height above the character's ground point.

const G = 900; // px/s^2 gravity
export class Ragdoll {
  /** frame: canvas holding one standing sprite at (sx, sy, sw, sh); band: {top, headEnd, hipY, bottom, cx} in frame pixels. */
  constructor(frame, sx, sy, sw, sh, band, ix = 0, iz = 0, opts = {}) {
    this.frame = frame; this.sx = sx; this.sy = sy; this.sw = sw; this.sh = sh; this.band = band;
    this.dead = !!opts.dead; this.age = 0; this.life = opts.life ?? (this.dead ? Infinity : 1.6); this.flip = opts.flip || 1;
    const { top, headEnd, hipY, bottom, cx } = band;
    const zAt = (y) => bottom - y; // height of a sprite row above the feet
    // points: 0 head top, 1 neck, 2 hip, 3 feet, 4 hand L, 5 hand R
    this.p = [
      { x: 0, z: zAt(top) }, { x: 0, z: zAt(headEnd) }, { x: 0, z: zAt(hipY) }, { x: 0, z: 0 },
      { x: -6, z: zAt(hipY) + 2 }, { x: 6, z: zAt(hipY) + 2 },
    ];
    for (const q of this.p) { q.px = q.x - ix * (q.z / 40 + 0.5) * 0.016; q.pz = q.z - iz * (q.z / 40 + 0.4) * 0.016; }
    const d = (a, b) => Math.hypot(this.p[a].x - this.p[b].x, this.p[a].z - this.p[b].z);
    this.c = [[0, 1, d(0, 1)], [1, 2, d(1, 2)], [2, 3, d(2, 3)], [0, 2, d(0, 2)], [1, 4, d(1, 4)], [1, 5, d(1, 5)], [4, 2, d(4, 2) * 1.05], [5, 2, d(5, 2) * 1.05]];
    this.rest = this.p.map((q) => ({ x: q.x, z: q.z }));
  }
  step(dt) {
    this.age += dt;
    dt = Math.min(dt, 1 / 30);
    const recover = !this.dead && this.age > this.life * 0.62;
    for (const q of this.p) {
      const vx = (q.x - q.px) * 0.99, vz = (q.z - q.pz) * 0.99;
      q.px = q.x; q.pz = q.z;
      q.x += vx; q.z += vz - G * dt * dt;
      if (q.z < 0) { q.z = 0; q.px = q.x - vx * 0.5; q.pz = q.z + vz * 0.35; } // ground bounce + friction
    }
    for (let it = 0; it < 4; it++) for (const [a, b, len] of this.c) {
      const A = this.p[a], B = this.p[b], dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1e-3, f = (d - len) / d * 0.5;
      A.x += dx * f; A.z += dz * f; B.x -= dx * f; B.z -= dz * f;
    }
    if (recover) { // stand back up
      const t = Math.min(1, (this.age - this.life * 0.62) / (this.life * 0.38));
      const ox = this.p[3].x;
      this.p.forEach((q, i) => { q.x += (ox + this.rest[i].x - q.x) * t * 0.35; q.z += (this.rest[i].z - q.z) * t * 0.35; q.px = q.x; q.pz = q.z; });
    }
    return this.dead || this.age < this.life;
  }
  /** Horizontal drift of the body in pixels (so the citizen ends up where they landed). */
  get offset() { return this.p[3].x; }
  draw(ctx, gx, gy, s) {
    const { top, headEnd, hipY, bottom, cx } = this.band, P = this.p, f = this.flip;
    const seg = (y0, y1, a, b, anchorTop) => {
      const A = P[a], B = P[b];
      const ang = Math.atan2(-(B.z - A.z), (B.x - A.x) * f) - Math.PI / 2;
      ctx.save();
      ctx.translate(gx + A.x * s, gy - A.z * s);
      ctx.rotate(-ang * f);
      ctx.scale(f, 1);
      ctx.drawImage(this.frame, this.sx, this.sy + y0, this.sw, y1 - y0, -cx * s, (anchorTop ? 0 : -(y1 - y0)) * s, this.sw * s, (y1 - y0) * s);
      ctx.restore();
    };
    seg(hipY, bottom + 1, 2, 3, true);
    seg(headEnd, hipY, 1, 2, true);
    // head: anchored at the neck, pointing to the head-top point
    const A = P[1], B = P[0];
    const ang = Math.atan2(B.z - A.z, (B.x - A.x) * f) - Math.PI / 2;
    ctx.save(); ctx.translate(gx + A.x * s, gy - A.z * s); ctx.rotate(-ang * f); ctx.scale(f, 1);
    ctx.drawImage(this.frame, this.sx, this.sy + top - 2, this.sw, headEnd - top + 3, -cx * s, -(headEnd - top + 3) * s, this.sw * s, (headEnd - top + 3) * s);
    ctx.restore();
  }
}
