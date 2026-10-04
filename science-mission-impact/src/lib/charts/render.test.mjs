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
import { missionMeasureGroups, divisionMeasureGroups } from '../copy/measures.js';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..');

// encodeURIComponent leaves apostrophes alone, and a compiled component's URL is quoted inside
// the next one up, so they are escaped here as well.
const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code).replace(/'/g, '%27')}`;

const PATHS_STUB = dataUrl(`
	export const missionHref = (slug, id) => \`/\${slug}/\${id}/\`;
	export const thumbSrc = (id) => \`/img/missions/\${id}.webp\`;
	export const methodsHref = (anchor = '') => '/methods/' + (anchor ? '#' + anchor : '');
`);

const viewStub = (scope, top) => dataUrl(`export const view = { scope: ${JSON.stringify(scope)}, top: ${top} }; export const setScope = () => {}; export const setTop = () => {};`);

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

test('division timeline defaults to annual counts and keeps missing citations explicit', async () => {
	const Component = await load('LifetimeTimeline.svelte');
	const body = render(Component, { props: { lifetime: {
		years: [2000, 2001], papers: [2, 3], citations: [5, 7], partialFromYear: 2001,
		citationCoverage: { status: 'incomplete', expected: 13, observed: 12, missing: 1 }
	} } }).body;
	assert.match(body, /class="swatch pub[^>]*><\/i>Tracked publications/);
	assert.match(body, /class="swatch cite[^>]*><\/i>Citations/);
	assert.doesNotMatch(body, /<b[^>]*>2001/, 'no readout outside the plot');
	assert.match(body, /Dashed: 2001 is not yet a full year/);
	assert.match(body, /12 of 13 reported citations/);
	assert.doesNotMatch(body, /Tap or drag|Lifetime ·/);
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
	const Bars = await load('TopShareBars.svelte', { scope: 'window' });
	assert.match(render(Bars, { props }).body, /Selected mission: not measured in this scope/);
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
	const body = render(Component, { props: { missions, slug: 'earth' } }).body;
	assert.match(body, /1 of 2 missions/);
	assert.match(body, /farther left reached its first top-10% paper sooner after science operations began/);
	assert.match(body, /12 months before science start/);
	assert.match(body, /Negative months/);
	assert.doesNotMatch(body, /<details|Not plotted|Not shown/);
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

test('incomplete citation coverage is present in prerendered text', async () => {
	const Component = await load('Accumulation.svelte');
	const { body } = render(Component, { props: {
		lifetime: { ...lifetime, citationCoverage: { status: 'incomplete', expected: 1201, observed: 1200, missing: 1 } }
	} });
	assert.match(body, /1,200 of 1,201 reported citations/);
	assert.match(body, /1 missing/);
	assert.doesNotMatch(body, /undefined/);
});

test('Accumulation prerenders the lifetime summary, no window panel and no chart', async () => {
	const Component = await load('Accumulation.svelte');
	const { body } = render(Component, { props: { lifetime } });
	assert.match(body, /Lifetime/);
	assert.match(body, /65 tracked publications and 1,200 citations in total/);
	assert.doesNotMatch(body, /Window|window closed/);
	assert.ok(!body.includes('<svg'), 'no chart is drawn before the container is measured');
	const noLifetime = render(Component, { props: { lifetime: null } }).body;
	assert.match(noLifetime, /Not available for this mission\./);
	assert.ok(!noLifetime.includes('undefined'));
});

const missions = [
	// own credits that sum to the curve's shares below: 0, 3 of 10, 10 of 10
	{ id: 'alpha', name: 'Alpha', full: { top10: 0, top1: 0 }, window: { top10: 0, top1: 0 }, lifetime: { top10: 0, top1: null } },
	{ id: 'bravo', name: 'Bravo', full: { top10: 3, top1: 0 }, window: { top10: 3, top1: 0 }, lifetime: { top10: 3, top1: null } },
	{ id: 'hubble', name: 'Hubble', full: { top10: 7, top1: 9 }, window: { top10: 7, top1: 9 }, lifetime: { top10: 7, top1: null } },
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

// the readout wraps its numbers in <b>; Svelte adds <!----> anchors
const costText = (body) => body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

test('CostCurve prerenders the summary and draws nothing unmeasured', async () => {
	for (const scope of ['full', 'window']) {
		const Component = await load('CostCurve.svelte', { scope });
		const { body } = render(Component, { props: { costCurves, missions, slug: 'astrophysics', referenceCost: 150 } });
		assert.doesNotMatch(costText(body), /Missions costing|papers, running total/, scope);
		assert.match(body, /One mission has no cost on record and is not shown\./, scope);
		assert.match(body, /Running total of the division’s top-10% papers, adding missions from cheapest to costliest/, scope);
		assert.ok(!body.includes('<svg'), 'no chart is drawn before the stage is measured');
		assert.ok(!body.includes('NaN'));
	}
});

test('CostCurve reads the curve of the selected scope, full by default', async () => {
	const onlyFull = { ...costCurves, window: { 10: null, 1: null } };
	const Default = await load('CostCurve.svelte');
	assert.match(costText(render(Default, { props: { costCurves: onlyFull, missions, slug: 'astrophysics', referenceCost: 150 } }).body), /: 10 papers across/);
	// the selected mission's readout states its own credit and the running total
	const picked = render(Default, { props: { costCurves: onlyFull, missions, slug: 'astrophysics', referenceCost: 150, selectedId: 'bravo' } }).body;
	assert.match(picked, /Bravo: \$120M · 3 top-10% papers · 3 for all missions up to this cost/);
	const Window = await load('CostCurve.svelte', { scope: 'window' });
	assert.match(render(Window, { props: { costCurves: onlyFull, missions, slug: 'astrophysics' } }).body, /Not available for this view\./);
});

test('CostCurve says so when the view has no curve', async () => {
	// the tier is the page's `top` prop, not the view's
	const Component = await load('CostCurve.svelte', { scope: 'lifetime' });
	assert.match(render(Component, { props: { costCurves, missions, slug: 'astrophysics', top: 1 } }).body, /Not available for this view\./);
	for (const scope of ['full', 'window']) {
		const empty = await load('CostCurve.svelte', { scope });
		assert.match(render(empty, { props: { costCurves, missions, slug: 'astrophysics', top: 1 } }).body, /Not available for this view\./, scope);
		assert.match(render(empty, { props: { costCurves: null, missions, slug: 'astrophysics', top: 1 } }).body, /Not available for this view\./, scope);
	}
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
	assert.match(body, /aria-label="CONTOUR: \$297M, failed; counts as zero"/);
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

test('Accumulation names recorded lifecycle dates for screen readers', async () => {
	const Component = await load('Accumulation.svelte');
	const dates = { launch: '1997-10-15', primeEnd: '2002-06-30', missionEnd: '2017-09-15' };
	const { body } = render(Component, { props: { lifetime, dates } });
	assert.match(body, /launch: October 15, 1997\./);
	assert.match(body, /prime end: June 30, 2002\./);
	assert.match(body, /mission end: September 15, 2017\./);
	const ongoing = render(Component, { props: { lifetime, dates: { launch: dates.launch } } }).body;
	assert.doesNotMatch(ongoing, /prime end:|mission end:/);
});

test('TopShareBars prerenders selected-scope top-paper counts and unmeasured names', async () => {
	const rows = [
		{ id: 'a', name: 'Alpha', full: { papers: 100, top10: 12.5, outputBasis: 'measured' }, window: { papers: 10, top10: 2, outputBasis: 'measured' } },
		{ id: 'd', name: 'Delta', full: { papers: 50, top10: 2.5, outputBasis: 'measured' } },
		{ id: 'b', name: 'Beta', failed: true, full: { papers: 0, top10: 0, outputBasis: 'assumed_zero' } },
		{ id: 'c', name: 'Gamma', full: { papers: null, top10: null, outputBasis: 'unavailable' } }
	];
	const Component = await load('TopShareBars.svelte');
	const { body } = render(Component, { props: { missions: rows, slug: 'earth', selectedId: 'a', onselect: () => {} } });
	assert.match(body, /aria-pressed="true"[^>]*aria-label="Alpha: 13"/);
	assert.match(body, /aria-label="Delta: 2\.5"/);
	assert.match(body, /aria-label="Beta: 0"/);
	assert.doesNotMatch(body, /Gamma|No tracked publications in this scope|Not measured/);
	assert.match(body, /Alpha: 13 top-10% papers of 100 tracked publications/);
	assert.doesNotMatch(body, /NaN|undefined|Division average/);
	const Window = await load('TopShareBars.svelte', { scope: 'window' });
	assert.match(render(Window, { props: { missions: rows, slug: 'earth' } }).body, /aria-label="Alpha: 2"/);
	const counts = render(Component, { props: { missions: rows, slug: 'earth', rankable: false } }).body;
	assert.match(counts, /Tracked publications per mission/);
	assert.doesNotMatch(counts, /NaN|undefined/);
	const empty = render(Component, { props: { missions: [], slug: 'earth' } }).body;
	assert.match(empty, /No missions with tracked publications/);
	assert.doesNotMatch(empty, /NaN|undefined|Division average/);
});

test('MissionTable drops the top-10% column and readout for a division too small to rank', async () => {
	const Component = await load('../ui/MissionTable.svelte');
	const missions = [{ id: 'a', name: 'Alpha', launchYear: 2001, type: 'Lander', cost: 120, papers: 4, citations: 30, indices: { h: 2 }, strip: [1, 3], full: { top10: 0.5, top1: 0 }, hasThumb: false }];
	const props = { missions, slug: 'biological-physical', costBaseYear: 2025, scopeLabel: 'Active Mission Window' };
	const ranked = render(Component, { props }).body;
	assert.match(ranked, /Top-10% credit follows the scope above \(Active Mission Window\)/);
	assert.match(ranked, /class="num top/);
	const unranked = render(Component, { props: { ...props, rankable: false } }).body;
	assert.ok(!/Top-10%/.test(unranked), 'no top-10% wording');
	assert.ok(!/class="num top/.test(unranked), 'no top-10% column');
	assert.match(unranked, /Lifetime totals/);
});

const site = { asOf: '2026-09-18', windowPolicy: { kind: 'prime', postPrimeYears: 3, citationYears: 3 },
	fullPolicy: { postEndYears: 3, citationYears: 3 }, referenceCost: 150, costBaseYear: 2025 };
const spread = { mean: 12.5, median: 4, uncited: 10, i10: 30, i100: 2 };
const scope = { papers: 80, citations: 1000, top10: 6.5, top10ShareOfDivision: 0.031, top1: 0.5, top1ShareOfDivision: 0.012, spread };
const mission = {
	indices: { h: 15, g: 28, m: 0.6, i100: 2, tori: 12.34, riq: 140 },
	full: { ...scope, bounds: { start: '2004-04-01', end: '2019-10-01', status: 'available' } },
	window: { ...scope, spread: null, bounds: { start: '2004-04-01', end: '2010-07-01', status: 'available' } },
	lifetime: { ...scope, top1: null, top1ShareOfDivision: null }
};
// Each row's visible text: label, the hint's "i", value. Tips and screen-reader copies dropped.
const rowsOf = (html) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, r]) =>
	r.replace(/<span role="tooltip"[\s\S]*?<\/span>|<span class="sr-only[^"]*">[\s\S]*?<\/span>/g, '')
		.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

test('MeasureTable renders every measure of the selected scope and the dated lifetime indices', async () => {
	const Component = await load('../ui/MeasureTable.svelte');
	const html = render(Component, { props: { groups: missionMeasureGroups(mission, 'full', site) } }).body;
	assert.deepEqual(rowsOf(html), [
		'Active Mission Window · papers April 1, 2004 to October 1, 2019',
		'Tracked publicationsi80', 'Citationsi1,000', 'Mean citations per publicationi13', 'Median citations per publicationi4',
		'Uncited publicationsi10 (13%)', 'Top-10% crediti6.5 · 3.1% of division', 'Top-1% crediti0.5 · 1.2% of division',
		'Lifetime indices · every tracked publication to date, in any scope',
		'h-indexi15', 'g-indexi28', 'm-index, as of September 18, 2026i0.6', 'torii12', 'riqi140'
	]);
	assert.match(html, /role="tooltip"[^>]*>g-index: the largest g/);
	assert.match(html, /role="tooltip"[^>]*>Top 10%: [^<]*A paper naming several missions/);
	assert.match(html, /h-index[\s\S]*?href="\/methods\/"/, 'index hints link to the methods page itself');
	assert.match(html, /aria-label="What is m-index\?"/);
});

test('MeasureTable leaves top 1% out of the lifetime scope', async () => {
	const Component = await load('../ui/MeasureTable.svelte');
	const rows = rowsOf(render(Component, { props: { groups: missionMeasureGroups(mission, 'lifetime', site) } }).body);
	assert.equal(rows[0], 'Lifetime');
	assert.ok(rows.includes('Top-1% crediti— · windowed scopes only'));
});

test('MeasureTable says when a scope was not measured and still shows the lifetime indices', async () => {
	const Component = await load('../ui/MeasureTable.svelte');
	const sparse = { ...mission, indices: { h: 3, g: null, m: null, i100: 0, tori: null, riq: null } };
	assert.deepEqual(rowsOf(render(Component, { props: { groups: missionMeasureGroups(sparse, 'window', site) } }).body), [
		'Prime Mission Window', 'Not available for this view.',
		'Lifetime indices · every tracked publication to date, in any scope',
		'h-indexi3', 'g-indexi—', 'm-index, as of September 18, 2026i—', 'torii—', 'riqi—'
	]);
});

test('division MeasureTable highlights every percentile cutoff', async () => {
	const Component = await load('../ui/MeasureTable.svelte');
	const cutoffs = [0.1, 1, 5, 10, 25, 50].map((percent, i) => ({ percent, citations: 500 - i * 80, papers: i + 1 }));
	const stats = { missions: 12, papers: 900, citations: 9000, mean: 10, median: 4, uncited: 90, hIndex: 40, topDecileCitationShare: 0.45, cutoffs };
	const html = render(Component, { props: { groups: divisionMeasureGroups({ stats: { full: stats } }, 'full', site) } }).body;
	assert.equal(html.match(/class="[^"]*\bhi\b/g)?.length, 6);
	assert.match(html, /Top 0\.1%/);
});

test('ScopeSwitch prerenders the three scopes, short forms, the pressed one and a hint per scope', async () => {
	const Component = await load('../ui/ScopeSwitch.svelte', { scope: 'window' });
	const html = render(Component, { props: { site } }).body;
	for (const label of ['Active Mission Window', 'Prime Mission Window', 'Lifetime', '>Active<', '>Prime<']) assert.ok(html.includes(label), label);
	assert.match(html, /aria-pressed="true"[^>]*>(<!--[^>]*-->)*<span class="long[^"]*">Prime Mission Window/);
	assert.equal(html.match(/aria-pressed="true"/g).length, 1);
	assert.equal(html.match(/role="tooltip"/g).length, 3);
	assert.match(html, /role="tooltip"[^>]*>Papers published from the first full month after science operations begin through 3 years after the prime mission ends\. Citations are counted through the third calendar year after each paper appears\./);
	assert.match(html, /through 3 years after the mission ends\. Citations are counted through the third calendar year/);
	assert.match(html, /Every tracked publication to date, with every citation to date\./);
	for (const anchor of ['full-window', 'early-window']) assert.ok(html.includes(`href="/methods/#${anchor}"`), anchor);
	assert.ok(html.includes('href="/methods/"'));
	assert.ok(!html.includes('href="/methods/#high-impact"'));
});
