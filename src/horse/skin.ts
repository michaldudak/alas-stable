import * as THREE from 'three';
import { horseAsset } from './asset.ts';

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
 * fetlocks in LH, LF, RH, RF order.
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
	const skin = new THREE.SkinnedMesh(createSkinGeometry(), material);
	skin.name = 'horse-skin';
	body.add(skin);
	body.updateWorldMatrix(true, true);
	skin.bind(new THREE.Skeleton([root, ...legs, ...knees, ...fetlocks]));
	skin.castShadow = true;
	skin.receiveShadow = true;
	// Animated bounds vary during jumping; this hero mesh should never be culled by its bind pose.
	skin.frustumCulled = false;
	return skin;
}
