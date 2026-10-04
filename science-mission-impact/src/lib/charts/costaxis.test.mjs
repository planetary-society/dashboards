// The four pieces every cost-ordered view shares. They are small, and they are exactly the
// places the story's step and the division's chart could have quietly disagreed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleLog } from 'd3-scale';
import { byCostThenId, costTicks, decadeTicks, minorDollarTicks, stackLevels, stepAfterPath } from './costaxis.js';

test('byCostThenId orders by cost and settles a tie on the id', () => {
	const list = [
		{ id: 'c', cost: 10 },
		{ id: 'a', cost: 10 },
		{ id: 'b', cost: 2 }
	];
	assert.deepEqual([...list].sort(byCostThenId).map((t) => t.id), ['b', 'a', 'c']);
	// equal on both counts is equal: a stable sort then leaves them where they were
	assert.equal(byCostThenId({ id: 'a', cost: 10 }, { id: 'a', cost: 10 }), 0);
});

test('stackLevels lifts an item only when it would touch its neighbour', () => {
	const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
	const at = { a: 0, b: 4, c: 40, d: 44 };
	const { levels, depth } = stackLevels(list, (t) => at[t.id], 9, 1);
	assert.deepEqual([...levels.values()], [0, 1, 0, 1]);
	assert.equal(depth, 2);
	const clear = stackLevels(list, (t) => at[t.id] * 10, 9, 1);
	assert.equal(clear.depth, 1);
	assert.deepEqual(stackLevels([], () => 0, 9, 1), { levels: new Map(), depth: 0 });
});

test('decadeTicks lands on whole powers of ten inside the domain', () => {
	assert.deepEqual(decadeTicks(0.48, 12624.875), [1, 10, 100, 1000, 10000]);
	assert.deepEqual(decadeTicks(10, 1000), [10, 100, 1000]); // both edges are themselves decades
	assert.deepEqual(decadeTicks(1200, 9000), []); // no decade in between
	// repeated ×10 drifts off the decade; every value is a round number regardless
	for (const v of decadeTicks(1e-6, 1e12)) assert.equal(v, Number(v.toPrecision(12)));
});

test('costTicks labels 2× and 5× only when every label has room, and drops them first', () => {
	const at = (w) => costTicks(scaleLog().domain([3, 4000]).range([0, w]));
	const labels = (ticks) => ticks.filter((t) => t.label).map((t) => t.value);
	// 1100px over ~3.1 decades: 1-2-5 all fit, gridlines on the decades only
	const wide = at(1100);
	assert.deepEqual(labels(wide), [5, 10, 20, 50, 100, 200, 500, 1000, 2000]);
	assert.deepEqual(wide.filter((t) => t.grid).map((t) => t.value), [10, 100, 1000]);
	// adjacent labels are never closer than the gap
	const x = scaleLog().domain([3, 4000]).range([0, 1100]);
	const xs = labels(wide).map(x);
	assert.ok(xs.every((v, i) => i === 0 || v - xs[i - 1] >= 44));
	// narrower: the decades alone, then every other decade
	assert.deepEqual(labels(at(300)), [10, 100, 1000]);
	assert.deepEqual(at(120).map((t) => [t.value, t.label]), [[10, true], [100, false], [1000, true]]);
	assert.ok(at(120).every((t) => t.grid));
});

test('minor dollar ticks subdivide decades without duplicating major ticks or leaving the domain', () => {
	assert.deepEqual(minorDollarTicks(1, 10), [2, 3, 4, 5, 6, 7, 8, 9]);
	assert.deepEqual(minorDollarTicks(0.35, 2.5), [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 2]);
	assert.deepEqual(minorDollarTicks(1200, 9000), [2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]);
	for (const [lo, hi] of [[0, 10], [-1, 10], [10, 1], [1, Infinity], [NaN, 10]]) {
		assert.deepEqual(minorDollarTicks(lo, hi), []);
	}
});

test('stepAfterPath steps at each point and runs flat to both edges', () => {
	const points = [{ cost: 10, v: 0.5 }, { cost: 100, v: 1 }];
	const d = stepAfterPath(points, { x: (c) => c, y: (v) => 100 - v * 100, x0: 0, x1: 200, value: (p) => p.v });
	assert.equal(d, 'M0,100H10V50H100V0H200');
	// an optional rounding function is the caller's, and applies to every coordinate
	const r = stepAfterPath(points, {
		x: (c) => c / 3,
		y: (v) => v,
		x0: 1 / 3,
		x1: 200 / 3,
		value: (p) => p.v,
		round: (n) => Number(n.toFixed(1))
	});
	assert.equal(r, 'M0.3,0H3.3V0.5H33.3V1H66.7');
	assert.equal(stepAfterPath([], { x: (c) => c, y: (v) => v, x0: 0, x1: 9, value: (p) => p.v }), 'M0,0H9');
});
