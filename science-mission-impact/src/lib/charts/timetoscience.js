import { scaleLinear, scaleLog } from 'd3-scale';
import { decadeTicks, minorDollarTicks } from './costaxis.js';
import { money, longDate } from '../format.js';

/** Publication timing, not the date the paper crossed the citation threshold. */
export function timeScienceModel(missions, scope) {
	const points = [], excluded = new Map();
	for (const m of missions) {
		const first = m[scope]?.first;
		let reason;
		if (!(Number.isFinite(m.cost) && m.cost > 0)) reason = 'Missing or nonpositive cost';
		else if (first?.state === 'reached') {
			if (!Number.isFinite(first.yearsFromScienceStart)) reason = 'Timing unavailable';
		} else reason = ({ none: 'No top-10% paper observed', no_papers: 'No tracked publications', failure: 'Mission failed without an observed milestone' })[first?.state] ?? 'Output unavailable';
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
	const s = compact ? 5 : 8;
	const items = new Map(points.map((p) => [p.id, { x: x(p.months) - s / 2, y: y(p.cost) - s / 2, s, variant: 'reached', label: p.label }]));
	return { x, y, left, right, top, bottom, items, xTicks: x.ticks(compact ? 4 : 7), yTicks: decadeTicks(lo, hi), minorTicks: minorDollarTicks(lo, hi) };
}
