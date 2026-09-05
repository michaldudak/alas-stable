import * as THREE from 'three';

/** Small, repeatable surface variation without external texture assets. */
export function terrainMaterial(
	color: string,
	repeatX: number,
	repeatY: number,
) {
	const size = 128;
	const data = new Uint8Array(size * size * 4);
	let seed = 719;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			const broad =
				Math.sin(
					(x / size) * Math.PI * 4 + Math.sin((y / size) * Math.PI * 2),
				) * 9;
			const grain = (seed / 4294967296 - 0.5) * 22;
			const shade = Math.round(227 + broad + grain);
			const offset = (y * size + x) * 4;
			data[offset] = data[offset + 1] = data[offset + 2] = shade;
			data[offset + 3] = 255;
		}
	}
	const texture = new THREE.DataTexture(data, size, size);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeatX, repeatY);
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	return new THREE.MeshStandardMaterial({ color, map: texture, roughness: 1 });
}
