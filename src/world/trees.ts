import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, random } from './noise.ts';
import { proceduralTexture, rgb } from './textures.ts';

export type TreeKind = 'broadleaf' | 'conifer';
export type TreeSpec = {
	x: number;
	y?: number;
	z: number;
	/** Overall height in metres. */
	height: number;
	kind: TreeKind;
	/** Selects one of the pre-built shapes of this kind. */
	variant: number;
	/** 0–1 foliage colour variation. */
	tint: number;
	rotation: number;
	castShadow?: boolean;
};

const BROADLEAF_HEIGHT = 10;
const CONIFER_HEIGHT = 12;
export const TREE_VARIANTS = 3;

type Rgba = Uint8Array;
function canvas(width: number, height: number) {
	return new Uint8Array(width * height * 4);
}
function dataTexture(data: Rgba, width: number, height: number) {
	const texture = new THREE.DataTexture(data, width, height);
	texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 4;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	return texture;
}
function paint(
	data: Rgba,
	width: number,
	x: number,
	y: number,
	color: readonly number[],
) {
	const offset = (y * width + x) * 4;
	data[offset] = color[0] * 255;
	data[offset + 1] = color[1] * 255;
	data[offset + 2] = color[2] * 255;
	data[offset + 3] = 255;
}

/** A round spray of overlapping leaves with transparent gaps between them. */
function leafTexture() {
	const size = 256,
		data = canvas(size, size),
		next = random(313);
	const dark = rgb('#3f5a25'),
		light = rgb('#7f9a45');
	for (let leaf = 0; leaf < 150; leaf++) {
		const angle = next() * Math.PI * 2,
			distance = Math.sqrt(next()) * 0.4;
		const cx = 0.5 + Math.cos(angle) * distance,
			cy = 0.5 + Math.sin(angle) * distance;
		const heading = next() * Math.PI * 2,
			length = 0.045 + next() * 0.035,
			width = length * (0.45 + next() * 0.15);
		const shade = next(),
			cos = Math.cos(heading),
			sin = Math.sin(heading);
		const base = dark.map((c, i) => c + (light[i] - c) * shade);
		const reach = Math.ceil(length * size) + 1;
		const px = Math.round(cx * size),
			py = Math.round(cy * size);
		for (let y = py - reach; y <= py + reach; y++)
			for (let x = px - reach; x <= px + reach; x++) {
				if (x < 0 || y < 0 || x >= size || y >= size) continue;
				const dx = x / size - cx,
					dy = y / size - cy;
				const along = (dx * cos + dy * sin) / length,
					across = (-dx * sin + dy * cos) / width;
				// Pointed leaf outline with a slightly darker midrib.
				const outline = 1 - along * along;
				if (
					outline <= 0 ||
					Math.abs(across) > outline * (0.6 + 0.4 * (1 - Math.abs(along)))
				)
					continue;
				const rib = Math.abs(across) < 0.1 ? 0.85 : 1;
				const lit = (0.85 + 0.25 * (across + 1) * 0.5) * rib;
				paint(
					data,
					size,
					x,
					y,
					base.map((c) => c * lit),
				);
			}
	}
	return dataTexture(data, size, size);
}

/** A flat spruce bough: twig along +U with needle-covered side shoots. */
function needleTexture() {
	const width = 256,
		height = 128,
		data = canvas(width, height),
		next = random(719);
	const dark = rgb('#253d24'),
		light = rgb('#4f6a3a');
	const shoots: [number, number, number, number][] = [[0.02, 0.5, 0.97, 0.5]];
	for (let u = 0.08; u < 0.9; u += 0.055)
		for (const side of [-1, 1]) {
			const length = (0.95 - u) * 0.42 + 0.05;
			shoots.push([u, 0.5, u + length * 0.75, 0.5 + side * length * 1.4]);
		}
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const u = x / width,
				v = y / height;
			let nearest = 9,
				along = 0;
			for (const [ax, ay, bx, by] of shoots) {
				const abx = bx - ax,
					aby = (by - ay) * 0.5;
				const t = THREE.MathUtils.clamp(
					((u - ax) * abx + (v - ay) * 0.5 * aby) / (abx * abx + aby * aby),
					0,
					1,
				);
				const d = Math.hypot(u - ax - abx * t, (v - ay) * 0.5 - aby * t);
				if (d < nearest) {
					nearest = d;
					along = t;
				}
			}
			const reach = 0.042 * (1 - u * 0.45) * (1 - along * 0.35);
			const needles = fbm(u, v, 64, 2, 9);
			if (nearest > reach * (0.75 + needles * 0.5)) continue;
			const shade = 0.35 + 0.65 * (1 - nearest / reach) * (0.6 + next() * 0.4);
			const color = dark.map((c, i) => c + (light[i] - c) * shade);
			paint(data, width, x, y, color);
		}
	return dataTexture(data, width, height);
}

