# Końska Polana

A browser prototype of a relaxed horse-riding game for children, built with Three.js, TypeScript 7, and Vite. Models are generated in code, and sounds are synthesized locally. The game requires no account or external services.

## Getting started

Requires Node.js 22.18+ or 24+ and pnpm 10.33.4 (pinned in `package.json`). See the [pnpm installation instructions](https://pnpm.io/10.x/installation).

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open the URL printed by Vite (usually http://127.0.0.1:5173). `pnpm run build` creates a static production build in `dist` that can be deployed to a web host. `pnpm test` checks movement, jumping, and collisions.

With a server running on port 5173, `node scripts/browser-check.ts` runs checks in installed Chrome and saves screenshots to `artifacts/`. `node scripts/appearance-check.ts` checks every appearance variant in the preview, saved selections, and panel layout. Tests use separate browser profiles and do not change the player's saved data.

## Development

`pnpm run check` runs native TypeScript 7, Oxlint with type-aware analysis, Stylelint, HTML Validate, formatting checks, and unit tests. `pnpm run format` formats files with Prettier, using tabs in TS/JS, HTML, and CSS.

`pnpm run check:browser` runs the complete browser suite using its own Vite server on port 5174, then shuts the server down. It uses installed Chrome by default. CI uses Chromium installed through Playwright.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries, model replacement, resource ownership, and development commands. See [DESIGN.md](DESIGN.md) for the design decisions and [AGENTS.md](AGENTS.md) for contributor workflow and language requirements.

All developer content is written in English. Player-readable strings currently remain in Polish.

## Controls

- W/S or Up/Down: select a persistent gait (reverse, stand, walk, trot, canter), without holding the key. On foot, select stand, walk, or run.
- A/D or Left/Right: steer, including while standing still.
- Space: jump with a forgiving timing window while mounted.
- E or the mount button: dismount from a stopped horse, or mount when standing nearby. The horse waits at its location and is marked on the minimap. Both actions are animated; walls can block dismounting.
- C: switch between third-person and first-person cameras. Drag the mouse to look around.
- Escape: pause. Switching tabs or losing focus also pauses the game.
- Icon buttons: sound, help, horse appearance, return to the stable, and fullscreen.

Audio starts after the first click or key press, as required by browsers. Horse appearance is saved in localStorage; if storage is unavailable, changes still work for the current session.

## Prototype scope

The world includes a riding stable, meadow, forest loop, three low obstacles, an animated horse and rider, two cameras, a minimap, collisions, pause, synthesized hoofbeats, and nature sounds without music. Both obstacles and enclosure fences can be jumped.

The appearance panel has four sections: colors, hairstyles, ornaments, and saddlecloth. The mane and tail each have independent short, long, and braided styles. Ornaments include flowers, a bow, and ribbons (including tail ribbons), with five colors and an option to remove them. Saddlecloth patterns include plain, dots, stripes, and stars. All options are unlocked and saved locally. Older saves retain their colors and flower selection.

This is a desktop keyboard prototype, not a finished mobile game. Sounds and models are provisional. Playtesting with a child should assess steering speed, camera height, how clearly the horse reads on screen, jump difficulty, and performance on the target computer.

The horse model lives in `src/horse/model.ts`: a rounded silhouette, muzzle, mane and tail strands, articulated legs, and fitted saddlecloth and saddle. The appearance preview supports rotation and zoom, with an optional rider. Color changes appear immediately. Drag to rotate and use the mouse wheel to zoom; buttons and arrow keys are also available when the preview has focus.

## Gait animations

The walk has four distinct beats with continuous support. The trot uses diagonal pairs with suspension phases. The canter is a three-beat right-lead gait: left hind, right hind together with left fore, right fore, then suspension. The model has separate body and rider motion, joint bending, and smooth transitions. Hoofbeats are triggered by foot contacts rather than an independent timer. Movement speeds and jump mechanics remain unchanged. Animation is stylized and procedural, without motion capture or automatic lead changes.

Rhythm references: [FEI — Gait](https://www.fei.org/node/38138), [University of Arizona — Horse gaits](https://opentextbooks.library.arizona.edu/app/uploads/sites/274/2023/11/Horse-Gaits.pdf).

`node scripts/gait-check.ts` saves a side-view comparison of four phases per gait to `artifacts/gait-phases.png`. It requires Vite on port 5173. `tests/gaits.test.ts` checks foot-contact order, suspension, transitions, muted hoofbeats during jumps, and hoof positions.

## Stable

The building west of the arena has two open entrances and a traversable central aisle. Four enclosed stalls house Luna, Fuks, Burza, and Kasztan. The first stall on the left from the main entrance is empty and reserved for Raven, the player's horse. Its entrance is open so the player can ride in and out. Stalls contain bedding, water, and hay; open upper door sections let players see the horses. Resident horses stay in place and have subtle idle animations.

The tack room is on the right when entering through the main entrance. Players can ride inside; it contains saddles on racks, bridles, folded saddlecloths, and a grooming box. These are environmental props; the palette button still opens customization for the player's own horse.

The interior has a paved aisle, timber framing, a pitched roof, lamps, and windows. The third-person camera moves closer near walls and the roof, while the first-person camera looks slightly lower indoors. Wall placement and collisions share `src/world/stable-layout.ts`.

`node scripts/stable-check.ts` rides from the starting position into the stable, checks both cameras, enters the tack room, exits through the rear doorway, and saves screenshots. `tests/stable.test.ts` checks aisle and doorway clearance and barriers around stalls.

`node scripts/riding-check.ts` verifies mounting, dismounting, walking/running, proximity checks, pause, cameras, and reset using the local Vite server.
