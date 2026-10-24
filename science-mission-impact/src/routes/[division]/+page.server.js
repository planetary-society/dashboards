import { loadDivision, divisionEntries, site } from '$lib/data/server.js';

export const entries = divisionEntries;

const scopeFields = ({ papers, citations, top10, top1, status }) => ({ papers, citations, top10, top1, status });
/** Only what the page, its charts and its CSV read: window bounds and first-paper details stay on the server. */
const missionFields = (m) => ({
	id: m.id, name: m.name, cost: m.cost, size: m.size, launchYear: m.launchYear, type: m.type,
	failed: m.failed, shortfall: m.shortfall, hasThumb: m.hasThumb,
	indices: { h: m.indices?.h ?? null, g: m.indices?.g ?? null },
	full: scopeFields(m.full), window: scopeFields(m.window), lifetime: scopeFields(m.lifetime)
});

export async function load({ params }) {
	const { slug, name, facts, rankable, missions, lifetimeSeries } = await loadDivision(params.division);
	return {
		division: { slug, name, facts, rankable, missions: missions.map(missionFields), lifetimeSeries },
		// The division's own rows of the story in every scope, for the sentences, table and charts (copy/discussion.js).
		scopes: site.divisionFacts[slug]
	};
}
