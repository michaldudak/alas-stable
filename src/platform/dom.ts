/** Fail at initialization with a useful error instead of later in an event handler. */
export function requireElement<T extends Element>(
	selector: string,
	type: { new (...args: never[]): T },
	root: ParentNode = document,
): T {
	const element = root.querySelector(selector);
	if (!(element instanceof type))
		throw new Error(`Missing ${type.name}: ${selector}`);
	return element;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Canvas 2D is unavailable');
	return context;
}
