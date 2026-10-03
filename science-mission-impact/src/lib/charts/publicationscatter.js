import { scaleSqrt } from 'd3-scale';
import { int } from '../format.js';

const count = (n) => Number.isFinite(n) && n >= 0;
const credit = (n) => n.toLocaleString('en-US', { maximumFractionDigits: n > 0 && n < 0.1 ? 3 : 1 });

/** Keep the dashboard's apportioned top-paper credit; it is not an unshared paper count. */
export function publicationModel(missions, scope) {
	const rows = [];
	const unavailable = [];
	for (const mission of missions) {
		const s = mission[scope];
		if (!s || !['measured', 'assumed_zero'].includes(s.outputBasis) ||
			(s.status && s.status !== 'available') || !count(s.papers) || !count(s.top10) ||
			(s.papers === 0 && s.top10 !== 0)) {
			unavailable.push(mission.name);
			continue;
		}
		const rate = s.papers > 0 ? s.top10 / s.papers : null;
		const label = `${mission.name}\n${int(s.papers)} tracked publications · ${credit(s.top10)} top-10% paper credit` +
			(rate === null ? '' : `\n${credit(rate * 100)} credits per 100 tracked publications`) +
			(s.outputBasis === 'assumed_zero' ? '\nAssumed zero output' : '') +
			(mission.failed ? '\nMission failed' : '');
		rows.push({ ...mission, papers: s.papers, top10: s.top10, outputBasis: s.outputBasis, rate, label });
	}
	// A paper-weighted rate, not an average of mission percentages or the nominal 10% cutoff.
	const measured = rows.filter((r) => r.outputBasis === 'measured');
	const papers = measured.reduce((sum, r) => sum + r.papers, 0);
	const top10 = measured.reduce((sum, r) => sum + r.top10, 0);
	return {
		points: rows.filter((r) => r.papers > 0),
		zeros: rows.filter((r) => r.papers === 0),
		unavailable,
		rate: papers > 0 ? top10 / papers : null,
		rateLabel: papers > 0 ? `${credit(top10 / papers * 100)} credits per 100 tracked publications` : null
	};
}

/** Equal square-root transforms preserve a constant credit/publication ratio as a straight line. */
export function publicationLayout(model, width, height = 300) {
	const left = 46, right = Math.max(left + 20, width - 20), top = 20, bottom = height - 44;
	const x = scaleSqrt().domain([0, Math.max(1, ...model.points.map((p) => p.papers)) * 1.1]).nice(3).range([left, right]);
	const y = scaleSqrt().domain([0, Math.max(0.1, ...model.points.map((p) => p.top10)) * 1.1]).nice(3).range([bottom, top]);
	const size = width < 400 ? 5 : 8;
	const item = (p, px, py) => ({ x: px - size / 2, y: py - size / 2, s: size, variant: p.failed ? 'failure' : 'reached', label: p.label });
	const items = new Map(model.points.map((p) => [p.id, item(p, x(p.papers), y(p.top10))]));
	const columns = Math.max(1, Math.floor((width - 16) / (size + 8)));
	const zeroItems = new Map(model.zeros.map((p, i) => [p.id, item(p, 8 + size / 2 + (i % columns) * (size + 8), size / 2 + Math.floor(i / columns) * (size + 8))]));
	const end = model.rate > 0 ? Math.min(x.domain()[1], y.domain()[1] / model.rate) : x.domain()[1];
	return {
		x, y, left, right, top, bottom, items, zeroItems,
		xTicks: x.ticks(3).filter(Number.isInteger), yTicks: y.ticks(3),
		zeroHeight: Math.ceil(model.zeros.length / columns) * (size + 8),
		reference: model.rate === null ? null : { x: x(end), y: y(end * model.rate) }
	};
}
