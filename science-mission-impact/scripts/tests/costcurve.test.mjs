import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { buildCostCurve, pooledBand } from '../lib/costcurve.mjs';

const m = (id, cost, top) => ({ id, name: id.toUpperCase(), cost, top });

describe('buildCostCurve', () => {
	// Four missions, $10M/$20M/$30M/$40M, all the top credit on the two dearest.
	const curve = buildCostCurve([
		m('d', 40, 3),
		m('a', 10, 0),
		m('c', 30, 1),
		m('b', 20, 0)
	]);

	it('walks the missions in cost order', () => {
		assert.deepEqual(
			curve.points.map((p) => p.id),
			['a', 'b', 'c', 'd']
		);
	});

	it('breaks a tie in cost by id, so the curve is stable across runs', () => {
		const tied = buildCostCurve([m('z', 5, 1), m('y', 5, 1), m('x', 5, 1)]);
		assert.deepEqual(
			tied.points.map((p) => p.id),
			['x', 'y', 'z']
		);
	});

	it('accumulates both shares to 1', () => {
		assert.deepEqual(
			curve.points.map((p) => p.topShare),
			[0, 0, 0.25, 1]
		);
		assert.deepEqual(
			curve.points.map((p) => p.costShare),
			[0.1, 0.3, 0.6, 1]
		);
	});

	it('marks the cost at which the running top share first reaches each level', () => {
		// 25% is reached exactly at $30M; 50% and 75% not until $40M.
		assert.deepEqual(curve.band, { p25: 30, p50: 40, p75: 40 });
	});

	it('names the cheapest mission holding any top credit', () => {
		assert.deepEqual(curve.cheapestWithTop, { id: 'c', name: 'C', cost: 30 });
	});

	// Floating-point cumulation lands a hair under the level it mathematically
	// reaches; the band must not step past the mission that gets there.
	it('reaches a level that only rounding would miss', () => {
		const thirds = buildCostCurve([m('a', 1, 1), m('b', 2, 1), m('c', 3, 1), m('d', 4, 1)]);
		assert.deepEqual(thirds.band, { p25: 1, p50: 2, p75: 3 });
	});

	it('leaves the band null and the cheapest null when nothing has top credit', () => {
		const flat = buildCostCurve([m('a', 10, 0), m('b', 20, null)]);
		assert.deepEqual(flat.band, { p25: null, p50: null, p75: null });
		assert.equal(flat.cheapestWithTop, null);
		assert.deepEqual(
			flat.points.map((p) => p.topShare),
			[0, 0]
		);
		// The cost curve still runs: spending is known even when impact is zero.
		assert.deepEqual(
			flat.points.map((p) => p.costShare),
			[0.33333, 1]
		);
	});

	it('names the missions it cannot place and keeps them out of both denominators', () => {
		const some = buildCostCurve([m('a', 10, 1), m('zz', null, 9), m('b', 30, 1)]);
		assert.deepEqual(some.unplaced, ['zz']);
		assert.deepEqual(
			some.points.map((p) => p.id),
			['a', 'b']
		);
		assert.equal(some.points.at(-1).topShare, 1);
	});

	it('is empty, not broken, for a division with no missions', () => {
		const none = buildCostCurve([]);
		assert.deepEqual(none, {
			points: [],
			band: { p25: null, p50: null, p75: null },
			cheapestWithTop: null,
			unplaced: []
		});
	});

	// The invariant is a self-check on the accumulation, so no input should be
	// able to trip it -- which is the property worth testing. Awkward magnitudes
	// and tie-weighted thirds are where a naive running sum would drift.
	it('closes at 1 on both series however awkward the numbers', () => {
		const many = [];
		for (let i = 0; i < 200; i += 1) {
			many.push(m(`m${i}`, (i % 7) * 1e5 + i / 3, i % 5 === 0 ? 0 : 1 / 3));
		}
		const big = buildCostCurve(many, { division: 'earth', scope: 'window', top: 10 });
		assert.equal(big.points.at(-1).topShare, 1);
		assert.equal(big.points.at(-1).costShare, 1);
		assert.ok(big.band.p25 <= big.band.p50 && big.band.p50 <= big.band.p75);
	});

	it('leaves a mission with an unusable credit out rather than poisoning the shares', () => {
		// num() turns Infinity/NaN into null, which counts as no credit at all --
		// the shares stay real numbers and the invariant still closes.
		const curveWithJunk = buildCostCurve([m('a', 10, Infinity), m('b', 20, 1)]);
		assert.deepEqual(
			curveWithJunk.points.map((p) => p.topShare),
			[0, 1]
		);
	});
});

describe('pooledBand', () => {
	// Division a: half its credit at $10M, half at $100M. Division b: a quarter at $50M, the rest at $1B.
	const a = buildCostCurve([m('a1', 10, 1), m('a2', 100, 1)]);
	const b = buildCostCurve([m('b1', 50, 1), m('b2', 1000, 3)]);
	const zero = buildCostCurve([m('z1', 5, 0), m('z2', 70, 0)]);

	it('averages each division running share with equal weight at every observed cost', () => {
		// Mean shares: 0.25 at $10M, 0.375 at $50M, 0.625 at $100M, 1 at $1B. Division b's
		// larger credit total does not outweigh division a.
		assert.deepEqual(pooledBand([a, b]), { p25: 10, p50: 100, p75: 1000 });
		assert.deepEqual(pooledBand([b, a]), pooledBand([a, b]));
	});

	it('equals the division band when only one division enters', () => {
		assert.deepEqual(pooledBand([a]), { p25: 10, p50: 10, p75: 100 });
		assert.deepEqual(pooledBand([a]), a.band);
	});

	it('ignores a division with no top credit instead of diluting the mean', () => {
		assert.deepEqual(pooledBand([a, zero]), pooledBand([a]));
		assert.deepEqual(pooledBand([a, zero]), { p25: 10, p50: 10, p75: 100 });
	});

	it('is null when no division has top credit, or there are none', () => {
		assert.equal(pooledBand([zero]), null);
		assert.equal(pooledBand([]), null);
		assert.equal(pooledBand([buildCostCurve([])]), null);
	});

	it('reaches a level that only rounding would miss', () => {
		const thirds = buildCostCurve([m('t1', 1, 1), m('t2', 2, 1), m('t3', 3, 1), m('t4', 4, 1)]);
		assert.deepEqual(pooledBand([thirds, thirds]), { p25: 1, p50: 2, p75: 3 });
	});
});
