import * as THREE from 'three';
import { context2d } from '../platform/dom.ts';

const LIFE = 1.8;

function heartTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 64;
	const ctx = context2d(canvas);
	ctx.fillStyle = '#e85d75';
	ctx.strokeStyle = '#fff4f0';
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(32, 54);
	ctx.bezierCurveTo(6, 36, 6, 12, 20, 10);
	ctx.bezierCurveTo(27, 9, 31, 14, 32, 19);
	ctx.bezierCurveTo(33, 14, 37, 9, 44, 10);
	ctx.bezierCurveTo(58, 12, 58, 36, 32, 54);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/** Little hearts that float up from a happy horse. */
export function createHearts(scene: THREE.Scene) {
	const material = new THREE.SpriteMaterial({
		map: heartTexture(),
		transparent: true,
		depthWrite: false,
	});
	const hearts = Array.from({ length: 14 }, () => {
		const sprite = new THREE.Sprite(material.clone());
		sprite.visible = false;
		sprite.renderOrder = 3;
		scene.add(sprite);
		return {
			sprite,
			age: LIFE,
			drift: new THREE.Vector3(),
			origin: new THREE.Vector3(),
		};
	});
	return {
		/** Releases `count` hearts from a point, a little apart in time. */
		burst(position: THREE.Vector3, count = 5) {
			let delay = 0;
			for (const heart of hearts) {
				if (count <= 0) break;
				if (heart.age < LIFE) continue;
				heart.age = -delay;
				delay += 0.14;
				heart.origin.copy(position);
				heart.drift.set(
					(Math.random() - 0.5) * 0.9,
					1,
					(Math.random() - 0.5) * 0.9,
				);
				count--;
			}
		},
		update(dt: number) {
			for (const heart of hearts) {
				if (heart.age >= LIFE) continue;
				heart.age += dt;
				const t = heart.age / LIFE;
				heart.sprite.visible = heart.age > 0 && t < 1;
				if (!heart.sprite.visible) continue;
				heart.sprite.position
					.copy(heart.origin)
					.addScaledVector(heart.drift, t * 1.1)
					.setY(heart.origin.y + t * 1.3);
				heart.sprite.position.x += Math.sin(heart.age * 5) * 0.06;
				const size = 0.28 * Math.min(1, heart.age * 6) * (1 - t * 0.3);
				heart.sprite.scale.set(size, size, size);
				heart.sprite.material.opacity =
					1 - THREE.MathUtils.smoothstep(t, 0.6, 1);
			}
		},
	};
}
