// Between waves every player picks one of three cards: powerups, trade-off modifiers or a new gun.
import { WEAPONS } from './data.js';
import { weightedPick } from './utils.js';

export const RARITY = {
  common: { label: 'COMMON', weight: 60 },
  rare: { label: 'RARE', weight: 30 },
  epic: { label: 'EPIC', weight: 9 },
};

const weaponCard = (id, rarity) => ({
  id: `w_${id}`,
  name: WEAPONS[id].name,
  desc: `Swap your main gun for the ${WEAPONS[id].name}. Full ammo.`,
  rarity,
  max: 99,
  weapon: id,
  kind: 'weapon',
  cond: (p) => p.weapons[1].id !== id,
  apply: (p) => p.setPrimary(id),
});

export const UPGRADES = [
  // ---- common
  { id: 'dmg', name: 'Hollow Points', desc: '+15% damage.', rarity: 'common', max: 5, icon: ['bullet'], apply: (p) => (p.stats.dmgMul += 0.15) },
  { id: 'rof', name: 'Hair Trigger', desc: '+12% fire rate.', rarity: 'common', max: 5, icon: ['bolt'], apply: (p) => (p.stats.rofMul += 0.12) },
  { id: 'hp', name: 'Tough Skin', desc: '+25 max HP and heal 25.', rarity: 'common', max: 5, icon: ['heart'], apply: (p) => { p.addMaxHp(25); p.heal(25); } },
  { id: 'speed', name: 'Running Shoes', desc: '+8% move speed.', rarity: 'common', max: 4, icon: ['boot'], apply: (p) => (p.stats.speedMul += 0.08) },
  { id: 'mag', name: 'Extended Mags', desc: '+35% magazine size.', rarity: 'common', max: 3, icon: ['bullets'], apply: (p) => { p.stats.magMul += 0.35; p.refillMags(); } },
  { id: 'reload', name: 'Speed Loader', desc: '+25% reload speed.', rarity: 'common', max: 4, icon: ['clock'], apply: (p) => (p.stats.reloadMul += 0.25) },
  { id: 'ammo', name: 'Bandolier', desc: '+50% max reserve ammo. Refills all ammo.', rarity: 'common', max: 3, icon: ['bullets', { y: '#ff8a2a' }], apply: (p) => { p.stats.reserveMul += 0.5; p.refillAmmo(); } },
  { id: 'magnet', name: 'Scavenger', desc: '+60% pickup range and +30% drop chance.', rarity: 'common', max: 3, icon: ['magnet'], apply: (p) => { p.stats.pickupRadius *= 1.6; p.stats.dropMul += 0.3; } },
  { id: 'regen', name: 'Adrenal Glands', desc: 'Regenerate 1 HP per second.', rarity: 'common', max: 3, icon: ['plus'], apply: (p) => (p.stats.regen += 1) },
  { id: 'armor', name: 'Kevlar Vest', desc: 'Take 10% less damage.', rarity: 'common', max: 3, icon: ['shield'], apply: (p) => (p.stats.armor += 0.1) },
  { id: 'medkit', name: 'First Aid', desc: 'Fully heal right now.', rarity: 'common', max: 99, icon: ['medkit'], cond: (p) => p.hp < p.maxHp * 0.75, apply: (p) => p.heal(p.maxHp) },

  // ---- rare
  { id: 'pierce', name: 'FMJ Rounds', desc: 'Bullets pierce through +1 zombie.', rarity: 'rare', max: 3, icon: ['arrow'], apply: (p) => (p.stats.pierce += 1) },
  { id: 'multishot', name: 'Double Tap', desc: '+1 projectile per shot (+3 pellets for shotguns).', rarity: 'rare', max: 3, icon: ['bullets', { y: '#5ab0ff', Y: '#2a5c9a' }], apply: (p) => (p.stats.multishot += 1) },
  { id: 'crit', name: 'Deadeye', desc: '+10% chance to crit for x2.5 damage.', rarity: 'rare', max: 4, icon: ['cross'], apply: (p) => (p.stats.crit += 0.1) },
  { id: 'ricochet', name: 'Ricochet', desc: 'Bullets bounce off walls +1 time.', rarity: 'rare', max: 2, icon: ['zigzag'], apply: (p) => (p.stats.ricochet += 1) },
  { id: 'ignite', name: 'Incendiary Rounds', desc: '15% chance to set zombies on fire.', rarity: 'rare', max: 3, icon: ['flame'], apply: (p) => (p.stats.ignite += 0.15) },
  { id: 'frost', name: 'Cryo Rounds', desc: 'Hits chill zombies, slowing them by 40%.', rarity: 'rare', max: 2, icon: ['snow'], apply: (p) => (p.stats.frost += 1) },
  { id: 'retaliation', name: 'Spiked Armor', desc: 'Getting hit releases a 40 damage shockwave.', rarity: 'rare', max: 3, icon: ['burst'], apply: (p) => (p.stats.retaliation += 40) },
  { id: 'dash', name: 'Parkour', desc: '-30% dash cooldown. Dashing through zombies hurts them.', rarity: 'rare', max: 2, icon: ['dash'], apply: (p) => { p.stats.dashCdMul *= 0.7; p.stats.dashDmg += 30; } },
  { id: 'ability', name: 'Demolitions', desc: '-25% ability cooldown, +25% ability radius.', rarity: 'rare', max: 3, icon: ['bomb'], apply: (p) => { p.stats.abilityCdMul *= 0.75; p.stats.abilityRadius += 0.25; } },
  { id: 'vamp', name: 'Bloodthirst', desc: 'Heal 1 HP for every kill.', rarity: 'rare', max: 3, icon: ['drop'], apply: (p) => (p.stats.lifesteal += 1) },
  { id: 'knock', name: 'Stopping Power', desc: '+60% knockback and +10% damage.', rarity: 'rare', max: 2, icon: ['fist'], apply: (p) => { p.stats.knockMul += 0.6; p.stats.dmgMul += 0.1; } },
  { id: 'trigger', name: 'Trigger Happy', desc: 'MODIFIER: +35% fire rate, but +50% spread.', rarity: 'rare', max: 2, modifier: true, icon: ['bolt', { y: '#ff5a4e' }], apply: (p) => { p.stats.rofMul += 0.35; p.stats.spreadMul += 0.5; } },
  { id: 'tracker', name: 'Motion Tracker', desc: 'A radar pings zombies around you, even in the dark.', rarity: 'rare', max: 1, icon: ['radar'], apply: (p) => (p.stats.tracker = Math.max(p.stats.tracker, 1)) },
  { id: 'deepscan', name: 'Deep Scan', desc: '+60% tracker range. The tracker also shows pickups.', rarity: 'rare', max: 1, icon: ['radar', { y: '#ffd24a', e: '#5ab0ff', E: '#2a5c9a' }], cond: (p) => p.stats.tracker >= 1, apply: (p) => (p.stats.tracker = 2) },
  { id: 'jugg', name: 'Juggernaut', desc: 'MODIFIER: +60 max HP, but -10% move speed.', rarity: 'rare', max: 2, modifier: true, icon: ['shield', { b: '#9aa0aa', B: '#5a5f69' }], apply: (p) => { p.addMaxHp(60); p.heal(60); p.stats.speedMul -= 0.1; } },

  // ---- epic
  { id: 'explosive', name: 'Explosive Rounds', desc: '15% chance for hits to explode.', rarity: 'epic', max: 3, icon: ['bomb', { G: '#b8322c', w: '#ffcf5a' }], apply: (p) => (p.stats.explosive += 0.15) },
  { id: 'chain', name: 'Tesla Coil', desc: '15% chance for hits to arc lightning to 3 zombies.', rarity: 'epic', max: 3, icon: ['bolt', { y: '#7fd8ff' }], apply: (p) => (p.stats.chain += 0.15) },
  { id: 'saw', name: 'Buzzsaw', desc: 'A saw blade orbits you, shredding zombies.', rarity: 'epic', max: 3, icon: ['saw'], apply: (p) => (p.stats.saws += 1) },
  { id: 'drone', name: 'Combat Drone', desc: 'A drone follows you and shoots zombies.', rarity: 'epic', max: 2, icon: ['drone'], apply: (p) => p.addDrone() },
  { id: 'secondwind', name: 'Second Wind', desc: 'Cheat death once: get back up with 50% HP.', rarity: 'epic', max: 99, icon: ['heart', { r: '#ffd24a', w: '#fff6c8' }], cond: (p) => p.stats.secondWind === 0, apply: (p) => (p.stats.secondWind = 1) },
  { id: 'glass', name: 'Glass Cannon', desc: 'MODIFIER: +45% damage, but -30% max HP.', rarity: 'epic', max: 2, modifier: true, icon: ['diamond'], apply: (p) => { p.stats.dmgMul += 0.45; p.addMaxHp(-Math.round(p.maxHp * 0.3)); } },
  { id: 'berserk', name: 'Berserker', desc: 'MODIFIER: up to +60% damage & fire rate the lower your HP.', rarity: 'epic', max: 1, modifier: true, icon: ['skull', { w: '#ff6a5a' }], apply: (p) => (p.stats.berserk = 1) },

  // ---- weapons
  weaponCard('rifle', 'rare'),
  weaponCard('shotgun', 'rare'),
  weaponCard('smg', 'rare'),
  weaponCard('rocket', 'epic'),
  weaponCard('minigun', 'epic'),
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Card categories give each card its color theme in the UI (rarity is shown by the card's frame).
export const CATEGORY = {
  offense: { label: 'OFFENSE', ids: ['dmg', 'rof', 'crit', 'pierce', 'multishot', 'ricochet', 'ignite', 'frost', 'explosive', 'chain', 'knock', 'trigger', 'glass', 'berserk'] },
  defense: { label: 'DEFENSE', ids: ['hp', 'regen', 'armor', 'medkit', 'vamp', 'retaliation', 'secondwind', 'jugg'] },
  mobility: { label: 'MOBILITY', ids: ['speed', 'dash'] },
  tech: { label: 'TECH', ids: ['saw', 'drone', 'tracker', 'deepscan', 'magnet', 'ability'] },
  ammo: { label: 'AMMO', ids: ['mag', 'reload', 'ammo'] },
  weapon: { label: 'WEAPON', ids: [] },
};
for (const [cat, c] of Object.entries(CATEGORY)) for (const id of c.ids) UPGRADE_BY_ID[id].cat = cat;
for (const u of UPGRADES) u.cat ??= u.weapon ? 'weapon' : 'offense';

export function rollChoices(player, wave, count = 3) {
  const pool = UPGRADES.filter((u) => (player.upgrades[u.id] || 0) < u.max && (!u.cond || u.cond(player)));
  const weight = (u) => {
    let w = RARITY[u.rarity].weight;
    if (u.rarity === 'epic') w += wave * 1.4;
    if (u.rarity === 'rare') w += wave * 0.8;
    if (u.kind === 'weapon') w *= 0.55;
    if (u.id === 'medkit') w *= 1.5;
    return w;
  };
  const out = [];
  while (out.length < count && pool.length) {
    const pick = weightedPick(pool, weight);
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
