// "How to play" field guide: a tabbed screen built from the game's own data and sprites,
// so weapon stats, zombies and pickups shown here never drift from what's in the game.
import { CHARACTERS, WEAPONS } from './data.js';
import { SPR, icon } from './sprites.js';
import { CATEGORY } from './upgrades.js';
import { SPECIALS, BOSS_EVERY, SPECIAL_EVERY } from './waves.js';
import { el, pix } from './dom.js';

const TIER_WAVE = { 1: 1, 2: 3, 3: 5 }; // matches pickDropWeapon() in game.js

const ZOMBIES = [
  { id: 'walker', name: 'WALKER', wave: 1, desc: 'Slow and stubborn. The bulk of every wave.' },
  { id: 'runner', name: 'RUNNER', wave: 2, desc: 'Fast and fragile. Keep moving.' },
  { id: 'dog', name: 'ZOMBIE DOG', wave: 3, desc: 'Lunges from range. Hard to outrun.' },
  { id: 'spitter', name: 'SPITTER', wave: 4, desc: 'Keeps its distance and lobs acid.' },
  { id: 'brute', name: 'BRUTE', wave: 4, desc: 'Huge health. Shrugs off knockback.' },
  { id: 'bloater', name: 'BLOATER', wave: 6, desc: 'Explodes up close and hurts everyone nearby. Pop it early.' },
  { id: 'boss', name: 'THE ABOMINATION', wave: 5, every: true, desc: 'Charges, slams and summons. Bait it into a wall to stun it.' },
];

const ITEMS = [
  { name: 'AMMO', img: () => SPR.pickups.ammo, desc: 'Reserve ammo for your picked-up gun.' },
  { name: 'MEDKIT', img: () => SPR.pickups.health, desc: 'Heals 30 HP.' },
  { name: 'RAGE', img: () => SPR.pickups.rage, desc: 'Double damage for 10 seconds.' },
  { name: 'MAX AMMO', img: () => SPR.pickups.maxammo, desc: 'Refills every gun on the team.' },
  { name: 'ROAD FLARE', img: () => SPR.pickups.flare, desc: 'Drops more when you’re swarmed. Throw it and zombies chase it, then it pops.' },
  { name: 'WEAPON DROP', img: () => SPR.guns.shotgun.img, desc: 'Guns appear around the city. Follow the orange arrow.' },
];

const STEPS = [
  { title: 'SURVIVE THE WAVE', img: () => SPR.walker[0].frames[0], desc: 'Zombies pour in from the dark. Kill them all to end the wave.' },
  { title: 'SCAVENGE GUNS', img: () => SPR.guns.rifle.img, desc: 'Your signature gun never runs dry. Your 2nd slot holds the best gun you find.' },
  { title: 'BUILD YOUR RUN', img: () => icon('bolt'), desc: 'After each wave, pick 1 of 3 upgrade cards. Reroll if none fit.' },
  { title: 'BEAT THE BOSS', img: () => SPR.boss[0].frames[0], desc: 'The Abomination shows up every 5th wave.' },
];

const TIPS = [
  'Dashing makes you briefly untouchable. Use it to slip through gaps in the horde.',
  'Walking over a gun picks it up if your slot is empty or it’s the same gun. A different gun needs a button press, and you drop the old one.',
  'When your found gun runs dry you switch back to your signature gun automatically.',
  'In co-op, stand next to a downed friend to revive them before they bleed out. Mara does it twice as fast.',
  'Your flashlight follows your aim and walls block it. Glowing eyes give zombies away in the dark.',
];

