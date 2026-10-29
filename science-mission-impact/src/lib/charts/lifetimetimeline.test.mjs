import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { timelineModel, timelineLayout } from './lifetimetimeline.js';

const series = { years: [2022, 2023, 2024], papers: [2, 3, 1], citations: [1, 8, 20], partialFromYear: 2024 };

test('publications remain annual while citations accumulate only completed source years', () => {
	const annual = timelineModel(series);
	assert.deepEqual(annual.points.map((p) => [p.pub, p.cite]), [[2, 1], [3, 9]]);
	assert.equal(annual.citationCoverage.expected, 9);
});

test('empty and entirely partial observations are omitted; a completed single year has finite geometry', () => {
	assert.equal(timelineModel(null), null);
	assert.equal(timelineModel({ years: [] }), null);
	assert.equal(timelineLayout(null, 280), null);
	assert.equal(timelineModel({ years: [2024], papers: [0], citations: [0], partialFromYear: 2024 }), null);
	const single = timelineModel({ years: [2024], papers: [0], citations: [0] });
	const l = timelineLayout(single, 280);
	assert.deepEqual(l.xTicks, [2024]);
	assert.ok(Number.isFinite(l.x(2024)));
	assert.ok(l.x(2024) - l.barWidth / 2 >= l.left);
	assert.ok(l.x(2024) + l.barWidth / 2 <= l.right);
	for (const panel of l.panels) assert.ok(Number.isFinite(panel.y(0)));
});

test('source-declared citation gaps retain their exact counts', () => {
	const citationCoverage = { status: 'incomplete', observed: 29, expected: 30, missing: 1 };
	const m = timelineModel({ ...series, partialFromYear: null, citationCoverage });
	assert.deepEqual(m.citationCoverage, citationCoverage);
});

test('all packaged divisions keep first and last completed years and two responsive count scales on one plot', () => {
	const dir = new URL('../data/generated/divisions/', import.meta.url);
	for (const file of readdirSync(dir)) {
		const source = JSON.parse(readFileSync(new URL(file, dir))).lifetimeSeries;
		const count = source.years.filter((year) => year < Math.min(new Date().getFullYear(), source.partialFromYear ?? Infinity)).length;
		const papers = source.papers.slice(0, count), citations = source.citations.slice(0, count);
		const m = timelineModel(source);
		assert.ok(m);
		assert.deepEqual(m.points.map((p) => p.pub), papers);
		let running = 0;
		assert.deepEqual(m.points.map((p) => p.cite), citations.map((value) => running += value));
		for (const width of [280, 800]) {
			const l = timelineLayout(m, width);
			assert.deepEqual(l.panels.map((p) => p.side), ['left', 'right']);
			assert.deepEqual([l.panels[1].top, l.panels[1].bottom], [l.panels[0].top, l.panels[0].bottom]);
			assert.ok(l.barWidth > 0);
			assert.equal(l.panels[0].path, null);
			assert.ok(l.panels[1].path);
			for (const p of m.points) {
				assert.ok(l.x(p.year) - l.barWidth / 2 >= l.left);
				assert.ok(l.x(p.year) + l.barWidth / 2 <= l.right);
			}
			assert.equal(l.xTicks[0], source.years[0]);
			assert.equal(l.xTicks.at(-1), source.years[count - 1]);
			for (const panel of l.panels) for (const p of m.points) {
				assert.ok(l.x(p.year) >= l.left && l.x(p.year) <= l.right);
				assert.ok(panel.y(p[panel.key]) >= panel.top && panel.y(p[panel.key]) <= panel.bottom);
				assert.doesNotMatch(panel.path ?? '', /NaN|Infinity/);
			}
		}
	}
});

test('current and future years are excluded without changing the source, even without a partial marker', () => {
	const year = new Date().getFullYear();
	const source = { years: [year - 2, year - 1, year, year + 1], papers: [2, 3, 1, 1], citations: [1, 8, 2, 1] };
	const original = structuredClone(source);
	const model = timelineModel(source);
	assert.deepEqual(model.years, [year - 2, year - 1]);
	assert.equal(timelineLayout(model, 800).xTicks.at(-1), year - 1);
	assert.equal(model.pubTotal, 5);
	assert.equal(model.citeTotal, 9);
	assert.deepEqual(source, original);
	assert.equal(timelineModel({ years: [year], papers: [1], citations: [2] }), null);
	assert.deepEqual(timelineModel({ years: [2000], papers: [1], citations: [2] }).years, [2000]);
});
