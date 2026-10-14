// Player settings: volumes, screen shake, the red hurt flash and keyboard bindings. Saved in the
// browser and shown on the Settings screen (ui.js). Mute (M) and music on/off (N) live in audio.js
// and music.js, as before.
import { storage } from './utils.js';

const KEY = 'll_settings';

// Everything the keyboard can be rebound for. P1 also aims and shoots with the mouse (plus right
// click for the ability, the wheel to swap and 1/2 to pick a gun), which aren't rebindable.
export const ACTIONS = [
  { id: 'up', label: 'MOVE UP' },
  { id: 'down', label: 'MOVE DOWN' },
  { id: 'left', label: 'MOVE LEFT' },
  { id: 'right', label: 'MOVE RIGHT' },
  { id: 'fire', label: 'SHOOT', p2Only: true },
  { id: 'ability', label: 'ABILITY' },
  { id: 'dash', label: 'DASH' },
  { id: 'reload', label: 'RELOAD' },
  { id: 'swap', label: 'SWAP GUN' },
  { id: 'pickup', label: 'PICK UP GUN' },
  { id: 'flare', label: 'ROAD FLARE' },
];

export const DEFAULT_KEYS = {
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], ability: ['KeyQ'], dash: ['Space', 'ShiftLeft'],
    reload: ['KeyR'], swap: ['KeyE'], pickup: ['KeyF'], flare: ['KeyG'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter', 'NumpadEnter', 'Numpad0'],
    ability: ['Slash'], dash: ['ShiftRight'], reload: ['Period'], swap: ['Comma'], pickup: ['Semicolon'], flare: ['Quote'],
  },
};

// Keys the whole game already uses: pause, mute, music, and P1's direct gun picks.
export const RESERVED = { Escape: 'PAUSE', KeyP: 'PAUSE', KeyM: 'MUTE', KeyN: 'MUSIC', Digit1: 'GUN 1', Digit2: 'GUN 2' };

export const SHAKE_LEVELS = [
  { label: 'FULL', k: 1 },
  { label: 'LOW', k: 0.4 },
  { label: 'OFF', k: 0 },
];

const copyKeys = (keys) => ({ p1: { ...keys.p1 }, p2: { ...keys.p2 } });

function load() {
  const saved = storage.get(KEY, {});
  const s = { sfx: 1, music: 1, shake: 0, flash: true, ...saved, keys: copyKeys(DEFAULT_KEYS) };
  // keep saved bindings, but only for actions that still exist (so new actions get their default)
  for (const scheme of ['p1', 'p2']) {
    for (const [action, codes] of Object.entries(saved.keys?.[scheme] || {})) {
      if (action in s.keys[scheme] && Array.isArray(codes) && codes.length) s.keys[scheme][action] = codes;
    }
  }
  return s;
}

export const settings = load();

export function saveSettings() {
  storage.set(KEY, settings);
}

// How much the camera shakes (1 = full).
export const shakeScale = () => SHAKE_LEVELS[settings.shake]?.k ?? 1;

// Which scheme/action a key is bound to, if any.
export function boundTo(code) {
  for (const scheme of ['p1', 'p2']) {
    for (const [action, codes] of Object.entries(settings.keys[scheme])) if (codes.includes(code)) return { scheme, action };
  }
  return null;
}

// Bind `code` as the only key for an action. If another action (either player's) had that key, the
// two swap, so nothing is ever left without a key. Returns the action it was taken from, if any.
export function bindKey(scheme, action, code) {
  const keys = settings.keys;
  const prev = keys[scheme][action];
  let other = boundTo(code);
  if (other?.scheme === scheme && other.action === action) other = null;
  if (other) {
    // it keeps its other keys if it has any (dash has two), otherwise it gets this action's old key
    const left = keys[other.scheme][other.action].filter((c) => c !== code);
    keys[other.scheme][other.action] = left.length ? left : [prev[0]];
  }
  keys[scheme][action] = [code];
  saveSettings();
  return other;
}

export function resetKeys() {
  settings.keys = copyKeys(DEFAULT_KEYS);
  saveSettings();
}

// ------------------------------------------------------------------ key names
// Names follow the player's keyboard layout where the browser can tell (Chrome and Edge): on an
// AZERTY keyboard the default "up" key shows as Z, not W.
let layout = null;
navigator.keyboard?.getLayoutMap?.().then((m) => (layout = m)).catch(() => {});

const NAMES = {
  Space: ['SPACE', 'SPC'], ShiftLeft: ['L-SHIFT', 'LSH'], ShiftRight: ['R-SHIFT', 'RSH'], ControlLeft: ['L-CTRL', 'LCT'],
  ControlRight: ['R-CTRL', 'RCT'], AltLeft: ['L-ALT', 'LAL'], AltRight: ['R-ALT', 'RAL'], Enter: ['ENTER', 'ENT'],
  NumpadEnter: ['NUM ENTER', 'ENT'], Tab: ['TAB', 'TAB'], Backspace: ['BACKSPACE', 'BKS'], CapsLock: ['CAPS', 'CAP'],
  ArrowUp: ['UP', 'UP'], ArrowDown: ['DOWN', 'DN'], ArrowLeft: ['LEFT', 'LT'], ArrowRight: ['RIGHT', 'RT'],
  Insert: ['INSERT', 'INS'], Delete: ['DELETE', 'DEL'], Home: ['HOME', 'HOM'], End: ['END', 'END'], PageUp: ['PAGE UP', 'PGU'],
  PageDown: ['PAGE DOWN', 'PGD'], Slash: ['/'], Period: ['.'], Comma: [','], Semicolon: [';'], Quote: ["'"],
  BracketLeft: ['['], BracketRight: [']'], Backslash: ['\\'], Minus: ['-'], Equal: ['='], Backquote: ['`'],
};

// `short`: at most 3 characters, for the HUD and in-world prompts.
export function keyLabel(code, short = false) {
  const named = NAMES[code];
  const fromLayout = layout?.get(code);
  if (fromLayout && fromLayout.trim() && (!named || named.length === 1)) return fromLayout.toUpperCase();
  if (named) return named[short ? named.length - 1 : 0];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return short ? `N${code.slice(6, 8)}` : `NUM ${code.slice(6).toUpperCase()}`;
  return short ? code.slice(0, 3).toUpperCase() : code.toUpperCase();
}

// The first key bound to an action, as a label (for hints like "F: SHOTGUN").
export const actionKey = (scheme, action, short = true) => keyLabel(settings.keys[scheme][action][0], short);
