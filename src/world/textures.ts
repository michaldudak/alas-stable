import * as THREE from 'three';

type Pixel = (u: number, v: number) => [number, number, number, number?];

/** Builds a repeating, mipmapped texture from a per-pixel function returning 0–1 channels. */
export function proceduralTexture(
	size: number,
	pixel: Pixel,
	colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
) {
	const data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const [r, g, b, a = 1] = pixel(x / size, y / size);
			const offset = (y * size + x) * 4;
			data[offset] = THREE.MathUtils.clamp(r, 0, 1) * 255;
			data[offset + 1] = THREE.MathUtils.clamp(g, 0, 1) * 255;
			data[offset + 2] = THREE.MathUtils.clamp(b, 0, 1) * 255;
			data[offset + 3] = THREE.MathUtils.clamp(a, 0, 1) * 255;
		}
	const texture = new THREE.DataTexture(data, size, size);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 4;
	texture.colorSpace = colorSpace;
	texture.needsUpdate = true;
	return texture;
}

/** Converts a hex colour to sRGB channel values for texture generators. */
export function rgb(hex: string): [number, number, number] {
	const { r, g, b } = new THREE.Color(hex).getRGB(
		{ r: 0, g: 0, b: 0 },
		THREE.SRGBColorSpace,
	);
	return [r, g, b];
}

export function mix(
	a: readonly number[],
	b: readonly number[],
	t: number,
): [number, number, number] {
	return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [
		number,
		number,
		number,
	];
}
