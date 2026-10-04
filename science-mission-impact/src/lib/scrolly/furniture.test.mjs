/**
 * Server-render smoke test for the story's furniture. The overview is prerendered, so what
 * these components emit is what a crawler sees and what the reader sees before the stage is
 * measured: the figures have to be in that HTML, formatted, with no undefined or NaN leaking
 * out of a missing field.
 *
 * The components are compiled here and imported as data URLs with every specifier resolved by
 * hand, as in charts/render.test.mjs, which keeps the test independent of vite. The layouts are
 * small hand-built fixtures with the fields each component reads; layouts.test.mjs covers the
 * real geometry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { scaleLinear, scaleLog } from 'd3-scale';
import { waffleLayout } from './layouts.js';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..');

// encodeURIComponent leaves apostrophes alone, and a compiled component's URL is quoted inside
// the next one up, so they are escaped here as well.
const dataUrl = (code) => `data:text/javascript,${encodeURIComponent(code).replace(/'/g, '%27')}`;

/** One specifier as something node can import. A component imported in turn is compiled too. */
async function resolveSpec(spec, dir) {
	const abs = spec.startsWith('$lib/') ? join(lib, spec.slice(5)) : spec.startsWith('.') ? join(dir, spec) : null;
	if (!abs) return import.meta.resolve(spec);
	return abs.endsWith('.svelte') ? compiled(abs) : pathToFileURL(abs).href;
}

async function compiled(file) {
	const source = await readFile(file, 'utf8');
	const { js } = compile(source, { filename: file, generate: 'server', runes: true });
	const dir = dirname(file);
	const urls = new Map();
	for (const spec of new Set([...js.code.matchAll(/\bfrom\s*'([^']+)'/g)].map((m) => m[1]))) {
		urls.set(spec, await resolveSpec(spec, dir));
	}
	return dataUrl(js.code.replace(/(\bfrom\s*)'([^']+)'/g, (match, keyword, spec) => `${keyword}'${urls.get(spec)}'`));
}

const load = async (name) => (await import(await compiled(join(here, name)))).default;

const clean = (body) => {
	assert.ok(!body.includes('undefined'), 'no undefined in the HTML');
	assert.ok(!body.includes('NaN'), 'no NaN in the HTML');
};

const stage = { width: 900, height: 600, visible: true };
const referenceCost = 100;
const costTicks = [10, 100, 1000, 10000];
// the cost layout's x, as the later states borrow it: a log scale inside a 96px label gutter
const x = scaleLog().domain([5, 20000]).range([105, 867]);

// --- ComparisonLabels -----------------------------------------------------------------------

const side = (missions, failed, withTop, top10) => ({ missions, failed, withTop, top10, top10PerMission: missions ? top10 / missions : null });
const comparison = {
	divisions: ['astrophysics', 'earth', 'heliophysics', 'planetary'],
	unavailable: 0,
	// the panels show each division apart, not the equal-weight averages or the pooled groups
	equalWeight: { under: 3.637, over: 127.959 },
	groups: [
		{ key: 'under', missions: 35, failed: 7, withTop: 10, top10: 160.207, top10PerMission: 4.577 },
		{ key: 'over', missions: 94, failed: 7, withTop: 87, top10: 11205.292, top10PerMission: 119.205 }
	],
	byDivision: [
		{ division: 'astrophysics', name: 'Astrophysics', under: side(6, 1, 1, 1.15), over: side(19, 0, 19, 4983.749) },
		{ division: 'earth', name: 'Earth Science', under: side(12, 2, 2, 1.333), over: side(28, 3, 25, 3845.667) },
		{ division: 'heliophysics', name: 'Heliophysics', under: side(12, 2, 5, 148.274), over: side(17, 0, 17, 1294.226) },
		{ division: 'planetary', name: 'Planetary Science', under: side(5, 2, 2, 9.45), over: side(30, 4, 26, 1081.65) }
	]
};

test('ComparisonLabels prerenders one bar pair per division either side of the threshold, on one shared ruler', async () => {
	const Component = await load('ComparisonLabels.svelte');
	const { body } = render(Component, { props: { comparison, referenceCost: 150, visible: true } });
	for (const t of ['Top-10% papers per mission', '$150M or less', 'Over $150M']) assert.ok(body.includes(t), t);
	for (const [name, under, over] of [
		['Astrophysics', '0.2', '262'],
		['Earth Science', '0.1', '137'],
		['Heliophysics', '12', '76'],
		['Planetary Science', '1.9', '36']
	]) {
		assert.match(body, new RegExp(`>${under}<[^]*?>${over}<[^]*?>${name}<`), `${name}: ${under} against ${over}`);
	}
	assert.ok(!body.includes('>3.6<') && !body.includes('>128<'), 'not the equal-weight averages');
	for (const t of ['6 and 19 missions', '1 and 0 failed', '5 and 30 missions', '2 and 4 failed']) assert.ok(body.includes(t), t);
	assert.equal((body.match(/height: max\(2px, 100%\)/g) ?? []).length, 1, 'only the tallest bar of all four fills its plot');
	assert.match(body, /class="bars[^"]*\bvisible\b/);
	clean(body);
});

