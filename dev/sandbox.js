// Sandbox: a dev-only arena for trying out zombies and bosses. `npm start` serves it at /dev: the real
// game (index.html + js/) with this panel bolted on. Nothing in js/ knows about it. It hooks in from
// the outside by wrapping a few methods, and the GitHub Pages deploy never copies dev/, so none of
// this can reach the published game.
import { ZOMBIES, CHARACTERS, WEAPONS, PICKUP_WEAPONS } from '../js/data.js';
import { UPGRADES } from '../js/upgrades.js';
import { SPECIALS, BOSS_EVERY, WaveManager, bossLineup } from '../js/waves.js';
import { Zombie } from '../js/zombie.js';
import { Player, MAX_FLARES } from '../js/player.js';
import { KeyboardMouseController, TouchController, GamepadController, HybridController } from '../js/input.js';
import { VIEW_W, VIEW_H } from '../js/config.js';
import { storage, pixRing, clamp, TAU } from '../js/utils.js';
import { drawText } from '../js/font.js';

const game = window.__game; // main.js runs first (module scripts run in document order)
const canvas = document.getElementById('game');

// ------------------------------------------------------------------ settings (remembered per browser)
const opts = {
  char: 'red', level: 1, special: null, count: 1, offscreen: false,
  god: true, infinite: true, speed: 1, frozen: false, lights: false, boxes: true, open: true,
  ...storage.get('ll_dev', {}),
};
const save = () => storage.set('ll_dev', opts);

// Sandbox runs never count: no best score and no lifetime records.
const realSet = storage.set;
storage.set = (key, value) => {
  if (key !== 'll_best' && key !== 'll_records') realSet.call(storage, key, value);
};

// ------------------------------------------------------------------ hooks into the game
let director = false; // false: no waves, you spawn everything. true: the real wave director runs.
const waveUpdate = WaveManager.prototype.update;
WaveManager.prototype.update = function (dt) {
  if (director) waveUpdate.call(this, dt);
};

// Frozen zombies hold still (no AI, no attacks) but can still be shot.
const zombieUpdate = Zombie.prototype.update;
Zombie.prototype.update = function (dt) {
  if (opts.frozen && game.state !== 'title') this.updatePose(dt);
  else zombieUpdate.call(this, dt);
};

// Every hit on a player is logged so you can see how hard a zombie hits. God mode still plays the hit
// (flash, knockback, i-frames), it just gives the health back.
let hits = [];
const hurt = Player.prototype.hurt;
Player.prototype.hurt = function (dmg, src) {
  const before = this.hp;
  if (opts.god) this.hp += 1e9; // so the hit can never down you
  hurt.call(this, dmg, src);
  const taken = before + (opts.god ? 1e9 : 0) - this.hp;
  if (opts.god) this.hp = before;
  if (taken > 0) hits.push({ t: game.time, dmg: taken, by: src?.type || src?.kind || 'blast' });
};

const update = game.update.bind(game);
game.update = (dt) => {
  update(dt * opts.speed);
  if (game.state !== 'playing') return;
  for (const p of game.players) {
    if (opts.infinite) {
      p.abilityCd = 0;
      p.flares = MAX_FLARES;
    }
  }
};

const lightingRender = game.lighting.render.bind(game.lighting);
game.lighting.render = (target, darkness, ...rest) => lightingRender(target, opts.lights ? 0 : darkness, ...rest);

let frames = 0, fps = 0, fpsT = performance.now();
const render = game.render.bind(game);
game.render = () => {
  render();
  if (game.state !== 'title' && game.state !== 'cinematic') drawOverlay(game.ctx);
  frames++;
  const now = performance.now();
  if (now - fpsT > 500) {
    fps = Math.round((frames * 1000) / (now - fpsT));
    frames = 0;
    fpsT = now;
  }
};

