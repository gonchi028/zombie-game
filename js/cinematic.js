// The opening cinematic: a 30-second cold open staged in the real city with the game's own lighting,
// zombies and survivors. A radio broadcast plays over a pan down the main street, the power dies, and
// the camera finds the survivors around the last fire in the park just as eyes open in the dark.
// It plays before your first run and from WATCH INTRO on the title menu. Any key, click, tap or
// gamepad button skips it.
import { Player } from './player.js';
import { CHARACTERS } from './data.js';
import { TILE, VIEW_W, VIEW_H } from './config.js';
import { clamp, rand, TAU } from './utils.js';
import { easeInOut } from './anim.js';

const $ = (id) => document.getElementById(id);

const LENGTH = 30; // seconds
const TYPE_SPEED = 30; // caption characters per second
const SKIP_GRACE = 0.6; // ignore input this long, so the click that started the run doesn't skip
const EYES = 12; // zombies that close in on the camp at the end
const CREEP = 13; // how fast they close in (px/s): slow, and they stop short of the fire
const CREEP_STOP = 58;

// The radio broadcast, typed out at the bottom of the screen. The last line is cut off by the blackout.
const LINES = [
  [0.8, 'THIS IS THE FINAL EMERGENCY BROADCAST.'],
  [3.6, 'THE LAST EVACUATION LEFT THE CITY AT DUSK.'],
  [8.0, 'IF YOU CAN STILL HEAR THIS, NO ONE IS COMING.'],
  [11.4, "FIND A LIGHT. DON'T LET IT GO OU—"],
];

// Where each survivor stands around the camp fire, relative to it.
const SPOTS = [[-17, -1], [17, -3], [-11, 14], [11, 15]];

export class Cinematic {
  // heroes: the survivor ids you picked. They're the ones who step up at the end.
  constructor(game, heroes, onDone) {
    this.game = game;
    this.onDone = onDone;
    this.t = 0;
    this.dark = false; // read by Game.updateLightAnim: the blackout
    this.skipping = 0;
    this.done = false;
    this.line = null;
    this.ring = [];
    const map = game.map;
    this.camp = map.camp;
    // the camera: hold on the west end of the main street, glide east, then up into the park
    const street = { x: VIEW_W / 2, y: map.spawn.y };
    const east = { x: this.camp.x - 250, y: map.spawn.y };
    const camp = { x: this.camp.x - 6, y: this.camp.y + 4 };
    this.path = [[0, street], [6.5, street], [14, east], [19.5, camp], [LENGTH, camp]];

    this.cast = Object.keys(CHARACTERS).map((id, i) => {
      const p = new Player(game, i, id, null);
      p.x = this.camp.x + SPOTS[i % SPOTS.length][0];
      p.y = this.camp.y + SPOTS[i % SPOTS.length][1];
      // guns lowered, facing the fire
      p.facing = p.x < this.camp.x ? 1 : -1;
      p.aim = Math.atan2(this.camp.y + 6 - p.y, this.camp.x - p.x);
      p.flashlight = false;
      p.hero = heroes.includes(id);
      return p;
    });
    game.cast = this.cast;
    this.populateStreet();
    this.moveCamera(true);

    // skip on any key, click, tap (captured here so nothing else reacts to it)
    this.onInput = (e) => {
      if (e.type === 'keydown' && (e.code === 'KeyM' || e.code === 'KeyN')) return; // mute / music toggles
      if (this.t < SKIP_GRACE) return;
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    };
    window.addEventListener('keydown', this.onInput, true);
    window.addEventListener('pointerdown', this.onInput, true);

    this.el = $('cine');
    this.caption = $('cine-caption');
    this.fade = $('cine-fade');
    this.card = $('cine-card');
    this.cardLight = $('cine-light');
    $('cine-skip').textContent = document.body.classList.contains('touch') ? 'TAP TO SKIP' : 'ANY KEY TO SKIP';
    this.el.className = '';
    this.card.className = '';
    this.cardLight.classList.add('off');
    this.caption.textContent = '';
    this.fade.style.opacity = 1;

    // [time, action]: everything that happens at a moment rather than over time
    this.cues = [
      [0.2, () => this.sound('static', 0.7)],
      ...LINES.map(([at, text]) => [at, () => this.say(text)]),
      [6.5, () => (this.fadeTo = { from: 1, to: 0, t0: 6.5, dur: 1.8 })],
      [12.6, () => this.sputter()],
      [13.6, () => {
        // the grid goes for good: every lamp dies, one by one, and the radio dies with them
        this.dark = true;
        game.gridDown = false;
        this.sound('powerdown', 0.9);
        this.sound('static', 0.5);
        this.caption.classList.remove('typing');
      }],
      [14.6, () => this.say(null)],
      [19.6, () => this.sound('fire', 0.5)],
      [20.6, () => this.sound('sting', 0.9)],
      ...Array.from({ length: EYES }, (_, i) => [20.6 + i * 0.17, () => this.openEyes(i)]),
      [23.0, () => this.closeIn()],
      [23.6, () => this.stepUp()],
      [24.7, () => this.flashlightsOn()],
      [25.7, () => {
        this.fade.style.opacity = 1; // smash cut to black
        this.fadeTo = null;
        this.sound('slam', 0.5);
      }],
      [26.3, () => this.card.classList.add('show')],
      [27.1, () => {
        this.cardLight.classList.remove('off');
        this.sound('power', 0.8);
      }],
      [27.25, () => this.cardLight.classList.add('off')],
      [27.4, () => this.cardLight.classList.remove('off')],
      [29.0, () => this.card.classList.remove('show')],
      [LENGTH, () => this.finish()],
    ].sort((a, b) => a[0] - b[0]);
    this.cue = 0;
  }

