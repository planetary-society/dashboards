import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { buildAnalysis, managementOf, medianInterval, rateSpread, selectionOf } from '../lib/analysis.mjs';
import { buildSite } from '../lib/site.mjs';

/** A packaged mission row with only what the Analysis page reads. */
const row = (id, cost, { papers = 0, citations = 0, top10 = 0, failed = false, shortfall = failed, selection = null, status = 'available', first = { state: 'none' } } = {}) => ({
	id, name: id.toUpperCase(), cost, failed, shortfall, selection,
	full: { status, papers, citations, top10 },
	lifetime: { first: { yearsFromScienceStart: null, yearsFromFormulation: null, ...first } }
});
const reached = (formulation, science) => ({ state: 'reached', yearsFromFormulation: formulation, yearsFromScienceStart: science });
/** A division whose full-scope top-50% cutoff is `c`. */
const doc = (slug, c, missions, rankable = true) => ({
	slug, name: slug.toUpperCase(), rankable, missions,
	stats: { full: { papers: 1000, cutoffs: [{ percent: 1, citations: 100, papers: 10 }, { percent: 10, citations: 40, papers: 100 }, { percent: 50, citations: c, papers: 500 }] } }
});
const options = { thresholdCost: 150, costTiers: [50, 150, 350], costGroups: [150, 1000] };
/** buildAnalysis with the test options. */
const analyse = (docs, extra = {}) => buildAnalysis(docs, { ...options, ...extra });

// N50 = papers + citations / c. Rates: b1 .2, c1 1/6, a1 .25, a2 0, b4 .1, a3 2/15, b2 .2, a4 .2, a5 .25, b3 .25.
const docs = [
	doc('a', 10, [
		row('a1', 20, { papers: 2, citations: 30, selection: 'competed', first: reached(3, 1) }), // N50 5
		// an outright failure: packaged papers 0, a measured zero; its (impossible) quick paper must not count
		row('a2', 50, { failed: true, selection: 'directed', first: reached(1, 0) }),
		row('a3', 150, { papers: 10, citations: 100, shortfall: true, selection: 'competed', first: reached(5, 2) }), // N50 20, exactly at an edge
		row('a4', 300, { papers: 40, citations: 200, selection: 'directed', first: reached(4, 1.5) }), // N50 60
		row('a5', 400, { papers: 50, citations: 500, selection: 'directed' }), // N50 100, no top paper
		row('a6', 0, { papers: 5 }), // no positive cost
		row('a7', 80, { papers: null, citations: null, status: 'unavailable' }) // not measured
	]),
	doc('b', 5, [
		row('b1', 10, { papers: 1, citations: 5, selection: 'competed', first: reached(2, 0.5) }), // N50 2
		row('b2', 200, { papers: 20, citations: 100, selection: 'competed', first: reached(2, 1) }), // N50 40
		row('b3', 1200, { papers: 100, citations: 1000, selection: 'directed', first: reached(6.257, 3) }), // N50 300
		row('b4', 100, { papers: 4, citations: 30, first: reached(null, 2) }) // N50 10, undated
	]),
	doc('c', 3, [row('c1', 10, { papers: 1, citations: 2, first: reached(2, 1) })], false) // N50 5/3
];
const divisions = [...docs.map(({ slug, name }) => ({ slug, name })), { slug: 'd', name: 'D' }]; // d: configured, never packaged
const facts = analyse(docs, { focusDivision: 'a', divisions });

describe('selectionOf', () => {
	it('maps Competed and Directed, and reads Unknown or blank as unclassified', () => {
		assert.equal(selectionOf('Competed', 'x'), 'competed');
		assert.equal(selectionOf('Directed', 'x'), 'directed');
		for (const label of ['Unknown', '', null, undefined]) assert.equal(selectionOf(label, 'x'), null);
	});

	it('refuses any other label, the older management labels included', () => {
		for (const label of ['PI led', 'Strategic', 'competed', 'constructor']) {
			assert.throws(() => selectionOf(label, 'juno'), (e) => e.name === 'PackagingError' && e.message.includes('juno') && e.message.includes(JSON.stringify(label)) && /predates the Competed\/Directed classification/.test(e.message));
		}
	});
});

describe('managementOf', () => {
	it('maps the three models, reads Unknown or blank as unclassified and refuses anything else', () => {
		assert.equal(managementOf('Agency-led', 'x'), 'agency');
		assert.equal(managementOf('PI-led', 'x'), 'pi');
		assert.equal(managementOf('Commercial-led', 'x'), 'commercial');
		for (const label of ['Unknown', '', null, undefined]) assert.equal(managementOf(label, 'x'), null);
		for (const label of ['PI led', 'Strategic', 'agency-led']) assert.throws(() => managementOf(label, 'juno'), (e) => e.name === 'PackagingError' && e.message.includes('juno'));
	});
});