test('ComparisonLabels shows a dash, not NaN, for a side with no missions, and drops the meta line on a phone', async () => {
	const Component = await load('ComparisonLabels.svelte');
	const empty = { ...comparison, byDivision: [{ ...comparison.byDivision[0], under: side(0, 0, 0, 0) }, comparison.byDivision[1]] };
	const { body } = render(Component, { props: { layout: { blocks: [] }, comparison: empty, referenceCost: 150, compact: true } });
	assert.match(body, />—</);
	assert.ok(!body.includes('missions'), 'no meta line on a phone');
	assert.equal((body.match(/height: max\(2px, 0%\)/g) ?? []).length, 4, 'hidden bars sit at their 2px floor');
	clean(body);
});

// --- Skyline --------------------------------------------------------------------------------

const years = scaleLinear().domain([1980, 2021]).range([64, 828]);
const skyline = {
	columns: [
		{ id: 'hubble', x: 300, y: 80, w: 2, h: 400, papers: 16885 },
		{ id: 'cubesat', x: 800, y: 470, w: 2, h: 10, papers: 12 }
	],
	labels: [{ id: 'hubble', name: 'Hubble', papers: 16885, x: 301, y: 76, anchor: 'middle', box: { x: 250, w: 100 }, leader: null }],
	ground: 480,
	top: 28,
	left: 64,
	right: 828,
	x: years,
	lineH: 15
};

test('Skyline prerenders the columns, the largest names, the year ticks and the running total', async () => {
	const Component = await load('Skyline.svelte');
	const { body } = render(Component, { props: { layout: skyline, total: 146165, rise: 1, ...stage } });
	assert.ok(body.includes('>146,165<'), 'the full total once risen');
	assert.ok(body.includes('Hubble 16,885'));
	assert.equal((body.match(/<rect /g) ?? []).length, 2, 'one column per mission');
	for (const t of ['1980', '2000', '2020']) assert.ok(body.includes(`>${t}<`), t);
	assert.match(body, /class="skyline[^"]*\bvisible\b/);
	clean(body);
});

test('Skyline before it rises: a zero count and flat columns', async () => {
	const Component = await load('Skyline.svelte');
	const { body } = render(Component, { props: { layout: skyline, total: 146165, rise: 0, ...stage, compact: true } });
	assert.match(body, />0</);
	assert.match(body, /scaleY\(0\)/);
	clean(body);
});

// --- FailureLabels --------------------------------------------------------------------------

