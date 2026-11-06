import { loadMission, missionEntries } from '$lib/data/server.js';
import { routeScope } from '$lib/state/scope.js';

export const entries = missionEntries;

export async function load({ params, route }) {
	// The page reads no rank histograms, and lifetime publishes counts only (no top-10% or top-1%).
	const { ranks, ...mission } = await loadMission(params.division, params.mission);
	const { top10, top1, top10ShareOfDivision, top1ShareOfDivision, ...lifetime } = mission.lifetime;
	return { mission: { ...mission, lifetime }, scope: routeScope(route) };
}
