import type { GameState } from '../game/types.ts';
// Small synthesized soundscape: no downloads or autoplay permission prompts.
export class Soundscape {
	enabled = true;
	context: AudioContext | null = null;
	birdTime = 3;
	horseTime = 18;
	windTime = 0;
	cricketTime = 2;
	darkness = 0;
	rain = 0;
	loops: { rain: GainNode; wind: GainNode } | null = null;
	dispose() {
		this.loops = null;
		const context = this.context;
		this.context = null;
		if (context && context.state !== 'closed')
			void context.close().catch(() => {});
	}
	async unlock() {
		try {
			this.context ||= new AudioContext();
			if (this.context.state === 'suspended') await this.context.resume();
		} catch {
			/* The game remains playable without audio. */
		}
	}
	tone(
		frequency: number,
		duration: number,
		volume: number,
		endFrequency: number,
		type: OscillatorType = 'sine',
	) {
		if (!this.enabled || this.context?.state !== 'running') return;
		const ctx = this.context,
			oscillator = ctx.createOscillator(),
			gain = ctx.createGain();
		oscillator.type = type;
		oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
		oscillator.frequency.exponentialRampToValueAtTime(
			Math.max(1, endFrequency || frequency),
			ctx.currentTime + duration,
		);
		gain.gain.setValueAtTime(0.001, ctx.currentTime);
		gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
		oscillator.connect(gain);
		gain.connect(ctx.destination);
		oscillator.start();
		oscillator.stop(ctx.currentTime + duration + 0.01);
		oscillator.onended = () => {
			oscillator.disconnect();
			gain.disconnect();
		};
	}
	/** Looping noise, filtered into rain on leaves or a low wind, faded by weather. */
	private noiseLoop(
		filterType: BiquadFilterType,
		frequency: number,
		brown: boolean,
	) {
		const ctx = this.context!;
		const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		let last = 0;
		for (let i = 0; i < data.length; i++) {
			const white = Math.random() * 2 - 1;
			last = brown ? (last + white * 0.02) / 1.02 : white;
			data[i] = brown ? last * 3.5 : white;
		}
		const source = ctx.createBufferSource(),
			filter = ctx.createBiquadFilter(),
			gain = ctx.createGain();
		source.buffer = buffer;
		source.loop = true;
		filter.type = filterType;
		filter.frequency.value = frequency;
		filter.Q.value = 0.5;
		gain.gain.value = 0;
		source.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		source.start();
		return gain;
	}
	/** Fades the rain and wind loops towards the current weather. */
	weather(rain: number, wind: number, darkness: number) {
		this.rain = rain;
		this.darkness = darkness;
		const ctx = this.context;
		if (!ctx || ctx.state !== 'running') return;
		this.loops ||= {
			rain: this.noiseLoop('bandpass', 2600, false),
			wind: this.noiseLoop('lowpass', 420, true),
		};
		const on = this.enabled ? 1 : 0;
		this.loops.rain.gain.setTargetAtTime(
			rain * 0.09 * on,
			ctx.currentTime,
			0.6,
		);
		this.loops.wind.gain.setTargetAtTime(
			wind * wind * 0.2 * on,
			ctx.currentTime,
			0.9,
		);
	}
	tick(dt: number, state: Pick<GameState, 'z'>, sand: boolean, footfalls = 0) {
		this.cricketTime -= dt;
		this.birdTime -= dt;
		this.horseTime -= dt;
		this.windTime -= dt;
		if (
			this.windTime <= 0 &&
			this.enabled &&
			this.context?.state === 'running'
		) {
			const ctx = this.context,
				duration = 2.5;
			const buffer = ctx.createBuffer(
				1,
				ctx.sampleRate * duration,
				ctx.sampleRate,
			);
			const data = buffer.getChannelData(0);
			for (let i = 0; i < data.length; i++)
				data[i] =
					(Math.random() * 2 - 1) *
					0.015 *
					Math.sin((Math.PI * i) / data.length);
			const source = ctx.createBufferSource(),
				filter = ctx.createBiquadFilter();
			source.buffer = buffer;
			filter.type = 'lowpass';
			filter.frequency.value = state.z < -40 ? 1400 : 650;
			source.connect(filter);
			filter.connect(ctx.destination);
			source.start();
			source.onended = () => {
				source.disconnect();
				filter.disconnect();
			};
			this.windTime = 2.5;
		}
		if (footfalls > 0) {
			this.tone(
				sand ? 130 : 90,
				sand ? 0.075 : 0.11,
				0.065 * Math.sqrt(footfalls),
				45,
				'triangle',
			);
		}
		// Birds sing by day and fall silent in the rain; crickets chirp at night.
		if (this.birdTime <= 0) {
			if (this.darkness < 0.5 && Math.random() > this.rain)
				this.tone(1800 + Math.random() * 900, 0.16, 0.018, 3400);
			this.birdTime = 1.2 + Math.random() * 3;
		}
		if (this.cricketTime <= 0) {
			if (this.darkness > 0.6 && this.rain < 0.3)
				for (let i = 0; i < 3; i++)
					setTimeout(() => this.tone(4300, 0.035, 0.006, 4200), i * 70);
			this.cricketTime = 0.7 + Math.random() * 1.6;
		}
		if (this.horseTime <= 0) {
			this.tone(640, 0.75, 0.022, 310, 'triangle');
			this.horseTime = 25 + Math.random() * 20;
		}
	}
}