const failure = {
	statuses: ['failure', 'partial failure', 'partial success'],
	under: { missions: 40, failed: 9, rate: 0.225 },
	over: { missions: 94, failed: 7, rate: 7 / 94 },
	higher: 'under',
	byDivision: [
		{ division: 'astrophysics', name: 'Astrophysics', under: { missions: 12, failed: 3 }, over: { missions: 22, failed: 1 } },
		{ division: 'earth', name: 'Earth Science', under: { missions: 0, failed: 0 }, over: { missions: 40, failed: 2 } }
	]
};
const failureL = {
	pos: new Map(),
	s: 18,
	stacked: false,
	left: 236,
	headH: 76,
	bottomY: 300,
	dividerX: 450,
	underRight: 430,
	overLeft: 470,
	rows: [
		{ division: 'astrophysics', label: 'Astrophysics', y: 76, h: 112, band: false, nameY: 81, figuresY: 170, under: 12, over: 22 },
		{ division: 'earth', label: 'Earth Science', y: 188, h: 112, band: true, nameY: 193, figuresY: 282, under: 0, over: 40 }
	]
};

test('FailureLabels prerenders both rates, the division names and n of m per side', async () => {
	const Component = await load('FailureLabels.svelte');
	const { body } = render(Component, { props: { layout: failureL, failure, referenceCost: 150, visible: true } });
	for (const t of ['$150M or less', 'Over $150M', '>23%<', '>7.4%<', '>Astrophysics<', '>Earth Science<', '3 of 12', '1 of 22', '2 of 40']) assert.ok(body.includes(t), t);
	assert.ok(!body.includes('0 of 0'), 'a side with no missions prints nothing');
	assert.equal((body.match(/class="band[ "]/g) ?? []).length, 2);
	clean(body);
});

// --- ClpsChart ------------------------------------------------------------------------------

const clps = {
	program: 'Commercial Lunar Payload Services (CLPS)',
	start: '2024-01-08',
	horizonMonths: 36,
	missions: [
		{ id: 'peregrine', name: 'Peregrine', papers: 3 },
		{ id: 'im_1_odysseus', name: 'IM-1 Odysseus', papers: 5 },
		{ id: 'cp_11', name: 'CP-11', papers: null }
	],
	series: [...Array.from({ length: 32 }, (_, i) => Math.floor(i / 2)), 31, null, null, null, null],
	comparators: [
		{ id: 'lcross', name: 'LCROSS', fullName: 'LCROSS', start: '2009-06-18', cost: 120, papers: 40, series: Array.from({ length: 37 }, (_, i) => Math.round((i * 23) / 36)) },
		{ id: 'mars_pathfinder', name: 'Mars Pathfinder', fullName: 'Mars Pathfinder', start: '1997-07-04', cost: 400, papers: 300, series: Array.from({ length: 37 }, (_, i) => i * 2) }
	]
};

test('ClpsChart prerenders the running lines with end labels, stopping where the data stops', async () => {
	const Component = await load('ClpsChart.svelte');
	const { body } = render(Component, { props: { clps, draw: 1, drawComparators: 1, ...stage } });
	for (const t of ['Peregrine,', 'Odysseus', '>31<', 'LCROSS 23', 'Mars Pathfinder 72', '36 months']) assert.ok(body.includes(t), t);
	assert.ok(!body.includes('CLPS 31'), 'the CLPS label names its landers instead');
	assert.ok(!body.includes('CP-11'), 'a lander with no papers is not named');
	assert.ok(body.includes('>IM-1 Odysseus<'), 'a name is never broken across lines');
	assert.equal((body.match(/<path /g) ?? []).length, 3);
	clean(body);
});

test('ClpsChart on a phone before it draws', async () => {
	const Component = await load('ClpsChart.svelte');
	const { body } = render(Component, { props: { clps, draw: 0, drawComparators: 0, ...stage, compact: true } });
	for (const t of ['Peregrine,', 'Odysseus', '>31<']) assert.ok(body.includes(t), t);
	assert.ok(!body.includes('CLPS 31'));
	assert.match(body, /stroke-dashoffset="1"/);
	clean(body);
});

