import * as THREE from 'three';
import { horseAsset } from './asset.ts';
import { CROUP_PIVOT, NECK_PIVOTS, neckWeights } from './neck.ts';

/** The sculpted body from `src/assets/horse.glb`, shared by every horse. */
export function createSkinGeometry() {
	return horseAsset().geometry;
}

const skinVertex = /* glsl */ `
attribute float ao;
attribute vec3 mask;
varying float vOcclusion;
varying vec3 vMask;
varying vec4 vCoat;`;

const skinFragment = /* glsl */ `
uniform vec3 sockColor, pointColor, hoofColor;
varying float vOcclusion;
varying vec3 vMask;
varying vec4 vCoat;`;

/**
 * Coat shading for the body: white socks, darker muzzle and eye rims and hoof
 * horn blend softly from masks painted in Blender, over baked occlusion.
 */
export function skinMaterial(
	coat: THREE.MeshPhysicalMaterial,
	socks: THREE.MeshStandardMaterial,
	points: THREE.MeshStandardMaterial,
	hoof: THREE.MeshStandardMaterial,
) {
	const material = coat.clone();
	material.name = 'horse-skin';
	// Share the coat colour object so appearance changes apply immediately.
	material.color = coat.color;
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, {
			sockColor: { value: socks.color },
			pointColor: { value: points.color },
			hoofColor: { value: hoof.color },
		});
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${skinVertex}`)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nvOcclusion = ao;\nvMask = mask;\nvCoat = vec4(position, normal.y);',
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${skinFragment}`)
			.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
// A living coat is never one flat colour: paler under the belly and inside
// the legs, with soft mottling over the body.
float mottle = sin(vCoat.x * 9.0 + sin(vCoat.z * 7.0) * 1.7) * sin(vCoat.y * 8.0 + vCoat.z * 5.0)
	+ 0.5 * sin(vCoat.z * 23.0 + vCoat.y * 17.0) * sin(vCoat.x * 29.0 - vCoat.y * 13.0);
