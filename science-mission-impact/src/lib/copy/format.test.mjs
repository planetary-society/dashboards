// Tests for ../format.js. They live one folder down because `npm test`'s glob
// (src/lib/**/*.test.mjs, expanded by sh) only reaches one directory level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearSpan } from '../format.js';

test('yearSpan prints one year once and a range with an en dash', () => {
	assert.equal(yearSpan([2024, 2024]), '2024');
	assert.equal(yearSpan([1990, 2026]), '1990–2026');
	assert.equal(yearSpan(null), '');
});