const CONTROLS = [
  {
    title: 'PLAYER 1 · KEYBOARD + MOUSE',
    rows: [
      [['W A S D'], 'move'],
      [['MOUSE'], 'aim', ['LEFT CLICK'], 'shoot'],
      [['Q', 'RIGHT CLICK'], 'ability'],
      [['SPACE', 'L-SHIFT'], 'dash'],
      [['R'], 'reload'],
      [['E', 'WHEEL', '1', '2'], 'swap gun'],
      [['F'], 'pick up gun', ['G'], 'road flare'],
    ],
  },
  {
    title: 'PLAYER 2 · ARROWS (AUTO-AIM)',
    rows: [
      [['ARROWS'], 'move'],
      [['ENTER'], 'shoot (aims for you)'],
      [['/'], 'ability', ['R-SHIFT'], 'dash'],
      [['.'], 'reload', [','], 'swap gun'],
      [[';'], 'pick up gun', ["'"], 'road flare'],
    ],
  },
  {
    title: 'GAMEPAD (EITHER PLAYER)',
    rows: [
      [['L-STICK'], 'move', ['R-STICK'], 'aim'],
      [['RT'], 'shoot', ['LT', 'LB'], 'ability'],
      [['A'], 'dash', ['Y'], 'swap gun'],
      [['X'], 'reload / pick up gun'],
      [['B'], 'road flare', ['START'], 'pause'],
    ],
  },
  {
    title: 'TOUCH (PHONES AND TABLETS)',
    rows: [
      [['LEFT SIDE'], 'drag to move'],
      [['RIGHT SIDE'], 'drag to aim, push further to shoot'],
      ['Buttons by your right thumb: dash, ability, reload (TAKE when a gun is in reach), swap gun and road flare.'],
      [['II'], 'pause'],
    ],
  },
];

// 1-5 ratings for the weapon cards, derived from the real numbers in data.js.
const rate = (v, steps) => 1 + steps.filter((s) => v > s).length;
function weaponBars(w) {
  const perShot = w.dmg * w.pellets + (w.splash || 0);
  return [
    ['DMG', w.projectile === 'flame' ? 2 : rate(perShot, [12, 20, 40, 75])],
    ['RATE', rate(w.rate, [1.5, 3.5, 7, 12])],
    ['RANGE', rate(w.range, [90, 150, 250, 330])],
  ];
}

// Scale a sprite so it fills roughly `h` game pixels of height (but never past 3x).
const fit = (img, h) => Math.min(3, Math.max(1, Math.floor(h / img.height)));

function kbdRow(parts) {
  const p = el('p', 'g-ctl');
  for (const part of parts) {
    if (Array.isArray(part)) part.forEach((k, i) => p.append(el('kbd', '', k), i < part.length - 1 ? ' ' : ''));
    else p.append(` ${part} `);
  }
  return p;
}

// ------------------------------------------------------------------ tabs
function basicsTab() {
  const box = el('div', 'g-basics');
  const steps = el('div', 'g-steps');
  STEPS.forEach((s, i) => {
    const c = el('div', 'g-card g-step');
    c.append(el('span', 'g-num', String(i + 1)));
    const art = el('div', 'g-art');
    art.append(pix(s.img(), fit(s.img(), 32)));
    c.append(art, el('div', 'g-title', s.title), el('div', 'g-desc', s.desc));
    steps.append(c);
  });
  const tips = el('ul', 'g-tips');
  for (const t of TIPS) tips.append(el('li', '', t));
  box.append(steps, el('h3', 'g-sub', 'SURVIVAL TIPS'), tips);
  return box;
}

function survivorsTab() {
  const grid = el('div', 'g-grid g-survivors');
  for (const c of Object.values(CHARACTERS)) {
    const card = el('div', 'g-card g-survivor');
    card.style.setProperty('--oc', c.color);
    const head = el('div', 'g-shead');
    const art = el('div', 'g-art');
    art.append(pix(SPR.players[c.id].frames[0], 3));
    const who = el('div', 'g-who');
    who.append(el('div', 'g-title g-name', c.name), el('div', 'g-desc', c.title));
    const bars = el('div', 'g-bars');
    for (const [label, n] of [['HP', c.bars.hp], ['SPEED', c.bars.speed], ['POWER', c.bars.power]]) {
      const row = el('div', 'g-bar');
      row.append(el('span', '', label));
      const seg = el('span', 'g-segs');
      for (let i = 0; i < 5; i++) seg.append(el('i', i < n ? 'on' : ''));
      row.append(seg);
      bars.append(row);
    }
    who.append(bars);
    head.append(art, who);
    const kit = (img, title, desc) => {
      const row = el('div', 'g-kit');
      const ic = el('div', 'g-kit-icon');
      ic.append(img);
      const txt = el('div');
      txt.append(el('div', 'g-title', title), el('div', 'g-desc', desc));
      row.append(ic, txt);
      return row;
    };
    card.append(
      head,
      kit(pix(SPR.guns[c.weapon].img, 1), WEAPONS[c.weapon].name, WEAPONS[c.weapon].desc),
      kit(pix(icon(c.abilityIcon), 1), `${c.abilityName} · ${c.abilityCd}S`, c.abilityDesc),
      el('div', 'g-desc g-perk', c.passive),
    );
    grid.append(card);
  }
  return grid;
}

