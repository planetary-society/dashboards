/**
 * The charts against the packaged data. These are the assumptions the components draw on —
 * axis maxima that claim to be totals, a window axis long enough to hold the series, tier
 * values that add up to the paper count — so if the packager's shape moves, this fails before
 * a chart quietly starts lying. Skips when the data has not been generated yet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lifetimeModel, windowModel } from './accumulation.js';
import { histogramModel } from './ranks.js';
import { curveFacts, curveChart } from './costcurve.js';
import { scatterModel } from './indexscatter.js';

const generated = join(dirname(fileURLToPath(import.meta.url)), '../data/generated');
const missing = !existsSync(generated);
const read = (path) => JSON.parse(readFileSync(join(generated, path), 'utf8'));
const opts = { skip: missing && 'generated data not built' };
// every scope/threshold pair the reader can select; lifetime has no top 1%
const VIEWS = [
	['full', 10],
	['full', 1],
	['window', 10],
	['window', 1],
	['lifetime', 10]
];

test('accumulation preserves source totals, explicit citation gaps and actual mission windows', opts, () => {
	const { windowPolicy, citationHistory } = read('site.json');
	for (const file of readdirSync(join(generated, 'divisions'))) {
		const d = read('divisions/' + file);
		const life = lifetimeModel(d.lifetimeSeries);
		assert.equal(life.pubTotal, d.facts.papers, d.slug);
		const coverage = life.citationCoverage;
		assert.equal(coverage.expected, d.facts.citations, d.slug);
		assert.equal(coverage.observed, life.citeTotal, d.slug);
		assert.equal(coverage.missing, coverage.expected - coverage.observed, d.slug);
		assert.ok(coverage.missing >= 0 && coverage.missing <= citationHistory.maxMissing);
		assert.ok(coverage.missing === 0 || coverage.missing / coverage.expected <= citationHistory.maxMissingFraction);
		assert.equal(coverage.status, coverage.missing ? 'incomplete' : 'complete');
		assert.ok(life.partialIndex === -1 || life.partialIndex === life.years.length - 1, d.slug);
		const measured = d.missions.filter((m) => m.window.status === 'available' && m.window.outputBasis === 'measured');
		assert.equal(d.windowSeries.missionsIncluded, measured.length);
		assert.equal(d.windowSeries.papersByMonth.length, Math.max(0, ...measured.map((m) => m.window.bounds.months)));
		assert.equal(d.windowSeries.citationsByYearOffset.length, Math.max(0, ...measured.map((m) => m.window.bounds.citationBuckets)));
		assert.deepEqual(d.windowSeries.missionsByYear, Array.from({ length: Math.ceil(d.windowSeries.papersByMonth.length / 12) },
			(_, i) => measured.filter((m) => m.window.bounds.months > i * 12).length));
		const win = windowModel(d.windowSeries, windowPolicy);
		if (win) {
			assert.equal(win.rows.length, d.windowSeries.citationsByYearOffset.length, d.slug);
			assert.equal(win.rows.at(-1).to, win.citeTotal > 0 ? 1 : 0, d.slug);
			assert.equal(win.rows[win.pubYears - 1].papers, win.pubTotal, d.slug);
		}
		for (const row of d.missions) {
			const m = read('missions/' + row.id + '.json');
			if (m.lifetimeSeries) {
				const model = lifetimeModel(m.lifetimeSeries);
				assert.equal(model.pubTotal, m.facts.papers, m.id);
				assert.equal(model.citeTotal, model.citationCoverage.observed, m.id);
				assert.equal(model.citationCoverage.expected, m.facts.citations, m.id);
			}
			if (row.window.outputBasis === 'measured' && row.window.status === 'available') {
				assert.equal(m.windowSeries.papersByMonth.reduce((a, b) => a + b, 0), row.window.papers, m.id);
				assert.equal(m.windowSeries.citationsByYearOffset.reduce((a, b) => a + b, 0), row.window.citations, m.id);
			}
		}
	}
});

test('packaged costs are bin-free and per-mission top-paper shares reconcile', opts, () => {
	const site = read('site.json');
	assert.equal('costClasses' in site, false);
	assert.equal('claims' in site, false);
	assert.equal('cells' in read('scrolly.json'), false);
	for (const file of readdirSync(join(generated, 'divisions'))) {
		const d = read('divisions/' + file);
		assert.equal('classes' in d, false);
		assert.ok(d.missions.every((m) => !('costClass' in m)));
		for (const [scope, top] of VIEWS) {
			const total = d.missions.reduce((a, m) => a + (m[scope]['top' + top] ?? 0), 0);
			const shares = d.missions.reduce((a, m) => a + (m[scope]['top' + top + 'ShareOfDivision'] ?? 0), 0);
			assert.ok(Math.abs(shares - (total > 0 ? 1 : 0)) < 0.001, d.slug + ' ' + scope + ' ' + top);
		}
	}
});

test('every cost curve names its missions, ends on the whole division and fits 375px', opts, () => {
	const WIDE = { padTop: 10, plotH: 300, mark: 9, gap: 1, gutter: 44, rightPad: 26, axisH: 20 };
	const PHONE = { padTop: 8, plotH: 220, mark: 6, gap: 1, gutter: 32, rightPad: 22, axisH: 18 };
	let checked = 0;
	for (const file of readdirSync(join(generated, 'divisions'))) {
		const d = read(`divisions/${file}`);
		assert.equal(d.costCurves == null, !d.rankable, d.slug); // a rankable division has curves
		if (!d.costCurves) continue;
		assert.equal(d.costCurves.lifetime[1], null, d.slug); // top 1% needs a window
		assert.ok(d.cutoffs?.full, `${d.slug}: no full-mission cutoffs`);
		const ids = new Set(d.missions.map((m) => m.id));
		for (const [scope, top] of VIEWS) {
			const raw = d.costCurves[scope][top];
			const f = curveFacts(raw, d.missions);
			const where = `${d.slug} ${scope} ${top}`;
			assert.ok(f, where);
			// every point is a mission of this division, and the rug can label it
			assert.ok(f.points.every((p) => ids.has(p.id)), where);
			assert.ok(f.points.every((p) => p.name && p.name !== p.id), where);
			assert.ok(f.points.every((p, i) => i === 0 || p.cost >= f.points[i - 1].cost), where);
			// the increments are what the readout prints: non-negative, and they spend the whole division
			assert.ok(f.points.every((p) => p.share >= 0), where);
			assert.ok(Math.abs(f.points.reduce((a, p) => a + p.share, 0) - 1) < 1e-6, where);
			assert.ok(Math.abs(f.points.at(-1).costShare - 1) < 1e-6, where);
			assert.ok(raw.unplaced.every((id) => ids.has(id) && !f.points.some((p) => p.id === id)), where);

			const { p25, p50, p75 } = f.band;
			assert.ok(p25 <= p50 && p50 <= p75, where);
			assert.ok(f.atP25.topShare >= 0.25 - 1e-9, where); // the takeaway's "first quarter"
			assert.ok(f.atP25.costShare > 0 && f.atP25.costShare <= 1, where);

			for (const [width, o] of [[1160, WIDE], [375, PHONE]]) {
				const c = curveChart(f, width, o);
				assert.ok(c.marks.every((m) => m.x >= 0 && m.x + m.s <= width), `${where} @${width}`);
				assert.ok(c.marks.every((m) => m.y + m.s <= c.height + 1e-9), `${where} @${width}`);
				assert.ok(c.ticks.length >= 2 && c.ticks.length <= 7, `${where} @${width}: ${c.ticks.length} ticks`);
				assert.ok(!c.topPath.includes('NaN') && !c.costPath.includes('NaN'), `${where} @${width}`);
				assert.ok(c.band.x >= c.left && c.band.x + c.band.w <= c.right + 1e-9, `${where} @${width}`);
			}
			checked += 1;
		}
	}
	assert.ok(checked >= 15, `only ${checked} curves checked`); // five views per rankable division
});

test('every division plots both indices, and the correlation counts the missions it draws', opts, () => {
	let checked = 0;
	for (const file of readdirSync(join(generated, 'divisions'))) {
		const d = read(`divisions/${file}`);
		const ids = new Set(d.missions.map((m) => m.id));
		for (const index of ['m', 'h']) {
			const model = scatterModel(d.missions, index);
			const where = `${d.slug} ${index}`;
			assert.ok(model, where);
			assert.ok(model.points.length > 0, where);
			assert.ok(model.points.every((p) => ids.has(p.id) && p.name), where);
			assert.ok(model.points.every((p) => p.x >= 0 && p.x <= 100), `${where}: a mark off the cost axis`);
			assert.ok(model.points.every((p) => p.y >= 0 && p.y <= 100), `${where}: a mark off the index axis`);
			// only a failure is drawn without a value of its own, and it sits on the zero line
			assert.ok(model.points.every((p) => p.value != null || (p.failed && p.y === 0)), where);

			// the sentence under the title counts the missions the chart draws as real points
			const stat = d.indexCorrelation[index];
			assert.equal(stat.n, model.points.filter((p) => !p.failed).length, `${where}: n vs marks`);
			assert.ok(stat.rho == null || (stat.rho >= -1 && stat.rho <= 1), where);
			assert.ok(stat.rho == null || stat.n >= 3, `${where}: a rho on ${stat.n} missions`);
			checked += 1;
		}
	}
	assert.equal(checked, 10); // five divisions, two indices each
});

test('every mission with papers carries the three index figures the pages print', opts, () => {
	let withPapers = 0;
	for (const file of readdirSync(join(generated, 'missions'))) {
		const m = read(`missions/${file}`);
		assert.ok(m.indices && 'h' in m.indices && 'm' in m.indices && 'i100' in m.indices, m.id);
		if (m.facts.papers <= 0) continue;
		// the mission header states h-index and the 100-citation count whenever there are papers
		assert.ok(Number.isFinite(m.indices.h) && Number.isFinite(m.indices.m) && Number.isFinite(m.indices.i100), m.id);
		assert.ok(m.indices.i100 <= m.facts.papers, m.id);
		assert.ok(m.indices.h <= m.facts.papers, m.id);
		withPapers += 1;
	}
	assert.ok(withPapers > 100, `only ${withPapers} missions with papers checked`);
});

test('mission rank histograms spend exactly the scope paper count', opts, () => {
	const files = readdirSync(join(generated, 'missions'));
	let checked = 0;
	for (const file of files) {
		const m = read(`missions/${file}`);
		for (const scope of ['full', 'window', 'lifetime']) {
			const model = histogramModel(m.ranks[scope]);
			if (!model) continue;
			assert.equal(model.bars.length, 10, `${m.id} ${scope}`);
			assert.ok(Math.abs(model.total - m[scope].papers) < 0.05, `${m.id} ${scope}: ${model.total} vs ${m[scope].papers}`);
			assert.ok(model.top1 <= model.bars.at(-1).value + 1e-9, `${m.id} ${scope}`);
			assert.ok(model.bars.every((b) => b.height >= 0 && b.height <= 1), `${m.id} ${scope}`);
			checked += 1;
		}
	}
	assert.ok(checked > 100, `only ${checked} histograms checked`);
});
