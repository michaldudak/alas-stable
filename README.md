# Ala's Stable

**Stajnia Ali** in Polish. A browser prototype of a relaxed horse-riding game for children, built with Three.js, TypeScript 7, and Vite. Models are generated in code, and sounds are synthesized locally. The game requires no account or external services.

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
- E or the mount button: dismount from a stopped horse, or mount any horse within about six metres: the rider walks up to its side by herself, round its head or tail or through its stall door if needed. A tag above the nearest horse shows its name and the keys to use. Every horse in the stables and on the pasture is rideable; the others wait near their places and remain marked on the minimap. Both actions are animated; walls can block dismounting.
- T or the carrot button: on foot near a horse, hold out a carrot. The horse turns its head to take it, munches, hearts float up, the rider strokes its forehead and it then follows her for about half a minute; walking on ends the stroking early. From the saddle, T makes the rider lean forward and pat the side of the neck that faces the camera three times, and the horse turns its head towards the hand.
- G or the hand button: on foot next to a jump, take hold of the middle of its rails. Walk forwards to push it, backwards to pull it and steer to turn it; press G again to put it down. A held jump cannot be pushed into trees, walls or horses. Jumps can stand anywhere and at any angle, and horses jump them from either side.
- C: switch between third-person and first-person cameras. Drag the mouse to look around.
- Escape: pause. Switching tabs or losing focus also pauses the game.
- Icon buttons: settings, sound, help, horse appearance, return to the stable, and fullscreen.

Audio starts after the first click or key press, as required by browsers. Each horse has its own appearance saved in localStorage; if storage is unavailable, changes still work for the current session.

## Prototype scope

The world includes three stables around a yard, a jumping arena, a meadow and forest loop, an oval racecourse with a grandstand, a fenced pasture with a field shelter, an animated horse and rider, two cameras, a scrolling minimap, collisions, pause, synthesized hoofbeats, and nature sounds without music. Obstacles, enclosure fences, racecourse rails and pasture fences can all be jumped. Map features share their positions through `src/world/layout.ts`.

The appearance panel has four sections: colors, hairstyles, ornaments, and saddlecloth. The mane and tail each have independent short, long, and braided styles. Ornaments include flowers, a bow, and ribbons (including tail ribbons), with five colors and an option to remove them. Saddlecloth patterns include plain, dots, stripes, and stars. All options are unlocked and saved locally. Older saves retain their colors and flower selection.

This is a desktop keyboard prototype, not a finished mobile game. Sounds and models are provisional. Playtesting with a child should assess steering speed, camera height, how clearly the horse reads on screen, jump difficulty, and performance on the target computer.

The horse body is sculpted in Blender from anatomical masses by `tools/horse/build_horse.py` and exported to `src/assets/horse.glb`; `src/horse/model.ts` rigs it with three-bone legs and fits mane and tail strands, saddlecloth, saddle, bridle and halter to its surface. The appearance preview supports rotation and zoom, with an optional rider. Color changes appear immediately. Drag to rotate and use the mouse wheel to zoom; buttons and arrow keys are also available when the preview has focus.

## Other riders

Four other riders share the grounds: Zosia and Kuba gallop laps of the racecourse at slightly different speeds, Ola trots the bridleway, and Hania schools in the arena, jumping the three uprights up the centre line and the oxer on the way back. They follow their routes by pure pursuit, take off before any standing rails across their line (including jumps the player has moved), wait for the player to get out of the way and ride round a horse left standing in their path after a few seconds. They head home at sunset and come back in the morning, leaving and returning only out of sight. `src/game/npc.ts` holds the riding logic and is covered by `tests/npc.test.ts`; `src/app/riders.ts` builds their horses and outfits.

## Time of day and weather

A full day and night lasts fifteen minutes; the game starts at 11:00 and the night passes twice as fast as the day. The sun follows a real arc for a northern summer, so mornings and evenings bring long golden shadows. At night the moon becomes the shadowing light and the sky shows stars. The weather changes by itself between sunny, windy, cloudy and rainy spells, blending over about half a minute; rain only falls from a heavy sky and leaves the ground dark and glossy for a while. Wind sways the grass and trees and drives the clouds. The clock and a weather icon sit next to the location name.

At dusk, lanterns around the yard and floodlights at the arena and the racecourse switch on, stable windows glow and the ground under each lamp is lit. A few real point lights follow the camera between the nearest lamps, so the cost does not grow with the number of lamps. Sounds follow the weather: rain, wind, birds by day and crickets at night.

