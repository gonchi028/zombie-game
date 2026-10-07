// Particles (short-lived effects) and Decals (permanent marks baked into a world-sized canvas).
import { makeCanvas, pixCircle, pixEllipse, pixRing, rand, TAU } from './utils.js';
import { drawPosed } from './anim.js';
import { drawText } from './font.js';

const BLOOD = ['#5e0f0f', '#7a1414', '#4a0b0b', '#6a1010'];
const FIRE = ['#fff3b0', '#ffd24a', '#ff9a2a', '#ff5a1a', '#b8260a', '#5a1208'];

export class Decals {
  constructor(w, h) {
    [this.canvas, this.ctx] = makeCanvas(w, h);
  }
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  pixel(x, y, color, size = 1) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), size, size);
  }
  blood(x, y, size = 6, palette = BLOOD) {
    const g = this.ctx;
    g.globalAlpha = 0.85;
    const n = 3 + Math.floor(size / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = Math.random() * size * 0.7;
      pixCircle(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, Math.max(1, Math.floor(rand(1, size * 0.45))), palette[i % palette.length]);
    }
    for (let i = 0; i < n * 2; i++) {
      const a = Math.random() * TAU, d = size * rand(0.6, 1.5);
      g.fillStyle = palette[i % palette.length];
      g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.6), 1, 1);
    }
    g.globalAlpha = 1;
  }
  // A body that finished its ragdoll flight, lying at (x, y) rotated by rot.
  body(img, x, y, rot) {
    const g = this.ctx;
    g.save();
    g.globalAlpha = 0.92;
    g.translate(Math.round(x), Math.round(y));
    g.rotate(rot);
    g.drawImage(img, -(img.width >> 1), -(img.height >> 1));
    g.restore();
  }
  scorch(x, y, r) {
    const g = this.ctx;
    g.globalAlpha = 0.35;
    pixCircle(g, x, y, Math.round(r * 0.55), '#0a0806');
    g.globalAlpha = 0.25;
    pixCircle(g, x, y, Math.round(r * 0.8), '#0a0806');
    g.globalAlpha = 0.6;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * TAU, d = Math.random() * r;
      g.fillStyle = i % 3 ? '#14100c' : '#3a2a1a';
      g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
    }
    g.globalAlpha = 1;
  }
}

export class Particles {
  constructor(decals) {
    this.decals = decals;
    this.list = [];
  }

  add(p) {
    if (this.list.length > 1400 && p.type !== 'body') return null;
    p.t = 0;
    p.z ??= 0;
    p.vz ??= 0;
    p.vx ??= 0;
    p.vy ??= 0;
    p.size ??= 1;
    p.drag ??= 0;
    p.gravity ??= 0;
    this.list.push(p);
    return p;
  }

