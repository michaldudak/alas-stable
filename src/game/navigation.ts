/** A walkable network of named points joined by straight, clear segments. */

export type Point = { x: number; z: number };

export interface Graph {
	nodes: (Point & { name: string })[];
	/** Neighbour indices of every node. */
	links: number[][];
}

export function createGraph(
	nodes: readonly (Point & { name: string })[],
	edges: readonly (readonly [string, string])[],
): Graph {
	const index = new Map(nodes.map((node, i) => [node.name, i]));
	const links = nodes.map(() => [] as number[]);
	for (const [a, b] of edges) {
		const i = index.get(a),
			j = index.get(b);
		if (i === undefined || j === undefined)
			throw new Error(`Unknown node in edge ${a}–${b}`);
		links[i].push(j);
		links[j].push(i);
	}
	return { nodes: [...nodes], links };
}

export function nodeIndex(graph: Graph, name: string) {
	const i = graph.nodes.findIndex((node) => node.name === name);
	if (i < 0) throw new Error(`Unknown node ${name}`);
	return i;
}

/** The node closest to a point. */
export function nearestNode(graph: Graph, x: number, z: number) {
	let best = 0,
		distance = Infinity;
	graph.nodes.forEach((node, i) => {
		const d = Math.hypot(node.x - x, node.z - z);
		if (d < distance) {
			distance = d;
			best = i;
		}
	});
	return best;
}

/** Shortest chain of node indices from `from` to `to` (Dijkstra). */
export function findPath(graph: Graph, from: number, to: number) {
	const count = graph.nodes.length;
	const distance = new Array<number>(count).fill(Infinity),
		previous = new Array<number>(count).fill(-1),
		done = new Array<boolean>(count).fill(false);
	distance[from] = 0;
	for (;;) {
		let current = -1;
		for (let i = 0; i < count; i++)
			if (!done[i] && (current < 0 || distance[i] < distance[current]))
				current = i;
		if (current < 0 || distance[current] === Infinity) return undefined;
		if (current === to) break;
		done[current] = true;
		const a = graph.nodes[current];
		for (const next of graph.links[current]) {
			const b = graph.nodes[next];
			const d = distance[current] + Math.hypot(a.x - b.x, a.z - b.z);
			if (d < distance[next]) {
				distance[next] = d;
				previous[next] = current;
			}
		}
	}
	const path = [to];
	while (path[0] !== from) path.unshift(previous[path[0]]);
	return path;
}

/** Points every `step` metres along a polyline, ending exactly at its last point. */
export function resample(points: readonly Point[], step = 2): Point[] {
	const result: Point[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i],
			b = points[i + 1];
		const length = Math.hypot(b.x - a.x, b.z - a.z);
		const count = Math.max(1, Math.round(length / step));
		for (let k = 0; k < count; k++)
			result.push({
				x: a.x + ((b.x - a.x) * k) / count,
				z: a.z + ((b.z - a.z) * k) / count,
			});
	}
	if (points.length) result.push({ ...points[points.length - 1] });
	return result;
}

/** The walk between two nodes along the network, as evenly spaced points. */
export function route(graph: Graph, from: number, to: number, step = 2) {
	const path = findPath(graph, from, to);
	if (!path) return undefined;
	return resample(
		path.map((i) => graph.nodes[i]),
		step,
	);
}

/** Every segment of the network, for checking it against obstacles. */
export function segments(graph: Graph) {
	const list: [Point & { name: string }, Point & { name: string }][] = [];
	graph.links.forEach((links, i) => {
		for (const j of links)
			if (j > i) list.push([graph.nodes[i], graph.nodes[j]]);
	});
	return list;
}
