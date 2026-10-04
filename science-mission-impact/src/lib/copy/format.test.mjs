// Tests for ../format.js. They live one folder down because `npm test`'s glob
// (src/lib/**/*.test.mjs, expanded by sh) only reaches one directory level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byline, yearSpan } from '../format.js';

test('yearSpan prints one year once and a range with an en dash', () => {
	assert.equal(yearSpan([2024, 2024]), '2024');
	assert.equal(yearSpan([1990, 2026]), '1990–2026');
	assert.equal(yearSpan(null), '');
});

test('byline: one author in full, two with &, up to four by last name, then et al.', () => {
	assert.equal(byline(['Wilms, J.']), 'Wilms, J.');
	assert.equal(byline(['Wilms, J.', 'Allen, A.']), 'Wilms & Allen');
	assert.equal(byline(['Wilms, J.', 'Allen, A.', 'McCray, R.']), 'Wilms, Allen & McCray');
	assert.equal(byline(['A, a', 'B, b', 'C, c', 'D, d']), 'A, B, C & D');
	assert.equal(byline(['A, a', 'B, b', 'C, c', 'D, d'], 312), 'A, B, C, D et al.');
	assert.equal(byline(['Planck Collaboration', 'Ade, P. A. R.'], 2), 'Planck Collaboration & Ade');
	assert.equal(byline(null), '');
});