Settings → Time of day can keep it always day or always night, and Settings → Weather can pick a fixed weather; both are remembered. `src/game/environment.ts` holds the clock and weather model and is covered by `tests/environment.test.ts`; `src/world/sky.ts`, `lamps.ts` and `rain.ts` render it.

## Gait animations

The walk has four distinct beats with continuous support. The trot uses diagonal pairs with suspension phases. The canter is a three-beat right-lead gait: left hind, right hind together with left fore, right fore, then suspension. The model has separate body and rider motion, joint bending, and smooth transitions. Hoofbeats are triggered by foot contacts rather than an independent timer. Movement speeds and jump mechanics remain unchanged. Animation is stylized and procedural, without motion capture or automatic lead changes.

The whole body moves with the legs. At the walk the barrel swings over the supporting legs, each hip rises as its hind leg carries the weight and the head nods as a forefoot lands; the trot bounces with a steady head and a lifted tail; the canter rocks, with the hindquarters tucking under as they land and the neck swinging down over the leading foreleg; over a fence the neck stretches out. The rig has a croup bone at the loins that carries the hind legs and the tail, so the hindquarters can roll and tilt independently of the saddle. The neck bends into turns, the tail swings with the hind legs, and a standing horse breathes, looks about, swishes its tail in bursts and, when left waiting, rests one hind leg on the toe with that hip dropped.

