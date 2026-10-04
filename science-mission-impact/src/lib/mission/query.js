/**
 * Pure helpers behind QueryBlock and the mission page: whether a reconciliation says
 * anything, and the one-string form of the query that "Copy query" puts on the clipboard.
 *
 * Relative imports (not $lib) so `node --test` can run the tests without Vite.
 */

const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

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
