// Geometry of the story's cost-axis states against the packaged data: nothing overlaps,
// nothing leaves the stage, and the running shares end where they must.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { costLayout, costCurve, rugLayout, skylineLayout, skylineZoom, skylineHit, primerLayout, columnLabel, splitLayout, focusLayout, kindsLayout, exampleLayout } from './layouts.js';

const load = async (name) => JSON.parse(await readFile(new URL(`../data/generated/${name}.json`, import.meta.url), 'utf8'));
const site = await load('site');
const scrolly = await load('scrolly');
const tiles = scrolly.tiles;
const stages = [
	[900, 640],
	[351, 400]
];

const overlaps = (a, b) => a.x < b.x + b.s && b.x < a.x + a.s && a.y < b.y + b.s && b.y < a.y + a.s;

test('cost layout places every costed mission on the stage without overlap', () => {
	for (const [W, H] of stages) {
		const layout = costLayout(tiles, W, H, { divisions: site.divisions });
		const placed = tiles.filter((t) => t.cost > 0);
		assert.equal(layout.pos.size, placed.length);
		const boxes = [...layout.pos.values()];
		for (const p of boxes) assert.ok(p.x >= 0 && p.x + p.s <= W && p.y >= 0 && p.y + p.s <= H, `${W}px: square inside the stage`);
		for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${W}px: no overlap`);
		assert.ok(layout.ticks.length >= 3);
	}
});

/** The cost layout's own rows, keyed by division: what the browser actually draws from. */
const costRows = (W = 900, H = 640) =>
	new Map(costLayout(tiles, W, H, { divisions: site.divisions }).rows.map((r) => [r.slug, r]));

test('cost curves run from nothing to everything in cost order', () => {
	const rows = costRows();
	for (const d of site.divisions.filter((d) => d.rankable)) {
		const points = costCurve(rows.get(d.slug).members, (t) => t.share.full[10]);
		assert.ok(points.length > 0);
		for (let i = 1; i < points.length; i++) {
			assert.ok(points[i].cost >= points[i - 1].cost);
			assert.ok(points[i].topShare >= points[i - 1].topShare - 1e-12);
		}
		assert.ok(Math.abs(points.at(-1).topShare - 1) < 1e-9);
		assert.ok(Math.abs(points.at(-1).costShare - 1) < 1e-9);
	}
});

// The story's band sentence quotes the packaged p25/p50/p75; the line beside it is drawn in the
// browser from the layout's own rows. If those ever parted, the words would name a cost the
// reader cannot find on the chart.
test('the drawn curve reaches each quarter of the top papers at the packaged cost', () => {
	const rows = costRows();
	for (const band of site.story.bands) {
		const points = costCurve(rows.get(band.division).members, (t) => t.share.full[10]);
		for (const [key, level] of [
			['p25', 0.25],
			['p50', 0.5],
			['p75', 0.75]
		]) {
			const first = points.find((p) => p.topShare >= level - 1e-9);
			assert.equal(first?.cost, band[key], `${band.division} ${key}`);
		}
	}
});

// The cross-division states take their inputs the way Story.svelte does: only the compared
// divisions, and a cost layout over just their missions whose x the later states keep.
const { scope } = site.story;
const compared = new Set(site.story.comparison.divisions);
const rankable = site.divisions.filter((d) => compared.has(d.slug));
const storyCost = (W, H) => costLayout(tiles.filter((t) => compared.has(t.division)), W, H, { divisions: rankable });
const byId = new Map(tiles.map((t) => [t.id, t]));
const inStage = (p, W, H) => p.x >= 0 && p.x + p.s <= W && p.y >= 0 && p.y + p.s <= H;

const sizes = [
	[900, 640],
	[351, 400],
	[351, 370]
];
const papersOf = (t) => t.papersLifetime;

test('the rug hangs from the ground: first square of each year just under it, deepest at the floor', () => {
	for (const [W, H] of sizes) {
		const rug = rugLayout(tiles, W, H, site.launchYears);
		const boxes = [...rug.pos.values()];
		assert.equal(rug.pos.size, tiles.filter((t) => t.launchYear != null).length);
		for (const p of boxes) assert.ok(inStage(p, W, H) && p.y > rug.chart.bottom, `${W}px: square inside the stage, under the ground`);
		for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${W}px: no overlap`);
		const byYear = new Map();
		for (const t of tiles) if (rug.pos.has(t.id)) byYear.set(t.launchYear, [...(byYear.get(t.launchYear) ?? []), rug.pos.get(t.id)]);
		for (const [year, stack] of byYear) assert.equal(stack[0].y, rug.chart.bottom + 1, `${W}px: ${year} starts at the ground`);
		assert.equal(Math.max(...boxes.map((p) => p.y + p.s)), H - 30, `${W}px: the deepest stack ends at the floor`);
	}
});

