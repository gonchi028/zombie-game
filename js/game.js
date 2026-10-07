// World simulation + rendering. main.js drives it; ui.js shows menus/HUD around it.
import { VIEW_W, VIEW_H, AMBIENT_DARK, PLAYER_COLORS } from './config.js';
import { CityMap } from './map.js';
import { Lighting, buildCone } from './lighting.js';
import { Decals, Particles } from './particles.js';
import { Player, MAX_FLARES } from './player.js';
import { Zombie } from './zombie.js';
import { WaveManager } from './waves.js';
import { rollChoices } from './upgrades.js';
import { SPR } from './sprites.js';
import { drawText } from './font.js';
import { MotionTracker } from './tracker.js';
import { clamp, dist, dist2, rand, chance, choice, TAU, pixCircle, pixEllipse, storage } from './utils.js';

const G = 420; // gravity for thrown things
// Road flare: a held item that pulls nearby zombies off the players, then pops.
const FLARE_TIME = 6.5; // seconds it burns (including the throw)
const LURE_R = 170; // zombies this close (with line of sight) chase the flare instead
const ACID = ['#3f6a14', '#5a8a1a', '#2e4a10', '#6f9a24'];
const WAVE_FLAVOR = [
  'THEY SMELL YOU', 'STAY IN THE LIGHT', 'NO ONE IS COMING', 'KEEP MOVING', 'AIM FOR THE HEAD',
  'THE NIGHT IS LONG', 'HOLD THE LINE', 'DONT GET CORNERED',
];

class SpatialGrid {
  constructor(w, h, cell) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell);
    this.rows = Math.ceil(h / cell);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }
  clear() {
    for (const c of this.cells) c.length = 0;
  }
  insert(e) {
    const cx = clamp(Math.floor(e.x / this.cell), 0, this.cols - 1);
    const cy = clamp(Math.floor(e.y / this.cell), 0, this.rows - 1);
    this.cells[cy * this.cols + cx].push(e);
  }
  query(x, y, r, out) {
    out.length = 0;
    const x0 = clamp(Math.floor((x - r) / this.cell), 0, this.cols - 1), x1 = clamp(Math.floor((x + r) / this.cell), 0, this.cols - 1);
    const y0 = clamp(Math.floor((y - r) / this.cell), 0, this.rows - 1), y1 = clamp(Math.floor((y + r) / this.cell), 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (const e of this.cells[cy * this.cols + cx]) out.push(e);
    return out;
  }
}

export class Game {
  constructor({ canvas, ui, sfx, input }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.tracker = new MotionTracker();
    this.ui = ui;
    this.sfx = sfx;
    this.input = input;
    this.map = new CityMap(7);
    this.lighting = new Lighting();
    this.decals = new Decals(this.map.pw, this.map.ph);
    this.particles = new Particles(this.decals);
    this.grid = new SpatialGrid(this.map.pw, this.map.ph, 32);
    this._sepQ = [];
    this.cam = { x: this.map.spawn.x - VIEW_W / 2, y: this.map.spawn.y - VIEW_H / 2, shake: 0 };
    this.time = 0;
    this.hurtFlash = 0;
    this.slowmo = 1;
    this.best = storage.get('ll_best', { wave: 0, score: 0 });
    this.resetEntities();
    this.startAttract();
  }

  resetEntities() {
    this.players = [];
    this.zombies = [];
    this.bullets = [];
    this.enemyShots = [];
    this.throwables = [];
    this.pools = [];
    this.pickups = [];
    this.flashes = [];
    this.bolts = [];
    this.particles.list.length = 0;
    this.decals.clear();
    this.waves = new WaveManager(this);
    this.stats = { kills: 0, score: 0, time: 0 };
    this.bossRef = null;
    this.hurtFlash = 0;
    this.slowmo = 1;
  }

  // ------------------------------------------------------------------ modes
  startAttract() {
    this.resetEntities();
    this.state = 'title';
    const types = ['walker', 'walker', 'walker', 'walker', 'runner', 'brute', 'dog', 'spitter'];
    for (let i = 0; i < 70; i++) {
      const idx = choice(this.map.walkable);
      this.spawnZombie(choice(types), (idx % this.map.w) * 16 + 8, Math.floor(idx / this.map.w) * 16 + 8);
    }
    for (let i = 0; i < 60; i++) {
      const idx = choice(this.map.walkable);
      this.decals.blood((idx % this.map.w) * 16 + 8, Math.floor(idx / this.map.w) * 16 + 8, rand(4, 10));
    }
    for (const z of this.zombies) z.spawnT = 0;
    this.attractT = 0;
  }

  newRun(mode, charIds, controllers) {
    this.resetEntities();
    this.mode = mode;
    this.charIds = charIds;
    this.controllers = controllers;
    this.players = charIds.map((c, i) => new Player(this, i, c, controllers[i]));
    this.state = 'playing';
    this.flowT = 0;
    this.map.computeFlow(this.players);
    this.updateCamera(0, true);
    this.waves.start(1);
    this.announceWave();
    this.ui.showHUD(this);
    this.input.flush();
  }

  restart() {
    this.newRun(this.mode, this.charIds, this.controllers);
  }

  announceWave() {
    const n = this.waves.wave;
    const boss = this.waves.isBossWave;
    this.ui.banner(`WAVE ${n}`, boss ? 'SOMETHING BIG IS COMING' : choice(WAVE_FLAVOR), boss ? '#ff4a3a' : '#f3e6c8');
    this.sfx.play('wave', 0.9);
  }

  onWaveCleared() {
    const n = this.waves.wave;
    const bonus = 100 * n;
    this.stats.score += bonus;
    this.ui.banner(`WAVE ${n} CLEARED`, `+${bonus} SURVIVAL BONUS`, '#8aff8a');
    this.sfx.play('clear', 0.9);
    for (const pk of this.pickups) pk.magnet = true;
  }

  openUpgrades() {
    this.state = 'upgrade';
    this.upgradeQueue = [...this.players];
    this.nextUpgradePick();
  }

  nextUpgradePick() {
    const p = this.upgradeQueue.shift();
    if (!p) {
      this.ui.hideUpgrade();
      this.startNextWave();
      return;
    }
    let rerolls = 1;
    const show = () => {
      const choices = rollChoices(p, this.waves.wave);
      this.ui.showUpgrade(p, choices, this.waves.wave, rerolls, (u) => {
        p.upgrades[u.id] = (p.upgrades[u.id] || 0) + 1;
        u.apply(p);
        this.sfx.play('powerup', 0.8);
        this.nextUpgradePick();
      }, () => {
        if (rerolls <= 0) return;
        rerolls--;
        this.sfx.play('select');
        show();
      });
    };
    show();
  }

