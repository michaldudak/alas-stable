import type { GameState } from './game-types.ts';
// Small synthesized soundscape: no downloads or autoplay permission prompts.
export class Soundscape {
	enabled = true;
	context: AudioContext | null = null;
	birdTime = 3;
	horseTime = 18;
	windTime = 0;
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
		gain.gain.exponentialRampToValueAtTime(
			0.001,
			ctx.currentTime + duration,
		);
		oscillator.connect(gain);
		gain.connect(ctx.destination);
		oscillator.start();
		oscillator.stop(ctx.currentTime + duration + 0.01);
		oscillator.onended = () => {
			oscillator.disconnect();
			gain.disconnect();
		};
	}
	tick(
		dt: number,
		state: Pick<GameState, 'z'>,
		sand: boolean,
		footfalls = 0,
	) {
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
		if (this.birdTime <= 0) {
			this.tone(1800 + Math.random() * 900, 0.16, 0.018, 3400);
			this.birdTime = 1.2 + Math.random() * 3;
		}
		if (this.horseTime <= 0) {
			this.tone(640, 0.75, 0.022, 310, 'triangle');
			this.horseTime = 25 + Math.random() * 20;
		}
	}
}