// Poppins' glyph box is 1.4em: blocks closer than that touch even when their lines do not.
test('ClpsChart end-label blocks never touch, on a phone or not', async () => {
	const Component = await load('ClpsChart.svelte');
	for (const [compact, lineH, apart] of [
		[true, 13, 16],
		[false, 15, 19]
	]) {
		const { body } = render(Component, { props: { clps, draw: 1, drawComparators: 1, ...stage, compact } });
		const blocks = [...body.matchAll(/<text class="label[^>]*\by="([-\d.]+)"[^>]*>(.*?)<\/text>/g)]
			.map(([, y, inner]) => ({ top: +y, last: +y + ((inner.match(/<tspan/g) ?? []).length - 1) * lineH }))
			.sort((a, b) => a.top - b.top);
		assert.equal(blocks.length, 3);
		for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i].top - blocks[i - 1].last >= apart - 1e-9, `compact=${compact}: block ${i} clears the one above`);
	}
});

// --- ProjectTimeAxis ------------------------------------------------------------------------

const y = scaleLinear().domain([0, 15]).range([38, 540]);
const time = { pos: new Map(), x, y, left: 96, top: 28, neverTop: 564, never: 9, reached: 26, ticks: [0, 5, 10, 15] };

test('ProjectTimeAxis prerenders the project-start line, the year rules and the never lane', async () => {
	const Component = await load('ProjectTimeAxis.svelte');
	const { body } = render(Component, { props: { layout: time, ticks: costTicks, referenceCost, ...stage } });
	assert.ok(body.includes('Project start'));
	for (const t of ['5 yr', '10 yr', '15 yr']) assert.ok(body.includes(t), t);
	assert.ok(body.includes('No top-10% paper: 9'));
	for (const t of ['$10M', '$100M', '$1B', '$10B']) assert.ok(body.includes(`>${t}<`), t);
	assert.match(body, /class="cost\b[^"]*\breference-tick\b[^>]*>\$100M</, 'the reference cost is the marked tick');
	assert.match(body, /class="reference[ "]/, 'the reference line is drawn inside the axis');
	assert.match(body, /class="rule\b[^"]*\bzero\b[^>]*y1="38"/, 'the project-start rule');
	assert.match(body, /class="rule\b[^"]*\bnever\b[^>]*y1="564"/, 'the never-lane rule');
	clean(body);
});

test('ProjectTimeAxis on a phone: a short start label inside the plot', async () => {
	const Component = await load('ProjectTimeAxis.svelte');
	const { body } = render(Component, { props: { layout: { ...time, left: 0, never: 0 }, ticks: costTicks, referenceCost, ...stage, compact: true } });
	assert.match(body, />Start</);
	assert.ok(!body.includes('Project start'));
	assert.match(body, /class="tick\b[^"]*\binside\b[^>]*>Start</, 'the year labels sit inside the plot');
	assert.ok(body.includes('No top-10% paper: 0'));
	clean(body);
});

// --- PerDollarAxis --------------------------------------------------------------------------

const scale = scaleLog().domain([7.46, 47132]).range([0, 1]).clamp(true);
const dollar = {
	pos: new Map(),
	x,
	left: 236,
	top: 28,
	bottomY: 568,
	scale,
	rateTicks: [10, 100, 1000, 10000],
	rows: [
		{ slug: 'astrophysics', label: 'Astrophysics', missions: 25, zeros: 1, y: 28, h: 180, band: false, shelfY: 202, curveTop: 40 },
		{ slug: 'earth', label: 'Earth Science', missions: 40, zeros: 9, y: 208, h: 180, band: true, shelfY: 382, curveTop: 220 },
		{ slug: 'planetary', label: 'Planetary Science', missions: 35, zeros: 7, y: 388, h: 180, band: false, shelfY: 562, curveTop: 400 }
	]
};

