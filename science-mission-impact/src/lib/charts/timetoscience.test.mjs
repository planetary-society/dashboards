import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { timeScienceModel, timeScienceLayout } from './timetoscience.js';

const row = (id, years, state = 'reached', cost = 100) => ({ id, name: id, cost, full: { first: { state, yearsFromScienceStart: years } } });

test('elapsed months preserve zero and pre-science publications; missing milestones are never zero', () => {
	const rows = [row('early', -1), row('zero', 0), row('later', 2), row('missing-date', null), row('none', null, 'none'), row('no-papers', null, 'no_papers'), row('failed', null, 'failure'), row('unavailable', null, 'unavailable'), row('no-cost', 1, 'reached', null)];
	const model = timeScienceModel(rows, 'full');
	assert.deepEqual(model.points.map((p) => p.months), [-12, 0, 24]);
	assert.match(model.points[0].label, /12 months before science start/);
	assert.equal(model.excluded.size, 6);
	assert.deepEqual(model.excluded.get('Timing unavailable'), ['missing-date']);
	assert.equal(timeScienceModel(rows, 'window').points.length, 0);
	rows[0].window = { first: { state: 'reached', yearsFromScienceStart: 3 } };
	assert.equal(timeScienceModel(rows, 'window').points[0].months, 36);
});

test('time runs left to right and cost bottom to top without moving or clamping observations', () => {
	const model = timeScienceModel([row('early', -1, 'reached', 10), row('zero', 0), row('later', 2, 'reached', 1000)], 'full');
	const l = timeScienceLayout(model.points, 800, 420);
	assert.ok(l.x(-12) < l.x(0) && l.x(0) < l.x(24));
	assert.ok(l.y(10) > l.y(100) && l.y(100) > l.y(1000));
	assert.ok(Math.abs(l.y(10) - l.y(100) - (l.y(100) - l.y(1000))) < 1e-9);
	assert.ok(l.xTicks.includes(0) && l.xTicks.some((v) => v < 0));
	for (const p of model.points) {
		const item = l.items.get(p.id);
		assert.equal(item.x + item.s / 2, l.x(p.months));
		assert.equal(item.y + item.s / 2, l.y(p.cost));
	}
});

test('all packaged divisions/scopes and empty input produce finite responsive geometry', () => {
	const dir = new URL('../data/generated/divisions/', import.meta.url);
	const datasets = [[], ...readdirSync(dir).map((file) => JSON.parse(readFileSync(new URL(file, dir))).missions)];
	for (const missions of datasets) for (const scope of ['full', 'window', 'lifetime']) {
		const model = timeScienceModel(missions, scope);
		assert.equal(model.points.length + [...model.excluded.values()].flat().length, missions.length);
		for (const width of [280, 800]) {
			const l = timeScienceLayout(model.points, width, 340);
			for (const item of l.items.values()) {
				assert.equal(item.s, width < 600 ? 5 : 8);
				assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y));
				assert.ok(item.x >= 0 && item.x + item.s <= width);
				assert.ok(item.y >= 0 && item.y + item.s <= 340);
			}
		}
	}
});
