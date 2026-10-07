// Game data: weapons, playable characters and zombie archetypes.

export const WEAPONS = {
  pistol: {
    name: 'Pistol', dmg: 14, rate: 4.5, mag: 12, reload: 1.0, spread: 0.05, speed: 400, pellets: 1,
    range: 260, knock: 45, infinite: true, sound: 'pistol', shake: 1, flash: 1,
  },
  rifle: {
    name: 'Assault Rifle', dmg: 13, rate: 9, mag: 30, reload: 1.5, spread: 0.07, speed: 460, pellets: 1,
    range: 320, knock: 50, reserve: 210, sound: 'rifle', shake: 1.4, flash: 1.2,
  },
  shotgun: {
    name: 'Shotgun', dmg: 10, rate: 1.4, mag: 6, reload: 1.8, spread: 0.3, speed: 380, pellets: 7,
    range: 150, knock: 110, reserve: 42, sound: 'shotgun', shake: 4, flash: 2, recoil: 70,
  },
  smg: {
    name: 'SMG', dmg: 8, rate: 15, mag: 40, reload: 1.3, spread: 0.14, speed: 420, pellets: 1,
    range: 240, knock: 25, reserve: 280, sound: 'smg', shake: 1, flash: 0.9,
  },
  rocket: {
    name: 'Rocket Launcher', dmg: 30, splash: 80, splashR: 44, rate: 1.1, mag: 4, reload: 2.2, spread: 0.02,
    speed: 250, pellets: 1, range: 380, knock: 0, reserve: 20, sound: 'rocket', shake: 3, flash: 2, projectile: 'rocket',
  },
  minigun: {
    name: 'Minigun', dmg: 9, rate: 24, mag: 200, reload: 3.2, spread: 0.16, speed: 460, pellets: 1,
    range: 300, knock: 22, reserve: 600, sound: 'minigun', shake: 1.1, flash: 1, spinup: 0.55, slow: 0.55,
  },
};

export const CHARACTERS = {
  red: {
    id: 'red',
    name: 'RED',
    title: 'The Scout',
    color: '#ff5a4e',
    hp: 100,
    speed: 82,
    weapon: 'rifle',
    ability: 'grenade',
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
    weapon: 'shotgun',
    ability: 'molotov',
    abilityName: 'Molotov',
    abilityDesc: 'Lob a firebomb that leaves a burning pool.',
    abilityCd: 9,
    passive: 'Thick skin: takes 15% less damage, extra knockback.',
    stats: { armor: 0.15, knockMul: 1.3 },
    bars: { hp: 4, speed: 2, power: 4 },
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
