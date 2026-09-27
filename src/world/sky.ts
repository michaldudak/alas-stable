import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SUN_DIRECTION } from './sun.ts';
import type { Conditions } from '../game/environment.ts';

/** Horizon haze shared by the fog, so distant hills dissolve into the sky. */
export const HAZE = '#bccfdc';

const skyUniforms = /* glsl */ `
uniform float exposure, overcast, night;
uniform vec3 overcastColor, nightZenith, nightHorizon, moonDirection;
float starField(vec3 dir) {
	vec3 p = dir * 170.0;
	vec3 cell = floor(p);
	float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
	if (h < 0.975) return 0.0;
	vec3 center = cell + 0.5 + (vec3(fract(h * 13.1), fract(h * 71.3), fract(h * 37.7)) - 0.5) * 0.5;
	return smoothstep(0.32, 0.0, length(p - center)) * (0.35 + (h - 0.975) * 26.0);
}
void main() {`;

const skyComposite = /* glsl */ `
vec3 sky = retColor * exposure;
float above = max(direction.y, 0.0);
// A deep blue night sky with stars and a moon, faded out by daylight and cloud.
vec3 nightSky = mix(nightHorizon, nightZenith, pow(above, 0.45));
float moon = dot(direction, moonDirection);
nightSky += vec3(0.9, 0.93, 1.0) * smoothstep(0.99955, 0.9997, moon) * 1.6;
nightSky += vec3(0.25, 0.3, 0.45) * pow(max(moon, 0.0), 180.0) * 0.5;
nightSky += vec3(starField(direction)) * smoothstep(0.02, 0.2, direction.y) * (1.0 - overcast);
sky += nightSky * night;
// Heavy cloud flattens the sky to a soft grey dome.
sky = mix(sky, overcastColor * (0.35 + 0.65 * smoothstep(0.0, 0.35, above)), overcast * 0.85);
gl_FragColor = vec4(sky, 1.0);`;

function atmosphere() {
	const sky = new Sky();
	sky.name = 'sky';
	sky.scale.setScalar(1500);
	sky.frustumCulled = false;
	const uniforms = sky.material.uniforms;
	uniforms.turbidity.value = 2.6;
	uniforms.rayleigh.value = 1.15;
	uniforms.mieCoefficient.value = 0.0035;
	uniforms.mieDirectionalG.value = 0.82;
	uniforms.sunPosition.value = SUN_DIRECTION.clone();
	// The analytic model targets a darker exposure than the rest of the scene.
	Object.assign(uniforms, {
		exposure: { value: 0.42 },
		overcast: { value: 0 },
		night: { value: 0 },
		overcastColor: { value: new THREE.Color('#aeb6bd') },
		nightZenith: { value: new THREE.Color('#0b1430') },
		nightHorizon: { value: new THREE.Color('#1f2d4d') },
		moonDirection: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
	});
	sky.material.fragmentShader = sky.material.fragmentShader
		.replace('void main() {', skyUniforms)
		.replace('gl_FragColor = vec4( retColor, 1.0 );', skyComposite);
	return sky;
}

const cloudVertex = /* glsl */ `
varying vec3 vDirection;
void main() {
	vDirection = position;
	vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	gl_Position = clip.xyww;
}`;

