import * as THREE from 'three';
import { context2d } from '../platform/dom.ts';

/** Textures are cached per horse, including variants that are currently hidden. */
export function createPatternTextures() {
	const textures = new Map<string, THREE.CanvasTexture>();
	function patternTexture(id: string) {
		if (id === 'plain') return null;
		if (textures.has(id)) return textures.get(id)!;
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;
		const ctx = context2d(canvas);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, 256, 256);
		ctx.fillStyle = '#54616a';
		if (id === 'stripes')
			for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 22, 256);
		else
			for (let x = 32; x < 256; x += 64)
				for (let y = 32; y < 256; y += 64) {
					ctx.beginPath();
					if (id === 'dots') ctx.arc(x, y, 10, 0, Math.PI * 2);
					else
						for (let i = 0; i < 10; i++) {
							const a = (i * Math.PI) / 5 - Math.PI / 2,
								r = i % 2 ? 6 : 15;
							const px = x + Math.cos(a) * r,
								py = y + Math.sin(a) * r;
							if (i) ctx.lineTo(px, py);
							else ctx.moveTo(px, py);
						}
					ctx.closePath();
					ctx.fill();
				}
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		textures.set(id, texture);
		return texture;
	}

	return {
		get: patternTexture,
		dispose() {
			for (const texture of textures.values()) texture.dispose();
			textures.clear();
		},
	};
}
