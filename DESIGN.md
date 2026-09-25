# Design decisions

- Audience: school-age children. Starting play should not require reading; short text can supplement pictures.
- Desktop browser. A naturalistic 3D world with a realistic riding stable, meadows, and forest, without fantasy elements. The world started cartoon-style and now aims for realism; see below.
- Free riding and a separate jumping arena in the same world. A small area suitable for a ride lasting a few minutes.
- No scores, timers, mandatory tasks, or competition in the first version.
- Up/Down or W/S selects a gait that the horse maintains automatically. Left/Right or A/D steers.
- The child initiates jumps, but timing need not be perfect. A missed jump knocks down a rail or causes a gentle stop; there are no falls or injuries.
- The default camera follows from behind the horse. Mouse look is optional, and players can switch to first-person view.
- One rider character is visible in third-person view.
- Play starts on horseback. Customization is available through an icon button. All options are unlocked: coat, mane and tail, saddle, saddlecloth, and ornaments.
- Hoofbeats, horse sounds, and nature ambience. No music for now.

First, test whether riding, cameras, and jumps feel enjoyable. Then develop customization and world details. Consider tasks or competitions only after playtesting.

## After the first playtest

The user confirmed that controls and jumping worked as intended. Preserve those mechanics.
Before expanding customization, improve the horse and rider models and the close-up preview.
The next stage covers selectable mane and tail styles, bows, flowers, ribbons, and saddlecloth patterns. All options remain available from the start.

## Towards realism

The team asked for a more realistic look. The environment now uses a physically based sky with image-based lighting and haze, one blended terrain with hills beyond the ridden area, wind-blown grass, procedural broadleaves and spruces, and material detail on built objects. Everything is still generated in code, without downloaded assets. The horse and rider keep their friendly proportions for now; changing their anatomy is a separate step that also affects the gait rig.
