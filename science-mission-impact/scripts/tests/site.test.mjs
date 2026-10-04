import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { buildSite, byCost, byLaunch, tileSort } from '../lib/site.mjs';
import { byText } from '../lib/util.mjs';

const config = {
	divisions: [
		{ slug: 'astro', name: 'Astrophysics', nav: 'Astro', statsLabel: 'a' },
		{ slug: 'earth', name: 'Earth Science', nav: 'Earth', statsLabel: 'e' }
	],
	costClasses: [
		{ key: 'small', label: 'Under $100M', short: '< $100M', min: 0, max: 101 },
		{ key: 'big', label: 'Over $100M', short: '> $100M', min: 101, max: null }
	],
	costBaseYear: 2025,
	smallestClass: 'small',
	thresholdCost: 150,
	rankingMinPapers: 50,
	tierPercents: [10, 50]
};

describe('ordering', () => {
	it('byText compares code points, not locale', () => {
		assert.equal(byText('a', 'b'), -1);
		assert.equal(byText('b', 'a'), 1);
		assert.equal(byText('a', 'a'), 0);
		// A locale compare would sort these together; this one must not.
		assert.equal(byText('Z', 'a'), -1);
	});

	it('tileSort orders by configured division, then actual cost, then name', () => {
		const sort = tileSort({ config });
		const tiles = [
			{ division: 'earth', name: 'Aqua' },
			{ division: 'astro', cost: 200, name: 'Chandra' },
			{ division: 'astro', cost: 50, name: 'Zed' },
			{ division: 'astro', cost: 50, name: 'Alpha' },
			{ division: 'astro', name: 'Nobody' }
		];
		assert.deepEqual(
			[...tiles].sort(sort).map((t) => t.name),
			['Alpha', 'Zed', 'Chandra', 'Nobody', 'Aqua']
		);
	});

	it('byCost ignores division: cost, then name, uncosted last', () => {
		const tiles = [
			{ division: 'earth', cost: 10, name: 'Beta' },
			{ division: 'astro', name: 'Nobody' },
			{ division: 'astro', cost: 10, name: 'Alpha' },
			{ division: 'astro', cost: 5, name: 'Zed' }
		];
		assert.deepEqual([...tiles].sort(byCost).map((t) => t.name), ['Zed', 'Alpha', 'Beta', 'Nobody']);
	});

	it('byLaunch orders by launch date, then name, undated last', () => {
		const tiles = [
			{ name: 'Undated' },
			{ name: 'Zed', launchDate: '1999-02-07' },
			{ name: 'Later', launchDate: '2003-01-01' },
			{ name: 'Alpha', launchDate: '1999-02-07' },
			{ name: 'Early', launchDate: '1990-04-24' }
		];
		assert.deepEqual([...tiles].sort(byLaunch).map((t) => t.name), ['Early', 'Alpha', 'Zed', 'Later', 'Undated']);
	});
});

describe('buildSite', () => {
	const snapshot = {
		asOf: '2026-09-18',
		asOfYear: 2026,
		windowPolicy: { publicationYears: 3, citationYears: 3 },
		fullPolicy: { kind: 'full', postEndYears: 2, citationYears: 3, minWindowYears: 2 },
		codeRevision: 'abc',
		codeRevisionDirty: true,
		fetchedMin: '2026-09-16',
		fetchedMax: '2026-09-18',
		attribution: { acknowledgement: 'thanks', ads_terms_url: 'https://x.test' },
		filters: { astro: 'US astrophysics missions', earth: 'US earth missions' },
		yearCohortMinN: 30
	};
	const indexEntries = [
		{ id: 'a', name: 'A', division: 'astro', costClass: 'small', launchYear: 1990 },
		{ id: 'b', name: 'B', division: 'earth', costClass: 'big', launchYear: 2004 },
		{ id: 'c', name: 'C', division: 'earth', costClass: 'big', launchYear: null }
	];
	const divisionSummaries = [
		{ slug: 'astro', name: 'Astrophysics', papers: 60, publicationYears: [1991, 2026] },
		{ slug: 'earth', name: 'Earth Science', papers: 40, publicationYears: [1989, 2025] }
	];
	const site = buildSite({
		snapshot,
		config,
		indexEntries,
		divisionSummaries,
		divisionDocs: [],
		storyMissions: [],
		papersDistinct: 90,
		citationsDistinct: 1234,
		yearCohortMinN: snapshot.yearCohortMinN,
		clps: { program: 'CLPS', series: [0, 1, null] },
		kinds: { scope: 'full', missions: [] }
	});

	it('reads the configured threshold and passes the CLPS facts through', () => {
		assert.equal(site.story.referenceCost, 150);
		assert.equal(site.story.threshold.missions, 0);
		assert.deepEqual(site.story.failure.under, { missions: 0, failed: 0, rate: null });
		assert.equal(site.story.failure.higher, null);
		assert.deepEqual(site.clps, { program: 'CLPS', series: [0, 1, null] });
		assert.deepEqual(site.kinds, { scope: 'full', missions: [] });
	});

	it('spans the launch) and publication years of what was packaged', () => {
		assert.deepEqual(site.launchYears, [1990, 2004]); // a null launch year is skipped
		assert.deepEqual(site.publicationYears, [1989, 2026]);
		assert.equal(site.missions, 3);
	});

	it('carries the snapshot and the config through unchanged', () => {
		assert.equal(site.asOf, '2026-09-18');
		assert.equal(site.codeRevisionDirty, true);
		assert.deepEqual(site.windowPolicy, { publicationYears: 3, citationYears: 3 });
		assert.deepEqual(site.fullPolicy, { kind: 'full', postEndYears: 2, citationYears: 3, minWindowYears: 2 });
		assert.equal('costClasses' in site, false);
		assert.equal(site.costBaseYear, 2025);
		assert.equal(site.yearCohortMinN, 30);
		assert.deepEqual(site.filters, snapshot.filters);
	});

	it('fills an absent attribution field with an empty string, never undefined', () => {
		assert.equal(site.attribution.missionMetadataSource, '');
		assert.equal(JSON.stringify(site.attribution).includes('null'), false);
	});

	it('derives discussion values without legacy claims', () => {
		assert.equal('claims' in site, false);
		assert.equal(site.story.threshold.missions, 0);
		assert.ok(site.story);
	});

	it('reads the story in the full-mission scope and degrades cleanly with no divisions', () => {
		assert.equal(site.story.scope, 'full');
		assert.equal(site.story.pooledBand, null);
		assert.deepEqual(site.story.perDollar, []);
		assert.deepEqual(site.story.comparison.divisions, []);
		assert.equal(site.story.comparison.unavailable, 0);
		assert.deepEqual(site.story.comparison.groups.map((g) => g.key), ['under', 'over']);
		for (const group of site.story.comparison.groups) {
			assert.equal(group.missions, 0);
			assert.equal(group.failed, 0);
			assert.equal(group.withTop, 0);
			assert.equal(group.top10, 0);
			assert.equal(group.top10PerMission, null);
			assert.equal(group.top1PerMission, null);
		}
	});
});
