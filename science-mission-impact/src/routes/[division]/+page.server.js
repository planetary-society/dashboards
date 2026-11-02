import { loadDivision, divisionEntries, missionFields, site } from '$lib/data/server.js';

export const entries = divisionEntries;

export async function load({ params }) {
	const { slug, name, facts, rankable, missions, lifetimeSeries, fullSeries, affiliations } = await loadDivision(params.division);
	return {
		division: { slug, name, facts, rankable, missions: missions.map(missionFields), series: { full: fullSeries, lifetime: lifetimeSeries }, affiliations },
		// The division's own rows of the story in every scope, for the per-dollar chart and its average.
		scopes: site.divisionFacts[slug]
	};
}
