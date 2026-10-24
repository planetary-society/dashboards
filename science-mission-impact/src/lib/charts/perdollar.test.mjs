import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logFit, perDollarChart, rate } from './perdollar.js';

const m = (id, cost, citations, extra = {}) => ({ id, cost, full: { status: 'available', citations, top10: 0 }, ...extra });

test('the fit recovers a power law exactly, and needs three points with a spread in cost', () => {
	// rate = 10 * cost^0.5
	const points = [1, 10, 100, 1000].map((cost) => ({ cost, rate: 10 * cost ** 0.5 }));
	const fit = logFit(points);
	assert.ok(Math.abs(fit.slope - 0.5) < 1e-9);
	assert.ok(Math.abs(fit.intercept - 1) < 1e-9);
	assert.equal(logFit(points.slice(0, 2)), null);
	assert.equal(logFit([1, 1, 1].map((cost) => ({ cost, rate: cost }))), null);
});

test('rate is per $100M, and unmeasured output has none', () => {
	assert.equal(rate(m('a', 50, 25), 'full'), 50);
	assert.equal(rate({ ...m('a', 50, 25), full: { status: 'unavailable', citations: 25, top10: 0 } }, 'full'), null);
	assert.equal(rate({ ...m('a', 50, 25), full: { status: 'available', citations: 25, top10: null } }, 'full'), null, 'unranked output is not measured');
	assert.equal(rate(m('a', 50, null), 'full'), null);
});

test('missions without citations sit on the shelf under the plot, the rest inside it', () => {
	const missions = [m('lost', 20, 0, { failed: true }), m('a', 10, 50), m('b', 300, 2000), m('c', 3000, 30000), m('none', 40, null)];
	const c = perDollarChart(missions, 'full', 800);
	assert.equal(c.marks.length, 4, 'the unmeasured mission is left out');
	assert.equal(c.zeros, 1);
	const lost = c.marks.find((p) => p.id === 'lost');
	assert.ok(lost.y >= c.shelfY && lost.y < c.axisY, 'on the shelf');
	for (const id of ['a', 'b', 'c']) {
		const p = c.marks.find((q) => q.id === id);
		assert.ok(p.y + p.s / 2 >= c.top && p.y + p.s / 2 <= c.bottom, `${id} inside the plot`);
	}
	assert.ok(c.fit && c.fit.x1 < c.fit.x2);
	assert.equal(perDollarChart(missions, 'full', 0), null);
	assert.equal(perDollarChart([m('lost', 20, 0)], 'full', 800), null);
});
