import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankHistograms, assertRanksMatchTiers, emptyRanks, RANK_BINS } from '../lib/ranks.mjs';

const keys = { citations: 'c', sharedBy: 's' };
const sum = (a) => a.reduce((x, y) => x + y, 0);

describe('rankHistograms', () => {
	it('puts one paper in each tenth when nothing ties', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ mission: i === 9 ? 'Top' : 'Rest', bibcode: `b${i}`, c: i * 10, s: 1 }));
		const h = rankHistograms(rows, keys);
		assert.deepEqual(h.get('Top').bins, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
		assert.deepEqual(h.get('Rest').bins, [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
		assert.equal(h.get('Top').top1, 0.1); // the top 1% of ten papers is a tenth of the first
	});

	it('spreads tied papers evenly over the ranks they share', () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ mission: 'M', bibcode: `b${i}`, c: 5, s: 1 }));
		const h = rankHistograms(rows, keys).get('M');
		assert.deepEqual(h.bins, new Array(RANK_BINS).fill(1));
	});

	it('ranks a shared paper once, counts it whole and splits only the credit', () => {
		const rows = [
			{ mission: 'A', bibcode: 'x', c: 100, s: 2 },
			{ mission: 'B', bibcode: 'x', c: 100, s: 2 },
			...Array.from({ length: 9 }, (_, i) => ({ mission: 'B', bibcode: `b${i}`, c: i, s: 1 }))
		];
		const h = rankHistograms(rows, keys);
		// whole in each mission's own histogram, split in the credit the run is checked against
		assert.equal(h.get('A').bins[9], 1);
		assert.equal(sum(h.get('A').bins), 1);
		assert.equal(sum(h.get('B').bins), 10);
		assert.equal(h.get('A').credit[10], 0.5);
		assert.equal(h.get('B').credit[10], 0.5);
	});
});

describe('assertRanksMatchTiers', () => {
	const bounds = [1, 10, 50, 100];
	const ranks = { bins: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], top1: 0.4, credit: { 1: 0.4, 10: 4, 50: 20 } };

	it('passes when the shared edges agree and skips an unmeasured scope', () => {
		assertRanksMatchTiers({ id: 'm', scope: 'window', ranks, tiers: [0.4, 3.6, 16, 20], bounds });
		assertRanksMatchTiers({ id: 'm', scope: 'window', ranks: null, tiers: null, bounds });
		assertRanksMatchTiers({ id: 'm', scope: 'window', ranks: emptyRanks(), tiers: [0, 0, 0, 0], bounds });
	});

	it('names the edge that drifted', () => {
		assert.throws(() => assertRanksMatchTiers({ id: 'm', scope: 'window', ranks, tiers: [0.4, 5.6, 14, 20], bounds }), /top 10%/);
	});
});