  update(dt) {
    if (this.done) return;
    const game = this.game;
    this.t += dt;
    if (this.t >= SKIP_GRACE && game.input.pads.some((_, i) => [0, 1, 2, 3, 9].some((b) => game.input.padHit(i, b)))) this.skip();
    if (this.skipping) {
      // a quick fade to black, then straight on
      this.skipping -= dt;
      this.fade.style.opacity = 1 - Math.max(0, this.skipping) / 0.3;
      if (this.skipping <= 0) this.finish();
      return;
    }
    while (this.cue < this.cues.length && this.cues[this.cue][0] <= this.t) {
      this.cues[this.cue++][1]();
      if (this.done) return;
    }
    if (this.fadeTo) {
      const f = this.fadeTo, k = clamp((this.t - f.t0) / f.dur, 0, 1);
      this.fade.style.opacity = f.from + (f.to - f.from) * easeInOut(k);
      if (k >= 1) this.fadeTo = null;
    }
    this.typeCaption(dt);
    this.moveCamera();
    for (const p of this.cast) this.updateSurvivor(p, dt);
    if (this.t > 15) this.clearCamp();
    for (const z of this.ring) {
      if (z.target && (z.x - this.camp.x) ** 2 + (z.y - this.camp.y) ** 2 < CREEP_STOP ** 2) z.baseSpeed = 0;
    }
  }

  // ---------------------------------------------------------------- camera
  moveCamera(snap = false) {
    const { path, t } = this;
    let i = 0;
    while (i < path.length - 2 && t >= path[i + 1][0]) i++;
    const [t0, a] = path[i], [t1, b] = path[i + 1];
    const k = easeInOut(clamp((t - t0) / (t1 - t0), 0, 1));
    const map = this.game.map, cam = this.game.cam;
    cam.x = clamp(a.x + (b.x - a.x) * k - VIEW_W / 2, 0, map.pw - VIEW_W);
    cam.y = clamp(a.y + (b.y - a.y) * k - VIEW_H / 2, 0, map.ph - VIEW_H);
    if (snap) cam.shake = 0;
  }

  // ---------------------------------------------------------------- the city
  // Walkers and runners wandering the main street for the opening pan.
  populateStreet() {
    const game = this.game, map = game.map;
    // the west end of the street only: the park stays empty until the eyes open
    const x0 = 0, x1 = this.camp.x - 420, y0 = map.spawn.y - 130, y1 = map.spawn.y + 130;
    const spots = map.walkable.filter((i) => {
      const x = (i % map.w) * TILE + 8, y = Math.floor(i / map.w) * TILE + 8;
      return x > x0 && x < x1 && y > y0 && y < y1;
    });
    for (let n = 0; n < 34; n++) {
      const i = spots[Math.floor(Math.random() * spots.length)];
      const z = game.spawnZombie(Math.random() < 0.8 ? 'walker' : 'runner', (i % map.w) * TILE + 8, Math.floor(i / map.w) * TILE + 8);
      z.spawnT = 0;
    }
  }

  // Street zombies that wandered toward the park would spoil the reveal: they quietly go, while
  // they're off screen.
  clearCamp() {
    const { cam, zombies } = this.game;
    for (const z of zombies) {
      if (this.ring.includes(z) || (z.x - this.camp.x) ** 2 + (z.y - this.camp.y) ** 2 > 330 ** 2) continue;
      const onScreen = z.x > cam.x - 16 && z.x < cam.x + VIEW_W + 16 && z.y > cam.y - 24 && z.y < cam.y + VIEW_H + 16;
      if (!onScreen) z.dead = true;
    }
  }

