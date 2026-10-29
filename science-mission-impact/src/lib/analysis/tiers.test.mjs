import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeMoney, tierLabel } from './tiers.js';

test('tier labels print edges exactly', () => {
	assert.equal(edgeMoney(1550), '$1.55B');
	assert.equal(edgeMoney(1000), '$1B');
	assert.deepEqual(
		[{ lo: 0, hi: 50 }, { lo: 50, hi: 150 }, { lo: 750, hi: 1550 }, { lo: 1550, hi: null }].map((t) => tierLabel(t)),
		['≤$50M', '$50M–$150M', '$750M–$1.55B', '>$1.55B']
	);
	assert.equal(tierLabel({ lo: 50, hi: 150 }, { short: true }), '$50–150M');
	assert.equal(tierLabel({ lo: 750, hi: 1550 }, { short: true }), '$750M–$1.55B');
});
