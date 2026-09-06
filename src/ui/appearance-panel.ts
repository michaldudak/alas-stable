import { createAppearanceStore } from '../platform/appearance-storage.ts';
import type { HorseModel } from '../horse/types.ts';
import type { Appearance } from '../horse/appearance.ts';
import { context2d } from '../platform/dom.ts';
import { colorOptions, styleOptions } from '../horse/appearance.ts';

function thumbnail(canvas: HTMLCanvasElement, key: string, value: string) {
	canvas.width = 160;
	canvas.height = 100;
	const ctx = context2d(canvas);
	ctx.scale(2, 2);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.fillStyle = '#68503a';
	ctx.strokeStyle = '#68503a';
	if (key === 'equipment') {
		ctx.fillStyle = '#b9845b';
		ctx.beginPath();
		ctx.ellipse(40, 32, 28, 13, 0, 0, Math.PI * 2);
		ctx.fill();
		if (value === 'saddled') {
			ctx.fillStyle = '#437f79';
			ctx.fillRect(25, 21, 29, 19);
			ctx.fillStyle = '#60432c';
			ctx.beginPath();
			ctx.roundRect(28, 16, 23, 18, 5);
			ctx.fill();
			ctx.strokeStyle = '#d7ba85';
			ctx.lineWidth = 2;
			ctx.stroke();
		} else {
			ctx.strokeStyle = '#fff2d4';
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(28, 12);
			ctx.lineTo(36, 18);
			ctx.lineTo(51, 6);
			ctx.stroke();
		}
	} else if (key === 'pattern') {
		ctx.fillStyle = '#7d9e8c';
		ctx.beginPath();
		ctx.roundRect(12, 6, 56, 38, 6);
		ctx.fill();
		ctx.fillStyle = '#f8efda';
		ctx.strokeStyle = '#f8efda';
		ctx.lineWidth = 3;
		if (value === 'stripes')
			for (let x = 23; x < 65; x += 12) {
				ctx.beginPath();
				ctx.moveTo(x, 10);
				ctx.lineTo(x - 4, 40);
				ctx.stroke();
			}
		if (value === 'dots' || value === 'stars')
			for (let x = 23; x < 65; x += 16)
				for (let y = 16; y < 40; y += 17) {
					if (value === 'dots') {
						ctx.beginPath();
						ctx.arc(x, y, 3, 0, 7);
						ctx.fill();
					} else star(ctx, x, y, 5);
				}
	} else if (key === 'ornament') {
		ctx.fillStyle = '#c77a83';
		ctx.strokeStyle = '#c77a83';
		ctx.lineWidth = 4;
		if (value === 'none') {
			ctx.strokeStyle = '#899181';
			ctx.beginPath();
			ctx.arc(40, 25, 15, 0, 7);
			ctx.moveTo(29, 36);
			ctx.lineTo(51, 14);
			ctx.stroke();
		}
		if (value === 'flower') {
			for (let i = 0; i < 5; i++) {
				ctx.beginPath();
				ctx.arc(
					40 + Math.sin(i * 1.257) * 10,
					24 + Math.cos(i * 1.257) * 10,
					7,
					0,
					7,
				);
				ctx.fill();
			}
			ctx.fillStyle = '#efcd77';
			ctx.beginPath();
			ctx.arc(40, 24, 5, 0, 7);
			ctx.fill();
		}
		if (value === 'bow') {
			for (const s of [-1, 1]) {
				ctx.beginPath();
				ctx.ellipse(40 + s * 11, 20, 12, 8, s * 0.4, 0, 7);
				ctx.fill();
				ctx.beginPath();
				ctx.moveTo(40, 24);
				ctx.lineTo(40 + s * 10, 39);
				ctx.stroke();
			}
		}
		if (value === 'ribbons')
			for (let i = 0; i < 3; i++) {
				ctx.beginPath();
				ctx.moveTo(30 + i * 10, 8);
				ctx.bezierCurveTo(50 + i * 8, 22, 15 + i * 12, 26, 33 + i * 9, 43);
				ctx.stroke();
			}
	} else {
		const tail = key === 'tailStyle';
		if (!tail) {
			ctx.fillStyle = '#c49a70';
			ctx.beginPath();
			ctx.moveTo(16, 40);
			ctx.quadraticCurveTo(38, 27, 51, 5);
			ctx.lineTo(64, 11);
			ctx.lineTo(51, 43);
			ctx.fill();
		}
		ctx.strokeStyle = '#68503a';
		ctx.lineWidth = value === 'braided' ? 4 : 5;
		const n = tail ? 5 : 7;
		for (let i = 0; i < n; i++) {
			const x = tail ? 30 + i * 5 : 20 + i * 5;
			const y = tail ? 8 : 36 - i * 4;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.quadraticCurveTo(
				x + (tail ? 6 : 9),
				y + 5,
				x + (tail ? 2 : 8),
				y + (value === 'short' ? 9 : tail ? 32 : 19),
			);
			ctx.stroke();
			if (value === 'braided') {
				ctx.strokeStyle = '#b19570';
				ctx.lineWidth = 2;
				for (let j = 3; j < (tail ? 28 : 16); j += 5) {
					ctx.beginPath();
					ctx.moveTo(x, y + j);
					ctx.lineTo(x + 8, y + j + 4);
					ctx.stroke();
				}
				ctx.strokeStyle = '#68503a';
				ctx.lineWidth = 4;
			}
		}
	}
}
function star(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
) {
	ctx.beginPath();
	for (let i = 0; i < 10; i++) {
		const a = (i * Math.PI) / 5 - Math.PI / 2,
			r = i % 2 ? radius * 0.45 : radius;
		ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
	}
	ctx.closePath();
	ctx.fill();
}

