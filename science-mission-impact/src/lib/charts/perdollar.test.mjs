import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipSpan, perDollarChart, rate } from './perdollar.js';

const m = (id, cost, citations, extra = {}) => ({ id, cost, full: { status: 'available', citations, top10: 0 }, ...extra });

test('a line is cut where it leaves the rate domain, never bent', () => {
	// log rate = 1 + log cost: inside [10, 1000] only for log costs 0 to 2
	assert.deepEqual(clipSpan({ intercept: 1, slope: 1 }, [-1, 3], [10, 1000]), [0, 2]);
	// log rate = 3 − log cost: inside [10, 100] only for log costs 1 to 2
	assert.deepEqual(clipSpan({ intercept: 3, slope: -1 }, [0, 1.5], [10, 100]), [1, 1.5]);
	assert.deepEqual(clipSpan({ intercept: 2, slope: 0 }, [-1, 3], [10, 1000]), [-1, 3]);
	assert.equal(clipSpan({ intercept: 5, slope: 1 }, [0, 1], [10, 1000]), null);
});

test('rate is per $100M, and unmeasured output has none', () => {
	assert.equal(rate(m('a', 50, 25), 'full'), 50);
	assert.equal(rate({ ...m('a', 50, 25), full: { status: 'unavailable', citations: 25, top10: 0 } }, 'full'), null);
	assert.equal(rate({ ...m('a', 50, 25), full: { status: 'available', citations: 25, top10: null } }, 'full'), null, 'unranked output is not measured');
	assert.equal(rate(m('a', 50, null), 'full'), null);
});

test('missions without citations sit on the shelf under the plot, the rest inside it', () => {
	const missions = [m('lost', 20, 0, { failed: true }), m('a', 10, 50), m('b', 300, 2000), m('c', 3000, 30000), m('none', 40, null)];
	const c = perDollarChart(missions, 'full', 800, { slope: 0.5, intercept: 1.5 });
	assert.equal(c.marks.length, 4, 'the unmeasured mission is left out');
	assert.equal(c.zeros, 1);
	const lost = c.marks.find((p) => p.id === 'lost');
	assert.ok(lost.y >= c.shelfY && lost.y < c.axisY, 'on the shelf');
	for (const id of ['a', 'b', 'c']) {
		const p = c.marks.find((q) => q.id === id);
		assert.ok(p.y + p.s / 2 >= c.top && p.y + p.s / 2 <= c.bottom, `${id} inside the plot`);
	}
	assert.ok(c.fit && c.fit.x1 < c.fit.x2 && c.fit.y2 < c.fit.y1, 'the packaged line, rising');
	assert.equal(perDollarChart(missions, 'full', 800).fit, null, 'no packaged fit, no line');
	assert.equal(perDollarChart(missions, 'full', 0), null);
	assert.equal(perDollarChart([m('lost', 20, 0)], 'full', 800), null);
});
