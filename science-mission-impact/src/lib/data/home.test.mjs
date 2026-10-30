import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
// Replace only the build-time data import; exercise the actual route loader under Node.
const fixtures = dataUrl(['site', 'scrolly'].map((name) =>
	`export const ${name} = ${readFileSync(new URL(`./generated/${name}.json`, import.meta.url), 'utf8')};`
).join('\n'));
const { site, scrolly } = await import(fixtures);
const source = readFileSync(new URL('../../routes/+page.server.js', import.meta.url), 'utf8');
const { load } = await import(dataUrl(source.replace("'$lib/data/server.js'", JSON.stringify(fixtures))));

test('the homepage omits unused data without changing retained facts or shared source objects', () => {
	const before = JSON.stringify({ site, scrolly });
	const expected = structuredClone({
		facts: {
			missions: site.missions, papersDistinct: site.papersDistinct, citationsDistinct: site.citationsDistinct,
			launchYears: site.launchYears, story: site.story, clps: site.clps,
			time: site.analysis.time, tiers: site.analysis.tiers, failureTiers: site.analysis.failures.tiers
		},
		scrolly
	});
	for (const tile of expected.scrolly.tiles)
		for (const key of ['share', 'papers', 'launchDate', 'size']) delete tile[key];
	for (const key of ['threshold', 'bands', 'pooledBand', 'scope']) delete expected.facts.story[key];
	delete expected.facts.clps.surface;

	assert.deepEqual(load(), expected);
	assert.equal(JSON.stringify({ site, scrolly }), before, 'other routes still receive complete packaged data');
	assert.deepEqual(load(), expected, 'repeated requests return the same projection');
});
