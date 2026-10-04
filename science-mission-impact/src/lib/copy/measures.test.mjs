import { test } from 'node:test';
import assert from 'node:assert/strict';
import { divisionMeasureGroups } from './measures.js';

const site = { asOf: '2026-09-18', windowPolicy: { kind: 'prime', postPrimeYears: 3, citationYears: 3 },
	fullPolicy: { postEndYears: 3, citationYears: 3 }, referenceCost: 150, costBaseYear: 2025 };
const cutoffs = [
	{ percent: 0.1, citations: 1234, papers: 1 }, { percent: 1, citations: 400, papers: 12 }, { percent: 5, citations: 120, papers: 60 },
	{ percent: 10, citations: 70, papers: 121 }, { percent: 25, citations: 30, papers: 300 }, { percent: 50, citations: 9, papers: 1_210 }
];
const stats = { missions: 40, papers: 2400, citations: 30000, mean: 12.5, median: 9, uncited: 240, hIndex: 120, topDecileCitationShare: 0.409, cutoffs };
const flat = (g) => g.rows.map((r) => [r.label, r.value, r.note, !!r.highlight].filter((x) => x !== null && x !== false).join(' | '));

test('divisionMeasureGroups: eight pooled measures, then six highlighted cutoffs', () => {
	const [pooled, cuts] = divisionMeasureGroups({ stats: { full: stats, window: null, lifetime: null } }, 'full', site);
	assert.equal(pooled.heading, 'Active Mission Window');
	assert.deepEqual(flat(pooled), [
		'Missions | 40', 'Tracked publications | 2,400', 'Citations | 30,000', 'Mean citations per publication | 13',
		'Median citations per publication | 9', 'Uncited publications | 240 (10%)', 'h-index | 120',
		'Citations held by the top 10% of papers | 41%'
	]);
	assert.equal(cuts.heading, 'Percentile citation cutoffs · Active Mission Window');
	assert.deepEqual(flat(cuts), [
		'Top 0.1% | 1,234 | 1 paper at or above | true', 'Top 1% | 400 | 12 papers at or above | true',
		'Top 5% | 120 | 60 papers at or above | true', 'Top 10% | 70 | 121 papers at or above | true',
		'Top 25% | 30 | 300 papers at or above | true', 'Top 50% | 9 | 1,210 papers at or above | true'
	]);
	assert.match(cuts.rows[0].hint.text, /^Cutoff: the fewest citations/);
	assert.equal(cuts.rows[0].hint.anchor, 'high-impact');
	assert.match(pooled.rows[7].hint.text, /^The share of all citations/);
});

test('divisionMeasureGroups: a scope without stats leaves both groups empty', () => {
	const groups = divisionMeasureGroups({ stats: { full: stats, window: null, lifetime: null } }, 'window', site);
	assert.deepEqual(groups.map((g) => [g.heading, g.rows.length]), [
		['Prime Mission Window', 0],
		['Percentile citation cutoffs · Prime Mission Window', 0]
	]);
});
