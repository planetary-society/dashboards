// The overview's comparison gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { largerAnnualMedians, noClearSmallAdvantage, significant } from './discussion.js';

test('the annual-output claim compares both medians in every division, not the single highest mission', () => {
	const row = (small, larger) => ({ small: { median: small }, larger: { median: larger }, largest: { size: 'over' } });
	assert.equal(largerAnnualMedians([row(0, 4), row(1, 3)]), true);
	for (const other of [row(4, 3), row(3, 3), row(null, 3), row(0, null), undefined]) {
		assert.equal(largerAnnualMedians([row(0, 4), other]), false);
	}
	assert.equal(largerAnnualMedians([]), false);
	assert.equal(largerAnnualMedians([row(0, 4)]), false);
});

test('the overview headline requires a valid comparison for every division, with none favoring small missions', () => {
	const uncertain = { ci: [-20, 40], favors: null };
	const larger = { ci: [20, 40], favors: 'over' };
	assert.equal(noClearSmallAdvantage([uncertain, larger]), true);
	assert.equal(noClearSmallAdvantage([uncertain, { ci: [-40, -20], favors: 'under' }]), false);
	assert.equal(noClearSmallAdvantage([]), false);
	for (const missing of [null, undefined, {}, { ci: null }, { ci: [1, NaN], favors: null }, { ci: [-1, 1] }]) {
		assert.equal(noClearSmallAdvantage([uncertain, missing]), false, JSON.stringify(missing));
	}
});

test('significance is p under 0.05; a missing p never is', () => {
	assert.deepEqual([significant(0.049), significant(0.05), significant(null)], [true, false, false]);
});
