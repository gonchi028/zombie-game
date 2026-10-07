// Procedural soundtrack: a small step sequencer that synthesizes every note with Web Audio.
// Each mood (title, wave, boss, calm, over) is a looping 16-step pattern with its own bus, so moods
// crossfade into each other. During waves, layers fade in as the horde closes in (intensity).
import { storage, clamp } from './utils.js';

const LOOKAHEAD = 0.25; // seconds of notes scheduled ahead of the audio clock
const VOLUME = 0.16;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ compositions
// All in A minor. Chords are MIDI notes; roots are bass notes.
const WAVE = {
  bpm: 104,
  roots: [45, 41, 38, 40], // Am F Dm E
  chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
  bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0],
};
const BOSS = {
  bpm: 132,
  roots: [33, 33, 34, 28], // A A Bb E (phrygian menace)
  riff: { 0: 57, 3: 58, 6: 57, 8: 55, 11: 57, 14: 60 },
};
const CALM = {
  bpm: 72,
  roots: [45, 41, 36, 43], // Am F C G
  chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]],
};
const PENTA = [69, 72, 74, 76, 79, 81]; // A minor pentatonic, for the ambient bells

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.enabled = storage.get('ll_music', true);
    this.ctx = null;
    this.mood = null;
    this.intensity = 0;
    this.paused = false;
  }

  // Built lazily: the AudioContext only exists after the first user gesture.
  build() {
    const ctx = (this.ctx = this.sfx.ctx);
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? VOLUME : 0;
    this.tone = ctx.createBiquadFilter(); // muffles the music while paused
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.connect(this.out).connect(this.sfx.master);
    // a shared echo for leads and bells
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.43;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    this.echo.connect(damp).connect(fb).connect(this.echo);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.echo.connect(wet).connect(this.tone);
    this.moods = {};
    for (const name of ['title', 'wave', 'boss', 'calm', 'over']) {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      bus.connect(this.tone);
      this.moods[name] = { name, bus, step: 0, next: 0, until: 0 };
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    storage.set('ll_music', this.enabled);
    if (this.out) this.out.gain.setTargetAtTime(this.enabled ? VOLUME : 0, this.ctx.currentTime, 0.15);
    return this.enabled;
  }

  // Pick the mood from the game state, then keep the scheduler topped up.
  update(dt, game) {
    if (!this.sfx.ctx || this.sfx.ctx.state !== 'running') return;
    if (!this.ctx) this.build();
    const now = this.ctx.currentTime;

    let mood = 'title';
    const s = game.state;
    if (s === 'dying' || s === 'gameover') mood = 'over';
    else if (s === 'upgrade') mood = 'calm';
    else if (s === 'playing' || s === 'paused') {
      const w = game.waves.state;
      if (game.bossRef && !game.bossRef.dead) mood = 'boss';
      else mood = w === 'cleared' || w === 'idle' ? 'calm' : 'wave';
    }
    this.setMood(mood, now);

    const paused = s === 'paused';
    if (paused !== this.paused) {
      this.paused = paused;
      this.tone.frequency.setTargetAtTime(paused ? 650 : 18000, now, 0.12);
      if (this.enabled) this.out.gain.setTargetAtTime(paused ? VOLUME * 0.45 : VOLUME, now, 0.12);
    }

    // intensity: how close the horde is, plus a little for how deep into the run you are
    if (s === 'playing') {
      let crowd = 0;
      for (const p of game.players) if (p.alive) crowd = Math.max(crowd, game.zombiesNear(p.x, p.y, 110).length);
      const intro = game.waves.state === 'intro';
      const target = intro ? 0.15 : clamp(0.22 + crowd / 16 + Math.min(1, game.waves.wave / 12) * 0.2, 0, 1);
      // rise fast when things get hairy, settle slowly
      this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 2.5 : 0.4));
    }

    if (!this.enabled) return;
    for (const m of Object.values(this.moods)) {
      if (m.name !== this.mood && now > m.until) continue;
      // after a hidden tab or a long hitch, don't try to play the missed notes
      if (m.next < now - 0.1) m.next = now + 0.05;
      const def = { wave: WAVE, boss: BOSS, calm: CALM }[m.name];
      const stepDur = 60 / (def ? def.bpm : 60) / 4;
      while (m.next < now + LOOKAHEAD) {
        this[m.name](m.step % 16, Math.floor(m.step / 16), m.next, stepDur, m.bus);
        m.next += stepDur;
        m.step++;
      }
    }
  }

  setMood(name, now) {
    if (name === this.mood) return;
    const prev = this.mood && this.moods[this.mood];
    if (prev) {
      prev.bus.gain.cancelScheduledValues(now);
      prev.bus.gain.setValueAtTime(prev.bus.gain.value, now);
      prev.bus.gain.linearRampToValueAtTime(0, now + 1.5);
      prev.until = now + 1.6; // keep it playing while it fades out
    }
    const m = this.moods[name];
    if (now > m.until) {
      // start fresh at the top of the loop
      m.step = 0;
      m.next = now + 0.08;
    }
    m.bus.gain.cancelScheduledValues(now);
    m.bus.gain.setValueAtTime(m.bus.gain.value, now);
    m.bus.gain.linearRampToValueAtTime(1, now + (name === 'boss' ? 0.6 : 2));
    m.until = Infinity;
    this.mood = name;
  }

  // ------------------------------------------------------------------ moods
  wave(s, bar, t, step, bus) {
    const b = bar % 4, k = this.intensity;
    if (s === 0) this.pad(t, WAVE.chords[b], step * 16, bus, 0.035);
    if (WAVE.bass[s]) this.bass(t, WAVE.roots[b] + (s === 10 || s === 14 ? 12 : 0), step * 1.6, bus, 0.32);
    if (k < 0.5 ? s % 8 === 0 : s % 4 === 0) this.kick(t, bus, 0.8);
    if (k > 0.35 && (s === 4 || s === 12)) this.snare(t, bus, 0.32);
    if (k > 0.2 && s % 2 === 1) this.hat(t, bus, 0.1);
    else if (k > 0.7 && s % 2 === 0) this.hat(t, bus, 0.05);
    if (k > 0.55) {
      const ch = WAVE.chords[b];
      const note = [ch[0], ch[1], ch[2], ch[1] + 12][s % 4] + 12;
      this.lead(t, note, step * 0.9, bus, 0.045 * Math.min(1, (k - 0.55) * 4), 'square');
    }
    if (b === 3 && s >= 12 && k > 0.6) this.snare(t, bus, 0.12 + (s - 12) * 0.05); // fill into the next loop
  }

  boss(s, bar, t, step, bus) {
    const b = bar % 4;
    const root = BOSS.roots[b];
    if (s % 4 === 0 || s === 14) this.kick(t, bus, 0.9);
    if (s % 4 !== 3) this.bass(t, root + (s % 4 === 0 ? 0 : 12), step * 0.8, bus, s % 4 === 0 ? 0.36 : 0.22, true);
    if (s === 4 || s === 12) this.snare(t, bus, 0.38);
    if (s % 2 === 1) this.hat(t, bus, 0.08);
    if (b === 3 && s >= 8 && s % 2 === 0) this.tom(t, 110 - (s - 8) * 8, bus);
    if (b < 2 && BOSS.riff[s]) this.lead(t, BOSS.riff[s] + (b === 1 && s > 7 ? -2 : 0), step * 2.5, bus, 0.05, 'sawtooth', true);
    if (s === 0) this.pad(t, [root + 24, root + 31], step * 16, bus, 0.03);
  }

  calm(s, bar, t, step, bus) {
    const b = bar % 4;
    const ch = CALM.chords[b];
    if (s === 0) {
      this.pad(t, ch, step * 16, bus, 0.04);
      this.sub(t, CALM.roots[b] - 12, step * 14, bus);
    }
    if (s % 4 === 0) this.bell(t, ch[(s / 4 + bar) % ch.length] + 12, bus, 0.07);
    if (s === 10) this.bell(t, ch[2] + 24, bus, 0.035);
  }

  title(s, bar, t, step, bus) {
    // slow drone that alternates Am and F every two bars, a faint heartbeat, and stray bells
    if (s === 0 && bar % 2 === 0) this.pad(t, bar % 4 === 0 ? [45, 52, 57] : [41, 48, 57], step * 32, bus, 0.045);
    if (s === 0 || s === 3) this.kick(t, bus, s === 0 ? 0.35 : 0.22);
    if (s % 2 === 0 && Math.random() < 0.14) this.bell(t, PENTA[Math.floor(Math.random() * PENTA.length)], bus, 0.06);
  }

  over(s, bar, t, step, bus) {
    if (s === 0 && bar % 2 === 0) this.pad(t, bar % 4 === 0 ? [38, 45, 53] : [45, 52, 60], step * 32, bus, 0.04);
    if (s % 4 === 0 && Math.random() < 0.18) this.bell(t, PENTA[Math.floor(Math.random() * 3)] - 12, bus, 0.05);
  }

  // ------------------------------------------------------------------ instruments
  env(t, peak, attack, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  osc(type, freq, t, dur, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noise(t, dur, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.sfx.noise;
    src.connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  kick(t, bus, vol) {
    const g = this.env(t, vol, 0.002, 0.28);
    g.connect(bus);
    const o = this.osc('sine', 150, t, 0.3, g);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  }

  snare(t, bus, vol) {
    const g = this.env(t, vol, 0.002, 0.16);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    f.connect(g).connect(bus);
    this.noise(t, 0.18, f);
    const body = this.env(t, vol * 0.5, 0.002, 0.08);
    body.connect(bus);
    this.osc('triangle', 190, t, 0.1, body);
  }

  hat(t, bus, vol) {
    const g = this.env(t, vol, 0.001, 0.045);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    f.connect(g).connect(bus);
    this.noise(t, 0.06, f);
  }

  tom(t, freq, bus) {
    const g = this.env(t, 0.45, 0.002, 0.3);
    g.connect(bus);
    const o = this.osc('sine', freq, t, 0.32, g);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.25);
  }

  bass(t, note, dur, bus, vol, gritty = false) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = gritty ? 6 : 3;
    f.frequency.setValueAtTime(gritty ? 1400 : 900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = this.env(t, vol, 0.004, dur);
    f.connect(g).connect(bus);
    const hz = mtof(note);
    this.osc('sawtooth', hz, t, dur, f);
    this.osc('square', hz / 2, t, dur, f, 4);
  }

  sub(t, note, dur, bus) {
    const g = this.env(t, 0.18, 0.3, dur);
    g.connect(bus);
    this.osc('sine', mtof(note), t, dur, g);
  }

  pad(t, notes, dur, bus, vol) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.8, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    f.connect(g).connect(bus);
    for (const n of notes) for (const d of [-9, 0, 8]) this.osc('sawtooth', mtof(n), t, dur + 0.6, f, d);
  }

  lead(t, note, dur, bus, vol, type, gritty = false) {
    const g = this.env(t, vol, 0.005, dur);
    let dest = g;
    if (gritty) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1600;
      f.connect(g);
      dest = f;
    }
    g.connect(bus);
    g.connect(this.echo);
    this.osc(type, mtof(note), t, dur, dest);
    if (gritty) this.osc(type, mtof(note), t, dur, dest, 14);
  }

  bell(t, note, bus, vol) {
    const g = this.env(t, vol, 0.004, 1.8);
    g.connect(bus);
    g.connect(this.echo);
    this.osc('sine', mtof(note), t, 1.8, g);
    const over = this.env(t, vol * 0.35, 0.002, 0.6);
    over.connect(bus);
    this.osc('sine', mtof(note) * 2.76, t, 0.6, over);
  }
}