const perDollar = [
	{
		division: 'astrophysics',
		name: 'Astrophysics',
		groups: [
			{ key: 'under', missions: 3, cost: 38.9, citations: 178, perHundredM: 457.584 },
			{ key: 'over', missions: 22, cost: 34440.6, citations: 1251426, perHundredM: 3633.578 }
		]
	},
	// a side with no missions has no rate: it prints as a dash, never as a zero
	{
		division: 'earth',
		name: 'Earth Science',
		groups: [
			{ key: 'under', missions: 0, cost: 0, citations: 0, perHundredM: null },
			{ key: 'over', missions: 40, cost: 30716.5, citations: 595905, perHundredM: 1940.0 }
		]
	},
	// a measured zero stays a zero
	{
		division: 'planetary',
		name: 'Planetary Science',
		groups: [
			{ key: 'under', missions: 3, cost: 82.1, citations: 0, perHundredM: 0 },
			{ key: 'over', missions: 32, cost: 38536.4, citations: 157632, perHundredM: 409.047 }
		]
	}
];

test('PerDollarAxis prerenders each division with its rate either side of the reference', async () => {
	const Component = await load('PerDollarAxis.svelte');
	const { body } = render(Component, { props: { layout: dollar, perDollar, referenceCost, ticks: costTicks, ...stage } });
	for (const name of ['Astrophysics', 'Earth Science', 'Planetary Science']) assert.ok(body.includes(`>${name}<`), name);
	assert.ok(body.includes('$100M or less: 458 · Over $100M: 3,634'));
	assert.ok(body.includes('$100M or less: — · Over $100M: 1,940'));
	assert.ok(body.includes('$100M or less: 0 · Over $100M: 409'));
	// the rate scale is labelled once, on the first row
	for (const r of ['10', '100', '1k', '10k']) assert.match(body, new RegExp(`class="rate-label[^"]*"[^>]*>${r}<`), r);
	assert.equal((body.match(/class="rate-label[ "]/g) ?? []).length, 4);
	assert.equal((body.match(/class="shelf[ "]/g) ?? []).length, 3, 'one shelf per row');
	assert.match(body, /class="reference[ "]/);
	clean(body);
});

test('PerDollarAxis on a phone: both rates in short form, each side named, one rate label', async () => {
	const Component = await load('PerDollarAxis.svelte');
	const { body } = render(Component, { props: { layout: { ...dollar, left: 0 }, perDollar, referenceCost, ticks: costTicks, ...stage, compact: true } });
	assert.ok(body.includes('≤$100M 458 · over 3.6k'));
	assert.ok(body.includes('≤$100M — · over 1.9k'));
	assert.ok(body.includes('≤$100M 0 · over 409'));
	assert.equal((body.match(/class="rate-label[ "]/g) ?? []).length, 1, 'the top rule only');
	assert.match(body, /class="rate-label[^"]*\binside\b[^>]*>10k</);
	clean(body);
});

// --- KindBars / KindExample -------------------------------------------------------------------

