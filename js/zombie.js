import { ZOMBIES } from './data.js';
import { SPR } from './sprites.js';
import { TILE } from './config.js';
import { choice, clamp, rand, TAU, dist2 } from './utils.js';
import { Spring, newPose, settlePose, withPose, posePoint, easeOutBack } from './anim.js';

let nextId = 1;

// Eye pixels (sprite-space) so they can glow in the dark, and where the "body" is for hit detection.
const TYPE_INFO = {
  walker: { eyes: [[3, 4], [4, 4], [7, 4], [8, 4]], eye: '#f5e56b', bodyOff: 5 },
  runner: { eyes: [[3, 4], [4, 4], [7, 4], [8, 4]], eye: '#ff4a3a', bodyOff: 5 },
  spitter: { eyes: [[3, 4], [4, 4], [7, 4], [8, 4]], eye: '#b4ff4a', bodyOff: 5 },
  brute: { eyes: [[5, 3], [6, 3], [9, 3], [10, 3]], eye: '#ffcf4a', bodyOff: 8 },
  bloater: { eyes: [[5, 3], [6, 3], [9, 3], [10, 3]], eye: '#e8ff6a', bodyOff: 7 },
  dog: { eyes: [[11, 2]], eye: '#ff3a2a', bodyOff: 2 },
  boss: { eyes: [[8, 3], [9, 3], [14, 3], [15, 3]], eye: '#ff3020', bodyOff: 12 },
};

// How each type moves: hop height, side-to-side sway, forward lean (radians), footfall squash.
const MOTION = {
  walker: { bob: 1.5, sway: 0.14, lean: 0.07, step: 0.12 },
  runner: { bob: 3, sway: 0.07, lean: 0.26, step: 0.14 },
  spitter: { bob: 1.5, sway: 0.11, lean: 0.05, step: 0.1 },
  brute: { bob: 1.5, sway: 0.07, lean: 0.06, step: 0.24, dust: 2 },
  bloater: { bob: 1, sway: 0.09, lean: 0, step: 0.18, jelly: 0.09 },
  dog: { gallop: true },
  boss: { bob: 2, sway: 0.05, lean: 0.05, step: 0.28, dust: 4, stomp: true },
};

export class Zombie {
  constructor(game, type, x, y, scale = { hp: 1, speed: 1, dmg: 1 }) {
    const d = ZOMBIES[type];
    const info = TYPE_INFO[type];
    this.game = game;
    this.id = nextId++;
    this.type = type;
    this.def = d;
    this.info = info;
    this.bodyOff = info.bodyOff;
    this.x = x;
    this.y = y;
    this.r = d.r;
    this.maxHp = this.hp = Math.round(d.hp * scale.hp);
    this.baseSpeed = d.speed * scale.speed * (type === 'boss' ? 1 : rand(0.85, 1.15));
    this.dmg = d.dmg * scale.dmg;
    this.mass = d.mass;
    this.knockResist = d.knockResist || 0;
    this.sprites = choice(SPR[type]);
    this.anim = rand(0, 4);
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.flash = 0;
    this.vx = this.vy = 0;
    this.kx = this.ky = 0;
    this.attackCd = rand(0.3, 0.8);
    this.burn = 0;
    this.burnDps = 0;
    this.burnOwner = null;
    this.slow = 0;
    this.stun = 0;
    this.sawCd = 0;
    this.losT = rand(0, 0.35);
    this.hasLos = false;
    this.target = null;
    this.targetT = 0;
    this.state = 'walk';
    this.stateT = rand(3, 5);
    this.spitCd = rand(1.5, 3);
    this.fuse = -1;
    this.lunge = 0;
    this.lungeCd = rand(1, 2);
    this.groanT = rand(2, 12);
    this.slamCd = 3;
    this.summonT = 8;
    this.chargeDir = 0;
    this.wanderA = rand(0, TAU);
    this.dead = false;
    this.spawnT = 0.35;
    // animation
    this.motion = MOTION[type];
    this.pose = newPose();
    this.sq = new Spring(300, 11, 0.45);
    this.tilt = new Spring(220, 12);
    this.step = 0;
    this.attackT = 0;
    this.attackDir = 0;
    this.hitAx = 0;
    this.hitAy = 0;
    this.aiming = false;
  }

