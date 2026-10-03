import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citationCoverage, citationRepresentatives } from '../lib/citations.mjs';

const source = (name, count, list) => ({ name, records: [{ bibcode: 'paper', citation_count: count }], citations: { paper: list } });
const limits = { maxMissing: 5, maxMissingFraction: 0.001 };
test('representative selection matches upstream counts and title tie-break, never unions histories', () => {
	const sources = [source('A', 2, ['2000a', '2001b']), source('Z', 2, ['2000a', '2002c']), source('Top', 1, ['2003d'])];
	const expected = new Map([['paper', 2]]);
	const before = citationRepresentatives(sources, expected);
	assert.deepEqual(before.lists.get('paper'), ['2000a', '2002c']);
	assert.deepEqual(citationRepresentatives([...sources].reverse(), expected), before);
});
test('small declared shortfalls preserve observed histories and reported totals separately', () => {
	const list = Array.from({ length: 999 }, (_, i) => `2000-${i}`);
	const result = citationRepresentatives([source('A', 1000, list)], new Map([['paper', 1000]]), { historyStatus: 'incomplete_citation_histories', limits });
	assert.deepEqual(result.coverage, { status: 'incomplete', expected: 1000, observed: 999, missing: 1 });
	assert.equal(result.lists.get('paper').length, 999);
	assert.equal(result.gaps[0].missing, 1);
});
test('excess, unannounced incompleteness and either limit still fail', () => {
	for (const [expected, observed, historyStatus] of [[1000, 1001, 'incomplete_citation_histories'], [1000, 999, 'complete'], [100, 99, 'incomplete_citation_histories'], [100000, 99994, 'incomplete_citation_histories']]) {
		assert.throws(() => citationCoverage({ expected, observed, historyStatus, limits }), /Outside the permitted/);
	}
	assert.throws(() => citationRepresentatives([source('A', 2, ['2000a'])], new Map([['paper', 3]])), /do not reconcile/);
	for (const expected of [null, NaN, -1, 0.5]) assert.throws(() => citationCoverage({ expected, observed: 0 }), /integer totals/);
});
