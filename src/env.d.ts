import type { Appearance } from './horse/appearance.ts';
import type { GameState } from './game/types.ts';
declare global {
	interface Window {
		__alasStable?: {
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
				riding:
					'mounted' | 'on-foot' | 'approaching' | 'mounting' | 'dismounting';
				horse: { x: number; z: number; heading: number };
				paused: boolean;
				firstPerson: boolean;
				cameraDistanceScale: number;
				cameraLook: number;
				obstacles: {
					x: number;
					z: number;
					angle: number;
					down: number;
					carried: boolean;
				}[];
				calls: number;
			};
			/** Development shortcuts for browser checks and screenshots. */
			debug?: {
				teleport(x: number, z: number, heading: number): void;
				setTime?(hours: number): void;
				graze?(name: string, x: number, z: number, heading: number): void;
				setWeather?(weather: string): void;
			};
		};
	}
}
