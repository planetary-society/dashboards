/**
 * The per-mission paper table published to static/data/papers/<id>.json.
 *
 * Columnar (one array per column, equal lengths), sorted by lifetime citations
 * descending with the bibcode as a deterministic tie-break.
 */

import { weight } from './util.mjs';

/**
 * Top-1% tie weight of a single paper against the division's pooled window
 * cutoff: above the cutoff scores 1, exactly at it scores the cutoff's tie
 * weight, below it scores 0. (The weight is per paper and undivided; a
 * mission's credit divides it by the number of missions sharing the paper.)
 */
export function top1Weight(windowCitations, cutoff) {
	if (!cutoff || windowCitations === null || windowCitations === undefined) return null;
	const citations = Number(windowCitations);
	const threshold = Number(cutoff.cutoff_citations);
	if (!Number.isFinite(citations) || !Number.isFinite(threshold)) return null;
	if (citations > threshold) return 1;
	if (citations === threshold) {
		const tie = Number(cutoff.tie_weight_at_cutoff);
		return Number.isFinite(tie) ? tie : 0;
	}
	return 0;
}

/** Sort key: most cited first, then bibcode, so the order never wobbles. */
function comparePapers(a, b) {
	const ca = Number(a.citations ?? 0);
	const cb = Number(b.citations ?? 0);
	if (cb !== ca) return cb - ca;
	return a.bibcode < b.bibcode ? -1 : a.bibcode > b.bibcode ? 1 : 0;
}

/**
 * Build the PapersFile for one mission.
 *
 * @param {object} args
 * @param {string} args.id mission id
 * @param {string} args.asOf run as-of date
 * @param {object[]} args.lifetimeRows rows of stats papers.json for this mission
 * @param {Map<string, object>} args.windowRows bibcode -> row of papers.window.json
 * @param {Map<string, object>} [args.fullRows] bibcode -> row of papers.full_mission.json,
 *   whose `window_*` values are the full-mission scope's
 * @param {Set<string>} args.curatedBibcodes bibcodes the query did not return
 * @param {object|null} args.top1Cutoff pooled_cutoffs.weights["1"] of the window scope
 * @param {object|null} [args.fullTop1Cutoff] the same for the full-mission scope
 */
export function buildPapersFile({ id, asOf, lifetimeRows, windowRows, fullRows = new Map(), curatedBibcodes, top1Cutoff, fullTop1Cutoff = null }) {
	const rows = [...lifetimeRows].sort(comparePapers);
	const columns = { b: [], y: [], t: [], a: [], c: [], s: [], e: [], f: [], fe: [], f1: [], w: [], we: [], w1: [], i: [] };
	for (const row of rows) {
		const windowRow = windowRows.get(row.bibcode) ?? null;
		const fullRow = fullRows.get(row.bibcode) ?? null;
		columns.b.push(row.bibcode);
		columns.y.push(row.year ?? null);
		columns.t.push(row.title ?? null);
		columns.a.push(row.first_author ?? null);
		columns.c.push(Number(row.citations ?? 0));
		columns.s.push(Number(row.shared_by ?? 1));
		columns.e.push(weight(row.cohort_top10_weight));
		columns.f.push(fullRow ? Number(fullRow.window_citations ?? 0) : null);
		columns.fe.push(fullRow ? weight(fullRow.window_cohort_top10_weight) : null);
		columns.f1.push(fullRow ? weight(top1Weight(fullRow.window_citations, fullTop1Cutoff)) : null);
		columns.w.push(windowRow ? Number(windowRow.window_citations ?? 0) : null);
		columns.we.push(windowRow ? weight(windowRow.window_cohort_top10_weight) : null);
		columns.w1.push(windowRow ? weight(top1Weight(windowRow.window_citations, top1Cutoff)) : null);
		columns.i.push(curatedBibcodes.has(row.bibcode) ? 1 : 0);
	}
	return { id, asOf, rows: rows.length, columns };
}

/** Throw unless every column of a PapersFile has the same length. */
export function assertColumnLengths(papersFile) {
	const entries = Object.entries(papersFile.columns);
	for (const [name, values] of entries) {
		if (values.length !== papersFile.rows) {
			throw new Error(
				`papers/${papersFile.id}.json: column "${name}" has ${values.length} values ` +
					`but the file declares ${papersFile.rows} rows`
			);
		}
	}
}

/**
 * A division's most cited papers in one scope, each paper once. A shared paper
 * takes its highest count among the missions sharing it (the upstream
 * representative rule) and lists those missions, highest count first, then by
 * name. Ties break on bibcode, as the division's most cited paper does.
 *
 * @param {object[]} rows a stats papers table (lifetime, window or full-mission)
 * @param {string} key the citation column: 'citations', or 'window_citations' for a window
 * @param {number} limit how many papers to keep
 * @returns {{ bibcode: string, title: string|null, firstAuthor: string|null, year: number|null, citations: number, missions: string[] }[]}
 */
export function topPapers(rows, key, limit) {
	const byBibcode = new Map();
	for (const row of rows) {
		const citations = Number(row[key] ?? 0);
		const entry = byBibcode.get(row.bibcode) ?? { row, citations, shares: [] };
		entry.shares.push({ mission: row.mission, citations });
		if (citations > entry.citations) Object.assign(entry, { row, citations });
		byBibcode.set(row.bibcode, entry);
	}
	return [...byBibcode.values()]
		.map(({ row, citations, shares }) => ({ bibcode: row.bibcode, citations, row, shares }))
		.sort(comparePapers)
		.slice(0, limit)
		.map(({ bibcode, citations, row, shares }) => ({
			bibcode,
			title: row.title ?? null,
			firstAuthor: row.first_author ?? null,
			year: row.year == null ? null : Number(row.year),
			citations,
			missions: shares
				.sort((a, b) => b.citations - a.citations || (a.mission < b.mission ? -1 : a.mission > b.mission ? 1 : 0))
				.map((s) => s.mission)
		}));
}
