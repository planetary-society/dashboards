import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { publicationModel, publicationLayout } from './publicationscatter.js';

const row = (id, papers, top10, extra = {}) => ({ id, name: id, full: { papers, top10, outputBasis: 'measured', ...extra } });

test('reference uses aggregate credit per publication, switches scope, and preserves fractional credit', () => {
	const rows = [row('large', 100, 5.5), row('small', 10, 4.5)];
	rows[0].window = { papers: 20, top10: 2, outputBasis: 'measured' };
	rows[1].window = { papers: 5, top10: 1, outputBasis: 'measured' };
	const full = publicationModel(rows, 'full');
	assert.equal(full.rate, 10 / 110);
	assert.equal(full.points[0].top10, 5.5);
	assert.match(full.points[0].label, /5.5 top-10% paper credit/);
	assert.equal(publicationModel(rows, 'window').rate, 3 / 25);
	assert.equal(publicationModel(rows, 'lifetime').rate, null);
	assert.equal(full.points[1].rate, 0.45);
});

test('zero, assumed zero, immature, missing and unavailable output remain distinct', () => {
	const model = publicationModel([
		row('zero', 0, 0), row('no-top', 5, 0),
		{ ...row('failed', 0, 0, { outputBasis: 'assumed_zero' }), failed: true },
		row('missing', null, null), row('immature', 3, 0, { status: 'immature' }),
		row('unavailable', 0, 0, { outputBasis: 'no_source' })
	], 'full');
	assert.deepEqual(model.points.map((p) => p.id), ['no-top']);
	assert.deepEqual(model.zeros.map((p) => p.id), ['zero', 'failed']);
	assert.deepEqual(model.unavailable, ['missing', 'immature', 'unavailable']);
	assert.equal(model.zeros[0].rate, null);
	assert.match(model.zeros[1].label, /Assumed zero output\nMission failed/);
	assert.doesNotMatch(model.zeros[0].label, /Assumed/);
	assert.equal(model.rate, 0);
	assert.equal(publicationModel([row('zero', 0, 0)], 'full').rate, null);
});

test('square-root axes keep true coordinates and the reference ratio; zeros have separate hit targets', () => {
	const model = publicationModel([row('a', 100, 10), row('b', 25, 2.5), ...Array.from({ length: 20 }, (_, i) => row(`zero-${i}`, 0, 0))], 'full');
	const l = publicationLayout(model, 280);
	assert.equal(l.x(0), l.left);
	assert.equal(l.y(0), l.bottom);
	assert.ok(Math.abs((l.x(25) - l.left) / (l.x(100) - l.left) - 0.5) < 1e-10);
	assert.ok(Math.abs(l.y.invert(l.reference.y) / l.x.invert(l.reference.x) - model.rate) < 1e-10);
	assert.equal(new Set([...l.zeroItems.values()].map((p) => `${p.x},${p.y}`)).size, 20);
	for (const p of l.zeroItems.values()) {
		assert.ok(p.x >= 0 && p.x + p.s <= 280);
		assert.ok(p.y >= 0 && p.y + p.s <= l.zeroHeight);
	}
});

test('every packaged division and scope has finite, bounded geometry at narrow and wide widths', () => {
	const dir = new URL('../data/generated/divisions/', import.meta.url);
	for (const file of readdirSync(dir)) {
		const division = JSON.parse(readFileSync(new URL(file, dir)));
		for (const scope of ['full', 'window', 'lifetime']) {
			const model = publicationModel(division.missions, scope);
			assert.equal(model.points.length + model.zeros.length + model.unavailable.length, division.missions.length);
			for (const width of [280, 560]) {
				const layout = publicationLayout(model, width);
				for (const p of layout.items.values()) {
					assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
					assert.ok(p.x >= 0 && p.x + p.s <= width);
					assert.ok(p.y >= 0 && p.y + p.s <= 300);
				}
			}
		}
	}
});
