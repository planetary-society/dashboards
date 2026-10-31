// Geometry of the story's cost-axis states against the packaged data: nothing overlaps,
// nothing leaves the stage, and the running shares end where they must.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { costLayout, rugLayout, skylineLayout, skylineZoom, skylineHit, laneHit, primerLayout, columnLabel, tierOutcomeLayout, focusLayout, perDollarLayout, trendLine } from './layouts.js';
import { runningLine, trendBand } from '../charts/perdollar.js';

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

test('each lane’s rate scale is the first multiple of 10 above its highest rate', () => {
	for (const row of costLayout(tiles, 900, 640, { divisions: site.divisions }).rows) {
		const top = Math.max(0, ...row.members.map((t) => t.top10PerYear ?? 0));
		assert.ok(row.rateTop > top && row.rateTop - top <= 10 && row.rateTop % 10 === 0, `${row.slug}: ${row.rateTop} over ${top}`);
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

test('pointing at the lanes picks the nearest bar in the band under the pointer, and nothing between bands or bars', () => {
	for (const [W, H] of sizes) {
		const lanes = storyCost(W, H);
		for (const row of lanes.rows) {
			const lead = row.members.reduce((a, t) => ((t.top10PerYear ?? 0) > (a.top10PerYear ?? 0) ? t : a));
			const id = laneHit(lanes, lanes.x(lead.cost), row.shelfY - 2);
			assert.equal(byId.get(id).division, row.slug, `${W}px: ${row.slug}’s own band`);
			assert.equal(lanes.x(byId.get(id).cost), lanes.x(lead.cost), `${W}px: the bar under the pointer`);
			assert.ok(byId.get(id).top10PerYear > 0, `${W}px: only missions with a bar`);
		}
		assert.equal(laneHit(lanes, W / 2, lanes.rows[0].y - 1), null, `${W}px: above the bands`);
		assert.equal(laneHit(lanes, -100, lanes.rows[0].shelfY - 2), null, `${W}px: no bar in reach`);
	}
});

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
		// the axis labels: papers over the top gridline's label, its own line under the title on a phone; citations under the ticks, on the stage
		assert.ok(p.titleY > 12 && p.papersY <= p.top - 12 && p.citesY >= p.ground + 30 && p.citesY <= H - 4, `${W}px: labels placed`);
		if (W < 600) assert.ok(p.papersY - p.titleY >= 16, `${W}px: papers clear of the title`);
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

test('the tier outcome plot: every costed mission once, in its tier’s column, up if it met its goals and down if not, the counts the Analysis page’s', () => {
	const { tiers, failures } = site.analysis;
	const costed = tiles.filter((t) => t.cost > 0);
	for (const [W, H] of sizes) {
		const layout = tierOutcomeLayout(tiles, tiers, W, H);
		assert.equal(layout.pos.size, costed.length, `${W}px: every costed mission once`);
		layout.cols.forEach((c, i) => {
			assert.equal(c.ok + c.short, failures.tiers[i].missions, `${W}px: tier ${i} missions`);
			assert.equal(c.short, failures.tiers[i].failed + failures.tiers[i].partial, `${W}px: tier ${i} shortfalls`);
		});
		for (const t of costed) {
			const p = layout.pos.get(t.id);
			const c = layout.cols.find((col) => t.cost > col.lo && (col.hi == null || t.cost <= col.hi));
			assert.ok(inStage(p, W, H) && p.y >= layout.top && p.y + p.s <= layout.footY, `${W}px: ${t.id} inside the plot`);
			assert.ok(p.x >= c.x && p.x + p.s <= c.x + c.w, `${W}px: ${t.id} inside its tier’s column`);
			assert.ok(t.shortfall ? p.y >= layout.zeroY : p.y + p.s <= layout.zeroY, `${W}px: ${t.id} on its side of zero`);
		}
		const boxes = [...layout.pos.values()];
		for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${W}px: no overlap`);
	}
});

test('the focus division on the lanes’ cost axis: its squares in the rug, the chart inside the stage, the scale just over the tallest bar', () => {
	const { focusDivision } = site.story;
	const leader = site.story.rate.divisions.find((d) => d.division === focusDivision).largest;
	const comparedTiles = tiles.filter((t) => site.story.comparison.divisions.includes(t.division));
	for (const [W, H] of sizes) {
		const { chart, facts, pos } = focusLayout(comparedTiles, W, H, { division: focusDivision });
		assert.equal(pos.size, tiles.filter((m) => m.division === focusDivision && m.cost > 0).length);
		assert.ok(chart.height <= H, `${W}px: ${chart.height} of ${H}`);
		for (const [id, p] of pos) assert.ok(inStage(p, W, H) && p.y > chart.y(0), `${W}px: ${id} under the axis`);
		assert.deepEqual(chart.x.domain(), costLayout(comparedTiles, W, H, { divisions: site.divisions.filter((d) => site.story.comparison.divisions.includes(d.slug)) }).x.domain(), 'the same costs as the lanes');
		const largest = facts.points.find((p) => p.id === leader.id);
		assert.equal(largest.credit, Math.max(...facts.points.map((p) => p.credit)), 'the tallest bar is the packaged largest');
		assert.ok(Math.abs(largest.credit - leader.perYear) < 0.01);
		assert.equal(chart.y.domain()[1], (Math.floor(largest.credit / 10) + 1) * 10, 'the first multiple of 10 above it');
	}
});

test('per dollar: every measured mission in its band, and each band’s squares are the packaged running mean’s cohort', () => {
	const compared = site.divisions.filter((d) => site.story.comparison.divisions.includes(d.slug));
	const focus = compared.filter((d) => d.slug === site.story.focusDivision);
	const averages = new Map(site.story.perDollar.map((d) => [d.division, d.runningMean]));
	const membersOf = (slug) => tiles.filter((t) => t.division === slug && t.cost > 0 && t.citations != null && t.top10 != null);
	for (const [W, H] of sizes) {
		for (const divisions of [focus, compared]) {
			const layout = perDollarLayout(tiles, W, H, { divisions, averages });
			assert.deepEqual([...perDollarLayout(tiles, W, H, { divisions, averages }).pos.keys()], [...layout.pos.keys()], `${W}px: no outcome-only tile placed`);
			for (const row of layout.rows) {
				const { comparison, points } = averages.get(row.slug);
				const members = membersOf(row.slug);
				assert.equal(comparison.under.missions + comparison.over.missions, members.length, `${row.slug}: the packager's missions, zeros included`);
				const costs = members.map((t) => t.cost);
				assert.deepEqual([points[0][0], points.at(-1)[0]], [Math.min(...costs), Math.max(...costs)], `${row.slug}: the average spans the squares`);
				for (const t of members) {
					const p = layout.pos.get(t.id);
					assert.ok(inStage(p, W, H) && p.y >= row.curveTop - p.s && p.y + p.s <= row.shelfY + 0.5, `${W}px ${row.slug}: ${t.id} inside its band`);
				}
				const logs = costs.map(Math.log10);
				assert.deepEqual(row.span, [Math.min(...logs), Math.max(...logs)], `${row.slug}: the line spans every measured mission, the zeros included`);
				// the imagined lines pivot on the supported average nearest the middle of that span
				const mid = (row.span[0] + row.span[1]) / 2;
				const nearest = Math.min(...points.filter(([, mean]) => mean > 0).map(([cost]) => Math.abs(Math.log10(cost) - mid)));
				assert.ok(Math.abs(Math.abs(row.pivot.cost - mid) - nearest) < 1e-12, `${row.slug}: pivot nearest the middle`);
				const { y1, y2 } = trendLine(layout, row, -0.5);
				assert.ok(y2 > y1, `${row.slug}: a falling line is drawn falling`);
			}
		}
	}
});

test('per-dollar charts retain selected empty failures but exclude unavailable output', () => {
	const failure = { id: 'selected', division: 'test', cost: 20, citations: 0, top10: 0, failed: true, launchYear: 2024 };
	const candidates = [failure, { ...failure, id: 'unavailable', citations: null, top10: null }];
	const layout = perDollarLayout(candidates, 800, 500, { divisions: [{ slug: 'test' }] });
	assert.deepEqual([...layout.pos.keys()], ['selected']);
});

test('confidence ribbons keep unclamped log geometry and clip above the zero shelf over observed costs', () => {
	const points = [10, 100, 1000].map((cost) => ({ id: `${cost}`, division: 'test', cost, citations: cost, top10: 1 }));
	points.push({ id: 'failed', division: 'test', cost: 20, citations: 0, top10: 0 });
	const ribbon = [[10, 1, 10000], [100, 90, 110], [1000, 1, 10000]];
	for (const [W, H] of sizes) {
		const layout = perDollarLayout(points, W, H, { divisions: [{ slug: 'test' }] });
		const row = layout.rows[0];
		const band = trendBand(layout, row, ribbon);
		assert.deepEqual([band.x, band.width, band.y, band.height], [layout.x(10), layout.x(1000) - layout.x(10), row.curveTop, row.floorY - row.curveTop]);
		assert.ok(band.y + band.height < row.shelfY, 'the clipping rectangle excludes the zero shelf');
		const vertices = [...band.path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
		assert.ok(vertices.every(([x]) => x >= band.x - 0.001 && x <= band.x + band.width + 0.001), 'no extrapolation beyond observed costs');
		assert.ok(Math.min(...vertices.map(([, y]) => y)) < row.curveTop && Math.max(...vertices.map(([, y]) => y)) > row.floorY, 'out-of-range bounds stay unclamped until SVG clipping');
		assert.match(band.path, /Z$/, 'the ribbon is a closed area');
		assert.equal(trendBand(layout, row), null);
		assert.equal(trendBand(layout, row, []), null);
	}
});

test('running averages keep gaps, low positive means and true zeros distinct at desktop and phone widths', () => {
	const missions = [10, 100, 1000].map((cost) => ({ id: `${cost}`, division: 'test', cost, citations: cost, top10: 1 }));
	missions.push({ id: 'failed', division: 'test', cost: 20, citations: 0, top10: 0 });
	const average = { points: [[10, 0, 0, 5], [40, 0.1, 0, 1], [100, null, null, null], [500, 10, 1, 100], [1000, 20, 2, 200]] };
	for (const [W, H] of sizes) {
		const layout = perDollarLayout(missions, W, H, { divisions: [{ slug: 'test' }], averages: new Map([['test', average]]) });
		const row = layout.rows[0];
		assert.equal(row.average, average);
		assert.ok(layout.scale.domain()[0] < 0.1, 'the average can be below every positive observation');
		assert.ok(row.rateY(0.1) < row.floorY && row.rateY(0.1) > row.curveTop, 'a low positive mean stays in the positive plot');
		assert.equal(10 ** row.pivot.rate, 0.1, 'the hypothetical guide pivots on a supported average');
		assert.ok(trendLine(layout, row, 0), 'the flat hypothetical still draws');
		const curve = runningLine(layout, row);
		assert.equal((curve.path.match(/M/g) ?? []).length, 2, 'unsupported windows break the curve');
		assert.equal(Number(curve.path.match(/^M[^,]+,([\d.]+)/)[1]), row.shelfY, 'a true zero mean is on the zero shelf');
		const band = trendBand(layout, row, average.points.map(([cost, , lo, hi]) => [cost, lo, hi]));
		assert.equal((band.path.match(/M/g) ?? []).length, 2, 'the interval has the same gap');
		assert.ok(!/NaN|Infinity/.test(band.path), 'zero bounds never enter a logarithm');
		assert.ok(band.path.includes(`,${Math.round(row.floorY * 1000) / 1000}`), 'a zero bound reaches the positive plot floor');
		assert.ok(band.y + band.height < row.shelfY, 'the interval is clipped above the zero shelf');
		assert.equal(runningLine(layout, { ...row, average: { points: [[10, null, null, null]] } }), null);
		assert.equal(trendBand(layout, row, [[10, null, null]]), null);
	}
});

test('citations against cost plots each mission’s citations with no average', () => {
	const focus = site.divisions.filter((d) => d.slug === site.story.focusDivision);
	const averages = new Map([[focus[0].slug, { points: [[100, 10, 1, 100]] }]]);
	const members = tiles.filter((t) => t.division === focus[0].slug && t.cost > 0 && t.citations != null && t.top10 != null);
	const cited = members.filter((t) => t.citations > 0);
	for (const [W, H] of sizes) {
		const [row] = perDollarLayout(tiles, W, H, { divisions: focus, averages, citations: true }).rows;
		assert.equal(row.average, null, 'no average');
		const most = cited.reduce((a, b) => (b.citations > a.citations ? b : a));
		const least = cited.reduce((a, b) => (b.citations < a.citations ? b : a));
		assert.ok(row.rateY(most.citations) < row.rateY(least.citations), 'more citations sit higher');
	}
});