// ------------------------------------------------------------------ arena
function startArena() {
  game.sfx.init();
  game.titleAsleep = false;
  director = false;
  const ctrl = new HybridController(new KeyboardMouseController(game.input), new TouchController(window.__touch), new GamepadController(game.input, 0));
  game.newRun(1, [opts.char], [ctrl]);
  game.ui.hideBanner();
  game.ui.showScreen(null);
  hits = [];
  select(null);
  setLevel(opts.level);
}

// Zombies spawned in the arena get the same health, speed and damage they'd have on this wave.
function setLevel(n) {
  opts.level = clamp(n, 1, 60);
  save();
  if (director || !game.players.length) return;
  const w = game.waves;
  w.start(opts.level);
  w.queue = [];
  w.total = 0;
  w.state = 'fight';
  w.special = opts.special;
}

// Hand over to the real wave director: wave n exactly as it would play in a run.
function playRealWave(n) {
  if (!game.players.length) startArena();
  director = true;
  for (const z of game.zombies) z.dead = true;
  game.waves.start(n);
  game.announceWave();
}

function backToArena() {
  director = false;
  if (game.state === 'upgrade') {
    game.ui.hideUpgrade();
    game.state = 'playing';
  }
  setLevel(opts.level);
}

function spawn(type, x, y) {
  let z = null;
  for (let i = 0; i < opts.count; i++) {
    const a = (i / opts.count) * TAU, d = i ? 8 + Math.sqrt(i) * 5 : 0;
    z = game.spawnZombie(type, x + Math.cos(a) * d, y + Math.sin(a) * d, game.waves.scale);
  }
  if (z) select(z);
}

function spawnOffscreen(type) {
  const p = game.players[0];
  const at = game.waves.pickSpawnPoint() || { x: p.x + 200, y: p.y };
  spawn(type, at.x, at.y);
}

function clearWorld() {
  for (const z of game.zombies) z.dead = true;
  game.zombies = [];
  game.enemyShots = [];
  game.pools = [];
  game.pickups = [];
  game.weaponDrops = [];
  game.bossRef = null;
  game.decals.clear();
  game.particles.list.length = 0;
}

// ------------------------------------------------------------------ mouse: place zombies, inspect them
let placing = null; // zombie type waiting for a click on the map

const toWorld = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * VIEW_W + game.rcx, y: ((e.clientY - r.top) / r.height) * VIEW_H + game.rcy };
};

function nearestZombie(x, y) {
  let best = null, bd = 24 * 24;
  for (const z of game.zombies) {
    if (z.dead) continue;
    const d = (z.x - x) ** 2 + (z.y - z.bodyOff * 0.5 - y) ** 2;
    if (d < bd) {
      bd = d;
      best = z;
    }
  }
  return best;
}

// Capture phase, so the click never reaches the game and fires the player's gun.
window.addEventListener('mousedown', (e) => {
  if (e.target !== canvas || game.state === 'title') return;
  if (placing && e.button === 0) {
    const w = toWorld(e);
    spawn(placing, w.x, w.y);
    if (!e.shiftKey) setPlacing(null);
  } else if (placing) {
    setPlacing(null); // any other button cancels
  } else if (e.altKey) {
    const w = toWorld(e);
    select(nearestZombie(w.x, w.y));
  } else return;
  e.stopPropagation();
  e.preventDefault();
}, true);
window.addEventListener('contextmenu', (e) => placing && e.preventDefault(), true);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && placing) {
    setPlacing(null);
    e.stopPropagation(); // don't pause the game too
  } else if (e.code === 'Backquote') {
    opts.open = !opts.open;
    save();
    refresh();
  }
}, true);

// ------------------------------------------------------------------ overlay drawn on top of the game
let selected = null;

