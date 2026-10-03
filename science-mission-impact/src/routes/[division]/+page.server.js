import { loadDivision, divisionEntries, site } from '$lib/data/server.js';

export const entries = divisionEntries;

export async function load({ params }) {
	return { division: await loadDivision(params.division), selectionFilter: site.filters[params.division] };
}
