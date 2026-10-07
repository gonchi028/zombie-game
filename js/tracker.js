// Motion tracker (upgrade): a corner radar that sweeps around the camera and pings nearby zombies.
// Blips light up when the sweep passes over them and fade until the next pass, and every
// revolution beeps higher the closer the nearest contact is.
import { VIEW_W, VIEW_H, PLAYER_COLORS } from './config.js';
import { drawText } from './font.js';
import { pixCircle, pixRing, TAU } from './utils.js';

const R = 26; // radar radius (screen px)
const CX = VIEW_W - 33, CY = 56; // tucked under the KILLS counter
const PERIOD = 1.5; // seconds per sweep
const RANGE = [0, 210, 340]; // world px covered at tracker level 1 / 2 (Deep Scan)
const TRAIL = 10;

const blipSize = (z) => (z.type === 'boss' ? 3 : z.mass >= 2 ? 2 : 1);

export class MotionTracker {
  constructor() {
    this.sweep = 0;
    this.level = 0;
    this.near = Infinity;
    this.alarm = 0;
  }

  center(game) {
    return { x: game.cam.x + VIEW_W / 2, y: game.cam.y + VIEW_H / 2 };
  }

  update(dt, game) {
    this.level = 0;
    for (const p of game.players) this.level = Math.max(this.level, p.stats.tracker);
    if (!this.level) return;
    const range = RANGE[this.level];
    const c = this.center(game);
    this.near = Infinity;
    for (const z of game.zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - c.x, z.y - c.y);
      if (d < this.near) this.near = d;
    }
    this.alarm = Math.max(0, this.alarm - dt * 2);
    const prev = this.sweep;
    this.sweep = (this.sweep + (dt * TAU) / PERIOD) % TAU;
    if (this.sweep < prev && this.near < range) {
      const close = 1 - this.near / range;
      game.sfx.play(close > 0.65 ? 'pingclose' : 'ping', 0.25 + close * 0.35);
      if (close > 0.65) this.alarm = 1;
    }
  }

  draw(g, game) {
    if (!this.level) return;
    const range = RANGE[this.level];
    const k = R / range;
    const c = this.center(game);
    const t = game.time;

    // housing
    pixCircle(g, CX, CY, R + 2, 'rgba(0,0,0,0.6)');
    pixCircle(g, CX, CY, R, 'rgba(8,28,14,0.82)');
    g.fillStyle = 'rgba(90,255,120,0.12)';
    g.fillRect(CX - R + 1, CY, R * 2 - 1, 1);
    g.fillRect(CX, CY - R + 1, 1, R * 2 - 1);
    pixRing(g, CX, CY, Math.round(R / 2), 'rgba(90,255,120,0.18)');
    const hot = this.alarm > 0 && Math.floor(t * 8) % 2 === 0;
    pixRing(g, CX, CY, R, hot ? '#ff5a3a' : '#3f9a52');

    // sweep line with a fading trail behind it
    for (let i = TRAIL; i >= 0; i--) {
      const a = this.sweep - i * 0.07;
      g.fillStyle = i === 0 ? 'rgba(160,255,170,0.9)' : `rgba(90,255,120,${0.28 * (1 - i / TRAIL)})`;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let r = 2; r < R; r++) g.fillRect(Math.round(CX + ca * r), Math.round(CY + sa * r), 1, 1);
    }

    // pickups (Deep Scan)
    if (this.level >= 2 && Math.floor(t * 3) % 2 === 0) {
      g.fillStyle = '#ffd24a';
      for (const pk of game.pickups) {
        const dx = pk.x - c.x, dy = pk.y - c.y;
        if (dx * dx + dy * dy < range * range) g.fillRect(Math.round(CX + dx * k), Math.round(CY + dy * k), 1, 1);
      }
    }

    // zombie blips: bright right after the sweep passes them, fading until the next pass
    for (const z of game.zombies) {
      if (z.dead) continue;
      const dx = z.x - c.x, dy = z.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= range * range) continue;
      let age = (this.sweep - Math.atan2(dy, dx)) % TAU;
      if (age < 0) age += TAU;
      age /= TAU;
      const boss = z.type === 'boss';
      const alpha = Math.max(boss ? 0.8 : 0.12, 1 - age * 1.15);
      const s = blipSize(z) + (age < 0.06 ? 1 : 0);
      const bx = Math.round(CX + dx * k - (s - 1) / 2), by = Math.round(CY + dy * k - (s - 1) / 2);
      g.globalAlpha = alpha;
      g.fillStyle = boss ? '#ff4a3a' : age < 0.06 ? '#e8ffe8' : '#7dff8a';
      g.fillRect(bx, by, s, s);
    }
    g.globalAlpha = 1;

    // players
    for (const p of game.players) {
      if (p.state === 'dead') continue;
      g.fillStyle = game.players.length > 1 ? PLAYER_COLORS[p.index] : '#ffffff';
      g.fillRect(Math.round(CX + (p.x - c.x) * k), Math.round(CY + (p.y - c.y) * k), 1, 1);
    }

    // distance readout to the closest contact, in "metres" (1 tile = 1 m)
    const inRange = this.near < range;
    const label = inRange ? `${Math.round(this.near / 16)}M` : 'CLEAR';
    drawText(g, label, CX, CY + R + 4, inRange ? (this.alarm > 0 ? '#ff7a5a' : '#7dff8a') : '#3f9a52', 'center');
  }
}
