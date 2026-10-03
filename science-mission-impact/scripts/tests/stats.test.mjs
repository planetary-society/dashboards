import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { averageRanks, buildIndexCorrelation, MIN_PAIRS, spearman } from '../lib/stats.mjs';

describe('averageRanks', () => {
	it('ranks from 1, in the order the values were given', () => {
		assert.deepEqual(averageRanks([30, 10, 20]), [3, 1, 2]);
	});

	it('shares the average rank between tied values', () => {
		assert.deepEqual(averageRanks([5, 5, 9]), [1.5, 1.5, 3]);
		assert.deepEqual(averageRanks([7, 7, 7, 7]), [2.5, 2.5, 2.5, 2.5]);
	});
});

describe('spearman', () => {
	it('is 1 for a monotone rise and -1 for a monotone fall', () => {
		assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
		assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
	});

	it('reads ranks, not values: any monotone transform gives the same rho', () => {
		assert.equal(spearman([1, 2, 3, 4], [1, 4, 9, 16]), 1);
	});

	it('lands between the two for a noisy relationship', () => {
		const rho = spearman([1, 2, 3, 4, 5], [1, 3, 2, 5, 4]);
		assert.ok(rho > 0.5 && rho < 1, `rho was ${rho}`);
	});

	it('says nothing rather than something meaningless', () => {
		assert.equal(spearman([1, 2], [1, 2]), null); // under MIN_PAIRS
		assert.equal(MIN_PAIRS, 3);
		assert.equal(spearman([1, 2, 3], [5, 5, 5]), null); // no variance to correlate
		assert.equal(spearman([1, 2, 3], [1, 2]), null); // unpaired
		assert.equal(spearman([1, 2, null], [1, 2, 3]), null); // a hole in the pairs
		assert.equal(spearman(undefined, undefined), null);
	});
});

describe('buildIndexCorrelation', () => {
	const row = (over) => ({ failed: false, cost: 100, indices: { m: 1, h: 10 }, ...over });
	const rows = [
		row({ cost: 10, indices: { m: 1, h: 5 } }),
		row({ cost: 20, indices: { m: 2, h: 9 } }),
		row({ cost: 30, indices: { m: 3, h: 20 } }),
		row({ cost: 40, indices: { m: 4, h: 50 } }),
		// A failure's index says nothing about what it cost.
		row({ cost: 5, failed: true, indices: { m: 9, h: 90 } }),
		// No cost, nothing to correlate against.
		row({ cost: null, indices: { m: 9, h: 90 } }),
		// m is undefined until a first refereed paper dates it; h still counts.
		row({ cost: 50, indices: { m: null, h: 60 } })
	];

	it('correlates each index with cost over the missions that can carry it', () => {
		const out = buildIndexCorrelation(rows);
		assert.deepEqual(out.m, { rho: 1, n: 4 });
		assert.deepEqual(out.h, { rho: 1, n: 5 });
	});

	it('reports n even when rho cannot be computed', () => {
		const out = buildIndexCorrelation([row({ cost: 10 }), row({ cost: 20 })]);
		assert.deepEqual(out.m, { rho: null, n: 2 });
	});

	it('is null/0, never a throw, for a division with nothing to rank', () => {
		assert.deepEqual(buildIndexCorrelation([]), {
			m: { rho: null, n: 0 },
			h: { rho: null, n: 0 }
		});
		assert.deepEqual(buildIndexCorrelation(undefined).h, { rho: null, n: 0 });
	});
});
