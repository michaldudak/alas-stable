import * as THREE from 'three';

type Volume = {
	x: number;
	y: number;
	z: number;
	rx: number;
	ry: number;
	rz: number;
	angle: number;
};
const volumes: Volume[] = [];
function ellipsoid(
	x: number,
	y: number,
	z: number,
	rx: number,
	ry: number,
	rz: number,
	angle = 0,
) {
	volumes.push({ x, y, z, rx, ry, rz, angle });
}
// Anatomy is sculpted as a smooth union, then surfaced once into a welded mesh.
ellipsoid(0, 1.84, -0.2, 0.6, 0.65, 1.02);
ellipsoid(0, 1.9, -0.82, 0.57, 0.61, 0.43);
ellipsoid(0, 1.97, 0.6, 0.5, 0.64, 0.45);
ellipsoid(0, 2.45, 0.93, 0.34, 0.81, 0.37, 0.33);
ellipsoid(0, 3.08, 1.2, 0.24, 0.38, 0.27, 0.18);
ellipsoid(0, 3.13, 1.49, 0.257, 0.26, 0.52, 0.65);
ellipsoid(0, 2.86, 1.99, 0.23, 0.18, 0.24);
for (const side of [-1, 1]) {
	ellipsoid(side * 0.195, 3.53, 1.2, 0.087, 0.28, 0.071, -0.09);
	for (const front of [false, true]) {
		const z = front ? 0.72 : -0.82;
		ellipsoid(side * 0.41, 1.62, z, front ? 0.2 : 0.245, 0.49, 0.24);
		ellipsoid(side * 0.41, 1.23, z + (front ? 0 : 0.08), 0.117, 0.38, 0.13);
		ellipsoid(side * 0.41, 0.98, z + (front ? -0.01 : 0.13), 0.105, 0.16, 0.11);
		ellipsoid(
			side * 0.41,
			0.68,
			z + (front ? -0.035 : 0.105),
			0.075,
			0.34,
			0.078,
		);
		ellipsoid(side * 0.41, 0.29, z + (front ? 0 : 0.14), 0.096, 0.2, 0.105);
	}
}
function field(x: number, y: number, z: number) {
	let distance = 100;
	for (const v of volumes) {
		const dx = x - v.x,
			dy = y - v.y,
			dz = z - v.z;
		const py = Math.cos(v.angle) * dy + Math.sin(v.angle) * dz;
		const pz = -Math.sin(v.angle) * dy + Math.cos(v.angle) * dz;
		const k0 = Math.hypot(dx / v.rx, py / v.ry, pz / v.rz);
		const k1 = Math.hypot(
			dx / (v.rx * v.rx),
			py / (v.ry * v.ry),
			pz / (v.rz * v.rz),
		);
		const d = k1 < 1e-8 ? -Math.min(v.rx, v.ry, v.rz) : (k0 * (k0 - 1)) / k1;
		const blend = 0.105;
		const h = Math.max(blend - Math.abs(distance - d), 0) / blend;
		distance = Math.min(distance, d) - h * h * blend * 0.25;
	}
	return distance;
}
const smooth = (a: number, b: number, x: number) => {
	const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};
