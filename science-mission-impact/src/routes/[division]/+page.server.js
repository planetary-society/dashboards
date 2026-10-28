import { loadDivision, divisionEntries, site, scrolly } from '$lib/data/server.js';

export const entries = divisionEntries;

// The division rows carry only a launch year; the story tiles have the date the table sorts by.
const launchDates = new Map(scrolly.tiles.map((t) => [t.id, t.launchDate]));
const scopeFields = ({ papers, citations, top10, top1, status }) => ({ papers, citations, top10, top1, status });
/** Only what the page, its charts and its CSV read: window bounds and first-paper details stay on the server. */
const missionFields = (m) => ({
	id: m.id, name: m.name, cost: m.cost, size: m.size, launchYear: m.launchYear, launchDate: launchDates.get(m.id) ?? null, type: m.type,
	failed: m.failed, shortfall: m.shortfall, hasThumb: m.hasThumb,
	indices: { h: m.indices?.h ?? null, g: m.indices?.g ?? null },
	full: scopeFields(m.full), lifetime: scopeFields(m.lifetime)
});

export async function load({ params }) {
	const { slug, name, facts, rankable, missions, lifetimeSeries, affiliations } = await loadDivision(params.division);
	return {
		division: { slug, name, facts, rankable, missions: missions.map(missionFields), lifetimeSeries, affiliations },
		// The division's own rows of the story in every scope, for the lede, summary table and per-dollar fit (copy/discussion.js).
		scopes: site.divisionFacts[slug]
	};
}
