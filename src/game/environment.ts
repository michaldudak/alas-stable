/** Time of day and weather: pure numbers the renderer, audio and HUD read each frame. */

/** One full day and night lasts fifteen minutes of play. */
export const DAY_LENGTH = 900;
export const START_HOUR = 11;
/** The night passes twice as fast as the day, so most of the play is in daylight. */
const NIGHT_RATE = 2;
const LATITUDE = (52 * Math.PI) / 180,
	DECLINATION = (20 * Math.PI) / 180,
	SOLAR_NOON = 13;

export type Weather = 'sunny' | 'windy' | 'cloudy' | 'rainy';
export const WEATHERS: readonly Weather[] = [
	'sunny',
	'windy',
	'cloudy',
	'rainy',
];

/** Continuous weather parameters, each 0–1, blended during a change of weather. */
export interface Conditions {
	/** Share of the sky covered by clouds. */
	cloud: number;
	/** How grey and heavy the clouds are; dims direct sunlight. */
	overcast: number;
	wind: number;
	rain: number;
}

export const WEATHER_CONDITIONS: Record<Weather, Conditions> = {
	sunny: { cloud: 0.2, overcast: 0, wind: 0.2, rain: 0 },
	windy: { cloud: 0.5, overcast: 0.15, wind: 1, rain: 0 },
	cloudy: { cloud: 0.85, overcast: 0.65, wind: 0.45, rain: 0 },
	rainy: { cloud: 1, overcast: 1, wind: 0.6, rain: 1 },
};

/** Weather that may follow each kind, so rain always builds up through cloud. */
const NEXT: Record<Weather, readonly Weather[]> = {
	sunny: ['windy', 'cloudy', 'sunny'],
	windy: ['sunny', 'cloudy'],
	cloudy: ['rainy', 'sunny', 'windy'],
	rainy: ['cloudy'],
};

/** Sunrise and sunset hours for the fixed latitude and season. */
export const DAYLIGHT = (() => {
	const halfDay =
		(Math.acos(-Math.tan(LATITUDE) * Math.tan(DECLINATION)) / Math.PI) * 12;
	return { sunrise: SOLAR_NOON - halfDay, sunset: SOLAR_NOON + halfDay };
})();

const dayHours = DAYLIGHT.sunset - DAYLIGHT.sunrise;
/** Game hours per real second in daylight. */
const DAY_RATE = (dayHours + (24 - dayHours) / NIGHT_RATE) / DAY_LENGTH;

export function isNightHour(hour: number) {
	return hour < DAYLIGHT.sunrise || hour >= DAYLIGHT.sunset;
}

/** Advances the clock by `dt` real seconds, wrapping at midnight. */
export function advanceHour(hour: number, dt: number) {
	const rate = DAY_RATE * (isNightHour(hour) ? NIGHT_RATE : 1);
	return (((hour + dt * rate) % 24) + 24) % 24;
}

/** Unit vector towards the sun (x east, y up, z south) at the given hour. */
export function sunDirection(hour: number): [number, number, number] {
	const angle = ((hour - SOLAR_NOON) / 24) * Math.PI * 2;
	const east = -Math.cos(DECLINATION) * Math.sin(angle);
	const north =
		Math.cos(LATITUDE) * Math.sin(DECLINATION) -
		Math.sin(LATITUDE) * Math.cos(DECLINATION) * Math.cos(angle);
	const up =
		Math.sin(LATITUDE) * Math.sin(DECLINATION) +
		Math.cos(LATITUDE) * Math.cos(DECLINATION) * Math.cos(angle);
	return [east, up, -north];
}

const smooth = (edge0: number, edge1: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
};

/** 0 in full daylight, 1 in the dark: lamps switch on as this rises. */
export function darkness(sunHeight: number) {
	return 1 - smooth(-0.1, 0.08, sunHeight);
}

export function createEnvironment(random: () => number = Math.random) {
	let hour = START_HOUR;
	let weather: Weather = 'sunny';
	let weatherTimer = 150 + random() * 90;
	const conditions: Conditions = { ...WEATHER_CONDITIONS.sunny };
	/** Wet ground lingers after rain and dries slowly. */
	let wetness = 0;
	/** Wind-driven phase for swaying grass, trees and drifting clouds. */
	let windPhase = 0;
	/** Player settings may hold the clock or the weather still. */
	let fixedHour: number | null = null;
	let fixedWeather: Weather | null = null;
	function setWeather(next: Weather, immediate = false) {
		weather = next;
		weatherTimer = next === 'rainy' ? 70 + random() * 60 : 110 + random() * 120;
		if (immediate) Object.assign(conditions, WEATHER_CONDITIONS[next]);
	}
	return {
		get hour() {
			return hour;
		},
		get weather() {
			return weather;
		},
		get conditions(): Readonly<Conditions> {
			return conditions;
		},
		get wetness() {
			return wetness;
		},
		get windPhase() {
			return windPhase;
		},
		get sun() {
			return sunDirection(hour);
		},
		get darkness() {
			return darkness(sunDirection(hour)[1]);
		},
		setHour(value: number) {
			hour = ((value % 24) + 24) % 24;
		},
		setWeather,
		/** `null` lets the clock run; a number keeps that hour. */
		fixHour(value: number | null) {
			fixedHour = value;
			if (value !== null) hour = value;
		},
		/** `null` lets the weather change by itself. */
		fixWeather(value: Weather | null) {
			fixedWeather = value;
			if (value !== null && value !== weather) setWeather(value);
		},
		update(dt: number) {
			hour = fixedHour ?? advanceHour(hour, dt);
			weatherTimer -= dt;
			if (fixedWeather !== null) {
				if (weather !== fixedWeather) setWeather(fixedWeather);
			} else if (weatherTimer <= 0) {
				const options = NEXT[weather];
				setWeather(options[Math.floor(random() * options.length)]);
			}
			// Weather changes roll in over about half a minute.
			const target = WEATHER_CONDITIONS[weather];
			const blend = 1 - Math.exp(-dt / 9);
			for (const key of ['cloud', 'overcast', 'wind', 'rain'] as const) {
				// Rain starts only once the sky is dark and stops before it clears.
				const rate =
					key === 'rain' && target.rain > conditions.rain
						? blend * smooth(0.6, 0.95, conditions.overcast)
						: blend;
				conditions[key] += (target[key] - conditions[key]) * rate;
			}
			wetness = Math.min(
				1,
				Math.max(0, wetness + dt * (conditions.rain * 0.05 - 0.006)),
			);
			windPhase += dt * (0.6 + conditions.wind * 1.1);
		},
	};
}

export type Environment = ReturnType<typeof createEnvironment>;
