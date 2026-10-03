/**
 * Series math for AccumulationPair.
 *
 * Both panels follow one rule: each series is cumulative, starts at zero, and its own axis
 * tops out at its own final total. The two lines therefore end at the same point in the
 * same final year and the chart reads as percent-of-final with two absolute scales — the gap
 * between the lines is how far citations trail publications.
 *
 * Nothing here touches the DOM, so it is all testable in node.
 */

import { scaleLinear } from 'd3-scale';

/** Gridline rows, as fractions of each axis maximum. Zero is the baseline rule. */
export const TICK_FRACTIONS = [0.25, 0.5, 0.75, 1];

/** Running totals of a per-period array. Non-numbers count as zero. */
export function cumulate(values) {
	const out = [];
	let sum = 0;
	for (const v of values ?? []) {
		const n = Number(v);
		sum += Number.isFinite(n) ? n : 0;
		out.push(sum);
	}
	return out;
}

const last = (a) => (a.length ? a[a.length - 1] : 0);

/**
 * LifetimeSeries -> cumulative points on a calendar-year axis.
 * `partialIndex` is the index of the first incomplete year, or -1.
 */
export function lifetimeModel(series) {
	const years = series?.years;
	if (!Array.isArray(years) || years.length === 0) return null;
	const pubs = cumulate(series.papers);
	const cites = cumulate(series.citations);
	const partialIndex = series.partialFromYear == null ? -1 : years.indexOf(series.partialFromYear);
	return {
		years,
		points: years.map((year, i) => ({ year, pub: pubs[i] ?? 0, cite: cites[i] ?? 0 })),
		pubTotal: last(pubs),
		citeTotal: last(cites),
		citationCoverage: series.citationCoverage ?? { status: 'complete', expected: last(cites), observed: last(cites), missing: 0 },
		partialIndex
	};
}

/**
 * WindowSeries -> one row per year since the start of science.
 *
 * Each row carries the running citation total, split into what was already there (`from`) and
 * what that year added (`to`), both as fractions of the final total, so a row draws as one bar
 * that visibly grows. Publications only accumulate while the window is open; after that the
 * row's `papers` is null, which the chart prints as nothing at all rather than a flat line.
 */
export function windowModel(series, policy) {
	if (!series) return null;
	const months = series.papersByMonth ?? [];
	const pubYears = Math.ceil(months.length / 12);
	const perYear = Array.from({ length: pubYears }, (_, k) => months.slice(k * 12, (k + 1) * 12).reduce((a, v) => a + (Number(v) || 0), 0));
	const cumPub = cumulate(perYear);
	const cumCite = cumulate(series.citationsByYearOffset);
	const pubTotal = last(cumPub);
	const citeTotal = last(cumCite);
	const frac = (v) => (citeTotal > 0 ? v / citeTotal : 0);
	const rows = cumCite.map((cite, k) => ({
		year: k + 1,
		papers: k < pubYears ? cumPub[k] : null,
		missions: series.missionsByYear?.[k] ?? null,
		cite,
		from: frac(k > 0 ? cumCite[k - 1] : 0),
		to: frac(cite)
	}));
	return { rows, pubYears, pubTotal, citeTotal };
}

/** X domain for a year axis; a single year would otherwise collapse the scale. */
export function xDomain(years) {
	const a = years[0];
	const b = years[years.length - 1];
	return a === b ? [a - 0.5, b + 0.5] : [a, b];
}

/**
 * An ISO date as a decimal calendar year, so a date can sit between two year ticks.
 * ADS writes unknown months and days as 00; those degrade to the start of what is known.
 */
export function decimalYear(iso) {
	if (!iso) return null;
	const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
	if (!Number.isFinite(y)) return null;
	if (!m) return y;
	const day = Number.isFinite(d) && d > 0 ? d : 1;
	const start = Date.UTC(y, 0, 1);
	return y + (Date.UTC(y, m - 1, day) - start) / (Date.UTC(y + 1, 0, 1) - start);
}

/** Only recorded dates become markers; an ongoing mission has no inferred end. */
export function missionMilestones(dates = {}) {
	return [['launch', 'launch'], ['primeEnd', 'prime end'], ['missionEnd', 'mission end']]
		.map(([key, label]) => ({ key, label, date: dates[key], year: decimalYear(dates[key]) }))
		.filter((m) => m.year != null)
		.sort((a, b) => a.year - b.year);
}

/** Include mission context without adding or extrapolating publication/citation observations. */
export function lifetimeDomain(years, milestones) {
	return xDomain([
		Math.min(years[0], ...milestones.map((m) => Math.floor(m.year))),
		Math.max(years.at(-1), ...milestones.map((m) => Math.ceil(m.year)))
	]);
}

/** Keep labels inside the plot and put nearby/coincident events on separate rows. */
export function layoutMilestones(milestones, x, { left, right, top }) {
	const rows = [];
	const markers = milestones.map((m) => {
		const px = x(m.year);
		const width = m.label.length * 7;
		const labelX = Math.max(left, Math.min(px + 6, right - width));
		let row = rows.findIndex((end) => labelX >= end + 10);
		if (row < 0) row = rows.length;
		rows[row] = labelX + width;
		return { ...m, x: px, labelX, labelY: top + 12 + row * 16 };
	});
	return { markers, height: rows.length ? rows.length * 16 + 8 : 0 };
}

/**
 * The two zero-based scales and the tick rows they share.
 * A zero total keeps a usable scale so the flat line still sits on the baseline.
 */
export function axes({ pubTotal, citeTotal, top, bottom }) {
	const yPub = scaleLinear().domain([0, Math.max(pubTotal, 1)]).range([bottom, top]);
	const yCite = scaleLinear().domain([0, Math.max(citeTotal, 1)]).range([bottom, top]);
	const rows = TICK_FRACTIONS.map((f) => ({
		f,
		y: bottom + (top - bottom) * f,
		pub: pubTotal * f,
		cite: citeTotal * f
	}));
	return { yPub, yCite, rows };
}

/**
 * Baselines for `count` labels stacked immediately above a shared anchor point, top one first.
 * Used for the end labels, which would otherwise print on top of each other: by the dual-axis
 * rule both series end at the same pixel.
 */
export function stackLabels(anchorY, count, { row = 18, gap = 6, minTop = 12 } = {}) {
	const first = anchorY - gap - row * (count - 1);
	const shift = Math.max(0, minTop - first);
	return Array.from({ length: count }, (_, i) => first + shift + i * row);
}

/** Plot box for a panel of the given pixel width. Margins leave room for both axes' ticks. */
export function box(width, height) {
	const narrow = width < 480;
	return {
		left: narrow ? 34 : 44,
		right: width - (narrow ? 40 : 52),
		top: 46,
		bottom: height - 28
	};
}
