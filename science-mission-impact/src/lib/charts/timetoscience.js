import { scaleLinear, scaleLog } from 'd3-scale';
import { decadeTicks, minorDollarTicks } from './costaxis.js';
import { money, longDate } from '../format.js';

/**
 * Publication timing, not the date the paper crossed the citation threshold. firstOf reads a
 * mission's first top-10% paper: a division row keeps it under its scope, a story tile under `first`.
 */
export function timeScienceModel(missions, scope, firstOf = (m) => m[scope]?.first) {
	const points = [], excluded = new Map();
	for (const m of missions) {
		const first = firstOf(m);
		let reason;
		// Short reasons: they print in one visible line under the plot, never behind a disclosure.
		if (!(Number.isFinite(m.cost) && m.cost > 0)) reason = 'no cost on record';
		else if (first?.state === 'reached') {
			if (!Number.isFinite(first.yearsFromScienceStart)) reason = 'timing unavailable';
		} else reason = ({ none: 'no top-10% paper yet', no_papers: 'no tracked publications', failure: 'failed' })[first?.state] ?? 'not measured';
		if (reason) {
			if (!excluded.has(reason)) excluded.set(reason, []);
			excluded.get(reason).push(m.name);
			continue;
		}
		const months = first.yearsFromScienceStart * 12;
		const timing = `${Math.abs(months).toLocaleString('en-US', { maximumFractionDigits: 1 })} months ${months < 0 ? 'before' : 'after'} science start`;
		points.push({ ...m, months, label: `${m.name}\n${money(m.cost)} · ${timing}\nFirst top-10% paper${first.date ? `: ${longDate(first.date)}` : ''}` });
	}
	return { points, excluded };
}

/** D3 reference layout: elapsed time across, logarithmic mission cost up. */
export function timeScienceLayout(points, width, height) {
	const compact = width < 600;
	const left = 64, right = Math.max(left + 20, width - 24), top = 18, bottom = height - 54;
	const months = points.map((p) => p.months), costs = points.map((p) => p.cost);
	const x = scaleLinear().domain([Math.min(0, ...months) * 1.1, Math.max(1, ...months) * 1.1]).nice(compact ? 4 : 7).range([left, right]);
	const lo = costs.length ? Math.min(...costs) / 1.5 : 1;
	const hi = costs.length ? Math.max(Math.max(...costs) * 1.5, lo * 10) : 10;
	const y = scaleLog().domain([lo, hi]).range([bottom, top]);
	const s = compact ? 7 : 10;
	const items = new Map(points.map((p) => [p.id, { x: x(p.months) - s / 2, y: y(p.cost) - s / 2, s, variant: 'reached', label: p.label }]));
	return { x, y, left, right, top, bottom, items, fit: fitSegment(timeFit(points), x, y), xTicks: x.ticks(compact ? 4 : 7), yTicks: decadeTicks(lo, hi), minorTicks: minorDollarTicks(lo, hi) };
}

/**
 * Least squares of months on log10(cost): cost is the given, time the outcome. Null below
 * three missions or when every cost is the same, so a line is never drawn through nothing.
 */
export function timeFit(points) {
	if (points.length < 3) return null;
	const xs = points.map((p) => Math.log10(p.cost)), ys = points.map((p) => p.months);
	const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
	let sxx = 0, sxy = 0;
	for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
	if (sxx < 1e-12) return null;
	const slope = sxy / sxx;
	return { slope, intercept: my - slope * mx, n: points.length };
}

/** The fit as a pixel segment across the plot's cost range, clipped to its time range. */
export function fitSegment(fit, x, y) {
	if (!fit) return null;
	const [lo, hi] = y.domain(), [t0, t1] = x.domain();
	const months = (cost) => fit.intercept + fit.slope * Math.log10(cost);
	const cost = (m) => 10 ** ((m - fit.intercept) / fit.slope);
	// Walk the two cost ends in; where the line leaves the time range, stop it at the edge.
	const tMin = Math.min(t0, t1), tMax = Math.max(t0, t1);
	const ends = [lo, hi].map((c) => {
		const m = months(c), edge = Math.min(tMax, Math.max(tMin, m));
		return edge === m ? [c, m] : [cost(edge), edge];
	});
	if (ends.some(([c]) => !(c >= lo && c <= hi))) return null; // the line misses the plot entirely
	const [[c1, m1], [c2, m2]] = ends;
	return { x1: x(m1), y1: y(c1), x2: x(m2), y2: y(c2) };
}
