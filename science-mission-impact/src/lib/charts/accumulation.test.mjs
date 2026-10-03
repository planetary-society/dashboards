import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleLinear } from 'd3-scale';
import { cumulate, lifetimeModel, windowModel, axes, xDomain, stackLabels, box, decimalYear, missionMilestones, lifetimeDomain, layoutMilestones, TICK_FRACTIONS } from './accumulation.js';

const policy = { publicationYears: 3, citationYears: 3 };

test('prime-window rows derive duration and coverage from the series, not a fixed policy length', () => {
	const w = windowModel({ papersByMonth: Array(25).fill(1), citationsByYearOffset: [0, 1, 2, 3, 4, 5], missionsByYear: [2, 2, 1] }, { kind: 'prime', postPrimeYears: 2, citationYears: 3 });
	assert.equal(w.pubYears, 3);
	assert.equal(w.pubTotal, 25);
	assert.deepEqual(w.rows.slice(0, 4).map((r) => r.papers), [12, 24, 25, null]);
	assert.deepEqual(w.rows.slice(0, 3).map((r) => r.missions), [2, 2, 1]);
});

test('cumulate runs a total and tolerates junk', () => {
	assert.deepEqual(cumulate([1, 2, 3]), [1, 3, 6]);
	assert.deepEqual(cumulate([]), []);
	assert.deepEqual(cumulate(undefined), []);
	assert.deepEqual(cumulate([1, null, 2]), [1, 1, 3]);
});

test('lifetimeModel accumulates both series and finds the partial year', () => {
	const m = lifetimeModel({ years: [1990, 1991, 1992], papers: [2, 3, 1], citations: [0, 10, 40], partialFromYear: 1992 });
	assert.deepEqual(
		m.points.map((p) => [p.year, p.pub, p.cite]),
		[
			[1990, 2, 0],
			[1991, 5, 10],
			[1992, 6, 50]
		]
	);
	assert.equal(m.pubTotal, 6);
	assert.equal(m.citeTotal, 50);
	assert.equal(m.partialIndex, 2);
});

test('lifetimeModel reports no partial year when there is none', () => {
	const m = lifetimeModel({ years: [2000], papers: [4], citations: [9], partialFromYear: null });
	assert.equal(m.partialIndex, -1);
	assert.equal(m.pubTotal, 4);
	assert.equal(lifetimeModel(null), null);
	assert.equal(lifetimeModel({ years: [] }), null);
});

test('windowModel accumulates publications by year and stops when the window closes', () => {
	const papersByMonth = new Array(36).fill(0);
	papersByMonth[0] = 2;
	papersByMonth[35] = 1;
	const w = windowModel({ papersByMonth, citationsByYearOffset: [0, 5, 10, 20, 30, 40, 50] }, policy);

	assert.equal(w.pubYears, 3);
	assert.equal(w.pubTotal, 3);
	assert.deepEqual(w.rows.map((r) => r.year), [1, 2, 3, 4, 5, 6, 7]);
	assert.deepEqual(w.rows.map((r) => r.papers), [2, 2, 3, null, null, null, null]);
});

test('windowModel splits each citation bar into what was there and what the year added', () => {
	const w = windowModel({ papersByMonth: new Array(36).fill(1), citationsByYearOffset: [0, 5, 10, 20, 30, 40, 50] }, policy);
	assert.equal(w.citeTotal, 155);
	assert.deepEqual(w.rows.map((r) => r.cite), [0, 5, 15, 35, 65, 105, 155]);
	assert.equal(w.rows[0].from, 0);
	assert.equal(w.rows[2].from, 5 / 155);
	assert.equal(w.rows[2].to, 15 / 155);
	assert.equal(w.rows.at(-1).to, 1);
	for (let i = 1; i < w.rows.length; i++) assert.equal(w.rows[i].from, w.rows[i - 1].to);
	assert.equal(windowModel(null, policy), null);
});

test('windowModel draws empty bars, not NaN, when nothing was cited', () => {
	const w = windowModel({ papersByMonth: new Array(36).fill(0), citationsByYearOffset: [0, 0, 0, 0, 0, 0, 0] }, policy);
	assert.ok(w.rows.every((r) => r.from === 0 && r.to === 0));
});