function weaponsTab() {
  const grid = el('div', 'g-grid g-weapons');
  for (const [id, w] of Object.entries(WEAPONS)) {
    const owner = w.signature && Object.values(CHARACTERS).find((c) => c.weapon === id);
    const c = el('div', `g-card g-weapon${owner ? ' signature' : ''}`);
    if (owner) c.style.setProperty('--oc', owner.color);
    c.append(el('span', 'g-badge', owner ? `${owner.name} · SIGNATURE` : `WAVE ${TIER_WAVE[w.tier]}+`));
    const top = el('div', 'g-wtop');
    const art = el('div', 'g-art');
    art.append(pix(SPR.guns[id].img, 2));
    const bars = el('div', 'g-bars');
    for (const [label, n] of weaponBars(w)) {
      const row = el('div', 'g-bar');
      row.append(el('span', '', label));
      const seg = el('span', 'g-segs');
      for (let i = 0; i < 5; i++) seg.append(el('i', i < n ? 'on' : ''));
      row.append(seg);
      bars.append(row);
    }
    top.append(art, bars);
    c.append(top, el('div', 'g-title', w.name), el('div', 'g-desc', w.desc));
    grid.append(c);
  }
  return grid;
}

function zombiesTab() {
  const grid = el('div', 'g-grid g-zombies');
  for (const z of ZOMBIES) {
    const c = el('div', `g-card g-zombie${z.id === 'boss' ? ' boss' : ''}`);
    c.append(el('span', 'g-badge', z.every ? 'EVERY 5TH WAVE' : `WAVE ${z.wave}+`));
    // same scale for every zombie so their real sizes compare
    const img = SPR[z.id][0].frames[0];
    const art = el('div', 'g-art');
    art.append(pix(img, 2));
    c.append(art, el('div', 'g-title', z.name), el('div', 'g-desc', z.desc));
    grid.append(c);
  }
  return grid;
}

const WAVE_RULES = [
  { title: 'EVERY WAVE', img: () => SPR.walker[0].frames[0], desc: 'Bigger and tougher than the last. Clear it to pick an upgrade.' },
  { title: 'BOSS WAVES', img: () => SPR.boss[0].frames[0], desc: `Every ${BOSS_EVERY}th wave brings the Abomination. From wave 10, two of them.` },
  { title: 'SPECIAL WAVES', img: () => icon('bolt', { y: '#9aa8ff', Y: '#5a6ad8' }), desc: `Every ${SPECIAL_EVERY}rd wave from wave ${SPECIAL_EVERY} twists the rules. Survive it for a double bonus.` },
];
// which sprite stands in for each special wave in the guide
const SPECIAL_ART = { blackout: () => SPR.walker[2].frames[0], rush: () => SPR.dog[0].frames[0], fog: () => SPR.spitter[0].frames[0], tank: () => SPR.brute[0].frames[0] };

