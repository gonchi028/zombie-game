# Last Light

A top-down, pixel-art zombie survival game for the browser. Hold out in a dark city against waves
of the undead, scavenge guns from the streets, and after every wave pick one of three upgrade cards
to build your run.

- **2 playable survivors**
  - **Red**, the Scout: fast, Scout Carbine, frag grenade.
  - **Bruno**, the Brawler: tanky, Sawed-Off, molotov.

  Each survivor's signature gun never runs out of ammo.
- **Guns spawn around the city** over time. Your second slot holds whatever you find: SMG, assault
  rifle, shotgun, flamethrower, sniper rifle, Tesla gun, grenade launcher, rocket launcher or
  minigun. Stronger guns turn up in later waves. Walking over a gun picks it up if your slot is empty
  or it's the same gun (more ammo). A different gun asks for a button press, and you drop the old one.
- **Solo or local co-op.** Player 2 uses a gamepad or the arrow keys with auto-aim. Downed teammates can be revived.
- **Waves that escalate.** Walkers, then runners, zombie dogs, brutes, acid spitters and exploding
  bloaters. **The Abomination** boss arrives every 5th wave.
- **33 upgrades**, in three kinds:
  - stat powerups
  - trade-off *modifiers* (Glass Cannon, Berserker, Trigger Happy, Juggernaut…)
  - build-defining epics (Buzzsaws, Combat Drone, Tesla Coil, Explosive Rounds, Second Wind)
- **Road flares** drop more often the more zombies crowd you. Throw one and nearby zombies chase it
  instead of you for a few seconds, then it pops. The boss isn't fooled.
- **Night-time lighting**: flashlight cones that are blocked by walls, street lamps, flickering
  neon, police sirens and burning barrels. Blood and corpses stay on the streets.
- All art and sound are generated in code: no image or audio files, no dependencies.

## Running it

ES modules can't load from `file://`, so serve the folder over HTTP:

```bash
npm start            # zero-dependency Node server → http://localhost:8080
# or
python3 -m http.server 8080
```

## Controls

| Action  | Player 1 (keyboard + mouse)   | Player 2 (arrow keys)      | Gamepad          |
| ------- | ----------------------------- | -------------------------- | ---------------- |
| Move    | `WASD`                        | Arrows                     | Left stick       |
| Aim     | Mouse                         | Auto-aim (nearest zombie)  | Right stick      |
| Shoot   | Left click                    | `Enter`                    | RT               |
| Ability | `Q` / Right click             | `/`                        | LT / LB          |
| Dash    | `Space` / `Left Shift`        | `Right Shift`              | A                |
| Road flare | `G`                        | `'`                        | B                |
| Reload  | `R`                           | `.`                        | X                |
| Pick up gun | `F`                       | `;`                        | X (near a gun)   |
| Swap gun | `E` / wheel / `1` `2`        | `,`                        | Y                |

`Esc` / `P` pauses, `M` mutes. On upgrade screens, press `1` `2` `3` to pick a card and `R` to reroll.

In co-op, player 1 uses keyboard + mouse and player 2 uses the first gamepad (or the arrow keys).
With two gamepads, player 1 can use the second one.

## Project layout

```
index.html        DOM shell (menus/HUD overlay the canvas)
css/style.css     UI styling; 1 "game pixel" = var(--s)
server.js         tiny static server for `npm start`
js/
  main.js         boot, game loop, pause/menu wiring
  game.js         world simulation + rendering (combat, pickups, explosions, lighting pass)
  map.js          city generator, baked tile art, props/colliders, flow-field pathfinding
  player.js       survivor movement, dash, weapons, abilities, saws & drones
  zombie.js       zombie AI (per-type behaviors, boss state machine)
  waves.js        wave composition, scaling and spawn placement
  upgrades.js     upgrade card pool, rarities and roll logic
  data.js         weapons, characters and zombie base stats  ← start here to tune balance
  sprites.js      all pixel art as palette strings, baked to canvases at boot
  anim.js         procedural animation: squash & stretch springs, poses, easing
  lighting.js     darkness overlay, raycast flashlight cones, additive glows
  tracker.js      motion tracker radar (Motion Tracker / Deep Scan upgrades)
  particles.js    particles + permanent decals (blood, corpses, scorch marks)
  audio.js        procedural Web Audio sound effects
  input.js        keyboard/mouse/gamepad + per-player controllers
  ui.js           menus, upgrade cards, HUD
  font.js         3x5 bitmap font for in-world text
```

## Tweaking

- **Balance:** weapon, character and zombie numbers live in `js/data.js`. Gun drop timing is at the
  top of `js/game.js` (`DROP_EVERY`, `MAX_DROPS`…), and which guns show up when is in `pickDropWeapon()`. Wave size and mix are in
  `js/waves.js` (`mix()` and `start()`).
- **New upgrade:** add an entry to `UPGRADES` in `js/upgrades.js`. It needs an `apply(player)`
  function. Add an optional `cond(player)` to control when the card can be offered.
- **New art:** sprites are strings in `js/sprites.js`. Each character is a palette key, and `.`
  means transparent.
- **Debugging:** the live game object is available as `window.__game` in the console.
