import { CHARACTERS, WEAPONS } from './data.js';
import { SPR } from './sprites.js';
import { clamp, dist2, rand, TAU } from './utils.js';
import { Spring, newPose, settlePose, drawPosed, posePoint, easeOutBack, easeInOut } from './anim.js';

const DASH_TIME = 0.16;
const DASH_SPEED = 270;
const BLEED_OUT = 30;
const SWAP_TIME = 0.22;
export const MAX_FLARES = 1;

function defaultStats() {
  return {
    dmgMul: 1, rofMul: 1, speedMul: 1, magMul: 1, reloadMul: 1, reserveMul: 1, spreadMul: 1,
    pierce: 0, multishot: 0, crit: 0.05, ricochet: 0, ignite: 0, frost: 0, retaliation: 0,
    dashCdMul: 1, dashDmg: 0, abilityCdMul: 1, abilityRadius: 1, lifesteal: 0, knockMul: 1,
    explosive: 0, chain: 0, saws: 0, drones: 0, secondWind: 0, armor: 0, regen: 0,
    pickupRadius: 22, dropMul: 1, berserk: 0, tracker: 0,
  };
}

class WeaponState {
  constructor(id, owner) {
    this.id = id;
    this.def = WEAPONS[id];
    this.owner = owner;
    this.ammo = this.magSize();
    this.reserve = this.maxReserve();
    this.reloadT = 0;
    this.cd = 0;
    this.spin = 0;
  }
  magSize() {
    return Math.round(this.def.mag * this.owner.stats.magMul);
  }
  maxReserve() {
    return this.def.infinite ? Infinity : Math.round(this.def.reserve * this.owner.stats.reserveMul);
  }
  reloadTime() {
    return this.def.reload / this.owner.stats.reloadMul;
  }
}

export class Player {
  constructor(game, index, charId, controller) {
    const c = CHARACTERS[charId];
    this.game = game;
    this.index = index;
    this.char = c;
    this.ctrl = controller;
    this.sprites = SPR.players[charId];
    this.x = game.map.spawn.x + (index ? 14 : -6);
    this.y = game.map.spawn.y;
    this.r = 5;
    this.vx = this.vy = 0;
    this.stats = defaultStats();
    Object.assign(this.stats, c.stats);
    this.maxHp = c.hp;
    this.hp = c.hp;
    // slot 0: the character's signature gun (never runs dry); slot 1: whatever you picked up
    this.weapons = [new WeaponState(c.weapon, this), null];
    this.slot = 0;
    this.nearDrop = null; // weapon drop in reach that needs a button press to swap for
    this.aim = 0;
    this.aimDist = 60;
    this.facing = 1;
    this.anim = 0;
    this.moving = false;
    this.iframes = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDir = 0;
    this.dashHit = new Set();
    this.abilityCd = 0;
    this.state = 'alive'; // alive | downed | dead
    this.bleed = 0;
    this.revive = 0;
    this.upgrades = {};
    this.drones = [];
    this.sawAngle = 0;
    this.kills = 0;
    this.rage = 0;
    this.flares = 0;
    this.hurtFlash = 0;
    this.recoilKick = 0;
    this.intent = null;
    this.firing = false;
    // animation
    this.pose = newPose();
    this.sq = new Spring(320, 12); // + squash / - stretch
    this.tilt = new Spring(240, 13);
    this.hand = { x: 0, y: -3 };
    this.step = 0;
    this.swapT = 0;
    this.throwT = 0;
    this.swapText = null;
    this.newGunT = 0; // HUD flashes the primary slot after picking a new gun
  }

  get weapon() {
    return this.weapons[this.slot];
  }
  get alive() {
    return this.state === 'alive';
  }

  berserkK() {
    return this.stats.berserk ? clamp(1 - this.hp / this.maxHp, 0, 1) : 0;
  }
  dmgMul() {
    return this.stats.dmgMul * (1 + this.berserkK() * 0.6) * (this.rage > 0 ? 2 : 1);
  }
  rofMul() {
    return this.stats.rofMul * (1 + this.berserkK() * 0.6);
  }

