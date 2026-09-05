/** Rendering-independent state. Distances are metres, angles radians, time seconds. */
export interface MotionState {
	gait: number;
	speed: number;
	/** Negative while grounded; otherwise time since takeoff. */
	jump: number;
}

export interface GameState extends MotionState {
	x: number;
	z: number;
	heading: number;
	height: number;
	bufferedJump: number;
}

export interface Solid {
	x: number;
	z: number;
	w: number;
	d: number;
	jumpable?: boolean;
}

export interface Obstacle {
	x: number;
	z: number;
	width: number;
	down: number;
}
