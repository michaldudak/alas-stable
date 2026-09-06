# Architecture and development

This is a small Three.js game, with explicit modules rather than an engine framework or ECS. Gameplay runs without a DOM or WebGL context. The application connects it to rendering, input, audio, and UI.

## Where to make changes

| Change                                                   | Module                                             |
| -------------------------------------------------------- | -------------------------------------------------- |
| Speed, jump timing, collision radius, world boundary     | `src/game/tuning.ts`                               |
| Movement, jump buffering, collision rules                | `src/game/physics.ts`                              |
| Gait rhythm, blending, foot contacts, inverse kinematics | `src/game/gaits.ts`                                |
| Horse silhouette, rig, tack, hairstyles and ornaments    | `src/horse/model.ts`                               |
| Procedural mesh helpers, rider, cloth textures           | `src/horse/geometry.ts`, `rider.ts`, `patterns.ts` |
| Model-to-animation contract                              | `src/horse/types.ts`                               |
| Applying a pose to the model                             | `src/horse/animation.ts`                           |
| Appearance catalog and validation                        | `src/horse/appearance.ts`                          |
| Stable walls and colliders                               | `src/world/stable-layout.ts`                       |
| Stable building and residents                            | `src/world/stable.ts`                              |
| Terrain, vegetation, fences, obstacles, lighting         | `src/world/world.ts`, `primitives.ts`              |
| Camera following and wall avoidance                      | `src/rendering/camera.ts`                          |
| Keyboard/pointer input, audio, storage                   | `src/platform/`                                    |
| Page markup, appearance controls, preview, minimap       | `src/ui/`                                          |
| Styling                                                  | `src/style.css`                                    |
| Startup, frame loop, pause, UI actions, teardown         | `src/app/game.ts`                                  |

`src/main.ts` only loads global styles/fonts and starts the application. It also registers Vite hot-reload cleanup. Imports use explicit `.ts` extensions so both Vite and Node's built-in type stripping can execute the same modules.

## Boundaries

- `game/` contains state and numeric rules, with no browser or Three.js imports. Oxlint enforces its import boundary and checks for dependency cycles throughout the project.
- `horse/` owns the visual rig and appearance. Its animation adapter reads the minimal `MotionState` interface, without moving the physical player or changing collisions.
- `world/` builds the environment. Collision records are plain `Solid`/`Obstacle` data, separate from meshes. Stable rendering and physics share wall dimensions from `stable-layout.ts`.
- `platform/` owns browser APIs. Saved data enters as `unknown`, is normalized against the appearance catalog, and never directly becomes trusted game state. Storage failure is optional and does not block play.
- `ui/` owns HTML, controls and the preview. The appearance panel accepts only the model's appearance setter; the minimap accepts positions and obstacle data rather than a Three.js scene.
- `rendering/` owns the camera and GPU-resource cleanup. `app/` coordinates these modules and owns their lifetime.

## Replacing the horse

Keep `createHorse(): HorseModel` as the construction entry point; both the player and stable residents use it. Visual changes should stay under `horse/`, without touching movement or collision code.

The procedural rig uses metres, +Y up and +Z forward, with the root at ground level. Limb arrays have exactly four entries in this order: left hind, left fore, right hind, right fore. Animation writes body, leg, knee, hoof, tail and rider transforms. The existing IK solver assumes the current limb lengths and rest pose; a differently proportioned rig needs a matching animation adapter or updated solver, not just a swapped mesh.

The preview clones the model before locomotion starts. It uses the names of `body` and `rider`, shares materials and geometry with the live model, and synchronizes visibility for unique `choice:<field>:<id>` groups. Preserve these names/variant groups when retaining this preview implementation. Alternatively, update the preview and animation adapters alongside a new rig.

A future GLB model should load behind this factory/adapter boundary. Await asset loading before starting the frame loop, retain the coordinate convention, and keep collision shapes independent of mesh detail. Store imported assets under `src/assets/` and resolve them through Vite so production URLs receive hashes. No asset loader or additional engine abstraction is needed for the current procedural models.

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

`src/i18n/index.ts` selects a supported browser language on first launch, uses English as fallback, and stores explicit Settings choices under `polana.language`. Language changes refresh shell text, dynamic hints, appearance controls, document metadata and canvas signs without restarting gameplay. Sign textures unsubscribe when disposed; the application removes its language listener during teardown. The initial HTML title comes from the English catalog through Vite.

`tests/i18n.test.ts` checks locale matching, catalog coverage and message parameters. `scripts/i18n-check.ts` covers live switching, preserved state, reload persistence, storage failure and compact Settings layout. Existing gameplay browser fixtures explicitly select Polish.
