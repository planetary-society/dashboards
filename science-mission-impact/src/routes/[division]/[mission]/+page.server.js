import { redirect } from '@sveltejs/kit';
import { loadMission, missionEntries } from '$lib/data/server.js';
import { routeScope, scopeLocation } from '$lib/state/scope.js';

export const entries = missionEntries;

export async function load({ params, route, url }) {
	// The page reads no rank histograms, and lifetime publishes counts only (no top-10% or top-1%).
	const { ranks, fullAffiliations, ...mission } = await loadMission(params.division, params.mission);
	const scope = routeScope(route);
	if (mission.inclusion && scope !== 'lifetime') redirect(307, scopeLocation(url, 'lifetime'));
	const { top10, top1, top10ShareOfDivision, top1ShareOfDivision, ...lifetime } = mission.lifetime;
	return { mission: { ...mission, lifetime, affiliations: scope === 'lifetime' ? mission.affiliations : fullAffiliations }, scope };
}
