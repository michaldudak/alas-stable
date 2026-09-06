import type { Appearance } from './horse/appearance.ts';
import type { GameState } from './game/types.ts';
declare global {
	interface Window {
		__polana?: {
			snapshot: () => GameState & {
				activeHorse: string;
				leading: boolean;
				horses: {
					name: string;
					x: number;
					z: number;
					heading: number;
					halter: boolean;
					appearance: Appearance;
				}[];
				riding: 'mounted' | 'on-foot' | 'mounting' | 'dismounting';
				horse: { x: number; z: number; heading: number };
				paused: boolean;
				firstPerson: boolean;
				cameraDistanceScale: number;
				cameraLook: number;
				obstacles: { z: number; down: number }[];
				calls: number;
			};
		};
	}
}