Rhythm references: [FEI — Gait](https://www.fei.org/node/38138), [University of Arizona — Horse gaits](https://opentextbooks.library.arizona.edu/app/uploads/sites/274/2023/11/Horse-Gaits.pdf).

`node scripts/gait-check.ts` saves a side-view comparison of four phases per gait to `artifacts/gait-phases.png`. It requires Vite on port 5173. `tests/gaits.test.ts` checks foot-contact order, suspension, transitions, muted hoofbeats during jumps, and hoof positions.

## The rider on foot

`src/horse/walking-rider.ts` animates the rider procedurally from her speed alone. Each foot follows a stance and a swing: a planted foot moves back under the body exactly as far as the body travels, rolling from heel to ball of the foot, so it never skids; the swinging foot arcs forward and slows to the speed of the ground before landing. Cadence and the share of time on the ground change with speed, blending a heel-to-toe walk into a run with a flight phase. The hips sway over the planted foot, rotate with the stride, drop on the side of the swinging leg and sit as high as the planted legs allow; the shoulders counter-rotate, the head stays level and looks at what the rider handles, and the arms swing against the legs, pumping with bent elbows when running. Standing still, the rider breathes, shifts her weight from leg to leg and glances about. `node scripts/walk-check.ts` saves side and front views of walking, running, walking backwards, starting, stopping, standing, turning and the hand gestures to `artifacts/walk-phases.png`; `tests/walking.test.ts` checks that planted feet stay put.

## Stable

The main stable west of the arena has two open entrances, a traversable central aisle and five stall bays on each side. Its residents are Iskra, Luna, Fuks, Maks, Burza, and Kasztan. The first stall on the left from the main entrance is empty and reserved for Raven, the player's horse. Two smaller stables south of the bridleway, the red Linden Stable and the timber Meadow Stable, house Bajka, Dukat and Figa and share the same cross-section, so every stable is generated from one layout with a different number of bays and palette. All stall entrances are open so the player can approach and ride any horse in and out. Stalls contain bedding, water, and hay. Every stall has a nameplate with its number and the name of the horse that lives there; a vacant stall shows a horseshoe. `src/world/roster.ts` lists every horse with its home stall, including the other riders' horses and the pasture horses. Horses can be renamed in the appearance dialog, by typing or with the dice button; names are saved per horse and update the nameplates at once. Horses nobody rides or leads come alive: they look about, stroll a few metres at a time, graze with their heads down in the grass, and stop to watch a rider who comes close. A horse in a stall stays inside it, horses on the pasture roam the whole paddock, and a horse left anywhere else potters around the spot where it was left. Wiatr, Zorza and Grafit live on the pasture.

The horse rig has two neck bones and a head bone. The sculpt has no neck weights, so `src/horse/neck.ts` derives them from each vertex's position between the base of the neck and the throatlatch; the mane, halter, bridle, ornaments and eyes are re-skinned to the same chain, and each hair lock follows its root so the mane lies along the lowered neck. `src/game/wander.ts` holds the waiting-horse behaviour and is covered by `tests/wander.test.ts`.

The tack room is on the right when entering through the main entrance. Players can ride inside; it contains saddles on racks, bridles, folded saddlecloths, and a grooming box. These are environmental props; the palette button still opens customization for the most recently ridden horse.

The interior has a paved aisle, timber framing, a pitched roof, lamps, and windows. The third-person camera moves closer near walls and the roof, while the first-person camera looks slightly lower indoors. Wall placement and collisions share `src/world/stable-layout.ts`.

`node scripts/stable-check.ts` rides from the starting position into the stable, checks both cameras, enters the tack room, exits through the rear doorway, and saves screenshots. `tests/stable.test.ts` checks aisle and doorway clearance and barriers around stalls.

`node scripts/riding-check.ts` verifies mounting, dismounting, walking/running, proximity checks, pause, cameras, and reset using the local Vite server.

`node scripts/herd-check.ts` verifies switching from Raven to Fuks, riding out of a stall, independent decorations, returning to Raven, and saved appearance after reloading. Horse positions reset on reload.

In the appearance panel's Colors section, Riding offers Saddled or Bareback. Bareback removes the saddle, stirrups, girth, and saddlecloth while keeping the bridle and reins. The rider sits lower, and mounting, walking, running, and jumping remain available. Equipment is saved separately for every horse; switching back restores the existing saddlecloth colors and patterns.

- L or the lead button, while on foot beside a horse: attach or release a lunge line. Unmounted horses wear halters, with the line attached to the lower ring. The selected horse follows at walk/trot while the handler walks or runs, and waits when released. This is leading on a line, not circular lunging. Walls, fences, other horses, and a six-metre reach constrain movement; take a wider route if the horse gets blocked. Mounting or returning home releases the line.

## Gamepad and Steam Deck

Standard gamepads use the browser Gamepad API. On Steam Deck, launch the browser through Steam and choose a **Gamepad** Steam Input layout (keyboard/mouse emulation does not expose analog gamepad input). Serve the game over HTTPS or localhost; an HTTP LAN address may not expose the Gamepad API. Press a controller button after opening the game. If audio stays silent, click or tap once to unlock browser audio.

- Left stick: analog steering. With a gait selected, up/down smoothly increases/reduces its speed by up to 30% without changing the gait pattern; horse animation cadence follows the adjustment. Releasing restores the selected speed. From standing, hold up/down for fine forward/back steps (up to 1.2 m/s forward and 0.9 m/s backward); release stops immediately. Works mounted, on foot, and while leading; normal collisions still apply.
- Right stick: horizontal look, returning to center when released; up brings the third-person camera closer, down moves it farther away. Distance stays where you leave it, within 45–180% of the normal distance. Wall avoidance still applies; first-person view stays fixed.
- LB/RB or D-pad down/up: slower/faster persistent gait.
- A: jump; B: mount/dismount; X: attach/release lead; Y: camera; RT: treat or pat; LT: take hold of or put down a jump.
- Right-stick click (R3): toggle fullscreen, also available as a button in Pause and Settings. If the browser requires a direct user gesture, tap/click the Fullscreen button.
- Menu/Start: pause; View/Back: help; D-pad left: appearance; D-pad right: settings.
- Menus: D-pad or left stick steps through visible controls; A selects; B/Menu returns to riding. Left/right changes a focused language selection.

Settings contains controller status, a vibration toggle, and a test pulse. Hoof contacts produce gentle pulses; landings and knocked rails produce stronger pulses. Vibration is optional, independent of sound, and disabled for the connected device if the browser rejects it. Reconnecting retries support detection. The toggle lasts for the current session. Browser/SteamOS support for the Deck actuator must be tested on hardware; API availability alone does not prove physical feedback. Disconnecting the active controller pauses the game; keyboard and mouse remain available.

`node scripts/gamepad-check.ts` tests virtual controller input, menu navigation, vibration calls and failure handling in Chrome; it cannot verify physical vibration. The standard browser suite includes this check.

## Touch controls

Touch-capable devices automatically show one virtual movement stick and large buttons for pace, jump, mount/dismount, leading, and camera view. Drag the scene itself to look around; movement, scene dragging, and action buttons support independent simultaneous touches. The stick uses the same fine movement and pace adjustment as the gamepad. Finger release/cancellation clears stick input; losing focus pauses the game.

The compact Menu opens pause, settings, appearance, sound, home and fullscreen. Settings → Touch controls offers Automatic, Always show, or Hide, saved locally. Automatic mode uses touch capability and coarse-pointer detection, hides the overlay when a gamepad is used, and restores it when the screen is touched. Desktop keyboard/mouse controls remain available. Layouts account for screen safe areas and portrait/landscape sizes; this does not guarantee performance on every tablet.

`node scripts/touch-check.ts` uses Chrome touch emulation to verify simultaneous gestures, cancellation, preference persistence, switching between touch and gamepad, and phone/tablet layouts. Real iPad/Android hardware still needs playtesting.
