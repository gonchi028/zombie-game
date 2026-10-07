// Procedural sound effects with the Web Audio API — no audio files needed.
import { storage } from './utils.js';

const MIN_GAP = {
  pistol: 0.03, rifle: 0.03, smg: 0.025, shotgun: 0.05, minigun: 0.02, hit: 0.03, zdie: 0.04,
  groan: 0.35, fizz: 0.1, explosion: 0.06, pickup: 0.05, hurt: 0.15, bark: 0.3, zap: 0.05, empty: 0.15,
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = storage.get('ll_muted', false);
    this.last = {};
  }

  // Must be called from a user gesture (browser autoplay policy).
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    storage.set('ll_muted', this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  // --- building blocks
  _noise(t, dur, vol, type, freq, q = 1, endFreq) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    f.Q.value = q;
    const gn = c.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(gn).connect(this.out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  _tone(t, dur, vol, type, f0, f1, attack = 0.002) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // vol 0..1, pan -1..1
  play(name, vol = 1, pan = 0) {
    if (!this.ctx || this.muted || vol <= 0.02) return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.02;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;

    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const bus = this.ctx.createGain();
    bus.gain.value = vol;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      bus.connect(panner).connect(this.master);
    } else bus.connect(this.master);
    this.out = bus;
    const t = now + 0.005;
    const r = Math.random;

    switch (name) {
      case 'pistol':
        this._noise(t, 0.12, 0.7, 'bandpass', 1900, 0.8);
        this._tone(t, 0.08, 0.35, 'square', 190, 60);
        break;
      case 'rifle':
        this._noise(t, 0.1, 0.65, 'bandpass', 1400 + r() * 200, 0.9);
        this._tone(t, 0.07, 0.3, 'square', 150, 50);
        break;
      case 'smg':
        this._noise(t, 0.07, 0.5, 'bandpass', 2300 + r() * 300, 1);
        this._tone(t, 0.05, 0.2, 'square', 210, 80);
        break;
      case 'minigun':
        this._noise(t, 0.06, 0.45, 'bandpass', 1700 + r() * 400, 1);
        break;
      case 'shotgun':
        this._noise(t, 0.32, 1, 'lowpass', 1600, 0.7, 300);
        this._tone(t, 0.2, 0.5, 'sine', 120, 40);
        break;
      case 'rocket':
        this._noise(t, 0.45, 0.6, 'bandpass', 500, 0.8, 1400);
        this._tone(t, 0.3, 0.2, 'sawtooth', 90, 180);
        break;
      case 'explosion':
        this._noise(t, 1.0, 1.2, 'lowpass', 900, 0.6, 120);
        this._tone(t, 0.7, 0.8, 'sine', 90, 28);
        break;
      case 'hit':
        this._noise(t, 0.05, 0.3, 'bandpass', 800 + r() * 400, 1.2);
        break;
      case 'zdie':
        this._noise(t, 0.22, 0.45, 'lowpass', 700, 1, 150);
        this._tone(t, 0.2, 0.15, 'sawtooth', 180 + r() * 60, 60);
        break;
      case 'groan': {
        const f = 70 + r() * 50;
        const c = this.ctx;
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 0.7, t + 0.9);
        const lfo = c.createOscillator();
        lfo.frequency.value = 7 + r() * 5;
        const lg = c.createGain();
        lg.gain.value = 6;
        lfo.connect(lg).connect(o.frequency);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;
        const gn = c.createGain();
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.exponentialRampToValueAtTime(0.18, t + 0.15);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        o.connect(lp).connect(gn).connect(this.out);
        o.start(t);
        lfo.start(t);
        o.stop(t + 1);
        lfo.stop(t + 1);
        break;
      }
      case 'hurt':
        this._tone(t, 0.18, 0.35, 'square', 320, 110);
        this._noise(t, 0.1, 0.3, 'lowpass', 900);
        break;
      case 'pickup':
        this._tone(t, 0.08, 0.2, 'square', 660);
        this._tone(t + 0.07, 0.12, 0.2, 'square', 990);
        break;
      case 'powerup':
        [523, 659, 784, 1047].forEach((f, i) => this._tone(t + i * 0.06, 0.18, 0.18, 'square', f));
        break;
      case 'reload':
        this._noise(t, 0.03, 0.4, 'highpass', 3000);
        this._noise(t + 0.12, 0.04, 0.45, 'highpass', 2500);
        break;
      case 'empty':
        this._noise(t, 0.03, 0.3, 'highpass', 4000);
        break;
      case 'dash':
        this._noise(t, 0.18, 0.35, 'bandpass', 800, 0.7, 2400);
        break;
      case 'throw':
        this._noise(t, 0.2, 0.25, 'bandpass', 600, 1, 1500);
        break;
      case 'glass':
        this._noise(t, 0.3, 0.6, 'highpass', 3500);
        this._tone(t, 0.1, 0.1, 'triangle', 2400, 1800);
        break;
      case 'fire':
        this._noise(t, 0.6, 0.5, 'lowpass', 1200, 0.5, 300);
        break;
      case 'bark':
        this._tone(t, 0.12, 0.3, 'square', 420, 200);
        this._noise(t, 0.08, 0.2, 'bandpass', 1200);
        break;
      case 'spit':
        this._noise(t, 0.18, 0.35, 'bandpass', 1300, 2);
        this._tone(t, 0.12, 0.15, 'sine', 300, 600);
        break;
      case 'splat':
        this._noise(t, 0.2, 0.4, 'lowpass', 600, 1, 200);
        break;
      case 'zap':
        this._tone(t, 0.12, 0.2, 'square', 1200 + r() * 800, 300);
        this._noise(t, 0.1, 0.25, 'highpass', 3000);
        break;
      case 'roar':
        this._tone(t, 1.3, 0.5, 'sawtooth', 70, 38, 0.1);
        this._tone(t, 1.3, 0.3, 'sawtooth', 104, 50, 0.1);
        this._noise(t, 1.2, 0.5, 'lowpass', 500, 1, 150);
        break;
      case 'slam':
        this._noise(t, 0.6, 1, 'lowpass', 400, 0.8, 60);
        this._tone(t, 0.5, 0.7, 'sine', 70, 25);
        break;
      case 'wave':
        this._tone(t, 1.6, 0.25, 'sawtooth', 55, 52, 0.2);
        this._tone(t, 1.6, 0.2, 'sawtooth', 82.5, 78, 0.2);
        this._tone(t + 0.4, 1.2, 0.15, 'square', 110, 104, 0.2);
        break;
      case 'clear':
        [392, 523, 659].forEach((f, i) => this._tone(t + i * 0.12, 0.35, 0.18, 'triangle', f));
        break;
      case 'flare':
        // strike + whoosh of the flare igniting
        this._noise(t, 0.08, 0.4, 'highpass', 3000);
        this._noise(t + 0.05, 0.6, 0.35, 'bandpass', 2400, 0.7, 900);
        break;
      case 'fizz':
        this._noise(t, 0.35, 0.12, 'bandpass', 3800 + r() * 1200, 1.2);
        break;
      case 'ping':
        this._tone(t, 0.25, 0.12, 'sine', 1180, 1150);
        break;
      case 'pingclose':
        this._tone(t, 0.12, 0.14, 'sine', 1560, 1520);
        this._tone(t + 0.13, 0.12, 0.14, 'sine', 1560, 1520);
        break;
      case 'select':
        this._tone(t, 0.06, 0.15, 'square', 880);
        break;
      case 'revive':
        [440, 554, 659, 880].forEach((f, i) => this._tone(t + i * 0.08, 0.2, 0.18, 'triangle', f));
        break;
      case 'down':
        this._tone(t, 0.8, 0.3, 'triangle', 440, 110);
        break;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => this._tone(t + i * 0.25, 0.5, 0.22, 'triangle', f));
        break;
    }
  }
}
