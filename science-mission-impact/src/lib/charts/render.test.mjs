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
import { missionLine, missionMeasureGroups, scopeSpans } from '../copy/measures.js';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..');

// encodeURIComponent leaves apostrophes alone, and a compiled component's URL is quoted inside
// the next one up, so they are escaped here as well.
const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code).replace(/'/g, '%27')}`;

const PATHS_STUB = dataUrl(`
	export const missionHref = (slug, id) => \`/\${slug}/\${id}/\`;
	export const thumbSrc = (id) => \`/img/missions/\${id}.webp\`;
	export const methodsHref = (anchor = '') => '/methods/' + (anchor ? '#' + anchor : '');
	export const basemapSrc = (key) => \`/img/maps/\${key}.svg\`;
`);

const viewStub = (scope, top) => dataUrl(`export const SCOPES = ['full', 'lifetime']; export const view = { scope: ${JSON.stringify(scope)}, top: ${top} }; export const setScope = () => {}; export const setTop = () => {};`);

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
	const body = render(Component, { props: { series: {
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

test('affiliation map prerenders its sized frame, toggle and summary; the basemap waits for the reader', async () => {
	const Component = await load('AffiliationMap.svelte');
	const top = [{ name: 'NASA Goddard Space Flight Center, Maryland', papers: 203 }, { name: 'JPL', papers: 150 }];
	const summary = { papers: 1508, us: { mapped: 980, top }, world: { mapped: 1349, top } };
	const body = render(Component, { props: { summary, url: '/data/maps/missions/ace.json' } }).body;
	assert.match(body, /aria-pressed="true"[^>]*>.*United States/s);
	assert.match(body, />World</);
	// the land and the squares load when the reader nears the map; the frame already holds their space
	assert.doesNotMatch(body, /<image/);
	assert.match(body, /aspect-ratio: 975 \/ 610/);
	assert.match(body, /aria-label="[^"]*Institutions on the most papers: NASA Goddard Space Flight Center, Maryland \(203\); JPL \(150\)\./, 'the leaders, for screen readers');
	assert.doesNotMatch(body, /<p class="readout/, 'no caption under the map');
	assert.doesNotMatch(body, /class="tip/, 'no pop-up until a square is pointed at');
	assert.doesNotMatch(body, /have an author at a US institution/, 'no mapped-share line under the map');
	assert.match(body, /Loading the map/);
	// No US author: the map opens on the world.
	const abroad = render(Component, { props: { summary: { ...summary, us: { mapped: 0, top: [] } }, url: '/x.json' } }).body;
	assert.match(abroad, /aspect-ratio: 960 \/ 468/);
	assert.match(abroad, /aria-pressed="true"[^>]*>.*World/s);
	assert.doesNotMatch(body + abroad, /NaN|undefined/);
});

test('mission squares link to their mission pages and carry their labels', async () => {
	const Component = await load('../scrolly/Squares.svelte');
	const props = { tiles: [{ id: 'alpha', name: 'Alpha', division: 'earth' }], items: new Map([['alpha', { x: 0, y: 0, s: 8, label: 'Alpha: selected facts' }]]) };
	const link = render(Component, { props }).body;
	assert.match(link, /href="\/earth\/alpha\/"/);
	assert.match(link, /aria-label="Alpha: selected facts"/);
	assert.match(link, /data-sveltekit-preload-data="tap"/);
});

test('mission squares defer thumbnails without removing their links or marks', async () => {
	const Component = await load('../scrolly/Squares.svelte');
	const props = {
		tiles: [{ id: 'alpha', name: 'Alpha', division: 'earth', hasThumb: true }],
		items: new Map([['alpha', { x: 0, y: 0, s: 8 }]]),
		shown: 0
	};
	const deferred = render(Component, { props: { ...props, loadImages: false } }).body;
	assert.doesNotMatch(deferred, /<img/);
	assert.match(deferred, /href="\/earth\/alpha\/"/);
	assert.match(deferred, /class="fill/);
	assert.match(render(Component, { props }).body, /<img src="\/img\/missions\/alpha.webp"/);
});

test('MissionTable lists every mission together, earliest launch first, and drops top-10% papers for a division too small to rank', async () => {
	const Component = await load('../ui/MissionTable.svelte');
	const full = { papers: 4, citations: 30, top10: 0.5, top1: 0, status: 'available' };
	const missions = [
		{ id: 'b', name: 'Beta', launchYear: 2001, launchDate: '2001-11-02', type: 'Orbiter', cost: 900, size: 'over', full },
		{ id: 'a', name: 'Alpha', launchYear: 2001, launchDate: '2001-03-20', type: 'Lander', cost: 120, size: 'under', failed: true, shortfall: true, outcome: 'Failure', full },
		{ id: 'c', name: 'Gamma', launchYear: 1995, launchDate: '1995-06-01', type: 'Lander', cost: null, size: null, full }
	];
	const props = { missions, slug: 'planetary', site };
	const ranked = render(Component, { props }).body;
	assert.doesNotMatch(ranked, /Small:|Larger:|Cost not known/, 'no size groups');
	const at = (name) => ranked.indexOf(`>${name}<`);
	assert.ok(at('Gamma') < at('Alpha') && at('Alpha') < at('Beta'), 'by launch date, not year then name');
	assert.match(ranked, /aria-sort="ascending"[^>]*>[\s\S]*?Launch/);
	assert.match(ranked, /class="tag[^"]*">Failure</);
	assert.match(ranked, /class="num top/);
	const unranked = render(Component, { props: { ...props, rankable: false } }).body;
	assert.ok(!/Top-10%/.test(unranked), 'no top-10% wording');
	assert.ok(!/class="num top/.test(unranked), 'no top-10% column');
});

const site = { asOf: '2026-09-18', windowPolicy: { kind: 'prime', postPrimeYears: 3, citationYears: 3 },
	fullPolicy: { postEndYears: 3, citationYears: 3 }, referenceCost: 150, costBaseYear: 2025 };
const spread = { mean: 12.5, median: 4, uncited: 10, i10: 30, i100: 2 };
const scope = { papers: 80, citations: 1000, top10: 6.5, top10ShareOfDivision: 0.031, top1: 0.5, top1ShareOfDivision: 0.012, spread };
const mission = {
	indices: { h: 15, g: 28, m: 0.6, i100: 2, tori: 12.34, riq: 140 },
	full: { ...scope, bounds: { start: '2004-04-01', end: '2019-10-01', status: 'available' }, indices: { h: 9, g: 14, m: 0.581 } },
	window: { ...scope, spread: null, bounds: { start: '2004-04-01', end: '2010-07-01', status: 'available' } },
	lifetime: { ...scope, top1: null, top1ShareOfDivision: null }
};
// Each row's visible text: label, the hint's "i", value. Tips and screen-reader copies dropped.
const rowsOf = (html) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, r]) =>
	r.replace(/<span role="tooltip"[\s\S]*?<\/span>|<span class="sr-only[^"]*">[\s\S]*?<\/span>/g, '')
		.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

test('MeasureTable renders every measure of the selected scope, its own h, g and m, and lifetime tori and riq', async () => {
	const Component = await load('../ui/MeasureTable.svelte');
	const html = render(Component, { props: { groups: missionMeasureGroups(mission, 'full', site) } }).body;
	assert.deepEqual(rowsOf(html), [
		'',
		'Tracked publicationsi80', 'Citationsi1,000', 'Top-10% papersi6.5', 'Top-1% papersi0.5',
		'Citation indices',
		'h-indexi9', 'g-indexi14', 'm-indexi0.6', 'torii12', 'riqi140'
	]);
	assert.match(html, /role="tooltip"[^>]*>m-index: the window’s h-index divided by the window’s length/);
	assert.match(html, /role="tooltip"[^>]*>g-index: the largest g/);
	assert.match(html, /role="tooltip"[^>]*>Top-10% papers: [^<]*A paper naming several missions/);
	assert.match(html, /h-index[\s\S]*?href="\/methods\/"/, 'index hints link to the methods page itself');
	assert.match(html, /aria-label="What is m-index\?"/);
});

test('missionLine: type, selection, management, launch, status and both life-cycle costs, dropping what the catalog leaves blank', () => {
	const meta = { type: 'Orbiter', selection: 'competed', management: 'pi', status: 'Completed', lcc: 244, cost: 538, dates: { launch: '1997-08-25' } };
	assert.deepEqual(missionLine(meta, site), { lead: 'Orbiter · Competed · PI-led · Launched on August 25, 1997 · Completed · ', cost: 'LCC: $244M/$538M (2025 $)' });
	assert.deepEqual(missionLine({ ...meta, type: null, selection: null, lcc: null }, site), { lead: 'PI-led · Launched on August 25, 1997 · Completed · ', cost: 'LCC: —/$538M (2025 $)' }, 'an unknown cost is a dash, never a zero');
	assert.deepEqual(missionLine({ status: 'unknown', lcc: 95, cost: null, dates: { launch: null } }, site), { lead: '', cost: 'LCC: $95M/— (2025 $)' }, 'a lone cost has no separator');
	assert.deepEqual(missionLine({ status: 'unknown', lcc: null, cost: null, dates: { launch: null } }, site), { lead: '', cost: null });
});

test('MeasureTable leaves top 1% out of the lifetime scope and dates the lifetime m-index in its hint', async () => {
	const Component = await load('../ui/MeasureTable.svelte');
	const html = render(Component, { props: { groups: missionMeasureGroups(mission, 'lifetime', site) } }).body;
	const rows = rowsOf(html);
	assert.equal(rows[0], '', 'the counts go unheaded');
	assert.ok(!rows.some((r) => r.startsWith('Top-1%')), 'no top-1% row');
	assert.deepEqual(rows.slice(-5), ['h-indexi15', 'g-indexi28', 'm-indexi0.6', 'torii12', 'riqi140']);
	assert.match(html, /role="tooltip"[^>]*>m-index: [^<]*as of September 18, 2026/);
});

test('MeasureTable says when a scope was not measured and still lists the citation indices', async () => {
	const Component = await load('../ui/MeasureTable.svelte');
	const sparse = { ...mission, full: { ...mission.full, spread: null, indices: null }, indices: { h: 3, g: null, m: null, i100: 0, tori: null, riq: null } };
	assert.deepEqual(rowsOf(render(Component, { props: { groups: missionMeasureGroups(sparse, 'full', site) } }).body), [
		'', 'Not available for this view.',
		'Citation indices',
		'h-indexi—', 'g-indexi—', 'm-indexi—', 'torii—', 'riqi—'
	]);
});

test('ScopeSwitch prerenders the active window and lifetime, short forms, the pressed one and a hint per scope', async () => {
	const Component = await load('../ui/ScopeSwitch.svelte', { scope: 'lifetime' });
	const html = render(Component, { props: { site } }).body;
	for (const label of ['Active Mission Window', 'Lifetime', '>Active<']) assert.ok(html.includes(label), label);
	assert.doesNotMatch(html, /Prime/, 'no prime-phase option');
	assert.match(html, /aria-pressed="true"[^>]*>(<!--[^>]*-->)*<span class="long[^"]*">Lifetime/);
	assert.equal(html.match(/aria-pressed="true"/g).length, 1);
	assert.equal(html.match(/role="tooltip"/g).length, 2);
	assert.match(html, /through three years after the mission ends\. Citations are counted through the third calendar year/);
	assert.match(html, /Every tracked publication to date, with every citation to date\./);
	assert.equal(html.match(/href="\/methods\/#windows"/g).length, 2, 'both scopes’ hints link to the windows section');
	assert.ok(!html.includes('href="/methods/#early-window"'));
	assert.ok(!html.includes('href="/methods/#high-impact"'));
});

test('scopeSpans dates each scope for the scope switch: the window\'s bounds, then first paper to the as-of date', async () => {
	const named = { ...mission, name: 'HETE 2', facts: { publicationYears: [2002, 2024] } };
	assert.deepEqual(scopeSpans(named, site), {
		full: 'For HETE 2, papers published April 1, 2004 to October 1, 2019.',
		lifetime: 'For HETE 2, papers published from 2002 to September 18, 2026.'
	});
	const unmeasured = scopeSpans({ ...named, full: { ...named.full, spread: null }, facts: {} }, site);
	assert.ok(!unmeasured.full && !unmeasured.lifetime, 'an unmeasured window and no papers get no dates');
	const Component = await load('../ui/ScopeSwitch.svelte', { scope: 'full' });
	const html = render(Component, { props: { site, spans: scopeSpans(named, site) } }).body;
	assert.match(html, /role="tooltip"[^>]*>Papers published from the first full month[^<]*For HETE 2, papers published April 1, 2004 to October 1, 2019\./);
});
