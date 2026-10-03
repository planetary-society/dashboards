/**
 * Server-render smoke test. The pages are prerendered, so what these components emit with no
 * measured width is what a crawler (and a reader with a slow connection) sees: the facts have
 * to be in that HTML, and none of the null cases may throw.
 *
 * The components are compiled here and imported as data URLs with every specifier resolved by
 * hand, which keeps the test independent of vite: $lib/state and $lib/paths are stubbed, so
 * the reader's view can be set per render.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..');

// encodeURIComponent leaves apostrophes alone, and a compiled component's URL is quoted inside
// the next one up, so they are escaped here as well.
const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code).replace(/'/g, '%27')}`;

const PATHS_STUB = dataUrl(`
	export const missionHref = (slug, id) => \`/\${slug}/\${id}/\`;
	export const thumbSrc = (id) => \`/img/missions/\${id}.webp\`;
`);

const viewStub = (scope, top) => dataUrl(`export const view = { scope: ${JSON.stringify(scope)}, top: ${top} };`);

/** One specifier as something node can import. A component a chart uses is compiled in turn. */
async function resolveSpec(spec, dir, ctx) {
	if (spec === '$lib/paths.js') return PATHS_STUB;
	if (spec === '$lib/state/view.svelte.js') return viewStub(ctx.scope, ctx.top);
	const abs = spec.startsWith('$lib/') ? join(lib, spec.slice(5)) : spec.startsWith('.') ? join(dir, spec) : null;
	if (!abs) return import.meta.resolve(spec);
	return abs.endsWith('.svelte') ? compiled(abs, ctx) : pathToFileURL(abs).href;
}

