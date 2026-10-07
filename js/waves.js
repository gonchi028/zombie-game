// Builds each wave's spawn queue and trickles zombies in from outside the camera.
import { TILE, VIEW_W, VIEW_H } from './config.js';
import { rand, randInt, shuffle, weightedPick } from './utils.js';

export const BOSS_EVERY = 5;

function mix(n) {
  return {
    walker: 1,
    runner: n >= 2 ? Math.min(0.45, 0.12 + n * 0.03) : 0,
    dog: n >= 3 ? Math.min(0.25, 0.06 + n * 0.015) : 0,
    brute: n >= 4 ? Math.min(0.2, 0.04 + n * 0.012) : 0,
    spitter: n >= 4 ? Math.min(0.18, 0.05 + n * 0.01) : 0,
    bloater: n >= 6 ? Math.min(0.16, 0.04 + n * 0.01) : 0,
  };
}

export class WaveManager {
  constructor(game) {
    this.game = game;
    this.wave = 0;
    this.state = 'idle'; // idle | intro | fight | cleared
    this.total = 0;
    this.killed = 0;
    this.queue = [];
  }

  get isBossWave() {
    return this.wave % BOSS_EVERY === 0;
  }
  get remaining() {
    return this.queue.length + this.game.zombies.filter((z) => !z.dead).length;
  }

  start(n) {
    const players = this.game.players.length;
    this.wave = n;
    this.state = 'intro';
    this.timer = 3;
    const count = Math.min(180, Math.round((10 + n * 5 + n * n * 0.25) * (players > 1 ? 1.5 : 1)));
    const weights = mix(n);
    const types = Object.keys(weights).filter((t) => weights[t] > 0);
    const queue = [];
    for (let i = 0; i < count; i++) queue.push(weightedPick(types, (t) => weights[t]));
    shuffle(queue);
    if (n % BOSS_EVERY === 0) {
      const bosses = Math.floor(n / (BOSS_EVERY * 2)) + 1;
      for (let b = 0; b < bosses; b++) queue.splice(Math.floor(queue.length * (0.25 + b * 0.3)), 0, 'boss');
    }
    this.queue = queue;
    this.total = queue.length;
    this.killed = 0;
    this.spawnT = 0.5;
    this.maxAlive = Math.min(95, 32 + n * 4);
    this.interval = Math.max(0.16, 1.05 - n * 0.07);
    this.scale = {
      hp: (1 + (n - 1) * 0.12 + Math.max(0, n - 10) * 0.08) * (players > 1 ? 1.15 : 1),
      speed: Math.min(1.35, 1 + (n - 1) * 0.025),
      dmg: 1 + (n - 1) * 0.06,
    };
  }

  update(dt) {
    const game = this.game;
    if (this.state === 'intro') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'fight';
    } else if (this.state === 'fight') {
      this.spawnT -= dt;
      const alive = game.zombies.length;
      if (this.spawnT <= 0 && this.queue.length && alive < this.maxAlive) {
        this.spawnT = this.interval * rand(0.6, 1.4);
        const pt = this.pickSpawnPoint();
        if (pt) {
          const group = this.queue[0] === 'boss' ? 1 : Math.min(this.queue.length, randInt(1, 2 + Math.floor(this.wave / 3)));
          for (let i = 0; i < group; i++) {
            const type = this.queue.shift();
            if (!type) break;
            game.spawnZombie(type, pt.x + rand(-6, 6), pt.y + rand(-6, 6), this.scale);
            if (type === 'boss') break;
          }
        }
      }
      if (!this.queue.length && alive === 0) {
        this.state = 'cleared';
        this.timer = 2.4;
        game.onWaveCleared();
      }
    } else if (this.state === 'cleared') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'idle';
        game.openUpgrades();
      }
    }
  }

  // Somewhere walkable, out of view, and a reasonable walk away from the nearest player.
  pickSpawnPoint() {
    const { map, cam } = this.game;
    const list = map.walkable;
    const inView = (x, y) => x > cam.x - 24 && x < cam.x + VIEW_W + 24 && y > cam.y - 24 && y < cam.y + VIEW_H + 24;
    let fallback = null;
    for (let tries = 0; tries < 60; tries++) {
      const i = list[Math.floor(Math.random() * list.length)];
      const d = map.dist[i];
      if (!isFinite(d)) continue;
      const x = (i % map.w) * TILE + 8, y = Math.floor(i / map.w) * TILE + 8;
      if (inView(x, y)) continue;
      if (d >= 13 && d <= 32) return { x, y };
      if (!fallback || Math.abs(d - 20) < Math.abs(fallback.d - 20)) fallback = { x, y, d };
    }
    return fallback;
  }
}