function barkTexture() {
	const texture = proceduralTexture(128, (u, v) => {
		const furrows = fbm(u, v * 0.25, 12, 3, 41);
		const grain = fbm(u, v, 48, 2, 42);
		const shade = 0.55 + furrows * 0.5 + grain * 0.15;
		return [0.36 * shade, 0.3 * shade, 0.25 * shade];
	});
	return texture;
}

type Parts = { wood: THREE.BufferGeometry[]; foliage: THREE.BufferGeometry[] };

/** Tapered cylinder between two points, with UVs wrapping the bark texture. */
function limb(
	parts: Parts,
	from: THREE.Vector3,
	to: THREE.Vector3,
	radius: number,
	tipRadius: number,
) {
	const length = from.distanceTo(to);
	const geometry = new THREE.CylinderGeometry(
		tipRadius,
		radius,
		length,
		8,
		3,
		true,
	);
	geometry.translate(0, length / 2, 0);
	const uv = geometry.getAttribute('uv');
	for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * length) / 2);
	geometry.applyQuaternion(
		new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			to.clone().sub(from).normalize(),
		),
	);
	geometry.translate(from.x, from.y, from.z);
	parts.wood.push(geometry);
}

/**
 * A foliage card along +X in its own frame. `normal` describes the crown volume
 * and `shade` darkens sprays hidden deep inside it.
 */
