# Architecture and development

This is a small Three.js game, with explicit modules rather than an engine framework or ECS. Gameplay runs without a DOM or WebGL context. The application connects it to rendering, input, audio, and UI.

## Where to make changes

| Change                                                   | Module                                                |
| -------------------------------------------------------- | ----------------------------------------------------- |
| Speed, jump timing, collision radius, world boundary     | `src/game/tuning.ts`                                  |
| Movement, jump buffering, collision rules                | `src/game/physics.ts`                                 |
| Gait rhythm, blending, foot contacts, inverse kinematics | `src/game/gaits.ts`                                   |
| Horse body sculpture and export (Blender)                | `tools/horse/`                                        |
| Horse asset loading, rig landmarks, fitting samples      | `src/horse/asset.ts`                                  |
| Rider models: body, clothes, textures, export            | `tools/rider/`                                        |
| Rider skeleton, pose solver, seat, walking and mounting  | `src/horse/figure.ts`, `rider.ts`, `walking-rider.ts` |
| Rider model registry and loading                         | `src/horse/rider-asset.ts`, `rider-files.ts`          |
| Horse rig, tack, hairstyles and ornaments                | `src/horse/model.ts`, `halter.ts`, `saddle.ts`        |
| Coat shading from baked masks                            | `src/horse/skin.ts`                                   |
| Procedural mesh helpers, rider, cloth textures           | `src/horse/geometry.ts`, `rider.ts`, `patterns.ts`    |
| Model-to-animation contract                              | `src/horse/types.ts`                                  |
| Applying a pose to the model                             | `src/horse/animation.ts`                              |
| Appearance catalog and validation                        | `src/horse/appearance.ts`                             |
| Stable walls and colliders                               | `src/world/stable-layout.ts`                          |
| Map layout: arena, racecourse, pasture, paths            | `src/world/layout.ts`, `fences.ts`                    |
| Clock, sun path and weather model                        | `src/game/environment.ts`                             |
| Night sky, clouds, rain, snow, lamps and light pools     | `src/world/sky.ts`, `rain.ts`, `lamps.ts`             |
| Waiting horses: strolling, grazing, treats               | `src/game/wander.ts`, `src/horse/neck.ts`             |
| Movable jumps and their collisions                       | `src/game/obstacles.ts`, `src/world/jumps.ts`         |
| Other riders: riding and path finding                    | `src/game/npc.ts`, `navigation.ts`                    |
| Other riders' days, stabling routine, clubhouse          | `src/app/riders.ts`, `src/world/clubhouse.ts`         |
| Path network and stall access                            | `src/world/paths.ts`                                  |
| Every horse, its home stall and name; nameplates         | `src/world/roster.ts`, `src/horse/names.ts`           |
| Stable building and residents                            | `src/world/stable.ts`                                 |
| Clubhouse room, furniture and the bed                    | `src/world/clubhouse.ts`, `furniture.ts`              |
| Places to drive to and their edges                       | `src/game/regions.ts`, `src/world/region-layout.ts`   |
| Beach, mountains and hippodrome scenery                  | `src/world/beach.ts`, `mountains.ts`, `hippodrome.ts` |
| Car, trailer, loading and unloading a horse              | `src/game/trailer.ts`, `src/world/vehicle.ts`         |
| Travel map                                               | `src/ui/travel-map.ts`                                |
| Races at the hippodrome                                  | `src/game/race.ts`, `src/app/racing.ts`               |
| Scenery layout, fences, obstacles                        | `src/world/world.ts`, `primitives.ts`                 |
| Sky, haze, clouds, environment lighting, sun             | `src/world/sky.ts`, `sun.ts`                          |
| Ground surface mask, terrain textures, distant hills     | `src/world/terrain.ts`                                |
| Grass, trees, wildflowers                                | `src/world/grass.ts`, `trees.ts`, `flowers.ts`        |
| Material finishes (wood, boards, concrete, roofing)      | `src/world/surface-detail.ts`                         |
| Procedural noise and texture helpers                     | `src/world/noise.ts`, `textures.ts`                   |
| Camera following and wall avoidance                      | `src/rendering/camera.ts`                             |
| Keyboard/pointer input, audio, storage                   | `src/platform/`                                       |
| Page markup, appearance controls, preview, minimap       | `src/ui/`                                             |
| Styling                                                  | `src/style.css`                                       |
| Startup, frame loop, pause, UI actions, teardown         | `src/app/game.ts`                                     |

`src/main.ts` only loads global styles/fonts and starts the application. It also registers Vite hot-reload cleanup. Imports use explicit `.ts` extensions so both Vite and Node's built-in type stripping can execute the same modules.

## Boundaries

