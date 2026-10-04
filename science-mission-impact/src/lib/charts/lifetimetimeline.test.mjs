import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { timelineModel, timelineLayout } from './lifetimetimeline.js';

const series = { years: [2022, 2023, 2024], papers: [2, 3, 1], citations: [1, 8, 20], partialFromYear: 2024 };

test('annual observations remain annual; cumulative values sum only recorded source rows', () => {
	const annual = timelineModel(series);
	assert.deepEqual(annual.points.map((p) => [p.pub, p.cite]), [[2, 1], [3, 8], [1, 20]]);
	assert.deepEqual(timelineModel(series, 'cumulative').points.map((p) => [p.pub, p.cite]), [[2, 1], [5, 9], [6, 29]]);
	assert.deepEqual(annual.solid.map((p) => p.year), [2022, 2023]);
	assert.deepEqual(annual.partial.map((p) => p.year), [2023, 2024]);
	assert.equal(annual.citationCoverage.expected, 29);
});

test('empty, single-year and entirely partial observations have explicit finite geometry', () => {
	assert.equal(timelineModel(null), null);
	assert.equal(timelineModel({ years: [] }), null);
	assert.equal(timelineLayout(null, 280), null);
	const single = timelineModel({ years: [2024], papers: [0], citations: [0], partialFromYear: 2024 });
	assert.equal(single.solid.length, 0);
	assert.equal(single.partial.length, 1);
	const l = timelineLayout(single, 280);
	assert.deepEqual(l.xTicks, [2024]);
	assert.ok(Number.isFinite(l.x(2024)));
	for (const panel of l.panels) assert.ok(Number.isFinite(panel.y(0)));
});

test('complete years are solid and source-declared citation gaps retain their exact counts', () => {
	const citationCoverage = { status: 'incomplete', observed: 29, expected: 30, missing: 1 };
	const m = timelineModel({ ...series, partialFromYear: null, citationCoverage });
	assert.equal(m.partial.length, 0);
	assert.equal(m.solid.length, 3);
	assert.deepEqual(m.citationCoverage, citationCoverage);
});

test('all packaged divisions keep first and last years and two responsive count scales on one plot', () => {
	const dir = new URL('../data/generated/divisions/', import.meta.url);
	for (const file of readdirSync(dir)) {
		const source = JSON.parse(readFileSync(new URL(file, dir))).lifetimeSeries;
		for (const mode of ['annual', 'cumulative']) {
			const m = timelineModel(source, mode);
			assert.ok(m);
			if (mode === 'annual') {
				assert.deepEqual(m.points.map((p) => p.pub), source.papers);
				assert.deepEqual(m.points.map((p) => p.cite), source.citations);
			} else {
				assert.equal(m.points.at(-1).pub, source.papers.reduce((a, b) => a + b, 0));
				assert.equal(m.points.at(-1).cite, source.citations.reduce((a, b) => a + b, 0));
			}
			for (const width of [280, 800]) {
				const l = timelineLayout(m, width);
				assert.deepEqual(l.panels.map((p) => p.side), ['left', 'right']);
				assert.deepEqual([l.panels[1].top, l.panels[1].bottom], [l.panels[0].top, l.panels[0].bottom]);
				assert.equal(l.xTicks[0], source.years[0]);
				assert.equal(l.xTicks.at(-1), source.years.at(-1));
				for (const panel of l.panels) for (const p of m.points) {
					assert.ok(l.x(p.year) >= l.left && l.x(p.year) <= l.right);
					assert.ok(panel.y(p[panel.key]) >= panel.top && panel.y(p[panel.key]) <= panel.bottom);
					assert.doesNotMatch((panel.solid ?? '') + (panel.partial ?? ''), /NaN|Infinity/);
				}
			}
		}
	}
});
