import { PackagingError } from './invariants.mjs';
import { byText } from './util.mjs';

/** Match upstream analysis_population: greatest count, then casefolded title/name.
 * A union invents a different snapshot. Never merge conflicting histories.
 */
export function citationRepresentatives(sources, expectedCounts, options = {}) {
	const selected = new Map();
	for (const { name, records, citations } of sources) {
		for (const record of records) {
			const bibcode = record.bibcode;
			if (!expectedCounts.has(bibcode)) continue;
			const candidate = { name, count: record.citation_count, list: citations[bibcode] ?? [] };
			const prior = selected.get(bibcode);
			if (!prior || candidate.count > prior.count || (candidate.count === prior.count &&
				(byText(name.toLowerCase(), prior.name.toLowerCase()) || byText(name, prior.name)) > 0)) {
				selected.set(bibcode, candidate);
			}
		}
	}
	const errors = [];
	const lists = new Map();
	const gaps = [];
	for (const [bibcode, expected] of expectedCounts) {
		const source = selected.get(bibcode);
		// Only the citing years are counted downstream, so order is irrelevant; copy only to dedupe.
		const raw = source?.list ?? [];
		const distinct = new Set(raw);
		const list = distinct.size === raw.length ? raw : [...distinct];
		if (!source || source.count !== expected || list.length > expected || list.some((b) => !/^\d{4}/.test(b))) {
			errors.push(`${bibcode} (${source?.name ?? 'missing record'}): statistics=${expected}, record=${source?.count ?? 'missing'}, distinct dated citers=${list.length}`);
		} else {
			lists.set(bibcode, list);
			if (list.length < expected) gaps.push({ bibcode, mission: source.name, expected, observed: list.length, missing: expected - list.length });
		}
	}
	if (errors.length) throw new PackagingError(`Citation histories do not reconcile for ${errors.length} paper(s):\n  ${errors.join('\n  ')}\nRepair the upstream records/citation companions and re-export this dataset; no citation counts were adjusted.`);
	const expected = [...expectedCounts.values()].reduce((a, b) => a + b, 0);
	const missing = gaps.reduce((a, b) => a + b.missing, 0);
	const coverage = citationCoverage({ expected, observed: expected - missing, ...options });
	return { lists, coverage, gaps };
}

/** A small, source-declared shortfall remains visible; totals are never rewritten. */
export function citationCoverage({ expected, observed, historyStatus, limits = {} }) {
	if (![expected, observed].every((n) => Number.isSafeInteger(n) && n >= 0)) {
		throw new PackagingError(`Citation history requires nonnegative integer totals: expected=${expected}, observed=${observed}`);
	}
	const missing = expected - observed;
	if (missing === 0) return { status: 'complete', expected, observed, missing: 0 };
	if (missing < 0 || historyStatus !== 'incomplete_citation_histories' ||
		missing > (limits.maxMissing ?? 0) || missing / expected > (limits.maxMissingFraction ?? 0)) {
		throw new PackagingError(`Citation history: ${observed} dated edges vs ${expected} reported citations (${missing} missing); source status ${historyStatus ?? 'unknown'}. Outside the permitted small-gap limit. Repair upstream citation companions.`);
	}
	return { status: 'incomplete', expected, observed, missing };
}
