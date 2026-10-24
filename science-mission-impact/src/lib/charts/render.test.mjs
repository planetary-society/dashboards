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
import { missionMeasureGroups } from '../copy/measures.js';

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

test('division timeline labels annual publications and cumulative citations and keeps missing citations explicit', async () => {
	const Component = await load('LifetimeTimeline.svelte');
	const body = render(Component, { props: { lifetime: {
		years: [2000, 2001], papers: [2, 3], citations: [5, 7], partialFromYear: 2001,
		citationCoverage: { status: 'incomplete', expected: 13, observed: 12, missing: 1 }
	} } }).body;
	assert.match(body, /class="swatch pub[^>]*><\/i>Publications per year/);
	assert.match(body, /class="swatch cite[^>]*><\/i>Cumulative citations/);
	assert.doesNotMatch(body, /<b[^>]*>2001/, 'no readout outside the plot');
	assert.doesNotMatch(body, /<select|Dashed:|not yet a full year/);
	assert.match(body, /12 of 13 reported citations/);
	assert.doesNotMatch(body, /Tap or drag|Lifetime ·/);
	assert.doesNotMatch(body, /NaN|undefined/);
});

test('mission squares link to their mission pages and carry their labels', async () => {
	const Component = await load('../scrolly/Squares.svelte');
	const props = { tiles: [{ id: 'alpha', name: 'Alpha', division: 'earth' }], items: new Map([['alpha', { x: 0, y: 0, s: 8, label: 'Alpha: selected facts' }]]) };
	const link = render(Component, { props }).body;
	assert.match(link, /href="\/earth\/alpha\/"/);
	assert.match(link, /aria-label="Alpha: selected facts"/);
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

test('MissionTable groups missions by size, cheapest first, and drops top-10% papers for a division too small to rank', async () => {
	const Component = await load('../ui/MissionTable.svelte');
	const full = { papers: 4, citations: 30, top10: 0.5, top1: 0, status: 'available' };
	const missions = [
		{ id: 'b', name: 'Beta', launchYear: 2005, type: 'Orbiter', cost: 900, size: 'over', full },
		{ id: 'a', name: 'Alpha', launchYear: 2001, type: 'Lander', cost: 120, size: 'under', failed: true, shortfall: true, full },
		{ id: 'c', name: 'Gamma', launchYear: 2010, type: 'Lander', cost: null, size: null, full }
	];
	const props = { missions, slug: 'planetary', site };
	const ranked = render(Component, { props }).body;
	assert.match(ranked, /Small: \$150M or less/);
	assert.match(ranked, /Larger: over \$150M/);
	assert.ok(ranked.indexOf('>Alpha<') < ranked.indexOf('>Beta<'), 'small group first');
	assert.match(ranked, /class="tag[^"]*">Lost</);
	assert.match(ranked, /Cost not known/, 'a mission without a cost is neither small nor larger');
	assert.match(ranked, /class="num top/);
	const unranked = render(Component, { props: { ...props, rankable: false } }).body;
	assert.ok(!/Top-10%/.test(unranked), 'no top-10% wording');
	assert.ok(!/class="num top/.test(unranked), 'no top-10% column');
	assert.ok(!/Small:/.test(unranked), 'no size groups');
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
	assert.match(html, /role="tooltip"[^>]*>Top-10% papers: [^<]*A paper naming several missions/);
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

test('ScopeSwitch prerenders the three scopes, short forms, the pressed one and a hint per scope', async () => {
	const Component = await load('../ui/ScopeSwitch.svelte', { scope: 'window' });
	const html = render(Component, { props: { site } }).body;
	for (const label of ['Active Mission Window', 'Prime Mission Window', 'Lifetime', '>Active<', '>Prime<']) assert.ok(html.includes(label), label);
	assert.match(html, /aria-pressed="true"[^>]*>(<!--[^>]*-->)*<span class="long[^"]*">Prime Mission Window/);
	assert.equal(html.match(/aria-pressed="true"/g).length, 1);
	assert.equal(html.match(/role="tooltip"/g).length, 3);
	assert.match(html, /role="tooltip"[^>]*>Papers published from the first full month after science operations begin through three years after the prime mission ends\. Citations are counted through the third calendar year after each paper appears\./);
	assert.match(html, /through three years after the mission ends\. Citations are counted through the third calendar year/);
	assert.match(html, /Every tracked publication to date, with every citation to date\./);
	for (const anchor of ['full-window', 'early-window']) assert.ok(html.includes(`href="/methods/#${anchor}"`), anchor);
	assert.ok(html.includes('href="/methods/"'));
	assert.ok(!html.includes('href="/methods/#high-impact"'));
});
