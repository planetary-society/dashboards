import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const route = readFileSync(new URL('../../routes/[division]/+page.server.js', import.meta.url), 'utf8');
const fixture = {
	slug: 'earth', missions: [], awaitingMissions: [], stats: {},
	affiliations: { papers: 10 }, fullAffiliations: { papers: 4 }
};
async function loader(division) {
	const source = dataUrl(`export const divisionEntries = () => [];
		export const missionFields = (m) => m;
		export const site = { divisionFacts: { earth: { full: {}, lifetime: {} } } };
		export const loadDivision = async () => (${JSON.stringify(division)});`);
	return (await import(dataUrl(route
		.replace("'$lib/data/server.js'", JSON.stringify(source))
		.replace("'$lib/state/scope.js'", JSON.stringify(new URL('../state/scope.js', import.meta.url).href))))).load;
}
const event = (scope) => ({
	params: { division: 'earth' },
	route: { id: `/[division]${scope === 'lifetime' ? '/lifetime' : ''}` }
});

test('division routes select map summaries by scope without a lifetime fallback', async () => {
	for (const fullAffiliations of [fixture.fullAffiliations, null]) {
		const load = await loader({ ...fixture, fullAffiliations });
		assert.deepEqual((await load(event('full'))).division.affiliations, fullAffiliations);
		assert.deepEqual((await load(event('lifetime'))).division.affiliations, fixture.affiliations);
	}
});