  startNextWave() {
    // Fallen teammates get back up next to a survivor; everyone gets a small resupply.
    const anchor = this.players.find((p) => p.alive) || this.players[0];
    for (const p of this.players) {
      if (p.state !== 'alive') {
        p.reviveNow(0.5);
        p.x = anchor.x + rand(-10, 10);
        p.y = anchor.y + rand(-10, 10);
        this.map.resolveCircle(p);
      }
      p.addAmmo(0.35);
      p.heal(10);
    }
    this.state = 'playing';
    this.input.flush();
    this.waves.start(this.waves.wave + 1);
    this.announceWave();
  }

  playerDown(p) {
    p.goDown();
    this.sfx.play('down', 0.8);
    this.particles.text(p.x, p.y - 20, 'DOWN!', '#ff5a4e', 1.2);
    if (!this.players.some((o) => o.alive)) this.gameOver();
  }

  playerDied(p) {
    p.state = 'dead';
    if (!this.players.some((o) => o.alive)) this.gameOver();
  }

  gameOver() {
    if (this.state === 'dying' || this.state === 'gameover') return;
    this.state = 'dying';
    this.dyingT = 2.2;
    this.slowmo = 0.3;
    this.sfx.play('gameover', 0.9);
    this.ui.hideBanner();
  }

  finishGameOver() {
    this.state = 'gameover';
    const wave = this.waves.wave;
    const score = Math.floor(this.stats.score);
    const newBest = score > this.best.score;
    if (newBest || wave > this.best.wave) {
      this.best = { wave: Math.max(wave, this.best.wave), score: Math.max(score, this.best.score) };
      storage.set('ll_best', this.best);
    }
    this.ui.showGameOver({
      wave, score, kills: this.stats.kills, time: this.stats.time, best: this.best, newBest,
      players: this.players.map((p) => ({ name: p.char.name, color: p.char.color, kills: p.kills, upgrades: p.upgrades })),
    });
  }

  // ------------------------------------------------------------------ helpers used by entities
  sound(name, x, y, vol = 1) {
    const cx = this.cam.x + VIEW_W / 2, cy = this.cam.y + VIEW_H / 2;
    const d = dist(x, y, cx, cy);
    let v = vol * clamp(1.25 - d / 340, 0, 1);
    if (this.state === 'title') v *= 0.35;
    this.sfx.play(name, v, clamp((x - cx) / 260, -0.8, 0.8));
  }

  shake(n) {
    this.cam.shake = Math.min(8, Math.max(this.cam.shake, n));
  }

  addFlash(x, y, r, life, color) {
    this.flashes.push({ x, y, r, t: life, life, color });
  }

  nearestPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  zombiesNear(x, y, r) {
    return this.grid.query(x, y, r, []);
  }

  spawnZombie(type, x, y, scale) {
    const z = new Zombie(this, type, x, y, scale);
    this.map.resolveCircle(z);
    this.zombies.push(z);
    if (type === 'boss' && this.state !== 'title') {
      this.bossRef = z;
      this.ui.banner('THE ABOMINATION', 'HAS ENTERED THE CITY', '#ff4a3a');
      this.sfx.play('roar', 1);
      this.shake(5);
    }
    return z;
  }

