import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const route = readFileSync(new URL('../../routes/[division]/[mission]/+page.server.js', import.meta.url), 'utf8');
const fixture = {
	id: 'fixture', division: 'earth', ranks: { lifetime: [1] },
	affiliations: { papers: 10 }, fullAffiliations: { papers: 4 },
	lifetime: { papers: 10, citations: 50, top10: 2, top1: 1, top10ShareOfDivision: 0.1, top1ShareOfDivision: 0.2 }
};
async function loader(mission) {
	const source = dataUrl(`export const missionEntries = () => [];
		export const loadMission = async () => (${JSON.stringify(mission)});`);
	return (await import(dataUrl(route
		.replace("'@sveltejs/kit'", JSON.stringify(import.meta.resolve('@sveltejs/kit')))
		.replace("'$lib/data/server.js'", JSON.stringify(source))
		.replace("'$lib/state/scope.js'", JSON.stringify(new URL('../state/scope.js', import.meta.url).href))))).load;
}
const event = (scope = 'full') => ({
	params: { division: 'earth', mission: 'fixture' },
	route: { id: `/[division]/[mission]${scope === 'lifetime' ? '/lifetime' : ''}` },
	url: new URL(`https://example.test/science-mission-impact/earth/fixture/${scope === 'lifetime' ? 'lifetime/' : ''}`)
});

test('analyzed missions retain both scopes and lifetime counts omit comparative ranks', async () => {
	const load = await loader(fixture);
	for (const scope of ['full', 'lifetime']) {
		const data = await load(event(scope));
		assert.equal(data.scope, scope);
		assert.deepEqual(data.mission.lifetime, { papers: 10, citations: 50 });
		assert.equal(data.mission.ranks, undefined);
		assert.deepEqual(data.mission.affiliations, scope === 'lifetime' ? fixture.affiliations : fixture.fullAffiliations);
		assert.equal(data.mission.fullAffiliations, undefined);
	}
});

test('awaiting mission base URLs redirect to lifetime and preserve unrelated query parameters', async () => {
	const inclusion = { date: '2032-10-01', basis: 'window', asOf: '2026-11-14' };
	const load = await loader({ ...fixture, inclusion });
	const request = event();
	request.url.search = '?top=1&scope=full&utm_source=test';
	await assert.rejects(load(request), (error) => error.status === 307 && error.location === '/science-mission-impact/earth/fixture/lifetime/?utm_source=test');
	const data = await load(event('lifetime'));
	assert.equal(data.scope, 'lifetime');
	assert.deepEqual(data.mission.inclusion, inclusion);
	assert.deepEqual(data.mission.lifetime, { papers: 10, citations: 50 });
	assert.deepEqual(data.mission.affiliations, fixture.affiliations);
});

test('an empty active map does not fall back to lifetime affiliations', async () => {
	const load = await loader({ ...fixture, fullAffiliations: null });
	assert.equal((await load(event())).mission.affiliations, null);
	assert.deepEqual((await load(event('lifetime'))).mission.affiliations, fixture.affiliations);
});