  // ------------------------------------------------------------------ emitters
  blood(x, y, angle, count = 6, palette = BLOOD, force = 60) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-0.8, 0.8);
      const s = rand(0.3, 1) * force;
      this.add({
        type: 'drop', x, y, z: rand(3, 8), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(10, 60),
        gravity: 260, life: 2, color: palette[i % palette.length], size: Math.random() < 0.3 ? 2 : 1, stamp: true,
      });
    }
  }

  gibs(x, y, count = 5, palette = BLOOD) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = rand(30, 90);
      this.add({
        type: 'drop', x, y, z: rand(4, 10), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(40, 110),
        gravity: 300, life: 2, color: palette[i % palette.length], size: 2, stamp: true,
      });
    }
  }

  casing(x, y, aim) {
    const a = aim + Math.PI / 2 * (Math.cos(aim) >= 0 ? -1 : 1) + rand(-0.4, 0.4);
    this.add({
      type: 'casing', x, y: y + 3, z: 4, vx: Math.cos(a) * rand(25, 50), vy: Math.sin(a) * rand(15, 30), vz: rand(40, 70),
      gravity: 320, life: 3, color: '#e0b84a', bounces: 1,
    });
  }

  sparks(x, y, angle, count = 5, color = '#ffe08a') {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-1.1, 1.1), s = rand(40, 140);
      this.add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 6, life: rand(0.08, 0.25), color, add: true });
    }
  }

  smoke(x, y, count = 3, dark = false) {
    for (let i = 0; i < count; i++) {
      this.add({
        type: 'smoke', x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-8, 8), vy: rand(-18, -6), drag: 1,
        life: rand(0.6, 1.4), size: rand(2, 4), grow: rand(4, 8), color: dark ? '#141214' : '#3a3a40',
      });
    }
  }

  fire(x, y, spread = 3, rise = 26) {
    this.add({
      type: 'fire', x: x + rand(-spread, spread), y: y + rand(-spread * 0.5, spread * 0.5), vx: rand(-6, 6), vy: -rand(rise * 0.5, rise),
      life: rand(0.25, 0.6), size: Math.random() < 0.4 ? 2 : 1, add: true,
    });
  }

  explosion(x, y, r) {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * TAU, s = rand(20, r * 3);
      this.add({ type: 'fire', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 5, life: rand(0.25, 0.7), size: rand(1, 3) | 0, add: true });
    }
    this.sparks(x, y, 0, 14, '#ffd24a');
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, d = Math.random() * r * 0.6;
      this.add({
        type: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12 - 10, drag: 1.5,
        life: rand(0.8, 1.8), size: rand(3, 6), grow: rand(6, 12), color: '#1c1a1c',
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * TAU, s = rand(40, 100);
      this.add({
        type: 'drop', x, y, z: 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(50, 120), gravity: 300, life: 2,
        color: '#2a2622', size: 1, stamp: true,
      });
    }
    this.add({ type: 'ring', x, y, life: 0.3, r0: 4, r1: r, color: '#ffd89a' });
  }

  ring(x, y, r, color = '#ffffff', life = 0.3) {
    this.add({ type: 'ring', x, y, life, r0: 3, r1: r, color });
  }

  text(x, y, str, color = '#fff', life = 0.9) {
    this.add({ type: 'text', x, y, vy: -22, drag: 2, life, str, color });
  }

  muzzle(x, y, angle, scale = 1) {
    this.add({ type: 'muzzle', x, y, angle, life: 0.05, size: scale, add: true });
  }

  // (x, y) is the foot pivot; the pose is copied so the ghost keeps the squash it was taken with.
  afterimage(x, y, img, pose) {
    this.add({ type: 'ghost', x, y, img, pose: { ...pose }, life: 0.22 });
  }

  dust(x, y, count = 2, spread = 3) {
    for (let i = 0; i < count; i++) {
      this.add({
        type: 'smoke', x: x + rand(-spread, spread), y: y + rand(-1, 1), vx: rand(-14, 14), vy: rand(-8, -2), drag: 4,
        life: rand(0.25, 0.45), size: 1, grow: rand(1, 3), color: '#6a645c',
      });
    }
  }

  // Ragdoll: a dead body launched into the air that tumbles, bounces once and lands as a corpse decal.
  // rot is the final lying angle (it may include extra full spins for big hits).
  body(img, x, y, vx, vy, vz, rot, lift = 0) {
    const gravity = 420;
    this.add({
      type: 'body', img, x, y, vx, vy, vz, gravity, drag: 1.2, life: 6, rot, lift, bounces: 1,
      flight: Math.max(0.12, (2 * vz) / gravity), squash: 0,
    });
  }

  // ------------------------------------------------------------------ simulation
  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      if (p.t >= p.life) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.squash) p.squash = Math.max(0, p.squash - dt * 6);
      if (p.gravity) {
        p.vz -= p.gravity * dt;
        p.z += p.vz * dt;
        if (p.z <= 0) {
          p.z = 0;
          if (p.type === 'body' && p.bounces > 0) {
            p.bounces--;
            p.vz = -p.vz * 0.3;
            p.vx *= 0.45;
            p.vy *= 0.45;
            p.squash = 1;
            this.decals.blood(p.x, p.y, 4);
          } else if (p.type === 'body') {
            this.decals.body(p.img, p.x, p.y - 1, p.rot);
            list[i] = list[list.length - 1];
            list.pop();
          } else if (p.type === 'casing' && p.bounces > 0) {
            p.bounces--;
            p.vz = -p.vz * 0.35;
            p.vx *= 0.5;
            p.vy *= 0.5;
          } else {
            if (p.stamp || p.type === 'casing') this.decals.pixel(p.x, p.y, p.type === 'casing' ? '#9a7a3a' : p.color, p.size);
            list[i] = list[list.length - 1];
            list.pop();
          }
        }
      }
    }
  }

  draw(g, cx, cy) {
    for (const p of this.list) {
      if (p.add) continue;
      const k = p.t / p.life;
      switch (p.type) {
        case 'drop':
        case 'casing':
          g.fillStyle = p.color;
          g.fillRect(Math.round(p.x - cx), Math.round(p.y - p.z - cy), p.size, p.size);
          break;
        case 'smoke': {
          g.globalAlpha = 0.45 * (1 - k);
          pixCircle(g, p.x - cx, p.y - cy, Math.round(p.size + p.grow * k), p.color);
          g.globalAlpha = 1;
          break;
        }
        case 'ghost':
          g.globalAlpha = 0.4 * (1 - k);
          drawPosed(g, p.img, p.x - cx, p.y - cy, p.pose);
          g.globalAlpha = 1;
          break;
        case 'body': {
          const img = p.img;
          const f = Math.min(1, p.t / p.flight);
          // standing centre -> lying centre as it rotates over
          const lift = p.lift * (1 - f);
          pixEllipse(g, p.x - cx, p.y - cy + 1, Math.max(2, img.width >> 2) + 2, 2, 'rgba(0,0,0,0.3)');
          g.save();
          g.translate(Math.round(p.x - cx), Math.round(p.y - 1 - p.z - lift - cy));
          g.rotate(f < 1 ? Math.round((p.rot * f) / 0.1) * 0.1 : p.rot);
          g.scale(1 + p.squash * 0.3, 1 - p.squash * 0.25);
          g.drawImage(img, -(img.width >> 1), -(img.height >> 1));
          g.restore();
          break;
        }
      }
    }
  }

  // Bright stuff drawn after the darkness pass so it glows.
  drawAdditive(g, cx, cy) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (!p.add) continue;
      const k = p.t / p.life;
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
      switch (p.type) {
        case 'spark':
          g.fillStyle = p.color;
          g.globalAlpha = 1 - k;
          g.fillRect(x, y, 1, 1);
          g.fillRect(Math.round(x - p.vx * 0.012), Math.round(y - p.vy * 0.012), 1, 1);
          break;
        case 'fire':
          g.globalAlpha = 0.9;
          g.fillStyle = FIRE[Math.min(FIRE.length - 1, Math.floor(k * FIRE.length))];
          g.fillRect(x, y, p.size, p.size);
          break;
        case 'muzzle': {
          g.globalAlpha = 1;
          const s = p.size;
          const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
          g.fillStyle = '#fff6c8';
          g.fillRect(x - 1, y - 1, 3, 3);
          g.fillStyle = '#ffc84a';
          for (let d = 2; d <= 3 + s * 3; d++) g.fillRect(Math.round(x + ca * d), Math.round(y + sa * d), 1, 1);
          g.fillRect(Math.round(x - sa * 2), Math.round(y + ca * 2), 1, 1);
          g.fillRect(Math.round(x + sa * 2), Math.round(y - ca * 2), 1, 1);
          break;
        }
      }
    }
    g.restore();
  }

  // Rings and floating texts are UI-like: drawn last, unaffected by darkness.
  drawOverlay(g, cx, cy) {
    for (const p of this.list) {
      const k = p.t / p.life;
      if (p.type === 'ring') {
        g.globalAlpha = 1 - k;
        pixRing(g, p.x - cx, p.y - cy, p.r0 + (p.r1 - p.r0) * Math.sqrt(k), p.color);
        g.globalAlpha = 1;
      } else if (p.type === 'text') {
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        drawText(g, p.str, p.x - cx, p.y - cy, p.color, 'center');
        g.globalAlpha = 1;
      }
    }
  }
}
