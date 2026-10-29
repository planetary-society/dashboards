import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureGrid, timeLayout } from './charts-a.js';

const failures = {
	tiers: [
		{ missions: 6, ok: 3, failed: 2, partial: 1, rate: 0.5, byDivision: [{ division: 'a', ok: 1, failed: 2, partial: 1 }, { division: 'b', ok: 2, failed: 0, partial: 0 }] },
		{ missions: 2, ok: 2, failed: 0, partial: 0, rate: 0, byDivision: [{ division: 'a', ok: 0, failed: 0, partial: 0 }, { division: 'b', ok: 2, failed: 0, partial: 0 }] }
	]
};

test('failure grid: rows follow the given divisions, marks ok → partial → lost', () => {
	const { rows, totals } = failureGrid(failures, [{ slug: 'b', name: 'B', nav: 'b' }, { slug: 'a', name: 'A', nav: 'a' }, { slug: 'c', name: 'C', nav: 'c' }]);
	assert.deepEqual(rows.map((r) => r.slug), ['b', 'a', 'c']);
	assert.deepEqual(rows[1].cells[0].marks, ['solid', 'partial', 'lost', 'lost']);
	assert.deepEqual(rows[1].cells[1].marks, []);
	// a division the tier doesn't list is an empty cell, not an error
	assert.deepEqual(rows[2].cells.map((c) => c.marks.length), [0, 0]);
	// each tier's marks add up to its missions
	failures.tiers.forEach((t, i) => assert.equal(rows.reduce((n, r) => n + r.cells[i].marks.length, 0), t.missions));
	assert.deepEqual(totals.map((t) => [t.shortfall, t.missions, t.rate]), [[3, 6, 0.5], [0, 2, 0]]);
});

const tiers = [{ lo: 0, hi: 50 }, { lo: 50, hi: 150 }, { lo: 1550, hi: null }];
const time = {
	tiers: [
		{ missions: 26, reached: 6, without: 20, undated: 0, formulation: { median: 5.8, min: 3.4 }, science: { median: 2.28, min: 1 } },
		{ missions: 4, reached: 0, without: 4, undated: 0, formulation: { median: null, min: null }, science: { median: null, min: null } },
		{ missions: 16, reached: 16, without: 0, undated: 0, formulation: { median: 11.5, min: 7.3 }, science: { median: 0.22, min: -4.27 } }
	]
};

test('time bars share one axis from zero with room for every value label', () => {
	for (const width of [300, 460, 760]) {
		const layout = timeLayout(tiers, time, width);
		const [lo, hi] = layout.x.domain();
		assert.equal(lo, 0);
		assert.ok(hi >= 11.5);
		const bars = layout.rows.flatMap((r) => [r.formulation, r.science]).filter(Boolean);
		for (const b of bars) {
			assert.equal(b.x, layout.x(0));
			assert.ok(b.tx + 46 <= width, `"${b.median} yr" runs off at ${width}`);
		}
		// the thick bar above the thin one, both inside the row
		const [first] = layout.rows;
		assert.ok(first.formulation.h > first.science.h && first.science.y >= first.formulation.y + first.formulation.h);
	}
	const layout = timeLayout(tiers, time, 460);
	assert.deepEqual([layout.rows[1].none, layout.rows[1].formulation], [true, null]);
	// the height doesn't depend on width, so the server can reserve it
	assert.equal(timeLayout(tiers, time, 0).height, layout.height);
});

test('a negative median extends the axis left of zero and labels outward', () => {
	const odd = { tiers: [{ ...time.tiers[2], science: { median: -1.5, min: -4 } }] };
	const layout = timeLayout([tiers[2]], odd, 460);
	assert.ok(layout.x.domain()[0] <= -1.5);
	const { science } = layout.rows[0];
	assert.equal(science.x + science.w, layout.x(0));
	assert.equal(science.anchor, 'end');
});