function card(
	parts: Parts,
	matrix: THREE.Matrix4,
	width: number,
	length: number,
	normal: (point: THREE.Vector3) => THREE.Vector3,
	shade: (point: THREE.Vector3, t: number) => number,
	droop = 0,
	segments = 1,
) {
	const positions: number[] = [],
		colors: number[] = [],
		normals: number[] = [],
		uvs: number[] = [],
		indices: number[] = [];
	const point = new THREE.Vector3();
	for (let s = 0; s <= segments; s++) {
		const t = s / segments;
		for (const side of [-1, 1]) {
			point
				.set(
					t * length,
					-droop * t * t * length,
					(side * width * (1 - t * 0.3)) / 2,
				)
				.applyMatrix4(matrix);
			positions.push(point.x, point.y, point.z);
			const n = normal(point);
			normals.push(n.x, n.y, n.z);
			const light = shade(point, t);
			colors.push(light, light, light);
			uvs.push(t, side < 0 ? 0 : 1);
		}
		if (s) {
			const a = s * 2 - 2;
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	parts.foliage.push(geometry);
}

/** `lite` shapes use fewer, larger sprays for trees seen only from afar. */
function broadleaf(seed: number, lite: boolean) {
	const next = random(seed),
		parts: Parts = { wood: [], foliage: [] },
		h = BROADLEAF_HEIGHT;
	const trunkTop = new THREE.Vector3(
		(next() - 0.5) * 0.5,
		h * 0.42,
		(next() - 0.5) * 0.5,
	);
	limb(parts, new THREE.Vector3(0, -0.2, 0), trunkTop, 0.36, 0.22);
	const crown = new THREE.Vector3(trunkTop.x, h * 0.66, trunkTop.z);
	const radii = new THREE.Vector3(
		h * (0.3 + next() * 0.06),
		h * 0.27,
		h * (0.3 + next() * 0.06),
	);
	const branches = 5 + Math.floor(next() * 2);
	for (let i = 0; i < branches; i++) {
		const angle = (i / branches) * Math.PI * 2 + next() * 0.6,
			rise = 0.55 + next() * 0.5;
		const start = trunkTop.clone().setY(h * (0.36 + next() * 0.08));
		const end = start
			.clone()
			.add(
				new THREE.Vector3(
					Math.cos(angle) * radii.x * 0.75,
					radii.y * rise * 1.3,
					Math.sin(angle) * radii.z * 0.75,
				),
			);
		limb(parts, start, end, 0.13, 0.04);
	}
	limb(parts, trunkTop, crown.clone().setY(h * 0.85), 0.2, 0.05);
	// Leaf sprays gather near the crown surface, each lit as part of a rounded mass.
	const matrix = new THREE.Matrix4(),
		euler = new THREE.Euler(),
		scale = new THREE.Vector3();
	const outward = (point: THREE.Vector3) =>
		point
			.clone()
			.sub(crown)
			.divide(radii)
			.normalize()
			.lerp(new THREE.Vector3(0, 1, 0), 0.2)
			.normalize();
	// Sprays inside and under the crown receive little skylight.
	const hidden = (point: THREE.Vector3) => {
		const depth = point.clone().sub(crown).divide(radii);
		return THREE.MathUtils.clamp(
			0.35 + depth.length() * 0.55 + depth.y * 0.2,
			0.3,
			1.05,
		);
	};
	const sprays = lite ? 80 : 190;
	for (let i = 0; i < sprays; i++) {
		const direction = new THREE.Vector3(
			next() * 2 - 1,
			next() * 2 - 1,
			next() * 2 - 1,
		);
		if (direction.lengthSq() > 1 || direction.lengthSq() < 0.01) {
			i--;
			continue;
		}
		direction.normalize();
		const depth = 0.62 + Math.cbrt(next()) * 0.38;
		const center = crown
			.clone()
			.add(direction.multiply(radii).multiplyScalar(depth));
		if (center.y < h * 0.46) center.y = h * 0.46 + next();
		const size = h * (0.13 + next() * 0.06) * (lite ? 1.4 : 1);
		euler.set(next() * Math.PI, next() * Math.PI * 2, next() * Math.PI);
		matrix.compose(
			center,
			new THREE.Quaternion().setFromEuler(euler),
			scale.set(1, 1, 1),
		);
		matrix.multiply(new THREE.Matrix4().makeTranslation(-size / 2, 0, 0));
		card(parts, matrix, size, size, outward, hidden);
	}
	return parts;
}

function conifer(seed: number, lite: boolean) {
	const next = random(seed),
		parts: Parts = { wood: [], foliage: [] },
		h = CONIFER_HEIGHT;
	limb(
		parts,
		new THREE.Vector3(0, -0.2, 0),
		new THREE.Vector3(0, h, 0),
		0.3,
		0.03,
	);
	const matrix = new THREE.Matrix4(),
		quaternion = new THREE.Quaternion(),
		one = new THREE.Vector3(1, 1, 1);
	const tiers = lite ? 12 : 20,
		bottom = h * 0.1,
		maxReach = h * (0.25 + next() * 0.04);
	for (let tier = 0; tier < tiers; tier++) {
		const t = tier / (tiers - 1),
			y = bottom + (h * 0.97 - bottom) * t + (next() - 0.5) * 0.2;
		const reach = maxReach * (1 - t) ** 0.95 + 0.35,
			count = (lite ? 5 : 7) + Math.floor(next() * 3),
			offset = next() * Math.PI * 2;
		for (let i = 0; i < count; i++) {
			const angle = offset + (i / count) * Math.PI * 2 + (next() - 0.5) * 0.4;
			// Upper boughs reach upwards; the lower ones sag under their own weight.
			const pitch =
				THREE.MathUtils.lerp(-0.18, 0.35, t) + (next() - 0.5) * 0.15;
			quaternion.setFromEuler(new THREE.Euler(0, -angle, pitch, 'YXZ'));
			const base = new THREE.Vector3(0, y, 0);
			matrix.compose(base, quaternion, one);
			const width = Math.min(1.8, 0.6 + reach * 0.5);
			const normal = (point: THREE.Vector3) =>
				new THREE.Vector3(point.x, 0, point.z)
					.normalize()
					.multiplyScalar(0.8)
					.add(new THREE.Vector3(0, 1, 0))
					.normalize();
			// Needles near the trunk and low in the tree sit in deep shade.
			const shade = (_: THREE.Vector3, along: number) =>
				(0.4 + along * 0.55) * (0.75 + t * 0.3);
			const length = reach * (1 + next() * 0.15);
			// A flat bough plus a rolled copy gives each branch some thickness.
			for (const roll of [0, (next() < 0.5 ? -1 : 1) * 0.9]) {
				const rolled = matrix
					.clone()
					.multiply(new THREE.Matrix4().makeRotationX(roll));
				card(
					parts,
					rolled,
					width * (roll ? 0.75 : 1),
					length,
					normal,
					shade,
					0.22 * (1 - t),
					lite ? 1 : 3,
				);
			}
		}
	}
	// Leader shoot at the very top.
	for (const turn of [0, Math.PI / 2]) {
		quaternion.setFromEuler(new THREE.Euler(0, turn, Math.PI / 2, 'YXZ'));
		matrix.compose(new THREE.Vector3(0, h * 0.9, 0), quaternion, one);
		card(
			parts,
			matrix,
			0.5,
			h * 0.14,
			() => new THREE.Vector3(0, 1, 0),
			() => 1,
		);
	}
	return parts;
}

const windVertex = /* glsl */ `
uniform float time;`;

const windTransform = /* glsl */ `
#include <begin_vertex>
#ifdef USE_INSTANCING
	vec2 treeOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
	vec2 treeOrigin = vec2(0.0);
#endif
float treeSway = sin(time * 0.9 + treeOrigin.x * 0.11 + treeOrigin.y * 0.07) * 0.6 +
	sin(time * 1.7 + treeOrigin.y * 0.23) * 0.25;
float lift = max(position.y - 2.0, 0.0);
transformed.x += treeSway * lift * lift * 0.0022;
transformed.z += treeSway * lift * lift * 0.0012;
// Individual sprays flutter faster than the whole crown sways.
transformed += 0.04 * sin(time * 3.1 + dot(position, vec3(2.1, 1.3, 1.7)) + treeOrigin.x) * min(lift, 1.0);`;

function foliageMaterial(map: THREE.Texture, time: { value: number }) {
	const material = new THREE.MeshStandardMaterial({
		map,
		alphaTest: 0.45,
		alphaToCoverage: true,
		side: THREE.DoubleSide,
		vertexColors: true,
		roughness: 0.9,
	});
	material.onBeforeCompile = (shader) => {
		shader.uniforms.time = time;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${windVertex}`)
			.replace('#include <begin_vertex>', windTransform);
		// Foliage normals describe the crown volume, so both card faces share them.
		shader.fragmentShader = shader.fragmentShader.replace(
			'gl_FrontFacing ? 1.0 : - 1.0',
			'1.0',
		);
	};
	return material;
}

/** Instanced trees: a handful of procedural shapes, each drawn in two calls. */
export function createForest(specs: readonly TreeSpec[]) {
	const time = { value: 0 };
	const bark = new THREE.MeshStandardMaterial({
		map: barkTexture(),
		roughness: 0.95,
	});
	bark.map!.repeat.set(2, 0.5);
	const leaves = foliageMaterial(leafTexture(), time),
		needles = foliageMaterial(needleTexture(), time);
	const group = new THREE.Group();
	group.name = 'forest';
	const matrix = new THREE.Matrix4(),
		quaternion = new THREE.Quaternion(),
		scale = new THREE.Vector3(),
		position = new THREE.Vector3(),
		color = new THREE.Color();
	const shapes = new Map<
		string,
		[THREE.BufferGeometry, THREE.BufferGeometry]
	>();
	function shape(kind: TreeKind, variant: number, lite: boolean) {
		const key = `${kind}:${variant}:${lite}`;
		if (!shapes.has(key)) {
			const parts =
				kind === 'broadleaf'
					? broadleaf(101 + variant * 17, lite)
					: conifer(203 + variant * 29, lite);
			shapes.set(key, [
				mergeGeometries(parts.wood),
				mergeGeometries(parts.foliage),
			]);
			for (const geometry of [...parts.wood, ...parts.foliage])
				geometry.dispose();
		}
		return shapes.get(key)!;
	}
	for (const kind of ['broadleaf', 'conifer'] as const)
		for (let variant = 0; variant < TREE_VARIANTS; variant++)
			for (const castShadow of [true, false]) {
				const chosen = specs.filter(
					(spec) =>
						spec.kind === kind &&
						spec.variant % TREE_VARIANTS === variant &&
						(spec.castShadow ?? true) === castShadow,
				);
				if (!chosen.length) continue;
				const nominal =
					kind === 'broadleaf' ? BROADLEAF_HEIGHT : CONIFER_HEIGHT;
				// Backdrop trees cast no shadows and are only seen from a distance.
				const [wood, foliage] = shape(kind, variant, !castShadow);
				const meshes = [
					new THREE.InstancedMesh(wood, bark, chosen.length),
					new THREE.InstancedMesh(
						foliage,
						kind === 'broadleaf' ? leaves : needles,
						chosen.length,
					),
				];
				chosen.forEach((spec, i) => {
					const size = spec.height / nominal;
					position.set(spec.x, spec.y ?? 0, spec.z);
					quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, spec.rotation);
					matrix.compose(position, quaternion, scale.set(size, size, size));
					const warm = kind === 'broadleaf' ? 0.18 : 0.08;
					color.setRGB(
						0.88 + spec.tint * warm * 1.6,
						0.92 + spec.tint * warm * 0.6,
						0.9 - spec.tint * warm,
					);
					for (const mesh of meshes) {
						mesh.setMatrixAt(i, matrix);
						if (mesh.material !== bark) mesh.setColorAt(i, color);
					}
				});
				for (const mesh of meshes) {
					mesh.castShadow = castShadow;
					mesh.receiveShadow = true;
					mesh.computeBoundingSphere();
					group.add(mesh);
				}
			}
	return {
		group,
		update(elapsed: number) {
			time.value = elapsed;
		},
	};
}