diffuseColor.rgb *= 1.0 + 0.035 * mottle;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18 + 0.03, 0.5 * smoothstep(-0.25, -0.95, vCoat.w));
diffuseColor.rgb = mix(diffuseColor.rgb, sockColor, vMask.x);
diffuseColor.rgb = mix(diffuseColor.rgb, pointColor, vMask.y * 0.85);
diffuseColor.rgb = mix(diffuseColor.rgb, hoofColor, vMask.z);
diffuseColor.rgb *= vOcclusion;`,
			)
			.replace(
				'#include <roughnessmap_fragment>',
				'#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, vMask.z);',
			)
			.replace(
				'#include <aomap_fragment>',
				'#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vOcclusion;',
			);
	};
	return material;
}

/**
 * Binds the shared body to this horse's bones: body root, then legs, knees and
 * fetlocks in LH, LF, RH, RF order, then the neck chain ending at the head,
 * then the croup, which carries the hind legs.
 */
export function attachSkin(
	body: THREE.Group,
	legs: THREE.Bone[],
	knees: THREE.Bone[],
	fetlocks: THREE.Bone[],
	material: THREE.Material,
) {
	const root = new THREE.Bone();
	root.name = 'skin-root';
	body.add(root);
	for (const leg of legs) root.add(leg);
	const neck: THREE.Bone[] = [];
	let parent: THREE.Object3D = root,
		previous: readonly [number, number] = [0, 0];
	for (const pivot of NECK_PIVOTS) {
		const bone = new THREE.Bone();
		bone.name = neck.length === 2 ? 'head' : 'neck';
		bone.position.set(0, pivot[0] - previous[0], pivot[1] - previous[1]);
		parent.add(bone);
		neck.push(bone);
		parent = bone;
		previous = pivot;
	}
	// The hindquarters roll and tilt at the loins; the hind legs hang from them.
	const croup = new THREE.Bone();
	croup.name = 'croup';
	croup.position.set(0, CROUP_PIVOT[0], CROUP_PIVOT[1]);
	root.add(croup);
	for (const leg of [legs[0], legs[2]]) {
		croup.add(leg);
		leg.position.sub(croup.position);
	}
	const skin = new THREE.SkinnedMesh(createSkinGeometry(), material);
	skin.name = 'horse-skin';
	body.add(skin);
	body.updateWorldMatrix(true, true);
	const skeleton = new THREE.Skeleton([
		root,
		...legs,
		...knees,
		...fetlocks,
		...neck,
		croup,
	]);
	skin.bind(skeleton);
	skin.castShadow = true;
	skin.receiveShadow = true;
	// Animated bounds vary during jumping; this hero mesh should never be culled by its bind pose.
	skin.frustumCulled = false;
	return { skin, neck, croup, skeleton };
}

/** Distance between the tail's bones, down its length. */
const TAIL_SPACING = 0.38;

/**
 * Hangs every mesh of the tail from a chain of bones down its length, so the
 * hair can trail and sway instead of swinging as one stiff piece. Returns the
 * bones, dock first.
 */
export function bindTail(tail: THREE.Object3D, count = 4) {
	tail.updateWorldMatrix(true, true);
	const tailInverse = tail.matrixWorld.clone().invert();
	const bones: THREE.Bone[] = [];
	for (let i = 0; i < count; i++) {
		const bone = new THREE.Bone();
		bone.name = `tail-${i}`;
		if (i) {
			bone.position.y = -TAIL_SPACING;
			bones[i - 1].add(bone);
		} else tail.add(bone);
		bones.push(bone);
	}
	tail.updateWorldMatrix(true, true);
	const skeleton = new THREE.Skeleton(bones);
	const meshes: THREE.Mesh[] = [];
	tail.traverse((object) => {
		if (object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh))
			meshes.push(object);
	});
	const local = new THREE.Vector3(),
		toTail = new THREE.Matrix4();
	for (const mesh of meshes) {
		const geometry = mesh.geometry.clone();
		const position = geometry.getAttribute('position');
		toTail.multiplyMatrices(tailInverse, mesh.matrixWorld);
		const joints = new Uint16Array(position.count * 4),
			weights = new Float32Array(position.count * 4);
		for (let i = 0; i < position.count; i++) {
			local.fromBufferAttribute(position, i).applyMatrix4(toTail);
			const along = THREE.MathUtils.clamp(
				-local.y / TAIL_SPACING,
				0,
				count - 1,
			);
			const first = Math.min(count - 2, Math.floor(along)),
				share = along - first;
			joints.set([first, first + 1, 0, 0], i * 4);
			weights.set([1 - share, share, 0, 0], i * 4);
		}
		geometry.setAttribute(
			'skinIndex',
			new THREE.Uint16BufferAttribute(joints, 4),
		);
		geometry.setAttribute(
			'skinWeight',
			new THREE.Float32BufferAttribute(weights, 4),
		);
		const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
		skinned.name = mesh.name;
		skinned.position.copy(mesh.position);
		skinned.quaternion.copy(mesh.quaternion);
		skinned.scale.copy(mesh.scale);
		skinned.castShadow = mesh.castShadow;
		skinned.receiveShadow = mesh.receiveShadow;
		skinned.visible = mesh.visible;
		skinned.frustumCulled = false;
		const parent = mesh.parent!;
		parent.add(skinned);
		parent.remove(mesh);
		skinned.updateMatrixWorld(true);
		skinned.bind(skeleton, skinned.matrixWorld);
	}
	return bones;
}

const bodyPoint = new THREE.Vector3(),
	rootPoint = new THREE.Vector3(),
	toBody = new THREE.Matrix4();

/**
 * Turns hair, headgear and ornaments into skinned meshes of the neck chain, so
 * they follow the head when it lowers or turns. Meshes keep their parents, so
 * appearance groups still show and hide them.
 */
export function bindToNeck(
	body: THREE.Object3D,
	skeleton: THREE.Skeleton,
	parts: readonly THREE.Object3D[],
) {
	body.updateWorldMatrix(true, true);
	const bodyInverse = body.matrixWorld.clone().invert();
	const meshes: THREE.Mesh[] = [];
	for (const part of parts)
		part.traverse((object) => {
			if (
				object instanceof THREE.Mesh &&
				!(object instanceof THREE.SkinnedMesh)
			)
				meshes.push(object);
		});
	for (const mesh of meshes) {
		// Shared primitives (eyes, knots, rings) get their own copy to carry weights.
		const shared =
			mesh.geometry instanceof THREE.SphereGeometry ||
			mesh.geometry instanceof THREE.TorusGeometry;
		const geometry = shared ? mesh.geometry.clone() : mesh.geometry;
		const position = geometry.getAttribute('position');
		toBody.multiplyMatrices(bodyInverse, mesh.matrixWorld);
		const joints = new Uint16Array(position.count * 4),
			weights = new Float32Array(position.count * 4);
		// Hair locks move as a whole with their root, so they never fan out;
		// knots, rings and eyes move as one piece with their middle.
		const whole = shared;
		const strand = whole
				? position.count
				: Number(mesh.userData.strandVertices) || 1,
			ring = whole ? position.count : Number(mesh.userData.strandRing) || 1;
		for (let start = 0; start < position.count; start += strand) {
			bodyPoint.set(0, 0, 0);
			for (let i = 0; i < ring; i++)
				bodyPoint.add(rootPoint.fromBufferAttribute(position, start + i));
			bodyPoint.divideScalar(ring).applyMatrix4(toBody);
			const shares = neckWeights(bodyPoint.y, bodyPoint.z);
			for (let i = start; i < Math.min(position.count, start + strand); i++) {
				joints.set([0, 13, 14, 15], i * 4);
				weights.set(shares, i * 4);
			}
		}
		geometry.setAttribute(
			'skinIndex',
			new THREE.Uint16BufferAttribute(joints, 4),
		);
		geometry.setAttribute(
			'skinWeight',
			new THREE.Float32BufferAttribute(weights, 4),
		);
		const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
		skinned.name = mesh.name;
		skinned.position.copy(mesh.position);
		skinned.quaternion.copy(mesh.quaternion);
		skinned.scale.copy(mesh.scale);
		skinned.castShadow = mesh.castShadow;
		skinned.receiveShadow = mesh.receiveShadow;
		skinned.visible = mesh.visible;
		skinned.frustumCulled = false;
		const parent = mesh.parent!;
		parent.add(skinned);
		parent.remove(mesh);
		skinned.updateMatrixWorld(true);
		skinned.bind(skeleton, skinned.matrixWorld);
	}
}
