// DOM overlay: title, character select, upgrade cards, pause, game over, HUD and banners.
import { CHARACTERS, WEAPONS, ZOMBIES } from './data.js';
import { SPR, icon } from './sprites.js';
import { UPGRADE_BY_ID, RARITY, CATEGORY } from './upgrades.js';
import { PLAYER_COLORS } from './config.js';
import { SPECIALS } from './waves.js';
import { fmtInt, clamp } from './utils.js';
import { $, el, pix } from './dom.js';
import { buildGuide } from './guide.js';
import { loadRecords } from './records.js';
import { settings, saveSettings, ACTIONS, RESERVED, SHAKE_LEVELS, bindKey, resetKeys, keyLabel, actionKey } from './settings.js';

function upgradeIcon(u, scale) {
  const [name, over] = u.icon;
  return pix(icon(name, over), scale);
}

const RARITY_PIPS = { common: 1, rare: 2, epic: 3 };

function pips(cls, n, fill = n, fresh = -1) {
  const box = el('span', cls);
  for (let i = 0; i < n; i++) box.append(el('i', i === fresh ? 'new' : i < fill ? 'on' : ''));
  return box;
}

// "MODIFIER: +35% fire rate, but +50% spread." -> upside / downside lines
function cardDesc(u) {
  const text = u.desc.replace(/^MODIFIER: /, '');
  const m = u.modifier && text.match(/^(.*?),? but (.*?)\.?$/i);
  if (!m) return el('div', 'card-desc', text);
  const box = el('div', 'card-desc trade');
  box.append(el('div', 'pro', m[1]), el('div', 'con', m[2]));
  return box;
}

// What ended a run: "RUNNER", "SPITTER ACID", "THE ABOMINATION"...
function causeLabel(c) {
  const name = ZOMBIES[c.type]?.name || 'SOMETHING';
  return c.how === 'acid' ? `${name.replace(/^THE /, '')} ACID` : name;
}

