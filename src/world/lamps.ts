import * as THREE from 'three';
import type { Solid } from '../game/types.ts';
import { box, cylinder } from './primitives.ts';
import { ARENA, PASTURE, RACE_TRACK } from './layout.ts';

/** Most outdoor light pools the ground and grass shaders sum per fragment. */
export const MAX_LAMP_POOLS = 24;

/** Uniforms shared by every shader that shows weather and lamplight. */
export function createSurfaceUniforms() {
	return {
		lampPools: {
			value: Array.from(
				{ length: MAX_LAMP_POOLS },
				() => new THREE.Vector4(0, 0, 1, 0),
			),
		},
		lampStrength: { value: 0 },
		wetness: { value: 0 },
		wind: { value: 0.2 },
	};
}
export type SurfaceUniforms = ReturnType<typeof createSurfaceUniforms>;

/** GLSL summing warm light from the outdoor lamp pools at a ground position. */
export const LAMP_POOL_GLSL = /* glsl */ `
uniform vec4 lampPools[${MAX_LAMP_POOLS}];
uniform float lampStrength;
vec3 lampLight(vec2 p) {
	if (lampStrength <= 0.0) return vec3(0.0);
	float light = 0.0;
	for (int i = 0; i < ${MAX_LAMP_POOLS}; i++) {
		vec4 lamp = lampPools[i];
		float d = distance(p, lamp.xy) / lamp.z;
		light += lamp.w * pow(max(0.0, 1.0 - d), 2.0);
	}
	return vec3(1.0, 0.78, 0.52) * light * lampStrength;
}`;
const POOL_LIGHTS = 5;

type Kind = 'lantern' | 'flood' | 'stable';
type Lamp = { position: THREE.Vector3; kind: Kind };

const LANTERNS: readonly [number, number][] = [
	// Stable yard, between the three stables and along the arena path.
	[-32, 16],
	[-44, 26],
	[-30, 34],
	[-16, 35],
	[0, 35],
	[7, 27],
	[-22, 5],
	// Towards the pasture and the racecourse.
	[PASTURE.x - PASTURE.halfWidth - 2, PASTURE.z + 5],
	[50, 60],
	[RACE_TRACK.gateX + 7, RACE_TRACK.z - RACE_TRACK.radius - 8],
];

function floodlights(): [number, number, number][] {
	const west = ARENA.x - ARENA.halfWidth - 1.5,
		east = ARENA.x + ARENA.halfWidth + 1.5,
		north = ARENA.z - ARENA.halfDepth - 1.5,
		south = ARENA.z + ARENA.halfDepth + 1.5;
	const outer = RACE_TRACK.radius + RACE_TRACK.halfWidth + 2;
	return [
		[west, north, Math.PI * 0.25],
		[east, north, -Math.PI * 0.25],
		[west, south, Math.PI * 0.75],
		[east, south, -Math.PI * 0.75],
		[RACE_TRACK.x - RACE_TRACK.straight, RACE_TRACK.z - outer, 0],
		[RACE_TRACK.x + RACE_TRACK.straight, RACE_TRACK.z - outer, 0],
		[RACE_TRACK.x - RACE_TRACK.straight, RACE_TRACK.z + outer, Math.PI],
		[RACE_TRACK.x + RACE_TRACK.straight, RACE_TRACK.z + outer, Math.PI],
	];
}

const glowVertex = /* glsl */ `
attribute float size;
uniform float scale;
varying float vFade;
void main() {
	vec4 view = modelViewMatrix * vec4(position, 1.0);
	gl_Position = projectionMatrix * view;
	gl_PointSize = size * scale / -view.z;
	vFade = smoothstep(4.0, 12.0, -view.z);
}`;

const glowFragment = /* glsl */ `
uniform float strength;
uniform vec3 color;
varying float vFade;
void main() {
	float d = length(gl_PointCoord - 0.5) * 2.0;
	float glow = pow(max(0.0, 1.0 - d), 2.2);
	gl_FragColor = vec4(color * glow * strength * (0.4 + 0.6 * vFade), 1.0);
}`;

/**
 * Lamp posts around the yard, floodlights at the arena and the racecourse, and
 * the lamps inside the stables. At dusk bulbs glow, halos appear, pools of
 * light warm the ground, and a few real lights follow the camera between the
 * nearest lamps, so any number of lamps costs the same to render.
 */