const kindKeys = [
	['results', 'Science results', true, 'Science'],
	['data', 'Data and calibration', true, 'Data'],
	['mission', 'Mission and instrument', false, 'Mission'],
	['review', 'Reviews and commentary', false, 'Reviews'],
	['future', 'Planned or expected results', false, 'Planned'],
	['other', 'Mentions only', false, 'Mentions']
];
const byKind = (o) => Object.fromEntries(kindKeys.map(([k]) => [k, { papers: o[k]?.[0] ?? 0, citations: o[k]?.[1] ?? 0 }]));
const kindMission = (id, name, cost, o) => {
	const b = byKind(o);
	const papers = Object.values(b).reduce((a, v) => a + v.papers, 0);
	const citations = Object.values(b).reduce((a, v) => a + v.citations, 0);
	return { id, name, division: 'earth', cost, papers, citations, byKind: b, nonScienceShare: null };
};
const raincube = {
	...kindMission('raincube', 'RainCube', 13.2, { mission: [3, 40], review: [1, 120], results: [1, 9] }),
	fullName: 'Radar in a CubeSat',
	lifetime: {
		papers: 4,
		citations: 172,
		byKind: byKind({ mission: [3, 43], review: [1, 120], results: [1, 9] }),
		list: [
			{ bibcode: '2020b', title: 'Small satellites for weather: a review', year: 2020, firstAuthor: 'Smith', citations: 120, inScope: true, kind: 'review', note: 'one review, most of the citations' },
			{ bibcode: '2019a', title: 'RainCube: the first radar in a CubeSat', year: 2019, firstAuthor: 'Peral', citations: 40, inScope: true, kind: 'mission', note: '' },
			{ bibcode: '2021c', title: 'Precipitation profiles from RainCube', year: 2021, firstAuthor: 'Lee', citations: 9, inScope: true, kind: 'results', note: '' },
			{ bibcode: '2024d', title: 'RainCube lessons learned', year: 2024, firstAuthor: 'Ng', citations: 3, inScope: false, kind: 'mission', note: '' }
		],
		top: { bibcode: '2020b', title: 'Small satellites for weather: a review', citations: 120, kind: 'review', note: '', citationShare: 0.69767 },
		firstResult: { bibcode: '2021c', title: 'Precipitation profiles from RainCube', citations: 9, citationShare: 0.05233 }
	}
};
const kinds = {
	scope: 'full',
	asOf: '2026-09-18',
	method: '',
	kinds: kindKeys.map(([key, label, science, short]) => ({ key, label, short, science })),
	missions: [raincube, kindMission('cubesat2', 'TwoSat', 20, { results: [2, 1234] }), kindMission('empty', 'Nothing', 5, {})],
	withPapers: 2,
	withoutPapers: 1,
	total: { papers: 7, citations: 1403, byKind: byKind({ mission: [3, 40], review: [1, 120], results: [3, 1243] }) },
	nonScience: { papers: 4, paperShare: 0.57, citations: 160, citationShare: 0.11 },
	majorityNonScience: 1,
	examples: [raincube]
};
const kindsL = {
	rows: [
		{ id: 'raincube', y: 44, h: 27 },
		{ id: 'cubesat2', y: 74, h: 27 }
	],
	s: 27,
	pitch: 30,
	headH: 44,
	left: 24,
	nameW: 110,
	barX: 177,
	barW: 655,
	valueW: 44,
	valueX: 838,
	strip: { y: 128, ids: ['empty'] },
	fontPx: 12
};

test('KindBars prerenders names, the non-zero legend, counts per mode and the strip label', async () => {
	const Component = await load('KindBars.svelte');
	const papers = render(Component, { props: { layout: kindsL, kinds, visible: true } }).body;
	for (const t of ['>RainCube<', '>TwoSat<', 'Science results', 'Mission and instrument', 'Reviews and commentary', '>Papers<', '>5<', '>2<', '1 with no publications in their window']) assert.ok(papers.includes(t), t);
	for (const t of ['Data and calibration', 'Planned or expected results', 'Mentions only']) assert.ok(!papers.includes(t), `no ${t}`);
	assert.match(papers, /kind-review[^"]*" style="width: 20%;"/, 'a fifth of the papers');
	clean(papers);
	const cites = render(Component, { props: { layout: kindsL, kinds, mode: 'citations', visible: true, compact: true } }).body;
	for (const t of ['>Citations<', '>169<', '>1,234<', 'Reviews<', 'Science<']) assert.ok(cites.includes(t), t);
	assert.ok(!cites.includes('Reviews and commentary'), 'compact uses short labels');
	clean(cites);
});

test('KindExample prerenders the name, the cost line, every title and a note', async () => {
	const Component = await load('KindExample.svelte');
	const layout = { pos: new Map(), s: 64, left: 24, top: 16, headRight: 100, listY: 102 };
	const { body } = render(Component, { props: { layout, example: raincube, kinds, visible: true } });
	for (const t of ['>RainCube<', '$13M · 4 papers to date · 172 citations', ...raincube.lifetime.list.map((p) => p.title), 'one review, most of the citations', 'Reviews and commentary', '3 citations · Mission and instrument · outside its Active Mission Window']) assert.ok(body.includes(t), t);
	const rowOf = (title) => body.slice(body.lastIndexOf('<li', body.indexOf(title)), body.indexOf(title));
	assert.match(rowOf('Precipitation profiles from RainCube'), /class="[^"]*\bhit\b/);
	assert.match(rowOf('RainCube lessons learned'), /class="[^"]*\bdim\b/);
	clean(body);
});