function drawOverlay(g) {
  const cx = game.rcx, cy = game.rcy;
  for (const z of game.zombies) {
    if (z.dead) continue;
    const x = z.x - cx, y = z.y - cy;
    if (x < -40 || x > VIEW_W + 40 || y < -40 || y > VIEW_H + 40) continue;
    const big = !!z.def.boss || z === selected;
    if (opts.boxes) {
      g.globalAlpha = 0.75;
      pixRing(g, x, y, z.r, '#4fd8ff'); // body: what walls and the crowd push against
      pixRing(g, x, y - z.bodyOff, z.r + 2.5, '#ff5ad8'); // what bullets hit (see Game.updateBullets)
      g.globalAlpha = 1;
    }
    if (!big && !opts.boxes) continue;
    // health bar, plus the AI state for bosses and the selected zombie
    const top = Math.round(y - z.bodyOff - z.r - 6);
    g.fillStyle = '#000';
    g.fillRect(Math.round(x - 9), top, 18, 3);
    g.fillStyle = z === selected ? '#ffd24a' : '#e0453a';
    g.fillRect(Math.round(x - 8), top + 1, Math.max(0, Math.round((16 * z.hp) / z.maxHp)), 1);
    if (big) drawText(g, z.def.boss ? z.state : `${z.type} ${z.state}`, x, top - 7, z === selected ? '#ffd24a' : '#ffffff', 'center');
  }
  if (selected && !selected.dead) {
    const x = selected.x - cx, y = selected.y - cy;
    pixRing(g, x, y + 1, selected.r + 4, '#ffd24a');
    const t = selected.target;
    if (t) {
      // dotted line to whoever it's after: yellow with line of sight, grey without
      g.fillStyle = selected.hasLos ? '#ffd24a' : '#777';
      const dx = t.x - selected.x, dy = t.y - selected.y, n = Math.floor(Math.hypot(dx, dy) / 4);
      for (let i = 1; i < n; i += 2) g.fillRect(Math.round(x + (dx * i) / n), Math.round(y + (dy * i) / n), 1, 1);
    }
  }
  if (placing) {
    const m = game.input.mouse;
    g.globalAlpha = 0.8;
    pixRing(g, m.x, m.y, ZOMBIES[placing].r, '#8aff8a');
    g.globalAlpha = 1;
    drawText(g, `${placing} x${opts.count}`, m.x, m.y + ZOMBIES[placing].r + 3, '#8aff8a', 'center');
  }
}

// ------------------------------------------------------------------ panel
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const button = (label, onClick, cls = '') => {
  const b = el('button', `sbx-btn ${cls}`, label);
  b.addEventListener('click', () => {
    onClick();
    b.blur(); // so Space and Enter go back to the game
    refresh();
  });
  return b;
};
const section = (title) => {
  const s = el('section', 'sbx-sec');
  s.append(el('h3', '', title));
  panel.append(s);
  return s;
};
const row = (parent, ...kids) => {
  const r = el('div', 'sbx-row');
  r.append(...kids);
  parent.append(r);
  return r;
};
// a group of buttons where one is "on"
const choiceRow = (parent, items, isOn, pick) => {
  const r = row(parent);
  for (const [value, label] of items) {
    const b = button(label, () => pick(value));
    b._on = () => isOn(value);
    r.append(b);
  }
  return r;
};
const toggle = (parent, key, label, after) => {
  const b = button(label, () => {
    opts[key] = !opts[key];
    save();
    after?.();
  }, 'sbx-toggle');
  b._on = () => opts[key];
  parent.append(b);
  return b;
};

const panel = el('aside', 'sbx');
panel.id = 'sbx';
const tab = el('button', 'sbx-tab', 'SANDBOX ` ');
tab.addEventListener('click', () => {
  opts.open = !opts.open;
  save();
  refresh();
});
document.body.append(panel, tab);
document.body.classList.add('sbx-on');

const head = el('header', 'sbx-head');
head.append(el('b', '', 'SANDBOX'), el('span', 'sbx-dim', 'dev only · ` hides'));
panel.append(head);
const status = el('div', 'sbx-status');
panel.append(status);

// --- arena
const arena = section('ARENA');
choiceRow(arena, Object.values(CHARACTERS).map((c) => [c.id, c.name]), (id) => opts.char === id, (id) => {
  opts.char = id;
  save();
  startArena();
});
row(arena, button('RESTART ARENA', startArena, 'wide'));
row(arena, button('PLAY INTRO', () => {
  game.ui.hideHUD();
  game.playIntro([opts.char], startArena);
}),
  button('FORGET INTRO WAS SEEN', () => storage.set('ll_intro_seen', false)));