let cached: THREE.BufferGeometry | undefined;
export function createSkinGeometry() {
	if (cached) return cached;
	const step = 0.045,
		nx = 39,
		ny = 87,
		nz = 85;
	const point = (id: number) =>
		new THREE.Vector3(
			-0.855 + (id % nx) * step,
			0.045 + (Math.floor(id / nx) % ny) * step,
			-1.44 + Math.floor(id / (nx * ny)) * step,
		);
	const values = new Float32Array(nx * ny * nz);
	for (let id = 0; id < values.length; id++) {
		const p = point(id);
		values[id] = field(p.x, p.y, p.z);
	}
	const positions: number[] = [],
		indices: number[][] = [[], [], []],
		joints: number[] = [],
		weights: number[] = [];
	const edges = new Map<string, number>();
	function vertex(a: number, b: number) {
		const key = a < b ? `${a}:${b}` : `${b}:${a}`;
		const existing = edges.get(key);
		if (existing !== undefined) return existing;
		const p = point(a).lerp(point(b), values[a] / (values[a] - values[b]));
		const index = positions.length / 3;
		positions.push(p.x, p.y, p.z);
		edges.set(key, index);
		const leg = (p.x < 0 ? 0 : 2) + (p.z > -0.05 ? 1 : 0);
		const hip =
			(1 - smooth(1.45, 2.2, p.y)) *
			smooth(0.12, 0.34, Math.abs(p.x)) *
			(1 - smooth(0.25, 0.58, Math.abs(p.z - (leg % 2 ? 0.72 : -0.82))));
		const lower = 1 - smooth(0.8, 1.16, p.y);
		joints.push(0, 1 + leg, 5 + leg, 0);
		weights.push(1 - hip, hip * (1 - lower), hip * lower, 0);
		return index;
	}
	function triangle(a: number, b: number, c: number, inside: THREE.Vector3) {
		const pa = new THREE.Vector3().fromArray(positions, a * 3),
			pb = new THREE.Vector3().fromArray(positions, b * 3),
			pc = new THREE.Vector3().fromArray(positions, c * 3);
		const normal = pb.clone().sub(pa).cross(pc.clone().sub(pa));
		if (normal.dot(inside.clone().sub(pa)) > 0) [b, c] = [c, b];
		const center = pa
			.add(pb)
			.add(pc)
			.multiplyScalar(1 / 3);
		const channel =
			center.y < 0.49 ? 1 : center.z > 1.96 && center.y < 3.03 ? 2 : 0;
		indices[channel].push(a, b, c);
	}
	const tetrahedra = [
		[0, 5, 1, 6],
		[0, 1, 2, 6],
		[0, 2, 3, 6],
		[0, 3, 7, 6],
		[0, 7, 4, 6],
		[0, 4, 5, 6],
	];
	for (let z = 0; z < nz - 1; z++)
		for (let y = 0; y < ny - 1; y++)
			for (let x = 0; x < nx - 1; x++) {
				const n = x + y * nx + z * nx * ny;
				const cube = [
					n,
					n + 1,
					n + 1 + nx,
					n + nx,
					n + nx * ny,
					n + 1 + nx * ny,
					n + 1 + nx + nx * ny,
					n + nx + nx * ny,
				];
				if (
					cube.every((i) => values[i] >= 0) ||
					cube.every((i) => values[i] < 0)
				)
					continue;
				for (const tet of tetrahedra) {
					const ids = tet.map((i) => cube[i]),
						inside = ids.filter((i) => values[i] < 0),
						outside = ids.filter((i) => values[i] >= 0);
					if (!inside.length || !outside.length) continue;
					const center = inside
						.reduce((sum, i) => sum.add(point(i)), new THREE.Vector3())
						.multiplyScalar(1 / inside.length);
					if (inside.length === 1) {
						triangle(
							vertex(inside[0], outside[0]),
							vertex(inside[0], outside[1]),
							vertex(inside[0], outside[2]),
							center,
						);
					} else if (outside.length === 1) {
						triangle(
							vertex(outside[0], inside[0]),
							vertex(outside[0], inside[1]),
							vertex(outside[0], inside[2]),
							center,
						);
					} else {
						const a = vertex(inside[0], outside[0]),
							b = vertex(inside[0], outside[1]),
							c = vertex(inside[1], outside[1]),
							d = vertex(inside[1], outside[0]);
						triangle(a, b, c, center);
						triangle(a, c, d, center);
					}
				}
			}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.setAttribute(
		'skinIndex',
		new THREE.Uint16BufferAttribute(joints, 4),
	);
	geometry.setAttribute(
		'skinWeight',
		new THREE.Float32BufferAttribute(weights, 4),
	);
	geometry.setIndex(indices.flat());
	let start = 0;
	indices.forEach((group, i) => {
		geometry.addGroup(start, group.length, i);
		start += group.length;
	});
	// Analytic surface gradients avoid shading seams from irregular tetrahedra.
	const normals: number[] = [];
	for (let i = 0; i < positions.length; i += 3) {
		const x = positions[i],
			y = positions[i + 1],
			z = positions[i + 2],
			e = 0.002;
		const normal = new THREE.Vector3(
			field(x + e, y, z) - field(x - e, y, z),
			field(x, y + e, z) - field(x, y - e, z),
			field(x, y, z + e) - field(x, y, z - e),
		).normalize();
		normals.push(normal.x, normal.y, normal.z);
	}
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.addEventListener('dispose', () => {
		if (cached === geometry) cached = undefined;
	});
	cached = geometry;
	return geometry;
}
export function attachSkin(
	body: THREE.Group,
	legs: THREE.Bone[],
	knees: THREE.Bone[],
	materials: THREE.Material[],
) {
	const root = new THREE.Bone();
	root.name = 'skin-root';
	body.add(root);
	for (const leg of legs) root.add(leg);
	const skin = new THREE.SkinnedMesh(createSkinGeometry(), materials);
	skin.name = 'horse-skin';
	body.add(skin);
	body.updateWorldMatrix(true, true);
	skin.bind(new THREE.Skeleton([root, ...legs, ...knees]));
	skin.castShadow = true;
	skin.receiveShadow = true;
	// Animated bounds vary during jumping; this small hero mesh should never be culled by its bind pose.
	skin.frustumCulled = false;
	return skin;
}
