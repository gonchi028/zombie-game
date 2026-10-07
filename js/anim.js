// Procedural "juice" layered on top of the baked pixel frames: squash & stretch, bob, lean, wobble.
// A pose is applied around the sprite's foot pivot (bottom-center), so characters squash into the
// ground instead of floating around their middle.

// Underdamped spring: kick() it on impacts and it wobbles back to 0 with a little overshoot.
export class Spring {
  constructor(k = 300, c = 12, max = 0.6) {
    this.k = k;
    this.c = c;
    this.max = max;
    this.v = 0;
    this.vel = 0;
  }
  // Kicks in the same direction taper off near max, so rapid fire saturates instead of flattening.
  kick(a) {
    if (a * this.v > 0) a *= 1 - Math.abs(this.v) / this.max;
    this.v = Math.max(-this.max, Math.min(this.max, this.v + a));
  }
  update(dt) {
    this.vel += (-this.k * this.v - this.c * this.vel) * dt;
    this.v += this.vel * dt;
    if (this.v > this.max) this.v = this.max;
    else if (this.v < -this.max) this.v = -this.max;
  }
}

export const newPose = () => ({ ox: 0, oy: 0, rot: 0, sx: 1, sy: 1 });

// Snap to coarse steps so nearest-neighbour scaling doesn't make pixels crawl every frame.
export function settlePose(P) {
  P.rot = Math.round(P.rot / 0.035) * 0.035;
  P.sx = Math.max(0.05, Math.round(P.sx * 16) / 16);
  P.sy = Math.max(0.05, Math.round(P.sy * 16) / 16);
  return P;
}

// Run fn with the canvas set up so (0,0) is the foot pivot and the sprite spans (-w/2, -h)..(w/2, 0).
export function withPose(g, fx, fy, P, fn) {
  g.save();
  g.translate(Math.round(fx + P.ox), Math.round(fy + P.oy));
  if (P.rot) g.rotate(P.rot);
  if (P.sx !== 1 || P.sy !== 1) g.scale(P.sx, P.sy);
  fn();
  g.restore();
}

export function drawPosed(g, img, fx, fy, P) {
  if (!P.rot && P.sx === 1 && P.sy === 1) {
    g.drawImage(img, Math.round(fx + P.ox) - (img.width >> 1), Math.round(fy + P.oy) - img.height);
    return;
  }
  withPose(g, fx, fy, P, () => g.drawImage(img, -(img.width >> 1), -img.height));
}

// Where a point given relative to the foot pivot ends up after the pose is applied.
export function posePoint(P, lx, ly) {
  const x = lx * P.sx, y = ly * P.sy;
  const c = Math.cos(P.rot), s = Math.sin(P.rot);
  return [P.ox + x * c - y * s, P.oy + x * s + y * c];
}

export function easeOutBack(t) {
  const c = 2.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
