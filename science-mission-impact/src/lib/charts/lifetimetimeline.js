import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { lifetimeModel, xDomain } from './accumulation.js';

/** Keep annual observations and cumulative totals on the same recorded calendar years. */
export function timelineModel(series, mode = 'annual') {
	const life = lifetimeModel(series);
	if (!life) return null;
	const points = mode === 'cumulative' ? life.points : life.years.map((year, i) => ({
		year, pub: series.papers[i] ?? 0, cite: series.citations[i] ?? 0
	}));
	return {
		...life, points,
		solid: life.partialIndex < 0 ? points : points.slice(0, life.partialIndex),
		partial: life.partialIndex < 0 ? [] : points.slice(Math.max(0, life.partialIndex - 1))
	};
}

/** One plot, two count scales: publications on the left axis, citations on the right. */
export function timelineLayout(model, width, height = 300) {
	if (!model) return null;
	const left = width < 480 ? 42 : 52;
	const right = Math.max(left + 1, width - (width < 480 ? 46 : 56));
	const x = scaleLinear().domain(xDomain(model.years)).range([left, right]);
	const first = model.years[0], last = model.years.at(-1);
	const candidates = x.ticks(Math.max(2, Math.floor((right - left) / 90))).filter(Number.isInteger);
	const xTicks = [first];
	for (const year of candidates) {
		if (year > first && year < last && x(year) - x(xTicks.at(-1)) >= 52 && x(last) - x(year) >= 52) xTicks.push(year);
	}
	if (last !== first) xTicks.push(last);
	const top = 30, bottom = height - 40;
	const panels = [['pub', 'Tracked publications', 'left'], ['cite', 'Citations received', 'right']].map(([key, label, side]) => {
		const y = scaleLinear().domain([0, Math.max(1, ...model.points.map((p) => p[key]))]).nice(4).range([bottom, top]);
		const path = line().x((p) => x(p.year)).y((p) => y(p[key]));
		return { key, label, side, top, bottom, y, ticks: y.ticks(4).filter(Number.isInteger), solid: path(model.solid), partial: path(model.partial) };
	});
	return { left, right, x, xTicks, panels, height };
}