const cloudFragment = /* glsl */ `
uniform vec2 drift;
uniform vec3 sunDirection, lightColor, shadowColor;
uniform float coverage, overcast;
varying vec3 vDirection;
float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
}
float fbm(vec2 p) {
	float sum = 0.0, amplitude = 0.5;
	mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
	for (int i = 0; i < 6; i++) {
		sum += noise(p) * amplitude;
		p = turn * p;
		amplitude *= 0.5;
	}
	return sum;
}
void main() {
	vec3 direction = normalize(vDirection);
	if (direction.y <= 0.0) discard;
	// Project onto a flat cloud deck so clouds shrink and flatten towards the horizon.
	vec2 deck = direction.xz / (direction.y + 0.09) * 1.25;
	float shape = fbm(deck + drift);
	float cover = smoothstep(mix(0.6, 0.18, coverage), mix(0.8, 0.5, coverage), shape);
	float lit = fbm(deck + drift + sunDirection.xz * 0.08);
	float shade = clamp(0.78 + (shape - lit) * 3.2, 0.45, 1.0);
	shade = mix(shade, 0.62 + (shape - 0.5) * 0.5, overcast);
	vec3 color = mix(shadowColor, lightColor, shade);
	float horizon = smoothstep(0.03, 0.28, direction.y);
	gl_FragColor = vec4(color, cover * horizon * mix(0.92, 1.0, overcast));
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;

function clouds() {
	const material = new THREE.ShaderMaterial({
		name: 'CloudDeck',
		uniforms: {
			drift: { value: new THREE.Vector2() },
			sunDirection: { value: SUN_DIRECTION.clone() },
			lightColor: { value: new THREE.Color(1.25, 1.23, 1.19) },
			shadowColor: { value: new THREE.Color(0.78, 0.85, 0.95) },
			coverage: { value: 0.2 },
			overcast: { value: 0 },
		},
		vertexShader: cloudVertex,
		fragmentShader: cloudFragment,
		side: THREE.BackSide,
		transparent: true,
		depthWrite: false,
	});
	const deck = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
	deck.name = 'clouds';
	deck.scale.setScalar(1400);
	deck.frustumCulled = false;
	deck.renderOrder = -1;
	return deck;
}

const smooth = THREE.MathUtils.smoothstep;
const DAY_FOG = new THREE.Color(HAZE),
	DUSK_FOG = new THREE.Color('#d6b393'),
	NIGHT_FOG = new THREE.Color('#141c2e'),
	RAIN_FOG = new THREE.Color('#9aa4ab');
const GROUND = new THREE.Color('#4d5a36');

export interface SkyState {
	/** Unit vector towards the sun. */
	sun: THREE.Vector3;
	conditions: Readonly<Conditions>;
	/** 0 in daylight, 1 at night. */
	darkness: number;
	/** Integrated wind drift of the cloud deck. */
	windPhase: number;
}

/**
 * Physically based daylight sky with a night sky, weather-driven clouds, haze
 * and matching image-based lighting, re-baked as the light changes.
 */
export function createSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
	const sky = atmosphere(),
		deck = clouds();
	scene.add(sky, deck);
	const fog = new THREE.FogExp2(HAZE, 0.0034);
	scene.fog = fog;

	// Bake the sky, clouds and a meadow-coloured ground into a prefiltered environment.
	const environment = new THREE.Scene();
	const groundMaterial = new THREE.MeshBasicMaterial({
		color: GROUND,
		side: THREE.BackSide,
	});
	const ground = new THREE.Mesh(
		new THREE.SphereGeometry(
			10,
			32,
			16,
			0,
			Math.PI * 2,
			Math.PI / 2,
			Math.PI / 2,
		),
		groundMaterial,
	);
	const bakedSky = atmosphere();
	const bakedClouds = new THREE.Mesh(deck.geometry, deck.material);
	bakedClouds.scale.setScalar(1400);
	environment.add(bakedSky, bakedClouds, ground);
	const generator = new THREE.PMREMGenerator(renderer);
	let target: THREE.WebGLRenderTarget | undefined;
	let baked = { height: 9, overcast: -1, time: -9 };
	function bake(time: number, height: number, overcast: number) {
		for (const [name, uniform] of Object.entries(sky.material.uniforms)) {
			const copy = bakedSky.material.uniforms[name];
			const value: unknown = uniform.value;
			if (value instanceof THREE.Vector3 || value instanceof THREE.Color)
				(copy.value as THREE.Vector3 | THREE.Color).copy(value as never);
			else copy.value = value;
		}
		const previous = target;
		target = generator.fromScene(environment, 0, 0.1, 2000);
		scene.environment = target.texture;
		previous?.dispose();
		baked = { height, overcast, time };
	}
	const sunColor = new THREE.Color(),
		white = new THREE.Color(1, 1, 1),
		warm = new THREE.Color('#ffb27a'),
		greyLight = new THREE.Color(),
		greyShadow = new THREE.Color(),
		moonDirection = new THREE.Vector3();
	return {
		fog,
		update(time: number, state?: SkyState) {
			const uniforms = sky.material.uniforms,
				cloud = deck.material.uniforms;
			if (!state) {
				(cloud.drift.value as THREE.Vector2).set(time * 0.006, time * 0.0025);
				if (!target) bake(time, 1, 0);
				return;
			}
			const { sun, conditions, darkness } = state;
			const height = sun.y;
			(uniforms.sunPosition.value as THREE.Vector3).copy(sun);
			// Turbid, milky air under heavy cloud.
			uniforms.turbidity.value = 2.6 + conditions.overcast * 8;
			uniforms.rayleigh.value = 1.15 - conditions.overcast * 0.5;
			uniforms.overcast.value = conditions.overcast;
			uniforms.night.value = darkness;
			(uniforms.overcastColor.value as THREE.Color)
				.setRGB(0.68, 0.71, 0.74)
				.multiplyScalar(0.06 + 0.94 * (1 - darkness));
			moonDirection.set(-sun.x, Math.abs(sun.y) + 0.55, -sun.z).normalize();
			(uniforms.moonDirection.value as THREE.Vector3).copy(moonDirection);
			(cloud.drift.value as THREE.Vector2).set(
				state.windPhase * 0.011,
				state.windPhase * 0.0045,
			);
			(cloud.sunDirection.value as THREE.Vector3).copy(sun);
			cloud.coverage.value = conditions.cloud;
			cloud.overcast.value = conditions.overcast;
			// Clouds glow warm at sunrise and sunset and turn slate blue at night.
			const daylight = 1 - darkness;
			sunColor
				.copy(white)
				.lerp(warm, (1 - smooth(height, 0.02, 0.35)) * daylight);
			(cloud.lightColor.value as THREE.Color)
				.setRGB(1.25, 1.23, 1.19)
				.multiply(sunColor)
				.multiplyScalar(0.07 + 0.93 * daylight)
				.lerp(
					greyLight
						.setRGB(0.62, 0.65, 0.68)
						.multiplyScalar(0.1 + 0.9 * daylight),
					conditions.overcast * 0.8,
				);
			(cloud.shadowColor.value as THREE.Color)
				.setRGB(0.66, 0.72, 0.82)
				.multiplyScalar(0.06 + 0.94 * daylight)
				.lerp(
					greyShadow
						.setRGB(0.42, 0.45, 0.48)
						.multiplyScalar(0.08 + 0.92 * daylight),
					conditions.overcast * 0.8,
				);
			// Haze follows the light: blue by day, amber at dusk, deep blue at night.
			fog.color
				.copy(DAY_FOG)
				.lerp(DUSK_FOG, (1 - smooth(height, 0.02, 0.3)) * daylight * 0.8)
				.lerp(RAIN_FOG, conditions.overcast * 0.7)
				.lerp(NIGHT_FOG, darkness);
			fog.density =
				0.0034 + conditions.rain * 0.0075 + conditions.overcast * 0.0012;
			groundMaterial.color.copy(GROUND).multiplyScalar(0.08 + 0.92 * daylight);
			const due =
				!target ||
				Math.abs(height - baked.height) > 0.02 ||
				Math.abs(conditions.overcast - baked.overcast) > 0.06;
			if (due && (time - baked.time > 1.2 || !target || time < baked.time))
				bake(time, height, conditions.overcast);
		},
		/** Forces the next update to re-bake the environment lighting. */
		invalidate() {
			baked.time = -9;
			baked.height = 9;
		},
		dispose() {
			target?.dispose();
			generator.dispose();
			bakedSky.geometry.dispose();
			bakedSky.material.dispose();
			ground.geometry.dispose();
			groundMaterial.dispose();
		},
	};
}
