import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costAxis, indexAxis, scatterModel, correlationText, indexValue, tickValue, otherIndex } from './indexscatter.js';

const mission = (id, cost, h, m, extra = {}) => ({
	id,
	name: id.toUpperCase(),
	cost,
	failed: false,
	indices: { h, m, i100: 0 },
	...extra
});

test('costAxis pads the log span and ticks the decades inside it', () => {
	const a = costAxis([1, 1000]);
	assert.ok(a.lo < 0 && a.hi > 3);
	assert.deepEqual(
		a.ticks.map((t) => t.value),
		[1, 10, 100, 1000]
	);
	// the cheapest and dearest sit inside the frame, in order
	assert.ok(a.at(1) > 0 && a.at(1) < 10);
	assert.ok(a.at(1000) > 90 && a.at(1000) < 100);
	assert.ok(a.at(10) < a.at(100));
});

test('costAxis keeps a usable scale for one cost, and refuses nothing to scale', () => {
	const a = costAxis([500]);
	assert.ok(a.hi - a.lo >= 0.5);
	assert.ok(a.at(500) > 45 && a.at(500) < 55);
	assert.equal(costAxis([]), null);
	assert.equal(costAxis([0, null, -3]), null);
});

test('indexAxis runs from zero to a tick at or above the largest value', () => {
	const big = indexAxis([3, 127, 349]);
	assert.equal(big.values[0], 0);
	assert.ok(big.max >= 349);
	assert.equal(big.max, big.values.at(-1));
	const small = indexAxis([0.1, 0.5]);
	assert.ok(small.max >= 0.5);
	// an all-zero division still gets an axis rather than a division by zero
	assert.ok(indexAxis([0, 0]).max > 0);
	assert.ok(indexAxis([]).max > 0);
});

test('scatterModel plots costs with a value, and failures even without one', () => {
	const missions = [
		mission('alpha', 100, 20, 2),
		mission('bravo', 1000, 60, 4),
		mission('charlie', 50, null, null, { failed: true, indices: { h: 0, m: null, i100: null } }),
		mission('delta', null, 9, 1), // no cost: nowhere to put it
		mission('echo', 10, null, null) // no papers, did not fail: not drawn at a value it lacks
	];
	const m = scatterModel(missions, 'm');
	assert.deepEqual(
		m.points.map((p) => p.id),
		['charlie', 'alpha', 'bravo']
	);
	assert.equal(m.failed, 1);
	assert.deepEqual(m.costs, [50, 1000]);
	// the axis ends on a tick; the summary quotes the largest figure actually plotted
	assert.equal(m.maxValue, 4);
	assert.ok(m.max >= m.maxValue);
	const charlie = m.points[0];
	assert.equal(charlie.value, null);
	assert.equal(charlie.y, 0, 'a failure with no index sits on the zero line');
	const bravo = m.points.at(-1);
	assert.equal(bravo.other, 60, 'the other index rides along for the readout');
	assert.ok(bravo.y > 0 && bravo.y <= 100);
	assert.ok(m.points.every((p) => p.x >= 0 && p.x <= 100));
});

test('scatterModel keeps a failed mission that does have papers at its own value', () => {
	// mars_observer: failed, four papers, h = 3
	const m = scatterModel([mission('mo', 2502, 3, 0.1, { failed: true }), mission('big', 5000, 100, 5)], 'h');
	const mo = m.points.find((p) => p.id === 'mo');
	assert.equal(mo.failed, true);
	assert.ok(mo.y > 0);
});

test('scatterModel has nothing to draw when no mission has both a cost and a measure', () => {
	assert.equal(scatterModel([], 'h'), null);
	assert.equal(scatterModel([mission('x', null, 4, 1)], 'h'), null);
});

test('correlationText states rho and n, or says there are too few', () => {
	assert.equal(correlationText({ rho: 0.69552, n: 30 }), 'Rank correlation with cost: ρ = 0.70 across 30 missions.');
	assert.equal(correlationText({ rho: -0.44721, n: 5 }), 'Rank correlation with cost: ρ = −0.45 across 5 missions.');
	assert.equal(correlationText({ rho: null, n: 2 }), 'Too few missions to correlate.');
	assert.equal(correlationText(null), 'Too few missions to correlate.');
});

test('the index formatters keep h whole and m to one decimal', () => {
	assert.equal(indexValue('h', 127), '127');
	assert.equal(indexValue('m', 4.704), '4.7');
	assert.equal(indexValue('m', null), '—');
	assert.equal(tickValue(12), '12');
	assert.equal(tickValue(0.30000000000000004), '0.3');
	assert.equal(otherIndex('m'), 'h');
	assert.equal(otherIndex('h'), 'm');
});
