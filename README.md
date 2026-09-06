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

All developer content is written in English. Player-readable content is available in Polish and English. On first launch the game chooses the first supported browser language, falling back to English. The Settings button opens a language selector; changes apply immediately without resetting the game and are remembered separately from horse appearances. If browser storage is unavailable, the choice lasts for the current session.

## Controls

- W/S or Up/Down: select a persistent gait (reverse, stand, walk, trot, canter), without holding the key. On foot, select slow reverse, stand, walk, or run. Press Down/S once more from stand to walk backwards; Up/W stops reversing.
- A/D or Left/Right: steer, including while standing still.
- Space: jump with a forgiving timing window while mounted.
- E or the mount button: dismount from a stopped horse, or mount any nearby horse from its side. All five horses are rideable; the others wait at their locations and remain marked on the minimap. Both actions are animated; walls can block dismounting.
- C: switch between third-person and first-person cameras. Drag the mouse to look around.
- Escape: pause. Switching tabs or losing focus also pauses the game.
- Icon buttons: settings, sound, help, horse appearance, return to the stable, and fullscreen.

Audio starts after the first click or key press, as required by browsers. Each horse has its own appearance saved in localStorage; if storage is unavailable, changes still work for the current session.

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

The building west of the arena has two open entrances and a traversable central aisle. Four enclosed stalls house Luna, Fuks, Burza, and Kasztan. The first stall on the left from the main entrance is empty and reserved for Raven, the player's horse. All stall entrances are open so the player can approach and ride any horse in and out. Stalls contain bedding, water, and hay; nameplates identify each horse. Unmounted horses stay in place and have subtle idle animations.

The tack room is on the right when entering through the main entrance. Players can ride inside; it contains saddles on racks, bridles, folded saddlecloths, and a grooming box. These are environmental props; the palette button still opens customization for the most recently ridden horse.

The interior has a paved aisle, timber framing, a pitched roof, lamps, and windows. The third-person camera moves closer near walls and the roof, while the first-person camera looks slightly lower indoors. Wall placement and collisions share `src/world/stable-layout.ts`.

`node scripts/stable-check.ts` rides from the starting position into the stable, checks both cameras, enters the tack room, exits through the rear doorway, and saves screenshots. `tests/stable.test.ts` checks aisle and doorway clearance and barriers around stalls.

`node scripts/riding-check.ts` verifies mounting, dismounting, walking/running, proximity checks, pause, cameras, and reset using the local Vite server.

`node scripts/herd-check.ts` verifies switching from Raven to Fuks, riding out of a stall, independent decorations, returning to Raven, and saved appearance after reloading. Horse positions reset on reload.

In the appearance panel's Colors section, Riding offers Saddled or Bareback. Bareback removes the saddle, stirrups, girth, and saddlecloth while keeping the bridle and reins. The rider sits lower, and mounting, walking, running, and jumping remain available. Equipment is saved separately for every horse; switching back restores the existing saddlecloth colors and patterns.

- L or the lead button, while on foot beside a horse: attach or release a lunge line. Unmounted horses wear halters, with the line attached to the lower ring. The selected horse follows at walk/trot while the handler walks or runs, and waits when released. This is leading on a line, not circular lunging. Walls, fences, other horses, and a six-metre reach constrain movement; take a wider route if the horse gets blocked. Mounting or returning home releases the line.

## Gamepad and Steam Deck

Standard gamepads use the browser Gamepad API. On Steam Deck, launch the browser through Steam and choose a **Gamepad** Steam Input layout (keyboard/mouse emulation does not expose analog gamepad input). Serve the game over HTTPS or localhost; an HTTP LAN address may not expose the Gamepad API. Press a controller button after opening the game. If audio stays silent, click or tap once to unlock browser audio.

- Left stick: analog steering and momentary forward/back steps (up/down), up to 1.2 m/s forward and 0.9 m/s backward. Releasing the stick stops immediately when no gait is selected, or resumes the bumper-selected gait. Works mounted, on foot, and while leading; normal collisions still apply.
- Right stick: horizontal look, returning to center when released; up brings the third-person camera closer, down moves it farther away. Distance stays where you leave it, within 45–180% of the normal distance. Wall avoidance still applies; first-person view stays fixed.
- LB/RB or D-pad down/up: slower/faster persistent gait.
- A: jump; B: mount/dismount; X: attach/release lead; Y: camera.
- Right-stick click (R3): toggle fullscreen, also available as a button in Pause and Settings. If the browser requires a direct user gesture, tap/click the Fullscreen button.
- Menu/Start: pause; View/Back: help; D-pad left: appearance; D-pad right: settings.
- Menus: D-pad or left stick steps through visible controls; A selects; B/Menu returns to riding. Left/right changes a focused language selection.

Settings contains controller status, a vibration toggle, and a test pulse. Hoof contacts produce gentle pulses; landings and knocked rails produce stronger pulses. Vibration is optional, independent of sound, and disabled for the connected device if the browser rejects it. Reconnecting retries support detection. The toggle lasts for the current session. Browser/SteamOS support for the Deck actuator must be tested on hardware; API availability alone does not prove physical feedback. Disconnecting the active controller pauses the game; keyboard and mouse remain available.

`node scripts/gamepad-check.ts` tests virtual controller input, menu navigation, vibration calls and failure handling in Chrome; it cannot verify physical vibration. The standard browser suite includes this check.