  // The street lamps stutter a few times before the grid fails for good.
  sputter() {
    this.sound('buzz', 0.8);
    this.sound('static', 0.4);
    const game = this.game;
    [0, 0.08, 0.16, 0.3, 0.42, 0.7, 0.78].forEach((at, i) => setTimeout(() => {
      if (!this.done && !this.dark) game.gridDown = i % 2 === 0;
    }, at * 1000));
  }

  // One by one, eyes open in the dark around the camp. They stand still for now.
  openEyes(i) {
    const game = this.game, map = game.map, c = this.camp;
    const a = (i / EYES) * TAU + rand(-0.15, 0.15), d = rand(88, 128);
    const want = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * 0.8 };
    // the nearest open ground to that spot
    let best = null, bd = Infinity;
    for (const idx of map.walkable) {
      const x = (idx % map.w) * TILE + 8, y = Math.floor(idx / map.w) * TILE + 8;
      const dd = (x - want.x) ** 2 + (y - want.y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = { x, y };
      }
    }
    const z = game.spawnZombie(i % 4 === 3 ? 'runner' : 'walker', best.x + rand(-4, 4), best.y + rand(-4, 4));
    z.spawnT = 0;
    z.facing = z.x < c.x ? 1 : -1;
    z.baseSpeed = 0; // they just stare, until closeIn()
    this.ring.push(z);
    if (i % 3 === 0) game.sound('groan', z.x, z.y, 0.6);
  }

  // ...then they shamble in on the fire.
  closeIn() {
    const target = { x: this.camp.x, y: this.camp.y, vx: 0, vy: 0, alive: true };
    for (const z of this.ring) {
      z.baseSpeed = CREEP * (z.type === 'runner' ? 1.3 : 1);
      z.target = target;
      z.targetT = 1e9;
    }
  }

  // The survivors you picked step out toward the nearest of them, guns up.
  stepUp() {
    for (const p of this.cast) {
      if (!p.hero) continue;
      const z = this.nearestEyes(p);
      if (!z) continue;
      const a = Math.atan2(z.y - p.y, z.x - p.x);
      p.walk = { a, t: 0.55 };
      p.aim = a;
      p.facing = Math.cos(a) >= 0 ? 1 : -1;
    }
  }

  flashlightsOn() {
    for (const p of this.cast) {
      if (!p.hero) continue;
      p.flashlight = true;
      p.sq.kick(0.25);
    }
    this.sound('click', 1);
    this.game.addFlash(this.camp.x, this.camp.y, 60, 0.15, '#fff6d0');
  }

  nearestEyes(p) {
    let best = null, bd = Infinity;
    for (const z of this.ring) {
      const d = (z.x - p.x) ** 2 + (z.y - p.y) ** 2;
      if (!z.dead && d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  updateSurvivor(p, dt) {
    if (p.walk && p.walk.t > 0) {
      p.walk.t -= dt;
      const s = p.char.speed * 0.6;
      p.vx = Math.cos(p.walk.a) * s;
      p.vy = Math.sin(p.walk.a) * s;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.anim += dt * 9;
    } else {
      p.vx = p.vy = 0;
    }
    // heroes keep their guns on whoever is closest
    if (p.hero && p.flashlight) {
      const z = this.nearestEyes(p);
      if (z) p.aim = Math.atan2(z.y - z.bodyOff - p.y, z.x - p.x);
    }
    p.updatePose(dt);
  }

  // ---------------------------------------------------------------- captions and sound
  say(text) {
    this.line = text ? { text, shown: 0 } : null;
    this.caption.textContent = '';
    this.caption.classList.toggle('typing', !!text);
  }

  typeCaption(dt) {
    const l = this.line;
    if (!l || l.shown >= l.text.length) return;
    const before = Math.floor(l.shown);
    l.shown = Math.min(l.text.length, l.shown + dt * TYPE_SPEED);
    const now = Math.floor(l.shown);
    if (now === before) return;
    this.caption.textContent = l.text.slice(0, now);
    if (l.text[now - 1] !== ' ') this.sound('tick', 0.35);
    if (now >= l.text.length && !l.text.endsWith('—')) setTimeout(() => this.caption.classList.remove('typing'), 600);
  }

  sound(name, vol) {
    this.game.sfx.play(name, vol);
  }

  // ---------------------------------------------------------------- the end
  skip() {
    if (this.skipping || this.done) return;
    this.skipping = 0.3;
    this.card.classList.remove('show');
  }

  finish() {
    if (this.done) return;
    this.done = true;
    window.removeEventListener('keydown', this.onInput, true);
    window.removeEventListener('pointerdown', this.onInput, true);
    // what comes next fades up out of the black
    this.el.className = 'leaving';
    setTimeout(() => this.el.className === 'leaving' && (this.el.className = 'hidden'), 900);
    this.game.gridDown = false;
    this.onDone();
  }
}