  // ------------------------------------------------------------------ upgrades API
  addMaxHp(n) {
    this.maxHp = Math.max(20, this.maxHp + n);
    this.hp = Math.min(this.hp, this.maxHp);
  }
  heal(n) {
    if (this.state !== 'alive') return;
    this.hp = Math.min(this.maxHp, this.hp + n);
  }
  // Pick up a gun. The same gun as your slot-2 one just adds its ammo; a different one replaces it
  // and is returned so it can be dropped on the ground. `ammo` carries a dropped gun's leftovers.
  takeWeapon(id, ammo) {
    const cur = this.weapons[1];
    if (cur && cur.id === id) {
      const add = ammo ? ammo.ammo + ammo.reserve : cur.magSize() + Math.ceil(cur.maxReserve() * 0.5);
      cur.reserve = Math.min(cur.maxReserve(), cur.reserve + add);
      this.popup(`+${cur.def.short} AMMO`, '#ffd24a');
      return null;
    }
    const w = new WeaponState(id, this);
    if (ammo) {
      w.ammo = Math.min(w.magSize(), ammo.ammo);
      w.reserve = Math.min(w.maxReserve(), ammo.reserve);
    }
    this.weapons[1] = w;
    if (this.slot === 1) this.weapon.reloadT = 0;
    this.slot = 1;
    this.swapT = 0.22;
    this.newGunT = 2.5;
    this.popup(w.def.short);
    return cur;
  }

  // Weapon text over your head; a new one replaces the last instead of stacking on top of it.
  popup(str, color = '#ffb84a', life = 0.8) {
    if (this.swapText) this.swapText.t = this.swapText.life;
    this.swapText = this.game.particles.text(this.x, this.y - 22, str, color, life);
  }
  guns() {
    return this.weapons.filter(Boolean);
  }
  refillAmmo() {
    for (const w of this.guns()) {
      w.reserve = w.maxReserve();
      w.ammo = w.magSize();
    }
  }
  refillMags() {
    for (const w of this.guns()) w.ammo = Math.max(w.ammo, w.magSize());
  }
  addAmmo(fraction) {
    const w = this.weapons[1];
    if (!w) return;
    w.reserve = Math.min(w.maxReserve(), w.reserve + Math.ceil(w.maxReserve() * fraction));
  }
  addDrone() {
    this.stats.drones += 1;
    this.drones.push({ x: this.x, y: this.y - 12, cd: rand(0, 0.4), bob: rand(0, TAU) });
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const game = this.game;
    const o = (this.intent = this.ctrl.read(this, game));
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 30);
    this.updatePose(dt);
    if (this.state === 'dead') return;

    if (this.state === 'downed') {
      this.bleed -= dt;
      const m = Math.hypot(o.mx, o.my);
      if (m > 0) {
        this.x += (o.mx / Math.max(1, m)) * 14 * dt;
        this.y += (o.my / Math.max(1, m)) * 14 * dt;
        game.map.resolveCircle(this);
      }
      if (this.bleed <= 0) game.playerDied(this);
      return;
    }