// --- spawning
const spawnSec = section('SPAWN');
const levelLabel = el('span', 'sbx-val');
row(spawnSec, el('span', 'sbx-key', 'Stats of wave'), button('−', () => setLevel(opts.level - 1)), levelLabel, button('+', () => setLevel(opts.level + 1)),
  button('+5', () => setLevel(opts.level + 5)));
choiceRow(spawnSec, [[1, '×1'], [5, '×5'], [10, '×10'], [25, '×25']], (n) => opts.count === n, (n) => {
  opts.count = n;
  save();
});
choiceRow(spawnSec, [[false, 'AT CURSOR'], [true, 'OFF-SCREEN']], (v) => opts.offscreen === v, (v) => {
  opts.offscreen = v;
  save();
});
const typeGrid = el('div', 'sbx-grid');
for (const [type, d] of Object.entries(ZOMBIES)) {
  const b = button(type.toUpperCase(), () => {
    if (game.state === 'title') startArena();
    if (opts.offscreen) spawnOffscreen(type);
    else setPlacing(placing === type ? null : type);
  }, d.boss ? 'boss' : '');
  b._on = () => placing === type;
  typeGrid.append(b);
}
spawnSec.append(typeGrid);
spawnSec.append(el('p', 'sbx-hint', 'Pick a type, then click the map. Shift-click keeps placing; Esc or right-click stops. Alt-click a zombie to inspect it.'));