describe('rateSpread', () => {
	it('interpolates quartiles (type 7), stops whiskers inside 1.5 IQR and counts zeros', () => {
		// q1 at h = 1.5, median at 3, q3 at 4.5; IQR 3 puts the fences at -4 and 8, so 20 is outside
		assert.deepEqual(rateSpread([4, 0, 20, 1, 0, 3, 2]), { missions: 7, zeros: 2, median: 2, q1: 0.5, q3: 3.5, whiskers: [0, 4] });
		assert.deepEqual(rateSpread([1, 2, 3, 4]), { missions: 4, zeros: 0, median: 2.5, q1: 1.75, q3: 3.25, whiskers: [1, 4] });
		assert.deepEqual(rateSpread([]), { missions: 0, zeros: 0, median: null, q1: null, q3: null, whiskers: null });
	});
});

describe('buildAnalysis', () => {
	it('splits tiers and groups at the configured edges, each closed above', () => {
		assert.deepEqual(facts.tiers, [{ lo: 0, hi: 50 }, { lo: 50, hi: 150 }, { lo: 150, hi: 350 }, { lo: 350, hi: null }]);
		assert.deepEqual(facts.groups, [{ lo: 0, hi: 150 }, { lo: 150, hi: 1000 }, { lo: 1000, hi: null }]);
		assert.deepEqual([facts.scope, facts.timeScope, facts.referenceCost], ['full', 'lifetime', 150]);
	});

	it('lists the costed, measured missions by cost then id, each N50 against its own division', () => {
		assert.deepEqual(facts.missions.map((m) => m.id), ['b1', 'c1', 'a1', 'a2', 'b4', 'a3', 'b2', 'a4', 'a5', 'b3']);
		assert.deepEqual(facts.excluded, { noCost: 1, unmeasured: 1 });
		const byId = Object.fromEntries(facts.missions.map((m) => [m.id, m]));
		// a mission costing exactly an edge sits in the lower tier
		assert.deepEqual(facts.missions.map((m) => m.tier), [0, 0, 0, 0, 1, 1, 2, 2, 3, 3]);
		assert.deepEqual(facts.missions.map((m) => m.group), [0, 0, 0, 0, 0, 0, 1, 1, 1, 2]);
		assert.deepEqual(byId.a1, { id: 'a1', name: 'A1', division: 'a', cost: 20, tier: 0, group: 0, failed: false, shortfall: false, selection: 'competed', n50: 5, rate: 0.25 });
		assert.deepEqual([byId.c1.n50, byId.c1.rate], [1.667, 0.16667]); // 1 + 2/3, then over $10M
		assert.deepEqual([byId.a3.n50, byId.a3.rate], [20, 0.13333]);
		assert.deepEqual([byId.a2.n50, byId.a2.rate, byId.a2.failed], [0, 0, true]);
	});

	it('counts outcomes per tier and either side of the threshold, every configured division kept', () => {
		const [t0, t1, t2, t3] = facts.failures.tiers;
		assert.deepEqual(t0, {
			missions: 4, ok: 3, failed: 1, partial: 0, rate: 0.25,
			byDivision: [
				{ division: 'a', ok: 1, failed: 1, partial: 0 },
				{ division: 'b', ok: 1, failed: 0, partial: 0 },
				{ division: 'c', ok: 1, failed: 0, partial: 0 },
				{ division: 'd', ok: 0, failed: 0, partial: 0 }
			]
		});
		// a7 has no measured output but an outcome all the same: it counts
		assert.deepEqual([t1.missions, t1.ok, t1.failed, t1.partial, t1.rate], [3, 2, 0, 1, 0.33333]);
		assert.deepEqual([t2.rate, t3.rate], [0, 0]);
		assert.deepEqual(facts.failures.under, { missions: 7, shortfall: 2, rate: 0.28571 });
		assert.deepEqual(facts.failures.over, { missions: 4, shortfall: 0, rate: 0 });
		// (1 - 0) / (1 - 2/7) - 1, from the unrounded rates
		assert.equal(facts.failures.successPremium, 0.4);
	});

	it('keeps upstream-selected failures and their output, and counts them in the failure rates', () => {
		const failure = row('r1', 30, { failed: true, papers: 1, citations: 4, first: reached(1, 0) });
		failure.launchDate = '2021-09-27';
		const withFailure = [doc('a', 10, [...docs[0].missions, failure]), ...docs.slice(1)];
		const plain = analyse(docs, { divisions });
		const included = analyse(withFailure, { divisions });
		assert.deepEqual(included.excluded, { noCost: 1, unmeasured: 1 });
		assert.equal(included.missions.length, plain.missions.length + 1);
		const measuredFailure = included.missions.find((m) => m.id === failure.id);
		assert.deepEqual([measuredFailure.failed, measuredFailure.n50, measuredFailure.rate], [true, 1.4, 0.04667]);
		assert.equal(included.groupRates[0].missions, plain.groupRates[0].missions + 1);
		assert.deepEqual(included.time.tiers, plain.time.tiers); // failures still have no time-to-science comparison
		assert.deepEqual(included.failures.under, { missions: 8, shortfall: 3, rate: 0.375 });
	});

	it('spreads N50 per $M in each cost group, failures as zeros', () => {
		// group 0 sorted: 0, .1, 2/15, 1/6, .2, .25
		assert.deepEqual(facts.groupRates[0], { missions: 6, zeros: 1, median: 0.15, q1: 0.10833, q3: 0.19167, whiskers: [0, 0.25], shortfall: 2, failed: 1 });
		assert.deepEqual(facts.groupRates[1], { missions: 3, zeros: 0, median: 0.2, q1: 0.2, q3: 0.225, whiskers: [0.2, 0.25], shortfall: 0, failed: 0 });
		assert.deepEqual(facts.groupRates[2], { missions: 1, zeros: 0, median: 0.25, q1: 0.25, q3: 0.25, whiskers: [0.25, 0.25], shortfall: 0, failed: 0 });
	});

	it('times first top-10% papers without the failures, counting the undated', () => {
		const { tiers, failedExcluded, fastest, byDivision } = facts.time;
		assert.equal(failedExcluded, 1);
		// too few reached missions for a 95% interval on any median here (medianInterval needs six)
		assert.deepEqual(tiers[0], { missions: 3, reached: 3, without: 0, undated: 0, formulation: { median: 2, min: 2, ci: null }, science: { median: 1, min: 0.5, ci: null } });
		assert.deepEqual(tiers[1], { missions: 2, reached: 2, without: 0, undated: 1, formulation: { median: 5, min: 5, ci: null }, science: { median: 2, min: 2, ci: null } });
		assert.deepEqual(tiers[2], { missions: 2, reached: 2, without: 0, undated: 0, formulation: { median: 3, min: 2, ci: null }, science: { median: 1.25, min: 1, ci: null } });
		assert.deepEqual(tiers[3], { missions: 2, reached: 1, without: 1, undated: 0, formulation: { median: 6.26, min: 6.26, ci: null }, science: { median: 3, min: 3, ci: null } });
		// b1, c1 and b2 all take 2 years: b1 and c1 cost the same, so the id decides; the failed a2 never counts
		assert.deepEqual(fastest, { id: 'b1', name: 'B1', division: 'b', years: 2 });
		assert.deepEqual(byDivision.map((d) => [d.division, d.name, d.fastest?.id ?? null, d.fastest?.years ?? null]),
			[['a', 'A', 'a1', 3], ['b', 'B', 'b1', 2], ['c', 'C', 'c1', 2], ['d', 'D', null, null]]); // b1 beats b2 on cost
	});

	it('spreads each cost group by selection, and counts the unclassified', () => {
		const [g0, , g2] = facts.selection.groups;
		assert.deepEqual(g0.competed, { missions: 3, zeros: 0, median: 0.2, q1: 0.16667, q3: 0.225, whiskers: [0.13333, 0.25] });
		assert.deepEqual(g0.directed, { missions: 1, zeros: 1, median: 0, q1: 0, q3: 0, whiskers: [0, 0] });
		assert.deepEqual(g2.competed, { missions: 0, zeros: 0, median: null, q1: null, q3: null, whiskers: null });
		assert.equal(facts.selection.unclassified, 2); // c1, b4
	});

	it('names the small missions beating the median of their own division\'s costlier ones, rankable divisions only', () => {
		assert.deepEqual(facts.standouts, [
			{ division: 'a', name: 'A', overMedian: 0.225, missions: [{ id: 'a1', name: 'A1', cost: 20, rate: 0.25 }] },
			{ division: 'b', name: 'B', overMedian: 0.225, missions: [] }
		]);
		assert.deepEqual(facts.efficiency.divisions.map((d) => d.division), ['a', 'b']);
	});

	it('orders standouts by rate then id; a rate equal to the median does not beat it', () => {
		const s = doc('s', 1, [
			row('big1', 200, { papers: 20 }), row('big2', 400, { papers: 80 }), row('big3', 1000, { papers: 300 }), // .1 .2 .3: median .2
			row('u3', 10, { papers: 3 }), row('u2', 50, { papers: 25 }), row('u1', 100, { papers: 30 }), row('u4', 150, { papers: 30 }) // .3 .5 .3 .2
		]);
		const t = doc('t', 1, [row('t1', 10, { papers: 9 })]);
		const { standouts } = analyse([s, t]);
		assert.deepEqual(standouts[0].missions.map((m) => [m.id, m.rate]), [['u2', 0.5], ['u1', 0.3], ['u3', 0.3]]);
		assert.deepEqual(standouts[1], { division: 't', name: 'T', overMedian: null, missions: [] });
	});

	it('compares each tier\'s share of N50 with its share of cost, and tests the best tier by leaving one mission out', () => {
		// c = 1, so N50 = papers. e: N50 100 over $650M; f: N50 180 over $1,230M.
		const e = doc('e', 1, [row('e1', 10, { papers: 10, top10: 0.5 }), row('e2', 40, { papers: 10, top10: 0.25 }), row('e3', 100, { papers: 20, top10: 1.125 }), row('e4', 500, { papers: 60, top10: 3 })]);
		const f = doc('f', 1, [row('f1', 10, { papers: 50 }), row('f2', 100, { papers: 20 }), row('f3', 120, { papers: 10 }), row('f4', 1000, { papers: 100 })]);
		const [de, df] = analyse([e, f]).efficiency.divisions;
		assert.deepEqual(de.cells, [
			{ missions: 2, n50Share: 0.2, costShare: 0.07692, ratio: 2.6 },
			{ missions: 1, n50Share: 0.2, costShare: 0.15385, ratio: 1.3 },
			null,
			{ missions: 1, n50Share: 0.6, costShare: 0.76923, ratio: 0.78 }
		]);
		assert.deepEqual(de.under, { missions: 3, ratio: 1.73333, top10: 1.875 }); // .4 of N50 for 150/650 of cost
		assert.deepEqual(de.best, { tier: 0, ratio: 2.6, holds: true });
		// f1 alone makes the cheapest tier best: leaving it out empties that tier
		assert.deepEqual(df.best, { tier: 0, ratio: 34.16667, holds: false });
	});

	it('publishes N_c\'s cutoffs for each configured division that has them, and the story\'s focus', () => {
		assert.equal(facts.nc.percent, 50);
		assert.equal(facts.nc.focus, 'a');
		assert.deepEqual(facts.nc.divisions.map((d) => d.division), ['a', 'b', 'c']); // d has no packaged stats
		assert.deepEqual(facts.nc.divisions[2], { division: 'c', name: 'C', papers: 1000, c: 3, cutoffs: { 50: 3, 10: 40, 1: 100 } });
	});

	it('has no success premium when every small mission fell short, and needs a cutoff only for measured missions', () => {
		const lost = doc('l', 1, [row('l1', 10, { failed: true }), row('l2', 200, { papers: 5 })]);
		assert.equal(analyse([lost]).failures.successPremium, null);
		const noCutoff = { ...doc('n', 1, [row('n1', 10, { papers: 1 })]), stats: { full: null } };
		assert.throws(() => analyse([noCutoff]), /n: no positive full-scope top-50% citation cutoff/);
		const unmeasured = { ...noCutoff, missions: [row('n1', null), row('n2', 10, { papers: null, status: 'unavailable' })] };
		assert.deepEqual(analyse([unmeasured]).excluded, { noCost: 1, unmeasured: 1 });
	});
});

