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
import { focusLayout, costLayout, primerLayout, perDollarLayout, tierOutcomeLayout } from './layouts.js';
import { money, spell } from '../format.js';
import { COST_AXIS_LABEL } from '../charts/costaxis.js';
import { calendarYears } from '../copy/window.js';

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
	assert.ok(body.includes('citations of <span class="neptuneBlue">146,165 publications</span>'), 'the publications in the columns\' blue');
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

// --- Primer / FocusChart / LanesChart: the packaged data on a real layout ------

const site = JSON.parse(await readFile(join(lib, 'data/generated/site.json'), 'utf8'));
const { tiles } = JSON.parse(await readFile(join(lib, 'data/generated/scrolly.json'), 'utf8'));
const story = site.story;
const ref = story.referenceCost;

test('Primer prerenders a bar per citation count up to the most cited, their top-10% parts and the cutoff', async () => {
	const layout = primerLayout(story.primer, stage.width, stage.height);
	const { body } = render(await load('Primer.svelte'), { props: { ...stage, layout, primer: story.primer, years: calendarYears(site.fullPolicy), highlight: true } });
	clean(body);
	assert.match(body, new RegExp(`>Citations in first ${spell(site.fullPolicy.citationYears + 1)} years<`), 'the count axis, its window spelled out');
	assert.match(body, /<text x="0"[^>]*>Papers</, 'the papers scale, top left');
	const tops = story.primer.top.filter((t) => t > 0).length;
	assert.equal((body.match(/<rect/g) ?? []).length, story.primer.counts.filter((n) => n > 0).length + tops, 'no bar for a count no paper drew');
	assert.ok(story.primer.counts.at(-1) > 0, 'the axis ends at the most cited paper');
	assert.match(body, /High impact papers/, "the cutoff's label");
	assert.match(body, /Citation counts of Planetary Science mission papers/, 'the header names the division');
	assert.match(body, />1,000</, 'log gridlines at powers of ten');
	assert.ok(!body.includes('class="label'), 'no count until the reader points');
});

test('Primer lights the pointed-at bar and names its count', async () => {
	const layout = primerLayout(story.primer, stage.width, stage.height);
	const most = story.primer.counts.length - 1;
	const { body } = render(await load('Primer.svelte'), { props: { ...stage, layout, primer: story.primer, years: calendarYears(site.fullPolicy), hot: most } });
	clean(body);
	const n = story.primer.counts[most];
	assert.ok(body.includes(`>${n} ${n === 1 ? 'paper' : 'papers'} cited ${most} times<`), 'the most cited bar, named');
	assert.ok((body.match(/class="[^"]*\bhot\b/g) ?? []).length >= 1, 'its bar in flame');
	const none = render(await load('Primer.svelte'), { props: { ...stage, layout, primer: story.primer, years: calendarYears(site.fullPolicy), hot: 0 } }).body;
	assert.ok(none.includes(`${story.primer.counts[0].toLocaleString('en-US')} papers with no citations`));
});

