// Game data: weapons, playable characters and zombie archetypes.

// Signature guns (one per character) never run out of reserve ammo. Every other gun is a world
// pickup: `tier` controls how early it shows up (see pickDropWeapon in game.js).
// projectile: 'bullet' (default), 'nail', 'sniper', 'rocket', 'flame', 'nade' (lobbed grenade) or
// 'zap' (chain lightning). `akimbo` alternates the muzzle between two hands.
export const WEAPONS = {
  // ---- signature guns
  carbine: {
    short: 'CARBINE', name: 'Scout Carbine', desc: 'Accurate and quick. Never runs dry.', signature: true,
    dmg: 15, rate: 6.5, mag: 24, reload: 1.1, spread: 0.035, speed: 440, pellets: 1,
    range: 290, knock: 40, infinite: true, sound: 'pistol', shake: 1.1, flash: 1,
  },
  sawedoff: {
    short: 'SAWED-OFF', name: 'Sawed-Off', desc: 'Two barrels, huge knockback. Never runs dry.', signature: true,
    dmg: 11, rate: 3.2, mag: 2, reload: 1.05, spread: 0.34, speed: 360, pellets: 7,
    range: 120, knock: 120, infinite: true, sound: 'shotgun', shake: 3.5, flash: 2, recoil: 60,
  },
  twinpistols: {
    short: 'TWIN PISTOLS', name: 'Twin Pistols', desc: 'Fast alternating shots from both hands. Never runs dry.', signature: true,
    dmg: 10, rate: 8, mag: 24, reload: 1.2, spread: 0.06, speed: 420, pellets: 1,
    range: 250, knock: 30, infinite: true, sound: 'pistol', shake: 0.8, flash: 0.8, akimbo: true,
  },
  nailgun: {
    short: 'NAIL GUN', name: 'Nail Gun', desc: 'Nails punch through 2 zombies. Never runs dry.', signature: true,
    dmg: 12, rate: 5.5, mag: 30, reload: 1.4, spread: 0.05, speed: 520, pellets: 1,
    range: 260, knock: 25, pierce: 2, infinite: true, sound: 'nail', shake: 0.9, flash: 0.6, projectile: 'nail',
  },

  // ---- pickups
  rifle: {
    short: 'RIFLE', name: 'Assault Rifle', desc: 'Steady full-auto all-rounder.', tier: 1, dmg: 13, rate: 9, mag: 30, reload: 1.5, spread: 0.07, speed: 460, pellets: 1,
    range: 320, knock: 50, reserve: 210, sound: 'rifle', shake: 1.4, flash: 1.2,
  },
  shotgun: {
    short: 'SHOTGUN', name: 'Shotgun', desc: 'Seven pellets. Wrecks anything close.', tier: 1, dmg: 10, rate: 1.4, mag: 6, reload: 1.8, spread: 0.3, speed: 380, pellets: 7,
    range: 150, knock: 110, reserve: 42, sound: 'shotgun', shake: 4, flash: 2, recoil: 70,
  },
  smg: {
    short: 'SMG', name: 'SMG', desc: 'Sprays fast. Light hits, huge volume.', tier: 1, dmg: 8, rate: 15, mag: 40, reload: 1.3, spread: 0.14, speed: 420, pellets: 1,
    range: 240, knock: 25, reserve: 280, sound: 'smg', shake: 1, flash: 0.9,
  },
  flamer: {
    short: 'FLAMER', name: 'Flamethrower', desc: 'Burns through crowds and sets them ablaze.', tier: 2, dmg: 4, rate: 22, mag: 100, reload: 2.4, spread: 0.22, speed: 170, pellets: 1,
    range: 72, knock: 6, pierce: 99, reserve: 300, sound: 'flame', shake: 0.4, flash: 0, projectile: 'flame',
  },
  sniper: {
    short: 'SNIPER', name: 'Sniper Rifle', desc: 'Every shot punches through a whole line.', tier: 2, dmg: 95, rate: 1, mag: 5, reload: 2, spread: 0.005, speed: 900, pellets: 1,
    range: 480, knock: 140, pierce: 6, reserve: 30, sound: 'sniper', shake: 4, flash: 2.2, projectile: 'sniper',
  },
  tesla: {
    short: 'TESLA', name: 'Tesla Gun', desc: 'Lightning that jumps to 3 more zombies.', tier: 2, dmg: 22, rate: 5, mag: 30, reload: 1.8, spread: 0, speed: 0, pellets: 1,
    range: 150, knock: 30, reserve: 150, sound: 'zap', shake: 1, flash: 0, projectile: 'zap',
  },
  launcher: {
    short: 'GRENADES', name: 'Grenade Launcher', desc: 'Lobbed shells that burst on impact.', tier: 3, dmg: 55, splashR: 38, rate: 1.6, mag: 6, reload: 2.3, spread: 0.04,
    speed: 0, pellets: 1, range: 170, knock: 0, reserve: 30, sound: 'thunk', shake: 2, flash: 1.5, projectile: 'nade',
  },
  rocket: {
    short: 'ROCKETS', name: 'Rocket Launcher', desc: 'Huge blast radius. Mind the slow reload.', tier: 3, dmg: 30, splash: 80, splashR: 44, rate: 1.1, mag: 4, reload: 2.2, spread: 0.02,
    speed: 250, pellets: 1, range: 380, knock: 0, reserve: 20, sound: 'rocket', shake: 3, flash: 2, projectile: 'rocket',
  },
  minigun: {
    short: 'MINIGUN', name: 'Minigun', desc: 'Spins up, then shreds. Slows you down.', tier: 3, dmg: 9, rate: 24, mag: 200, reload: 3.2, spread: 0.16, speed: 460, pellets: 1,
    range: 300, knock: 22, reserve: 600, sound: 'minigun', shake: 1.1, flash: 1, spinup: 0.55, slow: 0.55,
  },
};

