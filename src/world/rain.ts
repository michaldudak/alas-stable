import * as THREE from 'three';
import { random } from './noise.ts';
import { STABLES, STABLE_HALF_WIDTH, halfDepth } from './stable-layout.ts';
import { CLUBHOUSE } from './layout.ts';

/** Roofs that keep the rain off: the stables and the clubhouse. */
const SHELTERS: [number, number, number, number][] = [
	...STABLES.map((spec): [number, number, number, number] => [
		spec.x,
		spec.z,
		STABLE_HALF_WIDTH + 0.8,
		halfDepth(spec) + 0.8,
	]),
	[
		CLUBHOUSE.x,
		CLUBHOUSE.z,
		CLUBHOUSE.halfWidth + 0.4,
		CLUBHOUSE.halfDepth + 0.5,
	],
];

const DROPS = 9000;
const SIZE = 46;
const HEIGHT = 22;

const rainVertex = /* glsl */ `
attribute vec3 seed;
attribute float end;
uniform float time, intensity, slant;
uniform vec3 center;
uniform vec4 shelters[${SHELTERS.length}];
varying float vAlpha;
void main() {
	// Drops fill a box that wraps around the camera, so rain never runs out.
	vec2 xz = mod(seed.xy * ${SIZE.toFixed(1)} - center.xz, ${SIZE.toFixed(1)}) + center.xz - ${(SIZE / 2).toFixed(1)};
	float fall = mod(seed.z * ${HEIGHT.toFixed(1)} - time * 17.0, ${HEIGHT.toFixed(1)});
	vec3 p = vec3(xz.x, fall - 1.0, xz.y);
	vec2 wind = vec2(0.8, 0.35) * slant;
	p.xz += wind * fall * 0.35;
	p += vec3(wind.x * 0.25, 0.75, wind.y * 0.25) * end;
	float shown = step(fract(seed.x * 91.7 + seed.y * 13.3), intensity);
	for (int i = 0; i < ${SHELTERS.length}; i++) {
		vec4 roof = shelters[i];
		if (abs(p.x - roof.x) < roof.z && abs(p.z - roof.y) < roof.w) shown = 0.0;
	}
	vAlpha = shown * (1.0 - smoothstep(0.55, 1.0, distance(p.xz, center.xz) / ${(SIZE / 2).toFixed(1)}));
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const rainFragment = /* glsl */ `
uniform vec3 color;
varying float vAlpha;
void main() {
	if (vAlpha <= 0.0) discard;
	gl_FragColor = vec4(color, vAlpha * 0.42);
}`;

/** Streaks of rain around the camera; nothing falls inside the stables. */
export function createRain(scene: THREE.Scene) {
	const next = random(4711);
	const seeds = new Float32Array(DROPS * 6),
		ends = new Float32Array(DROPS * 2),
		positions = new Float32Array(DROPS * 6);
	for (let i = 0; i < DROPS; i++) {
		const seed = [next(), next(), next()];
		seeds.set([...seed, ...seed], i * 6);
		ends.set([0, 1], i * 2);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
	geometry.setAttribute('end', new THREE.BufferAttribute(ends, 1));
	const material = new THREE.ShaderMaterial({
		name: 'Rain',
		uniforms: {
			time: { value: 0 },
			intensity: { value: 0 },
			slant: { value: 0 },
			center: { value: new THREE.Vector3() },
			color: { value: new THREE.Color('#c9d3dc') },
			shelters: {
				value: SHELTERS.map((shelter) => new THREE.Vector4(...shelter)),
			},
		},
		vertexShader: rainVertex,
		fragmentShader: rainFragment,
		transparent: true,
		depthWrite: false,
	});
	const rain = new THREE.LineSegments(geometry, material);
	rain.name = 'rain';
	rain.frustumCulled = false;
	rain.visible = false;
	scene.add(rain);
	return {
		update(
			time: number,
			camera: THREE.Camera,
			intensity: number,
			wind: number,
			daylight: number,
		) {
			rain.visible = intensity > 0.02;
			const uniforms = material.uniforms;
			uniforms.time.value = time;
			uniforms.intensity.value = intensity;
			uniforms.slant.value = 0.4 + wind;
			(uniforms.center.value as THREE.Vector3).copy(camera.position);
			(uniforms.color.value as THREE.Color)
				.setRGB(0.79, 0.83, 0.86)
				.multiplyScalar(0.25 + 0.75 * daylight);
		},
	};
}

const FLAKES = 6000;
const SNOW_SIZE = 40;
const SNOW_HEIGHT = 18;

const snowVertex = /* glsl */ `
attribute vec3 seed;
uniform float time, intensity, drift, scale;
uniform vec3 center;
varying float vAlpha;
void main() {
	// Flakes tumble through a box that wraps around the camera.
	float fall = mod(seed.z * ${SNOW_HEIGHT.toFixed(1)} - time * (0.9 + seed.x * 0.5), ${SNOW_HEIGHT.toFixed(1)});
	vec2 sway = vec2(sin(time * 0.9 + seed.y * 31.0), cos(time * 0.7 + seed.x * 17.0)) * 0.6;
	vec2 blown = vec2(0.8, 0.35) * drift * (${SNOW_HEIGHT.toFixed(1)} - fall) * 0.4;
	vec2 xz = mod(seed.xy * ${SNOW_SIZE.toFixed(1)} + sway + blown - center.xz, ${SNOW_SIZE.toFixed(1)}) + center.xz - ${(SNOW_SIZE / 2).toFixed(1)};
	vec3 p = vec3(xz.x, center.y + fall - 6.0, xz.y);
	float shown = step(fract(seed.x * 57.3 + seed.y * 11.9), intensity);
	vAlpha = shown * (1.0 - smoothstep(0.6, 1.0, distance(p.xz, center.xz) / ${(SNOW_SIZE / 2).toFixed(1)}));
	vec4 view = viewMatrix * vec4(p, 1.0);
	gl_Position = projectionMatrix * view;
	gl_PointSize = min(9.0, scale * (0.035 + seed.z * 0.03) / -view.z);
}`;

const snowFragment = /* glsl */ `
uniform vec3 color;
varying float vAlpha;
void main() {
	float d = length(gl_PointCoord - 0.5) * 2.0;
	if (vAlpha <= 0.0 || d > 1.0) discard;
	gl_FragColor = vec4(color, vAlpha * (1.0 - d * d) * 0.9);
}`;

/** Snowflakes drifting down around the camera, for the mountains. */
export function createSnow(scene: THREE.Scene) {
	const next = random(1717);
	const seeds = new Float32Array(FLAKES * 3);
	for (let i = 0; i < FLAKES * 3; i++) seeds[i] = next();
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.BufferAttribute(new Float32Array(FLAKES * 3), 3),
	);
	geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
	const material = new THREE.ShaderMaterial({
		name: 'Snow',
		uniforms: {
			time: { value: 0 },
			intensity: { value: 0 },
			drift: { value: 0 },
			scale: { value: 800 },
			center: { value: new THREE.Vector3() },
			color: { value: new THREE.Color('#ffffff') },
		},
		vertexShader: snowVertex,
		fragmentShader: snowFragment,
		transparent: true,
		depthWrite: false,
	});
	const snow = new THREE.Points(geometry, material);
	snow.name = 'snow';
	snow.frustumCulled = false;
	snow.visible = false;
	scene.add(snow);
	return {
		update(
			time: number,
			camera: THREE.Camera,
			intensity: number,
			wind: number,
			daylight: number,
			viewportHeight: number,
		) {
			snow.visible = intensity > 0.02;
			const uniforms = material.uniforms;
			uniforms.time.value = time;
			uniforms.intensity.value = intensity;
			uniforms.drift.value = 0.2 + wind;
			uniforms.scale.value = viewportHeight * 1.2;
			(uniforms.center.value as THREE.Vector3).copy(camera.position);
			(uniforms.color.value as THREE.Color)
				.setRGB(1, 1, 1)
				.multiplyScalar(0.3 + 0.7 * daylight);
		},
	};
}
