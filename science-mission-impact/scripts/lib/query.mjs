/**
 * Splitting an ADS `source_query` into the mission-specific arms and the
 * standard filter tail that every mission shares.
 */

const MARKER = ' AND property:refereed';

/**
 * Find the first occurrence of ` AND property:refereed` that sits at the top
 * level of the query -- outside every parenthesis and outside quoted phrases.
 * Returns the index of the leading space, or -1.
 */
function findTopLevelMarker(query) {
	let depth = 0;
	let inQuotes = false;
	for (let i = 0; i < query.length; i += 1) {
		const ch = query[i];
		if (ch === '"') {
			inQuotes = !inQuotes;
			continue;
		}
		if (inQuotes) continue;
		if (ch === '(') depth += 1;
		else if (ch === ')') depth = Math.max(0, depth - 1);
		else if (depth === 0 && ch === ' ' && query.startsWith(MARKER, i)) return i;
	}
	return -1;
}

/**
 * Split a source query.
 *
 * `arms` is the mission-specific part, `filters` the standard tail beginning at
 * `property:refereed` (the connecting " AND " is dropped, so the two parts
 * render as separate blocks). When the marker is absent the whole query is
 * treated as arms and `filters` is null. A missing query gives two nulls.
 */
export function splitQuery(sourceQuery) {
	if (typeof sourceQuery !== 'string' || sourceQuery.trim() === '') {
		return { arms: null, filters: null };
	}
	const query = sourceQuery.trim();
	const at = findTopLevelMarker(query);
	if (at === -1) return { arms: query, filters: null };
	const arms = query.slice(0, at).trim();
	const filters = query.slice(at + ' AND '.length).trim();
	return { arms: arms === '' ? null : arms, filters: filters === '' ? null : filters };
}
