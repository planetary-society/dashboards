/**
 * Model for CostCurve: one division's missions in cost order, with the running count of its top
 * papers as each costlier mission is added.
 *
 * The packager writes the order and the cumulative shares (CostCurve in types.d.ts); the counts
 * come from each mission's own credit, summed here in that order. data.test.mjs holds the two to
 * each other. Facts are kept apart from geometry because the sentences have to render before the
 * stage has a width (every page is prerendered), and because no copy belongs in a scale.
 */

import { scaleLinear, scaleLog } from 'd3-scale';
import { costTicks, stackLevels, stepAfterPath } from './costaxis.js';

/**
 * What the copy and the plot both read. `credit` is the mission's own top-`top`% credit in
 * `scope`, `total` the running sum through it. Null when the view has no curve (lifetime top 1%).
 */
export function curveFacts(curve, missions, scope, top) {
	if (!curve?.points?.length) return null;
	const byId = new Map((missions ?? []).map((m) => [m.id, m]));
	let total = 0;
	const points = curve.points.map((p) => {
		const m = byId.get(p.id);
		// unavailable output adds nothing to the running total; it is never drawn as a measured zero
		const credit = m?.[scope]?.[`top${top}`] ?? 0;
		total += credit;
		return { id: p.id, name: m?.name ?? p.id, cost: p.cost, credit, total, topShare: p.topShare, reached: credit > 0 };
	});
	return { points, total, hasTop: total > 0, unplaced: curve.unplaced?.length ?? 0 };
}

/** The running totals at the dearest mission costing no more than `cost`. */
export function runningAt(points, cost) {
	let last = null;
	for (const p of points ?? []) if (p.cost <= cost) last = p;
	return last;
}

/**
 * Geometry for one measured width. The plot proper is `plotH` tall; the cost ticks and then the
 * rug of mission marks hang below it, so the stage is as tall as the deepest stack needs.
 */
export function curveChart(facts, width, { padTop, plotH, mark, gap, gutter, rightPad, axisH }) {
	if (!facts || !(width > 0)) return null;
	const left = gutter;
	const right = Math.max(left + mark * 4, width - rightPad);

	// Half a decade of padding either side: the cheapest and dearest missions sit inside the
	// plot rather than on its edges.
	const costs = facts.points.map((p) => p.cost);
	const x = scaleLog()
		.domain([Math.min(...costs) / 1.5, Math.max(...costs) * 1.5])
		.range([left + mark / 2, right - mark / 2]);
	const [x0, x1] = x.range();
	const y = scaleLinear()
		.domain([0, facts.total || 1])
		.nice(3) // asking for three lands on four or five ticks across the packaged totals
		.range([padTop + plotH, padTop]);

	const { levels, depth } = stackLevels(facts.points, (p) => x(p.cost) - mark / 2, mark, gap);
	const rugTop = padTop + plotH + axisH;
	const marks = facts.points.map((p) => ({
		...p,
		x: x(p.cost) - mark / 2,
		y: rugTop + levels.get(p.id) * (mark + gap),
		s: mark
	}));

	return {
		x,
		y,
		left,
		right,
		x0,
		x1,
		top: padTop,
		plotH,
		axisY: padTop + plotH + axisH - 6,
		ticks: costTicks(x),
		// a fractional tick would print as a repeated whole number
		yTicks: y.ticks(3).filter(Number.isInteger),
		// rounded to a tenth of a pixel: a path string that does not change between renders is
		// one the browser does not have to re-rasterise
		path: facts.hasTop ? stepAfterPath(facts.points, { x, y, x0, x1, value: (p) => p.total, round: fix }) : null,
		marks,
		rugTop,
		height: rugTop + depth * (mark + gap) - gap
	};
}

const fix = (n) => Number(n.toFixed(1));