export function setupAppearancePanel(
	container: HTMLElement,
	horse: Pick<HorseModel, 'setAppearance'>,
	store = createAppearanceStore(),
	initial?: Appearance,
) {
	container.replaceChildren();
	let appearance = initial ?? store.load();
	horse.setAppearance(appearance);
	const controls: [HTMLButtonElement, keyof Appearance, string][] = [];
	function choose(key: keyof Appearance, value: string) {
		appearance = horse.setAppearance({ ...appearance, [key]: value });
		store.save(appearance);
		for (const [button, field, option] of controls)
			button.setAttribute('aria-pressed', String(appearance[field] === option));
	}
	const nav = document.createElement('div');
	nav.className = 'appearance-nav';
	nav.setAttribute('aria-label', 'Sekcje wyglądu konia');
	const panels: Record<
		string,
		{ panel: HTMLDivElement; button: HTMLButtonElement }
	> = {};
	for (const [id, label] of [
		['colors', 'Kolory'],
		['hair', 'Fryzury'],
		['ornaments', 'Ozdoby'],
		['cloth', 'Czaprak'],
	]) {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = label;
		button.setAttribute('aria-pressed', String(id === 'colors'));
		button.setAttribute('aria-controls', `appearance-${id}`);
		const panel = document.createElement('div');
		panel.id = `appearance-${id}`;
		panel.className = 'appearance-section';
		panel.hidden = id !== 'colors';
		button.onclick = () => {
			for (const [name, entry] of Object.entries(panels)) {
				entry.panel.hidden = name !== id;
				entry.button.setAttribute('aria-pressed', String(name === id));
			}
		};
		nav.append(button);
		panels[id] = { panel, button };
	}
	container.append(nav, ...Object.values(panels).map((entry) => entry.panel));
	function section(panel: string, title: string) {
		const group = document.createElement('section'),
			heading = document.createElement('h3');
		heading.textContent = title;
		group.append(heading);
		panels[panel].panel.append(group);
		return group;
	}
	function optionControl(key: keyof Appearance, value: string, name: string) {
		const button = document.createElement('button');
		button.type = 'button';
		button.setAttribute('aria-label', name);
		button.setAttribute('aria-pressed', String(appearance[key] === value));
		button.onclick = () => choose(key, value);
		controls.push([button, key, value]);
		return button;
	}
	const ridingGroup = section('colors', 'Jazda');
	const ridingOptions = document.createElement('div');
	ridingOptions.className = 'picture-options';
	for (const [value, name] of styleOptions.equipment) {
		const button = optionControl('equipment', value, 'Jazda: ' + name);
		const canvas = document.createElement('canvas'),
			label = document.createElement('span');
		canvas.setAttribute('aria-hidden', 'true');
		thumbnail(canvas, 'equipment', value);
		label.textContent = name;
		button.append(canvas, label);
		ridingOptions.append(button);
	}
	ridingGroup.append(ridingOptions);
	for (const [key, label, colors, names] of colorOptions) {
		const group = section(
			key === 'ornamentColor'
				? 'ornaments'
				: key === 'cloth'
					? 'cloth'
					: 'colors',
			label,
		);
		const row = document.createElement('div');
		row.className = 'swatch-row';
		colors.forEach((color, i) => {
			const button = optionControl(key, color, `${label}: ${names[i]}`);
			button.className = 'swatch';
			button.style.setProperty('--swatch', color);
			button.title = names[i];
			row.append(button);
		});
		group.append(row);
	}
	for (const [key, label, panel] of [
		['maneStyle', 'Grzywa', 'hair'],
		['tailStyle', 'Ogon', 'hair'],
		['ornament', 'Ozdoba', 'ornaments'],
		['pattern', 'Wzór czapraka', 'cloth'],
	] as const) {
		const group = section(panel, label),
			row = document.createElement('div');
		row.className = 'picture-options';
		for (const [value, title] of styleOptions[key]) {
			const button = optionControl(key, value, `${label}: ${title}`),
				canvas = document.createElement('canvas'),
				text = document.createElement('span');
			canvas.setAttribute('aria-hidden', 'true');
			thumbnail(canvas, key, value);
			text.textContent = title;
			button.append(canvas, text);
			row.append(button);
		}
		group.append(row);
	}
}
