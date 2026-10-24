import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { lifetimeModel } from './accumulation.js';

/** Annual publications and cumulative citations through the last completed recorded year. */
export function timelineModel(series) {
	if (!series?.years?.length) return null;
	const cutoff = Math.min(new Date().getFullYear(), series.partialFromYear ?? Infinity);
	const end = series.years.findIndex((year) => year >= cutoff);
	if (end >= 0) series = {
		...series,
		years: series.years.slice(0, end),
		papers: series.papers.slice(0, end),
		citations: series.citations.slice(0, end)
	};
	const life = lifetimeModel(series);
	if (!life) return null;
	return {
		...life,
		points: life.points.map((point, i) => ({ ...point, pub: series.papers[i] ?? 0 }))
	};
}

/** One plot, two count scales: publications on the left axis, citations on the right. */
export function timelineLayout(model, width, height = 300) {
	if (!model) return null;
	const left = width < 480 ? 42 : 52;
	const right = Math.max(left + 1, width - (width < 480 ? 46 : 56));
	const first = model.years[0], last = model.years.at(-1);
	const x = scaleLinear().domain([first - 0.5, last + 0.5]).range([left, right]);
	const barWidth = Math.min(32, (x(first + 1) - x(first)) * 0.8);
	const candidates = x.ticks(Math.max(2, Math.floor((right - left) / 90))).filter(Number.isInteger);
	const xTicks = [first];
	for (const year of candidates) {
		if (year > first && year < last && x(year) - x(xTicks.at(-1)) >= 52 && x(last) - x(year) >= 52) xTicks.push(year);
	}
	if (last !== first) xTicks.push(last);
	const top = 30, bottom = height - 40;
	const panels = [['pub', 'Publications per year', 'left'], ['cite', 'Cumulative citations', 'right']].map(([key, label, side]) => {
		const y = scaleLinear().domain([0, Math.max(1, ...model.points.map((p) => p[key]))]).nice(4).range([bottom, top]);
		const path = line().x((p) => x(p.year)).y((p) => y(p[key]));
		return { key, label, side, top, bottom, y, ticks: y.ticks(4).filter(Number.isInteger), path: key === 'cite' ? path(model.points) : null };
	});
	return { left, right, x, xTicks, barWidth, panels, height };
}
