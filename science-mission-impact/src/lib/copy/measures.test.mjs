import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexValue } from './measures.js';

test('the index formatter keeps h whole and m to one decimal', () => {
	assert.equal(indexValue('h', 127), '127');
	assert.equal(indexValue('m', 4.704), '4.7');
	assert.equal(indexValue('m', null), '—');
});