describe('medianInterval', () => {
	it('takes the narrowest order statistics whose binomial coverage reaches 95%, and none below six values', () => {
		const n = (count) => Array.from({ length: count }, (_, i) => count - i); // count..1, unsorted
		assert.equal(medianInterval(n(5)), null); // (x1, x5) covers 1 - 2/32 = 93.75%
		assert.deepEqual(medianInterval(n(6)), [1, 6]); // 1 - 2/64 = 96.9%
		assert.deepEqual(medianInterval(n(9)), [2, 8]); // k = 2: 96.1%; k = 3: 82.0%
		assert.deepEqual(medianInterval(n(20)), [6, 15]); // the textbook k = 6 for n = 20 (95.9%)
		assert.equal(medianInterval([]), null);
	});
});

describe('buildSite', () => {
	it('carries the analysis, its focus the story\'s', () => {
		// a cost curve makes division a rankable for the story, so it can be the focus
		const curves = { full: { 10: { points: [], band: { p25: null, p50: null, p75: null } } } };
		const divisionDocs = docs.map((d) => (d.slug === 'a' ? { ...d, costCurves: curves } : d));
		const config = { divisions, thresholdCost: 150, storyDivision: 'a', analysis: { costTiers: options.costTiers, costGroups: options.costGroups } };
		const site = buildSite({ snapshot: {}, config, indexEntries: [], divisionSummaries: [], divisionDocs, papersDistinct: 0, citationsDistinct: 0 });
		assert.equal(site.story.focusDivision, 'a');
		assert.deepEqual(site.analysis, facts);
		const unfocused = buildSite({ snapshot: {}, config, indexEntries: [], divisionSummaries: [], divisionDocs: docs, papersDistinct: 0, citationsDistinct: 0 });
		assert.equal(unfocused.analysis.nc.focus, null);
	});
});
