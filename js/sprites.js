// All pixel art lives here, authored as palette-indexed strings and baked into canvases at boot.
import { makeCanvas } from './utils.js';

const O = '#120e14'; // universal outline

export function buildSprite(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [c, ctx] = makeCanvas(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export function flipH(src) {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

export function tint(src, color, alpha = 1) {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, src.width, src.height);
  return c;
}

export function rotate90(src, dir = 1) {
  const [c, ctx] = makeCanvas(src.height, src.width);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// A sprite "set": frames + mirrored + white hit-flash versions.
function makeSet(frames, extra = {}) {
  return {
    frames,
    flipped: frames.map(flipH),
    white: frames.map((f) => tint(f, '#ffffff')),
    whiteFlipped: frames.map((f) => flipH(tint(f, '#ffffff'))),
    w: frames[0].width,
    h: frames[0].height,
    ...extra,
  };
}

// ---------------------------------------------------------------- humanoids (12 x 16)

const LEGS = [
  ['..oPPooPPo..', '..oPPooPPo..', '..oFFooFFo..'],
  ['..oPPooPPo..', '..oFFooPPo..', '..ooo.oFFo..'],
  ['..oPPooPPo..', '..oPPooFFo..', '..oFFo.ooo..'],
];

const HEAD_RED = [
  '...oooooo...',
  '..oTTTTTTo..',
  '.oTTTTTTTTo.',
  'oVVVVVVVVVVo',
  '.oHSSSSSSHo.',
  '.oHSESSESHo.',
  '.oHSSSSSSHo.',
  '.oHHSSSSHHo.',
  '..oHooooHo..',
];
const BODY_RED = ['..oBBBBBBo..', '.oBBBbbBBBo.', '.oSBBBBBBSo.', '..oPPPPPPo..'];

const HEAD_BRUNO = [
  '...oooooo...',
  '..oTTTTTTo..',
  '.oTTTTTTTTo.',
  '.oVVVVVVVVo.',
  '.oSSSSSSSSo.',
  '.oSESSSSESo.',
  '.oMSSSSSSMo.',
  '.oMMMSSMMMo.',
  '..oMMMMMMo..',
];
const BODY_BRUNO = ['.oBBBBBBBBo.', '.oBBBbbBBBo.', '.oSBBBBBBSo.', '..oPPPPPPo..'];

// Mara: dark hair up in a bun, white coat over teal scrubs, red cross on the chest
const HEAD_MARA = [
  '....oooo....',
  '...oHHHHo...',
  '..oHHHHHHo..',
  '.oHHHHHHHHo.',
  '.oHSSSSSSHo.',
  '.oHSESSESHo.',
  '.oHSSSSSSHo.',
  '..oSSssSSo..',
  '...oooooo...',
];
const BODY_MARA = ['.oWWBBBBWWo.', '.oWWBrrBWWo.', '.oSWWWWWWSo.', '..oPPPPPPo..'];

// Ivy: yellow hard hat, black ponytail out the back, hi-vis vest
const HEAD_IVY = [
  '...oooooo...',
  '..oYYYYYYo..',
  '.oYYYYYYYYo.',
  'oyyyyyyyyyyo',
  '.oKSSSSSSKo.',
  '.oKSESSESKoo',
  '.oKSSSSSSKKo',
  '..oSSSSSSoKo',
  '...oooooo.oo',
];
const BODY_IVY = ['..oOOOOOOo..', '.oOwwwwwwOo.', '.oSOOOOOOSo.', '..oPPPPPPo..'];

const HEAD_ZOMBIE = [
  '...oooooo...',
  '..oSHSSHSo..',
  '.oSSSsSSSSo.',
  '.oSSSSSSsSo.',
  '.oSEESSEESo.',
  '.oSSSSSSSSo.',
  '.oSSmmmmSSo.',
  '.osSSSSSSso.',
  '..oossssoo..',
];
const BODY_ZOMBIE = ['..oBBBBBooo.', '.oBBrBBBSSSo', '.obBBBBBSSo.', '..oPPPPPoo..'];

const PAL_RED = {
  o: O, T: '#58652f', V: '#353e1c', H: '#c43b2b', S: '#f3c29c', s: '#d99a78', E: '#1b1b26',
  B: '#3f5a33', b: '#2c4125', P: '#2b2f3b', F: '#191517',
};
const PAL_BRUNO = {
  o: O, T: '#2a2b33', V: '#4b4f60', S: '#d6a07a', s: '#b67f5e', E: '#1b1b26', M: '#3b2618',
  B: '#34475f', b: '#26344a', P: '#2a2a2e', F: '#191517',
};

const PAL_MARA = {
  o: O, H: '#3a2418', S: '#e8b48c', s: '#c98f6a', E: '#1b1b26',
  W: '#e8eef0', B: '#3fa58e', r: '#d83a3a', P: '#2f5560', F: '#191517',
};
const PAL_IVY = {
  o: O, Y: '#f2c14e', y: '#b8862b', K: '#1a1418', S: '#c98a62', E: '#1b1b26',
  O: '#e8702a', w: '#f0e8a0', P: '#3a3e4a', F: '#191517',
};

function humanoid(head, body, pal) {
  return LEGS.map((legs) => buildSprite([...head, ...body, ...legs], pal));
}

// ---------------------------------------------------------------- big zombies (16 x 20)

const BRUTE_TOP = [
  '.....oooooo.....',
  '....oSSSSSSo....',
  '...oSSSSSSSSo...',
  '...oSEESSEESo...',
  '...oSSSSSSSSo...',
  '...oSSmmmmSSo...',
  '..ooosSSSSsooo..',
  '.oSSoBBBBBBoSSo.',
  'oSSSBBBBBBBBSSSo',
  'oSSBBBBBBBBBBSSo',
  'oSSBBBBsSBBBBSSo',
  'oSSBBBsSSsBBBSSo',
  'oSSBBBBsSBBBBSSo',
  'oSoBBBBBBBBBBoSo',
  'oSooBBBBBBBBooSo',
  '.o..oPPPPPPo..o.',
];
const BRUTE_LEGS = [
  ['....oPPooPPo....', '....oPPooPPo....', '....oFFooFFo....', '................'],
  ['....oPPooPPo....', '....oFFooPPo....', '....ooo.oFFo....', '................'],
  ['....oPPooPPo....', '....oPPooFFo....', '....oFFo.ooo....', '................'],
];

// ---------------------------------------------------------------- dog (14 x 10)

const DOG = [
  [
    '..........oo..',
    '.........oDDo.',
    'o.......oDDEDo',
    'Do.oooooDDDDDo',
    '.oDDDDDDDDDmmo',
    '.oDDDDDDDDDoo.',
    '..oDDDDDDDo...',
    '..oDooooDDo...',
    '..oDo..oDo....',
    '..oo...oo.....',
  ],
  [
    '..........oo..',
    '.........oDDo.',
    'o.......oDDEDo',
    'Do.oooooDDDDDo',
    '.oDDDDDDDDDmmo',
    '.oDDDDDDDDDoo.',
    '..oDDDDDDDo...',
    '..oDooooDo....',
    '.oDo....oDo...',
    '.oo......oo...',
  ],
];

// ---------------------------------------------------------------- boss (24 x 26)

const BOSS_TOP = [
  '........oooooooo........',
  '.......oSSSSSSSSo.......',
  '......oSSSSSSSSSSo......',
  '......oSEESSSSEESo......',
  '......oSSSSSSSSSSo......',
  '......oSSmmmmmmSSo......',
  '....oooSSmWmWmSSooo.....',
  '..ooSSSSSSSSSSSSSSSSoo..',
  '.oSSSSrrSSSSSSSSrrSSSSo.',
  'oSSSSSSrSrSrSrSrSSSSSSSo',
  'oSSSSSSSrSrSrSrSSSSSSSSo',
  'oSSSoSSSSSSSSSSSSSSoSSSo',
  'oSSSooSSSSSSSSSSSSooSSSo',
  'oSSSo.oBBBBBBBBBBo.oSSSo',
  'oSSSo.oBBBBBBBBBBo.oSSSo',
  'oSSSo.oBBBBBBBBBBo.oSSSo',
  'oSSSSo.oBBBBBBBBo.oSSSSo',
  'oSSSSo.oBBBBBBBBo.oSSSSo',
  'oSSSSSo.oBBBBBBo.oSSSSSo',
  'oCCCCCo.oPPPPPPo.oCCCCCo',
  '.oCoCo..oPPPPPPo..oCoCo.',
];
const BOSS_LEGS = [
  ['........oPPPooPPPo......', '.......oPPPo..oPPPo.....', '.......oPPPo..oPPPo.....', '.......oFFFo..oFFFo.....', '.......ooooo..ooooo.....'],
  ['........oPPPooPPPo......', '.......oPPPo..oPPPo.....', '.......oFFFo..oPPPo.....', '.......ooooo..oFFFo.....', '..............ooooo.....'],
  ['........oPPPooPPPo......', '.......oPPPo..oPPPo.....', '.......oPPPo..oFFFo.....', '.......oFFFo..ooooo.....', '.......ooooo............'],
];

// ---------------------------------------------------------------- zombie palettes

const SHIRTS = [
  ['#4f6180', '#3a4760'],
  ['#735236', '#553b26'],
  ['#6a2a2a', '#4d1d1d'],
  ['#4d4d52', '#38383c'],
  ['#857b55', '#645c3f'],
  ['#3f6a64', '#2d4d49'],
];
const PANTS = ['#2f3340', '#3b3326', '#29303a', '#403838'];
const SKINS = [
  ['#7f9a62', '#5d7447'],
  ['#8e9e74', '#6a7852'],
  ['#72896a', '#55674f'],
];

function zombiePal(skin, shirt, pants, extra = {}) {
  return {
    o: O, S: skin[0], s: skin[1], H: '#2e2a22', E: '#f5e56b', m: '#4a1010', r: '#7a1616',
    B: shirt[0], b: shirt[1], P: pants, F: '#1a1714', ...extra,
  };
}

// ---------------------------------------------------------------- weapons (point right)

const GUN_PAL = {
  o: O, G: '#8a93a3', g: '#4a505c', k: '#25272d', w: '#6b4226', W: '#8e5b33', r: '#b8342f', y: '#d9b43a', e: '#556b2f',
  b: '#4fb2ff', c: '#c8f0ff', f: '#ff8a2a',
};
export const GUN_ART = {
  twinpistols: {
    rows: [
      'oooooooo..',
      'oGGGGGGo..',
      'oggoooooo.',
      'ogoGGGGGGo',
      'oooggooooo',
      '..ogo.....',
      '..ooo.....',
    ],
    pivot: [2, 3],
  },
  nailgun: {
    rows: [
      '.ooooooooo..',
      'oyyyyyyGGooo',
      'oyyyyyyGGGko',
      'oooyyoooooo.',
      '..oyyo......',
      '..oooo......',
    ],
    pivot: [3, 3],
  },
  carbine: {
    rows: [
      '....oo.......',
      'ooooGGooooooo',
      'owwggggggggGo',
      'owoogoooooooo',
      'oo.ogo.......',
      '...ooo.......',
    ],
    pivot: [4, 3],
  },
  sawedoff: {
    rows: ['oooooooooooo', 'oWwwgGGGGGGo', 'oWwwgggggggo', 'ooWwoooooooo', '.oooo.......'],
    pivot: [4, 2],
  },
  rifle: {
    rows: [
      '....ooo........',
      'ooooGGGoooooooo',
      'owwwggggggggggo',
      'owoooggoooooooo',
      'oo...ooo.......',
    ],
    pivot: [5, 3],
  },
  shotgun: {
    rows: ['ooooooooooooooo', 'owwwwgggGGGGGGo', 'oWWwoowwwwwoooo', 'ooooo.ooooo....'],
    pivot: [5, 2],
  },
  smg: {
    rows: ['..oooooooo', 'ooGGGGGGGo', 'okggggggoo', 'oooggoo...', '...ggo....', '...ooo....'],
    pivot: [3, 3],
  },
  flamer: {
    rows: [
      '.oooooo........',
      'orrrrrro.......',
      'oyrrrrrooooooo.',
      'orrrrrrogggGGfo',
      'oooooooggooooo.',
      '......ogo......',
      '......ooo......',
    ],
    pivot: [7, 4],
  },
  sniper: {
    rows: [
      '.....oooooo........',
      '.....okkkbo........',
      'ooooooooggooooooooo',
      'owwwwggggggggggggGo',
      'owooowoooooooooooo.',
      'oo..oo.............',
    ],
    pivot: [6, 4],
  },
  tesla: {
    rows: [
      '..ooooooo....',
      '.ocbcbcbco...',
      'oggggggggggoo',
      'okkgggggggcbo',
      'oooggoooooooo',
      '..oggo.......',
      '..oooo.......',
    ],
    pivot: [4, 4],
  },
  launcher: {
    rows: [
      '.oooooooooo..',
      'oegggeeeeeeoo',
      'oeeeeeeeeeego',
      'oooogoooooooo',
      '...ogo.......',
      '...ooo.......',
    ],
    pivot: [5, 3],
  },
  rocket: {
    rows: [
      '.....ooooo.......',
      'oooooeeeeeooooooo',
      'oyyeeeeeeeeeeeeeo',
      'oooooeoooeoooooo.',
      '.....ooo.oo......',
    ],
    pivot: [6, 3],
  },
  minigun: {
    rows: [
      '....oooooooooooo',
      'ooooggggGGGGGGGo',
      'okkkggggoooooooo',
      'okkkggggGGGGGGGo',
      'ooooggggoooooooo',
      '...oooo.........',
    ],
    pivot: [5, 3],
  },
};

// ---------------------------------------------------------------- icons (upgrade cards / HUD)

const ICON_PAL = {
  o: O, y: '#f2c14e', Y: '#b8862b', r: '#e04444', R: '#8e2020', w: '#f1eee6', g: '#9aa0aa', G: '#5a5f69',
  b: '#5ab0ff', B: '#2a5c9a', e: '#6fcf5a', E: '#2f7a2a', f: '#ff8a2a', p: '#c07bff', k: '#2a2a30',
};
const ICONS = {
  bullet: ['...oo...', '..oyyo..', '..oyyo..', '..oYYo..', '..oYYo..', '..oYYo..', '..oooo..'],
  bolt: ['....ooo.', '...oyyo.', '..oyyo..', '.oyyyyo.', '.oooyyo.', '...oyo..', '..oyo...', '..oo....'],
  heart: ['.oo.oo.', 'orrorro', 'orwrrro', 'orrrrro', '.orrro.', '..oro..', '...o...'],
  boot: ['..ooo...', '..ogo...', '..ogo...', '..oggoo.', '.ogggggo', '.oGGGGGo', '.oooooo.'],
  clock: ['..oooo..', '.owwwwo.', 'owwowwwo', 'owwowwwo', 'owwoowwo', 'owwwwwwo', '.owwwwo.', '..oooo..'],
  shield: ['oooooooo', 'obbbbBBo', 'obbbbBBo', 'obbbbBBo', '.obbBBo.', '.obbBBo.', '..obBo..', '...oo...'],
  flame: ['...o....', '..ofo...', '..offo..', '.ofyffo.', 'ofyyyfo.', 'ofyYyfo.', '.ofyfo..', '..ooo...'],
  snow: ['...b...', '.b.b.b.', '..bwb..', 'bbwwwbb', '..bwb..', '.b.b.b.', '...b...'],
  skull: ['.ooooo.', 'owwwwwo', 'ooowooo', 'owwowwo', '.owwwo.', '.owowo.', '..ooo..'],
  cross: ['..rrr..', '.r.w.r.', 'r..w..r', 'rww.wwr', 'r..w..r', '.r.w.r.', '..rrr..'],
  saw: ['..o.o..', '.ogggo.', 'oggGggo', '.gGoGg.', 'oggGggo', '.ogggo.', '..o.o..'],
  drone: ['g.....g', 'ogo.ogo', '..ooo..', '.obbbo.', '.obwbo.', '..ooo..'],
  bomb: ['.....y.', '....yo.', '..ooo..', '.oGGGo.', 'oGwGGGo', 'oGGGGGo', 'oGGGGGo', '.ooooo.'],
  plus: ['..ooo..', '..oeo..', 'oooeooo', 'oeeeeeo', 'oooeooo', '..oeo..', '..ooo..'],
  medkit: ['.ooooo.', 'owwwwwo', 'owwrwwo', 'owrrrwo', 'owwrwwo', 'owwwwwo', '.ooooo.'],
  bullets: ['.o..o..o', 'oyooyooy', 'oyooyooy', 'oYooYooY', 'oYooYooY', 'oooooooo'],
  magnet: ['ww..ww', 'rr..bb', 'rr..bb', 'rr..bb', 'rrrbbb', '.rrbb.'],
  arrow: ['....o...', '....oo..', 'ooooowo.', 'owwwwwwo', 'ooooowo.', '....oo..', '....o...'],
  zigzag: ['o.....o', 'wo...ow', '.wo.ow.', '..wow..', '...w...'],
  burst: ['o..y..o', '.o.y.o.', '..yyy..', 'yyywyyy', '..yyy..', '.o.y.o.', 'o..y..o'],
  drop: ['...o...', '..oro..', '..oro..', '.orrro.', 'orrwrro', 'orrrrro', '.orrro.', '..ooo..'],
  diamond: ['...o...', '..obo..', '.obwbo.', 'obbwbbo', '.obbbo.', '..obo..', '...o...'],
  dash: ['........', 'ww.wwww.', '........', '.wwwwwwo', '........', 'ww.wwww.'],
  fist: ['.oooo..', 'owwwwo.', 'owwwwwo', 'owwwwwo', '.owwwwo', '..oooo.'],
  radar: ['..ooo..', '.oEEEo.', 'oEEEyEo', 'oEEeEEo', 'oEeEEEo', '.oEEEo.', '..ooo..'],
  flare: ['.....y.', '....yw.', '....ofo', '...oRro', '..oRro.', '.oRro..', '.ooo...'],
  gear: ['..o.o..', '.ogggo.', 'oggoggo', '.gowog.', 'oggoggo', '.ogggo.', '..o.o..'],
};

// Build an icon, optionally overriding palette letters (e.g. recolor bolt to blue for chain lightning).
export function icon(name, overrides) {
  return buildSprite(ICONS[name] || ICONS.skull, { ...ICON_PAL, ...(overrides || {}) });
}

// ---------------------------------------------------------------- pickups & misc

const PICKUPS = {
  ammo: {
    rows: ['.oooooooo.', 'oeeeeeeeeo', 'oeyEyEyEeo', 'oeeeeeeeeo', 'oEEEEEEEEo', '.oooooooo.'],
    pal: { o: O, e: '#5b6b35', E: '#3f4a24', y: '#e8c24a' },
  },
  health: {
    rows: ['.oooooooo.', 'owwwwwwwwo', 'owwwrrwwwo', 'owwrrrrwwo', 'owwwrrwwwo', 'oggggggggo', '.oooooooo.'],
    pal: { o: O, w: '#eeeae0', r: '#d83a3a', g: '#b8b4a8' },
  },
  rage: {
    rows: ['.ooooo.', 'orrrrro', 'oooroo.', 'orrorro', '.orrro.', '.ororo.', '..ooo..'],
    pal: { o: O, r: '#ff3b3b' },
  },
  flare: {
    rows: ['.oooooooo..', 'orRrRrRrRoo', 'orrrrrrrrwy', '.oooooooo..'],
    pal: { o: O, r: '#d8342a', R: '#8e1c18', w: '#f1eee6', y: '#ffd24a' },
  },
  maxammo: {
    rows: ['oooooooooo', 'oyYoyYoyYo', 'oyYoyYoyYo', 'oyYoyYoyYo', 'oooooooooo'],
    pal: { o: O, y: '#ffe07a', Y: '#c9942e' },
  },
};

const GRENADE = { rows: ['.oo.', 'oeeo', 'oEeo', '.oo.'], pal: { o: O, e: '#5f7a34', E: '#8aa84a' } };
const MOLOTOV = { rows: ['.f.', 'ow.', 'ogo', 'ogo', 'ooo'], pal: { o: O, f: '#ffb02a', w: '#d8c8a0', g: '#3d7a3a' } };
const ROCKET = { rows: ['ooo...', 'oyeeeo', 'ooo...'], pal: { o: O, y: '#ff9a3a', e: '#6a7a3a' } };
const MEDSTATION = {
  rows: ['.oooooo.', 'owwwwwwo', 'owwrrwwo', 'owrrrrwo', 'owwrrwwo', 'oggggggo', '.oooooo.'],
  pal: { o: O, w: '#eeeae0', r: '#d83a3a', g: '#3fa58e' },
};
// sentry turret: a tripod base and a separately drawn gun that turns to aim
const TURRET_BASE = { rows: ['..oooo..', '.oGGGGo.', '.ogggGo.', 'oo.oo.oo', 'o..oo..o'], pal: { o: O, G: '#8a93a3', g: '#4a505c' } };
const TURRET_GUN = { rows: ['ooooooooo', 'oyyGGGGGo', 'oyyggoooo', 'oooo.....'], pal: { o: O, G: '#8a93a3', g: '#4a505c', y: '#f2c14e' } };
const SHELL = { rows: ['.oo.', 'oyeo', 'oeeo', '.oo.'], pal: { o: O, e: '#556b2f', y: '#d9b43a' } };
const FLARE = { rows: ['ooooo.', 'orRrwy', 'ooooo.'], pal: { o: O, r: '#d8342a', R: '#8e1c18', w: '#fff0c8', y: '#ffd24a' } };
const DRONE = {
  rows: ['go...og', '.ooooo.', 'ogbbbgo', '.ooooo.', 'go...og'],
  pal: { o: O, g: '#8a93a3', b: '#4fb2ff' },
};
const SAW = {
  rows: ['..o.o..', '.oGGGo.', 'oGgggGo', '.gGoGg.', 'oGgggGo', '.oGGGo.', '..o.o..'],
  pal: { o: O, g: '#b8bec8', G: '#6a707c' },
};

// ---------------------------------------------------------------- bake everything

export const SPR = {};

export function buildAllSprites() {
  SPR.players = {
    red: makeSet(humanoid(HEAD_RED, BODY_RED, PAL_RED), { head: buildSprite(HEAD_RED, PAL_RED) }),
    bruno: makeSet(humanoid(HEAD_BRUNO, BODY_BRUNO, PAL_BRUNO), { head: buildSprite(HEAD_BRUNO, PAL_BRUNO) }),
    mara: makeSet(humanoid(HEAD_MARA, BODY_MARA, PAL_MARA), { head: buildSprite(HEAD_MARA, PAL_MARA) }),
    ivy: makeSet(humanoid(HEAD_IVY, BODY_IVY, PAL_IVY), { head: buildSprite(HEAD_IVY, PAL_IVY) }),
  };
  for (const p of Object.values(SPR.players)) {
    p.downed = rotate90(p.frames[0], -1);
    p.downedFlipped = flipH(p.downed);
  }

  const zombieSet = (frames) => {
    const s = makeSet(frames);
    // darkened body used for the ragdoll flight and the corpse decal it leaves behind
    s.dead = tint(frames[0], '#200808', 0.35);
    s.deadFlipped = flipH(s.dead);
    return s;
  };

  // Walkers get a handful of palette variants so the horde doesn't look cloned.
  SPR.walker = [];
  for (let i = 0; i < 8; i++) {
    const pal = zombiePal(SKINS[i % SKINS.length], SHIRTS[i % SHIRTS.length], PANTS[i % PANTS.length]);
    SPR.walker.push(zombieSet(humanoid(HEAD_ZOMBIE, BODY_ZOMBIE, pal)));
  }
  SPR.runner = [
    zombieSet(humanoid(HEAD_ZOMBIE, BODY_ZOMBIE, zombiePal(['#a3a88a', '#7f8468'], ['#8a2020', '#621616'], '#2a2a36', { E: '#ff4a3a' }))),
    zombieSet(humanoid(HEAD_ZOMBIE, BODY_ZOMBIE, zombiePal(['#9aa084', '#767a62'], ['#2a2a2a', '#1a1a1a'], '#3a3a50', { E: '#ff4a3a' }))),
  ];
  SPR.spitter = [
    zombieSet(humanoid(HEAD_ZOMBIE, BODY_ZOMBIE, zombiePal(['#6a8f4a', '#4d6a34'], ['#3a4a3a', '#2a362a'], '#2a3a2a', { E: '#b4ff4a', m: '#8aff3a' }))),
  ];
  const brute = (pal) => BRUTE_LEGS.map((legs) => buildSprite([...BRUTE_TOP, ...legs], pal));
  SPR.brute = [
    zombieSet(brute(zombiePal(['#8a9a6a', '#6a7850'], ['#c8c0a8', '#9a927a'], '#3a3a48', { E: '#ffcf4a', m: '#3a0a0a' }))),
    zombieSet(brute(zombiePal(['#7c8c66', '#5e6c4c'], ['#54607a', '#3c465a'], '#2f2f3a', { E: '#ffcf4a', m: '#3a0a0a' }))),
  ];
  SPR.bloater = [
    zombieSet(brute(zombiePal(['#a4a456', '#80803e'], ['#b8b36a', '#6f8a2c'], '#4a4430', { E: '#e8ff6a', m: '#2a3a0a' }))),
  ];
  SPR.dog = [zombieSet(DOG.map((r) => buildSprite(r, { o: O, D: '#5a4a3a', E: '#ff3a2a', m: '#8a1a1a' })))];
  SPR.boss = [
    zombieSet(
      BOSS_LEGS.map((legs) =>
        buildSprite([...BOSS_TOP, ...legs], {
          o: O, S: '#8c6f76', r: '#dcd4bc', m: '#3a0a0a', W: '#eae2cc', E: '#ff3020', B: '#6a2630',
          P: '#3a3030', C: '#dcd4bc', F: '#2a2020',
        }),
      ),
    ),
  ];

  SPR.guns = {};
  for (const [k, g] of Object.entries(GUN_ART)) {
    const img = buildSprite(g.rows, GUN_PAL);
    SPR.guns[k] = { img, pivot: g.pivot, len: img.width - g.pivot[0] };
  }
  SPR.pickups = {};
  for (const [k, p] of Object.entries(PICKUPS)) SPR.pickups[k] = buildSprite(p.rows, p.pal);
  SPR.grenade = buildSprite(GRENADE.rows, GRENADE.pal);
  SPR.molotov = buildSprite(MOLOTOV.rows, MOLOTOV.pal);
  SPR.rocket = buildSprite(ROCKET.rows, ROCKET.pal);
  SPR.flare = buildSprite(FLARE.rows, FLARE.pal);
  SPR.shell = buildSprite(SHELL.rows, SHELL.pal);
  SPR.medstation = buildSprite(MEDSTATION.rows, MEDSTATION.pal);
  SPR.turretBase = buildSprite(TURRET_BASE.rows, TURRET_BASE.pal);
  SPR.turretGun = buildSprite(TURRET_GUN.rows, TURRET_GUN.pal);
  SPR.drone = buildSprite(DRONE.rows, DRONE.pal);
  SPR.saw = buildSprite(SAW.rows, SAW.pal);
}
