// Tests for ../format.js. They live one folder down because `npm test`'s glob
// (src/lib/**/*.test.mjs, expanded by sh) only reaches one directory level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byline, pct, yearSpan } from '../format.js';

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

test('prose money, AP dates and serial lists, TPS style', async () => {
	const { moneyWords, apDate, listify } = await import('../format.js');
	assert.equal(moneyWords(150), '$150\u00a0million');
	assert.equal(moneyWords(23.5), '$24\u00a0million'); // rounded as money() rounds it, so prose and labels agree
	assert.equal(moneyWords(5.84), '$5.8\u00a0million');
	assert.equal(moneyWords(1361.2), '$1.4\u00a0billion');
	assert.equal(moneyWords(1000), '$1\u00a0billion');
	assert.equal(moneyWords(13890.2), '$14\u00a0billion');
	assert.equal(apDate('2026-10-20'), 'Oct. 20, 2026');
	assert.equal(apDate('2026-03-02'), 'March 2, 2026');
	assert.equal(apDate('2026-09'), 'September 2026');
	assert.equal(listify(['a', 'b', 'c']), 'a, b, and c');
	assert.equal(listify(['a', 'b']), 'a and b');
});

test('pct never prints a real share as zero', () => {
	assert.equal(pct(0), '0%');
	assert.equal(pct(0.00004), 'under 0.01%');
	assert.equal(pct(0.00006), 'under 0.01%');
	assert.equal(pct(0.0001), '0.01%');
	assert.equal(pct(0.0096), '0.96%');
	assert.equal(pct(0.083), '8.3%');
});