- `game/` contains state and numeric rules, with no browser or Three.js imports. Oxlint enforces its import boundary and checks for dependency cycles throughout the project.
- `horse/` owns the visual rig and appearance. Its animation adapter reads the minimal `MotionState` interface, without moving the physical player or changing collisions.
- `world/` builds the environment. Collision records are plain `Solid`/`Obstacle` data, separate from meshes. Stable rendering and physics share wall dimensions from `stable-layout.ts`.

## Scenery rendering

The environment is procedural and asset-free. `sky.ts` bakes the analytic sky into a prefiltered environment map once at startup; `createWorld().dispose()` releases it, since it is not reachable from scene meshes. `terrain.ts` paints one mask texture (sand, worn earth, lushness, grass density) that both the terrain shader and the grass shader sample, so paths, the arena and the stable apron stay consistent. Grass is a fixed grid of instanced tiles that follows the camera; distant tiles draw fewer tufts and blades shrink to nothing before the grid edge. Trees are a few pre-built shapes per kind drawn as instanced meshes; backdrop trees on the hills use lighter shapes and cast no shadows. Tree placement keeps the original random sequence so existing trunk colliders stay where they were.

Shader extensions use `onBeforeCompile`. Samplers that are only shader uniforms are listed in `material.userData.textures`, which `disposeScene` releases alongside regular material textures. `createWorld().update(time, camera)` advances wind and cloud drift and repositions the grass grid; call it after the camera has moved each frame.

The places the car drives to are flat discs about three kilometres apart in the same world coordinates, so physics, animation and every scene system keep working unchanged and nothing of one place is ever in view from another. `src/game/regions.ts` gives each its centre and edge; `createWorld().enter(id)` builds a place the first time it is visited (its ground, scenery, colliders and trees), shows it and hides the others, switches the grass to its painted surface and sets its haze and ground light. `createRegionGround` in `terrain.ts` paints a surface mask for a place from a function and shapes its ground from a height field, with the same shader as home plus snow, rock on steep slopes and wet sand behind the surf. The sky dome and cloud deck follow the camera.

Static scenery (buildings, fences, props) is merged per material by `src/rendering/merge.ts` after it is built, so large buildings cost a few draw calls; meshes marked `userData.dynamic` (movable jumps) are skipped. Trees are instanced per shape and per 70 m map chunk so off-screen chunks are culled. The sun's shadow map covers 160 m around a point ahead of the camera and snaps to whole texels. Horses outside the view are hidden and distant ones skip animation.

Scenery costs about one to two million triangles per frame from the default camera, dominated by grass, trees and the horse models. Profile on the target computer before adding more vegetation; lowering `CLUMPS_PER_CHUNK` in `grass.ts` or the backdrop tree count in `world.ts` are the cheapest levers.

- `platform/` owns browser APIs. Saved data enters as `unknown`, is normalized against the appearance catalog, and never directly becomes trusted game state. Storage failure is optional and does not block play.
- `ui/` owns HTML, controls and the preview. The appearance panel accepts only the model's appearance setter; the minimap accepts positions and obstacle data rather than a Three.js scene.
- `rendering/` owns the camera and GPU-resource cleanup. `app/` coordinates these modules and owns their lifetime.

## The horse asset

The horse body is `src/assets/horse.glb`, built by `tools/horse/build_horse.py` in Blender 4.2 or later (it needs the bundled numpy and OpenVDB). `tools/horse/anatomy.py` describes the body as smoothly blended signed-distance primitives in game coordinates: the trunk, neck, skull and each leg are lofts traced from their side outlines (a point on the topline or the front of the leg, the opposite point, and a half-width per station), with muscles and bony landmarks as ellipsoids and cones on top; OpenVDB meshes the field, and `tools/horse/game_mesh.py` reduces it to about 46,000 triangles, transfers smooth normals from the high-resolution surface and writes everything the game needs as custom vertex attributes: distance-field ambient occlusion (`_ao`), sock/muzzle/hoof masks (`_mask`), and per-vertex leg and bone weights (`_leg`, `_weight`). Rig landmarks and surface samples used to fit tack, hair and ornaments travel as JSON in the node extras. There is no armature or texture in the file.

Rebuild after editing the anatomy:

```sh
blender --background --python tools/horse/build_horse.py -- --preview artifacts/horse
```

The build refuses to export a body with tunnels (Euler characteristic other than 2); blend the masses around the reported gap. `--preview DIR` also renders side, front, three-quarter and head views, and `--sculpt-only` stops before export. While editing the anatomy, `python3 tools/horse/quickview.py OUT.png` shades side, front, rear and top views from the distance field in a couple of seconds without Blender, and `node scripts/horse-check.ts` renders the exported horse without tack in the game's renderer from every side. `python3 tools/horse/overlay.py PHOTO OUT.png --hind X --fore X --ground Y` compares the sculpt's side silhouette with a side-view photograph on a white background, scaled from the pixel positions of the cannons and the ground: blue marks where the sculpt covers background, green where it misses the horse.