// --- Waffle ---------------------------------------------------------------------------------

test('Waffle prerenders one box per unit, the threshold missions first in blue, a partial box and the legend', async () => {
	const Component = await load('Waffle.svelte');
	const layout = waffleLayout(135129, 1329, 704, 666, { top: 96 });
	const { body } = render(Component, { props: { layout, referenceCost: 150, visible: true, width: 704, height: 666 } });
	const rects = [...body.matchAll(/<rect class="(on|off)\b[^"]*" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(([, c, ...n]) => [c, ...n.map(Number)]);
	// every cell, then the partial fill drawn over cell 13
	assert.equal(rects.length, layout.cells + 1);
	const cells = rects.slice(0, layout.cells);
	assert.equal(cells.filter(([c]) => c === 'on').length, 13);
	assert.ok(cells.every(([c], i) => (c === 'on') === (i < 13)), 'cells 0–12 blue, the rest grey');
	const [c, x, y, , h] = rects.at(-1);
	assert.ok(c === 'on' && x === cells[13][1], 'the partial fill sits on cell 13');
	assert.ok(Math.abs(h - layout.size * 0.29) < 1e-9 && Math.abs(y + h - (cells[13][2] + layout.size)) < 1e-9, 'filled 29% from the bottom');
	for (const t of ['Missions at $150M or less', 'All other missions', '1 box = 100 mission papers']) assert.ok(body.includes(t), t);
	assert.match(body, /class="waffle[^"]*\bvisible\b/);
	clean(body);
});

test('Waffle builds from the top-left: half built shows the blue boxes first; built shows the ring and the count', async () => {
	const Component = await load('Waffle.svelte');
	const layout = waffleLayout(135129, 1329, 704, 666, { top: 96 });
	const props = { layout, referenceCost: 150, visible: true, width: 704, height: 666 };
	const cellsOf = (body) => [...body.matchAll(/<rect class="(on|off)([^"]*)"/g)].slice(0, layout.cells).map(([, c, rest]) => ({ on: c === 'on', hidden: /\bhidden\b/.test(rest) }));

	const half = render(Component, { props: { ...props, build: 0.5 } }).body;
	const cells = cellsOf(half);
	const shown = Math.round(layout.cells / 2);
	assert.equal(cells.filter((c) => c.hidden).length, layout.cells - shown, 'about half hidden');
	assert.ok(cells.every((c, i) => c.hidden === i >= shown), 'the shown ones are the first in reading order');
	assert.ok(cells.filter((c) => c.on).every((c) => !c.hidden), 'the blue boxes are in first');
	assert.doesNotMatch(half, /class="ring[^"]*\bdone\b/, 'no ring during the build-out');

	const built = render(Component, { props: { ...props, build: 1 } }).body;
	assert.ok(!/<rect[^>]*\bhidden\b/.test(built), 'every box visible');
	assert.match(built, new RegExp(`<path class="ring[^"]*\\bdone\\b[^"]*" d="${layout.ring.d}" pathLength="1" stroke-dasharray="1"`));
	assert.match(built, /<text class="count[^"]*\bdone\b[^>]*x="248"[^>]*>1,329 papers<\/text>/);
	clean(built);
});