async function compiled(file, ctx) {
	const source = await readFile(file, 'utf8');
	const { js } = compile(source, { filename: file, generate: 'server', runes: true });
	const dir = dirname(file);
	const urls = new Map();
	for (const spec of new Set([...js.code.matchAll(/\bfrom\s*'([^']+)'/g)].map((m) => m[1]))) {
		urls.set(spec, await resolveSpec(spec, dir, ctx));
	}
	return dataUrl(js.code.replace(/(\bfrom\s*)'([^']+)'/g, (match, keyword, spec) => `${keyword}'${urls.get(spec)}'`));
}

async function load(name, { scope = 'full', top = 10 } = {}) {
	return (await import(await compiled(join(here, name), { scope, top }))).default;
}

const policy = { publicationYears: 3, citationYears: 3 };

test('division timeline defaults to annual counts and keeps missing citations explicit', async () => {
	const Component = await load('LifetimeTimeline.svelte');
	const body = render(Component, { props: { lifetime: {
		years: [2000, 2001], papers: [2, 3], citations: [5, 7], partialFromYear: 2001,
		citationCoverage: { status: 'incomplete', expected: 13, observed: 12, missing: 1 }
	} } }).body;
	assert.match(body, /2001: 3 tracked publications · 7 citations/);
	assert.match(body, /Dashed from 2001/);
	assert.match(body, /12 of 13 reported citations/);
	assert.match(body, /type="range"/);
	assert.doesNotMatch(body, /NaN|undefined/);
});

test('selected mission readouts follow the window and retain unavailable states', async () => {
	const missions = [{ id: 'alpha', name: 'Alpha', cost: 100,
		full: { papers: 10, top10: 2, outputBasis: 'measured', first: { state: 'reached', yearsFromScienceStart: 2 } },
		window: { papers: null, top10: null, outputBasis: 'unavailable', first: { state: 'unavailable', yearsFromScienceStart: null } }
	}];
	const props = { missions, slug: 'earth', selectedId: 'alpha' };
	const Full = await load('TimeToScience.svelte');
	assert.match(render(Full, { props }).body, /24 months after science start/);
	const Window = await load('TimeToScience.svelte', { scope: 'window' });
	assert.match(render(Window, { props }).body, /no recorded timing in this window/);
	const Scatter = await load('PublicationScatter.svelte', { scope: 'window' });
	assert.match(render(Scatter, { props }).body, /scores unavailable in this window/);
});

test('mission squares select in division charts and preserve links elsewhere', async () => {
	const Component = await load('../scrolly/Squares.svelte');
	const props = { tiles: [{ id: 'alpha', name: 'Alpha', division: 'earth' }], items: new Map([['alpha', { x: 0, y: 0, s: 8, label: 'Alpha: selected facts' }]]) };
	const link = render(Component, { props }).body;
	assert.match(link, /href="\/earth\/alpha\/"/);
	const selectable = render(Component, { props: { ...props, selectedId: 'alpha', onselect: () => {} } }).body;
	assert.match(selectable, /<button/);
	assert.match(selectable, /aria-pressed="true"/);
	assert.match(selectable, /Alpha: selected facts/);
	assert.doesNotMatch(selectable, /href=/);
});

test('TimeToScience explains the axes and omitted missions in prerendered HTML', async () => {
	const Component = await load('TimeToScience.svelte');
	const missions = [
		{ id: 'early', name: 'Early', cost: 10, full: { first: { state: 'reached', yearsFromScienceStart: -1 } } },
		{ id: 'none', name: 'None', cost: 100, full: { first: { state: 'none', yearsFromScienceStart: null } } }
	];
	const body = render(Component, { props: { missions, slug: 'earth', referenceCost: 100 } }).body;
	assert.match(body, /1 of 2 missions/);
	assert.match(body, /Publication date of a paper that ranks highly today/);
	assert.match(body, /12 months before science start/);
	assert.match(body, /Negative months/);
	assert.match(body, /No top-10% paper observed \(1\): None/);
	const empty = render(Component, { props: { missions: [], slug: 'earth' } }).body;
	assert.match(empty, /No missions with an observed milestone/);
	assert.doesNotMatch(empty, /NaN|undefined/);
});

const lifetime = {
	years: [2000, 2001, 2002, 2003],
	papers: [10, 20, 30, 5],
	citations: [0, 100, 900, 200],
	partialFromYear: 2003
};

const windowSeries = {
	papersByMonth: Array.from({ length: 36 }, (_, i) => (i % 6 === 0 ? 2 : 0)),
	citationsByYearOffset: [0, 30, 80, 120, 200, 260, 310],
	missionsIncluded: 12,
	missionsImmature: []
};

test('prime-window boundaries and incomplete citation coverage are present in prerendered text', async () => {
	const Component = await load('AccumulationPair.svelte');
	const { body } = render(Component, { props: {
		lifetime: { ...lifetime, citationCoverage: { status: 'incomplete', expected: 1201, observed: 1200, missing: 1 } },
		window: { ...windowSeries, start: '2000-02-01', end: '2004-03-01', matureDate: '2007-10-01', missionsByYear: [12, 10, 8] },
		policy: { kind: 'prime', postPrimeYears: 2, citationYears: 3 }
	} });
	assert.match(body, /Prime Mission Window/);
	assert.match(body, /2000-02-01 to 2004-03-01/);
	assert.match(body, /1,200 of 1,201 reported citations/);
	assert.match(body, /1 missing/);
	assert.doesNotMatch(body, /undefined/);
});

test('AccumulationPair prerenders both summaries and no chart', async () => {
	const Component = await load('AccumulationPair.svelte');
	const { body } = render(Component, { props: { lifetime, window: windowSeries, policy } });
	assert.match(body, /Lifetime/);
	assert.match(body, /3-year window/);
	assert.match(body, /65 tracked publications and 1,200 citations in total/);
	assert.match(body, /12 tracked publications and 1,000 citations in total/);
	assert.ok(!body.includes('<svg'), 'no chart is drawn before the container is measured');
});

test('AccumulationPair says so when the window is missing or immature', async () => {
	const Component = await load('AccumulationPair.svelte');
	const missing = render(Component, { props: { lifetime, window: null, policy } }).body;
	assert.match(missing, /not available for this mission\./);
	const immature = render(Component, { props: { lifetime, window: { ...windowSeries, status: 'immature' }, policy } }).body;
	assert.match(immature, /not available for this mission yet\./);
	const noLifetime = render(Component, { props: { lifetime: null, window: windowSeries, policy } }).body;
	assert.ok(!noLifetime.includes('undefined'));
});

const missions = [
	{ id: 'alpha', name: 'Alpha', full: { top10: 6, top1: 1 }, window: { top10: 6, top1: 1 }, lifetime: { top10: 6, top1: null } },
	{ id: 'bravo', name: 'Bravo', full: { top10: 2.5, top1: 0 }, window: { top10: 2.5, top1: 0 }, lifetime: { top10: 2.5, top1: null } },
	{ id: 'hubble', name: 'Hubble', full: { top10: 38, top1: 9 }, window: { top10: 38, top1: 9 }, lifetime: { top10: 38, top1: null } },
	{ id: 'quiet', name: 'Quiet', full: { top10: 1, top1: 0 }, window: { top10: 1, top1: 0 }, lifetime: { top10: 1, top1: null } }
];

/** One windowed scope's curves; `full` and `window` get identical copies. */
const windowedCurves = () => ({
	10: {
		points: [
			{ id: 'alpha', cost: 8, topShare: 0, costShare: 0.004 },
			{ id: 'bravo', cost: 120, topShare: 0.3, costShare: 0.064 },
			{ id: 'hubble', cost: 1000, topShare: 1, costShare: 1 }
		],
		band: { p25: 120, p50: 1000, p75: 1000 },
		cheapestWithTop: { id: 'bravo', name: 'Bravo', cost: 120 },
		unplaced: ['quiet']
	},
	1: { points: [], band: { p25: null, p50: null, p75: null }, cheapestWithTop: null, unplaced: [] }
});

const costCurves = {
	full: windowedCurves(),
	window: windowedCurves(),
	lifetime: { 10: null, 1: null }
};

test('CostCurve prerenders the takeaway and the summary, and draws nothing unmeasured', async () => {
	for (const scope of ['full', 'window']) {
		const Component = await load('CostCurve.svelte', { scope });
		const { body } = render(Component, { props: { costCurves, missions, slug: 'astrophysics' } });
		assert.match(body, /Missions up to \$120M account for the first quarter of the division’s top 10% papers and 6.4% of its spending\./, scope);
		assert.match(body, /The middle half of the top papers comes from missions costing \$120M to \$1\.0B\./, scope);
		assert.match(body, /One mission has no cost on record and is not shown\./, scope);
		assert.match(body, /Running share of top 10% papers/, scope);
		assert.ok(!body.includes('<svg'), 'no chart is drawn before the stage is measured');
		assert.ok(!body.includes('NaN'));
	}
});

test('CostCurve reads the curve of the selected scope, full by default', async () => {
	const onlyFull = { ...costCurves, window: { 10: null, 1: null } };
	const Default = await load('CostCurve.svelte');
	assert.match(render(Default, { props: { costCurves: onlyFull, missions, slug: 'astrophysics' } }).body, /Missions up to \$120M/);
	const Window = await load('CostCurve.svelte', { scope: 'window' });
	assert.match(render(Window, { props: { costCurves: onlyFull, missions, slug: 'astrophysics' } }).body, /Not available for this view\./);
});

test('CostCurve says so when the view has no curve', async () => {
	const Component = await load('CostCurve.svelte', { scope: 'lifetime', top: 1 });
	assert.match(render(Component, { props: { costCurves, missions, slug: 'astrophysics' } }).body, /Not available for this view\./);
	for (const scope of ['full', 'window']) {
		const empty = await load('CostCurve.svelte', { scope, top: 1 });
		assert.match(render(empty, { props: { costCurves, missions, slug: 'astrophysics' } }).body, /Not available for this view\./, scope);
		assert.match(render(empty, { props: { costCurves: null, missions, slug: 'astrophysics' } }).body, /Not available for this view\./, scope);
	}
});

test('RankHistogram prerenders ten bars, the top-1% cap and the computed sentence', async () => {
	const Component = await load('RankHistogram.svelte');
	const { body } = render(Component, { props: { ranks: { bins: [50, 40, 30, 30, 20, 10, 8, 6, 4, 2], top1: 0.5 } } });
	assert.equal((body.match(/class="bar[ "]/g) ?? []).length, 10);
	assert.equal((body.match(/class="cap[ "]/g) ?? []).length, 1);
	assert.match(body, /1\.0% of this mission’s 200 papers are in the division’s top 10%; 10% would be an even spread\./);
	assert.match(body, /Even spread: 20 per bar/);
	assert.ok(!body.includes('NaN'));
});

