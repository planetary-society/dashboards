import { loadDivision, divisionEntries, missionFields, site } from '$lib/data/server.js';
import { routeScope } from '$lib/state/scope.js';

export const entries = divisionEntries;

export async function load({ params, route }) {
	const scope = routeScope(route);
	const { slug, name, facts, stats, rankable, missions, lifetimeSeries, fullSeries, affiliations } = await loadDivision(params.division);
	const story = site.divisionFacts[slug][scope];
	return {
		scope,
		// This scope only: its totals (for the meta description) and its by-year series.
		division: { slug, name, facts, stats: { papers: stats[scope]?.papers, citations: stats[scope]?.citations }, rankable, missions: missions.map(missionFields), series: scope === 'lifetime' ? lifetimeSeries : fullSeries, affiliations },
		// The per-dollar chart, when the division has missions to compare in this scope, with the packaged average.
		compare: story.comparison ? { average: story.perDollar?.runningMean ?? null } : null
	};
}
