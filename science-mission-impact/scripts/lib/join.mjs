/**
 * The only join table in the pipeline: raw index.json maps `short_title`
 * (which every stats file keys by) to `mission_id` (which every output keys
 * by). Nothing downstream of the packager sees a short_title as a key.
 */

/**
 * Build short_title -> index entry, throwing on a duplicate title because the
 * join would then be ambiguous.
 *
 * A bare array is accepted as well as `{ missions: [...] }`: older raw dists
 * wrote index.json as a top-level list.
 */
export function buildTitleIndex(indexJson) {
	const missions = Array.isArray(indexJson) ? indexJson : indexJson?.missions;
	if (!Array.isArray(missions)) {
		throw new Error('index.json: expected a "missions" array');
	}
	const byTitle = new Map();
	for (const entry of missions) {
		if (typeof entry?.short_title !== 'string' || typeof entry?.mission_id !== 'string') {
			throw new Error(
				`index.json: entry without short_title/mission_id: ${JSON.stringify(entry).slice(0, 200)}`
			);
		}
		if (byTitle.has(entry.short_title)) {
			throw new Error(
				`index.json: short_title "${entry.short_title}" maps to both ` +
					`"${byTitle.get(entry.short_title).mission_id}" and "${entry.mission_id}"; ` +
					'the stats join would be ambiguous'
			);
		}
		byTitle.set(entry.short_title, entry);
	}
	return byTitle;
}

/**
 * Resolve every mission of one stats run through the index.
 * Returns `[{ shortTitle, id, indexEntry, statsMission }]` in run order.
 * Throws naming the run and the title when a stats short_title does not resolve.
 */
export function resolveRunMissions(runLabel, statsMissions, byTitle) {
	return statsMissions.map((statsMission) => {
		const shortTitle = statsMission?.short_title;
		const indexEntry = byTitle.get(shortTitle);
		if (!indexEntry) {
			throw new Error(
				`stats run "${runLabel}": short_title "${shortTitle}" does not resolve through index.json`
			);
		}
		return { shortTitle, id: indexEntry.mission_id, indexEntry, statsMission };
	});
}
