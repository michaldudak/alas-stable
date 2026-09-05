import type { GameState, Obstacle, Solid } from './game-types.ts';
export const SPEEDS = [0, 2.5, 5.5, 9];
export const GAITS = ['Postój', 'Stęp', 'Kłus', 'Galop'];
export function createState(): GameState {
	return {
		x: 0,
		z: 24,
		heading: Math.PI,
		gait: 0,
		speed: 0,
		jump: -1,
		height: 0,
		bufferedJump: 0,
	};
}
export function changeGait(state: GameState, delta: number) {
	state.gait = Math.max(0, Math.min(3, state.gait + delta));
}
export function requestJump(state: GameState) {
	if (state.jump < 0) state.jump = 0;
	else state.bufferedJump = 0.22;
}
export function step(
	state: GameState,
	dt: number,
	turn: number,
	obstacles: Obstacle[] = [],
	solids: readonly Solid[] = [],
) {
	state.speed += (SPEEDS[state.gait] - state.speed) * Math.min(1, dt * 4);
	state.heading += turn * dt * (1.4 - state.speed * 0.035);
	const previous = { x: state.x, z: state.z };
	state.x += Math.sin(state.heading) * state.speed * dt;
	state.z += Math.cos(state.heading) * state.speed * dt;
	if (state.jump >= 0) {
		state.jump += dt;
		// A long, broad arc keeps a slightly early or late press forgiving.
		state.height = 2.1 * Math.sin(Math.PI * Math.min(1, state.jump / 1.45));
		if (state.jump >= 1.45) {
			state.jump = -1;
			state.height = 0;
		}
	}
	state.bufferedJump = Math.max(0, state.bufferedJump - dt);
	if (state.jump < 0 && state.bufferedJump > 0) {
		state.jump = 0;
		state.bufferedJump = 0;
	}
	let hit = false;
	for (const obstacle of obstacles) {
		obstacle.down = Math.max(0, (obstacle.down || 0) - dt);
		const crossing =
			(previous.z - obstacle.z) * (state.z - obstacle.z) <= 0 &&
			previous.z !== state.z;
		if (
			!obstacle.down &&
			crossing &&
			Math.abs(state.x - obstacle.x) < obstacle.width / 2 + 0.35
		) {
			if (state.jump < 0) {
				obstacle.down = 5;
				hit = true;
			}
		}
	}
	for (const solid of solids) {
		// Enclosure rails use the same forgiving jump window as arena obstacles.
		// Buildings, tree trunks and obstacle uprights remain solid during jumps.
		if (solid.jumpable && state.jump >= 0) continue;
		if (
			Math.abs(state.x - solid.x) < solid.w / 2 + 0.7 &&
			Math.abs(state.z - solid.z) < solid.d / 2 + 0.7
		) {
			state.x = previous.x;
			state.z = previous.z;
			state.gait = 0;
			state.speed = 0;
		}
	}
	const radius = Math.hypot(state.x, state.z);
	if (radius > 112) {
		state.x *= 112 / radius;
		state.z *= 112 / radius;
		state.gait = 0;
		state.speed = 0;
	}
	return hit;
}