`src/main.ts` loads the asset before `startGame()`; unit tests load it from disk through `tests/support/horse-asset.ts`. `createHorse()` stays synchronous and shares one body geometry between all horses.

The rig uses metres, +Y up and +Z forward, with the root at ground level. Each leg has three bones (upper leg from the elbow in front and from the hip joint behind, so the whole thigh swings; knee or hock; fetlock) in the order left hind, left fore, right hind, right fore; `HorseModel.legRigs` gives their rest segments. Animation first chooses a pastern angle (level when planted, breaking over at the end of a long stride, folded when lifted), derives the fetlock target from the hoof marker, then solves the two upper segments. Shoulders and hips slide a little so supporting legs stay nearly straight. Hoof markers sit 0.12 above the ground on a planted hoof.

The preview clones the model before locomotion starts. It uses the names of `body` and `rider`, shares materials and geometry with the live model, and synchronizes visibility for unique `choice:<field>:<id>` groups. Keep collision shapes independent of mesh detail.

## The rider assets

Riders are built by `tools/rider/build_rider.py` from MakeHuman's CC0 base mesh, morph targets, rig and skin (see `tools/rider/README.md` for the sources); the build needs only numpy and Pillow, plus Blender's `bpy` module to bake ambient occlusion. Each model has a folder in `src/assets/riders/<id>/` holding `rider.glb` and four WebP textures: the skin of the head, a sheet with eyes, eyebrows and lashes, and the outfit's detail and normal maps. `tools/rider/characters.py` lists the models; `RIDER_MODEL_IDS` in `src/horse/rider-asset.ts` lists the ones the game loads, and `createFigure(model)`, `createRider(..., model)` and `createWalkingRider(model)` pick one (the default is `adult-female`).

The body is morphed with MakeHuman's sliders, then dressed: top, breeches and boots are cut from MakeHuman's smooth clothing helper surface along lines measured from the joints, gloves are the smoothed hands, and the helmet, harness, belt, soles and ponytail are generated. Only the head and neck keep their skin. Garment UVs are cylinders around the trunk and limbs, each in its own slot of one atlas, so `textures.py` paints seams, zips, wrinkles and weave in the garment's own coordinates. The detail map is a grey multiplier of each material's colour, which is how `dressFigure` dyes jacket, breeches, helmet, hair, boots and gloves for other riders.

The GLB is plain glTF with quantised attributes, a primitive per material and joints without rest rotations; joint positions, chain ends and head landmarks are repeated in the mesh node's `extras.rig`. `skeleton.py` reduces MakeHuman's rig to about sixty bones: hips, spine, chest, neck and head; clavicles, arms and legs with twist bones in the upper arm, forearm and thigh; three bones per finger; a toe bone; and three bones for the ponytail.

`src/horse/figure.ts` builds the skeleton and poses it by aiming bones along directions in figure space (soles on the ground, facing +Z). `reach` is two-bone IK for arms and legs and `bend` lays a limb along two directions; both twist each bone so elbows and knees keep their hinge, and twist is shared with the twist bones so skin turns gradually. `grip` closes a hand and `swingHair` lets the ponytail swing as a damped pendulum. `rider.ts` seats a figure with her hip joints at `SEAT_POINT`, feet in the stirrups at `STIRRUP` and hands on the reins at `REIN_HAND`; the saddle is fitted to the horse's measured flank. `walking-rider.ts` animates a second figure on foot (planted feet, heel strike and toe-off, arm swing, running with a flight phase) and plays the mount: she steps in facing the saddle, puts the near foot in the stirrup, rises to stand in it, swings the far leg over and sits. `transferFrame` in `src/game/riding.ts` only says how far through the mount she is and where her origin is; the choreography is worked out in the horse's seat space. Because every measurement comes from the model's rig, poses adapt to models with other proportions. Load the horse and the riders before `startGame()`; tests load geometry without textures through `tests/support/horse-asset.ts`.

Check a rebuilt model in the game's renderer with `node scripts/rider-check.ts` (the model from every side), `node scripts/mount-check.ts` (seat and mount) and `node scripts/walk-check.ts` (walking, running, gestures); each needs a dev server and writes a sheet to `artifacts/`.

## Timing and ownership

