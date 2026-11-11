# Rider models

`build_rider.py` builds each rider in `src/assets/riders/<id>/` from
[MakeHuman](https://github.com/makehumancommunity/makehuman)'s base mesh,
morph targets, default rig and system assets, all of which are released under
CC0. Nothing from MakeHuman is stored in this repository except what the build
writes into the exported model and textures.

## Sources

```sh
git clone --depth 1 https://github.com/makehumancommunity/makehuman.git
curl -LO https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
unzip -q makehuman_system_assets_cc0.zip -d makehuman-assets
```

## Building

```sh
pip install numpy pillow bpy   # bpy is optional; see below
python3 tools/rider/build_rider.py --makehuman makehuman --assets makehuman-assets
```

The build needs only numpy and Pillow. With Blender's Python module (`bpy`)
available it also bakes ambient occlusion into the vertices (without it the
figure is exported unoccluded) and `--preview DIR` renders untextured views of
the assembled parts. `--character ID` picks an entry of `characters.py`.

Check the result in the game's renderer with a dev server running:

```sh
node scripts/rider-check.ts   # the model from every side, with close-ups
node scripts/mount-check.ts   # the seat and the mount, frame by frame
node scripts/walk-check.ts    # walking, running and gestures
```

## Layout

| File            | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `characters.py` | The riders that can be built: body sliders, face details, assets   |
| `makehuman.py`  | Reads the base mesh, targets, fitted assets, rig and weights       |
| `skeleton.py`   | Reduces MakeHuman's 163-bone rig to the game's skeleton            |
| `outfit.py`     | Cuts and shapes the clothes, boots, gloves, helmet, hair and belt  |
| `textures.py`   | Paints the outfit's detail and normal maps; crops the face texture |
| `meshops.py`    | Subdivision, normals, boundary loops and other mesh helpers        |
| `export.py`     | Writes the quantised GLB and the WebP textures                     |
| `preview.py`    | Blender renders of the parts for checking shapes                   |

## Adding a model

1. Add an entry to `CHARACTERS` in `characters.py`. `macros` are MakeHuman's
   main sliders: `gender` (0 female, 1 male), `age` (0.19 child, 0.5 young
   adult, 1 old), `muscle`, `weight`, `height`, `proportions`. Pick a matching
   skin from the asset pack.
2. Build it with `--character <id>`.
3. Add the id to `RIDER_MODEL_IDS` in `src/horse/rider-asset.ts`.

Garments are cut from MakeHuman's clothing helper surface and every
measurement comes from the morphed body's joints, so the same outfit fits any
build. The game reads joint positions from the exported rig, so poses and gaits
adapt to each model's proportions.
