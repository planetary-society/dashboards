/**
 * The "ADS returns N, minus curated out, plus curated in = final" line on a
 * mission page, derived from `corpus.merge_stats`.
 *
 * The upstream merge (science-mission-citations,
 * `data/bibcode_manager.py::CanonicalPublicationSet`) builds the corpus as:
 *
 *   merged   = ads_count (distinct ADS bibcodes) + include_count (curation
 *              "includes" source) - duplicates_removed (present in both)
 *   filtered = merged - curation_exclusions_removed - library_exclusions_removed
 *              - news_venue_exclusions_removed - doctype_exclusions_removed
 *              - same_paper_duplicates_removed
 *
 * so the identity the site prints is
 *
 *   adsReturned - curatedOut - libraryOut - otherOut - duplicates + curatedIn = final
 * where duplicates includes both overlapping bibcodes and same-paper aliases.
 *
 * `ads_count` is already ADS-side deduplicated (`ads_raw_count` is the count
 * before ADS pagination duplicates were dropped), which is why it, not
 * `ads_raw_count`, is the number shown.
 */

const int = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/**
 * Build the reconciliation object for one mission.
 *
 * Returns `{ reconciliation, balanced }`. `reconciliation` is null only when
 * the mission has no merge_stats at all; otherwise it is always a best-effort
 * object and `balanced` says whether the identity closed.
 */
export function buildReconciliation(mergeStats, recordCount) {
	if (!mergeStats || typeof mergeStats !== 'object') {
		return { reconciliation: null, balanced: true };
	}
	const reconciliation = {
		adsReturned: int(mergeStats.ads_count),
		curatedOut: int(mergeStats.curation_exclusions_removed),
		curatedIn: int(mergeStats.include_count),
		libraryOut: int(mergeStats.library_exclusions_removed),
		otherOut: int(mergeStats.news_venue_exclusions_removed) + int(mergeStats.doctype_exclusions_removed),
		duplicates: int(mergeStats.duplicates_removed) + int(mergeStats.same_paper_duplicates_removed),
		final: Number.isFinite(Number(recordCount)) ? Number(recordCount) : int(mergeStats.filtered_count)
	};
	const left =
		reconciliation.adsReturned -
		reconciliation.curatedOut -
		reconciliation.libraryOut -
		reconciliation.otherOut -
		reconciliation.duplicates +
		reconciliation.curatedIn;
	return { reconciliation, balanced: left === reconciliation.final };
}