test('RankHistogram says when the view has no histogram', async () => {
	const Component = await load('RankHistogram.svelte');
	assert.match(render(Component, { props: { ranks: null } }).body, /Not available for this view\./);
	// icecube and mars_observer really are like this: papers over a lifetime, none in the window
	assert.match(render(Component, { props: { ranks: { bins: new Array(10).fill(0), top1: 0 } } }).body, /No papers in this view\./);
});

const indexMissions = [
	{ id: 'cassini', name: 'Cassini', cost: 7605.6, failed: false, indices: { h: 127, m: 4.704, i100: 193 } },
	{ id: 'asteria', name: 'ASTERIA', cost: 6.7, failed: false, indices: { h: 3, m: 0.429, i100: 0 } },
	{ id: 'contour', name: 'CONTOUR', cost: 296.8, failed: true, indices: { h: 0, m: null, i100: null } },
	{ id: 'nocost', name: 'Nocost', cost: null, failed: false, indices: { h: 12, m: 1.2, i100: 1 } }
];

test('IndexScatter prerenders the marks, the correlation and the summary', async () => {
	const Component = await load('IndexScatter.svelte');
	const { body } = render(Component, {
		props: { missions: indexMissions, correlation: { m: { rho: 0.69552, n: 30 }, h: { rho: 0.43042, n: 31 } }, slug: 'planetary', asOf: '2026-09-20' }
	});
	assert.match(body, /by mission cost, as of September 20, 2026/);
	assert.match(body, /Rank correlation with cost: ρ = 0\.70 across 30 missions\./);
	assert.match(body, /href="\/planetary\/cassini\/"/);
	assert.match(body, /aria-label="Cassini: \$7\.6B, m-index 4\.7 \(h-index 127\)"/);
	// a failure with no m-index still appears, on the zero line and marked as one
	assert.match(body, /aria-label="CONTOUR: \$297M, failed with no qualifying papers"/);
	assert.match(body, /mark-failure/);
	assert.ok(!body.includes('/planetary/nocost/'), 'a mission with no cost has nowhere to sit');
	assert.match(body, /m-index by mission cost for 3 missions, as of September 20, 2026/);
	assert.ok(!body.includes('NaN'));
});

