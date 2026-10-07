// The city: tile layout, baked pixel-art background, props with colliders, lights and navigation.
import { TILE } from './config.js';
import { makeCanvas, mulberry32, pixCircle, pixEllipse, circleRectPush } from './utils.js';
import { rotate90 } from './sprites.js';
import { drawText } from './font.js';

export const T = { BORDER: 0, ASPHALT: 1, SIDEWALK: 2, ROOF: 3, WALL: 4, CHECKER: 5, WOOD: 6, GRASS: 7, PATH: 8, LOT: 9, FACADE: 10 };
const SOLID_T = [1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1];
const MW = 88;
const MH = 62;
const COL_STREETS = [2, 28, 54, 80];
const ROW_STREETS = [2, 28, 54];
const S = TILE;

// ------------------------------------------------------------------ tiny binary heap for Dijkstra
class MinHeap {
  constructor() {
    this.ids = [];
    this.pri = [];
  }
  get size() {
    return this.ids.length;
  }
  push(id, p) {
    const { ids, pri } = this;
    let i = ids.length;
    ids.push(id);
    pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      ids[i] = ids[parent];
      pri[i] = pri[parent];
      i = parent;
    }
    ids[i] = id;
    pri[i] = p;
  }
  pop() {
    const { ids, pri } = this;
    const top = ids[0];
    const topP = pri[0];
    const lastId = ids.pop();
    const lastP = pri.pop();
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        let l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && pri[r] < pri[l]) l = r;
        if (pri[l] >= lastP) break;
        ids[i] = ids[l];
        pri[i] = pri[l];
        i = l;
      }
      ids[i] = lastId;
      pri[i] = lastP;
    }
    this.lastP = topP;
    return top;
  }
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414],
];

// ------------------------------------------------------------------ car art
const CAR_COLORS = ['#a0522d', '#4a6a8a', '#8a8a82', '#6a2a2a', '#3a5a3a', '#c9b27a', '#2e2e34'];

