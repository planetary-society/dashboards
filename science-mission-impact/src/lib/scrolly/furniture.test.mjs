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
import { splitLayout, focusLayout, costLayout, primerLayout } from './layouts.js';

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

// --- Skyline --------------------------------------------------------------------------------

const years = scaleLinear().domain([1980, 2021]).range([64, 828]);
const skyline = {
	columns: [
		{ id: 'hubble', name: 'Hubble', x: 300, y: 80, w: 2, h: 400, papers: 16885, cited: 1164186 },
		{ id: 'cubesat', name: 'CubeSat', x: 800, y: 470, w: 2, h: 10, papers: 12, cited: 40 }
	],
	ground: 480,
	top: 28,
	left: 64,
	right: 828,
	x: years,
	lineH: 15,
	room: 400,
	most: 16885
};

test('Skyline prerenders the columns, the year ticks and the running total, and no names', async () => {
	const Component = await load('Skyline.svelte');
	const { body } = render(Component, { props: { layout: skyline, total: 146165, rise: 1, ...stage } });
	assert.ok(body.includes('>146,165<'), 'the full total once risen');
	assert.ok(!body.includes('Hubble'), 'no name until the reader points');
	assert.equal((body.match(/<rect /g) ?? []).length, 2, 'one column per mission');
	for (const t of ['1980', '2000', '2020']) assert.ok(body.includes(`>${t}<`), t);
	assert.match(body, /class="skyline[^"]*\bvisible\b/);
	clean(body);
});

test('Skyline names and lights only the highlighted column', async () => {
	const Component = await load('Skyline.svelte');
	const { body } = render(Component, { props: { layout: skyline, total: 146165, rise: 1, highlight: 'hubble', ...stage } });
	assert.ok(body.includes('Hubble 16,885'));
	assert.ok(!body.includes('CubeSat'));
	assert.equal((body.match(/class="[^"]*\bhot\b/g) ?? []).length, 1, 'one column in flame');
	clean(body);
});

test('Skyline at its citation step: citations to the top of the chart, the papers shrunk under them', async () => {
	const Component = await load('Skyline.svelte');
	const { body } = render(Component, { props: { layout: skyline, total: 146165, cited: 6079430, rise: 1, cite: 1, highlight: 'hubble', ...stage } });
	assert.ok(body.includes('>6,079,430<'), 'the citation total once risen');
	assert.ok(body.includes('citations of 146,165 publications'));
	assert.equal((body.match(/<rect /g) ?? []).length, 4, 'a citation and a paper column per mission');
	assert.equal((body.match(/height="400"/g) ?? []).length, 1, "only Hubble's citations fill the chart; its papers have shrunk");
	assert.ok(body.includes('Hubble 1,164,186'), 'named with its citations');
	assert.equal((body.match(/class="[^"]*\bhot\b/g) ?? []).length, 1, 'one column in flame');
	clean(body);
});