test('IndexScatter says when a division has too few missions to correlate', async () => {
	const Component = await load('IndexScatter.svelte');
	const { body } = render(Component, {
		props: { missions: indexMissions, correlation: { m: { rho: null, n: 2 }, h: { rho: -0.44721, n: 5 } }, slug: 'biological-physical', asOf: '2026-09-20' }
	});
	assert.match(body, /Too few missions to correlate\./);
	const bare = render(Component, { props: { missions: [], correlation: null, slug: 'planetary', asOf: '2026-09-20' } }).body;
	assert.match(bare, /No missions with a cost and a measure\./);
	assert.ok(!bare.includes('undefined'));
});

test('AccumulationPair names recorded lifecycle dates for screen readers', async () => {
	const Component = await load('AccumulationPair.svelte');
	const dates = { launch: '1997-10-15', primeEnd: '2002-06-30', missionEnd: '2017-09-15' };
	const { body } = render(Component, { props: { lifetime, window: windowSeries, policy, dates } });
	assert.match(body, /launch: 1997-10-15\./);
	assert.match(body, /prime end: 2002-06-30\./);
	assert.match(body, /mission end: 2017-09-15\./);
	const ongoing = render(Component, { props: { lifetime, policy, dates: { launch: dates.launch } } }).body;
	assert.doesNotMatch(ongoing, /prime end:|mission end:/);
});

test('division companion replaces the prime-phase panel while retaining the lifetime summary', async () => {
	const Component = await load('AccumulationPair.svelte');
	const { body } = render(Component, { props: { lifetime, policy, companion: () => {} } });
	assert.match(body, /65 tracked publications and 1,200 citations in total/);
	assert.doesNotMatch(body, /3-year window|publication window is not available/);
});

test('PublicationScatter prerenders selected-scope values, zero states and unavailable names', async () => {
	const rows = [
		{ id: 'a', name: 'Alpha', full: { papers: 100, top10: 12.5, outputBasis: 'measured' }, window: { papers: 10, top10: 2, outputBasis: 'measured' } },
		{ id: 'b', name: 'Beta', failed: true, full: { papers: 0, top10: 0, outputBasis: 'assumed_zero' } },
		{ id: 'c', name: 'Gamma', full: { papers: null, top10: null, outputBasis: 'unavailable' } }
	];
	const Component = await load('PublicationScatter.svelte');
	const { body } = render(Component, { props: { missions: rows, slug: 'earth' } });
	assert.match(body, /100 tracked publications · 12.5 top-10% paper credit/);
	assert.match(body, /Division reference: 12.5 credits per 100 tracked publications/);
	assert.match(body, /No tracked publications: 1 mission/);
	assert.match(body, /Assumed zero output/);
	assert.match(body, /Scores unavailable: 1 mission/);
	assert.match(body, /Gamma\./);
	const Window = await load('PublicationScatter.svelte', { scope: 'window' });
	assert.match(render(Window, { props: { missions: rows, slug: 'earth' } }).body, /Division reference: 20 credits per 100 tracked publications/);
	const empty = render(Component, { props: { missions: [], slug: 'earth' } }).body;
	assert.match(empty, /No missions with tracked publications/);
	assert.doesNotMatch(empty, /NaN|undefined|Division reference/);
});
