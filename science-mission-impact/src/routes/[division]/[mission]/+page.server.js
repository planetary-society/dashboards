import { loadMission, missionEntries } from '$lib/data/server.js';

export const entries = missionEntries;

export async function load({ params }) {
	return { mission: await loadMission(params.division, params.mission) };
}
