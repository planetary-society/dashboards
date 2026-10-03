/**
 * The whole-site documents: generated/site.json and generated/scrolly.json,
 * plus the one ordering every mission list uses.
 *
 * Pure shaping over what the division pass produced. No filesystem, no clock:
 * the same inputs always give the same bytes.
 */

import { buildDiscussion } from './public.mjs';
import { byText } from './util.mjs';

/** Actual adjusted cost, then name; missions without a cost sort last. */
export const byCost = (a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || byText(a.name, b.name);

/** Launch date (YYYY-MM-DD), then name; undated missions last. scrolly.json's tiles are in this order. */
export const byLaunch = (a, b) =>
	(a.launchDate == null) - (b.launchDate == null) || byText(a.launchDate ?? '', b.launchDate ?? '') || byText(a.name, b.name);

/**
 * The order index.json uses: division as configured, then cost. Anything the
 * reader can page through is in it.
 */
export function tileSort({ config }) {
	const divisionOrder = new Map(config.divisions.map((d, i) => [d.slug, i]));
	return (a, b) => divisionOrder.get(a.division) - divisionOrder.get(b.division) || byCost(a, b);
}

/**
 * generated/site.json, with dynamically derived discussion figures.
 *
 * @param {object} args
 * @param {object} args.snapshot what every run agreed on (see loadRuns)
 * @param {object} args.config the validated smi.config.json
 * @param {object[]} args.indexEntries the MissionIndexEntry array, already sorted
 * @param {object[]} args.divisionSummaries DivisionSummary[], config order
 * @param {object[]} args.divisionDocs the packaged Division documents, config order
 * @param {number} args.papersDistinct globally distinct bibcodes
 * @param {number} args.citationsDistinct citations of those papers
 * @param {number|null} args.yearCohortMinN from the first run's config block
 */
export function buildSite({
	snapshot,
	config,
	indexEntries,
	divisionSummaries,
	divisionDocs,
	papersDistinct,
	citationsDistinct,
	yearCohortMinN,
	clps = null,
	kinds = null
}) {
	const launchYears = indexEntries.map((e) => e.launchYear).filter((y) => y !== null);
	const pubYearPairs = divisionSummaries.map((d) => d.publicationYears).filter(Boolean);
	const attribution = snapshot.attribution ?? {};

	const site = {
		asOf: snapshot.asOf,
		fetchedMin: snapshot.fetchedMin,
		fetchedMax: snapshot.fetchedMax,
		codeRevision: snapshot.codeRevision,
		missions: indexEntries.length,
		papersDistinct,
		citationsDistinct,
		launchYears: [Math.min(...launchYears), Math.max(...launchYears)],
		publicationYears: [
			Math.min(...pubYearPairs.map((p) => p[0])),
			Math.max(...pubYearPairs.map((p) => p[1]))
		],
		windowPolicy: snapshot.windowPolicy,
		fullPolicy: snapshot.fullPolicy,
		citationHistory: config.citationHistory,
		divisions: divisionSummaries,
		costBaseYear: config.costBaseYear ?? null,
		yearCohortMinN: yearCohortMinN ?? null,
		attribution: {
			acknowledgement: attribution.acknowledgement ?? '',
			adsTermsUrl: attribution.ads_terms_url ?? '',
			missionMetadataSource: attribution.mission_metadata_source ?? ''
		},
		filters: snapshot.filters,
		story: buildDiscussion(divisionDocs, {
			thresholdCost: config.thresholdCost,
			timingDivision: config.storyTimingDivision ?? null
		}),
		clps,
		kinds
	};
	return site;
}
