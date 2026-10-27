// Citations per $100M against cost for one division, one square per mission, both axes log: the
// overview's old per-dollar row, given a page of its own. The trend is the packaged fit
// (perDollar.fit: least squares of log rate on log cost over the missions with citations), drawn
// across their cost range. A mission with none sits on a shelf under the plot: zero has no place
// on a log scale, and any stand-in value would set the slope. Geometry only; the figures the page
// prints come from the packager.
import { scaleLog } from 'd3-scale';
import { byCostThenId, costTicks, decadeTicks, stackLevels } from './costaxis.js';

/**
 * The stretch of log10 costs [a, b] over which the line log10(rate) = intercept + slope · log10(cost)
 * stays inside the rate domain [lo, hi]. A line is cut there rather than clamped at its ends,
 * which would change its tilt. Null when nothing is left.
 */
export function clipSpan({ intercept, slope }, [a, b], [lo, hi]) {
	if (slope !== 0) {
		const ends = [lo, hi].map((r) => (Math.log10(r) - intercept) / slope).sort((p, q) => p - q);
		[a, b] = [Math.max(a, ends[0]), Math.min(b, ends[1])];
	}
	return b > a ? [a, b] : null;
}

/** A mission's citations per $100M of cost in `scope`; null when its output wasn't measured (the packager's measuredIn rule). */
export function rate(m, scope) {
	const s = m[scope];
	if (!(m.cost > 0) || s?.citations == null || s.top10 == null || (s.status ?? 'available') !== 'available') return null;
	return (s.citations / m.cost) * 100;
}

const WIDE = { left: 52, right: 16, top: 16, plotH: 300, s: 14, gap: 2, shelfGap: 12, axisH: 28 };
const PHONE = { left: 40, right: 8, top: 16, plotH: 220, s: 10, gap: 2, shelfGap: 10, axisH: 28 };

/**
 * The chart's geometry at `width`: scales, each mission's square, the shelf of missions without
 * citations, the packaged `fit` ({ slope, intercept }, or null) as a segment and the ticks. Null
 * with no width or nothing to place.
 */
export function perDollarChart(missions, scope, width, fit = null) {
	if (!(width > 0)) return null;
	const o = width < 560 ? PHONE : WIDE;
	const placed = missions.filter((m) => rate(m, scope) != null).sort(byCostThenId);
	const cited = placed.filter((m) => rate(m, scope) > 0);
	if (!cited.length) return null;
	const costs = placed.map((m) => m.cost);
	const rates = cited.map((m) => rate(m, scope));
	const left = o.left;
	const right = width - o.right;
	const x = scaleLog().domain([Math.min(...costs) / 1.6, Math.max(...costs) * 1.6]).range([left, right]);
	const top = o.top;
	const bottom = top + o.plotH;
	const y = scaleLog().domain([Math.min(...rates) / 1.6, Math.max(...rates) * 1.6]).range([bottom, top]).clamp(true);

	const zeros = placed.filter((m) => !(rate(m, scope) > 0));
	const { levels, depth } = stackLevels(zeros, (m) => x(m.cost) - o.s / 2, o.s, o.gap);
	const shelfY = bottom + o.shelfGap;
	const shelfH = depth ? depth * (o.s + o.gap) - o.gap : 0;
	const axisY = shelfY + shelfH + (depth ? 8 : 0) + 16;

	const marks = [
		...cited.map((m) => ({ id: m.id, x: x(m.cost) - o.s / 2, y: y(rate(m, scope)) - o.s / 2, s: o.s })),
		...zeros.map((m) => ({ id: m.id, x: x(m.cost) - o.s / 2, y: shelfY + levels.get(m.id) * (o.s + o.gap), s: o.s }))
	];
	const span = fit && clipSpan(fit, [Math.log10(cited[0].cost), Math.log10(cited.at(-1).cost)], y.domain());
	const [[x1, y1], [x2, y2]] = span ? span.map((c) => [x(10 ** c), y(10 ** (fit.intercept + fit.slope * c))]) : [[], []];

	return {
		x, y, left, right, top, bottom, shelfY, shelfH, zeros: zeros.length, axisY,
		height: axisY + o.axisH - 16,
		marks,
		fit: span ? { x1, y1, x2, y2 } : null,
		ticks: costTicks(x),
		yTicks: decadeTicks(...y.domain())
	};
}