test('skyline columns rise from the ground inside their year, with headroom for the hover label', () => {
	for (const [W, H] of sizes) {
		const compact = W < 600;
		const rug = rugLayout(tiles, W, H, site.launchYears);
		const sky = skylineLayout(tiles, rug, { papers: papersOf, compact });
		const withPapers = tiles.filter((t) => rug.pos.has(t.id) && papersOf(t) > 0);
		assert.deepEqual(sky.columns.map((c) => c.id).sort(), withPapers.map((t) => t.id).sort(), `${W}px: one column per mission with papers`);
		for (const c of sky.columns) {
			const p = rug.pos.get(c.id);
			assert.ok(c.x >= p.x - 1e-9 && c.x + c.w <= p.x + p.s + 1e-9, `${W}px: ${c.id} inside its year's footprint`);
			assert.ok(Math.abs(c.y + c.h - sky.ground) < 1e-9, `${W}px: ${c.id} stands on the ground`);
			assert.ok(c.y >= sky.top + 2 * sky.lineH - 1e-9, `${W}px: ${c.id} leaves room for the label`);
		}
		const tall = [...sky.columns].sort((a, b) => a.papers - b.papers);
		for (let i = 1; i < tall.length; i++) assert.ok(tall[i].h >= tall[i - 1].h, `${W}px: more papers, no shorter`);
	}
});

test('the zoom to citations is one move: citations grow out of the papers as the scale draws out, no dip', () => {
	const rug = rugLayout(tiles, 900, 640, site.launchYears);
	const sky = skylineLayout(tiles, rug, { papers: papersOf });
	const steps = Array.from({ length: 21 }, (_, i) => skylineZoom(sky, i / 20));
	const start = steps[0];
	for (const c of sky.columns) assert.ok(Math.abs(start.get(c.id).hp - c.h) < 1e-9, `${c.id}: starts as the paper skyline`);
	steps.forEach((z, i) => {
		const tallest = Math.max(...sky.columns.map((c) => Math.max(z.get(c.id).hp, z.get(c.id).hc)));
		assert.ok(Math.abs(tallest - sky.room) < 1e-9, `step ${i}: the tallest column holds the top of the chart`);
		if (i === 0) return;
		for (const c of sky.columns) {
			const now = z.get(c.id), before = steps[i - 1].get(c.id);
			assert.ok(now.hp <= before.hp + 1e-9, `step ${i}: ${c.id}'s papers only shrink`);
			if (c.cited >= c.papers) assert.ok(now.hc >= now.hp - 1e-9 || now.hp === 1, `step ${i}: ${c.id}'s citations stand on its papers`);
		}
	});
	// at the end, one √ scale: a column's height ratio is the square root of its count ratio
	const end = steps.at(-1);
	for (const c of sky.columns.filter((d) => d.cited > 0 && end.get(d.id).hp > 1)) assert.ok(Math.abs(end.get(c.id).hp / end.get(c.id).hc - Math.sqrt(c.papers / c.cited)) < 1e-9, c.id);
});

