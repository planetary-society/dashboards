/**
 * Self-consistency guards. Every check compares the packaged output against
 * the raw data's own statement of the same fact -- no number is pinned here,
 * so a legitimate data refresh never trips one.
 *
 * Each `assert*` throws with a message naming the offending division/mission.
 * `Warnings` are collected, not thrown.
 */

import { num } from './util.mjs';

export class PackagingError extends Error {
	constructor(message) {
		super(message);
		this.name = 'PackagingError';
	}
}

const fail = (message) => {
	throw new PackagingError(message);
};

/** Fail on an unexpected schema_version in any raw file. */
export function assertSchemaVersion(label, actual, expected) {
	if (Number(actual) !== Number(expected)) {
		fail(`${label}: unknown schema_version ${JSON.stringify(actual)} (expected ${expected})`);
	}
}

/** Every configured run must share one as-of date, or the site would mix snapshots. */
export function assertSingleAsOfDate(runs) {
	const dates = new Map();
	for (const { label, asOfDate } of runs) {
		if (!asOfDate) fail(`stats run "${label}": run.as_of_date is missing`);
		if (!dates.has(asOfDate)) dates.set(asOfDate, []);
		dates.get(asOfDate).push(label);
	}
	if (dates.size !== 1) {
		const detail = [...dates.entries()]
			.map(([date, labels]) => `${date} (${labels.join(', ')})`)
			.sort()
			.join(' vs ');
		fail(`stats runs disagree on as_of_date: ${detail}`);
	}
	return [...dates.keys()][0];
}

/** Packaged division totals must equal that run's own summary. */
export function assertDivisionTotals({ slug, packagedPapers, packagedCitations, summary }) {
	const expectedPapers = num(summary?.papers);
	const expectedCitations = num(summary?.citations_total);
	if (packagedPapers !== expectedPapers) {
		fail(
			`division "${slug}": packaged distinct papers ${packagedPapers} ` +
				`does not equal the run's summary.papers ${expectedPapers}`
		);
	}
	if (packagedCitations !== expectedCitations) {
		fail(
			`division "${slug}": packaged citations ${packagedCitations} ` +
				`does not equal the run's summary.citations_total ${expectedCitations}`
		);
	}
}

/** A mission's rows in papers.json must equal its declared lifetime_papers. */
export function assertMissionPaperRows({ id, shortTitle, rows, lifetimePapers }) {
	const expected = num(lifetimePapers);
	// A null lifetime_papers means "unavailable", which must come with no rows.
	if (expected === null) {
		if (rows !== 0) {
			fail(
				`mission "${id}" (${shortTitle}): lifetime_papers is null (unavailable) ` +
					`but papers.json holds ${rows} rows`
			);
		}
		return;
	}
	if (rows !== expected) {
		fail(
			`mission "${id}" (${shortTitle}): papers.json holds ${rows} rows ` +
				`but lifetime_papers is ${expected}`
		);
	}
}

/** Collects non-fatal findings for the end-of-run summary. */
export class Warnings {
	constructor() {
		this.items = [];
	}

	add(message) {
		this.items.push(message);
	}

	get length() {
		return this.items.length;
	}
}

/**
 * The citation edge sum and `citations_total` are two independent counts of the
 * same thing: ADS reports a citation_count per paper, and the citing-bibcode
 * lists are the edges behind it. They reconcile exactly, so this reports the
 * (expected zero) difference for the refresh report.
 */
export function citationGap({ edges, citationsTotal }) {
	const total = num(citationsTotal);
	if (total === null || total === 0) return { edges, citationsTotal: total, relative: null };
	return { edges, citationsTotal: total, relative: (edges - total) / total };
}
