import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { topShareModel } from './topsharebars.js';

const row = (id, papers, top10, extra = {}) => ({ id, name: id, full: { papers, top10, top1: top10 / 10, outputBasis: 'measured', status: 'available', ...extra } });

test('ranks by top-paper credit, ties by papers then name, and scales bars to the largest', () => {
	const model = topShareModel([row('b', 10, 1), row('a', 10, 1), row('big', 40, 4), row('top', 10, 5)], 'full');
	assert.deepEqual(model.rows.map((r) => r.id), ['top', 'big', 'a', 'b']);
	assert.deepEqual(model.rows.map((r) => r.width), [100, 80, 20, 20]);
	assert.equal(model.rows[0].text, '5');
	assert.equal(topShareModel([row('half', 10, 2.5)], 'full').rows[0].text, '2.5');
	assert.equal(model.rows[0].label, 'top: 5 top-10% papers of 10 tracked publications');
});

test('zero, assumed zero, immature, missing and unavailable output remain distinct', () => {
	const model = topShareModel([
		row('zero', 0, 0), row('no-top', 5, 0),
		{ ...row('failed', 0, 0, { outputBasis: 'assumed_zero' }), failed: true },
		row('missing', null, null), row('immature', 3, 0, { status: 'immature' }),
		row('unavailable', 0, 0, { outputBasis: 'no_source' }), row('bad', 0, 1)
	], 'full');
	assert.deepEqual(model.rows.map((r) => [r.id, r.text, r.width]), [['no-top', '0', 0], ['failed', '0', 0], ['zero', '0', 0]]);
	assert.deepEqual(model.unavailable, ['missing', 'immature', 'unavailable', 'bad']);
});

test('top 1 reads top1 credit, and a scope without it is unavailable', () => {
	const rows = [row('a', 100, 20), row('b', 10, 1)];
	const model = topShareModel(rows, 'full', { top: 1 });
	assert.deepEqual(model.rows.map((r) => r.value), [2, 0.1]);
	assert.match(model.rows[0].label, /2 top-1% papers/);
	rows[0].lifetime = { papers: 100, top10: 20, top1: null, outputBasis: 'measured' };
	assert.deepEqual(topShareModel(rows, 'lifetime', { top: 1 }).unavailable, ['a', 'b']);
	assert.equal(topShareModel(rows, 'lifetime').rows[0].value, 20);
});

test('a division too small to rank counts papers', () => {
	const model = topShareModel([row('a', 4, 0.7), row('b', 0, 0), row('c', 9, null)], 'full', { rankable: false });
	assert.deepEqual(model.rows.map((r) => [r.id, r.value, r.text, r.width]), [['c', 9, '9', 100], ['a', 4, '4', 400 / 9], ['b', 0, '0', 0]]);
	assert.equal(model.rows[1].label, 'a: 4 tracked publications');
});

test('every packaged division and scope yields finite, non-negative values', () => {
	const dir = new URL('../data/generated/divisions/', import.meta.url);
	for (const file of readdirSync(dir)) {
		const division = JSON.parse(readFileSync(new URL(file, dir)));
		for (const scope of ['full', 'window', 'lifetime']) {
			for (const top of scope === 'lifetime' ? [10] : [10, 1]) {
				const model = topShareModel(division.missions, scope, { rankable: division.rankable, top });
				assert.equal(model.rows.length + model.unavailable.length, division.missions.length);
				for (const r of model.rows) {
					if (!division.rankable) assert.ok(Number.isInteger(r.value) && r.value >= 0, `${file} ${scope} ${r.id}`);
					else assert.ok(Number.isFinite(r.value) && r.value >= 0 && r.value <= r.papers, `${file} ${scope} top${top} ${r.id}`);
					assert.ok(r.width >= 0 && r.width <= 100);
				}
			}
		}
	}
});