    this.iframes = Math.max(0, this.iframes - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.rage = Math.max(0, this.rage - dt);
    this.newGunT = Math.max(0, this.newGunT - dt);

    if (o.aim !== null) this.aim = o.aim;
    this.aimDist = o.aimDist;
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;

    // --- movement
    let mx = o.mx, my = o.my;
    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    this.moving = m > 0.1;
    const w = this.weapon;
    let speed = this.char.speed * this.stats.speedMul;
    if (w.def.slow && this.firing) speed *= w.def.slow;

    if (o.dash && this.dashCd <= 0 && this.dashT <= 0) {
      this.dashDir = this.moving ? Math.atan2(my, mx) : this.aim;
      this.dashT = DASH_TIME;
      this.dashCd = 1.3 * this.stats.dashCdMul;
      this.iframes = Math.max(this.iframes, DASH_TIME + 0.08);
      this.dashHit.clear();
      game.sound('dash', this.x, this.y);
      this.sq.kick(0.3); // crouch before the burst
      game.particles.dust(this.x, this.y + 2, 4, 6);
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (this.dashT <= 0) {
        this.sq.kick(0.4); // skid to a stop
        game.particles.dust(this.x, this.y + 2, 3, 5);
      }
      this.vx = Math.cos(this.dashDir) * DASH_SPEED;
      this.vy = Math.sin(this.dashDir) * DASH_SPEED;
      const set = this.sprites;
      const fi = this.frameIndex();
      game.particles.afterimage(this.x, this.y + 3, this.facing > 0 ? set.frames[fi] : set.flipped[fi], this.pose);
      if (this.stats.dashDmg > 0) {
        for (const z of game.zombiesNear(this.x, this.y, 14)) {
          if (this.dashHit.has(z.id)) continue;
          if (dist2(this.x, this.y, z.x, z.y) < (z.r + this.r + 4) ** 2) {
            this.dashHit.add(z.id);
            game.damageZombie(z, this.stats.dashDmg * this.dmgMul(), { owner: this, ax: Math.cos(this.dashDir), ay: Math.sin(this.dashDir), knock: 120 });
          }
        }
      }
    } else {
      const k = Math.min(1, dt * 16);
      this.vx += (mx * speed - this.vx) * k;
      this.vy += (my * speed - this.vy) * k;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    game.map.resolveCircle(this);
    const sp = Math.hypot(this.vx, this.vy);
    this.anim += dt * (sp > 8 ? 8 + sp * 0.04 : 0);
    if (sp <= 8) this.anim = 0;

    // --- weapons
    if (o.swap === 1) this.switchWeapon(1 - this.slot);
    else if (o.swap === -10) this.switchWeapon(0);
    else if (o.swap === -11) this.switchWeapon(1);
    // pick up / swap for the weapon at your feet (gamepad X doubles as reload when there's none)
    if (o.interact && this.nearDrop) {
      game.takeDrop(this, this.nearDrop);
      o.reload = false;
    }
    if (o.reload) this.startReload();
    this.updateWeapon(dt, o.fire);

    if (o.ability && this.abilityCd <= 0) {
      game.useAbility(this);
      this.throwT = 0.3;
      this.sq.kick(-0.35);
      this.abilityCd = this.char.abilityCd * this.stats.abilityCdMul;
    }
    if (o.flare && this.flares > 0) {
      this.flares--;
      game.throwFlare(this);
      this.throwT = 0.3;
      this.sq.kick(-0.35);
    }

    if (this.stats.regen > 0) this.heal(this.stats.regen * dt);
    this.updateCompanions(dt);
  }

  switchWeapon(slot, note, color = '#ffb84a') {
    if (slot === this.slot || !this.weapons[slot]) return;
    this.weapon.reloadT = 0;
    this.slot = slot;
    this.swapT = SWAP_TIME;
    this.weapon.cd = Math.max(this.weapon.cd, 0.15);
    this.game.sound('reload', this.x, this.y, 0.5);
    this.popup(note || this.weapon.def.short, note ? color : '#ffb84a', 0.7);
  }

  startReload() {
    const w = this.weapon;
    if (w.reloadT > 0 || w.ammo >= w.magSize()) return;
    if (!w.def.infinite && w.reserve <= 0) return;
    w.reloadT = w.reloadTime();
    this.game.sound('reload', this.x, this.y, 0.6);
  }

  updateWeapon(dt, fireHeld) {
    const w = this.weapon;
    const def = w.def;
    if (w.reloadT > 0) {
      w.reloadT -= dt;
      if (w.reloadT <= 0) {
        w.reloadT = 0;
        const need = w.magSize() - w.ammo;
        const take = def.infinite ? need : Math.min(need, w.reserve);
        w.ammo += take;
        if (!def.infinite) w.reserve -= take;
      }
    }
    if (def.spinup) w.spin = clamp(w.spin + (fireHeld ? dt / def.spinup : -dt / def.spinup), 0, 1);
    w.cd -= dt;
    this.firing = false;
    if (!fireHeld) {
      if (w.cd < 0) w.cd = 0;
      return;
    }
    this.firing = true;
    if (w.reloadT > 0) return;
    if (def.spinup && w.spin < 1) return;
    if (w.ammo <= 0) {
      if (def.infinite || w.reserve > 0) this.startReload();
      else if (w.cd <= 0) {
        this.game.sound('empty', this.x, this.y);
        w.cd = 0.3;
        this.switchWeapon(0, 'OUT OF AMMO', '#ff5a4e');
      }
      return;
    }
    let shots = 0;
    while (w.cd <= 0 && w.ammo > 0 && shots < 4) {
      this.fire(w);
      w.ammo--;
      w.cd += 1 / (def.rate * this.rofMul());
      shots++;
    }
    if (w.ammo <= 0 && (def.infinite || w.reserve > 0)) this.startReload();
  }

  muzzle() {
    const g = SPR.guns[this.weapon.id];
    const len = g.len + 1;
    return { x: this.x + this.hand.x + Math.cos(this.aim) * len, y: this.y + this.hand.y + Math.sin(this.aim) * len };
  }

  fire(w) {
    const game = this.game;
    const def = w.def;
    const st = this.stats;
    const mz = this.muzzle();
    const n = def.pellets + st.multishot * (def.pellets > 1 ? 3 : 1);
    const spread = def.spread * st.spreadMul;
    const kind = def.projectile || 'bullet';
    for (let i = 0; i < n; i++) {
      let a = this.aim;
      if (def.pellets > 1) a += (Math.random() - 0.5) * spread * 2;
      else a += (i - (n - 1) / 2) * 0.09 + (Math.random() - 0.5) * spread;
      if (kind === 'zap') game.teslaShot(this, mz.x, mz.y, a, def.dmg * this.dmgMul(), def.range);
      else if (kind === 'nade') game.launchGrenade(this, mz.x, mz.y, a, def);
      else {
        game.addBullet({
          x: mz.x, y: mz.y, a, speed: def.speed * rand(0.92, 1.08), dmg: def.dmg * this.dmgMul(), range: def.range * rand(0.9, 1.1),
          pierce: st.pierce + (def.pierce || 0), ricochet: kind === 'flame' ? 0 : st.ricochet, knock: def.knock * st.knockMul, owner: this,
          kind, splash: (def.splash || 0) * this.dmgMul(), splashR: def.splashR,
        });
      }
    }
    if (def.flash) {
      game.particles.muzzle(mz.x, mz.y, this.aim, def.flash);
      game.addFlash(mz.x, mz.y, 50 + def.flash * 10, 0.06, '#ffc86a');
    }
    if (kind === 'bullet' || kind === 'sniper') game.particles.casing(this.x, this.y - 3, this.aim);
    else if (kind === 'rocket' || kind === 'nade') game.particles.smoke(mz.x, mz.y, 2);
    game.sound(def.sound, this.x, this.y);
    game.shake(def.shake);
    this.recoilKick = Math.min(7, 2 + def.shake * 1.2);
    this.sq.kick(0.03 + def.shake * 0.05);
    if (def.recoil) {
      this.vx -= Math.cos(this.aim) * def.recoil;
      this.vy -= Math.sin(this.aim) * def.recoil;
    }
  }

  hurt(dmg, src) {
    if (this.state !== 'alive' || this.iframes > 0) return;
    const game = this.game;
    dmg *= 1 - Math.min(0.75, this.stats.armor);
    this.hp -= dmg;
    this.iframes = 0.5;
    this.hurtFlash = 0.25;
    game.hurtFlash = Math.max(game.hurtFlash, 0.3);
    game.sound('hurt', this.x, this.y);
    game.shake(4);
    const a = src ? Math.atan2(this.y - src.y, this.x - src.x) : rand(0, TAU);
    game.particles.blood(this.x, this.y - 4, a, 8);
    this.vx += Math.cos(a) * 90;
    this.vy += Math.sin(a) * 90;
    this.sq.kick(0.45);
    this.tilt.kick(Math.cos(a) * 0.5);
    if (this.stats.retaliation > 0) game.shockwave(this.x, this.y, 46, this.stats.retaliation * this.dmgMul(), this, '#ffd24a');
    if (this.hp <= 0) {
      if (this.stats.secondWind) {
        this.stats.secondWind = 0;
        this.hp = this.maxHp * 0.5;
        this.iframes = 2;
        game.particles.text(this.x, this.y - 22, 'SECOND WIND!', '#ffd24a', 1.5);
        game.shockwave(this.x, this.y, 70, 80, this, '#ffd24a');
        game.sound('revive', this.x, this.y);
        return;
      }
      this.hp = 0;
      game.playerDown(this);
    }
  }

  goDown() {
    this.state = 'downed';
    this.bleed = BLEED_OUT;
    this.revive = 0;
    this.dashT = 0;
    this.vx = this.vy = 0;
    this.sq.kick(0.6); // collapse
  }

  reviveNow(frac = 0.4) {
    this.state = 'alive';
    this.hp = Math.max(1, this.maxHp * frac);
    this.iframes = 2;
    this.revive = 0;
    this.sq.kick(-0.5); // spring back up
  }

  // ------------------------------------------------------------------ saws & drones
  updateCompanions(dt) {
    const game = this.game;
    // orbiting saws
    if (this.stats.saws > 0) {
      this.sawAngle += dt * 4.2;
      const n = this.stats.saws;
      for (let i = 0; i < n; i++) {
        const a = this.sawAngle + (i / n) * TAU;
        const sx = this.x + Math.cos(a) * 26, sy = this.y - 2 + Math.sin(a) * 20;
        for (const z of game.zombiesNear(sx, sy, 12)) {
          if (z.sawCd > 0) continue;
          if (dist2(sx, sy, z.x, z.y - z.bodyOff) < (z.r + 5) ** 2) {
            z.sawCd = 0.28;
            game.damageZombie(z, 16 * this.dmgMul(), { owner: this, ax: Math.cos(a + 1.57), ay: Math.sin(a + 1.57), knock: 60, noProc: true });
            game.particles.sparks(sx, sy, a + 1.57, 3);
          }
        }
      }
    }
    // drones
    this.drones.forEach((d, i) => {
      const n = this.drones.length;
      const ta = game.time * 0.9 + (i / n) * TAU;
      const tx = this.x + Math.cos(ta) * 16, ty = this.y - 16 + Math.sin(ta) * 6;
      d.x += (tx - d.x) * Math.min(1, dt * 5);
      d.y += (ty - d.y) * Math.min(1, dt * 5);
      d.cd -= dt;
      if (d.cd <= 0) {
        let best = null, bd = 160 * 160;
        for (const z of game.zombies) {
          if (z.dead) continue;
          const dd = dist2(d.x, d.y, z.x, z.y);
          if (dd < bd && game.map.los(d.x, d.y + 10, z.x, z.y - 4)) {
            bd = dd;
            best = z;
          }
        }
        if (best) {
          const a = Math.atan2(best.y - best.bodyOff - d.y, best.x - d.x);
          game.addBullet({ x: d.x, y: d.y, a, speed: 420, dmg: 11 * this.dmgMul(), range: 200, pierce: 0, ricochet: 0, knock: 20, owner: this, kind: 'drone', noProc: true });
          game.sound('smg', d.x, d.y, 0.35);
          d.cd = 0.4;
        } else d.cd = 0.2;
      }
    });
  }

  // ------------------------------------------------------------------ drawing
  frameIndex() {
    const a = Math.floor(this.anim);
    return a > 0 ? [1, 0, 2, 0][a % 4] : 0;
  }

  // Exaggerated procedural animation on top of the 3 leg frames.
  updatePose(dt) {
    this.sq.update(dt);
    this.tilt.update(dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    const P = this.pose;
    const t = this.game.time;
    let sx = 1, sy = 1, rot = 0, ox = 0, oy = 0;
    const sp = Math.hypot(this.vx, this.vy);

    if (this.state !== 'alive') {
      // downed: slump and wriggle while crawling
      const crawl = sp > 2 || (this.intent && Math.hypot(this.intent.mx, this.intent.my) > 0.1);
      const b = Math.sin(t * (crawl ? 9 : 2.5));
      rot = crawl ? b * 0.1 : 0;
      sx += b * (crawl ? 0.08 : 0.03);
      sy -= b * (crawl ? 0.08 : 0.03);
    } else if (this.dashT > 0) {
      // smear into the dash direction
      const c = Math.abs(Math.cos(this.dashDir)), s = Math.abs(Math.sin(this.dashDir));
      sx += 0.5 * c - 0.25 * s;
      sy += 0.45 * s - 0.35 * c;
      rot = Math.cos(this.dashDir) * 0.4;
      oy = -2;
    } else if (sp > 8) {
      // bouncy run: hop on every step, lean into the motion, waddle side to side
      const ph = ((this.anim - 0.5) * Math.PI) / 2;
      const h = Math.abs(Math.sin(ph));
      const k = Math.min(1.3, sp / this.char.speed);
      oy = -h * 3.5 * k;
      sy += (h * 0.14 - 0.04) * k;
      sx -= h * 0.08 * k;
      rot = (this.vx / this.char.speed) * 0.2 + Math.sin(ph) * 0.09 * k;
      const step = Math.floor((this.anim - 0.5) / 2);
      if (step !== this.step) {
        this.step = step;
        this.sq.kick(0.16 * k);
        this.game.particles.dust(this.x, this.y + 2, 1, 3);
      }
    } else {
      // idle breathing
      const b = Math.sin(t * 3.4 + this.index * 2);
      sy += b * 0.05;
      sx -= b * 0.035;
    }

    if (this.state === 'alive') {
      // shove the body back with the gun's kick
      ox -= Math.cos(this.aim) * this.recoilKick * 0.35;
      oy -= Math.sin(this.aim) * this.recoilKick * 0.2;
      if (this.throwT > 0) rot += Math.cos(this.aim) * 0.35 * Math.sin((this.throwT / 0.3) * Math.PI);
      if (this.hurtFlash > 0) ox += rand(-1.5, 1.5);
    }
    P.sx = sx + this.sq.v;
    P.sy = sy - this.sq.v;
    P.rot = rot + this.tilt.v;
    P.ox = ox;
    P.oy = oy;
    settlePose(P);
    // hand (gun pivot) is 6px above the feet; feet sit 3px below this.y
    const [hx, hy] = posePoint(P, 0, -6);
    this.hand.x = hx;
    this.hand.y = hy + 3;
  }

  draw(g, cx, cy) {
    const set = this.sprites;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    if (this.state === 'downed' || this.state === 'dead') {
      const img = this.facing > 0 ? set.downed : set.downedFlipped;
      g.globalAlpha = this.state === 'dead' ? 0.5 : 1;
      drawPosed(g, img, x, y + 4, this.pose);
      g.globalAlpha = 1;
      return;
    }
    if (this.iframes > 0 && this.dashT <= 0 && Math.floor(this.game.time * 20) % 2 === 0) return;
    const fi = this.frameIndex();
    const flash = this.hurtFlash > 0.15;
    const frames = flash ? (this.facing > 0 ? set.white : set.whiteFlipped) : this.facing > 0 ? set.frames : set.flipped;
    const aimUp = Math.sin(this.aim) < -0.35;
    if (aimUp) this.drawGun(g, x, y);
    drawPosed(g, frames[fi], x, y + 3, this.pose);
    if (!aimUp) this.drawGun(g, x, y);
  }

  drawGun(g, x, y) {
    const gun = SPR.guns[this.weapon.id];
    const w = this.weapon;
    let a = this.aim;
    // muzzle climb on recoil
    a -= this.facing * this.recoilKick * 0.07;
    // twirl the gun while reloading
    if (w.reloadT > 0) a -= this.facing * easeInOut(clamp(1 - w.reloadT / w.reloadTime(), 0, 1)) * TAU;
    g.save();
    g.translate(Math.round(x + this.hand.x), Math.round(y + this.hand.y));
    g.rotate(a);
    const pop = this.swapT > 0 ? easeOutBack(1 - this.swapT / SWAP_TIME) : 1;
    g.scale(pop, this.facing < 0 ? -pop : pop);
    g.drawImage(gun.img, -gun.pivot[0] - Math.round(this.recoilKick), -gun.pivot[1]);
    g.restore();
  }
}
