// Running totals of a LifetimeSeries, which lifetimetimeline.js reads for its citation line and
// data.test.mjs checks against the source totals. No DOM, so it is testable in node.

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
