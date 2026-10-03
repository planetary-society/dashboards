import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { buildFigures, diffFigures, figure, formatReport, missionDelta } from '../lib/report.mjs';
import { papers } from '../lib/util.mjs';

const site = {
	asOf: '2026-09-18',
	fetchedMin: '2026-09-16T20:06:24Z',
	fetchedMax: '2026-09-18T19:39:45Z',
	codeRevision: 'aaaaaaaaaaaaaaaa+bbbbbbbbbbbbbbbb',
	missions: 12,
	papersDistinct: 950,
	citationsDistinct: 40000,
	launchYears: [1990, 2020],
	divisions: [
		{
			slug: 'astro',
			name: 'Astrophysics',
			missions: 7,
			papers: 600,
			citations: 30000,
			publicationYears: [1991, 2026],
			rankable: true,
		},
		{
			slug: 'bps',
			name: 'Bio + Phys',
			missions: 5,
			papers: 400,
			citations: 10000,
			publicationYears: [2011, 2021],
			rankable: false,
		},
	],
	claims: [
		{
			id: 'lag',
			step: 5,
			statement: 'Smaller missions lag.',
			holds: true,
			detail: 'medians rise.',
		},
		{
			id: 'smallest-top1',
			step: 4,
			statement: 'Almost no top 1%.',
			holds: false,
			detail: '12 top-1% papers.',
		},
	],
	story: {
		referenceCost: 150,
		threshold: { missions: 6, total: 9, ids: [], papers: 60, papersAll: 900, unavailable: 0, launchMedian: 2005 },
		failure: { statuses: [], under: { missions: 6, failed: 2, rate: 0.33333 }, over: { missions: 3, failed: 0, rate: 0 }, higher: 'under', byDivision: [] },
		smallestClass: 'small',
		comparisonClass: 'big',
		smallest: {
			missions: 6,
			missionsWithTop10: 1,
			top10Papers: 4.5,
			top1Papers: 0,
			exceptions: [],
		},
		comparison: {
			divisions: ['astro'],
			unavailable: 1,
			groups: [
				{ key: 'under', missions: 6, failed: 1, withTop: 1, top10: 4.5, top10PerMission: 0.75, top1: 0, top1PerMission: 0, cost: 120, citations: 900 },
				{ key: 'over', missions: 3, failed: 0, withTop: 3, top10: 200, top10PerMission: 66.667, top1: 30, top1PerMission: 10, cost: 6000, citations: 50000 },
			],
		},
		pooledBand: { divisions: ['astro'], p25: 400, p50: 900, p75: 1500 },
		perDollar: [
			{
				division: 'astro',
				name: 'Astrophysics',
				groups: [
					{ key: 'under', missions: 6, cost: 120, citations: 900, perHundredM: 750 },
					{ key: 'over', missions: 3, cost: 6000, citations: 50000, perHundredM: 833.333 },
				],
			},
		],
		medianYearsToFirstTop10: [{ costClass: 'small', years: 2.1, reached: 1, missions: 6 }],
		buildYears: [{ costClass: 'small', years: 4.2, n: 3, missions: 6 }],
		context: { id: 'themis', name: 'THEMIS', costVsClass: 1.01 },
		bands: [{ division: 'astro', name: 'Astrophysics', p25: 400, p50: 900, p75: 1500 }],
		bandSpread: 2.2,
	},
};

const divisions = [
	{
		slug: 'astro',
		name: 'Astrophysics',
		cutoffs: { full: { 10: 42, 1: 101 }, window: { 10: 39, 1: 90 }, lifetime: { 10: 70, 1: 227 } },
	},
	{
		slug: 'bps',
		name: 'Bio + Phys',
		cutoffs: { full: null, window: null, lifetime: null },
	},
];

const index = [
	{ id: 'hst', name: 'HST', division: 'astro' },
	{ id: 'trace', name: 'TRACE', division: 'helio' },
];

