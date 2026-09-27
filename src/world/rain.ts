import * as THREE from 'three';
import { random } from './noise.ts';
import { STABLES, STABLE_HALF_WIDTH, halfDepth } from './stable-layout.ts';

const DROPS = 9000;
const SIZE = 46;
const HEIGHT = 22;

const rainVertex = /* glsl */ `
attribute vec3 seed;
attribute float end;
uniform float time, intensity, slant;
uniform vec3 center;
uniform vec4 shelters[${STABLES.length}];
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
	for (int i = 0; i < ${STABLES.length}; i++) {
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
				value: STABLES.map(
					(spec) =>
						new THREE.Vector4(
							spec.x,
							spec.z,
							STABLE_HALF_WIDTH + 0.8,
							halfDepth(spec) + 0.8,
						),
				),
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