  // Called from Game.damageZombie: flinch back away from the hit.
  onHit(ax, ay, amount) {
    const m = Math.sqrt(this.mass);
    this.hitAx = ax;
    this.hitAy = ay;
    this.sq.kick(clamp(0.12 + (amount / this.maxHp) * 0.8, 0.12, 0.4) / m);
    this.tilt.kick((ax * 0.35) / m);
  }

  onSpit() {
    this.sq.kick(0.45);
    this.tilt.kick(this.facing * 0.35);
  }

  onSlam() {
    this.sq.kick(0.6);
  }

  update(dt) {
    const game = this.game;
    const map = game.map;
    this.flash -= dt;
    this.sawCd -= dt;
    this.attackCd -= dt;
    if (this.spawnT === 0.35) game.particles.dust(this.x, this.y + 2, 4, this.r);
    this.spawnT = Math.max(0, this.spawnT - dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.updatePose(dt);

    // ---- status effects
    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= this.burnDps * dt;
      if (Math.random() < dt * 20) game.particles.fire(this.x, this.y - this.bodyOff, 3, 30);
      if (this.hp <= 0) {
        game.killZombie(this, this.burnOwner);
        return;
      }
    }
    if (this.slow > 0) {
      this.slow -= dt;
      if (Math.random() < dt * 6) game.particles.add({ type: 'spark', x: this.x + rand(-4, 4), y: this.y - this.bodyOff, vy: -10, life: 0.4, color: '#9adfff', add: true });
    }

    // knockback decays regardless of state
    const kk = Math.exp(-9 * dt);
    this.kx *= kk;
    this.ky *= kk;

    if (this.stun > 0) {
      this.stun -= dt;
      this.x += this.kx * dt;
      this.y += this.ky * dt;
      map.resolveCircle(this);
      return;
    }

    // ---- target selection
    this.targetT -= dt;
    if (this.targetT <= 0 || !this.target || !this.target.alive) {
      this.targetT = 0.4;
      this.target = game.lureFor(this) || game.nearestPlayer(this.x, this.y);
    }
    const tgt = this.target;

    let dirX = 0, dirY = 0, speed = this.baseSpeed;
    let d = Infinity;
    if (tgt) {
      const dx = tgt.x - this.x, dy = tgt.y - this.y;
      d = Math.hypot(dx, dy) || 1;
      this.losT -= dt;
      if (this.losT <= 0) {
        this.losT = 0.3;
        this.hasLos = d < 220 && map.los(this.x, this.y, tgt.x, tgt.y);
      }
      if (this.hasLos || d < 20) {
        dirX = dx / d;
        dirY = dy / d;
      } else {
        const ti = Math.floor(this.y / TILE) * map.w + Math.floor(this.x / TILE);
        let n = map.next[ti];
        if (n >= 0) {
          const n2 = map.next[n];
          if (n2 >= 0) n = n2;
          const tx = (n % map.w) * TILE + 8, ty = Math.floor(n / map.w) * TILE + 8;
          const ex = tx - this.x, ey = ty - this.y;
          const el = Math.hypot(ex, ey) || 1;
          dirX = ex / el;
          dirY = ey / el;
        } else {
          dirX = dx / d;
          dirY = dy / d;
        }
      }
    } else {
      // no players: aimless shamble (title screen)
      this.wanderA += rand(-1, 1) * dt;
      dirX = Math.cos(this.wanderA);
      dirY = Math.sin(this.wanderA);
      speed *= 0.5;
    }

    // ---- per-type behavior
    switch (this.type) {
      case 'spitter':
        this.aiming = !!(tgt && this.hasLos && d < 140);
        if (this.aiming) {
          if (d < 70) {
            dirX = -dirX;
            dirY = -dirY;
          } else speed = 0;
          this.spitCd -= dt;
          if (this.spitCd <= 0) {
            this.spitCd = rand(2.2, 3);
            game.spitAcid(this, tgt);
          }
        }
        break;
      case 'bloater':
        if (this.fuse >= 0) {
          this.fuse -= dt;
          speed = 0;
          if (Math.floor(this.fuse * 12) % 2 === 0) this.flash = 0.05;
          if (this.fuse <= 0) {
            game.killZombie(this, null);
            return;
          }
        } else if (tgt && d < 24) this.fuse = 0.6;
        break;
      case 'dog':
        this.lungeCd -= dt;
        if (this.lunge > 0) {
          this.lunge -= dt;
          speed *= 2.2;
        } else if (tgt && d < 70 && this.hasLos && this.lungeCd <= 0) {
          this.lunge = 0.35;
          this.lungeCd = rand(1.8, 2.6);
          game.sound('bark', this.x, this.y);
        }
        break;
      case 'boss':
        if (this.updateBoss(dt, tgt, d)) return;
        if (this.state !== 'walk') speed = 0;
        break;
    }

    // reached a flare: crowd around it and claw at it
    if (tgt && tgt.lure && d < 12 && this.type !== 'bloater') {
      speed = 0;
      if (this.attackCd <= 0) {
        this.attackCd = rand(0.6, 1);
        this.attackT = 0.25;
        this.attackDir = Math.atan2(tgt.y - this.y, tgt.x - this.x);
      }
    }

    if (this.slow > 0) speed *= 0.6;
    if (this.spawnT > 0) speed *= 0.3;

    const accel = Math.min(1, dt * 7);
    this.vx += (dirX * speed - this.vx) * accel;
    this.vy += (dirY * speed - this.vy) * accel;
    this.x += (this.vx + this.kx) * dt;
    this.y += (this.vy + this.ky) * dt;
    if (Math.abs(this.vx) > 3) this.facing = this.vx > 0 ? 1 : -1;
    const sp = Math.hypot(this.vx, this.vy);
    this.anim += dt * this.def.anim * (sp / Math.max(1, this.baseSpeed));

    // ---- melee
    if (tgt && this.attackCd <= 0 && this.type !== 'bloater') {
      for (const p of game.players) {
        if (!p.alive) continue;
        if (dist2(p.x, p.y, this.x, this.y) < (p.r + this.r + 3) ** 2) {
          p.hurt(this.dmg, this);
          this.attackCd = 0.9;
          this.attackT = 0.25;
          this.attackDir = Math.atan2(p.y - this.y, p.x - this.x);
          this.sq.kick(-0.25);
          break;
        }
      }
    }

    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = rand(5, 14);
      if (this.type !== 'dog') game.sound('groan', this.x, this.y, 0.7);
    }
  }

  // Boss: walk -> windup -> charge -> (stunned if it hits a wall), plus ground slams and summons.
  updateBoss(dt, tgt, d) {
    const game = this.game;
    this.stateT -= dt;
    this.slamCd -= dt;
    this.summonT -= dt;
    if (this.summonT <= 0 && tgt) {
      this.summonT = 10;
      game.summonAround(this, 3);
    }
    switch (this.state) {
      case 'walk':
        if (tgt && this.slamCd <= 0 && d < 44) {
          this.state = 'slamwind';
          this.stateT = 0.55;
        } else if (tgt && this.stateT <= 0 && d < 240 && this.hasLos) {
          this.state = 'windup';
          this.stateT = 0.9;
          this.chargeDir = Math.atan2(tgt.y - this.y, tgt.x - this.x);
          game.sound('roar', this.x, this.y);
          game.shake(3);
        }
        break;
      case 'windup':
        if (tgt) this.chargeDir = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        this.facing = Math.cos(this.chargeDir) >= 0 ? 1 : -1;
        if (Math.floor(this.stateT * 10) % 2 === 0) this.flash = 0.04;
        if (this.stateT <= 0) {
          this.state = 'charge';
          this.stateT = 1.1;
          this.sq.kick(-0.45);
        }
        break;
      case 'charge': {
        const s = 175;
        this.x += Math.cos(this.chargeDir) * s * dt;
        this.y += Math.sin(this.chargeDir) * s * dt;
        this.anim += dt * 10;
        if (Math.random() < dt * 30) game.particles.smoke(this.x, this.y + 4, 1);
        for (const p of game.players) {
          if (p.alive && dist2(p.x, p.y, this.x, this.y) < (p.r + this.r + 2) ** 2) {
            p.hurt(this.dmg * 1.2, this);
            p.vx += Math.cos(this.chargeDir) * 200;
            p.vy += Math.sin(this.chargeDir) * 200;
          }
        }
        const hitWall = game.map.resolveCircle(this);
        if (hitWall) {
          this.state = 'stunned';
          this.stateT = 1.4;
          this.sq.kick(0.55);
          this.tilt.kick(-Math.cos(this.chargeDir) * 0.5);
          game.shake(7);
          game.sound('slam', this.x, this.y);
          game.particles.ring(this.x, this.y, 30, '#d8c8a8');
          game.particles.smoke(this.x, this.y, 6);
        } else if (this.stateT <= 0) {
          this.state = 'walk';
          this.stateT = rand(3.5, 5.5);
        }
        return true;
      }
      case 'slamwind':
        if (Math.floor(this.stateT * 14) % 2 === 0) this.flash = 0.04;
        if (this.stateT <= 0) {
          this.state = 'walk';
          this.slamCd = 4;
          game.bossSlam(this);
        }
        break;
      case 'stunned':
        if (Math.random() < dt * 8) game.particles.add({ type: 'spark', x: this.x + rand(-8, 8), y: this.y - 26, vy: -6, life: 0.5, color: '#ffe08a', add: true });
        if (this.stateT <= 0) {
          this.state = 'walk';
          this.stateT = rand(3.5, 5.5);
        }
        break;
    }
    return false;
  }

  frameIndex() {
    const a = Math.floor(this.anim);
    if (!(a >= 0)) return 0;
    return this.sprites.frames.length === 2 ? a % 2 : [1, 0, 2, 0][a % 4];
  }

  // Exaggerated procedural animation layered on the walk frames; depends on type and AI state.
  updatePose(dt) {
    this.sq.update(dt);
    this.tilt.update(dt);
    const M = this.motion;
    const P = this.pose;
    const t = this.game.time;
    const f = this.facing;
    const m = clamp(Math.hypot(this.vx, this.vy) / Math.max(1, this.baseSpeed), 0, 1.5);
    let sx = 1, sy = 1, rot = 0, ox = 0, oy = 0;

    if (M.gallop) {
      // rocking-horse bound, stretched out mid-leap
      const ph = this.anim * Math.PI;
      const h = Math.abs(Math.sin(ph));
      oy = -h * 3.5 * m;
      rot = Math.cos(ph) * 0.22 * m * f;
      sx += (h * 0.16 - 0.04) * m;
      sy -= h * 0.1 * m;
      if (this.lunge > 0) {
        sx += 0.4;
        sy -= 0.22;
        oy -= 3;
        rot = 0.18 * f;
      }
      const step = Math.floor(this.anim);
      if (step !== this.step) {
        this.step = step;
        if (m > 0.3) this.sq.kick(0.12);
      }
    } else {
      // shamble: hop on each footfall, lurch side to side, lean forward
      const ph = ((this.anim - 0.5) * Math.PI) / 2;
      const h = Math.abs(Math.sin(ph));
      oy = -h * M.bob * m;
      sy += h * 0.08 * m;
      sx -= h * 0.05 * m;
      rot = (Math.sin(ph) * M.sway + M.lean * f) * Math.min(1, m);
      const step = Math.floor((this.anim - 0.5) / 2);
      if (step !== this.step) {
        this.step = step;
        if (m > 0.3) {
          this.sq.kick(M.step);
          if (M.dust) this.game.particles.dust(this.x, this.y + 2, M.dust, this.r * 0.6);
          if (M.stomp && this.game.state === 'playing') this.game.shake(1.5);
        }
      }
    }

    if (M.jelly) {
      const j = Math.sin(t * 6 + this.id) * M.jelly;
      sx += j;
      sy -= j;
    }

    switch (this.type) {
      case 'bloater':
        if (this.fuse >= 0) {
          const k = 1 - this.fuse / 0.6;
          sx += k * 0.5 + rand(-0.06, 0.06);
          sy += k * 0.3 + rand(-0.06, 0.06);
          ox += rand(-1, 1) * k * 2;
        }
        break;
      case 'spitter':
        // rear back before hurling acid
        if (this.aiming && this.spitCd < 0.5) {
          const w = 1 - this.spitCd / 0.5;
          sy += 0.28 * w;
          sx -= 0.16 * w;
          rot -= 0.3 * w * f;
        }
        break;
      case 'boss':
        switch (this.state) {
          case 'windup': {
            // crouch, shake with rage, lean back
            const w = 1 - this.stateT / 0.9;
            sx += 0.28 * w;
            sy -= 0.25 * w;
            rot -= 0.14 * w * f;
            ox += rand(-1.5, 1.5) * w;
            break;
          }
          case 'charge':
            rot += 0.32 * f;
            sx += 0.12;
            sy -= 0.06;
            break;
          case 'slamwind': {
            // rear up tall before the slam
            const w = 1 - this.stateT / 0.55;
            sy += 0.38 * w;
            sx -= 0.2 * w;
            oy -= 7 * w;
            break;
          }
          case 'stunned':
            rot = Math.sin(t * 9) * 0.14;
            sy -= 0.08;
            sx += 0.06;
            break;
        }
        break;
    }

    // melee lunge toward the victim
    if (this.attackT > 0) {
      const w = Math.sin((1 - this.attackT / 0.25) * Math.PI);
      const c = Math.cos(this.attackDir);
      ox += c * 4 * w;
      oy += Math.sin(this.attackDir) * 2 * w;
      rot += c * 0.25 * w;
    }
    // burning zombies flail
    if (this.burn > 0) rot += Math.sin(t * 28 + this.id) * 0.08;
    if (this.stun > 0 && this.type !== 'boss') rot += Math.sin(t * 14 + this.id) * 0.1;

    sx += this.sq.v;
    sy -= this.sq.v;
    rot += this.tilt.v;

    // claw up out of the ground
    if (this.spawnT > 0) {
      const k = 1 - this.spawnT / 0.35;
      sy *= Math.max(0.05, easeOutBack(k));
      sx *= 1 + (1 - k) * 0.6;
    }

    P.sx = sx;
    P.sy = sy;
    P.rot = rot;
    P.ox = ox;
    P.oy = oy;
    settlePose(P);
  }

  // Foot pivot (bottom-center of the sprite) in screen space.
  footOff() {
    return this.r * 0.6 + (this.type === 'dog' ? 2 : 3);
  }

  footPos(cx, cy) {
    return { x: Math.round(this.x - cx), y: Math.round(this.y + this.footOff() - cy) };
  }

  draw(g, cx, cy) {
    const s = this.sprites;
    const fi = this.frameIndex();
    const flip = this.facing < 0;
    const frames = this.flash > 0 ? (flip ? s.whiteFlipped : s.white) : flip ? s.flipped : s.frames;
    const { x, y } = this.footPos(cx, cy);
    const hw = s.w >> 1;
    withPose(g, x, y, this.pose, () => {
      g.drawImage(frames[fi], -hw, -s.h);
      if (this.slow > 0) {
        g.globalAlpha = 0.35;
        g.drawImage(flip ? s.whiteFlipped[fi] : s.white[fi], -hw, -s.h);
        g.globalAlpha = 1;
      }
      // bloater swells before popping
      if (this.type === 'bloater' && this.fuse >= 0) {
        g.fillStyle = 'rgba(200,255,90,0.5)';
        g.fillRect(-hw + 2, -s.h + 8, s.w - 4, 6);
      }
    });
  }

  drawEyes(g, cx, cy) {
    const s = this.sprites;
    const { x, y } = this.footPos(cx, cy);
    const flip = this.facing < 0;
    const hw = s.w >> 1;
    g.fillStyle = this.info.eye;
    for (const [ex, ey] of this.info.eyes) {
      const px = (flip ? s.w - 1 - ex : ex) - hw + 0.5;
      const [dx, dy] = posePoint(this.pose, px, ey - s.h + 0.5);
      g.fillRect(Math.floor(x + dx), Math.floor(y + dy), 1, 1);
    }
  }

  // Launch the body as a ragdoll, away from whatever killed it.
  ragdoll(particles) {
    const s = this.sprites;
    const m = Math.sqrt(this.mass);
    const kv = Math.hypot(this.kx, this.ky);
    let ax = this.hitAx, ay = this.hitAy;
    if (kv > 5) {
      ax = this.kx / kv;
      ay = this.ky / kv;
    } else if (!ax && !ay) {
      const a = rand(0, TAU);
      ax = Math.cos(a);
      ay = Math.sin(a);
    }
    const speed = clamp(40 + kv * 0.55, 40, 190) / m;
    const vz = clamp(70 + kv * 0.35, 70, 170) / m;
    const dir = Math.abs(ax) > 0.2 ? Math.sign(ax) : this.facing;
    // fall over in the travel direction; big hits add a full somersault
    const rot = dir * (Math.PI / 2 + (kv > 140 && m < 2 ? TAU : 0));
    const img = this.facing > 0 ? s.dead : s.deadFlipped;
    // height of the standing sprite's centre above where the lying corpse's centre ends up
    const lift = s.h / 2 - this.footOff() - 1;
    particles.body(img, this.x, this.y, ax * speed, ay * speed * 0.7, vz, rot, lift);
  }
}