const base = {
	site,
	divisions,
	index,
	warnings: [],
	citationGaps: [{ slug: 'astro', edges: 29000, citationsTotal: 30000, relative: -0.0333 }],
	unbalanced: [],
	missionsWithoutQuery: [],
	thumbs: {
		file: 'static/img/missions/manifest.json',
		ok: 10,
		failed: 1,
		none: 1,
		failedIds: ['hst'],
	},
	bytes: {
		site: 4671,
		index: 27838,
		scrolly: 124293,
		divisions: 500,
		missions: 900,
		papers: 1200,
	},
	previous: null,
};

describe('number formatting', () => {
	it('keeps one decimal on fractional tie weights below ten', () => {
		assert.equal(papers(4.5), '4.5');
		assert.equal(papers(16.667), '17');
		assert.equal(papers(0), '0');
		assert.equal(papers(null), '—');
	});

	it('formats delta-table values by type', () => {
		assert.equal(figure(1234), '1,234');
		assert.equal(figure(2.1), '2.100');
		assert.equal(figure('1990–2020'), '1990–2020');
		assert.equal(figure(null), '—');
	});
});

describe('buildFigures', () => {
	const figures = buildFigures({
		site,
		divisions: Object.fromEntries(divisions.map((d) => [d.slug, d])),
	});

	it('covers totals, per-division facts, cutoffs and story figures', () => {
		assert.equal(figures.get('missions'), 12);
		assert.equal(figures.get('papers · globally distinct'), 950);
		assert.equal(figures.get('launch years'), '1990–2020');
		assert.equal(figures.get('Astrophysics · window top-10% cutoff'), 39);
		assert.equal(figures.get('Bio + Phys · window top-10% cutoff'), null);
		assert.equal(figures.has('story · smallest top-10% papers'), false);
		assert.equal(figures.has('story · comparison class'), false);
	});

	it('covers the full-mission cutoffs alongside the window and lifetime ones', () => {
		assert.equal(figures.get('Astrophysics · full top-10% cutoff'), 42);
		assert.equal(figures.get('Astrophysics · full top-1% cutoff'), 101);
		assert.equal(figures.get('Bio + Phys · full top-10% cutoff'), null);
		assert.equal(figures.get('Bio + Phys · full top-1% cutoff'), null);
	});

	it('covers the cross-division story figures', () => {
		assert.equal(figures.get('story · under threshold · missions'), 6);
		assert.equal(figures.get('story · under threshold · top-10% papers per mission'), 0.75);
		assert.equal(figures.get('story · over threshold · missions'), 3);
		assert.equal(figures.get('story · over threshold · top-10% papers per mission'), 66.667);
		assert.equal(figures.get('story · pooled top-paper band'), '400–1,500');
		assert.equal(figures.get('story · pooled top-paper band midpoint'), 900);
		assert.equal(figures.get('story · citations per $100M · astro · under'), 750);
		assert.equal(figures.get('story · citations per $100M · astro · over'), 833.333);
	});

	it('covers the threshold, shortfalls and CLPS figures', () => {
		assert.equal(figures.get('story · threshold'), 150);
		assert.equal(figures.get('story · missions at or under threshold'), 6);
		assert.equal(figures.get('story · mission papers at or under threshold'), 60);
		assert.equal(figures.get('story · shortfalls · under threshold'), '2 of 6');
		assert.equal(figures.get('story · shortfalls · over threshold'), '0 of 3');
		assert.equal(figures.has('clps · papers to date'), false);
		const clps = { horizonMonths: 3, series: [0, 2, 5, null], comparators: [{ name: 'LCROSS', series: [0, 1, 2, 4] }] };
		const withClps = buildFigures({ site: { ...site, clps }, divisions: {} });
		assert.equal(withClps.get('clps · papers to date'), 5);
		assert.equal(withClps.get('clps · LCROSS · month 3'), 4);
		assert.equal(withClps.has('clps · behind every comparator'), false);
		const compared = buildFigures({ site: { ...site, clps: { ...clps, comparison: { behindAll: true } } }, divisions: {} });
		assert.equal(compared.get('clps · behind every comparator'), 'true');
	});

	it('covers the paper-kinds figures when site.kinds exists', () => {
		assert.equal(figures.has('kinds · papers at or under threshold'), false);
		const byKind = { results: { papers: 2, citations: 9 }, review: { papers: 0, citations: 0 } };
		const kinds = {
			kinds: [{ key: 'results', label: 'Science results' }, { key: 'review', label: 'Reviews and commentary' }],
			total: { papers: 10 },
			nonScience: { paperShare: 0.4, citationShare: 0.25 },
			small: { maxPapers: 10, missions: 4, nonScience: { citationShare: 0.5 } },
			majorityNonScience: 3,
			examples: [{ name: 'RainCube', byKind }]
		};
		const got = buildFigures({ site: { ...site, kinds }, divisions: {} });
		assert.equal(got.get('kinds · papers at or under threshold'), 10);
		assert.equal(got.get('kinds · non-science share of papers'), 0.4);
		assert.equal(got.get('kinds · non-science share of citations'), 0.25);
		assert.equal(got.get('kinds · missions with mostly non-science papers'), 3);
		assert.equal(got.get('kinds · missions with ≤10 papers'), 4);
		assert.equal(got.get('kinds · their non-science share of citations'), 0.5);
		assert.equal(got.get('kinds · RainCube · Science results'), 2);
		assert.equal(got.has('kinds · RainCube · Reviews and commentary'), false);
	});

	it('leaves the pooled band out when no division holds top credit', () => {
		const none = buildFigures({ site: { ...site, story: { ...site.story, pooledBand: null } }, divisions: {} });
		assert.equal(none.has('story · pooled top-paper band'), false);
		assert.equal(none.has('story · pooled top-paper band midpoint'), false);
		assert.equal(none.get('story · under threshold · missions'), 6);
	});

	it('is stably ordered, so an unchanged package writes an unchanged report', () => {
		const again = buildFigures({
			site: structuredClone(site),
			divisions: structuredClone(Object.fromEntries(divisions.map((d) => [d.slug, d]))),
		});
		const keys = [...figures.keys()];
		assert.deepEqual([...again.keys()], keys);
		// Scopes in their default order, then the story figures after every division figure.
		const at = (key) => {
			const i = keys.indexOf(key);
			assert.ok(i >= 0, `missing figure ${key}`);
			return i;
		};
		assert.ok(at('Astrophysics · full top-10% cutoff') < at('Astrophysics · window top-10% cutoff'));
		assert.ok(at('Astrophysics · window top-1% cutoff') < at('Astrophysics · lifetime top-10% cutoff'));
		assert.ok(at('Bio + Phys · h-index vs cost (rho)') < at('story · threshold'));
		assert.ok(at('story · under threshold · missions') < at('story · over threshold · missions'));
		assert.ok(at('story · pooled top-paper band midpoint') < at('story · citations per $100M · astro · under'));
	});

	it('returns nothing for a missing package', () => {
		assert.equal(buildFigures({ site: null, divisions: {} }).size, 0);
	});
});

