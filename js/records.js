// Lifetime records shown on the title screen: totals across every finished run, plus per-survivor stats.
// A run counts once it ends in a game over (quitting or restarting from the pause menu abandons it).
import { storage } from './utils.js';

const KEY = 'll_records';

const blank = () => ({ runs: 0, kills: 0, time: 0, bosses: 0, mostKills: 0, longest: 0, survivors: {} });

export function loadRecords() {
  return { ...blank(), ...storage.get(KEY, {}) };
}

// run: { wave, kills, time, bosses, players: [{ id, kills }] }
export function recordRun(run) {
  const r = loadRecords();
  r.runs++;
  r.kills += run.kills;
  r.time += run.time;
  r.bosses += run.bosses;
  r.mostKills = Math.max(r.mostKills, run.kills);
  r.longest = Math.max(r.longest, run.time);
  for (const p of run.players) {
    const s = (r.survivors[p.id] ||= { runs: 0, kills: 0, bestWave: 0 });
    s.runs++;
    s.kills += p.kills;
    s.bestWave = Math.max(s.bestWave, run.wave);
  }
  storage.set(KEY, r);
  return r;
}
