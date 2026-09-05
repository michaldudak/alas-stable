import * as THREE from 'three';

/** Dispose once per scene, because meshes and the wardrobe preview share resources. */
export function disposeScene(root: THREE.Object3D) {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	root.traverse((object) => {
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
		for (const value of Object.values(material))
			if (value instanceof THREE.Texture) textures.add(value);
		material.dispose();
	}
	for (const texture of textures) texture.dispose();
	for (const geometry of geometries) geometry.dispose();
	root.clear();
}
