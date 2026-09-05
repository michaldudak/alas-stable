import type { GameState } from './game/types.ts';
declare global {
	interface Window {
		__polana?: {
			snapshot: () => GameState & {
				paused: boolean;
				firstPerson: boolean;
				obstacles: { z: number; down: number }[];
				calls: number;
			};
		};
	}
}
