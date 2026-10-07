// Boot: bake sprites, wire UI <-> game, run the loop.
import { buildAllSprites } from './sprites.js';
import { Input, KeyboardMouseController, ArrowsController, GamepadController, HybridController, TouchController } from './input.js';
import { TouchControls } from './touch.js';
import { fullscreenSupported, standalone, isFullscreen, toggleFullscreen, onFullscreenChange } from './fullscreen.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { UI } from './ui.js';
import { Game } from './game.js';

buildAllSprites();

const canvas = document.getElementById('game');
const input = new Input(canvas);
const sfx = new Sfx();
const music = new Music(sfx);
let game = null;

function controllersFor(mode) {
  const p1 = (pad) => new HybridController(new KeyboardMouseController(input), new TouchController(touch), new GamepadController(input, pad));
  if (mode === 1) return [p1(0)];
  // Co-op: P1 on keyboard+mouse or touch (or a 2nd gamepad), P2 on the first gamepad (or arrow keys).
  return [p1(1), new HybridController(new ArrowsController(input), new GamepadController(input, 0))];
}

// Touch mode shows the on-screen controls and touch-friendly hints. It starts on for phones and
// tablets, turns on at the first touch, and off again when a real mouse moves.
function setTouchMode(on) {
  if (on === document.body.classList.contains('touch')) return;
  document.body.classList.toggle('touch', on);
  ui.touch = on;
}

// The fullscreen buttons toggle it where the browser can; on iPhones they explain the Home Screen route.
function fullscreenButton() {
  if (fullscreenSupported) toggleFullscreen();
  else ui.showFullscreenTip();
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
  records: () => ui.showRecords(game.best),
  wake: () => {
    sfx.init();
    game.powerOn();
    // phones and tablets: the first tap also goes fullscreen, since browser bars eat a small screen
    if (ui.touch && !isFullscreen()) toggleFullscreen();
  },
  back: () => ui.showTitle(game.best, sfx.muted),
  resume,
  restart: () => {
    ui.showScreen(null);
    game.restart();
  },
  quit: toTitle,
  fullscreen: fullscreenButton,
  mute: () => ui.refreshMute(sfx.toggleMute()),
  music: () => ui.refreshMusic(music.toggle()),
});

function startRun(mode, chars) {
  sfx.init();
  game.newRun(mode, chars, controllersFor(mode));
}

const touch = new TouchControls({ pause, fullscreen: fullscreenButton });
game = new Game({ canvas, ui, sfx, input });
ui.refreshMusic(music.enabled);
ui.showTitle(game.best, sfx.muted);

setTouchMode(matchMedia('(pointer: coarse)').matches);
window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && setTouchMode(true), true);
window.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && setTouchMode(false));
// the game only plays in landscape, so turning a phone upright pauses it (a "rotate" notice covers it)
matchMedia('(orientation: portrait)').addEventListener('change', (e) => e.matches && ui.touch && pause());
document.body.classList.toggle('no-fullscreen', !fullscreenSupported);
document.body.classList.toggle('standalone', standalone);
onFullscreenChange((on) => ui.refreshFullscreen(on));

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
  } else if (e.code === 'KeyN') {
    ui.refreshMusic(music.toggle());
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
    music.update(dt, game);
    game.render();
    ui.pollGamepad(input, dt);
    touch.setVisible(ui.touch && game.state === 'playing');
    if (touch.visible && game.players[0]) touch.sync(game.players[0]);
  } catch (err) {
    // One bad frame should never freeze the game; report it once and keep going.
    if (!loggedError) console.error(err);
    loggedError = true;
  }
  input.endFrame();
  touch.endFrame();
}
requestAnimationFrame(frame);

// Handy for debugging from the console.
window.__game = game;
window.__music = music;
window.__touch = touch;