export const PICKUP_WEAPONS = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].signature);

export const CHARACTERS = {
  red: {
    id: 'red',
    name: 'RED',
    title: 'The Scout',
    color: '#ff5a4e',
    hp: 100,
    speed: 82,
    weapon: 'carbine',
    ability: 'grenade',
    abilityIcon: 'bomb',
    abilityName: 'Frag Grenade',
    abilityDesc: 'Throw a bouncing grenade that blows the horde apart.',
    abilityCd: 7,
    passive: 'Quick hands: +20% reload speed, faster dash.',
    stats: { reloadMul: 1.2, dashCdMul: 0.8 },
    bars: { hp: 2, speed: 4, power: 3 },
  },
  bruno: {
    id: 'bruno',
    name: 'BRUNO',
    title: 'The Brawler',
    color: '#4fb2ff',
    hp: 150,
    speed: 70,
    weapon: 'sawedoff',
    ability: 'molotov',
    abilityIcon: 'flame',
    abilityName: 'Molotov',
    abilityDesc: 'Lob a firebomb that leaves a burning pool.',
    abilityCd: 9,
    passive: 'Thick skin: takes 15% less damage, extra knockback.',
    stats: { armor: 0.15, knockMul: 1.3 },
    bars: { hp: 4, speed: 2, power: 4 },
  },
  mara: {
    id: 'mara',
    name: 'MARA',
    title: 'The Medic',
    color: '#5ee0b0',
    hp: 110,
    speed: 78,
    weapon: 'twinpistols',
    ability: 'medstation',
    abilityIcon: 'medkit',
    abilityName: 'Med Station',
    abilityDesc: 'Drop a med station at your feet that heals everyone standing in it.',
    abilityCd: 12,
    passive: 'Field medic: revives teammates 2x faster and regenerates 1 HP per second.',
    stats: { reviveMul: 2, regen: 1 },
    bars: { hp: 3, speed: 3, power: 2 },
  },
  ivy: {
    id: 'ivy',
    name: 'IVY',
    title: 'The Engineer',
    color: '#ffc04a',
    hp: 100,
    speed: 76,
    weapon: 'nailgun',
    ability: 'turret',
    abilityIcon: 'gear',
    abilityName: 'Sentry Turret',
    abilityDesc: 'Deploy a turret that guns down nearby zombies for 10 seconds.',
    abilityCd: 14,
    passive: 'Scrapper: found guns carry 50% more ammo.',
    stats: { reserveMul: 1.5 },
    bars: { hp: 2, speed: 3, power: 3 },
  },
};

// Base zombie stats. HP/speed scale with the wave number in waves.js.
export const ZOMBIES = {
  walker: { hp: 30, speed: 30, dmg: 10, r: 5, score: 10, anim: 5, mass: 1 },
  runner: { hp: 22, speed: 58, dmg: 8, r: 5, score: 15, anim: 11, mass: 0.8 },
  dog: { hp: 18, speed: 78, dmg: 7, r: 5, score: 15, anim: 12, mass: 0.7 },
  brute: { hp: 150, speed: 21, dmg: 22, r: 8, score: 40, anim: 4, mass: 4, knockResist: 0.75 },
  spitter: { hp: 40, speed: 24, dmg: 8, r: 5, score: 30, anim: 5, mass: 1 },
  bloater: { hp: 55, speed: 19, dmg: 10, r: 7, score: 25, anim: 4, mass: 2 },
  boss: { hp: 1600, speed: 23, dmg: 30, r: 13, score: 500, anim: 3, mass: 30, knockResist: 0.95 },
};
