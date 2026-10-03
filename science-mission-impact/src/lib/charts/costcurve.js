/**
 * Model for CostCurve: one division's missions in cost order, with the running share of its top
 * papers read against the running share of its spending.
 *
 * The packager writes cumulative points (CostCurve in types.d.ts). What a reader asks of a mark
 * is the other direction — what did *this* mission add — so the increments are taken back out
 * here. Facts are kept apart from geometry because the sentences have to render before the
 * stage has a width (every page is prerendered), and because no copy belongs in a scale.
 */

import { scaleLog } from 'd3-scale';
import { decadeTicks, stackLevels, stepAfterPath } from './costaxis.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * What the copy and the plot both read. `share` is the mission's own contribution, the step it
 * adds to the running total. Null when the view has no curve at all (lifetime top 1%).
 */
export function curveFacts(curve, missions) {
	if (!curve?.points?.length) return null;
	const names = new Map((missions ?? []).map((m) => [m.id, m.name]));
	let previous = 0;
	const points = curve.points.map((p) => {
		// Cumulative shares never fall, but a float can; the floor keeps a mark from claiming
		// a negative contribution.
		const share = Math.max(0, p.topShare - previous);
		previous = p.topShare;
		return {
			id: p.id,
			name: names.get(p.id) ?? p.id,
			cost: p.cost,
			topShare: p.topShare,
			costShare: p.costShare,
			share,
			reached: share > 1e-9
		};
	});
	const band = curve.band ?? { p25: null, p50: null, p75: null };
	return {
		points,
		band,
		hasTop: points.some((p) => p.reached),
		/** running totals where the first quarter of the top papers is in: the takeaway sentence */
		atP25: band.p25 == null ? null : runningAt(points, band.p25),
		unplaced: curve.unplaced?.length ?? 0
	};
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
	// plot rather than on its edges, and the ticks stay at whole powers of ten.
	const costs = facts.points.map((p) => p.cost);
	const x = scaleLog()
		.domain([Math.min(...costs) / 1.5, Math.max(...costs) * 1.5])
		.range([left + mark / 2, right - mark / 2]);
	const [x0, x1] = x.range();
	const y = (share) => padTop + plotH * (1 - clamp(share, 0, 1));

	const values = decadeTicks(...x.domain());
	// A tick label wants about 40px of its own; where a decade is narrower than that, every
	// other label comes off rather than letting two of them collide.
	const decade = values.length > 1 ? x(values[1]) - x(values[0]) : Infinity;
	const ticks = values.map((value, i) => ({ value, minor: decade < 52 && i % 2 === 1 }));

	// Both lines round to a tenth of a pixel: a path string that does not change between
	// renders is one the browser does not have to re-rasterise.
	const step = (value) => stepAfterPath(facts.points, { x, y, x0, x1, value, round: fix });

	const { levels, depth } = stackLevels(facts.points, (p) => x(p.cost) - mark / 2, mark, gap);
	const rugTop = padTop + plotH + axisH;
	const marks = facts.points.map((p) => ({
		...p,
		x: x(p.cost) - mark / 2,
		y: rugTop + levels.get(p.id) * (mark + gap),
		s: mark
	}));

	const { p25, p75 } = facts.band;
	const band =
		p25 != null && p75 != null
			? {
					x: x(p25),
					w: Math.max(2, x(p75) - x(p25)),
					// The label sits in the top-left corner and may run as far as p75, which is as
					// far as the top-paper line can stay out of the top quarter. Chasing the band
					// itself would put the words under the lines, or off the side of a phone.
					labelX: left + 4,
					labelW: Math.max(120, x(p75) - left - 4)
				}
			: null;

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
		ticks,
		band,
		topPath: facts.hasTop ? step((p) => p.topShare) : null,
		costPath: step((p) => p.costShare),
		marks,
		rugTop,
		height: rugTop + depth * (mark + gap) - gap
	};
}

const fix = (n) => Number(n.toFixed(1));
