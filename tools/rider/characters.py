"""The riders that can be built. Add an entry to make another model.

`macros` are MakeHuman's main sliders (0-1; gender 0 is female, age 0.5 is a
young adult, 0.19 a child), `details` are extra (target, weight) pairs from
MakeHuman's target folders, and the rest names the CC0 assets to dress the
head with.
"""

CHARACTERS = {
    "adult-female": {
        "macros": {
            "gender": 0.0,
            "age": 0.5,
            "muscle": 0.56,
            "weight": 0.42,
            "height": 0.55,
            "proportions": 0.85,
            "cup": 0.42,
            "firmness": 0.7,
        },
        "details": [
            ("head/head-oval", 0.5),
            ("chin/chin-width-decr", 0.4),
            ("eyes/l-eye-scale-incr", 0.35),
            ("eyes/r-eye-scale-incr", 0.35),
            ("mouth/mouth-lowerlip-volume-incr", 0.35),
            ("mouth/mouth-upperlip-volume-incr", 0.3),
            ("mouth/mouth-angles-up", 0.3),
            ("nose/nose-scale-horiz-decr", 0.3),
            ("nose/nose-volume-decr", 0.3),
            ("cheek/l-cheek-bones-incr", 0.25),
            ("cheek/r-cheek-bones-incr", 0.25),
            ("neck/neck-scale-horiz-decr", 0.3),
        ],
        # Iris colour (r, g, b).
        "iris": (0.36, 0.25, 0.14),
        "skin": "skins/young_caucasian_female/young_lightskinned_female_diffuse.png",
        "eyes": "eyes/materials/brown_eye.png",
        "eyebrows": "eyebrow001",
        "eyelashes": "eyelashes01",
    },
}
