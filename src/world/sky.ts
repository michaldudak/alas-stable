import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SUN_DIRECTION } from './sun.ts';

/** Horizon haze shared by the fog, so distant hills dissolve into the sky. */
export const HAZE = '#bccfdc';

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
	uniforms.exposure = { value: 0.42 };
	sky.material.fragmentShader = sky.material.fragmentShader
		.replace('void main() {', 'uniform float exposure;\nvoid main() {')
		.replace(
			'gl_FragColor = vec4( retColor, 1.0 );',
			'gl_FragColor = vec4( retColor * exposure, 1.0 );',
		);
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
uniform float time;
uniform vec3 sunDirection;
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
	vec2 drift = vec2(time * 0.006, time * 0.0025);
	float shape = fbm(deck + drift);
	float cover = smoothstep(0.5, 0.74, shape);
	float lit = fbm(deck + drift + sunDirection.xz * 0.08);
	float shade = clamp(0.78 + (shape - lit) * 3.2, 0.45, 1.0);
	vec3 color = mix(vec3(0.62, 0.68, 0.76), vec3(1.0, 0.985, 0.95), shade);
	float horizon = smoothstep(0.03, 0.28, direction.y);
	gl_FragColor = vec4(color * 1.25, cover * horizon * 0.92);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;

function clouds() {
	const material = new THREE.ShaderMaterial({
		name: 'CloudDeck',
		uniforms: {
			time: { value: 0 },
			sunDirection: { value: SUN_DIRECTION.clone() },
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

/** Physically based daylight sky, horizon haze and matching image-based lighting. */
export function createSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
	const sky = atmosphere(),
		deck = clouds();
	scene.add(sky, deck);
	scene.fog = new THREE.FogExp2(HAZE, 0.0042);

	// Bake the sky and a meadow-coloured ground into a prefiltered environment.
	const environment = new THREE.Scene();
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
		new THREE.MeshBasicMaterial({ color: '#4d5a36', side: THREE.BackSide }),
	);
	const bakedSky = atmosphere();
	environment.add(bakedSky, ground);
	const generator = new THREE.PMREMGenerator(renderer);
	const target = generator.fromScene(environment, 0, 0.1, 2000);
	generator.dispose();
	for (const mesh of [bakedSky, ground]) {
		mesh.geometry.dispose();
		mesh.material.dispose();
	}
	scene.environment = target.texture;
	scene.environmentIntensity = 0.75;
	return {
		update(time: number) {
			deck.material.uniforms.time.value = time;
		},
		dispose() {
			target.dispose();
		},
	};
}