test('FocusChart prerenders the axis, its title and the largest named, leaving its bars to LanesChart', async () => {
	const largest = story.rate.divisions.find((d) => d.division === story.focusDivision).largest;
	const layout = focusLayout(tiles, 900, 600, { division: story.focusDivision });
	const { body } = render(await load('FocusChart.svelte'), { props: { ...stage, layout, name: 'Planetary Science', largest, grow: 1, bars: true } });
	clean(body);
	assert.ok(!body.includes('class="bar'), 'LanesChart draws the bars, so they can move into their band');
	assert.match(body, new RegExp(`${largest.name} \\d`));
	assert.match(body, /class="stage-title[^>]*text-anchor="end">High-impact papers published per year in Planetary Science, by mission</);
	assert.ok(!body.includes('$150M'), 'no threshold line');
	assert.ok(!body.includes('<path'), 'no running total');
	assert.ok(body.includes(`>${COST_AXIS_LABEL}<`), 'the cost axis labelled');
	assert.ok(layout.chart.tickY < layout.chart.axisY && layout.chart.axisY < layout.chart.rugTop, 'ticks, then the label, then the rug');
});

test('LanesChart: a band per compared division, a bar per mission with top papers, no labels until a bar is pointed at', async () => {
	const compared = new Set(story.comparison.divisions);
	const divisions = site.divisions.filter((d) => compared.has(d.slug));
	const layout = costLayout(tiles.filter((t) => compared.has(t.division)), 900, 600, { divisions });
	const Lanes = await load('LanesChart.svelte');
	const { body } = render(Lanes, { props: { ...stage, layout } });
	clean(body);
	assert.equal((body.match(/class="shelf[ "]/g) ?? []).length, divisions.length);
	assert.ok(!body.includes('<path'), 'no running lines');
	assert.equal((body.match(/class="bar[ "]/g) ?? []).length, layout.rows.flatMap((r) => r.members).filter((t) => t.top10PerYear > 0).length);
	assert.ok(!body.includes(' a year<'), 'no scale or leader labels');
	assert.equal(body.split(`>${COST_AXIS_LABEL}<`).length - 1, 1, 'the cost axis labelled once');
	assert.ok(!body.includes('class="label'), 'nothing named until pointed at');
	const lead = story.rate.divisions[0].largest;
	const pointed = render(Lanes, { props: { ...stage, layout, hot: lead.id } }).body;
	assert.equal((pointed.match(/class="bar[^"]*\bhot\b/g) ?? []).length, 1, 'the pointed-at bar lit');
	assert.match(pointed, new RegExp(`class="label[^>]*>${lead.name}: \\d[\\d.,]* top-10% papers a year<`), 'its mission and rate');
	const leadTile = tiles.find((t) => t.id === lead.id);
	assert.equal((pointed.match(/class="cursor/g) ?? []).length, 1, 'one cursor through every band');
	assert.match(pointed, new RegExp(`class="tick reading[^>]*>\\$${money(leadTile.cost).slice(1)}<`), 'the cursor snaps to the bar and reads its cost');
	const free = render(Lanes, { props: { ...stage, layout, cursor: layout.x(1000) } }).body;
	assert.match(free, /class="tick reading[^>]*>\$1\.0B</, 'off a bar, it reads the cost under the pointer');
	assert.ok(!free.includes('class="label'), 'and names no mission');
	assert.ok(!render(Lanes, { props: { ...stage, layout, cursor: 0 } }).body.includes('class="cursor'), 'none left of the plot');
});

test('LanesChart carries the focus division’s bars: on the focus chart’s axes while it is up, then in their own band, under the title', async () => {
	const compared = new Set(story.comparison.divisions);
	const divisions = site.divisions.filter((d) => compared.has(d.slug));
	const comparedTiles = tiles.filter((t) => compared.has(t.division));
	const layout = costLayout(comparedTiles, 900, 600, { divisions, titled: true });
	const focus = focusLayout(comparedTiles, 900, 600, { division: story.focusDivision });
	const Lanes = await load('LanesChart.svelte');
	const row = layout.rows.find((r) => r.slug === story.focusDivision);
	const carried = row.members.filter((t) => t.top10PerYear > 0).length;
	const all = layout.rows.flatMap((r) => r.members).filter((t) => t.top10PerYear > 0).length;
	// each carried bar's translate ends on its baseline: the focus chart's axis, or the band's bottom edge
	const on = (body, y) => body.split(`px, ${y}px) scale(`).length - 1;
	const up = render(Lanes, { props: { ...stage, layout, focus, focused: true, grow: 1 } }).body;
	clean(up);
	assert.equal((up.match(/class="bar[ "]/g) ?? []).length, all, 'every bar drawn once');
	assert.equal(on(up, focus.chart.y(0)), carried, 'on the focus chart’s axis');
	const lanes = render(Lanes, { props: { ...stage, layout, focus, title: 'High-impact papers published per year, by division and mission', visible: true } }).body;
	assert.equal((lanes.match(/class="bar[ "]/g) ?? []).length, all, 'still once each');
	assert.equal(on(lanes, Math.round(row.y + row.h)), carried, 'in their own band');
	assert.match(lanes, /class="stage-title[^>]*text-anchor="end">High-impact papers published per year, by division and mission</);
	assert.ok(layout.top >= 28, 'a titled layout keeps a strip over the lanes');
});

test('DollarChart draws every packaged running average alike, names only the divisions and labels its cost axis', async () => {
	const compared = new Set(story.comparison.divisions);
	const divisions = site.divisions.filter((d) => compared.has(d.slug));
	const averages = new Map(story.perDollar.map((d) => [d.division, d.runningMean]));
	const layout = perDollarLayout(tiles, 900, 600, { divisions, averages });
	const { body } = render(await load('DollarChart.svelte'), { props: { ...stage, layout, referenceCost: ref } });
	clean(body);
	assert.equal((body.match(/class="fit[ "]/g) ?? []).length, layout.rows.filter((r) => r.average?.points.some(([, mean]) => mean != null)).length, 'one curve an average');
	assert.ok(!body.includes('soft'), 'none set apart');
	assert.deepEqual([...body.matchAll(/class="name[^>]*>([^<]*)</g)].map((m) => m[1]), layout.rows.map((r) => r.label), 'each band names only its division');
	assert.ok(!body.includes('×'), 'no multiples on the chart');
	assert.ok(body.includes(`>${COST_AXIS_LABEL}<`), 'the cost axis labelled');
	assert.ok(!body.includes('stage-title'), 'no title unless given one');
	const titled = perDollarLayout(tiles, 900, 600, { divisions, averages, titled: true });
	assert.ok(titled.top >= 28, 'a titled layout keeps a strip over the plot');
	const headed = render(await load('DollarChart.svelte'), { props: { ...stage, layout: titled, title: 'Citations per $100M by division' } }).body;
	assert.match(headed, /class="stage-title[^>]*text-anchor="end">Citations per \$100M by division</);
});

test('DollarChart shades only opted-in completed averages, with one clipped ribbon behind each curve', async () => {
	const divisions = site.divisions.filter((d) => story.comparison.divisions.includes(d.slug));
	const averages = new Map(story.perDollar.map((d) => [d.division, { ...d.runningMean, points: [[1, 10, 1, 100], [10000, 1000, 100, 10000]] }]));
	const layout = perDollarLayout(tiles, 900, 600, { divisions, averages });
	const Component = await load('DollarChart.svelte');
	const draw = (props = {}) => render(Component, { props: { ...stage, layout, ...props } }).body;
	const paths = (body) => [...body.matchAll(/<path class="confidence[^>]*clip-path="url\(#([^)]*)\)"/g)];
	const body = draw({ confidence: true });
	clean(body);
	assert.equal(paths(body).length, divisions.length);
	const ids = [...body.matchAll(/<clipPath id="([^"]*)"/g)].map((m) => m[1]);
	assert.equal(new Set(ids).size, divisions.length);
	assert.deepEqual(paths(body).map((m) => m[1]), ids, 'each ribbon uses its own clip');
	for (const path of paths(body)) assert.ok(body.indexOf('class="fit', path.index) > path.index, 'the curve draws after the ribbon');
	assert.equal(paths(draw()).length, 0, 'off by default');
	assert.equal(paths(draw({ confidence: true, turn: 0.5 })).length, 0, 'no ribbon while the curve fades in');
	const single = perDollarLayout(tiles, 900, 600, { divisions: divisions.slice(0, 1), averages });
	assert.equal(paths(draw({ confidence: true, layout: single })).length, 1, 'single-division charts can opt in too');
	assert.equal(paths(draw({ layout: single })).length, 0, 'single-division overview steps remain unshaded by default');
	assert.equal((body.match(/class="fit[ "]/g) ?? []).length, divisions.length, 'the curves are retained');
});

test('DollarChart shares running-average paths and optional intervals across single and multiple divisions', async () => {
	const divisions = site.divisions.filter((d) => story.comparison.divisions.includes(d.slug));
	const averages = new Map(divisions.map((d) => [d.slug, { points: [[10, 0, 0, 10], [100, 10, 0, 30], [1000, 30, 10, 100]] }]));
	const Component = await load('DollarChart.svelte');
	for (const [width, height] of [[900, 600], [351, 400]]) {
		const layout = perDollarLayout(tiles, width, height, { divisions, averages });
		const draw = (props = {}) => render(Component, { props: { width, height, compact: width < 600, layout, ...props } }).body;
		const body = draw({ confidence: true });
		clean(body);
		assert.equal((body.match(/<span class="band[ "]/g) ?? []).length, divisions.length, 'one bordered panel per division');
		assert.ok(!/class="shelf[ "]/.test(body), 'panel borders provide the baseline without a second horizontal line');
		assert.equal((body.match(/<path class="fit[ "]/g) ?? []).length, divisions.length, 'one running curve per division');
		assert.ok(!/<line class="fit/.test(body), 'no fitted lines');
		assert.ok(!body.includes('>Running average<'), 'grid panels only name their division');
		assert.ok(!/>Weak<|>Nearly flat<|>Modest /.test(body), 'no slope labels on averages');
		assert.equal((body.match(/<path class="confidence/g) ?? []).length, divisions.length, 'the comparison step has intervals');
		assert.ok(!draw().includes('<path class="confidence'), 'intervals are opt-in');
		const halfway = draw({ turn: 0.5, confidence: true });
		assert.ok(!halfway.includes('<path class="confidence'), 'no interval during the reveal');
		const curves = (html) => [...html.matchAll(/<path class="fit[^"]*" d="([^"]*)" opacity="([^"]*)"/g)];
		assert.deepEqual(curves(halfway).map((m) => m[1]), curves(body).map((m) => m[1]), 'the curve fades without changing its geometry');
		assert.ok(curves(halfway).every((m) => m[2] === '0.5'));
		assert.ok(!draw({ turn: null }).includes('<path class="fit'), 'earlier scatter has no average');
		const single = perDollarLayout(tiles, width, height, { divisions: divisions.slice(0, 1), averages });
		const division = draw({ layout: single, confidence: true });
		clean(division);
		assert.equal((division.match(/class="shelf[ "]/g) ?? []).length, 1, 'the single-division chart retains its baseline');
		assert.equal(curves(division).length, 1, 'division pages use the same running curve');
		assert.match(division, />Running average</);
		assert.equal((division.match(/<path class="confidence/g) ?? []).length, 1, 'division pages show its interval');
		assert.ok(!/<line class="fit/.test(division), 'no regression line on the division chart');
		assert.ok(!draw({ layout: single }).includes('<path class="confidence'), 'overview single-division reveal remains unshaded');
		const imagined = draw({ layout: single, confidence: true, turn: null, would: { slope: -0.5, shown: true, label: 'If small missions did better' } });
		assert.match(imagined, /class="would[^>]*>[\s\S]*?<line /, 'the hypothetical works without a fitted model');
		assert.ok(!imagined.includes('<path class="confidence'), 'hypothetical steps stay unshaded');
	}
});

test('OutcomeChart: titled, Success over the zero line and Failure under it, each tier’s rate with no count', async () => {
	const { tiers, failures } = site.analysis;
	const layout = tierOutcomeLayout(tiles, tiers, 900, 600);
	const { body } = render(await load('OutcomeChart.svelte'), { props: { ...stage, layout, failures: failures.tiers } });
	clean(body);
	assert.match(body, /class="stage-title[^>]*>Mission success and failures by cost</);
	assert.match(body, />Success<[\s\S]*>Failure</);
	assert.equal((body.match(/class="rate/g) ?? []).length, tiers.length);
	assert.ok(!/\d of \d/.test(body), 'no "X of Y" counts');
	assert.ok(layout.top >= 28, 'room for the title over the stacks');
});