// "THE ABOMINATION x2 + THE BROODMOTHER"
function bossNames(types) {
  const counts = new Map();
  for (const t of types) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].map(([t, n]) => (n > 1 ? `${ZOMBIES[t].name} x${n}` : ZOMBIES[t].name)).join(' + ');
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtTotal = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}H ${Math.floor((s % 3600) / 60)}M` : fmtTime(s));

// Screens that pop up mid-action: input is ignored for a moment, so a tap or click meant for the game
// (reload, ability, firing) can't pick an upgrade card or press TRY AGAIN by accident.
const ARMED_SCREENS = new Set(['scr-upgrade', 'scr-over']);
const ARM_TIME = 600; // ms

// Keys that never wake the splash, so browser shortcuts (reload, devtools, fullscreen) keep working.
const SPLASH_IGNORE = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.screens = [...document.querySelectorAll('.screen')];
    this.current = null;
    this.hudCache = new Map();
    this.padNavCd = 0;
    this.asleep = true; // the "press any key" splash in front of the title menu
    this.touch = false; // phones and tablets: on-screen controls and tap-friendly hints (main.js)
    this.logoLit = false;
    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        this.h.click?.();
        if (b.dataset.action === 'back') this.goBack();
        else this.h[b.dataset.action]?.();
      });
    });
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest?.('.screen.active button');
      if (b && document.activeElement !== b) b.focus({ preventScroll: true });
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    // `click`, not `pointerdown`: on touchscreens only the end of a tap may start audio or fullscreen
    $('scr-title').addEventListener('click', () => this.asleep && this.wake());
    $('up-reroll').addEventListener('click', () => this.onReroll?.());
    $('guide-back').addEventListener('click', () => {
      this.h.click?.();
      this.closeGuide();
    });
    // rebinding a key: catch the next key press before anything else sees it
    window.addEventListener('keydown', (e) => this.onCaptureKey(e), true);
    $('keys-reset').addEventListener('click', () => {
      this.h.click?.();
      resetKeys();
      this.capturing = null;
      this.renderKeys('BACK TO THE DEFAULT KEYS');
      this.refreshKeyHints();
    });
  }

  // Screens opened on top of the title or pause menu, which handle ESC / START themselves.
  get submenu() {
    return ['scr-guide', 'scr-settings', 'scr-keys'].includes(this.current);
  }

  // ------------------------------------------------------------------ screens
  showScreen(id) {
    for (const s of this.screens) s.classList.toggle('active', s.id === id);
    this.current = id;
    if (ARMED_SCREENS.has(id)) this.arm($(id));
    if (id) {
      const first = $(id).querySelector('button.primary, .card, button');
      first?.focus({ preventScroll: true });
    } else {
      // A hidden button that keeps focus would still receive Space/Enter (dash / P2 fire) and re-click.
      document.activeElement?.blur?.();
    }
  }
  arm(scr) {
    this.lockedUntil = performance.now() + ARM_TIME;
    scr.classList.add('arming'); // no pointer events (css)
    clearTimeout(this.armTimer);
    this.armTimer = setTimeout(() => scr.classList.remove('arming'), ARM_TIME);
  }
  get locked() {
    return performance.now() < (this.lockedUntil || 0);
  }

  get menuOpen() {
    return !!this.current;
  }

  // First key / click / button press on the splash: unlocks audio (main.js) and brings in the menu.
  wake() {
    this.asleep = false;
    const scr = $('scr-title');
    scr.classList.replace('asleep', 'waking');
    // the staggered entrance is for the first time only, not every return to the title
    setTimeout(() => scr.classList.remove('waking'), 1500);
    scr.querySelector('button.primary').focus({ preventScroll: true });
    this.h.wake();
  }

  setLogoLit(lit) {
    if (lit === this.logoLit) return;
    this.logoLit = lit;
    $('logo-light').classList.toggle('off', !lit);
  }

  showRecords(best) {
    const r = loadRecords();
    const none = (v, f = fmtInt) => (r.runs ? f(v) : '—');
    const tiles = $('rec-tiles');
    tiles.innerHTML = '';
    for (const [k, v, hi] of [
      ['BEST WAVE', best.wave || '—', true],
      ['BEST SCORE', best.score ? fmtInt(best.score) : '—', true],
      ['MOST KILLS IN A RUN', none(r.mostKills), true],
      ['LONGEST RUN', none(r.longest, fmtTime), true],
      ['RUNS', fmtInt(r.runs)],
      ['ZOMBIES KILLED', none(r.kills)],
      ['BOSSES SLAIN', none(r.bosses)],
      ['TIME SURVIVED', none(r.time, fmtTotal)],
    ]) {
      const t = el('div', `rec-tile${hi ? ' hi' : ''}`);
      t.append(el('div', 'v', String(v)), el('div', 'k', k));
      tiles.append(t);
    }

    const box = $('rec-survivors');
    box.innerHTML = '';
    const played = Object.values(r.survivors);
    const topRuns = Math.max(0, ...played.map((s) => s.runs));
    for (const c of Object.values(CHARACTERS)) {
      const s = r.survivors[c.id];
      const card = el('div', `rec-surv${s ? '' : ' unplayed'}`);
      card.style.setProperty('--cc', c.color);
      const portrait = el('div', 'rec-portrait');
      portrait.append(pix(SPR.players[c.id].frames[0], 3));
      const info = el('div', 'rec-info');
      info.append(el('div', 'rec-name', c.name));
      if (s) {
        for (const [k, v] of [['RUNS', s.runs], ['BEST WAVE', s.bestWave], ['KILLS', fmtInt(s.kills)]]) {
          const line = el('div', 'rec-line');
          line.append(el('span', '', k), el('b', '', String(v)));
          info.append(line);
        }
      } else info.append(el('div', 'rec-line', 'NOT PLAYED YET'));
      // ties share the badge, so two survivors played equally often are both favorites
      if (s && s.runs === topRuns && played.length > 1) card.append(el('span', 'rec-fav', 'FAVORITE'));
      card.append(portrait, info);
      box.append(card);
    }
    // the zombie that ended the most runs
    const [nemesis, ended] = Object.entries(r.causes).sort((a, b) => b[1] - a[1])[0] || [];
    $('rec-nemesis').textContent = nemesis ? `DEADLIEST: ${ZOMBIES[nemesis]?.name || '?'} · ENDED ${ended} OF ${r.runs} RUN${r.runs > 1 ? 'S' : ''}` : '';
    $('rec-hint').textContent = r.runs ? (this.touch ? '' : 'ESC BACK') : 'SURVIVE AS LONG AS YOU CAN. YOUR RECORDS SHOW UP HERE AFTER YOUR FIRST RUN.';
    this.showScreen('scr-records');
  }

  showTitle(best, muted) {
    this.hideHUD();
    this.hideBanner();
    $('title-best').textContent = best.wave ? `BEST: WAVE ${best.wave} · ${fmtInt(best.score)} PTS` : 'NO RECORD YET';
    this.refreshMute(muted);
    this.showScreen('scr-title');
  }

  refreshMute(muted) {
    this.muted = muted;
    this.renderAudioHint();
    this.refreshSettings();
  }

  refreshFullscreen(on) {
    this.fullscreenOn = on;
    document.body.classList.toggle('is-fullscreen', on);
    this.refreshSettings();
  }

  refreshAutoFire(on) {
    this.autoFireOn = on;
    this.refreshSettings();
  }

  showFullscreenTip() {
    this.showScreen('scr-fstip');
  }

  refreshMusic(on) {
    this.musicOn = on;
    this.renderAudioHint();
    this.refreshSettings();
  }

  renderAudioHint() {
    $('title-sound').textContent = `[M] SOUND ${this.muted ? 'OFF' : 'ON'} · [N] MUSIC ${this.musicOn === false ? 'OFF' : 'ON'}`;
  }

  // ------------------------------------------------------------------ settings
  // Opens from the title or the pause menu, and BACK returns there.
  showSettings(from = this.settingsFrom) {
    this.settingsFrom = from;
    this.showScreen('scr-settings');
    this.renderSettings();
    $('settings-list').querySelector('.setting')?.focus({ preventScroll: true });
  }

  closeSettings() {
    if (this.settingsFrom === 'pause') this.showScreen('scr-pause');
    else this.h.back();
  }

  refreshSettings() {
    if (this.current === 'scr-settings') this.renderSettings();
  }

  // Every row is a button. Click (or Enter / A) steps it forward, ← → (or the D-pad) change it, and a
  // volume's pips can be clicked directly. Rebuilt after each change, keeping focus on the same row.
  renderSettings() {
    const list = $('settings-list');
    const focused = [...list.children].indexOf(document.activeElement);
    list.innerHTML = '';
    // step(dir, wrap): change the setting; wrap is true for clicks, which go round past the last value
    const row = (label, value, step, cls = '') => {
      const b = el('button', `btn setting ${cls}`);
      b.append(el('span', 'set-k', label), typeof value === 'string' ? el('span', 'set-v', value) : value);
      b.adjust = (dir) => {
        step(dir, false);
        this.h.click?.();
        this.refreshSettings();
      };
      b.addEventListener('click', (e) => {
        this.h.click?.();
        step(1, true, e.target.dataset?.level);
        this.refreshSettings();
      });
      list.append(b);
      return b;
    };
    const slider = (label, kind, off) => {
      const level = Math.round(settings[kind] * 10);
      const box = el('span', 'set-v slider');
      const pips = el('span', 'pips');
      for (let i = 1; i <= 10; i++) {
        const pip = el('i', i <= level && !off ? 'on' : '');
        pip.dataset.level = i;
        pips.append(pip);
      }
      box.append(pips, el('span', 'set-n', off || `${level * 10}%`));
      row(label, box, (dir, wrap, at) => this.h.volume(kind, (at ? Number(at) : wrap && level === 10 ? 0 : clamp(level + dir, 0, 10)) / 10));
    };
    slider('SOUND', 'sfx', this.muted && 'MUTED');
    slider('MUSIC', 'music', this.musicOn === false && 'OFF');
    const cycle = (n, dir) => (n + dir + SHAKE_LEVELS.length) % SHAKE_LEVELS.length;
    row('SCREEN SHAKE', SHAKE_LEVELS[settings.shake].label, (dir) => {
      settings.shake = cycle(settings.shake, dir);
      saveSettings();
    });
    row('HURT FLASH', settings.flash ? 'ON' : 'OFF', () => {
      settings.flash = !settings.flash;
      saveSettings();
    });
    row('FULLSCREEN', this.fullscreenOn ? 'ON' : 'OFF', () => this.h.fullscreen(), 'fs-only');
    row('AUTO-FIRE', this.autoFireOn === false ? 'OFF' : 'ON', () => this.h.autofire(), 'touch-only');
    const keys = row('KEYBOARD CONTROLS', '›', () => this.showKeys(), 'kbd-only link');
    keys.adjust = null; // ← → just move on from here
    if (focused >= 0 && this.current === 'scr-settings') list.children[focused]?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ key bindings
  showKeys() {
    this.capturing = null;
    this.showScreen('scr-keys');
    this.renderKeys('CLICK AN ACTION, THEN PRESS ITS NEW KEY', 'p1:up');
  }

  renderKeys(hint, focusId) {
    const grid = $('keys-grid');
    grid.innerHTML = '';
    for (const [scheme, title] of [['p1', 'PLAYER 1 · KEYBOARD + MOUSE'], ['p2', 'PLAYER 2 · KEYBOARD']]) {
      const col = el('div', 'keys-col');
      col.append(el('div', 'keys-title', title));
      for (const a of ACTIONS) {
        if (a.p2Only && scheme === 'p1') continue;
        const id = `${scheme}:${a.id}`;
        const waiting = this.capturing?.id === id;
        const b = el('button', `btn key-row${waiting ? ' waiting' : ''}`);
        b.dataset.id = id;
        const v = el('span', 'kr-v');
        if (waiting) v.append(el('span', 'kr-wait', 'PRESS A KEY'));
        else for (const c of settings.keys[scheme][a.id]) v.append(el('kbd', '', keyLabel(c)));
        b.append(el('span', 'kr-k', a.label), v);
        b.addEventListener('click', () => {
          this.h.click?.();
          this.capturing = waiting ? null : { scheme, action: a.id, id };
          this.renderKeys(waiting ? '' : `PRESS THE NEW KEY FOR ${a.label} · ESC CANCELS`, id);
        });
        col.append(b);
      }
      if (scheme === 'p1') col.append(el('div', 'keys-note', 'THE MOUSE AIMS AND SHOOTS. RIGHT CLICK: ABILITY. WHEEL, 1 AND 2: SWAP GUN.'));
      grid.append(col);
    }
    $('keys-hint').textContent = hint;
    if (focusId) grid.querySelector(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
  }

  onCaptureKey(e) {
    if (!this.capturing || this.current !== 'scr-keys') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Ctrl, Alt and Cmd stay free for browser shortcuts (Shift is fine: it's a dash key)
    if (e.repeat || ['Control', 'Alt', 'Meta'].includes(e.key)) return;
    const { scheme, action, id } = this.capturing;
    if (e.code === 'Escape') {
      this.capturing = null;
      this.renderKeys('', id);
      return;
    }
    if (RESERVED[e.code]) {
      $('keys-hint').textContent = `${keyLabel(e.code)} IS FOR ${RESERVED[e.code]}. PICK ANOTHER KEY`;
      return;
    }
    const took = bindKey(scheme, action, e.code);
    this.capturing = null;
    const name = (t) => `P${t.scheme.slice(1)} ${ACTIONS.find((x) => x.id === t.action).label}`;
    this.renderKeys(took ? `${keyLabel(e.code)} WAS ${name(took)}, SO THE TWO SWAPPED` : '', id);
    this.h.click?.();
    this.refreshKeyHints();
  }

  // The guide opens from the title or the pause menu, and BACK returns to wherever it came from.
  showGuide(from = 'title') {
    this.guideFrom = from;
    if (!this.guideTabs) {
      this.guideTabs = buildGuide($('guide-tabs'), $('guide-body'), (id) => this.selectGuideTab(id));
      this.selectGuideTab(this.guideTabs[0].id);
    } else this.guideTabs.find((t) => t.id === 'controls').rebuild(); // the keys may have been rebound
    this.showScreen('scr-guide');
    this.guideTabs.find((t) => t.id === this.guideTab).btn.focus({ preventScroll: true });
  }

  selectGuideTab(id) {
    if (this.guideTab === id) return;
    this.guideTab = id;
    for (const t of this.guideTabs) {
      t.btn.classList.toggle('active', t.id === id);
      t.panel.classList.toggle('active', t.id === id);
    }
    $('guide-body').scrollTop = 0;
  }

  closeGuide() {
    if (this.guideFrom === 'pause') this.showScreen('scr-pause');
    else this.h.back();
  }

  // Solo: pick one survivor. Co-op: player 1 picks, then player 2 picks from the ones left.
  showSelect(mode, onPick, taken = null) {
    const p2 = mode === 2 && taken;
    $('select-title').textContent = mode === 2 ? `PLAYER ${p2 ? 2 : 1} — CHOOSE YOUR SURVIVOR` : 'CHOOSE YOUR SURVIVOR';
    $('select-title').style.color = mode === 2 ? PLAYER_COLORS[p2 ? 1 : 0] : '';
    $('select-hint').textContent = mode === 1
      ? this.touch ? 'TAP A SURVIVOR TO PICK' : 'PRESS 1-4 OR CLICK TO PICK'
      : p2 ? 'P2 USES A GAMEPAD OR ARROW KEYS · BACK RETURNS TO PLAYER 1' : 'THEN PLAYER 2 PICKS FROM THE REST';
    // BACK on player 2's turn goes back to player 1's pick instead of the title
    this.selectBack = p2 ? () => this.showSelect(mode, onPick) : null;
    const row = $('char-row');
    row.innerHTML = '';
    Object.values(CHARACTERS).forEach((c, i) => {
      const card = el('button', 'char-card');
      card.style.setProperty('--cc', c.color);
      if (c.id === taken) {
        card.disabled = true;
        card.append(el('span', 'char-taken', 'P1'));
      }
      const portrait = el('div', 'char-portrait');
      portrait.append(pix(SPR.players[c.id].frames[0], 4));
      const gun = pix(SPR.guns[c.weapon].img, 2, 'char-gun');
      portrait.append(gun);
      const info = el('div', 'char-info');
      info.append(el('div', 'char-name', c.name), el('div', 'char-title', c.title));
      const bars = el('div', 'char-bars');
      for (const [label, v] of [['HEALTH', c.bars.hp], ['SPEED', c.bars.speed], ['POWER', c.bars.power]]) {
        const b = el('div', 'bar-row');
        b.append(el('span', 'bar-label', label));
        const segs = el('span', 'segs');
        for (let k = 0; k < 5; k++) segs.append(el('i', k < v ? 'on' : ''));
        b.append(segs);
        bars.append(b);
      }
      info.append(bars);
      const details = el('div', 'char-details');
      details.append(
        el('div', 'kv', WEAPONS[c.weapon].name),
        el('div', 'desc', WEAPONS[c.weapon].desc),
        el('div', 'kv', c.abilityName),
        el('div', 'desc', c.abilityDesc),
        el('div', 'desc passive', c.passive),
      );
      info.append(details);
      card.append(el('span', 'key', String(i + 1)), portrait, info);
      card.addEventListener('click', () => {
        this.h.click?.();
        if (mode === 2 && !taken) {
          this.showSelect(mode, onPick, c.id);
          return;
        }
        this.showScreen(null);
        onPick(mode, taken ? [taken, c.id] : [c.id]);
      });
      row.append(card);
    });
    this.showScreen('scr-select');
    row.querySelector('.char-card:not([disabled])').focus({ preventScroll: true });
  }

  goBack() {
    if (this.current === 'scr-select' && this.selectBack) this.selectBack();
    else if (this.current === 'scr-settings') this.closeSettings();
    else if (this.current === 'scr-keys') this.showSettings();
    else this.h.back();
  }

  // `next`: the coming wave from WaveManager.preview(), so you can pick for it (the tracker before fog...)
  showUpgrade(player, choices, wave, next, rerolls, onPick, onReroll) {
    this.onReroll = onReroll;
    const coop = player.game.players.length > 1;
    $('up-title').textContent = `WAVE ${wave} CLEARED`;
    const sub = $('up-sub');
    sub.textContent = `${coop ? `PLAYER ${player.index + 1} · ` : ''}${player.char.name} — PICK ONE`;
    sub.style.color = coop ? PLAYER_COLORS[player.index] : player.char.color;
    const nx = $('up-next');
    nx.innerHTML = '';
    const sp = SPECIALS[next.special];
    const [what, color] = next.bosses.length ? [`BOSS: ${bossNames(next.bosses)}`, '#ff4a3a'] : sp ? [`${sp.name} — ${sp.sub}`, sp.color] : [];
    nx.append(`NEXT: WAVE ${next.n}`);
    if (what) {
      const w = el('span', '', what);
      w.style.color = color;
      nx.append(' · ', w);
    }
    const wrap = $('up-cards');
    wrap.innerHTML = '';
    choices.forEach((u, i) => {
      const lvl = player.upgrades[u.id] || 0;
      const card = el('button', `card c-${u.cat} r-${u.rarity}${u.modifier ? ' modifier' : ''}`);
      const band = el('div', 'card-band');
      band.append(el('span', 'card-cat', u.modifier ? `${CATEGORY[u.cat].label} · TRADE-OFF` : CATEGORY[u.cat].label));
      band.append(el('span', 'key', String(i + 1)));
      card.append(band);
      const rar = el('div', 'card-rarity');
      rar.append(pips('rarity-pips', RARITY_PIPS[u.rarity]), el('span', '', RARITY[u.rarity].label));
      card.append(rar);
      const ic = el('div', 'card-icon');
      ic.append(upgradeIcon(u, 5));
      card.append(ic);
      card.append(el('div', 'card-name', u.name));
      card.append(cardDesc(u));
      const foot = el('div', 'card-level');
      if (u.max >= 99) foot.append(el('span', '', 'INSTANT'));
      else {
        if (u.max > 1) foot.append(pips('level-pips', u.max, lvl, lvl));
        foot.append(el('span', '', lvl ? `LV ${lvl} → ${lvl + 1}` : 'NEW'));
      }
      card.append(foot);
      card.addEventListener('click', () => {
        if (this.current !== 'scr-upgrade') return;
        this.showScreen(null);
        onPick(u);
      });
      wrap.append(card);
    });
    const rr = $('up-reroll');
    rr.textContent = `REROLL (${rerolls})`;
    rr.disabled = rerolls <= 0;
    this.renderOwned($('up-owned'), [player]);
    this.showScreen('scr-upgrade');
  }

  hideUpgrade() {
    if (this.current === 'scr-upgrade') this.showScreen(null);
  }

  renderOwned(container, players, none = 'NO UPGRADES YET') {
    container.innerHTML = '';
    for (const p of players) {
      const ids = Object.keys(p.upgrades);
      const row = el('div', 'owned-row');
      row.append(el('span', 'owned-label', ids.length ? `${p.char.name} BUILD` : `${p.char.name} · ${none}`));
      for (const id of ids) {
        const u = UPGRADE_BY_ID[id];
        if (!u) continue;
        const chip = el('span', `chip c-${u.cat} r-${u.rarity}`);
        chip.title = `${u.name}: ${u.desc}`;
        chip.append(upgradeIcon(u, 2));
        if (p.upgrades[id] > 1) chip.append(el('b', '', `x${p.upgrades[id]}`));
        row.append(chip);
      }
      container.append(row);
    }
  }

  showPause(game) {
    this.renderOwned($('pause-owned'), game.players);
    this.showScreen('scr-pause');
  }

  showGameOver(s) {
    this.hideHUD();
    const box = $('over-stats');
    box.innerHTML = '';
    const rows = [
      ['WAVE REACHED', s.wave],
      ['ZOMBIES KILLED', fmtInt(s.kills)],
      ['SCORE', fmtInt(s.score)],
      ['TIME SURVIVED', fmtTime(s.time)],
    ];
    const coop = s.players.length > 1;
    if (!coop && s.cause) rows.push(['KILLED BY', causeLabel(s.cause)]);
    for (const [k, v] of rows) {
      const r = el('div', 'stat');
      r.append(el('span', 'k', k), el('span', 'v', String(v)));
      box.append(r);
    }
    if (coop) {
      for (const p of s.players) {
        const r = el('div', 'stat small');
        r.style.color = p.char.color;
        r.append(el('span', 'k', `${p.char.name} · ${fmtInt(p.kills)} KILLS`), el('span', 'v', p.downedBy ? `DOWNED BY ${causeLabel(p.downedBy)}` : ''));
        box.append(r);
      }
    }
    box.append(el('div', `best ${s.newBest ? 'new' : ''}`, s.newBest ? '★ NEW BEST SCORE ★' : `BEST: WAVE ${s.best.wave} · ${fmtInt(s.best.score)}`));
    this.renderOwned($('over-owned'), s.players, 'NO UPGRADES');
    this.showScreen('scr-over');
  }

  // ------------------------------------------------------------------ banner
  banner(title, sub = '', color = '#f3e6c8') {
    const b = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    b.style.setProperty('--bc', color);
    b.classList.remove('hidden', 'show');
    void b.offsetWidth; // restart the CSS animation
    b.classList.add('show');
  }
  hideBanner() {
    $('banner').classList.add('hidden');
  }

  // ------------------------------------------------------------------ HUD
  showHUD(game) {
    const hud = $('hud');
    hud.classList.remove('hidden');
    const wrap = $('hud-players');
    wrap.innerHTML = '';
    this.hudCache.clear();
    this.panels = game.players.map((p, i) => {
      const panel = el('div', `pp ${i === 1 ? 'right' : ''}`);
      panel.style.setProperty('--pc', game.players.length > 1 ? PLAYER_COLORS[i] : p.char.color);
      const portrait = el('div', 'pp-portrait');
      portrait.append(pix(p.sprites.head, 3));
      const main = el('div', 'pp-main');
      const name = el('div', 'pp-name', game.players.length > 1 ? `P${i + 1} · ${p.char.name}` : p.char.name);
      const hp = el('div', 'pp-hp');
      const hpFill = el('i', 'pp-hp-fill');
      const hpText = el('span', 'pp-hp-text');
      hp.append(hpFill, hpText);
      // magazine: shells for small mags, a segmented bar for big ones
      const wpn = el('div', 'pp-weapon');
      const mag = el('div', 'mag');
      const ammo = el('span', 'pp-ammo');
      const reserve = el('span', 'pp-reserve');
      const count = el('span', 'pp-count');
      count.append(ammo, ' ', reserve);
      wpn.append(mag, count);
      const cds = el('div', 'pp-cds');
      const ab = el('div', 'cd');
      ab.append(pix(icon(p.char.abilityIcon), 2));
      const abFill = el('i');
      // key hints, filled in by refreshKeyHints() since the keys can be rebound
      const keys = { ability: el('span', 'cd-key'), dash: el('span', 'cd-key'), flare: el('span', 'cd-key') };
      ab.append(abFill, keys.ability);
      const da = el('div', 'cd');
      da.append(pix(icon('dash'), 2));
      const daFill = el('i');
      da.append(daFill, keys.dash);
      const fl = el('div', 'cd item empty');
      fl.append(pix(icon('flare'), 2));
      const flCount = el('b', 'cd-count');
      fl.append(flCount, keys.flare);
      const buffs = el('span', 'pp-buffs');
      cds.append(ab, da, fl, buffs);
      main.append(name, hp, wpn, cds);
      // weapon rack: active gun big and bright, holstered gun small and dim
      const rack = el('div', 'pp-rack');
      const slots = [0, 1].map((n) => {
        const node = el('div', 'slot');
        const gun = el('span', 'slot-gun');
        const label = el('span', 'slot-label');
        node.append(el('span', 'slot-key', String(n + 1)), gun, label);
        rack.append(node);
        return { node, gun, label, gunKey: '' };
      });
      panel.append(portrait, main, rack);
      wrap.append(panel);
      return { panel, hpFill, hpText, mag, ammo, reserve, abFill, daFill, fl, flCount, buffs, slots, keys, magKey: null, slot: null };
    });
    this.refreshKeyHints();
  }

  // P1's panel shows P1's keys, P2's panel the P2 keyboard keys.
  refreshKeyHints() {
    this.panels?.forEach((P, i) => {
      for (const [action, node] of Object.entries(P.keys)) node.textContent = actionKey(`p${i + 1}`, action);
    });
  }

  hideHUD() {
    $('hud').classList.add('hidden');
  }

  set(key, node, prop, value) {
    const k = key;
    if (this.hudCache.get(k) === value) return;
    this.hudCache.set(k, value);
    if (prop === 'text') node.textContent = value;
    else if (prop === 'width') node.style.width = value;
    else if (prop === 'height') node.style.height = value;
    else if (prop === 'class') node.className = value;
    else if (prop === 'color') node.style.color = value;
  }

  updateHUD(game) {
    if (!this.panels || game.state === 'title') return;
    const w = game.waves;
    const sp = SPECIALS[w.special];
    this.set('wave', $('hud-wave'), 'text', sp ? `WAVE ${w.wave} · ${sp.name}` : `WAVE ${w.wave}`);
    this.set('wavec', $('hud-wave'), 'color', sp ? sp.color : '');
    const left = w.state === 'fight' || w.state === 'intro' ? `${w.remaining} ZOMBIES LEFT` : w.state === 'cleared' ? 'CLEARED' : '';
    this.set('left', $('hud-left'), 'text', left);
    this.set('score', $('hud-score'), 'text', fmtInt(game.stats.score));
    this.set('kills', $('hud-kills'), 'text', fmtInt(game.stats.kills));
    const boss = game.bossRef && !game.bossRef.dead ? game.bossRef : null;
    this.set('bossvis', $('hud-boss'), 'class', boss ? boss.type : 'hidden'); // the class tints the bar per boss
    if (boss) {
      this.set('bossname', $('hud-boss-name'), 'text', boss.def.name);
      this.set('bossfill', $('hud-boss-fill'), 'width', `${Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1)}%`);
    }

    game.players.forEach((p, i) => {
      const P = this.panels[i];
      if (!P) return;
      const k = (s) => `p${i}${s}`;
      this.set(k('state'), P.panel, 'class', `pp ${i === 1 ? 'right' : ''} ${p.state}${p.hurtFlash > 0 ? ' hurt' : ''}${p.rage > 0 ? ' rage' : ''}`);
      this.set(k('hpw'), P.hpFill, 'width', `${Math.max(0, (p.hp / p.maxHp) * 100).toFixed(1)}%`);
      const hpText = p.state === 'downed' ? 'DOWN — GET REVIVED' : p.state === 'dead' ? 'DEAD — BACK NEXT WAVE' : `${Math.ceil(p.hp)} / ${p.maxHp}`;
      this.set(k('hpt'), P.hpText, 'text', hpText);
      const wpn = p.weapon;
      this.updateMag(P, k, wpn);
      this.set(k('ammo'), P.ammo, 'text', wpn.reloadT > 0 ? 'RELOAD' : String(wpn.ammo));
      this.set(k('ammoc'), P.ammo, 'class', wpn.reloadT > 0 ? 'pp-ammo reloading' : 'pp-ammo');
      this.set(k('res'), P.reserve, 'text', wpn.def.infinite ? '/ ∞' : `/ ${wpn.reserve}`);
      this.updateRack(P, k, p);
      const abK = p.abilityCd / (p.char.abilityCd * p.stats.abilityCdMul);
      this.set(k('ab'), P.abFill, 'height', `${Math.round(Math.max(0, abK) * 100)}%`);
      this.set(k('da'), P.daFill, 'height', `${Math.round(Math.max(0, p.dashCd / (1.3 * p.stats.dashCdMul)) * 100)}%`);
      this.set(k('fl'), P.fl, 'class', `cd item${p.flares > 0 ? '' : ' empty'}`);
      this.set(k('flc'), P.flCount, 'text', p.flares > 1 ? `x${p.flares}` : '');
      const buffs = [];
      if (p.rage > 0) buffs.push(`RAGE ${Math.ceil(p.rage)}`);
      if (p.stats.secondWind) buffs.push('2ND WIND');
      this.set(k('buffs'), P.buffs, 'text', buffs.join(' · '));
    });
  }

  updateMag(P, k, w) {
    const size = w.magSize();
    const shells = size <= 16;
    const key = `${w.owner.slot}:${w.id}:${size}`;
    if (P.magKey !== key) {
      // rebuild when the gun or its mag size changes
      P.magKey = key;
      P.mag.innerHTML = '';
      P.shells = [];
      if (shells) {
        for (let i = 0; i < size; i++) P.shells.push(P.mag.appendChild(el('i', 'shell')));
      } else {
        P.magFill = P.mag.appendChild(el('i', 'mag-fill'));
      }
      this.hudCache.delete(k('magc'));
      this.hudCache.delete(k('magn'));
    }
    const reloading = w.reloadT > 0;
    const frac = reloading ? 1 - w.reloadT / w.reloadTime() : w.ammo / size;
    const low = !reloading && w.ammo <= Math.max(1, Math.floor(size * 0.25));
    this.set(k('magc'), P.mag, 'class', `mag ${shells ? 'shells' : 'bar'}${reloading ? ' reloading' : ''}${low ? ' low' : ''}`);
    if (shells) {
      const n = Math.round(frac * size);
      if (this.hudCache.get(k('magn')) !== n) {
        this.hudCache.set(k('magn'), n);
        P.shells.forEach((s, i) => (s.className = i < n ? 'shell' : 'shell spent'));
      }
    } else {
      this.set(k('magn'), P.magFill, 'width', `${(frac * 100).toFixed(1)}%`);
    }
  }

  updateRack(P, k, p) {
    // the slots pop for a moment after a swap
    if (P.slot !== null && P.slot !== p.slot) P.popUntil = performance.now() + 260;
    P.slot = p.slot;
    const pop = performance.now() < (P.popUntil || 0);
    p.weapons.forEach((w, n) => {
      const S = P.slots[n];
      if (!w) {
        // nothing picked up yet
        if (S.gunKey !== null) {
          S.gunKey = null;
          S.gun.innerHTML = '';
        }
        this.set(k(`sl${n}`), S.label, 'text', 'NO GUN');
        this.set(k(`sc${n}`), S.node, 'class', 'slot holster none');
        return;
      }
      const active = n === p.slot;
      if (S.gunKey !== `${w.id}:${active}`) {
        S.gunKey = `${w.id}:${active}`;
        S.gun.innerHTML = '';
        S.gun.append(pix(SPR.guns[w.id].img, active ? 2 : 1));
      }
      const dry = !w.def.infinite && w.ammo + w.reserve <= 0;
      const label = active ? w.def.short : dry ? 'EMPTY' : w.def.infinite ? '∞' : String(w.ammo + w.reserve);
      this.set(k(`sl${n}`), S.label, 'text', label);
      const fresh = n === 1 && p.newGunT > 0;
      this.set(k(`sc${n}`), S.node, 'class', `slot ${active ? 'active' : 'holster'}${dry ? ' dry' : ''}${fresh ? ' fresh' : ''}${pop ? ' pop' : ''}`);
    });
  }

  // ------------------------------------------------------------------ menu navigation (keys + gamepad)
  focusables() {
    if (!this.current) return [];
    // only visible ones: a hidden button (fullscreen on iPhone, auto-fire on desktop) can't take focus
    return [...$(this.current).querySelectorAll('button:not([disabled])')].filter((b) => b.getClientRects().length);
  }

  moveFocus(dir) {
    const list = this.focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = list[(i + dir + list.length) % list.length] || list[0];
    next.focus({ preventScroll: true });
    this.h.click?.();
  }

  onKey(e) {
    if (!this.current) return;
    if (this.locked) {
      // Enter / Space would "click" the focused button natively, so swallow those too
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (this.asleep && this.current === 'scr-title') {
      if (e.metaKey || e.ctrlKey || e.altKey || /^F\d+$/.test(e.key) || SPLASH_IGNORE.includes(e.key)) return;
      // swallow the key: it shouldn't also toggle sound (M/N) or press the button that gets focus
      e.preventDefault();
      e.stopImmediatePropagation();
      this.wake();
      return;
    }
    const code = e.code;
    const side = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }[code];
    if (side && document.activeElement?.adjust && this.current === 'scr-settings') {
      e.preventDefault();
      document.activeElement.adjust(side);
    } else if (['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'].includes(code)) {
      e.preventDefault();
      this.moveFocus(1);
    } else if (['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(code)) {
      e.preventDefault();
      this.moveFocus(-1);
    } else if (/^Digit[1-4]$/.test(code)) {
      const n = Number(code.slice(5)) - 1;
      const cards = $(this.current).querySelectorAll('.card, .char-card');
      cards[n]?.click();
    } else if (code === 'Escape') {
      if (['scr-select', 'scr-records', 'scr-fstip'].includes(this.current)) this.goBack();
      else if (this.submenu) {
        // consume it, or the pause handler would see ESC on the pause menu and resume the game
        e.stopImmediatePropagation();
        if (this.current === 'scr-guide') this.closeGuide();
        else this.goBack();
      }
    } else if (code === 'KeyR' && this.current === 'scr-upgrade') {
      this.onReroll?.();
    }
  }

  pollGamepad(input, dt) {
    if (!this.current || !input.pads.length || this.locked) return;
    if (this.asleep && this.current === 'scr-title') {
      if (input.pads.some((p, i) => p.buttons.some((_, b) => input.padHit(i, b)))) this.wake();
      return;
    }
    this.padNavCd -= dt;
    for (let i = 0; i < input.pads.length; i++) {
      const p = input.pad(i);
      const y = p.axes[1] || 0, x = p.axes[0] || 0;
      const side = input.padDown(i, 15) || x > 0.6 ? 1 : input.padDown(i, 14) || x < -0.6 ? -1 : 0;
      const dir = input.padDown(i, 13) || y > 0.6 ? 1 : input.padDown(i, 12) || y < -0.6 ? -1 : side;
      if (dir && this.padNavCd <= 0) {
        this.padNavCd = 0.22;
        // left / right change a setting; everything else moves between buttons
        const adjust = this.current === 'scr-settings' && side && dir === side && document.activeElement?.adjust;
        if (adjust) adjust(side);
        else this.moveFocus(dir);
      }
      if (!dir && Math.abs(x) < 0.3 && Math.abs(y) < 0.3 && !input.padDown(i, 12) && !input.padDown(i, 13) && !input.padDown(i, 14) && !input.padDown(i, 15)) this.padNavCd = 0;
      if (input.padHit(i, 0)) document.activeElement?.click?.();
      if (input.padHit(i, 1)) {
        if (['scr-select', 'scr-records', 'scr-fstip', 'scr-settings', 'scr-keys'].includes(this.current)) this.goBack();
        else if (this.current === 'scr-guide') this.closeGuide();
        else if (this.current === 'scr-pause') this.h.resume();
      }
      if (input.padHit(i, 3) && this.current === 'scr-upgrade') this.onReroll?.();
    }
  }
}