Frame deltas are seconds and are capped by `MAX_FRAME_DELTA`; resuming a suspended tab cannot cause a giant movement step. Pause freezes simulation time. Gait contacts drive hoof sounds, and jump duration is shared by physics and animation. The existing variable-step behavior is preserved; deterministic replays or networking would be a reason to introduce a fixed-step simulation later.

`startGame()` returns an idempotent `dispose()`. It stops the render loop, aborts window input/resize listeners, closes audio, disposes preview controls and its private floor/shadow resources, clears cached horse textures, disposes scene resources once per shared object, and removes the mounted UI and development snapshot. The preview does not dispose its cloned horse resources because the main scene owns those shared objects. Model `dispose()` releases its cached appearance textures; the containing scene owns mesh geometry and materials.

Keep allocations and DOM queries out of frequently called frame code when practical. Camera vectors are reused. New textures, materials, render targets, event listeners, or timers need an explicit owner and matching cleanup.

## Tooling and checks

Use Node 24 (or Node 22.18+) and pnpm 10.33.4, pinned in the `packageManager` field. See the [pnpm installation instructions](https://pnpm.io/10.x/installation) if it is not installed. Run `pnpm install --frozen-lockfile` to reproduce `pnpm-lock.yaml`. Use `pnpm add` / `pnpm add -D` to change dependencies and commit the updated lockfile. `pnpm-workspace.yaml` permits the esbuild native-binary installation script; other dependency build scripts require an explicit entry.

- `pnpm run dev`: local Vite server.
- `pnpm run typecheck`: native TypeScript 7.0.2 (`tsc`), strict mode, no emit.
- `pnpm run lint`: Oxlint with native TS 7 type-aware rules, Stylelint for CSS, HTML Validate for HTML.
- `pnpm run format`: Prettier with tabs for TS, JS, HTML and CSS.
- `pnpm run check`: type checking, all linters, formatting check and unit tests.
- `pnpm run build`: type checking followed by the production Vite bundle.
- `pnpm run check:browser`: isolated browser regression suite; starts and stops its own Vite server on port 5174. It uses installed Chrome by default. Set `BROWSER_PORT` if that port is occupied. To use Playwright's Chromium, run `pnpm exec playwright install chromium` and set `BROWSER_CHANNEL=chromium`.

Browser scripts can also run individually with `node scripts/browser-check.ts` (or appearance/stable/gait/lifecycle equivalents) against a running server on port 5173. `BROWSER_BASE_URL` overrides that address. They use fresh browser profiles and save screenshots under ignored `artifacts/`.

Oxlint and `oxlint-tsgolint` provide native type-aware linting; there is no TS 6 or ESLint compatibility dependency. The compiler and native lint engine are pinned to matching TS 7 versions. Update them together and run the full suite. Formatting belongs to Prettier, with HTML Validate's Prettier compatibility preset. Stylelint's descending-specificity rule is disabled because independent UI components intentionally use selectors of different specificity; duplicate selectors and CSS correctness rules remain enabled. YAML uses spaces because tabs are invalid YAML indentation.

CI installs the pinned pnpm version, caches its store, uses a frozen lockfile, and runs the checks, build and browser suite with Chromium on Node 24, and uploads screenshots. Unit tests cover gameplay, rig motion, camera collision, storage failure/migration and resource disposal. Browser checks cover movement, jumps, pause, cameras, all appearance variants, persistence, stable navigation, compact layouts and repeated start/dispose cycles.

The production Three.js chunk currently exceeds Vite's default 500 kB warning threshold, as it did in the prototype. Keep the warning visible and profile real loading/rendering costs before adding code splitting or increasing the limit.

## Localization

`src/i18n/en.ts` and `src/i18n/pl.ts` contain player-readable messages. Add matching semantic keys to both catalogs; TypeScript enforces Polish catalog coverage. Use `t(key, parameters)` for dynamic text and `{{key}}` placeholders in `src/ui/shell.html`. Interpolated values are written as text rather than HTML. Horse names and saved appearance IDs remain language-independent.

`src/i18n/index.ts` selects a supported browser language on first launch, uses English as fallback, and stores explicit Settings choices under `alas-stable.language`. Appearance, language, and touch preferences use the `alas-stable` storage prefix; `src/platform/storage.ts` falls back to the legacy `polana` keys on the same origin so existing preferences remain available. New saves use the renamed keys. Language changes refresh shell text, dynamic hints, appearance controls, document metadata and canvas signs without restarting gameplay. Sign textures unsubscribe when disposed; the application removes its language listener during teardown. The initial HTML title comes from the English catalog through Vite.

`tests/i18n.test.ts` checks locale matching, catalog coverage and message parameters. `scripts/i18n-check.ts` covers live switching, preserved state, reload persistence, storage failure and compact Settings layout. Existing gameplay browser fixtures explicitly select Polish.