test('Skyline midway: the count grows out of the publication total toward the citations', async () => {
	const { body } = render(await load('Skyline.svelte'), { props: { layout: skyline, total: 146165, cited: 6079430, rise: 1, cite: 0.5, ...stage } });
	const n = Number(body.match(/class="n[^"]*">([\d,]+)</)[1].replaceAll(',', ''));
	assert.ok(n > 146165 && n < 6079430, `${n} lies between the two totals`);
	clean(body);
});

test('Skyline before it rises: a zero count and flat columns', async () => {
	const Component = await load('Skyline.svelte');
	const { body } = render(Component, { props: { layout: skyline, total: 146165, rise: 0, ...stage, compact: true } });
	assert.match(body, />0</);
	assert.match(body, /scaleY\(0\)/);
	clean(body);
});

// --- ClpsChart ------------------------------------------------------------------------------

const clps = {
	program: 'Commercial Lunar Payload Services (CLPS)',
	start: '2024-01-08',
	horizonMonths: 36,
	missions: [
		{ id: 'peregrine', name: 'Peregrine', cost: 130.3, papers: 3 },
		{ id: 'im_1_odysseus', name: 'IM-1 Odysseus', cost: 131.5, papers: 5 },
		{ id: 'cp_11', name: 'CP-11', cost: 50.4, papers: null }
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
	for (const t of ['Peregrine,', 'Odysseus', '>31 papers<', '>$312M<', '>LCROSS<', '>20 papers<', '>$120M<', '>Mars Pathfinder<', '>64 papers<', '>$400M<', '32 months'])
		assert.ok(body.includes(t), t);
	assert.ok(!body.includes('CLPS 31'), 'the CLPS label names its landers instead');
	assert.ok(!body.includes('CP-11'), 'a lander with no papers is not named');
	assert.ok(body.includes('>IM-1 Odysseus<'), 'a name is never broken across lines');
	assert.equal((body.match(/<path /g) ?? []).length, 3);
	assert.equal((body.match(/<circle[^>]*opacity="1"/g) ?? []).length, 3, 'every drawn line ends in a dot');
	assert.ok(!body.includes('36 months') && !body.includes('72 papers'), 'the comparators stop at the CLPS line\'s last month');
	clean(body);
});

test('ClpsChart on a phone before it draws', async () => {
	const Component = await load('ClpsChart.svelte');
	const { body } = render(Component, { props: { clps, draw: 0, drawComparators: 0, ...stage, compact: true } });
	for (const t of ['Peregrine,', 'Odysseus', '>31 papers<', '>$312M<']) assert.ok(body.includes(t), t);
	assert.ok(!body.includes('CLPS 31'));
	assert.match(body, /stroke-dashoffset="1"/);
	assert.ok(!/<circle[^>]*opacity="1"/.test(body), 'no dot before its line draws');
	clean(body);
});

test('ClpsChart drops the CLPS cost line when any lander has no cost', async () => {
	const Component = await load('ClpsChart.svelte');
	const missions = clps.missions.map((p, i) => (i ? p : { ...p, cost: null }));
	const { body } = render(Component, { props: { clps: { ...clps, missions }, draw: 1, drawComparators: 1, ...stage } });
	assert.ok(body.includes('>31 papers<'));
	assert.ok(!body.includes('$312M') && !body.includes('$182M'), 'a missing cost is not summed as zero');
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

// --- SplitLabels / Primer / FocusChart / LanesChart: the packaged data on a real layout ------

const site = JSON.parse(await readFile(join(lib, 'data/generated/site.json'), 'utf8'));
const { tiles } = JSON.parse(await readFile(join(lib, 'data/generated/scrolly.json'), 'utf8'));
const story = site.story;
const ref = story.referenceCost;

test('SplitLabels prerenders each block\'s figure and label over its icon array', async () => {
	const groups = [{ key: 'under', ids: story.threshold.ids }, { key: 'over', ids: tiles.filter((t) => t.cost > ref).map((t) => t.id) }];
	for (const [width, height, compact] of [[900, 600, false], [358, 380, true]]) {
		const layout = splitLayout(width, height, groups, { headH: compact ? 64 : 96 });
		const { body } = render(await load('SplitLabels.svelte'), { props: { layout, heads: [{ figure: '14 of 46', label: 'failed or fell short' }, { figure: '8 of 95', label: 'costlier' }], visible: true, compact } });
		clean(body);
		assert.match(body, /14 of 46/);
		assert.match(body, /8 of 95/);
	}
});

test('Primer prerenders a bar per citation count up to the most cited, their top-10% parts and the cutoff', async () => {
	const layout = primerLayout(story.primer, stage.width, stage.height);
	const { body } = render(await load('Primer.svelte'), { props: { ...stage, layout, primer: story.primer, years: 4, highlight: true } });
	clean(body);
	const tops = story.primer.top.filter((t) => t > 0).length;
	assert.equal((body.match(/<rect/g) ?? []).length, story.primer.counts.filter((n) => n > 0).length + tops, 'no bar for a count no paper drew');
	assert.ok(story.primer.counts.at(-1) > 0, 'the axis ends at the most cited paper');
	assert.match(body, new RegExp(`about ${story.primer.cutoff} or more citations`));
	assert.match(body, /first four years/);
	assert.match(body, />1,000</, 'log gridlines at powers of ten');
	assert.ok(!body.includes('class="label'), 'no count until the reader points');
});

test('Primer lights the pointed-at bar and names its count', async () => {
	const layout = primerLayout(story.primer, stage.width, stage.height);
	const most = story.primer.counts.length - 1;
	const { body } = render(await load('Primer.svelte'), { props: { ...stage, layout, primer: story.primer, years: 4, hot: most } });
	clean(body);
	const n = story.primer.counts[most];
	assert.ok(body.includes(`>${n} ${n === 1 ? 'paper' : 'papers'} cited ${most} times<`), 'the most cited bar, named');
	assert.ok((body.match(/class="[^"]*\bhot\b/g) ?? []).length >= 1, 'its bar in flame');
	const none = render(await load('Primer.svelte'), { props: { ...stage, layout, primer: story.primer, years: 4, hot: 0 } }).body;
	assert.ok(none.includes(`${story.primer.counts[0].toLocaleString('en-US')} papers with no citations`));
});

test('FocusChart prerenders the axis, a bar per mission with top papers, the line and its labels', async () => {
	const focus = story.comparison.byDivision.find((d) => d.division === story.focusDivision);
	const total = focus.under.top10 + focus.over.top10;
	const layout = focusLayout(tiles, 900, 600, { division: focus.division, total });
	assert.ok(Math.abs(layout.facts.total - total) < 0.5, 'the shares add back up to the division total');
	const { body } = render(await load('FocusChart.svelte'), { props: { ...stage, layout, referenceCost: ref, largest: focus.over.largest, small: 'Seven missions', total: '1,093 top-10% papers', grow: 1, stack: 0, draw: 0, bars: true } });
	clean(body);
	assert.equal((body.match(/class="bar[ "]/g) ?? []).length, layout.facts.points.filter((p) => p.credit > 0).length);
	assert.match(body, new RegExp(`${focus.over.largest.name} \\d`));
	assert.match(body, /\$150M/);
});

test('LanesChart prerenders a band per compared division with its notes and both running lines', async () => {
	const compared = new Set(story.comparison.divisions);
	const divisions = site.divisions.filter((d) => compared.has(d.slug));
	const layout = costLayout(tiles.filter((t) => compared.has(t.division)), 900, 600, { divisions });
	const notes = Object.fromEntries(divisions.map((d) => [d.slug, { missions: `${d.slug} missions`, top: 'top', cited: 'cited', cost: 'spend' }]));
	const { body } = render(await load('LanesChart.svelte'), { props: { ...stage, layout, scope: story.scope, referenceCost: ref, notes, spending: true } });
	clean(body);
	for (const d of divisions) assert.match(body, new RegExp(`${d.slug} missions`));
	assert.equal((body.match(/class="top[ "]/g) ?? []).length, divisions.length);
	assert.equal((body.match(/class="cost[ "]/g) ?? []).length, divisions.length);
	assert.equal((body.match(/class="cited[ "]/g) ?? []).length, divisions.length);
	assert.match(body, /cited/, 'the spending step reads citations against spending');
});
