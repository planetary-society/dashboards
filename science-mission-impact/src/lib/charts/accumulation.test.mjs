import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumulate, lifetimeModel } from './accumulation.js';

test('cumulate runs a total and tolerates junk', () => {
	assert.deepEqual(cumulate([1, 2, 3]), [1, 3, 6]);
	assert.deepEqual(cumulate([]), []);
	assert.deepEqual(cumulate(undefined), []);
	assert.deepEqual(cumulate([1, null, 2]), [1, 1, 3]);
});

test('lifetimeModel accumulates both series and finds the partial year', () => {
	const m = lifetimeModel({ years: [1990, 1991, 1992], papers: [2, 3, 1], citations: [0, 10, 40], partialFromYear: 1992 });
	assert.deepEqual(
		m.points.map((p) => [p.year, p.pub, p.cite]),
		[
			[1990, 2, 0],
			[1991, 5, 10],
			[1992, 6, 50]
		]
	);
	assert.equal(m.pubTotal, 6);
	assert.equal(m.citeTotal, 50);
	assert.equal(m.partialIndex, 2);
});

test('lifetimeModel reports no partial year when there is none', () => {
	const m = lifetimeModel({ years: [2000], papers: [4], citations: [9], partialFromYear: null });
	assert.equal(m.partialIndex, -1);
	assert.equal(m.pubTotal, 4);
	assert.equal(lifetimeModel(null), null);
	assert.equal(lifetimeModel({ years: [] }), null);
});
