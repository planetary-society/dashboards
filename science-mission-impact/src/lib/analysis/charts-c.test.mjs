import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLPS_SCATTER_HEIGHT, clpsScatterLayout, perBillion, placeLabels } from './charts-c.js';

// The packaged clps.surface and landers as of the October 2026 export, plus one mission without a cost.
const mission = (id, name, cost, papers, selection, failed = false) => ({ id, name, fullName: name, start: '2000-01-01', cost, selection, failed, papers });
const clps = {
	missions: [
		{ id: 'peregrine', name: 'Peregrine', cost: 130.3, papers: 3 },
		{ id: 'im_1_odysseus', name: 'IM-1 Odysseus', cost: 146.5, papers: 6 },
		{ id: 'm1', name: 'Blue Ghost M1', cost: 174.3, papers: 4 },
		{ id: 'im_2_athena', name: 'IM-2 Athena', cost: 170, papers: 3 }
	],
	surface: {
		month: 33,
		clps: { papers: 16, cost: 621.1 },
		missions: [
			mission('dart', 'DART', 399.5, 140, 'directed'),
			mission('deep_impact_epoxi', 'Deep Impact (EPOXI)', 623.5, 139, 'competed'),
			mission('lcross', 'LCROSS', 139, 24, 'competed'),
			mission('mars_pathfinder', 'Mars Pathfinder', 613, 67, 'directed'),
			mission('spirit', 'Spirit', 756.4, 100, 'directed'),
			mission('opportunity', 'Opportunity', 756.4, 108, 'directed'),
			mission('phx', 'Phoenix', 869.4, 105, 'competed'),
			mission('insight', 'InSight', 1365.5, 118, 'competed'),
			mission('msl', 'Curiosity', 4020.6, 221, 'directed'),
			mission('mars_2020', 'Mars 2020', 3634.1, 206, 'directed'),
			mission('ds_2', 'DS-2', 58, 0, 'directed', true),
			mission('mpl', 'Mars Polar Lander', 306.4, 0, 'directed', true),
			mission('nocost', 'No Cost', null, 50, null)
		],
		behind: { total: true, perDollar: true }
	}
};

const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const markBox = (m) => ({ x0: m.x - m.r, x1: m.x + m.r, y0: m.y - m.r, y1: m.y + m.r });

test('papers per $1B', () => {
	assert.equal(perBillion(16, 621.1), 16 / 0.6211);
	assert.equal(perBillion(0, 58), 0);
	assert.equal(perBillion(5, null), null);
	assert.equal(perBillion(5, 0), null);
});

test('marks land at their cost and papers per $1B, failures at zero above the axis, missions without a cost left out', () => {
	const L = clpsScatterLayout(clps, 620);
	assert.equal(L.H, CLPS_SCATTER_HEIGHT);
	assert.deepEqual(L.unplaced, ['nocost']);
	assert.equal(L.points.length, 12);
	assert.equal(L.y.domain()[0], 0);
	const dart = L.points.find((p) => p.id === 'dart');
	assert.equal(dart.x, L.x(399.5));
	assert.equal(dart.y, L.y(140 / 0.3995));
	assert.equal(dart.kind, 'directed');
	assert.equal(L.points.find((p) => p.id === 'lcross').kind, 'competed');
	const mpl = L.points.find((p) => p.id === 'mpl');
	assert.equal(mpl.kind, 'failed');
	assert.equal(mpl.y, L.y(0));
	assert.ok(mpl.y < L.bottom - mpl.r, 'the zero row clears the cost axis');
	const im1 = L.landers.find((d) => d.id === 'im_1_odysseus');
	assert.deepEqual([im1.x, im1.y], [L.x(146.5), L.y(6 / 0.1465)]);
	assert.deepEqual([L.pooled.x, L.pooled.y, L.pooled.n, L.pooled.papers], [L.x(621.1), L.y(16 / 0.6211), 4, 16]);
	// the highest rate (DART, ~350) fits under the top of the nice domain
	assert.ok(L.y.domain()[1] >= 140 / 0.3995);
	for (const t of L.xTicks.filter((t) => t.label)) assert.ok(L.x(t.value) > 0 && L.x(t.value) < 620);
});

test('every mark is named, inside the plot, clear of every other label and mark, from phone to desktop widths', () => {
	for (const W of [340, 360, 390, 430, 480, 540, 620, 700]) {
		const L = clpsScatterLayout(clps, W);
		const marks = [...L.points, ...L.landers, L.pooled];
		assert.deepEqual(new Set(L.labels.map((l) => l.id)), new Set([...L.points, ...L.landers].map((p) => p.id).concat('clps')), `${W}px`);
		for (const [i, l] of L.labels.entries()) {
			assert.ok(l.clear, `${W}px: ${l.id} found a clear spot`);
			assert.ok(l.x0 >= L.left && l.x1 <= L.right && l.y0 >= 0 && l.y1 <= L.bottom, `${W}px: ${l.id} inside the plot`);
			for (const m of marks) assert.ok(!overlap(l, markBox(m)), `${W}px: ${l.id} clear of a mark`);
			for (const o of L.labels.slice(i + 1)) assert.ok(!overlap(l, o), `${W}px: ${l.id} and ${o.id} overlap`);
		}
		const big = L.labels.find((l) => l.id === 'clps');
		assert.deepEqual(big.lines.map((x) => x.text), ['CLPS (4 landers)', '16 papers to date']);
	}
	// deterministic
	assert.deepEqual(clpsScatterLayout(clps, 340).labels, clpsScatterLayout(clps, 340).labels);
});

test('placeLabels: beside the mark when free, nudged with a leader when not, clamped when nothing fits', () => {
	const bounds = { x0: 0, x1: 200, y0: 0, y1: 200 };
	const item = (id, x, y) => ({ id, x, y, r: 4, w: 40, lines: [id], lineH: 13 });
	const [a, b] = placeLabels([item('a', 50, 100), item('b', 50, 100)], [{ x: 50, y: 100, r: 4 }], bounds);
	assert.deepEqual([a.anchor, a.x0, a.leader], ['start', 58, null]); // right of the mark
	assert.equal(b.anchor, 'end'); // the right is taken: left of the mark
	assert.equal(b.x1, 42);
	// near the right edge the label goes left
	const [edge] = placeLabels([item('e', 190, 100)], [], bounds);
	assert.equal(edge.anchor, 'end');
	// boxed in on both sides and above/below: nudged a line, with a leader from the mark
	const walls = [{ x: 74, y: 100, r: 16 }, { x: 26, y: 100, r: 16 }, { x: 50, y: 78, r: 6 }, { x: 50, y: 122, r: 6 }];
	const [nudged] = placeLabels([{ ...item('n', 50, 100), w: 10 }], walls, bounds);
	assert.ok(nudged.clear && nudged.leader && nudged.lines[0].y !== 100);
	// nothing fits: the first spot, clamped into bounds
	const [stuck] = placeLabels([{ ...item('s', 190, 100), w: 300 }], [], bounds);
	assert.deepEqual([stuck.clear, stuck.x1 <= 200], [false, true]);
});
