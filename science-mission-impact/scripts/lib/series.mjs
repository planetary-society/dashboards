/**
 * Accumulation series: publications per calendar year, citations by citing
 * year, and the two window series (papers per month since science start,
 * citations by calendar-year offset).
 *
 * Citing-bibcode lists are read here and never leave: only yearly aggregates
 * are returned.
 */

import { parseYearMonth } from './util.mjs';

/**
 * Fold a year -> count map so that nothing sits past the as-of year (the
 * as-of year is the only partial year in the data).
 */
export function foldYears(counts, asOfYear) {
	const out = new Map();
	for (const [rawYear, count] of counts) {
		const year = Number(rawYear);
		if (!Number.isFinite(year)) continue;
		const bucket = year > asOfYear ? asOfYear : year;
		out.set(bucket, (out.get(bucket) ?? 0) + count);
	}
	return out;
}

/**
 * Turn `publications_by_year` (missions: `[{year,total,refereed}]`) or
 * `papers_by_year` (divisions: `{ "1990": 3, ... }`) into a year -> count Map.
 */
export function papersByYearMap(source) {
	const out = new Map();
	if (Array.isArray(source)) {
		for (const row of source) {
			const year = Number(row?.year);
			if (!Number.isFinite(year)) continue;
			const count = Number(row?.total ?? row?.refereed ?? 0);
			if (!Number.isFinite(count)) continue;
			out.set(year, (out.get(year) ?? 0) + count);
		}
	} else if (source && typeof source === 'object') {
		for (const [key, value] of Object.entries(source)) {
			const year = Number(key);
			const count = Number(value);
			if (!Number.isFinite(year) || !Number.isFinite(count)) continue;
			out.set(year, (out.get(year) ?? 0) + count);
		}
	}
	return out;
}

/**
 * Add one mission's citing years into every sink, in a single pass over the
 * citation map. A mission's citation list is the largest object the packager
 * reads, and it feeds two accumulators at once (the mission's own series and
 * its division's de-duplicated one), so it is walked once rather than twice.
 *
 * @param {object} args
 * @param {Record<string,string[]>} args.citations cited bibcode -> citing bibcodes
 * @param {Map<string, number|null>} args.paperYears the bibcodes that count, and
 *   the publication year of each; a cited bibcode outside this map is skipped,
 *   which is how "restricted to the bibcodes in the stats papers.json" is applied
 * @param {number} args.asOfYear years beyond this fold into it
 * @param {{into: Map<number, number>, seen?: Set<string>}[]} args.sinks one entry
 *   per accumulator. `seen` holds the cited bibcodes that sink has already
 *   counted; pass one Set across a division's missions so a shared paper is
 *   counted once. A sink without one counts every cited paper it is given.
 * @param {Map<string, string[]>} [args.overrides] rebuilt citing lists, used
 *   in place of this mission's own copy
 * @returns {number[]} citation edges counted into each sink, in `sinks` order
 */
export function accumulateCitationYears({ citations, paperYears, asOfYear, sinks, overrides }) {
	const edges = new Array(sinks.length).fill(0);
	if (!citations || typeof citations !== 'object') return edges;
	const wanted = [];
	for (const cited in citations) {
		if (!paperYears.has(cited)) continue;
		// Claim the paper for each sink first: a cited bibcode whose citing value
		// is unusable is still spent, exactly as when each sink had its own pass.
		wanted.length = 0;
		for (let i = 0; i < sinks.length; i += 1) {
			const { seen } = sinks[i];
			if (seen) {
				if (seen.has(cited)) continue;
				seen.add(cited);
			}
			wanted.push(i);
		}
		if (wanted.length === 0) continue;
		const citing = overrides?.get(cited) ?? citations[cited];
		if (!Array.isArray(citing)) continue;
		const paperYear = paperYears.get(cited);
		for (const bibcode of citing) {
			if (typeof bibcode !== 'string' || bibcode.length < 4) continue;
			let year = Number.parseInt(bibcode.slice(0, 4), 10);
			if (!Number.isFinite(year)) continue;
			// A citing paper cannot predate the paper it cites; ADS bibcode years
			// occasionally say otherwise (preprint vs journal year), so clamp up.
			if (paperYear !== null && paperYear !== undefined && year < paperYear) year = paperYear;
			if (year > asOfYear) year = asOfYear;
			for (const i of wanted) {
				const { into } = sinks[i];
				into.set(year, (into.get(year) ?? 0) + 1);
				edges[i] += 1;
			}
		}
	}
	return edges;
}

