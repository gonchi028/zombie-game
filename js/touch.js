// On-screen controls for phones and tablets. The move stick appears wherever the left thumb lands, the
// aim stick does the same on the right half (pushing it far enough also fires), and the action buttons
// sit around the aim stick. TouchController (input.js) turns this state into player 1's intents.
import { VIEW_W, VIEW_H } from './config.js';
import { SPR, icon } from './sprites.js';
import { $, el, pix } from './dom.js';

const THROW = 28; // how far (game px) a knob travels from the stick's center at full tilt
const HOME = { move: [66, 172], aim: [420, 205] }; // where each stick rests while no thumb is on it

// id, center x, center y, radius (game px). Sized for thumbs: ~40 CSS px or more on a phone.
const BUTTONS = [
  ['dash', 345, 240, 19],
  ['ability', 340, 190, 17],
  ['reload', 372, 146, 14],
  ['swap', 414, 134, 14],
  ['flare', 456, 134, 14],
];

const px = (n) => `calc(var(--s) * ${n})`;

// Replay a one-shot CSS animation class ('deny' or 'ready'), replacing whichever one is still on.
const ONE_SHOT = ['deny', 'ready'];
function restart(node, cls) {
  node.classList.remove(...ONE_SHOT);
  void node.offsetWidth;
  node.classList.add(cls);
}

// Keep a finger's events coming to `node` even if it slides off it. Touch pointers are captured
// implicitly anyway, so a failure here (e.g. a pointer that already lifted) is safe to ignore.
function capture(node, id) {
  try {
    node.setPointerCapture(id);
  } catch {
    /* pointer already gone */
  }
}

class Stick {
  constructor(root, name) {
    this.home = HOME[name];
    this.base = el('div', `tstick ts-${name}`);
    this.knob = el('div', 'tknob');
    this.base.append(this.knob);
    root.append(this.base);
    this.reset();
  }

  get mag() {
    return Math.hypot(this.vx, this.vy);
  }

  start(id, x, y) {
    this.id = id;
    this.cx = x;
    this.cy = y;
    this.place(x, y);
    this.base.classList.add('active');
    this.drag(x, y);
  }

  drag(x, y) {
    let dx = x - this.cx, dy = y - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > THROW) {
      dx *= THROW / d;
      dy *= THROW / d;
    }
    this.vx = dx / THROW;
    this.vy = dy / THROW;
    this.knob.style.transform = `translate(${px(dx)}, ${px(dy)})`;
  }

  reset() {
    this.id = null;
    this.vx = this.vy = 0;
    this.place(...this.home);
    this.knob.style.transform = '';
    this.base.classList.remove('active');
  }

  place(x, y) {
    this.base.style.left = px(x);
    this.base.style.top = px(y);
  }
}

