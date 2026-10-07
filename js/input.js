// Keyboard, mouse and gamepad state, plus per-player "controllers" that turn raw input into intents.
import { VIEW_W, VIEW_H } from './config.js';
import { dist2 } from './utils.js';

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash', 'Quote']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false, rdown: false, pressed: false, rpressed: false, wheel: 0, active: false };
    this.pads = [];
    this.prevPadButtons = [];

    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code) && !(e.target instanceof HTMLButtonElement && e.code === 'Space')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = this.mouse.rdown = false;
    });
    window.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * VIEW_W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * VIEW_H;
      this.mouse.active = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.pressed = true;
      } else if (e.button === 2) {
        this.mouse.rdown = true;
        this.mouse.rpressed = true;
      }
      this.mouse.active = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      else if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  down(code) {
    return this.keys.has(code);
  }
  hit(code) {
    return this.pressed.has(code);
  }
  anyHit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  pollGamepads() {
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pads = [];
    for (const p of raw) if (p && p.connected) this.pads.push(p);
  }
  pad(i) {
    return this.pads[i] || null;
  }
  padDown(i, b) {
    const p = this.pads[i];
    return !!(p && p.buttons[b] && (p.buttons[b].pressed || p.buttons[b].value > 0.5));
  }
  padHit(i, b) {
    const p = this.pads[i];
    if (!p) return false;
    const prev = this.prevPadButtons[p.index] || [];
    return this.padDown(i, b) && !prev[b];
  }

  // Forget one-shot presses (e.g. the key that confirmed a menu shouldn't also fire in-game).
  flush() {
    this.pressed.clear();
    this.mouse.pressed = this.mouse.rpressed = false;
    this.mouse.down = false;
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.pressed = this.mouse.rpressed = false;
    this.mouse.wheel = 0;
    for (const p of this.pads) this.prevPadButtons[p.index] = p.buttons.map((b) => b.pressed || b.value > 0.5);
  }
}

// ------------------------------------------------------------------ controllers

function emptyIntent() {
  return { mx: 0, my: 0, aim: null, aimDist: 60, fire: false, reload: false, dash: false, ability: false, flare: false, interact: false, swap: 0, pause: false, useCursor: false };
}