/**
 * Assemble a LifetimeSeries over a single year axis running from the first
 * year with data to the as-of year. Returns null when there is no data at all.
 */
export function buildLifetimeSeries({ papers, citations, asOfYear }) {
	const foldedPapers = foldYears(papers, asOfYear);
	const foldedCitations = foldYears(citations, asOfYear);
	const allYears = [...foldedPapers.keys(), ...foldedCitations.keys()];
	if (allYears.length === 0) return null;
	const firstYear = Math.min(...allYears);
	const lastYear = Math.max(asOfYear, ...allYears);
	const years = [];
	const papersOut = [];
	const citationsOut = [];
	for (let year = firstYear; year <= lastYear; year += 1) {
		years.push(year);
		papersOut.push(foldedPapers.get(year) ?? 0);
		citationsOut.push(foldedCitations.get(year) ?? 0);
	}
	return {
		years,
		papers: papersOut,
		citations: citationsOut,
		partialFromYear: asOfYear >= firstYear && asOfYear <= lastYear ? asOfYear : null
	};
}

/**
 * Month offset of a publication date from the window's science start, by plain
 * calendar months (the raw dates are month-precision, so day arithmetic would
 * invent precision the data does not have). Null when either date is unusable.
 */
export function monthOffset(dateValue, startDate) {
	const date = parseYearMonth(dateValue);
	const start = parseYearMonth(startDate);
	if (!date || !start) return null;
	return (date.y - start.y) * 12 + (date.m - start.m);
}

/**
 * Papers per month since science start, length `months`. Records outside the
 * range are clamped into the first/last bucket (the window's edges are
 * day-precise while the dates are not).
 */
export function papersByMonth(records, startDate, months) {
	const out = new Array(months).fill(0);
	if (!Array.isArray(records) || months <= 0) return out;
	for (const record of records) {
		const offset = monthOffset(record?.date ?? record?.pubdate, startDate);
		if (offset === null) continue;
		const index = Math.min(months - 1, Math.max(0, offset));
		out[index] += 1;
	}
	return out;
}

/**
 * Citations per calendar-year offset from the science-start year, length
 * `buckets`. Offsets outside the range are clamped.
 */
export function citationsByYearOffset(windowCitations, startYear, buckets) {
	const out = new Array(buckets).fill(0);
	if (!windowCitations || typeof windowCitations !== 'object' || buckets <= 0) return out;
	if (!Number.isFinite(startYear)) return out;
	for (const citing of Object.values(windowCitations)) {
		if (!Array.isArray(citing)) continue;
		for (const bibcode of citing) {
			if (typeof bibcode !== 'string' || bibcode.length < 4) continue;
			const year = Number.parseInt(bibcode.slice(0, 4), 10);
			if (!Number.isFinite(year)) continue;
			const index = Math.min(buckets - 1, Math.max(0, year - startYear));
			out[index] += 1;
		}
	}
	return out;
}

/**
 * Papers per year since science start for the mission-list strip: index 0 is
 * the science-start year, capped at `cap` entries and at the as-of year.
 */
export function buildStrip({ papersByYear, startYear, asOfYear, cap }) {
	if (!Number.isFinite(startYear)) return [];
	const folded = foldYears(papersByYear, asOfYear);
	const length = Math.min(cap, Math.max(0, asOfYear - startYear + 1));
	const out = new Array(length).fill(0);
	for (const [year, count] of folded) {
		const index = year - startYear;
		if (index < 0 || index >= length) continue;
		out[index] += count;
	}
	return out;
}