function carCanvas(color, rng, kind = 'car') {
  const W = kind === 'bus' ? 64 : 32;
  const H = kind === 'bus' ? 19 : 17;
  const [c, g] = makeCanvas(W, H);
  const dark = '#120e14';
  const glass = '#18222e';
  // wheels
  g.fillStyle = '#0c0c0e';
  const wheels = kind === 'bus' ? [6, 50] : [4, 22];
  for (const wx of wheels) {
    g.fillRect(wx, 0, 6, 2);
    g.fillRect(wx, H - 2, 6, 2);
  }
  // body
  g.fillStyle = dark;
  g.fillRect(1, 1, W - 2, H - 2);
  g.fillStyle = color;
  g.fillRect(2, 2, W - 4, H - 4);
  g.fillRect(1, 3, 1, H - 6);
  g.fillRect(W - 2, 3, 1, H - 6);
  if (kind === 'bus') {
    g.fillStyle = '#e2c25a';
    g.fillRect(4, 4, W - 8, H - 8);
    g.fillStyle = glass;
    for (let x = 8; x < W - 12; x += 7) {
      g.fillRect(x, 2, 5, 2);
      g.fillRect(x, H - 4, 5, 2);
    }
    g.fillRect(W - 7, 3, 3, H - 6);
    g.fillStyle = '#8a7a3a';
    g.fillRect(20, 7, 6, 5);
    g.fillRect(36, 7, 6, 5);
    g.fillStyle = '#2a2a2a';
    g.fillRect(2, 8, W - 4, 1);
  } else {
    const light = kind === 'police' ? '#e8e8e8' : shade(color, 1.25);
    // hood & trunk
    if (kind === 'police') {
      g.fillStyle = '#1c1c22';
      g.fillRect(2, 2, 5, H - 4);
      g.fillRect(W - 9, 2, 7, H - 4);
    }
    // rear window, roof, windshield
    g.fillStyle = glass;
    g.fillRect(7, 4, 3, H - 8);
    g.fillRect(18, 3, 4, H - 6);
    g.fillStyle = light;
    g.fillRect(10, 4, 8, H - 8);
    g.fillStyle = '#3a5068';
    g.fillRect(19, 4, 1, 3);
    // lights
    g.fillStyle = '#f2e6b0';
    g.fillRect(W - 2, 3, 1, 2);
    g.fillRect(W - 2, H - 5, 1, 2);
    g.fillStyle = '#b02020';
    g.fillRect(1, 3, 1, 2);
    g.fillRect(1, H - 5, 1, 2);
    if (kind === 'police') {
      g.fillStyle = '#ff3030';
      g.fillRect(13, 4, 2, 4);
      g.fillStyle = '#3050ff';
      g.fillRect(13, 9, 2, 4);
    }
    // wreck damage
    g.fillStyle = shade(color, 0.6);
    for (let i = 0; i < 8; i++) g.fillRect(2 + Math.floor(rng() * (W - 4)), 2 + Math.floor(rng() * (H - 4)), 2, 1);
    if (rng() < 0.6) {
      g.fillStyle = '#c9d4de';
      g.fillRect(19, 5 + Math.floor(rng() * 5), 1, 1);
      g.fillRect(20, 6 + Math.floor(rng() * 5), 1, 1);
      g.fillRect(8, 5 + Math.floor(rng() * 5), 1, 1);
    }
    if (rng() < 0.5) {
      g.fillStyle = '#5a2e1a';
      g.fillRect(24 + Math.floor(rng() * 4), 3, 3, 2);
    }
  }
  return c;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const gg = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${gg},${b})`;
}

// ------------------------------------------------------------------ the map
export class CityMap {
  constructor(seed = 7) {
    this.w = MW;
    this.h = MH;
    this.pw = MW * S;
    this.ph = MH * S;
    this.tiles = new Uint8Array(MW * MH);
    this.props = [];
    this.drawOps = [];
    this.lights = [];
    this.fires = [];
    this.buildings = [];
    this.windows = new Set();
    this.signs = [];
    this.rng = mulberry32(seed);
    this.queryStamp = 1;
    this.generate();
    this.finalize();
    this.canvas = this.render();
    this.spawn = { x: 44 * S, y: 31 * S };
    this.dist = new Float64Array(MW * MH).fill(Infinity); // must be 64-bit: float32 rounding makes Dijkstra re-relax forever
    this.next = new Int32Array(MW * MH).fill(-1);
  }

  // ---------------------------------------------------------------- tile helpers
  idx(tx, ty) {
    return ty * this.w + tx;
  }
  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }
  tileAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.tiles[ty * this.w + tx] : T.BORDER;
  }
  set(tx, ty, t) {
    if (this.inBounds(tx, ty)) this.tiles[ty * this.w + tx] = t;
  }
  fill(x0, y0, w, h, t) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, t);
  }
  isSolidTile(tx, ty) {
    return !this.inBounds(tx, ty) || this.solid[ty * this.w + tx] === 1;
  }
  isSolidAt(px, py) {
    return this.isSolidTile(Math.floor(px / S), Math.floor(py / S));
  }

  // ---------------------------------------------------------------- props
  addProp(x, y, w, h, draw, opts = {}) {
    const p = { x, y, w, h, blocksBullets: opts.blocksBullets ?? true, nav: opts.nav ?? true, kind: opts.kind || 'prop' };
    this.props.push(p);
    if (draw) this.drawOps.push({ y: y + h, fn: draw });
    return p;
  }
  addDecor(y, draw) {
    this.drawOps.push({ y, fn: draw });
  }
  addLight(x, y, r, color, intensity = 0.8, extra = {}) {
    const l = { x, y, r, color, intensity, flicker: false, broken: false, ...extra };
    this.lights.push(l);
    return l;
  }

  car(px, py, vertical, color, kind = 'car') {
    const img0 = carCanvas(color, this.rng, kind);
    const img = vertical ? rotate90(img0, this.rng() < 0.5 ? 1 : -1) : this.rng() < 0.5 ? img0 : flipX(img0);
    const w = img.width - (vertical ? 2 : 2);
    const h = img.height - (vertical ? 2 : 2);
    this.addProp(px + 1, py + 1, w, h, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(px + 2, py + 3, img.width, img.height);
      g.drawImage(img, px, py);
    }, { kind });
    if (kind === 'police') {
      const cx = px + img.width / 2;
      const cy = py + img.height / 2;
      this.addLight(cx, cy, 58, '#ff2a2a', 0.6, { type: 'siren', alt: '#2a5cff' });
    }
  }

  // ---------------------------------------------------------------- generation
  generate() {
    this.fill(0, 0, MW, MH, T.BORDER);
    this.fill(2, 2, MW - 4, MH - 4, T.ASPHALT);
    for (let x = 2; x < MW - 2; x++) this.set(x, 1, T.FACADE);

    const layout = [
      ['diner', 'office', 'park'],
      ['parking', 'bar', 'apartment'],
    ];
    this.blocks = [];
    for (let by = 0; by < 2; by++) {
      for (let bx = 0; bx < 3; bx++) {
        const x0 = 8 + bx * 26;
        const y0 = 8 + by * 26;
        this.fill(x0, y0, 20, 20, T.SIDEWALK);
        const lot = { x: x0 + 2, y: y0 + 2, w: 16, h: 16, x0, y0, type: layout[by][bx] };
        this.blocks.push(lot);
        switch (lot.type) {
          case 'diner': this.buildDiner(lot); break;
          case 'bar': this.buildBar(lot); break;
          case 'park': this.buildPark(lot); break;
          case 'parking': this.buildParking(lot); break;
          case 'office': this.buildRoof(lot, 'office'); break;
          case 'apartment': this.buildRoof(lot, 'apartment'); break;
        }
        this.buildSidewalkDressing(lot);
      }
    }
    this.buildStreets();
  }

  buildRoof(lot, style) {
    this.fill(lot.x, lot.y, lot.w, lot.h - 1, T.ROOF);
    this.fill(lot.x, lot.y + lot.h - 1, lot.w, 1, T.FACADE);
    this.buildings.push({ ...lot, style });
    // dumpster tucked beside the building
    const dx = (lot.x + 1) * S;
    const dy = (lot.y + lot.h) * S + 3;
    this.addProp(dx, dy, 22, 11, (g) => drawDumpster(g, dx, dy, style === 'office' ? '#2f5a3a' : '#2f3f6a'));
  }

  buildInteriorShell(lot, floor, doors) {
    const { x, y, w, h } = lot;
    this.fill(x, y, w, h, T.WALL);
    this.fill(x + 1, y + 1, w - 2, h - 2, floor);
    for (const [dx, dy] of doors) this.set(x + dx, y + dy, floor);
    // windows along the front (south) wall
    for (let i = 1; i < w - 1; i++) {
      if (this.tileAt(x + i, y + h - 1) === T.WALL && i % 3 !== 0) this.windows.add(this.idx(x + i, y + h - 1));
    }
  }

  buildDiner(lot) {
    const { x, y } = lot;
    const doors = [];
    for (let i = 7; i <= 9; i++) doors.push([i, 15]);
    for (let i = 7; i <= 9; i++) doors.push([0, i], [15, i]);
    this.buildInteriorShell(lot, T.CHECKER, doors);
    this.signs.push({ text: 'DINER', x: (x + 4) * S, y: (y + 15) * S + 9, color: '#ff5fb0' });
    this.addLight((x + 4) * S + 8, (y + 16) * S + 4, 46, '#ff4fa3', 0.5, { flicker: true });

    // kitchen shelf along the back wall
    const kx = (x + 1) * S, ky = (y + 1) * S;
    this.addProp(kx, ky, 10 * S, 10, (g) => {
      g.fillStyle = '#6f757e'; g.fillRect(kx, ky, 10 * S, 10);
      g.fillStyle = '#9aa3ad'; g.fillRect(kx, ky, 10 * S, 2);
      g.fillStyle = '#3a3e45';
      for (let i = 0; i < 9; i++) g.fillRect(kx + 4 + i * 17, ky + 4, 10, 4);
      g.fillStyle = '#c94a3a'; g.fillRect(kx + 30, ky + 3, 3, 3);
    });
    // counter
    const cx = (x + 2) * S, cy = (y + 3) * S + 2;
    this.addProp(cx, cy, 9 * S, 11, (g) => {
      g.fillStyle = '#120e14'; g.fillRect(cx - 1, cy - 1, 9 * S + 2, 13);
      g.fillStyle = '#d9d2c0'; g.fillRect(cx, cy, 9 * S, 6);
      g.fillStyle = '#9aa3ad'; g.fillRect(cx, cy + 6, 9 * S, 1);
      g.fillStyle = '#a8322c'; g.fillRect(cx, cy + 7, 9 * S, 4);
      g.fillStyle = '#6a6a6a';
      for (let i = 0; i < 5; i++) g.fillRect(cx + 10 + i * 28, cy + 2, 5, 2);
    });
    for (let i = 0; i < 8; i++) {
      const sx = cx + 8 + i * 17, sy = cy + 19;
      this.addDecor(sy + 3, (g) => {
        pixCircle(g, sx, sy + 3, 3, '#1a1a1e');
        pixCircle(g, sx, sy, 3, '#120e14');
        pixCircle(g, sx, sy, 2, '#b8322c');
      });
    }
    // booths along the right wall
    for (const row of [2, 4.5, 11.5]) {
      const bx = (x + 12) * S + 2, by = Math.round((y + row) * S);
      this.addProp(bx, by, 22, 22, (g) => {
        g.fillStyle = '#120e14'; g.fillRect(bx - 1, by - 1, 24, 24);
        g.fillStyle = '#8e2626'; g.fillRect(bx, by, 22, 5); g.fillRect(bx, by + 17, 22, 5);
        g.fillStyle = '#b3423a'; g.fillRect(bx, by, 22, 2); g.fillRect(bx, by + 17, 22, 2);
        g.fillStyle = '#d8d2c0'; g.fillRect(bx + 2, by + 7, 18, 8);
        g.fillStyle = '#9aa3ad'; g.fillRect(bx + 2, by + 14, 18, 1);
      });
    }
    // loose tables (one knocked over)
    for (const [tx, ty, flipped] of [[4, 8, false], [7, 11, true], [4, 12, false]]) {
      const px = (x + tx) * S, py = (y + ty) * S;
      this.addProp(px, py, 13, 13, (g) => {
        if (flipped) {
          g.fillStyle = '#120e14'; g.fillRect(px - 1, py + 3, 15, 8);
          g.fillStyle = '#cfc6b0'; g.fillRect(px, py + 4, 13, 5);
          g.fillStyle = '#8a8478'; g.fillRect(px, py + 9, 13, 1);
        } else {
          g.fillStyle = '#120e14'; g.fillRect(px - 1, py - 1, 15, 15);
          g.fillStyle = '#cfc6b0'; g.fillRect(px, py, 13, 13);
          g.fillStyle = '#e6e0cf'; g.fillRect(px, py, 13, 2);
          g.fillStyle = '#b8322c'; g.fillRect(px + 2, py - 4, 4, 3); g.fillRect(px + 7, py + 14, 4, 3);
        }
      });
    }
    // jukebox
    const jx = (x + 1) * S + 2, jy = (y + 13) * S;
    this.addProp(jx, jy, 12, 12, (g) => {
      g.fillStyle = '#120e14'; g.fillRect(jx - 1, jy - 1, 14, 14);
      g.fillStyle = '#7a3a8a'; g.fillRect(jx, jy, 12, 12);
      g.fillStyle = '#ffcf5a'; g.fillRect(jx + 2, jy + 2, 8, 3);
      g.fillStyle = '#5fe0ff'; g.fillRect(jx + 2, jy + 6, 8, 1);
      g.fillStyle = '#ff5fb0'; g.fillRect(jx + 2, jy + 8, 8, 1);
    });
    this.addLight((x + 1) * S + 8, (y + 13) * S + 6, 22, '#c87bff', 0.35);
    this.addLight((x + 5) * S, (y + 6) * S, 62, '#dfe8ff', 0.5, { flicker: true });
    this.addLight((x + 11) * S, (y + 10) * S, 56, '#dfe8ff', 0.45);
  }

  buildBar(lot) {
    const { x, y } = lot;
    const doors = [];
    for (let i = 3; i <= 5; i++) doors.push([i, 15]);
    for (let i = 9; i <= 11; i++) doors.push([0, i]);
    for (let i = 11; i <= 13; i++) doors.push([i, 0]);
    for (let i = 7; i <= 9; i++) doors.push([15, i]);
    this.buildInteriorShell(lot, T.WOOD, doors);
    this.signs.push({ text: 'BAR', x: (x + 9) * S + 4, y: (y + 15) * S + 9, color: '#5fd0ff' });
    this.addLight((x + 10) * S, (y + 16) * S + 4, 44, '#4fc3ff', 0.5, { flicker: true });

    // bottle shelf + bar counter
    const sx = (x + 1) * S, sy = (y + 1) * S;
    this.addProp(sx, sy, 9 * S, 8, (g) => {
      g.fillStyle = '#3a2414'; g.fillRect(sx, sy, 9 * S, 8);
      const cols = ['#3d7a3a', '#8a5a2a', '#b8b0a0', '#6a2a5a', '#c9a24a'];
      for (let i = 0; i < 40; i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillRect(sx + 2 + i * 3.5, sy + 1 + (i % 2), 2, 4);
      }
    });
    const cx = (x + 2) * S, cy = (y + 3) * S;
    this.addProp(cx, cy, 8 * S, 10, (g) => {
      g.fillStyle = '#120e14'; g.fillRect(cx - 1, cy - 1, 8 * S + 2, 12);
      g.fillStyle = '#7a4a28'; g.fillRect(cx, cy, 8 * S, 6);
      g.fillStyle = '#9a6234'; g.fillRect(cx, cy, 8 * S, 2);
      g.fillStyle = '#4a2a16'; g.fillRect(cx, cy + 6, 8 * S, 4);
      g.fillStyle = '#d9b43a'; g.fillRect(cx + 20, cy + 2, 2, 3); g.fillRect(cx + 70, cy + 2, 2, 3);
    });
    for (let i = 0; i < 7; i++) {
      const px = cx + 8 + i * 17, py = cy + 18;
      this.addDecor(py + 3, (g) => {
        pixCircle(g, px, py, 3, '#120e14');
        pixCircle(g, px, py, 2, '#6a3a1e');
      });
    }
    // pool table
    const px = (x + 7) * S + 4, py = (y + 8) * S;
    this.addProp(px, py, 38, 22, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px + 2, py + 3, 38, 22);
      g.fillStyle = '#120e14'; g.fillRect(px - 1, py - 1, 40, 24);
      g.fillStyle = '#5a3620'; g.fillRect(px, py, 38, 22);
      g.fillStyle = '#2f6b3a'; g.fillRect(px + 3, py + 3, 32, 16);
      g.fillStyle = '#0c0c0c';
      for (const [ox, oy] of [[2, 2], [18, 2], [34, 2], [2, 18], [18, 18], [34, 18]]) g.fillRect(px + ox, py + oy, 2, 2);
      const balls = ['#e8e0c8', '#d9b43a', '#b8322c', '#2a4a9a', '#1a1a1a', '#7a2a8a'];
      balls.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(px + 8 + ((i * 7) % 24), py + 6 + ((i * 5) % 10), 2, 2);
      });
      g.fillStyle = '#c8a26a'; g.fillRect(px - 6, py + 26, 26, 1);
    });
    // round tables with chairs
    for (const [tx, ty] of [[3, 10], [4, 13], [12, 12], [13, 4]]) {
      const qx = (x + tx) * S, qy = (y + ty) * S;
      this.addProp(qx - 6, qy - 6, 12, 12, (g) => {
        pixCircle(g, qx, qy + 2, 7, 'rgba(0,0,0,0.3)');
        pixCircle(g, qx, qy, 7, '#120e14');
        pixCircle(g, qx, qy, 6, '#6b4329');
        pixCircle(g, qx - 1, qy - 1, 3, '#7e5233');
        g.fillStyle = '#4a2e1c';
        g.fillRect(qx - 12, qy - 2, 4, 4); g.fillRect(qx + 8, qy - 2, 4, 4);
      });
    }
    // dart board + neon inside
    this.addDecor((y + 1) * S, (g) => {
      const dx = (x + 13) * S, dy = (y + 1) * S + 8;
      pixCircle(g, dx, dy, 4, '#120e14');
      pixCircle(g, dx, dy, 3, '#2a6a3a');
      pixCircle(g, dx, dy, 1, '#b8322c');
    });
    this.addLight((x + 5) * S, (y + 5) * S, 54, '#ffb070', 0.5, { flicker: true });
    this.addLight((x + 9) * S, (y + 9) * S, 40, '#fff0c0', 0.55);
    this.addLight((x + 4) * S, (y + 12) * S, 40, '#ffb070', 0.35);
  }

  buildPark(lot) {
    const { x, y, w, h } = lot;
    this.fill(x, y, w, h, T.GRASS);
    this.fill(x + 7, y, 2, h, T.PATH);
    this.fill(x, y + 7, w, 2, T.PATH);
    // fountain
    const fx = (x + 8) * S, fy = (y + 8) * S;
    this.addProp(fx - 15, fy - 15, 30, 30, (g) => {
      pixCircle(g, fx + 1, fy + 3, 16, 'rgba(0,0,0,0.35)');
      pixCircle(g, fx, fy, 16, '#120e14');
      pixCircle(g, fx, fy, 15, '#77736b');
      pixCircle(g, fx, fy, 12, '#4d4a45');
      pixCircle(g, fx, fy, 11, '#1d3448');
      g.fillStyle = '#35587a';
      for (let i = 0; i < 12; i++) g.fillRect(fx - 8 + ((i * 7) % 16), fy - 7 + ((i * 11) % 14), 3, 1);
      g.fillStyle = '#5a1414'; g.fillRect(fx - 6, fy + 3, 5, 2);
      pixCircle(g, fx, fy, 3, '#8a867c');
    });
    // trees
    for (const [tx, ty] of [[3, 3], [12, 3], [3, 12], [12, 12], [4.5, 10], [11, 5.5], [13.5, 10]]) {
      const cx = Math.round((x + tx) * S), cy = Math.round((y + ty) * S);
      this.addProp(cx - 9, cy - 9, 18, 18, (g) => drawTree(g, cx, cy, this.rng), { blocksBullets: false });
    }
    // benches
    for (const [tx, ty] of [[4, 6.4], [10, 9.8]]) {
      const bx = (x + tx) * S, by = Math.round((y + ty) * S);
      this.addProp(bx, by, 18, 6, (g) => {
        g.fillStyle = '#120e14'; g.fillRect(bx - 1, by - 1, 20, 8);
        g.fillStyle = '#6b4329'; g.fillRect(bx, by, 18, 2); g.fillRect(bx, by + 3, 18, 2);
        g.fillStyle = '#2a2a2e'; g.fillRect(bx + 1, by + 5, 2, 2); g.fillRect(bx + 15, by + 5, 2, 2);
      }, { blocksBullets: false });
    }
    // sandbag barricade (survivor camp)
    const sx = (x + 9) * S + 6, sy = (y + 12) * S;
    this.addProp(sx, sy, 36, 9, (g) => {
      for (let i = 0; i < 6; i++) {
        const bx = sx + i * 6;
        g.fillStyle = '#120e14'; g.fillRect(bx, sy, 7, 9);
        g.fillStyle = '#8a7a56'; g.fillRect(bx + 1, sy + 1, 5, 7);
        g.fillStyle = '#a8966a'; g.fillRect(bx + 1, sy + 1, 5, 2);
      }
    });
    const tx = (x + 11) * S + 4, ty = (y + 14) * S;
    this.fires.push({ x: tx, y: ty - 4 });
    this.addProp(tx - 4, ty - 5, 9, 9, (g) => drawBarrel(g, tx - 4, ty - 5, true));
    this.addLight((x + 1) * S, (y + 7) * S + 8, 50, '#ffd89a', 0.6);
    this.addLight((x + 15) * S, (y + 8) * S + 8, 50, '#ffd89a', 0.6, { broken: true });
  }

  buildParking(lot) {
    const { x, y, w, h } = lot;
    this.fill(x, y, w, h, T.LOT);
    this.parkingLot = lot;
    const colors = CAR_COLORS;
    // two rows of stalls; some filled with cars
    const stallW = 21;
    for (let i = 0; i < 12; i++) {
      const sx = x * S + 6 + i * stallW;
      if (sx + stallW > (x + w) * S) break;
      if ((i * 7 + 3) % 5 < 2) this.car(sx + 3, y * S + 6, true, colors[i % colors.length]);
      if ((i * 5 + 1) % 4 === 0) this.car(sx + 3, (y + 11) * S + 4, true, colors[(i + 3) % colors.length]);
    }
    // booth + barrels
    const bx = (x + 14) * S, by = (y + 7) * S + 1;
    this.addProp(bx, by, 16, 14, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(bx + 2, by + 3, 16, 14);
      g.fillStyle = '#120e14'; g.fillRect(bx - 1, by - 1, 18, 16);
      g.fillStyle = '#d9c9a0'; g.fillRect(bx, by, 16, 14);
      g.fillStyle = '#b8322c'; g.fillRect(bx, by, 16, 3);
      g.fillStyle = '#18222e'; g.fillRect(bx + 3, by + 5, 10, 5);
    });
    for (const [tx, ty, lit] of [[2, 7.5, true], [3, 8.3, false], [9, 7.2, false]]) {
      const qx = Math.round((x + tx) * S), qy = Math.round((y + ty) * S);
      this.addProp(qx, qy, 9, 9, (g) => drawBarrel(g, qx, qy, lit));
      if (lit) this.fires.push({ x: qx + 4, y: qy + 1 });
    }
    this.signs.push({ text: 'P', x: (x + 15) * S - 2, y: (y + 7) * S - 4, color: '#5fd0ff' });
    this.addLight((x + 4) * S, (y + 8) * S, 56, '#ffe6b0', 0.55, { flicker: true });
    this.addLight((x + 12) * S, (y + 8) * S, 56, '#ffe6b0', 0.55, { broken: true });
  }

  buildSidewalkDressing(lot) {
    const { x0, y0 } = lot;
    const r = this.rng;
    // street lamps on each side of the block, near the curb
    const lamps = [
      [(x0 + 10) * S, y0 * S + 3],
      [(x0 + 10) * S, (y0 + 19) * S + 12],
      [x0 * S + 3, (y0 + 10) * S],
      [(x0 + 19) * S + 12, (y0 + 10) * S],
      [x0 * S + 3, y0 * S + 3],
      [(x0 + 19) * S + 12, (y0 + 19) * S + 12],
    ];
    for (const [lx, ly] of lamps) {
      const broken = r() < 0.18;
      const flicker = !broken && r() < 0.22;
      this.addLight(lx, ly, 60, '#ffd79a', 0.75, { broken, flicker, lamp: true });
      this.addDecor(ly + 2, (g) => {
        pixCircle(g, lx, ly, 3, '#120e14');
        pixCircle(g, lx, ly, 2, '#3a3a42');
        g.fillStyle = broken ? '#4a4a4a' : '#f3e6b8';
        g.fillRect(lx - 1, ly - 1, 2, 2);
      });
    }
    // hydrant + trash can
    const hx = (x0 + 1) * S + 2, hy = (y0 + 19) * S + 6;
    this.addProp(hx, hy, 5, 5, (g) => {
      g.fillStyle = '#120e14'; g.fillRect(hx - 1, hy - 1, 7, 7);
      g.fillStyle = '#b8322c'; g.fillRect(hx, hy, 5, 5);
      g.fillStyle = '#e04a3a'; g.fillRect(hx + 1, hy + 1, 3, 2);
    }, { blocksBullets: false });
    const tx = (x0 + 18) * S + 4, ty = y0 * S + 4;
    this.addProp(tx, ty, 7, 7, (g) => {
      pixCircle(g, tx + 3, ty + 3, 4, '#120e14');
      pixCircle(g, tx + 3, ty + 3, 3, '#5a5e66');
      pixCircle(g, tx + 3, ty + 3, 1, '#2a2c30');
    }, { blocksBullets: false });
    // trash bags
    for (let i = 0; i < 3; i++) {
      const bx = (x0 + 2 + Math.floor(r() * 16)) * S + Math.floor(r() * 8);
      const by = (y0 + (r() < 0.5 ? 0 : 19)) * S + 4 + Math.floor(r() * 6);
      this.addDecor(by, (g) => {
        pixCircle(g, bx, by, 4, '#120e14');
        pixCircle(g, bx, by, 3, '#1e1e24');
        g.fillStyle = '#3a3a44'; g.fillRect(bx - 1, by - 2, 2, 1);
      });
    }
  }

  buildStreets() {
    const r = this.rng;
    // wrecked cars, a police car and a crashed bus
    this.car(13 * S, 29 * S + 4, false, '#a0522d');
    this.car(37 * S, 29 * S + 2, false, '#4a6a8a');
    this.car(66 * S, 29 * S + 3, false, '#e8e8e8', 'police');
    this.car(29 * S + 3, 14 * S, true, '#8a8a82');
    this.car(56 * S + 4, 37 * S, true, '#e2c25a', 'bus');
    this.car(20 * S, 3 * S + 5, false, '#6a2a2a');
    this.car(62 * S, 5 * S + 2, false, '#3a5a3a');
    this.car(10 * S, 56 * S + 3, false, '#c9b27a');
    this.car(71 * S, 57 * S, false, '#2e2e34');
    this.car(4 * S + 2, 19 * S, true, '#4a6a8a');
    this.car(5 * S, 44 * S, true, '#a0522d');
    this.car(82 * S, 15 * S, true, '#8a8a82');
    this.car(81 * S + 4, 44 * S, true, '#e8e8e8', 'police');
    this.car(31 * S + 4, 46 * S, true, '#6a2a2a');

    // barricades
    const barricade = (px, py, vertical) => {
      const w = vertical ? 6 : 24, h = vertical ? 24 : 6;
      this.addProp(px, py, w, h, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px + 2, py + 2, w, h);
        g.fillStyle = '#120e14'; g.fillRect(px - 1, py - 1, w + 2, h + 2);
        g.fillStyle = '#8e8a82'; g.fillRect(px, py, w, h);
        g.fillStyle = '#b0aca2'; vertical ? g.fillRect(px, py, 2, h) : g.fillRect(px, py, w, 2);
        g.fillStyle = '#c9a03a';
        for (let i = 0; i < (vertical ? h : w); i += 8) vertical ? g.fillRect(px + 2, py + i, 3, 3) : g.fillRect(px + i, py + 2, 3, 3);
      });
    };
    barricade(48 * S, 32 * S + 4, false);
    barricade(44 * S, 4 * S, false);
    barricade(46 * S, 4 * S + 8, false);
    barricade(57 * S, 19 * S, true);
    barricade(5 * S, 30 * S, true);
    barricade(83 * S, 30 * S, true);

    // burning barrels on the street
    for (const [tx, ty] of [[36, 57], [3, 4], [84, 57], [58, 30]]) {
      const qx = tx * S, qy = ty * S;
      this.addProp(qx, qy, 9, 9, (g) => drawBarrel(g, qx, qy, true));
      this.fires.push({ x: qx + 4, y: qy + 1 });
    }

    // manholes & debris (decor only)
    for (let i = 0; i < 16; i++) {
      const sx = COL_STREETS[Math.floor(r() * COL_STREETS.length)];
      const px = (sx + 1 + Math.floor(r() * 4)) * S + 4;
      const py = (4 + Math.floor(r() * 52)) * S;
      if (this.tileAt(Math.floor(px / S), Math.floor(py / S)) !== T.ASPHALT) continue;
      this.addDecor(py - 20, (g) => {
        pixCircle(g, px, py, 6, '#1a1b1e');
        pixCircle(g, px, py, 5, '#3a3c42');
        g.fillStyle = '#2a2c30';
        for (let k = -3; k <= 3; k += 2) g.fillRect(px - 4, py + k, 9, 1);
      });
    }
  }

  // ---------------------------------------------------------------- post-generation data
  finalize() {
    const N = this.w * this.h;
    this.solid = new Uint8Array(N);
    for (let i = 0; i < N; i++) this.solid[i] = SOLID_T[this.tiles[i]];

    this.propGrid = Array.from({ length: N }, () => []);
    for (const p of this.props) {
      const x0 = Math.floor(p.x / S), x1 = Math.floor((p.x + p.w) / S);
      const y0 = Math.floor(p.y / S), y1 = Math.floor((p.y + p.h) / S);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.inBounds(tx, ty)) this.propGrid[this.idx(tx, ty)].push(p);
    }

    // Walkable for navigation: not solid and tile center not covered by a prop.
    this.walk = new Uint8Array(N);
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const i = this.idx(tx, ty);
        if (this.solid[i]) continue;
        const cx = tx * S + 8, cy = ty * S + 8;
        let blocked = false;
        for (const p of this.propGrid[i]) {
          if (p.nav && cx > p.x - 3 && cx < p.x + p.w + 3 && cy > p.y - 3 && cy < p.y + p.h + 3) {
            blocked = true;
            break;
          }
        }
        this.walk[i] = blocked ? 0 : 1;
      }
    }
    this.walkable = [];
    for (let i = 0; i < N; i++) if (this.walk[i]) this.walkable.push(i);
  }

  // ---------------------------------------------------------------- collision & queries
  propsNear(x0, y0, x1, y1, out) {
    const stamp = ++this.queryStamp;
    out.length = 0;
    const tx0 = Math.max(0, Math.floor(x0 / S)), tx1 = Math.min(this.w - 1, Math.floor(x1 / S));
    const ty0 = Math.max(0, Math.floor(y0 / S)), ty1 = Math.min(this.h - 1, Math.floor(y1 / S));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        for (const p of this.propGrid[ty * this.w + tx]) {
          if (p._q === stamp) continue;
          p._q = stamp;
          out.push(p);
        }
      }
    }
    return out;
  }

  // Push a circle entity (x, y, r) out of solid tiles and props. Returns true if it collided.
  resolveCircle(e) {
    let hit = false;
    const r = e.r;
    for (let pass = 0; pass < 2; pass++) {
      const tx0 = Math.floor((e.x - r) / S), tx1 = Math.floor((e.x + r) / S);
      const ty0 = Math.floor((e.y - r) / S), ty1 = Math.floor((e.y + r) / S);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.isSolidTile(tx, ty)) continue;
          const p = circleRectPush(e.x, e.y, r, tx * S, ty * S, S, S);
          if (p) {
            e.x += p.x;
            e.y += p.y;
            hit = true;
          }
        }
      }
      const near = this.propsNear(e.x - r, e.y - r, e.x + r, e.y + r, (this._tmp ||= []));
      for (const pr of near) {
        const p = circleRectPush(e.x, e.y, r, pr.x, pr.y, pr.w, pr.h);
        if (p) {
          e.x += p.x;
          e.y += p.y;
          hit = true;
        }
      }
    }
    return hit;
  }

  // Does a bullet at (x, y) hit something solid?
  bulletBlocked(x, y) {
    if (this.isSolidAt(x, y)) return true;
    const tx = Math.floor(x / S), ty = Math.floor(y / S);
    if (!this.inBounds(tx, ty)) return true;
    for (const p of this.propGrid[ty * this.w + tx]) {
      if (p.blocksBullets && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
    }
    return false;
  }

  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(d / 6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  // Distance a light ray travels before hitting a solid tile.
  rayLength(x, y, ang, max) {
    const dx = Math.cos(ang) * 3, dy = Math.sin(ang) * 3;
    let d = 0;
    while (d < max) {
      x += dx;
      y += dy;
      d += 3;
      if (this.isSolidAt(x, y)) return d;
    }
    return max;
  }

  // ---------------------------------------------------------------- navigation (flow field)
  computeFlow(sources) {
    const { w, h, walk } = this;
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = new MinHeap();
    for (const s of sources) {
      const tx = Math.floor(s.x / S), ty = Math.floor(s.y / S);
      if (!this.inBounds(tx, ty)) continue;
      const i = this.idx(tx, ty);
      dist[i] = 0;
      heap.push(i, 0);
    }
    while (heap.size) {
      const i = heap.pop();
      const d = heap.lastP;
      if (d > dist[i]) continue;
      const tx = i % w, ty = (i / w) | 0;
      for (const [dx, dy, c] of DIRS) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!walk[j]) continue;
        if (dx && dy && (!walk[ty * w + nx] || !walk[ny * w + tx])) continue;
        const nd = d + c;
        if (nd < dist[j]) {
          dist[j] = nd;
          heap.push(j, nd);
        }
      }
    }
    // For every tile, the neighbor that leads downhill toward the nearest player.
    const next = this.next;
    for (let i = 0; i < w * h; i++) {
      next[i] = -1;
      if (this.solid[i]) continue;
      const tx = i % w, ty = (i / w) | 0;
      let best = dist[i], bi = -1;
      for (const [dx, dy] of DIRS) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!walk[j]) continue;
        if (dx && dy && (!walk[ty * w + nx] || !walk[ny * w + tx])) continue;
        if (dist[j] < best) {
          best = dist[j];
          bi = j;
        }
      }
      next[i] = bi;
    }
  }

  // ---------------------------------------------------------------- baking the background
  render() {
    const [c, g] = makeCanvas(this.pw, this.ph);
    const r = mulberry32(99);
    for (let ty = 0; ty < this.h; ty++) for (let tx = 0; tx < this.w; tx++) this.drawTile(g, tx, ty, r);
    this.drawCurbs(g);
    this.drawRoadMarkings(g);
    this.drawGrime(g, r);
    for (const b of this.buildings) drawRoofDetails(g, b, r);
    this.drawOps.sort((a, b) => a.y - b.y);
    for (const op of this.drawOps) op.fn(g);
    for (const s of this.signs) {
      drawText(g, s.text, s.x, s.y - 2, s.color, 'left', '#2a0a1a');
    }
    return c;
  }

  drawTile(g, tx, ty, r) {
    const t = this.tileAt(tx, ty);
    const x = tx * S, y = ty * S;
    const speck = (base, cols, n) => {
      g.fillStyle = base;
      g.fillRect(x, y, S, S);
      for (let i = 0; i < n; i++) {
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.fillRect(x + Math.floor(r() * S), y + Math.floor(r() * S), 1, 1);
      }
    };
    switch (t) {
      case T.ASPHALT:
      case T.LOT:
        speck(t === T.LOT ? '#2e3034' : '#2a2c30', ['#25272b', '#323439', '#2f3136', '#222428'], 16);
        if (r() < 0.06) {
          g.fillStyle = '#1c1d20';
          let cx = x + Math.floor(r() * 12), cy = y + Math.floor(r() * 12);
          for (let i = 0; i < 9; i++) {
            g.fillRect(cx, cy, 1, 1);
            cx += Math.floor(r() * 3) - 1;
            cy += 1;
          }
        }
        break;
      case T.SIDEWALK: {
        speck('#56585d', ['#5d5f64', '#505257', '#5a5c61'], 10);
        g.fillStyle = '#46484d';
        g.fillRect(x, y, S, 1);
        g.fillRect(x, y, 1, S);
        g.fillRect(x + 8, y, 1, S);
        g.fillRect(x, y + 8, S, 1);
        g.fillStyle = '#636569';
        g.fillRect(x + 1, y + 1, 7, 1);
        g.fillRect(x + 9, y + 9, 7, 1);
        if (r() < 0.08) {
          g.fillStyle = 'rgba(20,20,24,0.35)';
          g.fillRect(x + 2 + Math.floor(r() * 6), y + 3 + Math.floor(r() * 6), 5, 3);
        }
        break;
      }
      case T.ROOF:
      case T.BORDER:
        speck('#28272d', ['#302f36', '#222127', '#2c2b31'], 14);
        break;
      case T.FACADE:
        drawFacadeTile(g, x, y, r, tx);
        break;
      case T.WALL:
        this.drawWallTile(g, tx, ty, r);
        break;
      case T.CHECKER: {
        for (let yy = 0; yy < 2; yy++) {
          for (let xx = 0; xx < 2; xx++) {
            g.fillStyle = (tx * 2 + xx + ty * 2 + yy) % 2 ? '#2b2b30' : '#bdb5a2';
            g.fillRect(x + xx * 8, y + yy * 8, 8, 8);
          }
        }
        for (let i = 0; i < 6; i++) {
          g.fillStyle = 'rgba(40,30,20,0.25)';
          g.fillRect(x + Math.floor(r() * 15), y + Math.floor(r() * 15), 2, 1);
        }
        break;
      }
      case T.WOOD: {
        const cols = ['#5e3a22', '#6b4329', '#553320', '#633d24'];
        for (let row = 0; row < 4; row++) {
          g.fillStyle = cols[Math.floor(r() * cols.length)];
          g.fillRect(x, y + row * 4, S, 4);
          g.fillStyle = '#3a2414';
          g.fillRect(x, y + row * 4 + 3, S, 1);
          if (r() < 0.35) g.fillRect(x + Math.floor(r() * 14), y + row * 4, 1, 3);
        }
        break;
      }
      case T.GRASS:
        speck('#2a3d22', ['#34502a', '#22331b', '#2f4726'], 22);
        g.fillStyle = '#3d5e31';
        for (let i = 0; i < 4; i++) g.fillRect(x + Math.floor(r() * 15), y + Math.floor(r() * 14), 1, 2);
        break;
      case T.PATH:
        speck('#5d584e', ['#666054', '#534e45', '#615b50'], 20);
        break;
    }
  }

  drawWallTile(g, tx, ty, r) {
    const x = tx * S, y = ty * S;
    g.fillStyle = '#3d3b44';
    g.fillRect(x, y, S, S);
    g.fillStyle = '#34323a';
    for (let i = 0; i < 6; i++) g.fillRect(x + Math.floor(r() * S), y + Math.floor(r() * 10), 1, 1);
    const above = this.tileAt(tx, ty - 1);
    const below = this.tileAt(tx, ty + 1);
    if (above !== T.WALL) {
      g.fillStyle = '#5a5864';
      g.fillRect(x, y, S, 1);
    }
    if (below !== T.WALL && !SOLID_T[below]) {
      const interior = below === T.CHECKER || below === T.WOOD;
      if (this.windows.has(this.idx(tx, ty))) {
        g.fillStyle = '#1a2330';
        g.fillRect(x, y + 8, S, 8);
        g.fillStyle = '#3d5873';
        g.fillRect(x + 3, y + 9, 1, 1);
        g.fillRect(x + 4, y + 10, 1, 1);
        g.fillRect(x + 10, y + 11, 1, 1);
        g.fillStyle = '#2a2830';
        g.fillRect(x, y + 8, S, 1);
        g.fillRect(x + 15, y + 8, 1, 8);
      } else if (interior) {
        const diner = below === T.CHECKER;
        g.fillStyle = diner ? '#d4cab0' : '#2f4a3a';
        g.fillRect(x, y + 8, S, 8);
        g.fillStyle = diner ? '#a8322c' : '#4a2e1c';
        g.fillRect(x, y + (diner ? 12 : 12), S, diner ? 2 : 4);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x, y + 8, S, 1);
      } else {
        g.fillStyle = '#583a31';
        g.fillRect(x, y + 8, S, 8);
        g.fillStyle = '#3e2a24';
        for (let yy = 8; yy < 16; yy += 3) g.fillRect(x, y + yy, S, 1);
        for (let yy = 8, k = 0; yy < 16; yy += 3, k++) for (let xx = k % 2 ? 2 : 6; xx < S; xx += 8) g.fillRect(x + xx, y + yy, 1, 3);
      }
    } else {
      g.fillStyle = '#2a2830';
      g.fillRect(x, y + 15, S, 1);
    }
  }

  drawCurbs(g) {
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const t = this.tileAt(tx, ty);
        if (t !== T.SIDEWALK) continue;
        const x = tx * S, y = ty * S;
        const road = (tt) => tt === T.ASPHALT;
        if (road(this.tileAt(tx, ty + 1))) {
          g.fillStyle = '#7c7e83'; g.fillRect(x, y + 14, S, 2);
          g.fillStyle = '#18191c'; g.fillRect(x, y + 16, S, 2);
        }
        if (road(this.tileAt(tx, ty - 1))) {
          g.fillStyle = '#7c7e83'; g.fillRect(x, y, S, 2);
        }
        if (road(this.tileAt(tx - 1, ty))) {
          g.fillStyle = '#7c7e83'; g.fillRect(x, y, 2, S);
          g.fillStyle = '#18191c'; g.fillRect(x - 1, y, 1, S);
        }
        if (road(this.tileAt(tx + 1, ty))) {
          g.fillStyle = '#6c6e73'; g.fillRect(x + 14, y, 2, S);
          g.fillStyle = '#18191c'; g.fillRect(x + 16, y, 1, S);
        }
      }
    }
    // soft shadows cast by building fronts onto the ground below
    for (let ty = 0; ty < this.h - 1; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const t = this.tileAt(tx, ty);
        if ((t === T.FACADE || t === T.WALL) && !SOLID_T[this.tileAt(tx, ty + 1)]) {
          for (let k = 0; k < 5; k++) {
            g.fillStyle = `rgba(0,0,0,${0.32 - k * 0.06})`;
            g.fillRect(tx * S, (ty + 1) * S + k, S, 1);
          }
        }
      }
    }
  }

  drawRoadMarkings(g) {
    const inIntersection = (tx, ty) =>
      COL_STREETS.some((sx) => tx >= sx && tx < sx + 6) && ROW_STREETS.some((sy) => ty >= sy && ty < sy + 6);
    const yellow = '#9c8a3a';
    // center dashes
    for (const sx of COL_STREETS) {
      const cx = (sx + 3) * S - 1;
      for (let py = 2 * S; py < (MH - 2) * S; py += 16) {
        const ty = Math.floor(py / S);
        if (inIntersection(sx + 3, ty) || this.tileAt(sx + 3, ty) !== T.ASPHALT) continue;
        g.fillStyle = yellow;
        g.fillRect(cx, py + 4, 2, 8);
      }
    }
    for (const sy of ROW_STREETS) {
      const cy = (sy + 3) * S - 1;
      for (let px = 2 * S; px < (MW - 2) * S; px += 16) {
        const tx = Math.floor(px / S);
        if (inIntersection(tx, sy + 3) || this.tileAt(tx, sy + 3) !== T.ASPHALT) continue;
        g.fillStyle = yellow;
        g.fillRect(px + 4, cy, 8, 2);
      }
    }
    // crosswalks on each side of every intersection
    const stripe = '#a89a5a';
    for (const sx of COL_STREETS) {
      for (const sy of ROW_STREETS) {
        // north/south approaches (vertical street)
        for (const [ay, dir] of [[sy - 2, -1], [sy + 6, 1]]) {
          if (this.tileAt(sx + 2, ay) !== T.ASPHALT || this.tileAt(sx + 2, ay + (dir < 0 ? 1 : 0)) !== T.ASPHALT) continue;
          g.fillStyle = stripe;
          for (let px = sx * S + 4; px < (sx + 6) * S - 4; px += 9) g.fillRect(px, ay * S + 4, 5, 24);
        }
        for (const [ax, dir] of [[sx - 2, -1], [sx + 6, 1]]) {
          if (this.tileAt(ax, sy + 2) !== T.ASPHALT || this.tileAt(ax + (dir < 0 ? 1 : 0), sy + 2) !== T.ASPHALT) continue;
          g.fillStyle = stripe;
          for (let py = sy * S + 4; py < (sy + 6) * S - 4; py += 9) g.fillRect(ax * S + 4, py, 24, 5);
        }
      }
    }
    // parking stall lines
    const lot = this.parkingLot;
    if (lot) {
      g.fillStyle = '#9d9d94';
      for (let i = 0; i <= 12; i++) {
        const sx = lot.x * S + 6 + i * 21;
        if (sx > (lot.x + lot.w) * S - 4) break;
        g.fillRect(sx, lot.y * S + 4, 1, 36);
        g.fillRect(sx, (lot.y + 11) * S + 2, 1, 36);
      }
      g.fillRect(lot.x * S + 6, lot.y * S + 40, 252, 1);
      g.fillRect(lot.x * S + 6, (lot.y + 11) * S + 2, 252, 1);
    }
  }

  drawGrime(g, r) {
    // oil stains, puddles and old blood to sell the apocalypse
    for (let i = 0; i < 160; i++) {
      const x = 2 * S + Math.floor(r() * (MW - 4) * S);
      const y = 2 * S + Math.floor(r() * (MH - 4) * S);
      const t = this.tileAt(Math.floor(x / S), Math.floor(y / S));
      if (SOLID_T[t]) continue;
      const kind = r();
      if (kind < 0.35) {
        pixEllipse(g, x, y, 3 + Math.floor(r() * 5), 2 + Math.floor(r() * 3), 'rgba(10,10,14,0.28)');
      } else if (kind < 0.55) {
        pixEllipse(g, x, y, 4 + Math.floor(r() * 5), 2 + Math.floor(r() * 2), 'rgba(40,60,80,0.25)');
        g.fillStyle = 'rgba(120,150,180,0.25)';
        g.fillRect(x - 2, y - 1, 3, 1);
      } else if (kind < 0.75) {
        g.fillStyle = 'rgba(90,14,14,0.55)';
        for (let k = 0; k < 6; k++) g.fillRect(x + Math.floor(r() * 10) - 5, y + Math.floor(r() * 6) - 3, 2, 1);
        pixCircle(g, x, y, 1 + Math.floor(r() * 2), 'rgba(90,14,14,0.55)');
      } else {
        // paper litter
        g.fillStyle = r() < 0.5 ? '#b8b2a2' : '#8a8578';
        g.fillRect(x, y, 3, 2);
      }
    }
  }
}

function flipX(src) {
  const [c, g] = makeCanvas(src.width, src.height);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

function drawFacadeTile(g, x, y, r, tx) {
  g.fillStyle = '#553a31';
  g.fillRect(x, y, S, S);
  g.fillStyle = '#3e2a24';
  for (let yy = 2; yy < S; yy += 3) g.fillRect(x, y + yy, S, 1);
  g.fillStyle = '#3b3a42';
  g.fillRect(x, y, S, 2);
  // window every tile, some lit
  const lit = r() < 0.12;
  g.fillStyle = '#2a2424';
  g.fillRect(x + 4, y + 4, 8, 10);
  g.fillStyle = lit ? '#c99a4a' : '#141a24';
  g.fillRect(x + 5, y + 5, 6, 8);
  if (lit) {
    g.fillStyle = '#e8c070';
    g.fillRect(x + 6, y + 6, 3, 3);
  } else if (tx % 3 === 0) {
    g.fillStyle = '#2d3d52';
    g.fillRect(x + 6, y + 6, 1, 2);
  }
  g.fillStyle = '#2a2424';
  g.fillRect(x + 5, y + 9, 6, 1);
}

function drawRoofDetails(g, b, r) {
  const X = b.x * S, Y = b.y * S, W = b.w * S, H = (b.h - 1) * S;
  // parapet
  g.fillStyle = '#45444d';
  g.fillRect(X, Y, W, 3);
  g.fillRect(X, Y + H - 3, W, 3);
  g.fillRect(X, Y, 3, H);
  g.fillRect(X + W - 3, Y, 3, H);
  g.fillStyle = '#5d5c66';
  g.fillRect(X, Y, W, 1);
  g.fillStyle = '#1c1b20';
  g.fillRect(X + 3, Y + 3, W - 6, 1);
  g.fillRect(X + 3, Y + 3, 1, H - 6);

  const box = (bx, by, w, h, top, side) => {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(bx + 3, by + 3, w, h);
    g.fillStyle = '#120e14';
    g.fillRect(bx - 1, by - 1, w + 2, h + 2);
    g.fillStyle = side;
    g.fillRect(bx, by, w, h);
    g.fillStyle = top;
    g.fillRect(bx, by, w, h - 3);
  };
  // AC units
  const acs = b.style === 'office' ? [[20, 20], [20, 52], [150, 30], [190, 140], [60, 170]] : [[30, 30], [170, 26], [30, 150], [120, 180]];
  for (const [ox, oy] of acs) {
    box(X + ox, Y + oy, 16, 12, '#7a7f88', '#565a62');
    pixCircle(g, X + ox + 8, Y + oy + 4, 3, '#3a3d44');
    g.fillStyle = '#8a8f98';
    g.fillRect(X + ox + 7, Y + oy + 1, 2, 7);
  }
  // skylights / water tank / hatch
  if (b.style === 'office') {
    for (const [ox, oy] of [[70, 60], [110, 60], [70, 100], [110, 100]]) {
      box(X + ox, Y + oy, 30, 20, '#243446', '#50505a');
      g.fillStyle = '#50505a';
      g.fillRect(X + ox + 14, Y + oy, 2, 17);
      g.fillRect(X + ox, Y + oy + 8, 30, 1);
      g.fillStyle = '#3d5873';
      g.fillRect(X + ox + 3, Y + oy + 2, 1, 3);
    }
    box(X + 200, Y + 60, 18, 16, '#4a4950', '#35343a');
    g.fillStyle = '#1a1a1e';
    g.fillRect(X + 205, Y + 70, 8, 6);
  } else {
    const cx = X + 180, cy = Y + 90;
    pixCircle(g, cx + 3, cy + 4, 20, 'rgba(0,0,0,0.4)');
    pixCircle(g, cx, cy, 20, '#120e14');
    pixCircle(g, cx, cy, 19, '#5a3e2a');
    pixCircle(g, cx, cy, 15, '#6e4c33');
    pixCircle(g, cx, cy, 4, '#4a3222');
    g.fillStyle = '#3a2819';
    for (let a = 0; a < 8; a++) g.fillRect(cx - 19, cy - 1 + ((a * 5) % 15) - 7, 38, 1);
    box(X + 60, Y + 80, 40, 30, '#3a3940', '#2c2b31');
    box(X + 70, Y + 20, 18, 14, '#4a4950', '#35343a');
  }
  // vents & pipes
  for (let i = 0; i < 8; i++) {
    const vx = X + 10 + Math.floor(r() * (W - 20)), vy = Y + 10 + Math.floor(r() * (H - 20));
    pixCircle(g, vx, vy, 2, '#120e14');
    pixCircle(g, vx, vy, 1, '#6a6a72');
  }
  g.fillStyle = '#3a3a42';
  g.fillRect(X + 10, Y + H - 20, W - 20, 2);
}

function drawTree(g, cx, cy, r) {
  pixEllipse(g, cx + 3, cy + 5, 12, 8, 'rgba(0,0,0,0.4)');
  pixCircle(g, cx, cy, 12, '#120e14');
  pixCircle(g, cx, cy, 11, '#1d361b');
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = r() * 6;
    pixCircle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4, '#27491f');
  }
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * 0.75 + r() * 1.2, d = 3 + r() * 5;
    pixCircle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, '#386a2c');
  }
}

function drawBarrel(g, x, y, burning) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x + 2, y + 2, 9, 9);
  pixCircle(g, x + 4, y + 4, 5, '#120e14');
  pixCircle(g, x + 4, y + 4, 4, '#6a3a22');
  pixCircle(g, x + 4, y + 4, 3, burning ? '#2a1a12' : '#7a4a2a');
  if (burning) {
    g.fillStyle = '#ff8a2a';
    g.fillRect(x + 3, y + 3, 3, 2);
  }
}

function drawDumpster(g, x, y, color) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x + 2, y + 3, 22, 11);
  g.fillStyle = '#120e14';
  g.fillRect(x - 1, y - 1, 24, 13);
  g.fillStyle = color;
  g.fillRect(x, y, 22, 11);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x, y, 22, 2);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x + 11, y, 1, 11);
  g.fillStyle = '#1e1e24';
  pixCircle(g, x + 6, y + 13, 2, '#1e1e24');
}
