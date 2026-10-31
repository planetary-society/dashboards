import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runningMean } from '../lib/running-mean.mjs';

const points = (rows) => rows.map(([cost, citations], i) => ({ id: `m${i}`, cost, citations }));
const fixture = points([[1, 0], [2, 3], [5, 1], [10, 30], [20, 15], [50, 300], [100, 80]]);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} versus ${expected}`);

test('uses a local arithmetic mean and independently reproduced pointwise mission-bootstrap intervals', () => {
	const result = runningMean(fixture, 10);
	assert.deepEqual([result.halfWidth, result.resamples, result.points.length], [1, 2000, 81]);
	// Independent NumPy calculation: tricube weights on log10 cost, same seeded mission draws,
	// then numpy.quantile at .025/.975. The zero-output mission remains in the resampling population.
	result.points[40].forEach((v, i) => near(v, [10, 176.32674107808032, 48.7994950136989, 369.2100712916617][i]));
	assert.ok(result.points[0].every(Number.isFinite), 'three contributing missions support the low-cost end');
	assert.ok(result.points.at(-1).every(Number.isFinite), 'three contributing missions support the high-cost end');
	assert.ok(result.points.every((p, i) => i === 0 || p[0] > result.points[i - 1][0]));
	assert.deepEqual(result.comparison.under, { missions: 4, mean: 117.5 });
	near(result.comparison.over.mean, 251.66666666666666);
	assert.deepEqual(result.comparison.ci, [-445.125, 117.5]);
	assert.equal(result.comparison.holds, false);
	assert.equal(result.comparison.favors, null);
});

test('preserves unsupported internal gaps and requires both neighbour count and effective sample size', () => {
	const clusters = points([1, 1.1, 1.2, 1.3, 1.4, 1000, 1100, 1200, 1300, 1400].map((cost) => [cost, cost]));
	const result = runningMean(clusters, 10);
	assert.ok(result.points[0][1] !== null && result.points.at(-1)[1] !== null);
	assert.deepEqual(result.points[40].slice(1), [null, null, null], 'no extrapolation across the empty cost range');
	const lowEffective = runningMean(points([1, 9.9, 9.91, 9.92, 9.93].map((cost) => [cost, cost])), 5);
	assert.deepEqual(lowEffective.points[0], [1, null, null, null], 'five positive weights still have effective sample size below two');
	assert.deepEqual(runningMean(fixture.slice(0, 2), 5).points, []);
});

test('three unequally weighted neighbours qualify, but two neighbours in a larger dataset do not', () => {
	const three = runningMean(points([[5.2, 145], [6.5, 24], [27.2, 25]]), 150);
	assert.ok(three.points[0].every(Number.isFinite), 'the three low-cost astrophysics missions support the first point');
	assert.ok(three.points[0][2] <= three.points[0][1] && three.points[0][1] <= three.points[0][3]);
	const two = runningMean(points([[5.2, 145], [6.5, 24], [1000, 25]]), 150);
	assert.deepEqual(two.points[0], [5.2, null, null, null], 'two nearby missions remain insufficient');
});

test('keeps true zeros in the mean and bootstrap bounds without pseudocounts', () => {
	const zeros = runningMean(fixture.map((m) => ({ ...m, citations: 0 })), 10);
	assert.deepEqual(zeros.points[40], [10, 0, 0, 0]);
	assert.deepEqual(zeros.comparison.ci, [0, 0]);
	assert.equal(zeros.comparison.favors, null);
	const rare = runningMean(fixture.map((m) => ({ ...m, citations: m.cost === 10 ? 30 : 0 })), 10);
	assert.equal(rare.points[40][2], 0);
	assert.ok(rare.points[40][1] > 0 && rare.points[40][3] > 0);
});

test('the independent threshold comparison uses mission means and needs interval and leave-one-out support', () => {
	const costs = [1, 2, 10, 11, 20, 30];
	const result = runningMean(points(costs.map((cost) => [cost, cost * (cost <= 10 ? 20 : 5) / 100])), 10);
	assert.deepEqual(result.comparison, {
		under: { missions: 3, mean: 20 }, over: { missions: 3, mean: 5 }, difference: 15,
		ci: [15, 15], holds: true, favors: 'under'
	});
	const reversed = runningMean(points(costs.map((cost) => [cost, cost * (cost <= 10 ? 5 : 20) / 100])), 10);
	assert.equal(reversed.comparison.favors, 'over');
	const outlier = runningMean(points(costs.map((cost, i) => [cost, cost * [0, 0, 300, 80, 80, 80][i] / 100])), 10);
	assert.equal(outlier.comparison.difference, 20);
	assert.equal(outlier.comparison.holds, false);
	assert.equal(outlier.comparison.favors, null);
	const arithmetic = runningMean(points([[1, 1], [2, 2], [100, 0], [200, 40], [300, 60], [400, 80]]), 100);
	near(arithmetic.comparison.under.mean, 200 / 3);
	assert.equal(arithmetic.comparison.over.mean, 20);
	assert.equal(runningMean(fixture, 2).comparison, null, 'fewer than three missions on either side cannot support a comparison');
});

test('is deterministic in cost/id order, retains equal-rate ties, and rejects invalid source values', () => {
	const ties = [...fixture, { id: 'a', cost: 10, citations: 9 }];
	assert.deepEqual(runningMean(ties, 10), runningMean(ties.toReversed(), 10));
	const equal = points([1, 2, 3, 20, 30, 40, 50].map((cost) => [cost, cost / 300]));
	assert.equal(runningMean(equal, 10).comparison.favors, null, 'fractional roundoff is not an advantage');
	assert.throws(() => runningMean([{ id: 'bad', cost: 1, citations: null }], 10), /invalid mission/);
	assert.throws(() => runningMean([{ id: 'bad', cost: 0, citations: 1 }], 10), /invalid mission/);
	assert.throws(() => runningMean(fixture, 0), /thresholdCost/);
});
