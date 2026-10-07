// Darkness overlay: lights "erase" the night, then colored glows are added on top.
import { VIEW_W, VIEW_H } from './config.js';
import { makeCanvas } from './utils.js';

const rgbCache = new Map();
export function rgba(hex, a) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const n = parseInt(hex.slice(1), 16);
    rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    rgbCache.set(hex, rgb);
  }
  return `rgba(${rgb},${a})`;
}

// Cast rays across a cone, stopping at walls. Returns screen-space polygons (outer soft + inner hard).
export function buildCone(map, x, y, ang, spread, range, camX, camY) {
  const RAYS = 36;
  const soft = spread * 1.4;
  const outer = [x - camX, y - camY];
  const inner = [x - camX, y - camY];
  for (let i = 0; i <= RAYS; i++) {
    const a = ang - soft + (i / RAYS) * soft * 2;
    const len = map.rayLength(x, y, a, range) + 6;
    const px = x + Math.cos(a) * len - camX;
    const py = y + Math.sin(a) * len - camY;
    outer.push(px, py);
    if (Math.abs(a - ang) <= spread) inner.push(px, py);
  }
  return { sx: x - camX, sy: y - camY, range, outer, inner };
}

function fillPoly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

export class Lighting {
  constructor() {
    [this.canvas, this.ctx] = makeCanvas(VIEW_W, VIEW_H);
    [this.vignette] = makeCanvas(VIEW_W, VIEW_H);
    const v = this.vignette.getContext('2d');
    const grd = v.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.6)');
    v.fillStyle = grd;
    v.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // lights: [{x,y,r,intensity,color}] in screen space. cones: from buildCone. glows: additive colored lights.
  render(target, darkness, lights, cones, glows) {
    const g = this.ctx;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = `rgba(5,7,16,${darkness})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.globalCompositeOperation = 'destination-out';

    for (const l of lights) {
      if (l.x < -l.r || l.y < -l.r || l.x > VIEW_W + l.r || l.y > VIEW_H + l.r) continue;
      const grd = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grd.addColorStop(0, `rgba(0,0,0,${l.intensity})`);
      grd.addColorStop(0.45, `rgba(0,0,0,${l.intensity * 0.65})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }

    for (const c of cones) {
      const grd = g.createRadialGradient(c.sx, c.sy, 2, c.sx, c.sy, c.range);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.92)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.globalAlpha = 0.45;
      fillPoly(g, c.outer);
      g.globalAlpha = 1;
      fillPoly(g, c.inner);
    }
    g.globalCompositeOperation = 'source-over';
    target.drawImage(this.canvas, 0, 0);

    // Additive color on top of the darkness.
    target.save();
    target.globalCompositeOperation = 'lighter';
    for (const c of cones) {
      const grd = target.createRadialGradient(c.sx, c.sy, 2, c.sx, c.sy, c.range);
      grd.addColorStop(0, 'rgba(255,236,190,0.13)');
      grd.addColorStop(1, 'rgba(255,236,190,0)');
      target.fillStyle = grd;
      fillPoly(target, c.inner);
    }
    for (const l of glows) {
      if (l.x < -l.r || l.y < -l.r || l.x > VIEW_W + l.r || l.y > VIEW_H + l.r) continue;
      const grd = target.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grd.addColorStop(0, rgba(l.color, l.alpha));
      grd.addColorStop(1, rgba(l.color, 0));
      target.fillStyle = grd;
      target.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    target.restore();
  }

  drawVignette(target) {
    target.drawImage(this.vignette, 0, 0);
  }
}