export class TouchControls {
  constructor(handlers) {
    this.root = $('touch');
    this.stage = $('stage');
    this.visible = false;
    this.cache = new Map();
    this.move = new Stick(this.root, 'move');
    this.aim = new Stick(this.root, 'aim');

    this.buttons = {};
    for (const [id, x, y, r] of BUTTONS) {
      const node = el('div', `tbtn tb-${id}`);
      Object.assign(node.style, { left: px(x - r), top: px(y - r), width: px(r * 2), height: px(r * 2) });
      const art = el('span', 'tart');
      const cd = el('i', 'tcd'); // cooldown wedge, drawn over the icon
      const secs = el('span', 'tsecs'); // seconds left on a long cooldown
      const badge = el('b', 'tbadge');
      node.append(art, cd, secs, badge);
      this.root.append(node);
      const b = (this.buttons[id] = { node, art, cd, secs, badge, down: false, hit: false });
      node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation(); // a button press must not also start a stick
        capture(node, e.pointerId);
        b.down = b.hit = true;
        node.classList.add('down');
        // not ready (recharging, or nothing to use): shake so the tap doesn't feel ignored
        if (node.classList.contains('cooling') || node.classList.contains('off')) restart(node, 'deny');
      });
      const up = () => {
        b.down = false;
        node.classList.remove('down');
      };
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
      node.addEventListener('animationend', () => node.classList.remove(...ONE_SHOT));
    }
    this.buttons.dash.art.append(pix(icon('dash'), 2));
    this.buttons.flare.art.append(pix(icon('flare'), 2));

    // corner buttons are plain taps, not stick touches
    for (const [id, fn] of [['touch-pause', handlers.pause], ['touch-fs', handlers.fullscreen]]) {
      $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
      $(id).addEventListener('click', () => fn());
    }

    // Any other touch picks a stick by screen half; each finger keeps its stick until it lifts.
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = this.toGame(e);
      const stick = x < VIEW_W / 2 ? this.move : this.aim;
      if (stick.id !== null) return;
      capture(this.root, e.pointerId);
      stick.start(e.pointerId, x, y);
    });
    this.root.addEventListener('pointermove', (e) => {
      const stick = this.stickFor(e.pointerId);
      if (stick) stick.drag(...this.toGame(e));
    });
    const lift = (e) => this.stickFor(e.pointerId)?.reset();
    this.root.addEventListener('pointerup', lift);
    this.root.addEventListener('pointercancel', lift);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  stickFor(id) {
    return this.move.id === id ? this.move : this.aim.id === id ? this.aim : null;
  }

  toGame(e) {
    const r = this.stage.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H];
  }

  hit(id) {
    return this.buttons[id].hit;
  }

  // Taps count once: called after the game has read this frame's intents.
  endFrame() {
    for (const b of Object.values(this.buttons)) b.hit = false;
  }

  setVisible(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.releaseAll();
    // start each showing fresh, so a cooldown left over from a previous run can't flash "ready"
    else this.cache.clear();
  }

  releaseAll() {
    this.move.reset();
    this.aim.reset();
    for (const b of Object.values(this.buttons)) {
      b.down = b.hit = false;
      b.node.classList.remove('down');
    }
  }

  set(key, fn, value) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    fn(value);
  }

  // Recharging: grey icon, a wedge that unwinds as it refills, and (for long ones) the seconds left.
  // Ready again: a quick gold pop, so you notice without looking at the button.
  cooldown(id, left, total, showSecs) {
    const b = this.buttons[id];
    const k = left > 0 ? Math.min(1, left / total) : 0;
    this.set(`${id}Cd`, (v) => b.cd.style.setProperty('--cd', `${v}%`), Math.round(k * 100));
    const was = this.cache.get(`${id}Cool`);
    this.set(`${id}Cool`, (cooling) => {
      b.node.classList.toggle('cooling', cooling);
      if (!cooling && was) restart(b.node, 'ready');
    }, k > 0);
    if (showSecs) this.set(`${id}Secs`, (v) => (b.secs.textContent = v), k > 0 ? String(Math.ceil(left)) : '');
  }

  // Mirror player 1's state on the buttons: cooldowns, flare count, what reload and swap will do.
  sync(p) {
    const B = this.buttons;
    this.set('abIcon', (v) => B.ability.art.replaceChildren(pix(icon(v), 2)), p.char.abilityIcon);
    this.cooldown('ability', p.abilityCd, p.char.abilityCd * p.stats.abilityCdMul, true);
    this.cooldown('dash', p.dashCd, 1.3 * p.stats.dashCdMul, false);
    this.set('fl', (v) => B.flare.node.classList.toggle('off', !v), p.flares > 0);
    this.set('flc', (v) => (B.flare.badge.textContent = v), p.flares > 1 ? `x${p.flares}` : '');

    // reload turns into TAKE while a gun on the ground is in reach
    const drop = p.nearDrop ? p.nearDrop.id : '';
    this.set('take', (id) => {
      B.reload.node.classList.toggle('take', !!id);
      B.reload.badge.textContent = id ? 'TAKE' : '';
      B.reload.art.replaceChildren(id ? pix(SPR.guns[id].img, 1) : pix(icon('bullets'), 2));
    }, drop);

    // swap shows the holstered gun
    const other = p.weapons[1 - p.slot];
    this.set('swap', (id) => {
      B.swap.node.classList.toggle('off', !id);
      B.swap.art.replaceChildren(id ? pix(SPR.guns[id].img, 1) : '');
    }, other ? other.id : '');
  }
}