// --- the world
const world = section('WORLD');
choiceRow(world, [[0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×']], (v) => opts.speed === v, (v) => {
  opts.speed = v;
  save();
});
const tg = row(world);
toggle(tg, 'frozen', 'FREEZE AI');
toggle(tg, 'lights', 'LIGHTS UP');
toggle(tg, 'boxes', 'HITBOXES');
choiceRow(world, [[null, 'NORMAL'], ...Object.entries(SPECIALS).map(([id, s]) => [id, s.name.split(' ').pop()])], (id) => opts.special === id, (id) => {
  opts.special = id;
  save();
  if (!director) game.waves.special = id;
});
row(world, button('KILL ALL', () => [...game.zombies].forEach((z) => game.killZombie(z, null))), button('CLEAR', clearWorld));

// --- waves
const wavesSec = section('REAL WAVES');
const lineup = el('p', 'sbx-hint');
wavesSec.append(lineup);
row(wavesSec, button('PLAY THIS WAVE', () => playRealWave(opts.level)), button('BACK TO ARENA', backToArena));

// --- the player
const player = section('PLAYER');
const pt = row(player);
toggle(pt, 'god', 'GOD MODE');
toggle(pt, 'infinite', 'FREE ABILITY');
pt.append(button('HEAL', () => game.players.forEach((p) => p.heal(1e9))));
const dmgLine = el('p', 'sbx-hint');
player.append(dmgLine);
row(player, button('RESET HIT LOG', () => (hits = [])));
const guns = el('div', 'sbx-grid');
for (const id of PICKUP_WEAPONS) guns.append(button(WEAPONS[id].short, () => game.players[0]?.takeWeapon(id)));
player.append(el('h4', '', 'GIVE GUN'), guns);
const ups = el('div', 'sbx-grid ups');
for (const u of UPGRADES) {
  ups.append(button(u.name, () => {
    const p = game.players[0];
    if (!p) return;
    p.upgrades[u.id] = (p.upgrades[u.id] || 0) + 1;
    u.apply(p);
  }, `rar-${u.rarity}`));
}
player.append(el('h4', '', 'GIVE UPGRADE'), ups);

// --- inspector
const insp = section('INSPECTOR');
const inspBody = el('div', 'sbx-insp');
insp.append(inspBody);

// Timers every zombie has but only some types use; a field shows up once it starts ticking.
const IGNORE = new Set(['flash', 'sawCd', 'spawnT', 'targetT', 'losT', 'groanT', 'attackT', 'anim']);
let watch = null; // { z, start: initial values, shown: Set of field names, rows: Map name -> value node }

function select(z) {
  selected = z;
  watch = null;
  inspBody.innerHTML = '';
  if (!z) {
    inspBody.append(el('p', 'sbx-hint', 'Nothing selected. Spawn something or Alt-click a zombie.'));
    return;
  }
  const start = {};
  for (const [k, v] of Object.entries(z)) if (typeof v === 'number' || typeof v === 'boolean') start[k] = v;
  watch = { z, start, shown: new Set(), rows: new Map() };
  const title = el('div', 'sbx-insp-title');
  watch.title = title;
  inspBody.append(title);
  row(inspBody,
    button('FULL HP', () => (z.hp = z.maxHp)), button('50%', () => (z.hp = z.maxHp * 0.5)), button('10%', () => (z.hp = z.maxHp * 0.1)),
    button('KILL', () => game.killZombie(z, game.players[0] || null)));
  watch.list = el('div', 'sbx-fields');
  inspBody.append(watch.list);
}

function refreshInspector() {
  if (!watch) return;
  const { z } = watch;
  watch.title.textContent = `${z.type.toUpperCase()} #${z.id} · ${Math.max(0, Math.round(z.hp))}/${z.maxHp} HP${z.dead ? ' · DEAD' : ''}`;
  const fields = ['state', 'stateT'];
  for (const [k, v0] of Object.entries(watch.start)) {
    if (IGNORE.has(k) || k === 'stateT') continue;
    const timer = typeof v0 === 'number' && /(Cd|T)$/.test(k);
    const flag = typeof v0 === 'boolean' && k !== 'dead';
    if ((timer && z[k] !== v0) || (flag && z[k])) watch.shown.add(k);
  }
  watch.shown.add('hasLos');
  for (const k of [...fields, ...watch.shown]) {
    let cell = watch.rows.get(k);
    if (!cell) {
      const r = row(watch.list, el('span', 'sbx-key', k));
      cell = el('span', 'sbx-val');
      r.append(cell);
      // timers get a button that runs them out, so the move they gate happens right away
      if (typeof z[k] === 'number' && k !== 'stateT') r.append(button('0', () => (z[k] = 0), 'tiny'));
      watch.rows.set(k, cell);
    }
    const v = z[k];
    cell.textContent = typeof v === 'number' ? v.toFixed(2) : String(v);
  }
}

// ------------------------------------------------------------------ live bits
function setPlacing(type) {
  placing = type;
  refresh();
}

function refresh() {
  panel.classList.toggle('closed', !opts.open);
  document.body.classList.toggle('sbx-open', opts.open);
  for (const b of panel.querySelectorAll('button')) if (b._on) b.classList.toggle('on', !!b._on());
  levelLabel.textContent = opts.level;
  const n = opts.level;
  lineup.textContent = n % BOSS_EVERY === 0
    ? `Wave ${n} is a boss wave: ${bossLineup(n).map((t) => ZOMBIES[t].name).join(' + ')}.`
    : `Wave ${n}: regular wave. Boss waves are every ${BOSS_EVERY}th.`;
}

setInterval(() => {
  const alive = game.zombies.filter((z) => !z.dead).length;
  const mode = game.state === 'title' ? 'title screen' : director ? `real wave ${game.waves.wave} (${game.waves.state})` : `arena · wave ${opts.level} stats`;
  status.textContent = `${mode} · ${alive} zombies · ${fps} fps`;
  const recent = hits.filter((h) => game.time - h.t <= 5);
  const sum = (list) => list.reduce((a, h) => a + h.dmg, 0);
  const by = {};
  for (const h of hits) by[h.by] = (by[h.by] || 0) + h.dmg;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
  dmgLine.textContent = `Damage taken: ${Math.round(sum(hits))} total in ${hits.length} hits · ${(sum(recent) / 5).toFixed(1)}/s over the last 5s${top ? ` · by ${top}` : ''}`;
  refreshInspector();
}, 100);

select(null);
refresh();
startArena();
