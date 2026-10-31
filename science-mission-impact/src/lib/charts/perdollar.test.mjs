import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipSpan, perDollarLayout, runningLine, trendBand } from './perdollar.js';

test('a line is cut where it leaves the rate domain, never bent', () => {
	// log rate = 1 + log cost: inside [10, 1000] only for log costs 0 to 2
	assert.deepEqual(clipSpan({ intercept: 1, slope: 1 }, [-1, 3], [10, 1000]), [0, 2]);
	// log rate = 3 − log cost: inside [10, 100] only for log costs 1 to 2
	assert.deepEqual(clipSpan({ intercept: 3, slope: -1 }, [0, 1.5], [10, 100]), [1, 1.5]);
	assert.deepEqual(clipSpan({ intercept: 2, slope: 0 }, [-1, 3], [10, 1000]), [-1, 3]);
	assert.equal(clipSpan({ intercept: 5, slope: 1 }, [0, 1], [10, 1000]), null);
});

test('four divisions form a shared-scale 2 by 2 grid with every point and curve in its own panel', () => {
	const divisions = ['astro', 'earth', 'helio', 'planetary'].map((slug) => ({ slug, name: slug, nav: slug }));
	const tiles = divisions.flatMap(({ slug }) => [
		{ id: `${slug}-low`, division: slug, cost: 10, citations: 1, top10: 1 },
		{ id: `${slug}-high`, division: slug, cost: 1000, citations: 10000, top10: 1 },
		...[0, 1, 2].map((i) => ({ id: `${slug}-zero-${i}`, division: slug, cost: 50, citations: 0, top10: 0 }))
	]);
	const average = { points: [[10, 0, 0, 10], [100, 100, 10, 1000], [1000, 1000, 100, 10000]] };
	const averages = new Map(divisions.map(({ slug }) => [slug, average]));
	for (const [width, height] of [[1200, 800], [840, 700], [351, 400]]) {
		const layout = perDollarLayout(tiles, width, height, { divisions, averages, titled: true });
		const [a, b, c, d] = layout.rows;
		assert.equal(layout.columns, 2);
		assert.equal(a.y, b.y, 'first two divisions share the top row');
		assert.equal(c.y, d.y, 'last two divisions share the bottom row');
		assert.equal(a.left, c.left, 'left column is aligned');
		assert.equal(b.left, d.left, 'right column is aligned');
		assert.ok(a.left + a.width <= b.left && a.shelfY < c.y, 'panels do not overlap and leave room for cost ticks');
		assert.equal(layout.pos.size, tiles.length, 'all measured missions retained');
		for (const row of layout.rows) {
			assert.deepEqual(row.x.domain(), a.x.domain(), 'the same cost means the same fraction of every panel');
			assert.equal(row.width, a.width);
			assert.equal(row.h, a.h);
			for (const rate of [10, 100, 1000]) {
				assert.ok(Math.abs((row.rateY(rate) - row.y) - (a.rateY(rate) - a.y)) < 1e-9, 'citation scales match across panels');
			}
			for (const tile of tiles.filter((t) => t.division === row.slug)) {
				const p = layout.pos.get(tile.id);
				assert.ok(p.x >= row.left && p.x + p.s <= row.left + row.width, `${tile.id} stays inside its column`);
				assert.ok(p.y >= row.y && p.y + p.s <= row.shelfY, `${tile.id} stays above its panel baseline`);
			}
			const curve = runningLine(layout, row);
			assert.equal(curve.x2, row.x(1000), 'the curve uses its own panel cost axis');
			assert.ok(Math.abs(Number(curve.path.match(/^M[^,]+,([\d.]+)/)[1]) - row.shelfY) < 0.001, 'a zero average lies on its panel baseline');
			const band = trendBand(layout, row, average.points.map(([cost, , lo, hi]) => [cost, lo, hi]));
			assert.equal(band.x, row.x(10), 'uncertainty clipping follows the panel too');
			assert.equal(band.width, row.x(1000) - row.x(10));
		}
	}
});
