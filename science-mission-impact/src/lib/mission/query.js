/**
 * Pure helpers behind QueryBlock: the reconciliation sentence and the one-string
 * form of the query that "Copy query" puts on the clipboard.
 *
 * Relative imports (not $lib) so `node --test` can run the tests without Vite.
 */

import { int, plural } from '../format.js';

/**
 * The adjustments between what ADS returned and what the site counts, in the
 * order the sentence reads them. Zero terms are skipped entirely.
 */
const ADJUSTMENTS = [
	['curatedOut', (n) => `curated out ${int(n)}`],
	['libraryOut', (n) => `excluded instrument and overview papers ${int(n)}`],
	['otherOut', (n) => `other filters ${int(n)}`],
	['duplicates', (n) => `duplicates ${int(n)}`],
	['curatedIn', (n) => `curated in ${int(n)}`]
];

const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const sentenceCase = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/**
 * Whether a reconciliation object says anything at all. Missions that were never
 * queried still carry one, with every field zero; there is nothing to print for those.
 *
 * @param {import('../data/types.d.ts').Mission['query']['reconciliation']} r
 */
export function hasReconciliation(r) {
	if (!r || typeof r !== 'object') return false;
	return ['adsReturned', 'curatedOut', 'curatedIn', 'libraryOut', 'otherOut', 'duplicates', 'final'].some((key) => count(r[key]) !== 0);
}

/**
 * "ADS returns 3,388. Curated out 22, excluded instrument and overview papers 5,
 *  other filters 1, duplicates 3, curated in 36: 3,399 publications."
 *
 * With no adjustments at all the middle clause disappears, and a count of one
 * reads "publication". Returns null when there is nothing to reconcile.
 *
 * @param {import('../data/types.d.ts').Mission['query']['reconciliation']} r
 * @returns {string | null}
 */
export function reconciliationSentence(r) {
	if (!r || typeof r !== 'object') return null;
	const ads = count(r.adsReturned);
	const final = count(r.final);
	const publications = `${int(final)} tracked ${plural(final, 'publication')}`;

	const parts = [];
	for (const [key, phrase] of ADJUSTMENTS) {
		const n = count(r[key]);
		if (n !== 0) parts.push(phrase(n));
	}

	if (parts.length === 0) {
		// Nothing was added or removed: one clause says it all.
		return ads === final ? `ADS returns ${publications}.` : `ADS returns ${int(ads)}: ${publications}.`;
	}
	const adjustments = sentenceCase(parts.join(', '));
	// A mission with no query has nothing for ADS to have returned; the lead would say nothing.
	if (ads === 0) return `${adjustments}: ${publications}.`;
	return `ADS returns ${int(ads)}. ${adjustments}: ${publications}.`;
}

/**
 * The query as one string, the way it was before the packager split off the
 * standard filter tail — what "Copy query" copies and what SciX would run.
 *
 * @param {import('../data/types.d.ts').Mission['query'] | null} query
 * @returns {string}
 */
export function fullQuery(query) {
	if (!query || typeof query !== 'object') return '';
	const arms = typeof query.arms === 'string' ? query.arms.trim() : '';
	const filters = typeof query.filters === 'string' ? query.filters.trim() : '';
	if (arms && filters) return `${arms} AND ${filters}`;
	return arms || filters || '';
}
