import type { GameState } from './game/types.ts';
declare global {
	interface Window {
		__polana?: {
			snapshot: () => GameState & {
				riding: 'mounted' | 'on-foot' | 'mounting' | 'dismounting';
				horse: { x: number; z: number; heading: number };
				paused: boolean;
				firstPerson: boolean;
				obstacles: { z: number; down: number }[];
				calls: number;
			};
		};
	}
}
