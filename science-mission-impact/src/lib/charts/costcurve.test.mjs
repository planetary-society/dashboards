import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveFacts, runningAt, curveChart } from './costcurve.js';

// Four missions, two of them holding top papers. Cumulative shares as the packager writes them.
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
const missions = [
	{ id: 'a', name: 'Alpha' },
	{ id: 'b', name: 'Bravo' },
	{ id: 'c', name: 'Charlie' },
	{ id: 'd', name: 'Delta' }
];

const OPTS = { padTop: 10, plotH: 300, mark: 9, gap: 1, gutter: 44, rightPad: 26, axisH: 20 };

test('curveFacts takes the per-mission steps back out of the running totals', () => {
	const f = curveFacts(curve, missions);
	assert.deepEqual(f.points.map((p) => p.name), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
	assert.deepEqual(f.points.map((p) => p.share), [0, 0.3, 0, 0.7]);
	assert.deepEqual(f.points.map((p) => p.reached), [false, true, false, true]);
	assert.equal(f.hasTop, true);
	assert.equal(f.unplaced, 1);
	// the running totals where the first quarter of the top papers is in
	assert.equal(f.atP25.id, 'b');
	assert.equal(f.atP25.costShare, 0.064);
});

test('curveFacts is null for a view with no curve, and names fall back to ids', () => {
	assert.equal(curveFacts(null, missions), null);
	assert.equal(curveFacts({ points: [], band: {}, unplaced: [] }, missions), null);
	const f = curveFacts(curve, []);
	assert.equal(f.points[0].name, 'a');
	assert.equal(f.atP25.id, 'b');
});

test('a division with no top papers in the view still places its missions', () => {
	const flat = { ...curve, points: curve.points.map((p) => ({ ...p, topShare: 0 })), band: { p25: null, p50: null, p75: null } };
	const f = curveFacts(flat, missions);
	assert.equal(f.hasTop, false);
	assert.equal(f.atP25, null);
	const c = curveChart(f, 1000, OPTS);
	assert.equal(c.topPath, null); // nothing to draw, but the spending line and the rug stand
	assert.equal(c.band, null);
	assert.equal(c.marks.length, 4);
	assert.ok(c.marks.every((m) => !m.reached));
});

test('runningAt reads the totals at the dearest mission within a cost', () => {
	const f = curveFacts(curve, missions);
	assert.equal(runningAt(f.points, 7), null); // nothing that cheap
	assert.equal(runningAt(f.points, 8).id, 'a');
	assert.equal(runningAt(f.points, 899).id, 'b');
	assert.equal(runningAt(f.points, 1e6).id, 'd');
});

test('the chart steps after each mission and runs flat to both edges', () => {
	const f = curveFacts(curve, missions);
	const c = curveChart(f, 1000, OPTS);
	const r = (n) => Number(n.toFixed(1)); // the path rounds to a tenth of a pixel
	assert.ok(c.topPath.startsWith(`M${r(c.x0)},${r(c.y(0))}`));
	assert.ok(c.topPath.endsWith(`H${r(c.x1)}`));
	assert.equal((c.topPath.match(/H/g) ?? []).length, f.points.length + 1);
	assert.equal((c.topPath.match(/V/g) ?? []).length, f.points.length);
	assert.ok(!c.topPath.includes('NaN'));
	assert.equal(c.y(1), c.top); // 100% sits on the top gridline
	assert.equal(c.y(1) + c.plotH, c.y(0));
	// the x axis is log: equal ratios take equal space
	assert.ok(Math.abs(c.x(100) - c.x(10) - (c.x(1000) - c.x(100))) < 1e-6);
});

test('the chart keeps every mark, tick and band inside the measured width', () => {
	const f = curveFacts(curve, missions);
	for (const width of [1160, 375]) {
		const c = curveChart(f, width, OPTS);
		assert.ok(c.marks.every((m) => m.x >= 0 && m.x + m.s <= width), `${width}`);
		assert.ok(c.marks.every((m) => m.y >= c.rugTop && m.y + m.s <= c.height + 1), `${width}`);
		assert.ok(c.ticks.every((t) => c.x(t.value) >= c.left && c.x(t.value) <= c.right), `${width}`);
		assert.ok(c.band.x + c.band.w <= c.right + 1e-9, `${width}`);
		// the band's caption starts in the corner the curves cannot reach and stops at p75
		assert.ok(c.band.labelX >= c.left && c.band.labelX < c.right, `${width}`);
		assert.ok(c.band.labelX + c.band.labelW <= Math.max(c.left + 124, c.x(120) + c.band.w + 1), `${width}`);
		assert.ok(c.height >= c.rugTop + OPTS.mark, `${width}`); // the rug is at least one level deep
	}
});

test('tick labels thin out rather than collide when a decade gets narrow', () => {
	const many = {
		...curve,
		points: [
			{ id: 'a', cost: 0.5, topShare: 0, costShare: 0.01 },
			{ id: 'd', cost: 40000, topShare: 1, costShare: 1 }
		],
		band: { p25: 40000, p50: 40000, p75: 40000 }
	};
	const f = curveFacts(many, missions);
	const phone = { ...OPTS, padTop: 8, plotH: 220, mark: 6, gutter: 32, rightPad: 22, axisH: 18 };
	const wide = curveChart(f, 1160, OPTS);
	assert.deepEqual(wide.ticks.map((t) => t.value), [1, 10, 100, 1000, 10000]);
	assert.ok(wide.ticks.every((t) => !t.minor));
	// five decades still stand apart at 375; they stop doing so on a narrower stage
	assert.ok(curveChart(f, 375, phone).ticks.every((t) => !t.minor));
	assert.deepEqual(curveChart(f, 280, phone).ticks.map((t) => t.minor), [false, true, false, true, false]);
});

test('an unmeasured stage draws nothing', () => {
	assert.equal(curveChart(curveFacts(curve, missions), 0, OPTS), null);
	assert.equal(curveChart(null, 1000, OPTS), null);
});
