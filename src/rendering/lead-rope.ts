import * as THREE from 'three';
export function createLeadRope(scene: THREE.Scene) {
	const root = new THREE.Group();
	root.visible = false;
	scene.add(root);
	const geometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 6);
	const material = new THREE.MeshStandardMaterial({
		color: '#d7bc7e',
		roughness: 0.95,
	});
	const segments = Array.from({ length: 20 }, () => {
		const mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = true;
		root.add(mesh);
		return mesh;
	});
	const from = new THREE.Vector3(),
		to = new THREE.Vector3(),
		a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		direction = new THREE.Vector3(),
		up = new THREE.Vector3(0, 1, 0);
	return {
		update(hand: THREE.Object3D, anchor: THREE.Object3D, visible: boolean) {
			root.visible = visible;
			if (!visible) return;
			hand.getWorldPosition(from);
			anchor.getWorldPosition(to);
			const sag = Math.min(0.65, from.distanceTo(to) * 0.12);
			a.copy(from);
			segments.forEach((mesh, i) => {
				const t = (i + 1) / segments.length;
				b.lerpVectors(from, to, t);
				b.y -= Math.sin(Math.PI * t) * sag;
				direction.subVectors(b, a);
				mesh.position.copy(a).add(b).multiplyScalar(0.5);
				mesh.scale.y = direction.length();
				mesh.quaternion.setFromUnitVectors(up, direction.normalize());
				a.copy(b);
			});
		},
	};
}
