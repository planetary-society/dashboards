import { test } from 'node:test';
import assert from 'node:assert/strict';
import { histogramModel } from './ranks.js';

test('histogramModel scales bars to a whole-paper axis and finds the even line', () => {
	const m = histogramModel({ bins: [50, 40, 30, 30, 20, 10, 8, 6, 4, 2], top1: 0.5 });
	assert.equal(m.total, 200);
	assert.equal(m.even, 20);
	assert.equal(m.max, 60);
	assert.deepEqual(m.yTicks, [20, 40, 60]);
	assert.equal(m.bars.length, 10);
	assert.equal(m.bars[0].height, 50 / 60);
	assert.deepEqual([m.bars[9].from, m.bars[9].to, m.bars[9].top], [90, 100, true]);
	assert.equal(m.topShare, 0.01);
	assert.equal(m.topPercent, 10);
	assert.deepEqual(m.edges, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
});

test('the top-1% cap never exceeds the bar it sits on', () => {
	const m = histogramModel({ bins: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2], top1: 3 });
	assert.equal(m.top1, 2);
});

test('a handful of papers still gets integer ticks, and no papers gives no share', () => {
	const few = histogramModel({ bins: [1, 0, 2, 0, 0, 1, 0, 0, 0, 0.5], top1: 0 });
	assert.ok(few.yTicks.every(Number.isInteger));
	assert.ok(few.max >= 2);
	const none = histogramModel({ bins: new Array(10).fill(0), top1: 0 });
	assert.equal(none.total, 0);
	assert.equal(none.topShare, null);
	assert.equal(histogramModel(null), null);
});
