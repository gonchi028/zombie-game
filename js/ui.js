// DOM overlay: title, character select, upgrade cards, pause, game over, HUD and banners.
import { CHARACTERS, WEAPONS } from './data.js';
import { SPR, icon } from './sprites.js';
import { UPGRADE_BY_ID, RARITY, CATEGORY } from './upgrades.js';
import { PLAYER_COLORS } from './config.js';
import { fmtInt } from './utils.js';
import { $, el, pix } from './dom.js';
import { buildGuide } from './guide.js';

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

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.screens = [...document.querySelectorAll('.screen')];
    this.current = null;
    this.hudCache = new Map();
    this.padNavCd = 0;
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
    $('up-reroll').addEventListener('click', () => this.onReroll?.());
    $('guide-back').addEventListener('click', () => {
      this.h.click?.();
      this.closeGuide();
    });
  }

  // ------------------------------------------------------------------ screens
  showScreen(id) {
    for (const s of this.screens) s.classList.toggle('active', s.id === id);
    this.current = id;
    if (id) {
      const first = $(id).querySelector('button.primary, .card, button');
      first?.focus({ preventScroll: true });
    } else {
      // A hidden button that keeps focus would still receive Space/Enter (dash / P2 fire) and re-click.
      document.activeElement?.blur?.();
    }
  }
  get menuOpen() {
    return !!this.current;
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
    document.querySelectorAll('[data-action="mute"]').forEach((b) => (b.textContent = `SOUND: ${muted ? 'OFF' : 'ON'}`));
    this.renderAudioHint();
  }

  refreshMusic(on) {
    this.musicOn = on;
    document.querySelectorAll('[data-action="music"]').forEach((b) => (b.textContent = `MUSIC: ${on ? 'ON' : 'OFF'}`));
    this.renderAudioHint();
  }

  renderAudioHint() {
    $('title-sound').textContent = `[M] SOUND ${this.muted ? 'OFF' : 'ON'} · [N] MUSIC ${this.musicOn === false ? 'OFF' : 'ON'}`;
  }

  // The guide opens from the title or the pause menu, and BACK returns to wherever it came from.
  showGuide(from = 'title') {
    this.guideFrom = from;
    if (!this.guideTabs) {
      this.guideTabs = buildGuide($('guide-tabs'), $('guide-body'), (id) => this.selectGuideTab(id));
      this.selectGuideTab(this.guideTabs[0].id);
    }
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
      ? 'PRESS 1-4 OR CLICK TO PICK'
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
    else this.h.back();
  }

  showUpgrade(player, choices, wave, rerolls, onPick, onReroll) {
    this.onReroll = onReroll;
    const coop = player.game.players.length > 1;
    $('up-title').textContent = `WAVE ${wave} CLEARED`;
    const sub = $('up-sub');
    sub.textContent = `${coop ? `PLAYER ${player.index + 1} · ` : ''}${player.char.name} — PICK ONE`;
    sub.style.color = coop ? PLAYER_COLORS[player.index] : player.char.color;
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

  renderOwned(container, players) {
    container.innerHTML = '';
    for (const p of players) {
      const ids = Object.keys(p.upgrades);
      const row = el('div', 'owned-row');
      row.append(el('span', 'owned-label', ids.length ? `${p.char.name} BUILD` : `${p.char.name} · NO UPGRADES YET`));
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
    for (const [k, v] of rows) {
      const r = el('div', 'stat');
      r.append(el('span', 'k', k), el('span', 'v', String(v)));
      box.append(r);
    }
    if (s.players.length > 1) {
      for (const p of s.players) {
        const r = el('div', 'stat small');
        r.style.color = p.color;
        r.append(el('span', 'k', `${p.name} KILLS`), el('span', 'v', fmtInt(p.kills)));
        box.append(r);
      }
    }
    box.append(el('div', `best ${s.newBest ? 'new' : ''}`, s.newBest ? '★ NEW BEST SCORE ★' : `BEST: WAVE ${s.best.wave} · ${fmtInt(s.best.score)}`));
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
      ab.append(abFill, el('span', 'cd-key', 'Q'));
      const da = el('div', 'cd');
      da.append(pix(icon('dash'), 2));
      const daFill = el('i');
      da.append(daFill, el('span', 'cd-key', 'SPC'));
      const fl = el('div', 'cd item empty');
      fl.append(pix(icon('flare'), 2));
      const flCount = el('b', 'cd-count');
      fl.append(flCount, el('span', 'cd-key', 'G'));
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
      return { panel, hpFill, hpText, mag, ammo, reserve, abFill, daFill, fl, flCount, buffs, slots, magKey: null, slot: null };
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
  }

  updateHUD(game) {
    if (!this.panels || game.state === 'title') return;
    const w = game.waves;
    this.set('wave', $('hud-wave'), 'text', `WAVE ${w.wave}`);
    const left = w.state === 'fight' || w.state === 'intro' ? `${w.remaining} ZOMBIES LEFT` : w.state === 'cleared' ? 'CLEARED' : '';
    this.set('left', $('hud-left'), 'text', left);
    this.set('score', $('hud-score'), 'text', fmtInt(game.stats.score));
    this.set('kills', $('hud-kills'), 'text', fmtInt(game.stats.kills));
    const boss = game.bossRef && !game.bossRef.dead ? game.bossRef : null;
    this.set('bossvis', $('hud-boss'), 'class', boss ? '' : 'hidden');
    if (boss) this.set('bossfill', $('hud-boss-fill'), 'width', `${Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1)}%`);

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
    return [...$(this.current).querySelectorAll('button:not([disabled])')];
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
    const code = e.code;
    if (['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'].includes(code)) {
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
      if (this.current === 'scr-select') this.goBack();
      else if (this.current === 'scr-guide') {
        // consume it, or the pause handler would see ESC on the pause menu and resume the game
        e.stopImmediatePropagation();
        this.closeGuide();
      }
    } else if (code === 'KeyR' && this.current === 'scr-upgrade') {
      this.onReroll?.();
    }
  }

  pollGamepad(input, dt) {
    if (!this.current || !input.pads.length) return;
    this.padNavCd -= dt;
    for (let i = 0; i < input.pads.length; i++) {
      const p = input.pad(i);
      const y = p.axes[1] || 0, x = p.axes[0] || 0;
      const dir = input.padDown(i, 13) || input.padDown(i, 15) || y > 0.6 || x > 0.6 ? 1
        : input.padDown(i, 12) || input.padDown(i, 14) || y < -0.6 || x < -0.6 ? -1 : 0;
      if (dir && this.padNavCd <= 0) {
        this.padNavCd = 0.22;
        this.moveFocus(dir);
      }
      if (!dir && Math.abs(x) < 0.3 && Math.abs(y) < 0.3 && !input.padDown(i, 12) && !input.padDown(i, 13) && !input.padDown(i, 14) && !input.padDown(i, 15)) this.padNavCd = 0;
      if (input.padHit(i, 0)) document.activeElement?.click?.();
      if (input.padHit(i, 1)) {
        if (this.current === 'scr-select') this.goBack();
        else if (this.current === 'scr-guide') this.closeGuide();
        else if (this.current === 'scr-pause') this.h.resume();
      }
      if (input.padHit(i, 3) && this.current === 'scr-upgrade') this.onReroll?.();
    }
  }
}