test('the primer: a log-scale bar per count with papers, each found under a pointer', () => {
	const primer = site.story.primer;
	for (const [W, H] of stages) {
		const p = primerLayout(primer, W, H, { compact: W < 600 });
		assert.deepEqual(p.columns.map((c) => c.id), primer.counts.flatMap((n, c) => (n > 0 ? [c] : [])), `${W}px: a bar for every count some paper drew`);
		const byPapers = [...p.columns].sort((a, b) => a.papers - b.papers);
		assert.ok(byPapers[0].h > 0, `${W}px: a lone paper still stands`);
		for (let i = 1; i < byPapers.length; i++) assert.ok(byPapers[i].h >= byPapers[i - 1].h, `${W}px: more papers, no shorter`);
		for (const c of p.columns) {
			assert.ok(c.t <= c.h + 1e-9 && c.x + c.w <= p.right + 1e-9 && p.ground - c.h >= p.top - 1e-9, `${W}px: ${c.id} inside the chart`);
			assert.equal(skylineHit(p, c.x + c.w / 2, p.ground - 1), c.id, `${W}px: the bar under the pointer`);
		}
		assert.deepEqual(p.yTicks.map((t) => t.v), [1, 10, 100, 1000], `${W}px: a gridline per power of ten`);
	}
});

test('a column label stays inside the chart at either end', () => {
	const bounds = { left: 50, right: 450, y: 10 };
	assert.equal(columnLabel('Mid', { x: 250, w: 2 }, bounds).anchor, 'middle');
	assert.deepEqual(columnLabel('A long name 1,234', { x: 52, w: 2 }, bounds), { text: 'A long name 1,234', x: 52, y: 10, anchor: 'start' });
	assert.deepEqual(columnLabel('A long name 1,234', { x: 446, w: 2 }, bounds), { text: 'A long name 1,234', x: 448, y: 10, anchor: 'end' });
});

test('skimming the skyline picks the nearest column, and nothing off the chart', () => {
	for (const [W, H] of sizes) {
		const rug = rugLayout(tiles, W, H, site.launchYears);
		const sky = skylineLayout(tiles, rug, { papers: papersOf, compact: W < 600 });
		const mid = (sky.top + sky.ground) / 2;
		for (const c of sky.columns) {
			const hit = sky.columns.find((d) => d.id === skylineHit(sky, c.x + c.w / 2, mid));
			assert.ok(hit && hit.x === c.x, `${W}px: over ${c.id}, a column at its x`);
		}
		const first = sky.columns[0];
		assert.equal(skylineHit(sky, first.x, sky.ground + 5), null, `${W}px: below the ground is the rug, not the skyline`);
		assert.equal(skylineHit(sky, first.x, sky.top - 5), null, `${W}px: above the chart`);
		assert.equal(skylineHit(sky, -1000, mid), null, `${W}px: far off to the side`);
	}
});

test('the icon arrays: each side of the line in its own block, one square size, equal rows, inside the stage', () => {
	const ref = site.story.referenceCost;
	const groups = [{ key: 'under', ids: site.story.threshold.ids }, { key: 'over', ids: tiles.filter((m) => m.cost > ref).map((m) => m.id) }];
	assert.equal(groups[1].ids.length, site.story.failure.over.missions);
	for (const [W, H] of sizes) {
		const headH = W < 600 ? 64 : 96;
		const layout = splitLayout(W, H, groups, { headH });
		assert.equal(layout.pos.size, site.story.threshold.total, `${W}px: every costed mission once`);
		const [a, b] = layout.blocks;
		assert.ok(a.x + a.w < b.x, `${W}px: the blocks side by side`);
		assert.equal(a.h, b.h, `${W}px: equal rows`);
		for (const [id, p] of layout.pos) {
			assert.ok(inStage(p, W, H) && p.y >= headH, `${W}px: ${id} inside the stage, under the labels`);
			const block = groups[0].ids.includes(id) ? a : b;
			assert.ok(p.x >= block.x && p.x + p.s <= block.x + block.w + 0.5, `${W}px: ${id} inside its block`);
		}
		assert.ok(layout.s >= (W < 600 ? 12 : 20), `${W}px: squares big enough to read the marks (${layout.s}px)`);
	}
});