describe('diffFigures', () => {
	it('is empty for identical packages', () => {
		const docs = Object.fromEntries(divisions.map((d) => [d.slug, d]));
		const a = buildFigures({ site, divisions: docs });
		const b = buildFigures({ site: structuredClone(site), divisions: structuredClone(docs) });
		assert.ok(a.size > 30, 'the comparison covers the full figure set');
		assert.deepEqual(diffFigures(a, b), []);
	});

	it('reports a changed value, a new key and a dropped key', () => {
		const before = new Map([
			['missions', 12],
			['gone', 3],
		]);
		const after = new Map([
			['missions', 13],
			['new', 1],
		]);
		assert.deepEqual(diffFigures(before, after), [
			{ label: 'missions', before: 12, after: 13 },
			{ label: 'new', before: null, after: 1 },
			{ label: 'gone', before: 3, after: null },
		]);
	});

	it('does not treat a measured zero as a missing value', () => {
		const changed = diffFigures(new Map([['x', 0]]), new Map([['x', null]]));
		assert.equal(changed.length, 1);
	});
});

describe('missionDelta', () => {
	it('names what arrived and what left', () => {
		const delta = missionDelta(
			[
				{ id: 'hst', name: 'HST', division: 'astro' },
				{ id: 'old', name: 'Old', division: 'astro' },
			],
			[
				{ id: 'hst', name: 'HST', division: 'astro' },
				{ id: 'new', name: 'New', division: 'helio' },
			],
		);
		assert.deepEqual(delta.added, ['New (`new`, helio)']);
		assert.deepEqual(delta.removed, ['Old (`old`, astro)']);
	});

	it('handles a missing previous index', () => {
		assert.deepEqual(missionDelta(null, index).removed, []);
		assert.equal(missionDelta(null, index).added.length, 2);
	});
});