  summonAround(boss, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.spawnZombie('walker', boss.x + Math.cos(a) * 22, boss.y + Math.sin(a) * 22, this.waves.scale);
    }
    this.particles.ring(boss.x, boss.y, 30, '#8aff6a');
    this.sound('roar', boss.x, boss.y, 0.6);
  }

  addBullet(o) {
    this.bullets.push({
      ...o, vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed, traveled: 0, hit: new Set(), dead: false,
    });
  }

  // Lob something toward where the player is aiming.
  lob(p, kind, fuse) {
    const range = clamp(p.aimDist || 90, 30, 140);
    const tx = p.x + Math.cos(p.aim) * range, ty = p.y + Math.sin(p.aim) * range;
    const T = 0.55, z0 = 8;
    const t = {
      kind, x: p.x, y: p.y, z: z0, vx: (tx - p.x) / T, vy: (ty - p.y) / T,
      vz: (0.5 * G * T * T - z0) / T, fuse, owner: p, spin: 0, dead: false,
    };
    this.throwables.push(t);
    this.sound('throw', p.x, p.y);
    return t;
  }

  useAbility(p) {
    this.lob(p, p.char.ability, 1.15);
  }

  throwFlare(p) {
    const t = this.lob(p, 'flare', FLARE_TIME);
    t.alive = true; // so zombies can target it like a player
    t.lure = true;
    t.hissT = 0;
    this.sound('flare', p.x, p.y);
  }

  // The flare a zombie should chase instead of a player, if any. The boss can't be fooled.
  lureFor(z) {
    if (z.type === 'boss') return null;
    let best = null, bd = LURE_R * LURE_R;
    for (const t of this.throwables) {
      if (!t.lure || t.dead) continue;
      const d = dist2(z.x, z.y, t.x, t.y);
      if (d < bd && this.map.los(z.x, z.y, t.x, t.y)) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  spitAcid(z, tgt) {
    const T = 0.75, z0 = 8;
    const tx = tgt.x + tgt.vx * 0.3, ty = tgt.y + tgt.vy * 0.3;
    this.enemyShots.push({
      x: z.x, y: z.y, z: z0, vx: (tx - z.x) / T, vy: (ty - z.y) / T, vz: (0.5 * G * T * T - z0) / T,
      dmg: 10 * (this.waves.scale?.dmg || 1), dead: false,
    });
    z.onSpit();
    this.sound('spit', z.x, z.y);
  }

  // ------------------------------------------------------------------ damage
  damageZombie(z, amount, o = {}) {
    if (z.dead) return;
    z.hp -= amount;
    z.flash = 0.06;
    z.onHit(o.ax || 0, o.ay || 0, amount);
    const kn = (o.knock || 0) * (1 - z.knockResist);
    if (kn) {
      z.kx += (o.ax || 0) * kn;
      z.ky += (o.ay || 0) * kn;
    }
    const pal = z.type === 'spitter' || z.type === 'bloater' ? ACID : undefined;
    this.particles.blood(z.x, z.y - z.bodyOff, Math.atan2(o.ay || 0, o.ax || 0), o.crit ? 8 : 4, pal, 70);
    if (o.crit) this.particles.text(z.x, z.y - z.bodyOff - 10, String(Math.round(amount)), '#ffd24a', 0.6);
    this.sound('hit', z.x, z.y, 0.5);
    const owner = o.owner;
    if (owner && !o.noProc) {
      const st = owner.stats;
      if (st.ignite && chance(st.ignite)) this.ignite(z, 3, 14 * owner.dmgMul(), owner);
      if (st.frost) z.slow = 1.2 + st.frost * 0.8;
      if (st.explosive && chance(st.explosive)) this.explode(z.x, z.y - 2, 30, 26 * owner.dmgMul(), owner, { small: true });
      if (st.chain && chance(st.chain)) this.chainLightning(z, owner);
    }
    if (z.hp <= 0) this.killZombie(z, owner);
  }

  ignite(z, t, dps, owner) {
    z.burn = Math.max(z.burn, t);
    z.burnDps = Math.max(z.burnDps, dps);
    z.burnOwner = owner;
  }

  chainLightning(z, owner) {
    const pts = [{ x: z.x, y: z.y - z.bodyOff }];
    const hit = new Set([z.id]);
    let cur = z;
    for (let i = 0; i < 3; i++) {
      let best = null, bd = 75 * 75;
      for (const o of this.zombiesNear(cur.x, cur.y, 75)) {
        if (o.dead || hit.has(o.id)) continue;
        const d = dist2(cur.x, cur.y, o.x, o.y);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (!best) break;
      hit.add(best.id);
      pts.push({ x: best.x, y: best.y - best.bodyOff });
      this.damageZombie(best, 18 * owner.dmgMul(), { owner, noProc: true });
      this.ignite(best, 0, 0, owner);
      cur = best;
    }
    if (pts.length > 1) {
      this.bolts.push({ pts, t: 0.16 });
      this.addFlash(z.x, z.y, 50, 0.12, '#7fd8ff');
      this.sound('zap', z.x, z.y);
    }
  }

  killZombie(z, owner) {
    if (z.dead) return;
    z.dead = true;
    const wave = Math.max(1, this.waves.wave);
    if (this.state !== 'title') {
      this.waves.killed++;
      this.stats.kills++;
      this.stats.score += z.def.score * (1 + wave * 0.1);
    }
    if (owner) {
      owner.kills++;
      if (owner.stats.lifesteal) owner.heal(owner.stats.lifesteal);
    }
    const pal = z.type === 'spitter' || z.type === 'bloater' ? ACID : undefined;
    this.particles.gibs(z.x, z.y - z.bodyOff, z.type === 'boss' ? 24 : 5, pal);
    this.particles.blood(z.x, z.y - z.bodyOff, rand(0, TAU), 10, pal, 90);
    this.decals.blood(z.x, z.y, z.type === 'boss' ? 18 : z.r + 3, pal);
    z.ragdoll(this.particles);
    this.sound('zdie', z.x, z.y, 0.8);

    if (z.type === 'bloater') {
      this.explode(z.x, z.y - 4, 44, 40 * (this.waves.scale?.dmg || 1), null, { hurtPlayers: true, acid: true });
    }
    if (z.type === 'boss') {
      this.bossRef = null;
      this.shake(8);
      this.explode(z.x, z.y - 8, 50, 60, null, { visualOnly: true });
      this.ui.banner('ABOMINATION SLAIN', `+${Math.round(z.def.score * (1 + wave * 0.1))}`, '#ffd24a');
      this.spawnPickup('maxammo', z.x, z.y);
      this.spawnPickup('health', z.x + 8, z.y);
      this.spawnPickup('health', z.x - 8, z.y);
      return;
    }
    if (this.state !== 'title') this.rollDrop(z);
  }

  rollDrop(z) {
    const m = Math.max(1, ...this.players.map((p) => p.stats.dropMul));
    if (chance(this.flareDropChance() * m)) {
      this.spawnPickup('flare', z.x, z.y);
      return;
    }
    const r = Math.random();
    let acc = 0;
    for (const [type, p] of [['ammo', 0.08], ['health', 0.03], ['rage', 0.006], ['maxammo', 0.005]]) {
      acc += p * m;
      if (r < acc) {
        this.spawnPickup(type, z.x, z.y);
        return;
      }
    }
  }

  // Flares almost never drop when things are calm and get likelier the more zombies crowd a player.
  flareDropChance() {
    if (this.pickups.some((pk) => pk.type === 'flare' && !pk.dead)) return 0;
    if (this.players.every((p) => p.flares >= MAX_FLARES)) return 0;
    let crowd = 0;
    for (const p of this.players) if (p.alive) crowd = Math.max(crowd, this.zombiesNear(p.x, p.y, 90).length);
    return Math.min(0.06, 0.002 + Math.max(0, crowd - 6) * 0.003);
  }

  spawnPickup(type, x, y) {
    this.pickups.push({ type, x, y, vx: rand(-40, 40), vy: rand(-40, 40), t: 0, life: 22, magnet: false });
  }

  explode(x, y, r, dmg, owner, o = {}) {
    if (!o.visualOnly) {
      for (const z of this.zombiesNear(x, y, r + 16)) {
        if (z.dead) continue;
        const dx = z.x - x, dy = z.y - z.bodyOff * 0.5 - y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > r + z.r) continue;
        const f = 1 - 0.5 * Math.min(1, d / r);
        this.damageZombie(z, dmg * f, { owner, ax: dx / d, ay: dy / d, knock: 260 * f, noProc: true });
      }
      if (o.hurtPlayers) {
        for (const p of this.players) {
          if (p.alive && dist2(x, y, p.x, p.y) < (r + p.r) ** 2) p.hurt(dmg * 0.6, { x, y });
        }
      }
    }
    if (o.acid) {
      for (let i = 0; i < 12; i++) {
        const a = rand(0, TAU), d = rand(0, r * 0.6);
        this.particles.add({
          type: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14 - 6, drag: 1.5,
          life: rand(0.8, 1.6), size: rand(3, 5), grow: rand(6, 10), color: '#4a7a1a',
        });
      }
      this.particles.gibs(x, y, 10, ACID);
      this.particles.ring(x, y, r, '#b4ff4a');
      this.decals.blood(x, y + 4, 14, ACID);
      this.addFlash(x, y, r * 2.2, 0.3, '#9aff4a');
    } else {
      this.particles.explosion(x, y, r);
      this.decals.scorch(x, y + 3, r * 0.8);
      this.addFlash(x, y, r * 2.6, 0.3, '#ffa04a');
    }
    this.shake(o.small ? 2 : 6);
    this.sound('explosion', x, y, o.small ? 0.45 : 1);
  }

  shockwave(x, y, r, dmg, owner, color = '#ffffff') {
    for (const z of this.zombiesNear(x, y, r + 12)) {
      if (z.dead) continue;
      const dx = z.x - x, dy = z.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > r + z.r) continue;
      this.damageZombie(z, dmg, { owner, ax: dx / d, ay: dy / d, knock: 280, noProc: true });
    }
    this.particles.ring(x, y, r, color, 0.35);
    this.particles.ring(x, y, r * 0.7, color, 0.25);
    this.addFlash(x, y, r * 1.8, 0.2, color);
    this.shake(3);
  }

  bossSlam(b) {
    const r = 62;
    b.onSlam();
    for (const p of this.players) {
      if (p.alive && dist2(b.x, b.y, p.x, p.y) < r * r) {
        p.hurt(b.dmg, b);
        const a = Math.atan2(p.y - b.y, p.x - b.x);
        p.vx += Math.cos(a) * 220;
        p.vy += Math.sin(a) * 220;
      }
    }
    this.particles.ring(b.x, b.y, r, '#d8c8a8', 0.4);
    this.particles.ring(b.x, b.y, r * 0.6, '#d8c8a8', 0.3);
    this.particles.smoke(b.x, b.y, 10);
    this.decals.scorch(b.x, b.y + 4, 22);
    this.shake(8);
    this.sound('slam', b.x, b.y);
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    this.time += dt;
    this.updateLightAnim(dt);
    switch (this.state) {
      case 'title':
        this.updateAttract(dt);
        break;
      case 'playing':
        this.updateWorld(dt);
        break;
      case 'dying':
        this.dyingT -= dt;
        this.updateWorld(dt * this.slowmo);
        if (this.dyingT <= 0) this.finishGameOver();
        break;
      case 'gameover':
        this.updateWorld(dt * 0.15, true);
        break;
      case 'upgrade':
      case 'paused':
        break;
    }
    this.ui.updateHUD(this);
  }

  updateAttract(dt) {
    this.attractT += dt;
    const t = this.attractT * 0.05;
    const mx = this.map.pw - VIEW_W, my = this.map.ph - VIEW_H;
    this.cam.x = mx * (0.5 + 0.42 * Math.sin(t));
    this.cam.y = my * (0.5 + 0.4 * Math.sin(t * 1.7 + 1));
    for (const z of this.zombies) z.update(dt);
    this.rebuildGrid();
    this.separate();
    this.updateFires(dt);
    this.particles.update(dt);
    this.updateFlashes(dt);
  }

  updateWorld(dt, frozen = false) {
    if (!frozen) this.stats.time += this.state === 'playing' ? dt : 0;
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.25;
      const targets = this.players.filter((p) => p.alive);
      if (targets.length) this.map.computeFlow(targets);
    }
    if (!frozen) {
      for (const p of this.players) p.update(dt);
      this.leash();
      this.updateRevives(dt);
      if (this.state === 'playing') this.waves.update(dt);
    }
    for (const z of this.zombies) if (!z.dead) z.update(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);
    this.rebuildGrid();
    this.separate();
    this.collidePlayers();
    this.updateBullets(dt);
    this.updateEnemyShots(dt);
    this.updateThrowables(dt);
    this.updatePools(dt);
    this.updatePickups(dt);
    this.updateFires(dt);
    this.particles.update(dt);
    this.updateFlashes(dt);
    this.updateCamera(dt);
    this.tracker.update(dt, this);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
  }

  updateLightAnim(dt) {
    for (const l of this.map.lights) {
      if (!l.flicker) continue;
      l.fT = (l.fT ?? rand(0, 2)) - dt;
      if (l.fT <= 0) {
        l.off = !l.off && Math.random() < 0.6;
        l.fT = l.off ? rand(0.03, 0.14) : rand(0.2, 3);
      }
    }
  }

  updateFlashes(dt) {
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
    for (const b of this.bolts) b.t -= dt;
    this.bolts = this.bolts.filter((b) => b.t > 0);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 22);
  }

  rebuildGrid() {
    this.grid.clear();
    for (const z of this.zombies) if (!z.dead) this.grid.insert(z);
  }

  separate() {
    const q = this._sepQ;
    for (const z of this.zombies) {
      if (z.dead) continue;
      this.grid.query(z.x, z.y, z.r + 14, q);
      for (const o of q) {
        if (o.id <= z.id || o.dead) continue;
        const dx = o.x - z.x, dy = o.y - z.y;
        const rr = z.r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        const tm = z.mass + o.mass;
        z.x -= dx * push * (o.mass / tm);
        z.y -= dy * push * (o.mass / tm);
        o.x += dx * push * (z.mass / tm);
        o.y += dy * push * (z.mass / tm);
      }
    }
    for (const z of this.zombies) {
      if (this.map.resolveCircle(z) && !z.target) z.wanderA = rand(0, TAU);
      if (!Number.isFinite(z.x + z.y)) z.dead = true; // never let a NaN poison the horde
    }
  }

  collidePlayers() {
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const z of this.zombiesNear(p.x, p.y, 24)) {
        if (z.dead) continue;
        const dx = z.x - p.x, dy = z.y - p.y;
        const rr = p.r + z.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        const zShare = z.type === 'boss' ? 0.1 : p.dashT > 0 ? 1 : 0.75;
        z.x += dx * push * zShare;
        z.y += dy * push * zShare;
        p.x -= dx * push * (1 - zShare);
        p.y -= dy * push * (1 - zShare);
      }
      this.map.resolveCircle(p);
    }
  }

  // Keep co-op players on the same screen.
  leash() {
    const ps = this.players.filter((p) => p.state !== 'dead');
    if (ps.length < 2) return;
    const [a, b] = ps;
    const lim = [VIEW_W - 60, VIEW_H - 56];
    for (const axis of ['x', 'y']) {
      const L = axis === 'x' ? lim[0] : lim[1];
      const d = b[axis] - a[axis];
      if (Math.abs(d) > L) {
        const e = ((Math.abs(d) - L) / 2) * Math.sign(d);
        a[axis] += e;
        b[axis] -= e;
      }
    }
    this.map.resolveCircle(a);
    this.map.resolveCircle(b);
  }

  updateRevives(dt) {
    for (const p of this.players) {
      if (p.state !== 'downed') continue;
      const helper = this.players.find((o) => o.alive && dist2(o.x, o.y, p.x, p.y) < 22 * 22);
      if (helper) {
        p.revive += dt / 2.2;
        if (p.revive >= 1) {
          p.reviveNow(0.4);
          this.particles.text(p.x, p.y - 20, 'REVIVED!', '#8aff8a', 1.2);
          this.particles.ring(p.x, p.y, 26, '#8aff8a');
          this.sfx.play('revive', 0.8);
        }
      } else p.revive = Math.max(0, p.revive - dt * 0.5);
    }
  }

  updateBullets(dt) {
    const map = this.map;
    for (const b of this.bullets) {
      const total = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(total / 4));
      for (let s = 0; s < steps && !b.dead; s++) {
        const nx = b.x + (b.vx * dt) / steps, ny = b.y + (b.vy * dt) / steps;
        if (map.bulletBlocked(nx, ny)) {
          if (b.kind === 'rocket') {
            this.rocketBoom(b);
            break;
          }
          if (b.ricochet > 0) {
            b.ricochet--;
            const bx = map.bulletBlocked(nx, b.y), by = map.bulletBlocked(b.x, ny);
            if (bx) b.vx = -b.vx;
            if (by) b.vy = -b.vy;
            if (!bx && !by) {
              b.vx = -b.vx;
              b.vy = -b.vy;
            }
            b.hit.clear();
            this.particles.sparks(b.x, b.y, Math.atan2(b.vy, b.vx), 3);
            continue;
          }
          this.particles.sparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), 4);
          b.dead = true;
          break;
        }
        b.x = nx;
        b.y = ny;
        for (const z of this.zombiesNear(b.x, b.y, 18)) {
          if (z.dead || b.hit.has(z.id)) continue;
          if (dist2(b.x, b.y, z.x, z.y - z.bodyOff) < (z.r + 2.5) ** 2) {
            this.bulletHit(b, z);
            if (b.dead) break;
          }
        }
      }
      if (b.kind === 'rocket' && !b.dead) {
        this.particles.smoke(b.x, b.y, 1);
        this.particles.fire(b.x, b.y, 1, 5);
      }
      b.traveled += total;
      if (!b.dead && b.traveled > b.range) {
        if (b.kind === 'rocket') this.rocketBoom(b);
        b.dead = true;
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  rocketBoom(b) {
    b.dead = true;
    this.explode(b.x, b.y, b.splashR, b.splash, b.owner, {});
  }

  bulletHit(b, z) {
    b.hit.add(z.id);
    if (b.kind === 'rocket') {
      this.damageZombie(z, b.dmg, { owner: b.owner, noProc: true });
      this.rocketBoom(b);
      return;
    }
    let dmg = b.dmg;
    let crit = false;
    if (b.owner && !b.noProc && chance(b.owner.stats.crit)) {
      dmg *= 2.5;
      crit = true;
    }
    const sp = Math.hypot(b.vx, b.vy) || 1;
    this.damageZombie(z, dmg, { owner: b.owner, ax: b.vx / sp, ay: b.vy / sp, knock: b.knock, crit, noProc: b.noProc });
    if (b.pierce > 0) {
      b.pierce--;
      b.dmg *= 0.8;
    } else b.dead = true;
  }

  updateEnemyShots(dt) {
    for (const s of this.enemyShots) {
      s.vz -= G * dt;
      s.z += s.vz * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (Math.random() < dt * 30) this.particles.add({ type: 'drop', x: s.x, y: s.y, z: s.z, vz: 0, gravity: 200, life: 1, color: ACID[1], stamp: true });
      let splash = s.z <= 0 || this.map.bulletBlocked(s.x, s.y);
      if (!splash && s.z < 12) {
        for (const p of this.players) {
          if (p.alive && dist2(p.x, p.y, s.x, s.y) < 7 * 7) splash = true;
        }
      }
      if (splash) {
        s.dead = true;
        for (const p of this.players) if (p.alive && dist2(p.x, p.y, s.x, s.y) < 12 * 12) p.hurt(s.dmg, s);
        this.pools.push({ kind: 'acid', x: s.x, y: s.y, r: 14, t: 3.5, life: 3.5, dps: s.dmg });
        this.particles.gibs(s.x, s.y, 6, ACID);
        this.sound('splat', s.x, s.y);
      }
    }
    this.enemyShots = this.enemyShots.filter((s) => !s.dead);
  }

  updateThrowables(dt) {
    const map = this.map;
    for (const t of this.throwables) {
      if (t.kind !== 'flare' || t.z > 0) t.spin += dt * 14;
      t.fuse -= dt;
      t.vz -= G * dt;
      t.z += t.vz * dt;
      let nx = t.x + t.vx * dt, ny = t.y + t.vy * dt;
      let hitWall = false;
      if (map.bulletBlocked(nx, t.y)) {
        t.vx = -t.vx * 0.5;
        nx = t.x;
        hitWall = true;
      }
      if (map.bulletBlocked(t.x, ny)) {
        t.vy = -t.vy * 0.5;
        ny = t.y;
        hitWall = true;
      }
      t.x = nx;
      t.y = ny;
      if (t.kind === 'molotov') {
        if (Math.random() < dt * 40) this.particles.fire(t.x, t.y - t.z, 1, 10);
        if (t.z <= 0 || hitWall) this.shatterMolotov(t);
      } else {
        if (t.z <= 0) {
          t.z = 0;
          t.vz = Math.abs(t.vz) > 30 ? -t.vz * 0.35 : 0;
          t.vx *= 0.55;
          t.vy *= 0.55;
        }
        if (t.kind === 'flare') this.updateFlare(t, dt);
        if (t.fuse <= 0) {
          t.dead = true;
          if (t.kind === 'flare') {
            t.alive = false;
            this.explode(t.x, t.y, 46, 90 * t.owner.dmgMul(), t.owner, {});
          } else {
            const st = t.owner.stats;
            this.explode(t.x, t.y, 54 * st.abilityRadius, 120 * t.owner.dmgMul(), t.owner, {});
          }
        }
      }
    }
    this.throwables = this.throwables.filter((t) => !t.dead);
  }

  updateFlare(t, dt) {
    const tipY = t.y - t.z - 1;
    if (!t.landed && t.z === 0 && t.vz === 0) {
      t.landed = true;
      // show how far the lure reaches
      this.particles.ring(t.x, t.y, LURE_R, '#ff5a3a', 0.6);
      this.particles.ring(t.x, t.y, LURE_R * 0.6, '#ff5a3a', 0.45);
    }
    // sputter harder in the last second, as a warning before it pops
    const ending = t.fuse < 1;
    if (Math.random() < dt * (ending ? 70 : 34)) {
      this.particles.add({
        type: 'spark', x: t.x + rand(-1, 1), y: tipY, vx: rand(-35, 35), vy: rand(-70, -20), drag: 3,
        life: rand(0.15, 0.4), color: choice(['#ff5a3a', '#ff9a4a', '#fff0c8']), add: true,
      });
    }
    if (Math.random() < dt * 5) {
      this.particles.add({
        type: 'smoke', x: t.x + rand(-1, 1), y: tipY - 2, vx: rand(-5, 5), vy: rand(-16, -8), drag: 1,
        life: rand(0.8, 1.4), size: 1, grow: rand(4, 7), color: '#5a2a2e',
      });
    }
    t.hissT -= dt;
    if (t.hissT <= 0) {
      t.hissT = ending ? 0.25 : 0.7;
      this.sound('fizz', t.x, t.y, ending ? 0.8 : 0.5);
    }
  }

  shatterMolotov(t) {
    t.dead = true;
    const st = t.owner.stats;
    const r = Math.round(34 * st.abilityRadius);
    this.pools.push({ kind: 'fire', x: t.x, y: t.y, r, t: 5.5, life: 5.5, dps: 34 * t.owner.dmgMul(), owner: t.owner });
    this.sound('glass', t.x, t.y);
    this.sound('fire', t.x, t.y);
    for (let i = 0; i < 30; i++) this.particles.fire(t.x, t.y, r * 0.6, 40);
    this.decals.scorch(t.x, t.y, r * 0.9);
    this.addFlash(t.x, t.y, r * 3, 0.3, '#ff8a2a');
  }

  updatePools(dt) {
    for (const pool of this.pools) {
      pool.t -= dt;
      if (pool.kind === 'fire') {
        const n = pool.r * dt * 1.6;
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), d = Math.sqrt(Math.random()) * pool.r;
          this.particles.fire(pool.x + Math.cos(a) * d, pool.y + Math.sin(a) * d * 0.7, 1, 30);
        }
        for (const z of this.zombiesNear(pool.x, pool.y, pool.r + 10)) {
          if (z.dead) continue;
          if (dist2(z.x, z.y, pool.x, pool.y) < (pool.r + z.r) ** 2) {
            z.hp -= pool.dps * dt;
            this.ignite(z, 1.5, pool.dps * 0.35, pool.owner);
            if (z.hp <= 0) this.killZombie(z, pool.owner);
          }
        }
      } else {
        if (Math.random() < dt * 8) this.particles.add({ type: 'spark', x: pool.x + rand(-pool.r, pool.r) * 0.7, y: pool.y + rand(-4, 4), vy: -8, life: 0.5, color: '#9aff4a', add: true });
        for (const p of this.players) {
          if (p.alive && dist2(p.x, p.y, pool.x, pool.y) < pool.r * pool.r) p.hurt(pool.dps * 0.6, pool);
        }
      }
    }
    this.pools = this.pools.filter((p) => p.t > 0);
  }

  updatePickups(dt) {
    for (const pk of this.pickups) {
      pk.t += dt;
      const k = Math.exp(-6 * dt);
      pk.vx *= k;
      pk.vy *= k;
      const p = this.nearestPlayer(pk.x, pk.y);
      // a player whose flare slot is full leaves the flare on the ground
      if (p && (pk.type !== 'flare' || p.flares < MAX_FLARES)) {
        const dx = p.x - pk.x, dy = p.y - pk.y;
        const d = Math.hypot(dx, dy) || 1;
        if (pk.magnet || d < p.stats.pickupRadius * 1.8) {
          const s = pk.magnet ? 260 : 150;
          pk.vx = (dx / d) * s;
          pk.vy = (dy / d) * s;
        }
        if (d < 9) {
          this.collect(pk, p);
          continue;
        }
      }
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
    }
    this.pickups = this.pickups.filter((pk) => !pk.dead && pk.t < pk.life);
  }

  collect(pk, p) {
    pk.dead = true;
    const ty = p.y - 20;
    switch (pk.type) {
      case 'ammo':
        p.addAmmo(0.3);
        this.particles.text(p.x, ty, '+AMMO', '#e8c24a');
        break;
      case 'health':
        p.heal(30);
        this.particles.text(p.x, ty, '+30 HP', '#8aff8a');
        break;
      case 'rage':
        p.rage = 10;
        this.particles.text(p.x, ty, 'RAGE! x2 DMG', '#ff4a3a', 1.4);
        this.sfx.play('powerup', 0.8);
        break;
      case 'flare':
        p.flares++;
        this.particles.text(p.x, ty, '+ROAD FLARE', '#ff6a4a', 1.2);
        break;
      case 'maxammo':
        for (const o of this.players) o.refillAmmo();
        this.particles.text(p.x, ty, 'MAX AMMO!', '#ffe07a', 1.4);
        this.sfx.play('powerup', 0.8);
        break;
    }
    this.sound('pickup', p.x, p.y);
  }

  updateFires(dt) {
    for (const f of this.map.fires) {
      if (f.x < this.cam.x - 40 || f.x > this.cam.x + VIEW_W + 40 || f.y < this.cam.y - 40 || f.y > this.cam.y + VIEW_H + 40) continue;
      if (Math.random() < dt * 16) this.particles.fire(f.x, f.y, 2, 24);
      if (Math.random() < dt * 1.5) this.particles.smoke(f.x, f.y - 6, 1, true);
    }
  }

  updateCamera(dt, snap = false) {
    let ps = this.players.filter((p) => p.state !== 'dead');
    if (!ps.length) ps = this.players;
    if (!ps.length) return;
    let tx = 0, ty = 0;
    for (const p of ps) {
      tx += p.x;
      ty += p.y;
    }
    tx /= ps.length;
    ty /= ps.length;
    if (ps.length === 1 && ps[0].alive && ps[0].intent) {
      const p = ps[0];
      const look = p.intent.useCursor ? Math.min(p.aimDist, 200) * 0.2 : 20;
      tx += Math.cos(p.aim) * look;
      ty += Math.sin(p.aim) * look * 0.8;
    }
    const gx = clamp(tx - VIEW_W / 2, 0, this.map.pw - VIEW_W);
    const gy = clamp(ty - VIEW_H / 2, 0, this.map.ph - VIEW_H);
    if (snap) {
      this.cam.x = gx;
      this.cam.y = gy;
    } else {
      const k = Math.min(1, dt * 6);
      this.cam.x += (gx - this.cam.x) * k;
      this.cam.y += (gy - this.cam.y) * k;
    }
  }

  // ------------------------------------------------------------------ rendering
  render() {
    const g = this.ctx;
    const map = this.map;
    const sh = this.cam.shake;
    const cx = Math.round(clamp(this.cam.x + (sh ? rand(-sh, sh) : 0), 0, map.pw - VIEW_W));
    const cy = Math.round(clamp(this.cam.y + (sh ? rand(-sh, sh) : 0), 0, map.ph - VIEW_H));
    this.rcx = cx;
    this.rcy = cy;

    g.drawImage(map.canvas, cx, cy, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    g.drawImage(this.decals.canvas, cx, cy, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    this.drawPools(g, cx, cy);
    this.drawPickups(g, cx, cy);

    // shadows + co-op rings
    for (const z of this.zombies) pixEllipse(g, z.x - cx, z.y - cy + 2, z.r + 1, Math.max(2, z.r >> 1), 'rgba(0,0,0,0.35)');
    for (const p of this.players) {
      if (p.state === 'dead') continue;
      pixEllipse(g, p.x - cx, p.y - cy + 2, 6, 2, 'rgba(0,0,0,0.4)');
      if (this.players.length > 1) {
        g.globalAlpha = 0.6;
        pixEllipse(g, p.x - cx, p.y - cy + 3, 7, 2, PLAYER_COLORS[p.index]);
        pixEllipse(g, p.x - cx, p.y - cy + 3, 5, 1, 'rgba(0,0,0,0.6)');
        g.globalAlpha = 1;
      }
    }

    const ents = [...this.zombies, ...this.players];
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw(g, cx, cy);

    this.drawCompanions(g, cx, cy);
    this.drawThrowables(g, cx, cy);
    this.particles.draw(g, cx, cy);

    this.drawLighting(g, cx, cy);
    this.particles.drawAdditive(g, cx, cy);
    this.drawBullets(g, cx, cy);
    this.drawBolts(g, cx, cy);
    for (const z of this.zombies) z.drawEyes(g, cx, cy);
    this.particles.drawOverlay(g, cx, cy);
    if (this.state !== 'title') this.drawWorldUI(g, cx, cy);
    this.lighting.drawVignette(g);
    if (this.hurtFlash > 0) {
      g.fillStyle = `rgba(150,0,0,${this.hurtFlash * 0.7})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.state === 'playing') this.drawCrosshairs(g, cx, cy);
  }

  drawPools(g, cx, cy) {
    for (const p of this.pools) {
      const fade = Math.min(1, p.t / 0.8);
      const x = p.x - cx, y = p.y - cy;
      if (p.kind === 'fire') {
        g.globalAlpha = 0.5 * fade;
        pixEllipse(g, x, y, p.r, Math.round(p.r * 0.7), '#2a0e04');
        g.globalAlpha = 1;
      } else {
        g.globalAlpha = 0.6 * fade;
        pixEllipse(g, x, y, p.r, Math.round(p.r * 0.6), '#3f6a14');
        pixEllipse(g, x - 2, y - 1, p.r - 5, Math.round(p.r * 0.3), '#6f9a24');
        g.globalAlpha = 1;
      }
    }
  }

  drawPickups(g, cx, cy) {
    for (const pk of this.pickups) {
      if (pk.life - pk.t < 4 && Math.floor(pk.t * 8) % 2 === 0) continue;
      const img = SPR.pickups[pk.type];
      const bob = Math.round(Math.sin(pk.t * 5) * 1.5);
      const x = Math.round(pk.x - cx - img.width / 2), y = Math.round(pk.y - cy - img.height + bob);
      pixEllipse(g, pk.x - cx, pk.y - cy + 2, 4, 1, 'rgba(0,0,0,0.4)');
      g.drawImage(img, x, y - 2);
    }
  }

  drawCompanions(g, cx, cy) {
    for (const p of this.players) {
      if (!p.alive) continue;
      const n = p.stats.saws;
      for (let i = 0; i < n; i++) {
        const a = p.sawAngle + (i / n) * TAU;
        const sx = p.x + Math.cos(a) * 26 - cx, sy = p.y - 2 + Math.sin(a) * 20 - cy;
        g.save();
        g.translate(Math.round(sx), Math.round(sy));
        g.rotate(Math.floor(this.time * 20) * 0.5);
        g.drawImage(SPR.saw, -3, -3);
        g.restore();
      }
      for (const d of p.drones) {
        const y = d.y + Math.sin(this.time * 6 + d.bob) * 1.5;
        pixEllipse(g, d.x - cx, d.y - cy + 14, 3, 1, 'rgba(0,0,0,0.35)');
        g.drawImage(SPR.drone, Math.round(d.x - cx - 3), Math.round(y - cy - 2));
      }
    }
  }

  drawThrowables(g, cx, cy) {
    for (const t of this.throwables) {
      pixEllipse(g, t.x - cx, t.y - cy + 1, 2, 1, 'rgba(0,0,0,0.4)');
      const img = t.kind === 'molotov' ? SPR.molotov : t.kind === 'flare' ? SPR.flare : SPR.grenade;
      g.save();
      g.translate(Math.round(t.x - cx), Math.round(t.y - t.z - cy));
      g.rotate(Math.floor(t.spin) * 0.8);
      g.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2));
      g.restore();
      if (t.kind === 'grenade' && Math.floor(t.fuse * 8) % 2 === 0) {
        g.fillStyle = '#ff3a2a';
        g.fillRect(Math.round(t.x - cx), Math.round(t.y - t.z - cy - 3), 1, 1);
      }
    }
    for (const s of this.enemyShots) {
      pixEllipse(g, s.x - cx, s.y - cy + 1, 2, 1, 'rgba(0,0,0,0.4)');
      pixCircle(g, s.x - cx, s.y - s.z - cy, 2, '#6f9a24');
      g.fillStyle = '#c8ff6a';
      g.fillRect(Math.round(s.x - cx - 1), Math.round(s.y - s.z - cy - 1), 1, 1);
    }
  }

  drawBullets(g, cx, cy) {
    for (const b of this.bullets) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const ux = b.vx / sp, uy = b.vy / sp;
      const x = b.x - cx, y = b.y - cy;
      if (b.kind === 'rocket') {
        g.save();
        g.translate(Math.round(x), Math.round(y));
        g.rotate(Math.atan2(uy, ux));
        g.drawImage(SPR.rocket, -3, -1);
        g.restore();
        continue;
      }
      const drone = b.kind === 'drone';
      g.fillStyle = drone ? '#4fb2ff' : '#ff9a2a';
      for (let i = 2; i <= 5; i++) g.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1);
      g.fillStyle = drone ? '#c8ecff' : '#fff3b0';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
      g.fillRect(Math.round(x - ux), Math.round(y - uy), 1, 1);
    }
  }

  drawBolts(g, cx, cy) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const b of this.bolts) {
      for (let i = 0; i < b.pts.length - 1; i++) {
        const a = b.pts[i], c = b.pts[i + 1];
        const steps = Math.ceil(dist(a.x, a.y, c.x, c.y) / 3);
        let jx = 0, jy = 0;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          jx = clamp(jx + rand(-1.5, 1.5), -3, 3);
          jy = clamp(jy + rand(-1.5, 1.5), -3, 3);
          g.fillStyle = s % 2 ? '#7fd8ff' : '#e8f8ff';
          g.fillRect(Math.round(a.x + (c.x - a.x) * t + jx - cx), Math.round(a.y + (c.y - a.y) * t + jy - cy), 1, 1);
        }
      }
    }
    g.restore();
  }

  drawLighting(g, cx, cy) {
    const lights = [], glows = [], cones = [];
    const t = this.time;
    const inView = (x, y, m = 80) => x > -m && y > -m && x < VIEW_W + m && y < VIEW_H + m;

    for (const l of this.map.lights) {
      const x = l.x - cx, y = l.y - cy;
      if (l.broken || !inView(x, y, l.r)) continue;
      let intensity = l.intensity;
      let color = l.color;
      if (l.flicker && l.off) intensity *= 0.12;
      if (l.type === 'siren') {
        color = Math.floor(t * 3.5) % 2 ? l.alt : l.color;
        intensity *= 0.7 + 0.3 * Math.abs(Math.sin(t * 11));
      }
      lights.push({ x, y, r: l.r, intensity });
      const glowAlpha = l.type === 'siren' ? 0.5 : l.lamp ? 0.13 : 0.3;
      glows.push({ x, y, r: l.r * 0.9, color, alpha: glowAlpha * (l.flicker && l.off ? 0.1 : 1) });
    }
    for (const f of this.map.fires) {
      const x = f.x - cx, y = f.y - cy;
      if (!inView(x, y)) continue;
      const k = 0.85 + 0.1 * Math.sin(t * 13 + f.x) + rand(-0.05, 0.05);
      lights.push({ x, y, r: 56 * k, intensity: 0.8 });
      glows.push({ x, y, r: 42 * k, color: '#ff7a2a', alpha: 0.32 * k });
    }
    for (const p of this.players) {
      if (p.state === 'dead') continue;
      const x = p.x - cx, y = p.y - cy;
      lights.push({ x, y: y - 2, r: 44, intensity: 0.6 });
      if (p.alive) cones.push(buildCone(this.map, p.x, p.y - 3, p.aim, 0.42, 165, cx, cy));
      if (p.rage > 0) glows.push({ x, y: y - 6, r: 22, color: '#ff2a2a', alpha: 0.35 });
      for (const d of p.drones) glows.push({ x: d.x - cx, y: d.y - cy, r: 10, color: '#4fb2ff', alpha: 0.4 });
    }
    for (const f of this.flashes) {
      const x = f.x - cx, y = f.y - cy;
      const k = f.t / f.life;
      lights.push({ x, y, r: f.r, intensity: Math.min(1, k * 1.3) });
      glows.push({ x, y, r: f.r * 0.7, color: f.color, alpha: 0.45 * k });
    }
    for (const pool of this.pools) {
      const x = pool.x - cx, y = pool.y - cy;
      if (!inView(x, y)) continue;
      const k = Math.min(1, pool.t / 0.8);
      if (pool.kind === 'fire') {
        const fl = 0.85 + rand(-0.08, 0.08);
        lights.push({ x, y, r: pool.r * 2.3 * fl, intensity: 0.85 * k });
        glows.push({ x, y, r: pool.r * 1.7 * fl, color: '#ff7a2a', alpha: 0.35 * k });
      } else glows.push({ x, y, r: pool.r * 1.4, color: '#8aff4a', alpha: 0.18 * k });
    }
    for (const z of this.zombies) {
      if (z.burn > 0) {
        const x = z.x - cx, y = z.y - z.bodyOff - cy;
        lights.push({ x, y, r: 24, intensity: 0.5 });
        glows.push({ x, y, r: 16, color: '#ff8a2a', alpha: 0.3 });
      }
    }
    for (const b of this.bullets) {
      if (b.kind === 'rocket') {
        lights.push({ x: b.x - cx, y: b.y - cy, r: 36, intensity: 0.7 });
        glows.push({ x: b.x - cx, y: b.y - cy, r: 18, color: '#ff9a3a', alpha: 0.4 });
      }
    }
    for (const t2 of this.throwables) {
      if (t2.kind === 'molotov') glows.push({ x: t2.x - cx, y: t2.y - t2.z - cy, r: 14, color: '#ff8a2a', alpha: 0.4 });
      if (t2.kind === 'flare') {
        const x = t2.x - cx, y = t2.y - t2.z - cy;
        const fl = 0.85 + 0.15 * Math.sin(t * 23 + t2.x) + rand(-0.06, 0.06);
        lights.push({ x, y, r: 92 * fl, intensity: 0.95 });
        glows.push({ x, y, r: 56 * fl, color: '#ff3a2a', alpha: 0.5 * fl });
      }
    }
    for (const pk of this.pickups) {
      const x = pk.x - cx, y = pk.y - cy;
      const col = pk.type === 'health' ? '#ff6a6a' : pk.type === 'rage' || pk.type === 'flare' ? '#ff2a2a' : '#ffd24a';
      lights.push({ x, y, r: 16, intensity: 0.55 });
      glows.push({ x, y: y - 3, r: 12, color: col, alpha: 0.3 + 0.1 * Math.sin(t * 6) });
    }
    this.lighting.render(g, AMBIENT_DARK, lights, cones, glows);
  }

  drawWorldUI(g, cx, cy) {
    const coop = this.players.length > 1;
    for (const p of this.players) {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
      if (p.state === 'downed') {
        const blink = Math.floor(this.time * 3) % 2 === 0;
        if (blink) drawText(g, 'HELP!', x, y - 22, '#ff5a4e', 'center');
        // revive progress bar
        g.fillStyle = '#000';
        g.fillRect(x - 9, y - 15, 18, 4);
        g.fillStyle = '#3a1010';
        g.fillRect(x - 8, y - 14, 16, 2);
        g.fillStyle = p.revive > 0 ? '#8aff8a' : '#ff5a4e';
        g.fillRect(x - 8, y - 14, Math.round(16 * (p.revive > 0 ? p.revive : p.bleed / 30)), 2);
        continue;
      }
      if (!p.alive) continue;
      const w = p.weapon;
      if (w.reloadT > 0) {
        const k = 1 - w.reloadT / w.reloadTime();
        g.fillStyle = '#000';
        g.fillRect(x - 9, y - 21, 18, 4);
        g.fillStyle = '#e8e0c8';
        g.fillRect(x - 8, y - 20, Math.round(16 * k), 2);
      } else if (w.ammo === 0 && !w.def.infinite && w.reserve === 0) {
        drawText(g, 'NO AMMO', x, y - 24, '#ff5a4e', 'center');
      } else if (coop) {
        drawText(g, `P${p.index + 1}`, x, y - 24, PLAYER_COLORS[p.index], 'center');
      }
      if (w.def.spinup && w.spin > 0 && w.spin < 1) {
        g.fillStyle = '#ffb84a';
        g.fillRect(x - 8, y - 18, Math.round(16 * w.spin), 1);
      }
    }
    // off-screen threat arrows: the boss always, stragglers at the end of a wave
    const showAll = this.waves.state === 'fight' && this.waves.queue.length === 0 && this.zombies.length <= 6;
    for (const z of this.zombies) {
      if (!(showAll || z.type === 'boss')) continue;
      const x = z.x - cx, y = z.y - cy;
      if (x > -4 && x < VIEW_W + 4 && y > -4 && y < VIEW_H + 4) continue;
      const ax = clamp(x, 8, VIEW_W - 8), ay = clamp(y, 8, VIEW_H - 8);
      const a = Math.atan2(y - ay, x - ax);
      g.fillStyle = z.type === 'boss' ? '#ff3020' : '#ff8a5a';
      for (let i = 0; i < 4; i++) {
        const w2 = 3 - i;
        const px = Math.round(ax + Math.cos(a) * i), py = Math.round(ay + Math.sin(a) * i);
        g.fillRect(px - (w2 >> 1), py - (w2 >> 1), Math.max(1, w2), Math.max(1, w2));
      }
    }
    this.tracker.draw(g, this);
  }

  drawCrosshairs(g, cx, cy) {
    const coop = this.players.length > 1;
    for (const p of this.players) {
      if (!p.alive || !p.intent) continue;
      let x, y;
      if (p.intent.useCursor) {
        x = Math.round(this.input.mouse.x);
        y = Math.round(this.input.mouse.y);
      } else {
        x = Math.round(p.x - cx + Math.cos(p.aim) * 44);
        y = Math.round(p.y - 3 - cy + Math.sin(p.aim) * 44);
      }
      const col = coop ? PLAYER_COLORS[p.index] : '#ffffff';
      const gap = 2 + Math.round(p.weapon.def.spread * p.stats.spreadMul * 12);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x - gap - 3, y, 3, 2);
      g.fillRect(x + gap + 1, y, 3, 2);
      g.fillRect(x, y - gap - 3, 2, 3);
      g.fillRect(x, y + gap + 1, 2, 3);
      g.fillStyle = col;
      g.fillRect(x - gap - 3, y, 3, 1);
      g.fillRect(x + gap + 1, y, 3, 1);
      g.fillRect(x, y - gap - 3, 1, 3);
      g.fillRect(x, y + gap + 1, 1, 3);
      g.fillRect(x, y, 1, 1);
    }
  }
}
