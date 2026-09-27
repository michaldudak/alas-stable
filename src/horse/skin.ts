import * as THREE from 'three';
import { horseAsset } from './asset.ts';
import { NECK_PIVOTS, neckWeights } from './neck.ts';

/** The sculpted body from `src/assets/horse.glb`, shared by every horse. */
export function createSkinGeometry() {
	return horseAsset().geometry;
}

const skinVertex = /* glsl */ `
attribute float ao;
attribute vec3 mask;
varying float vOcclusion;
varying vec3 vMask;`;

const skinFragment = /* glsl */ `
uniform vec3 sockColor, pointColor, hoofColor;
varying float vOcclusion;
varying vec3 vMask;`;

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
				'#include <begin_vertex>\nvOcclusion = ao;\nvMask = mask;',
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${skinFragment}`)
			.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
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
 * fetlocks in LH, LF, RH, RF order, then the neck chain ending at the head.
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
	]);
	skin.bind(skeleton);
	skin.castShadow = true;
	skin.receiveShadow = true;
	// Animated bounds vary during jumping; this hero mesh should never be culled by its bind pose.
	skin.frustumCulled = false;
	return { skin, neck, skeleton };
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
		// Hair locks move as a whole with their root, so they never fan out.
		const strand = Number(mesh.userData.strandVertices) || 1,
			ring = Number(mesh.userData.strandRing) || 1;
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
