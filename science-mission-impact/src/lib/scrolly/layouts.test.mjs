// Geometry of the story's cost-axis states against the packaged data: nothing overlaps,
// nothing leaves the stage, and the running shares end where they must.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { timeScienceModel, timeScienceLayout } from '../charts/timetoscience.js';
import { costLayout, costCurve, timeLayout, rugLayout, skylineLayout, skylineHit, gridLayout, failureLayout, perDollarLayout, kindsLayout, exampleLayout, waffleLayout } from './layouts.js';

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

test('time layout keeps squares at their cost and the never lane on the stage', () => {
	for (const [W, H] of stages) {
		const cost = costLayout(tiles, W, H, { divisions: site.divisions });
		const time = timeLayout(tiles, W, H, { scope: 'full', x: cost.x, left: cost.left });
		for (const [id, p] of time.pos) {
			assert.ok(p.y >= 0 && p.y + p.s <= H, `${W}px: ${id} inside the stage`);
			assert.ok(Math.abs(p.x + p.s / 2 - (cost.pos.get(id).x + cost.pos.get(id).s / 2)) < 1e-9, 'moves only vertically');
		}
		assert.ok(time.y(-1) < time.y(0) && time.y(0) < time.y(1));
		assert.ok(time.never > 0);
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

test('the time-to-science step plots every division together: each costed mission with a top-10% paper, inside the stage', () => {
	const first = (m) => m.first[scope];
	const expected = tiles.filter((m) => m.cost > 0 && first(m).state === 'reached' && Number.isFinite(first(m).yearsFromScienceStart)).map((m) => m.id).sort();
	const model = timeScienceModel(tiles, scope, first);
	assert.deepEqual(model.points.map((p) => p.id).sort(), expected);
	assert.ok(new Set(expected.map((id) => byId.get(id).division)).size > 1, 'more than one division');
	for (const [W, H] of stages) {
		const layout = timeScienceLayout(model.points, W, H);
		assert.deepEqual([...layout.items.keys()].sort(), expected, `${W}px: one square per point`);
		for (const [id, p] of layout.items) assert.ok(inStage(p, W, H), `${W}px: ${id} inside the stage`);
		assert.ok(layout.fit, `${W}px: a trend line`);
	}
	// the packaged quarters the copy quotes cover exactly the missions the chart plots
	assert.equal(site.story.scienceStart.missions, model.points.length);
	assert.equal(site.story.scienceStart.groups.reduce((n, g) => n + g.missions, 0), model.points.length);
});

test('per-dollar layout keeps every square in its own row, rated ones between curve top and shelf', () => {
	const facts = new Map(site.story.perDollar.map((d) => [d.division, d]));
	const ids = tiles
		.filter((m) => compared.has(m.division) && m.cost > 0 && m.citations != null)
		.map((m) => m.id)
		.sort();
	for (const [W, H] of stages) {
		const cost = storyCost(W, H);
		const layout = perDollarLayout(tiles, W, H, { divisions: rankable, x: cost.x, left: cost.left });
		assert.deepEqual([...layout.pos.keys()].sort(), ids, `${W}px: every costed mission with a citation count`);
		const rows = new Map(layout.rows.map((r) => [r.slug, r]));
		const counts = new Map();
		for (const [id, p] of layout.pos) {
			const m = byId.get(id);
			const row = rows.get(m.division);
			counts.set(m.division, (counts.get(m.division) ?? 0) + 1);
			assert.ok(inStage(p, W, H), `${W}px: ${id} inside the stage`);
			assert.ok(p.y >= row.y && p.y + p.s <= row.y + row.h, `${W}px: ${id} inside the ${m.division} row`);
			if (m.citations > 0) {
				const cy = p.y + p.s / 2;
				assert.ok(cy >= row.curveTop - 1e-9 && cy <= row.shelfY + 1e-9, `${W}px: ${id} rated between curve top and shelf`);
			} else {
				assert.ok(p.y + p.s <= row.shelfY, `${W}px: ${id} with no citations rests on the shelf`);
			}
		}
		// each row holds the missions its rate sentence divides over
		for (const d of rankable) {
			const missions = facts.get(d.slug).groups.reduce((n, g) => n + g.missions, 0);
			assert.equal(counts.get(d.slug) ?? 0, missions, `${W}px: ${d.slug} squares`);
			assert.equal(rows.get(d.slug).missions, missions, `${W}px: ${d.slug} row count`);
			// the best-fit line spans the row's missions with citations (zeros have no log rate) and stays inside the row
			const costs = tiles.filter((m) => m.division === d.slug && layout.pos.has(m.id) && m.citations > 0).map((m) => m.cost);
			const { fit, y, h } = rows.get(d.slug);
			if (costs.length < 3) continue;
			assert.ok(fit, `${W}px: ${d.slug} has a best-fit line`);
			assert.ok(Math.abs(fit.x1 - cost.x(Math.min(...costs))) < 1e-9 && Math.abs(fit.x2 - cost.x(Math.max(...costs))) < 1e-9, `${W}px: ${d.slug} line spans its missions`);
			for (const fy of [fit.y1, fit.y2]) assert.ok(fy >= y && fy <= y + h, `${W}px: ${d.slug} line inside its row`);
		}
		const [lo, hi] = layout.scale.domain();
		assert.ok(layout.rateTicks.length > 0, `${W}px: at least one rate rule`);
		for (const r of layout.rateTicks) {
			assert.equal(r, 10 ** Math.round(Math.log10(r)), `${W}px: ${r} is a whole power of ten`);
			assert.ok(r >= lo && r <= hi, `${W}px: ${r} inside the rate domain`);
		}
	}
});

// --- the hanging rug, the skyline, the threshold grid and the failure rows ---------------------

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

test('the threshold grid holds exactly the missions at or under the threshold, below the figure', () => {
	const ref = site.story.referenceCost;
	const under = tiles.filter((m) => m.cost > 0 && m.cost <= ref);
	for (const [W, H] of sizes) {
		const top = W < 600 ? 56 : 96;
		const small = gridLayout(under, W, H, { top });
		assert.deepEqual([...small.pos.keys()].sort(), under.map((m) => m.id).sort());
		assert.equal(small.pos.size, site.story.threshold.missions);
		for (const p of small.pos.values()) assert.ok(inStage(p, W, H) && p.y >= top, `${W}px: below the figure`);
	}
});

const failureCheck = (divisions, threshold) => {
	for (const [W, H] of sizes) {
		const layout = failureLayout(tiles, W, H, { divisions, threshold });
		const slugs = new Set(divisions.map((d) => d.division));
		const ids = tiles.filter((m) => slugs.has(m.division) && m.cost > 0).map((m) => m.id).sort();
		assert.deepEqual([...layout.pos.keys()].sort(), ids, `${W}px: every costed mission placed once`);
		const rows = new Map(layout.rows.map((r) => [r.division, r]));
		const boxes = [];
		for (const [id, p] of layout.pos) {
			const m = byId.get(id);
			const row = rows.get(m.division);
			assert.ok(inStage(p, W, H), `${W}px: ${id} inside the stage`);
			assert.ok(p.y >= layout.headH && p.y >= row.y && p.y + p.s <= row.figuresY, `${W}px: ${id} inside its row, under the head`);
			assert.ok(m.cost <= threshold ? p.x + p.s <= layout.dividerX : p.x >= layout.dividerX, `${W}px: ${id} on its side`);
			boxes.push(p);
		}
		for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${W}px: no overlap`);
		assert.ok(layout.bottomY <= H, `${W}px: rows fit the stage`);
	}
	return failureLayout(tiles, 900, 640, { divisions, threshold });
};

test('failure rows: geometry over every division at $150M', () => {
	failureCheck(site.divisions.map((d) => ({ division: d.slug, name: d.name })), 150);
});

test('failure rows count what the failure facts count', () => {
	const { failure, referenceCost: ref } = site.story;
	const layout = failureCheck(failure.byDivision, ref);
	const rows = new Map(layout.rows.map((r) => [r.division, r]));
	for (const d of failure.byDivision) {
		assert.equal(rows.get(d.division).under, d.under.missions, `${d.division} under`);
		assert.equal(rows.get(d.division).over, d.over.missions, `${d.division} over`);
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

// --- the publications waffle ----------------------------------------------------------------

test('waffle: one box per 100 mission papers where the stage allows, the next unit where not, inside the stage', () => {
	// the story's facts as of this snapshot: 1,329 of 135,129 mission papers
	const [papers, papersAll] = [1329, 135129];
	for (const [W, H, top, unit] of [
		[704, 666, 96, 100],
		[374, 367, 56, 100],
		[351, 262, 56, 200]
	]) {
		const compact = W < 600;
		const l = waffleLayout(papersAll, papers, W, H, { top, compact });
		assert.equal(l.unit, unit, `${W}×${H}: unit`);
		assert.equal(l.cells, Math.ceil(papersAll / unit));
		assert.ok(l.cols * l.rows >= l.cells && (l.rows - 1) * l.cols < l.cells, `${W}×${H}: no empty row`);
		assert.ok(l.pitch >= (compact ? 7 : 9), `${W}×${H}: pitch ${l.pitch}`);
		assert.equal(l.size, l.pitch - l.gap);
		assert.equal(l.width, l.cols * l.pitch - l.gap);
		assert.ok(l.x0 >= 0 && l.x0 + l.width <= W, `${W}×${H}: inside the stage across`);
		assert.ok(l.y0 >= top && l.y0 + l.height <= H - l.margin - l.legendH, `${W}×${H}: under the figure, over the legend`);
		assert.equal(l.full, Math.floor(papers / unit));
		assert.ok(Math.abs(l.fraction - (papers / unit - l.full)) < 1e-9);
		if (unit === 100) assert.ok(l.full === 13 && Math.abs(l.fraction - 0.29) < 1e-9, `${W}×${H}: 13 full boxes and 29% of the next`);
	}
});

test('waffle ring: one row segment round the 14 boxes at 704×666, an L or a block when the run wraps', () => {
	const l = waffleLayout(135129, 1329, 704, 666, { top: 96 });
	const { x0, y0, pitch, size } = l;
	// 13 full boxes and the partial one, all in row 0
	assert.deepEqual(l.ring.points, [
		[x0 - 3, y0 - 3],
		[x0 + 13 * pitch + size + 3, y0 - 3],
		[x0 + 13 * pitch + size + 3, y0 + size + 3],
		[x0 - 3, y0 + size + 3]
	]);
	assert.equal((l.ring.d.match(/Q/g) ?? []).length, 4, 'four rounded corners');
	assert.deepEqual(l.ring.label, { x: x0 + 13 * pitch + size + 9, y: y0 + size / 2, below: false });

	// 10 boxes of 100 on a 4-column grid: 6.5 boxes is two rows, the second three long
	const L = waffleLayout(1000, 650, 200, 220);
	assert.equal(L.cols, 4);
	const right = (k) => L.x0 + (k - 1) * L.pitch + L.size + 3;
	const bottom = (r) => L.y0 + (r - 1) * L.pitch + L.size + 3;
	assert.deepEqual(L.ring.points, [
		[L.x0 - 3, L.y0 - 3],
		[right(4), L.y0 - 3],
		[right(4), bottom(1)],
		[right(3), bottom(1)],
		[right(3), bottom(2)],
		[L.x0 - 3, bottom(2)]
	]);
	assert.equal((L.ring.d.match(/Q/g) ?? []).length, 6);
	assert.deepEqual(L.ring.label, { x: L.x0 - 3, y: bottom(2) + 6, below: true }, 'the first row ends at the grid edge, so the label goes under the ring');

	// exactly two whole rows: a block
	const B = waffleLayout(1000, 800, 200, 220);
	assert.deepEqual(B.ring.points, [
		[B.x0 - 3, B.y0 - 3],
		[right(4), B.y0 - 3],
		[right(4), bottom(2)],
		[B.x0 - 3, bottom(2)]
	]);
	assert.equal(waffleLayout(1000, 0, 200, 220).ring, null, 'nothing to ring');
});