function wavesTab() {
  const box = el('div', 'g-waves');
  const rules = el('div', 'g-grid g-rules');
  for (const r of WAVE_RULES) {
    const c = el('div', 'g-card g-rule');
    const art = el('div', 'g-art');
    art.append(pix(r.img(), fit(r.img(), 32)));
    const txt = el('div', 'g-text');
    txt.append(el('div', 'g-title', r.title), el('div', 'g-desc', r.desc));
    c.append(art, txt);
    rules.append(c);
  }
  const grid = el('div', 'g-grid g-specials');
  for (const [id, sp] of Object.entries(SPECIALS)) {
    const c = el('div', `g-card g-special sp-${id}`);
    c.style.setProperty('--sc', sp.color);
    c.append(el('span', 'g-badge', `WAVE ${sp.from}+`));
    const art = el('div', 'g-art');
    art.append(pix(SPECIAL_ART[id](), 2));
    c.append(art, el('div', 'g-title', sp.name), el('div', 'g-desc', sp.desc));
    grid.append(c);
  }
  box.append(rules, el('h3', 'g-sub', 'SPECIAL WAVES'), grid);
  return box;
}

function itemsTab() {
  const box = el('div', 'g-items');
  const grid = el('div', 'g-grid g-pickups');
  for (const it of ITEMS) {
    const c = el('div', 'g-card g-item');
    const art = el('div', 'g-art');
    art.append(pix(it.img(), 2));
    const txt = el('div', 'g-text');
    txt.append(el('div', 'g-title', it.name), el('div', 'g-desc', it.desc));
    c.append(art, txt);
    grid.append(c);
  }
  // upgrade cards: what the colors and frames mean
  const legend = el('div', 'g-legend');
  const cats = el('div', 'g-cats');
  for (const [id, c] of Object.entries(CATEGORY)) {
    const chip = el('span', `g-cat c-${id}`);
    chip.append(el('i'), c.label);
    cats.append(chip);
  }
  const frames = el('div', 'g-frames');
  for (const [cls, label, pipsN] of [['common', 'COMMON', 1], ['rare', 'RARE', 2], ['epic', 'EPIC', 3]]) {
    const f = el('span', `g-frame r-${cls}`);
    f.append(el('b', '', '◆'.repeat(pipsN)), label);
    frames.append(f);
  }
  const trade = el('span', 'g-frame trade', 'TRADE-OFF');
  frames.append(trade);
  legend.append(
    el('div', 'g-desc', 'Upgrade cards are colored by what they boost:'), cats,
    el('div', 'g-desc', 'Fancier frames are rarer. Striped cards trade a downside for a big upside:'), frames,
  );
  box.append(grid, el('h3', 'g-sub', 'UPGRADE CARDS'), legend);
  return box;
}

function controlsTab() {
  const grid = el('div', 'g-controls');
  for (const col of CONTROLS) {
    const c = el('div', 'g-card g-ctlcol');
    c.append(el('div', 'g-title', col.title));
    for (const row of col.rows) c.append(kbdRow(row));
    grid.append(c);
  }
  const foot = el('div', 'g-desc g-foot');
  foot.append(kbdRow([['ESC', 'P'], 'pause', ['M'], 'mute', ['N'], 'music']));
  return [grid, foot];
}

export const GUIDE_TABS = [
  { id: 'basics', label: 'BASICS', build: basicsTab },
  { id: 'survivors', label: 'SURVIVORS', build: survivorsTab },
  { id: 'weapons', label: 'WEAPONS', build: weaponsTab },
  { id: 'zombies', label: 'ZOMBIES', build: zombiesTab },
  { id: 'waves', label: 'WAVES', build: wavesTab },
  { id: 'items', label: 'ITEMS', build: itemsTab },
  { id: 'controls', label: 'CONTROLS', build: controlsTab },
];

// Fill the tab bar and body once; tabs switch by showing one panel at a time.
export function buildGuide(tabBar, body, onSelect) {
  tabBar.innerHTML = '';
  body.innerHTML = '';
  const tabs = GUIDE_TABS.map((t) => {
    const btn = el('button', 'btn small g-tab', t.label);
    btn.dataset.tab = t.id;
    const panel = el('div', `g-panel g-${t.id}-panel`);
    const content = t.build();
    for (const node of [].concat(content)) panel.append(node);
    // focusing a tab (keys, gamepad or hover) is enough to switch to it
    btn.addEventListener('focus', () => onSelect(t.id));
    btn.addEventListener('click', () => onSelect(t.id));
    tabBar.append(btn);
    body.append(panel);
    return { id: t.id, btn, panel };
  });
  return tabs;
}