test('the focus division on the cost axis: its squares in the rug, the chart inside the stage, the credit adding up', () => {
	const focus = site.story.comparison.byDivision.find((d) => d.division === site.story.focusDivision);
	const total = focus.under.top10 + focus.over.top10;
	for (const [W, H] of sizes) {
		const { chart, facts, pos } = focusLayout(tiles, W, H, { division: focus.division });
		assert.equal(pos.size, tiles.filter((m) => m.division === focus.division && m.cost > 0).length);
		assert.ok(chart.height <= H, `${W}px: ${chart.height} of ${H}`);
		for (const [id, p] of pos) assert.ok(inStage(p, W, H) && p.y > chart.y(0), `${W}px: ${id} under the axis`);
		assert.ok(Math.abs(facts.total - total) < 0.5, 'the bars add up to the division total');
		const largest = facts.points.find((p) => p.id === focus.over.largest.id);
		assert.ok(Math.abs(largest.credit - focus.over.largest.top10) < 0.5, 'the tallest bar is the packaged largest');
	}
});

// --- paper kinds ----------------------------------------------------------------------------

const kindMissions = [
	{ id: 'a', papers: 40 },
	{ id: 'b', papers: 12 },
	{ id: 'c', papers: 5 },
	{ id: 'd', papers: 1 },
	{ id: 'e', papers: 0 },
	{ id: 'f', papers: 0 }
];

test('kinds layout: a row per mission with papers, the empties in a strip under them', () => {
	for (const [W, H] of stages) {
		for (const compact of [false, true]) {
			const l = kindsLayout(kindMissions, W, H, { compact });
			assert.deepEqual(l.rows.map((r) => r.id), ['a', 'b', 'c', 'd']);
			for (const [id, p] of l.pos) assert.ok(p.x >= 0 && p.x + p.s <= W && p.y >= 0 && p.y + p.s <= H, `${W}px: ${id} inside the stage`);
			assert.ok(l.rows[0].y >= l.headH, `${W}px: rows under the head`);
			for (let i = 1; i < l.rows.length; i++) assert.ok(l.rows[i].y >= l.rows[i - 1].y + l.rows[i - 1].h, `${W}px: rows apart`);
			assert.ok(l.barW > 0 && l.barX + l.barW + l.valueW <= W, `${W}px: bar and value fit`);
			assert.deepEqual(l.strip.ids, ['e', 'f']);
			const last = l.rows.at(-1);
			for (const id of l.strip.ids) assert.ok(l.pos.get(id).y >= last.y + last.h, `${W}px: ${id} below the last row`);
		}
		const none = kindsLayout(kindMissions.slice(0, 4), W, H);
		assert.equal(none.strip, null);
		assert.equal(none.pos.size, 4);
	}
});

test('example layout: the square inside the stage, the list under it', () => {
	for (const [W, H] of stages) {
		const l = exampleLayout('raincube', W, H, { compact: W < 600 });
		const p = l.pos.get('raincube');
		assert.ok(p.x >= 0 && p.x + p.s <= W && p.y >= 0 && p.y + p.s <= H);
		assert.ok(l.listY > l.top + l.s);
	}
});

test('example layout: a phone stage holds all seven RainCube papers, one highlighted', () => {
	const l = exampleLayout('raincube', 351, 262, { compact: true });
	assert.ok(l.listY + l.hit + 6 * l.row <= 262, `${l.listY + l.hit + 6 * l.row}px of 262`);
});