export function createLamps(
	scene: THREE.Scene,
	scenery: THREE.Object3D,
	solids: Solid[],
	stableLamps: readonly THREE.Vector3[],
	uniforms: SurfaceUniforms,
) {
	const bulb = new THREE.MeshStandardMaterial({
		color: '#fff3d6',
		emissive: '#ffbf6e',
		emissiveIntensity: 0,
		roughness: 0.4,
	});
	bulb.name = 'lamp-bulb';
	const lamps: Lamp[] = stableLamps.map((position) => ({
		position,
		kind: 'stable',
	}));
	for (const [x, z] of LANTERNS) {
		cylinder(scenery, '#2f3431', 0.07, 3.6, [x, 1.8, z], 0.05, 'paint');
		cylinder(scenery, '#2f3431', 0.2, 0.16, [x, 0.08, z], 0.14, 'paint');
		box(scenery, '#2f3431', [0.42, 0.06, 0.42], [x, 3.62, z]);
		const glass = box(scenery, '#fff3d6', [0.24, 0.32, 0.24], [x, 3.82, z]);
		glass.material = bulb;
		for (const [dx, dz] of [
			[-1, -1],
			[-1, 1],
			[1, -1],
			[1, 1],
		])
			box(
				scenery,
				'#2f3431',
				[0.04, 0.36, 0.04],
				[x + dx * 0.13, 3.82, z + dz * 0.13],
			);
		const cap = cylinder(
			scenery,
			'#2f3431',
			0.02,
			0.2,
			[x, 4.12, z],
			0.3,
			'paint',
		);
		cap.castShadow = false;
		solids.push({ x, z, w: 0.3, d: 0.3 });
		lamps.push({ position: new THREE.Vector3(x, 3.6, z), kind: 'lantern' });
	}
	for (const [x, z, facing] of floodlights()) {
		cylinder(scenery, '#6d7471', 0.12, 8, [x, 4, z], 0.09, 'paint');
		const head = new THREE.Group();
		head.position.set(x, 8, z);
		head.rotation.y = facing;
		scenery.add(head);
		box(head, '#6d7471', [1.6, 0.1, 0.1], [0, 0, 0]);
		for (const side of [-0.55, 0.55]) {
			box(head, '#3b403e', [0.5, 0.36, 0.2], [side, 0.05, 0.12]);
			const lens = box(head, '#fff3d6', [0.42, 0.28, 0.03], [side, 0.02, 0.23]);
			lens.material = bulb;
			lens.rotation.x = -0.5;
		}
		solids.push({ x, z, w: 0.4, d: 0.4 });
		// The light pool falls a little inside the arena or the track.
		lamps.push({
			position: new THREE.Vector3(
				x + Math.sin(facing) * 6,
				7.6,
				z + Math.cos(facing) * 6,
			),
			kind: 'flood',
		});
	}
	const outdoor = lamps.filter((lamp) => lamp.kind !== 'stable');
	outdoor.slice(0, MAX_LAMP_POOLS).forEach((lamp, i) => {
		const flood = lamp.kind === 'flood';
		uniforms.lampPools.value[i].set(
			lamp.position.x,
			lamp.position.z,
			flood ? 24 : 9,
			flood ? 0.9 : 0.75,
		);
	});
	// Soft halos around every outdoor bulb.
	const glowGeometry = new THREE.BufferGeometry();
	const glowPositions: number[] = [],
		sizes: number[] = [];
	for (const lamp of outdoor) {
		if (lamp.kind === 'lantern') {
			glowPositions.push(lamp.position.x, 3.84, lamp.position.z);
			sizes.push(3);
		}
	}
	for (const [x, z, facing] of floodlights())
		for (const side of [-0.55, 0.55]) {
			glowPositions.push(
				x + Math.cos(facing) * side + Math.sin(facing) * 0.3,
				8,
				z - Math.sin(facing) * side + Math.cos(facing) * 0.3,
			);
			sizes.push(3.2);
		}
	glowGeometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(glowPositions, 3),
	);
	glowGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
	const glowMaterial = new THREE.ShaderMaterial({
		name: 'LampGlow',
		uniforms: {
			strength: { value: 0 },
			scale: { value: 400 },
			color: { value: new THREE.Color('#ffd49a') },
		},
		vertexShader: glowVertex,
		fragmentShader: glowFragment,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	const glow = new THREE.Points(glowGeometry, glowMaterial);
	glow.name = 'lamp-glow';
	glow.frustumCulled = false;
	glow.renderOrder = 2;
	scene.add(glow);
	const lights = Array.from({ length: POOL_LIGHTS }, () => {
		const light = new THREE.PointLight('#ffe3ad', 0, 15, 2);
		scene.add(light);
		return light;
	});
	const ranked = lamps.map((lamp) => ({ lamp, distance: 0 }));
	return {
		/** Window glass and stable lamp shades glow with the lights inside. */
		update(camera: THREE.Camera, darkness: number, viewportHeight: number) {
			const night = THREE.MathUtils.smoothstep(darkness, 0.25, 0.7);
			bulb.emissiveIntensity = 0.2 + night * 2.2;
			uniforms.lampStrength.value = night;
			glowMaterial.uniforms.strength.value = night;
			glowMaterial.uniforms.scale.value = viewportHeight * 0.9;
			glow.visible = night > 0.01;
			for (const entry of ranked) {
				const outside = entry.lamp.kind !== 'stable';
				entry.distance =
					entry.lamp.position.distanceToSquared(camera.position) +
					// Daylight needs no outdoor lamps, so stable lamps win the pool.
					(outside && night < 0.01 ? 1e9 : 0);
			}
			ranked.sort((a, b) => a.distance - b.distance);
			lights.forEach((light, i) => {
				const { lamp } = ranked[i];
				light.position.copy(lamp.position);
				if (lamp.kind === 'stable') {
					light.intensity = 16 + night * 8;
					light.distance = 15;
				} else if (lamp.kind === 'flood') {
					light.intensity = night * 150;
					light.distance = 42;
				} else {
					light.intensity = night * 20;
					light.distance = 14;
				}
			});
		},
	};
}