const DEAD = 0.22;
const stick = (x, y) => {
  const m = Math.hypot(x, y);
  if (m < DEAD) return [0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return [x * k, y * k];
};

// WASD + mouse
export class KeyboardMouseController {
  constructor(input) {
    this.input = input;
    this.label = 'KEYBOARD + MOUSE';
  }
  read(player, game) {
    const i = this.input;
    const o = emptyIntent();
    o.mx = (i.down('KeyD') ? 1 : 0) - (i.down('KeyA') ? 1 : 0);
    o.my = (i.down('KeyS') ? 1 : 0) - (i.down('KeyW') ? 1 : 0);
    const wx = i.mouse.x + game.cam.x;
    const wy = i.mouse.y + game.cam.y;
    o.aim = Math.atan2(wy - (player.y - 3), wx - player.x);
    o.aimDist = Math.hypot(wx - player.x, wy - player.y);
    o.useCursor = true;
    o.fire = i.mouse.down;
    o.reload = i.hit('KeyR');
    o.dash = i.hit('Space') || i.hit('ShiftLeft');
    o.ability = i.hit('KeyQ') || i.mouse.rpressed;
    o.flare = i.hit('KeyG');
    o.interact = i.hit('KeyF');
    o.swap = i.mouse.wheel !== 0 || i.hit('KeyE') ? 1 : i.hit('Digit1') ? -10 : i.hit('Digit2') ? -11 : 0;
    return o;
  }
}

// Arrow keys with auto-aim (keyboard fallback for player 2)
export class ArrowsController {
  constructor(input) {
    this.input = input;
    this.label = 'ARROWS (AUTO-AIM)';
    this.lastAim = 0;
  }
  read(player, game) {
    const i = this.input;
    const o = emptyIntent();
    o.mx = (i.down('ArrowRight') ? 1 : 0) - (i.down('ArrowLeft') ? 1 : 0);
    o.my = (i.down('ArrowDown') ? 1 : 0) - (i.down('ArrowUp') ? 1 : 0);
    if (o.mx || o.my) this.lastAim = Math.atan2(o.my, o.mx);
    const target = nearestTarget(player, game, 190);
    o.aim = target ? Math.atan2(target.y - 4 - (player.y - 3), target.x - player.x) : this.lastAim;
    o.fire = i.down('Enter') || i.down('NumpadEnter') || i.down('Numpad0');
    o.dash = i.hit('ShiftRight');
    o.ability = i.hit('Slash');
    o.flare = i.hit('Quote');
    o.interact = i.hit('Semicolon');
    o.reload = i.hit('Period');
    o.swap = i.hit('Comma') ? 1 : 0;
    return o;
  }
}

export class GamepadController {
  constructor(input, padIndex) {
    this.input = input;
    this.padIndex = padIndex;
    this.label = 'GAMEPAD';
    this.lastAim = 0;
  }
  connected() {
    return !!this.input.pad(this.padIndex);
  }
  read(player, game) {
    const i = this.input;
    const o = emptyIntent();
    const p = i.pad(this.padIndex);
    if (!p) return o;
    const n = this.padIndex;
    [o.mx, o.my] = stick(p.axes[0] || 0, p.axes[1] || 0);
    const [ax, ay] = stick(p.axes[2] || 0, p.axes[3] || 0);
    if (ax || ay) this.lastAim = Math.atan2(ay, ax);
    else if (o.mx || o.my) {
      // no right stick: soft auto-aim toward nearby zombies, else aim where you walk
      const t = nearestTarget(player, game, 150);
      this.lastAim = t ? Math.atan2(t.y - 4 - (player.y - 3), t.x - player.x) : Math.atan2(o.my, o.mx);
    }
    o.aim = this.lastAim;
    o.fire = i.padDown(n, 7) || i.padDown(n, 5);
    o.ability = i.padHit(n, 6) || i.padHit(n, 4);
    o.dash = i.padHit(n, 0) || i.padHit(n, 10);
    o.reload = i.padHit(n, 2);
    o.interact = o.reload; // X picks up a gun when one is in reach, otherwise reloads
    o.flare = i.padHit(n, 1);
    o.swap = i.padHit(n, 3) ? 1 : 0;
    o.pause = i.padHit(n, 9);
    return o;
  }
}

// Uses whichever of two controllers was touched most recently (e.g. keyboard OR gamepad for one player).
export class HybridController {
  constructor(primary, pad) {
    this.primary = primary;
    this.pad = pad;
    this.usePad = false;
  }
  get label() {
    return this.usePad ? this.pad.label : this.primary.label;
  }
  read(player, game) {
    const a = this.primary.read(player, game);
    const b = this.pad.read(player, game);
    const padActive = b.mx || b.my || b.fire || b.dash || b.ability || b.flare || b.reload || b.swap;
    const keyActive = a.mx || a.my || a.fire || a.dash || a.ability || a.flare || a.interact || a.reload || a.swap || this.primary.input.mouse.pressed;
    if (padActive) this.usePad = true;
    else if (keyActive) this.usePad = false;
    const o = this.usePad ? b : a;
    o.pause = o.pause || b.pause;
    return o;
  }
}

function nearestTarget(player, game, range) {
  let best = null, bd = range * range;
  for (const z of game.zombies) {
    if (z.dead) continue;
    const d = dist2(player.x, player.y, z.x, z.y);
    if (d < bd && game.map.los(player.x, player.y - 3, z.x, z.y - 4)) {
      bd = d;
      best = z;
    }
  }
  return best;
}
