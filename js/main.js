// Boot: bake sprites, wire UI <-> game, run the loop.
import { buildAllSprites } from './sprites.js';
import { Input, KeyboardMouseController, ArrowsController, GamepadController, HybridController } from './input.js';
import { Sfx } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';

buildAllSprites();

const canvas = document.getElementById('game');
const input = new Input(canvas);
const sfx = new Sfx();
let game = null;

function controllersFor(mode) {
  if (mode === 1) return [new HybridController(new KeyboardMouseController(input), new GamepadController(input, 0))];
  // Co-op: P1 on keyboard+mouse (or a 2nd gamepad), P2 on the first gamepad (or arrow keys).
  return [
    new HybridController(new KeyboardMouseController(input), new GamepadController(input, 1)),
    new HybridController(new ArrowsController(input), new GamepadController(input, 0)),
  ];
}

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  ui.showPause(game);
}

function resume() {
  if (game.state !== 'paused') return;
  ui.showScreen(null);
  input.flush();
  game.state = 'playing';
}

function toTitle() {
  game.startAttract();
  ui.showTitle(game.best, sfx.muted);
}

const ui = new UI({
  click: () => sfx.play('select', 0.5),
  solo: () => ui.showSelect(1, startRun),
  coop: () => ui.showSelect(2, startRun),
  guide: () => ui.showGuide(game.state === 'paused' ? 'pause' : 'title'),
  back: () => ui.showTitle(game.best, sfx.muted),
  resume,
  restart: () => {
    ui.showScreen(null);
    game.restart();
  },
  quit: toTitle,
  mute: () => ui.refreshMute(sfx.toggleMute()),
});

function startRun(mode, chars) {
  sfx.init();
  game.newRun(mode, chars, controllersFor(mode));
}

game = new Game({ canvas, ui, sfx, input });
ui.showTitle(game.best, sfx.muted);

// Browsers only allow audio after a user gesture.
const unlock = () => sfx.init();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (ui.current === 'scr-guide') return; // the guide handles its own ESC (back to pause)
    if (game.state === 'playing') pause();
    else if (game.state === 'paused') resume();
  } else if (e.code === 'KeyM') {
    ui.refreshMute(sfx.toggleMute());
  }
});
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => document.hidden && pause());

let last = performance.now();
let loggedError = false;
function frame(now) {
  requestAnimationFrame(frame);
  // rAF timestamps can precede `last` (first frame, throttled tabs), so never step backwards.
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = Math.max(last, now);
  try {
    input.pollGamepads();
    if (ui.current !== 'scr-guide' && input.pads.some((_, i) => input.padHit(i, 9))) {
      if (game.state === 'playing') pause();
      else if (game.state === 'paused') resume();
    }
    game.update(dt);
    game.render();
    ui.pollGamepad(input, dt);
  } catch (err) {
    // One bad frame should never freeze the game; report it once and keep going.
    if (!loggedError) console.error(err);
    loggedError = true;
  }
  input.endFrame();
}
requestAnimationFrame(frame);

// Handy for debugging from the console.
window.__game = game;
