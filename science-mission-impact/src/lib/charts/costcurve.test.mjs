import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveFacts, runningAt, curveChart } from './costcurve.js';

// Four placed missions, two of them holding top papers; the packager's order and shares.
const curve = {
	points: [
		{ id: 'a', cost: 8, topShare: 0, costShare: 0.004 },
		{ id: 'b', cost: 120, topShare: 0.3, costShare: 0.064 },
		{ id: 'c', cost: 900, topShare: 0.3, costShare: 0.514 },
		{ id: 'd', cost: 1000, topShare: 1, costShare: 1 }
	],
	band: { p25: 120, p50: 1000, p75: 1000 },
	cheapestWithTop: { id: 'b', name: 'Bravo', cost: 120 },
	unplaced: ['e']
};
const credit = (top10, top1) => ({ full: { top10, top1 } });
const missions = [
	{ id: 'a', name: 'Alpha', ...credit(0, 0) },
	{ id: 'b', name: 'Bravo', ...credit(3, 1) },
	{ id: 'c', name: 'Charlie', ...credit(null, null) }, // unavailable: adds nothing
	{ id: 'd', name: 'Delta', ...credit(7, 2) },
	{ id: 'e', name: 'Echo', ...credit(5, 5) } // no cost, not placed
];

const OPTS = { padTop: 10, plotH: 300, mark: 8, gap: 2, gutter: 44, rightPad: 26, axisH: 24 };

test('curveFacts sums each mission’s own credit in cost order', () => {
	const f = curveFacts(curve, missions, 'full', 10);
	assert.deepEqual(f.points.map((p) => p.name), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
	assert.deepEqual(f.points.map((p) => p.credit), [0, 3, 0, 7]);
	assert.deepEqual(f.points.map((p) => p.total), [0, 3, 3, 10]);
	assert.deepEqual(f.points.map((p) => p.reached), [false, true, false, true]);
	assert.equal(f.total, 10); // the unplaced mission is in neither the line nor the total
	assert.equal(f.hasTop, true);
	assert.equal(f.unplaced, 1);
	assert.deepEqual(curveFacts(curve, missions, 'full', 1).points.map((p) => p.total), [0, 1, 1, 3]);
});

test('curveFacts is null for a view with no curve, and names fall back to ids', () => {
	assert.equal(curveFacts(null, missions, 'full', 10), null);
	assert.equal(curveFacts({ points: [], unplaced: [] }, missions, 'full', 10), null);
	const f = curveFacts(curve, [], 'full', 10);
	assert.equal(f.points[0].name, 'a');
	assert.equal(f.hasTop, false);
});

test('runningAt reads the totals at the dearest mission within a cost', () => {
	const f = curveFacts(curve, missions, 'full', 10);
	assert.equal(runningAt(f.points, 7), null); // nothing that cheap
	assert.equal(runningAt(f.points, 8).id, 'a');
	assert.equal(runningAt(f.points, 150).total, 3);
	assert.equal(runningAt(f.points, 1e6).id, 'd');
});

test('a division with no top papers in the view still places its missions', () => {
	const f = curveFacts(curve, missions.map((m) => ({ ...m, ...credit(0, 0) })), 'full', 10);
	assert.equal(f.hasTop, false);
	const c = curveChart(f, 1000, OPTS);
	assert.equal(c.path, null); // nothing to draw, but the axis and the rug stand
	assert.deepEqual(c.yTicks, [0, 1]);
	assert.equal(c.marks.length, 4);
	assert.ok(c.marks.every((m) => !m.reached));
});

test('the line steps after each mission on a linear count axis', () => {
	const f = curveFacts(curve, missions, 'full', 10);
	const c = curveChart(f, 1000, OPTS);
	const r = (n) => Number(n.toFixed(1)); // the path rounds to a tenth of a pixel
	assert.ok(c.path.startsWith(`M${r(c.x0)},${r(c.y(0))}`));
	assert.ok(c.path.endsWith(`H${r(c.x1)}`));
	assert.equal((c.path.match(/V/g) ?? []).length, f.points.length);
	assert.ok(!c.path.includes('NaN'));
	assert.equal(c.y(0), c.top + c.plotH);
	assert.ok(c.y(10) >= c.top); // the grand total is inside the niced domain
	assert.deepEqual(c.yTicks, [0, 5, 10]);
	assert.ok(Math.abs(c.y(5) - (c.y(0) + c.y(10)) / 2) < 1e-9); // linear
	// the x axis is log: equal ratios take equal space
	assert.ok(Math.abs(c.x(100) - c.x(10) - (c.x(1000) - c.x(100))) < 1e-6);
});

test('the chart keeps every mark and tick inside the measured width', () => {
	const f = curveFacts(curve, missions, 'full', 10);
	for (const width of [1160, 375]) {
		const c = curveChart(f, width, { ...OPTS, mark: width < 560 ? 6 : 8 });
		assert.ok(c.marks.every((m) => m.x >= 0 && m.x + m.s <= width), `${width}`);
		assert.ok(c.marks.every((m) => m.y >= c.rugTop && m.y + m.s <= c.height + 1), `${width}`);
		assert.ok(c.ticks.every((t) => c.x(t.value) >= c.left && c.x(t.value) <= c.right), `${width}`);
		assert.ok(c.height >= c.rugTop + 6, `${width}`); // the rug is at least one level deep
	}
	// 2× and 5× labels are on the wide stage and gone on the phone
	const labelled = (w) => curveChart(f, w, OPTS).ticks.filter((t) => t.label).map((t) => t.value);
	assert.ok(labelled(1160).includes(20) && labelled(1160).includes(500));
	assert.deepEqual(labelled(375), [10, 100, 1000]);
});

test('an unmeasured stage draws nothing', () => {
	assert.equal(curveChart(curveFacts(curve, missions, 'full', 10), 0, OPTS), null);
	assert.equal(curveChart(null, 1000, OPTS), null);
});