test('both axes start at zero and end at their own total, on shared rows', () => {
	const { yPub, yCite, rows } = axes({ pubTotal: 63114, citeTotal: 3400000, top: 46, bottom: 272 });
	assert.equal(yPub(0), 272);
	assert.equal(yCite(0), 272);
	// the dual-axis rule: the two series' final points are the same pixel
	assert.equal(yPub(63114), 46);
	assert.equal(yCite(3400000), 46);
	assert.equal(rows.length, TICK_FRACTIONS.length);
	assert.deepEqual(rows.map((r) => r.y), [215.5, 159, 102.5, 46]);
	assert.equal(rows[1].pub, 63114 / 2);
	assert.equal(rows[1].cite, 1700000);
	// a row's two tick values sit on the same pixel row as the row itself
	for (const r of rows) {
		assert.ok(Math.abs(yPub(r.pub) - r.y) < 1e-9);
		assert.ok(Math.abs(yCite(r.cite) - r.y) < 1e-9);
	}
});

test('a zero total still gives a usable scale', () => {
	const { yPub } = axes({ pubTotal: 0, citeTotal: 10, top: 0, bottom: 100 });
	assert.equal(yPub(0), 100);
});

test('xDomain widens a single-year axis', () => {
	assert.deepEqual(xDomain([1999, 2000, 2001]), [1999, 2001]);
	assert.deepEqual(xDomain([2001]), [2000.5, 2001.5]);
});

test('stackLabels stacks above the shared endpoint without overlapping', () => {
	assert.deepEqual(stackLabels(46, 2), [22, 40]);
	const rows = stackLabels(46, 2);
	assert.ok(rows[1] - rows[0] >= 18);
	// clamped rather than drawn off the top
	assert.deepEqual(stackLabels(10, 2, { minTop: 12 }), [12, 30]);
});

test('decimalYear places a date inside its year, and degrades with the date', () => {
	assert.equal(decimalYear('2008-01-01'), 2008);
	const mid = decimalYear('2008-06-30');
	assert.ok(mid > 2008.4 && mid < 2008.6);
	assert.equal(decimalYear('2008-00-00'), 2008); // ADS writes unknown parts as 00
	assert.equal(decimalYear(null), null);
	assert.equal(decimalYear('not-a-date'), null);
});

test('lifecycle markers use recorded dates, including launch before the first publication', () => {
	const markers = missionMilestones({ launch: '1997-10-15', primeEnd: '2008-06-30', missionEnd: '2017-09-15' });
	assert.deepEqual(markers.map((m) => m.label), ['launch', 'prime end', 'mission end']);
	assert.ok(Math.abs(markers[1].year - 2008.5) < 0.02);
	assert.deepEqual(lifetimeDomain([2004, 2005, 2026], markers), [1997, 2026]);
	assert.deepEqual(lifetimeDomain([2004, 2005], markers), [1997, 2018]);
	assert.deepEqual(missionMilestones({ launch: null, primeEnd: 'not-a-date' }), []);
	assert.deepEqual(missionMilestones({ launch: '2000-01-01' }).map((m) => m.key), ['launch'], 'no inferred mission end');
	assert.deepEqual(lifetimeDomain([2004], []), xDomain([2004]));
});

test('nearby lifecycle labels remain separate and inside a narrow chart', () => {
	const b = box(280, 300);
	const dates = { launch: '2000-01-01', primeEnd: '2000-01-01', missionEnd: '2000-01-02' };
	const markers = missionMilestones(dates);
	for (const domain of [[2000, 2026], [1970, 2001]]) {
		const x = scaleLinear().domain(domain).range([b.left, b.right]);
		const layout = layoutMilestones(markers, x, b);
		assert.equal(new Set(layout.markers.map((m) => m.labelY)).size, 3);
		for (const m of layout.markers) {
			assert.equal(m.x, x(decimalYear(m.date)), 'rules retain exact dates even when labels move');
			assert.ok(m.labelX >= b.left && m.labelX + m.label.length * 7 <= b.right);
			assert.ok(m.labelY < b.top + layout.height);
		}
	}
});

test('box leaves room for both axes and keeps a positive plot', () => {
	const b = box(600, 300);
	assert.ok(b.right > b.left);
	assert.ok(b.bottom > b.top);
	assert.equal(b.right, 548);
	assert.ok(box(320, 300).right > box(320, 300).left);
});