/** Table cells are padded to a fixed column width; compare on the content. */
const squeeze = (s) => s.replace(/ +\|/g, ' |').replace(/\| +/g, '| ');

describe('formatReport', () => {
	const text = squeeze(formatReport(base));

	it('leads with the snapshot, the fetch range and the revisions', () => {
		assert.match(text, /# Science Mission Impact — refresh report/);
		assert.match(text, /Snapshot \*\*2026-09-18\*\*/);
		assert.match(text, /2026-09-16T20:06:24Z → 2026-09-18T19:39:45Z/);
		assert.match(text, /`aaaaaaaaaaaa`, `bbbbbbbbbbbb`/);
	});

	it('prints no date that is not a data date', () => {
		const thisYear = String(new Date().getUTCFullYear());
		const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
		for (const d of dates) assert.ok(d.startsWith('2026-09-1'), `unexpected date ${d}`);
		assert.equal(squeeze(formatReport(base)), text, 'formatting is a pure function of its input');
		assert.ok(thisYear.length === 4);
	});

	it('tabulates divisions with their cutoffs and rankability', () => {
		assert.match(
			text,
			/\| Pub\. years \| Full-mission 10% \/ 1% cutoff \| Window 10% \/ 1% cutoff \| Lifetime 10% \/ 1% cutoff \| Rankable \|/,
		);
		assert.match(
			text,
			/\| Astrophysics \| 7 \| 600 \| 30,000 \| 1991–2026 \| 42 \/ 101 \| 39 \/ 90 \| 70 \/ 227 \| yes \|/,
		);
		assert.match(text, /\| Bio \+ Phys \| 5 \| 400 \| 10,000 \| 2011–2021 \| — \| — \| — \| no \|/);
	});

	it('states the globally distinct totals and the cross-division overlap', () => {
		assert.match(text, /Globally distinct: 12 missions · 950 papers · 40,000 citations/);
		assert.match(text, /divisions sum to 1,000 papers; 50 are claimed by more than one division/);
	});

	it('reports validation without obsolete story claims', () => {
		assert.match(text, /no class-based narrative claims/);
		assert.doesNotMatch(text, /guarded claims no longer hold/);
	});

	it('says so plainly when there is no previous package', () => {
		assert.match(text, /this is the first one/);
	});

	it('summarises thumbnails and lists the failures to retry', () => {
		assert.match(text, /ok 10 · failed 1 · no image URL 1/);
		assert.match(text, /Failed: `hst`/);
	});

	it('totals the output sizes', () => {
		assert.match(text, /\| \*\*total\*\* \| \*\*159,402\*\* \|/);
	});

	it('pads table columns the way Prettier would, so the file never re-diffs', () => {
		const raw = formatReport(base).split('\n');
		const start = raw.findIndex((l) => l.startsWith('| Division '));
		const rows = raw.slice(start).slice(0, 4);
		const widths = rows.map((l) => l.length);
		assert.ok(rows.length >= 3);
		assert.equal(new Set(widths).size, 1, 'every row in a table is the same width');
		assert.match(rows[1], /^\| -+ \| -+ \|/);
	});

	it('reports a clean run as clean', () => {
		assert.match(text, /## Warnings\n\nNone\./);
		assert.match(text, /Missions with no ADS query: none/);
		assert.match(text, /balanced for every mission/);
	});
});

describe('formatReport deltas', () => {
	it('says "no change" when the package is identical', () => {
		const text = squeeze(
			formatReport({
				...base,
				previous: {
					site,
					index,
					divisions: Object.fromEntries(divisions.map((d) => [d.slug, d])),
				},
			}),
		);
		assert.match(text, /- Missions added: none/);
		assert.match(text, /- Missions removed: none/);
		assert.match(text, /No change in totals, cutoffs or story figures\./);
	});

	it('tables every figure that moved, and names missions gained or lost', () => {
		const previousSite = structuredClone(site);
		previousSite.papersDistinct = 900;
		previousSite.divisions[0].papers = 550;
		previousSite.story.smallest.top10Papers = 3;
		previousSite.story.comparison.groups[0].top10PerMission = 0.5;
		previousSite.story.pooledBand.p50 = 800;
		previousSite.story.perDollar[0].groups[0].perHundredM = 700;
		const previousDivisions = structuredClone(
			Object.fromEntries(divisions.map((d) => [d.slug, d])),
		);
		previousDivisions.astro.cutoffs.window[10] = 37;
		previousDivisions.astro.cutoffs.full[10] = 40;

		const text = squeeze(
			formatReport({
				...base,
				previous: {
					site: previousSite,
					index: [...index, { id: 'gone', name: 'Gone', division: 'astro' }],
					divisions: previousDivisions,
				},
			}),
		);
		assert.match(text, /- Missions removed: Gone \(`gone`, astro\)/);
		assert.match(text, /\| papers · globally distinct \| 900 \| 950 \|/);
		assert.match(text, /\| Astrophysics · papers \| 550 \| 600 \|/);
		assert.match(text, /\| Astrophysics · window top-10% cutoff \| 37 \| 39 \|/);
		assert.match(text, /\| Astrophysics · full top-10% cutoff \| 40 \| 42 \|/);
		assert.match(text, /\| story · under threshold · top-10% papers per mission \| 0\.500 \| 0\.750 \|/);
		assert.match(text, /\| story · pooled top-paper band midpoint \| 800 \| 900 \|/);
		assert.match(text, /\| story · citations per \$100M · astro · under \| 700 \| 750 \|/);
		assert.doesNotMatch(text, /story · over threshold/);
		assert.doesNotMatch(text, /story · smallest top-10% papers/);
	});
});

describe('formatReport, the unhappy paths', () => {
	it('lists warnings, missing queries, unbalanced merges and a missing manifest', () => {
		const text = squeeze(
			formatReport({
				...base,
				warnings: ['stats run "us_helio_fixed_set" was produced from a dirty working tree'],
				missionsWithoutQuery: [{ id: 'miratta', name: 'MiRaTA', division: 'earth' }],
				unbalanced: ['cassini (Cassini)'],
				thumbs: null,
			}),
		);
		assert.match(text, /⚠︎ stats run "us_helio_fixed_set" was produced from a dirty working tree/);
		assert.match(text, /Missions with no ADS query: 1 — MiRaTA \(`miratta`\)/);
		assert.match(text, /unbalanced for cassini \(Cassini\)/);
		assert.match(text, /No `static\/img\/missions\/manifest\.json`/);
	});
});
