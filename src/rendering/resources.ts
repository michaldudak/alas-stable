import * as THREE from 'three';

/** Dispose once per scene, because meshes and the wardrobe preview share resources. */
export function disposeScene(root: THREE.Object3D) {
	const skeletons = new Set<THREE.Skeleton>();
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	root.traverse((object) => {
		if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
		if (object instanceof THREE.Mesh) {
			geometries.add(object.geometry);
			const entries = Array.isArray(object.material)
				? object.material
				: [object.material];
			for (const material of entries) materials.add(material);
		}
		if (
			object instanceof THREE.DirectionalLight ||
			object instanceof THREE.SpotLight ||
			object instanceof THREE.PointLight
		)
			object.shadow.dispose();
	});
	for (const material of materials) {
		// Shader extensions keep their extra samplers in `userData.textures`.
		const candidates: unknown[] = Object.values(material);
		const extra: unknown = material.userData.textures;
		if (Array.isArray(extra)) candidates.push(...(extra as unknown[]));
		for (const value of candidates)
			if (value instanceof THREE.Texture) textures.add(value);
		material.dispose();
	}
	for (const texture of textures) texture.dispose();
	for (const skeleton of skeletons) skeleton.dispose();
	for (const geometry of geometries) geometry.dispose();
	root.clear();
}
