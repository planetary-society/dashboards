import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { assertColumnLengths, buildPapersFile, top1Weight, topPapers } from '../lib/papers.mjs';

const cutoff = { cutoff_citations: 133, tie_weight_at_cutoff: 0.47 };

describe('top1Weight', () => {
	it('scores 1 above the cutoff, the tie weight at it, and 0 below', () => {
		assert.equal(top1Weight(200, cutoff), 1);
		assert.equal(top1Weight(133, cutoff), 0.47);
		assert.equal(top1Weight(10, cutoff), 0);
	});

	it('is null without a citation count or a cutoff', () => {
		assert.equal(top1Weight(null, cutoff), null);
		assert.equal(top1Weight(10, null), null);
	});
});

describe('buildPapersFile', () => {
	const lifetimeRows = [
		{
			bibcode: 'B-low',
			year: 2006,
			title: 'Low',
			first_author: 'Beta',
			citations: 5,
			shared_by: 2,
			cohort_top10_weight: 0,
			in_window: true
		},
		{
			bibcode: 'A-high',
			year: 2005,
			title: 'High',
			first_author: 'Alpha',
			citations: 500,
			shared_by: 1,
			cohort_top10_weight: 1,
			in_window: true
		},
		{
			bibcode: 'C-tie',
			year: 2004,
			title: null,
			first_author: null,
			citations: 5,
			shared_by: 1,
			cohort_top10_weight: null,
			in_window: false
		}
	];
	const windowRows = new Map([
		['A-high', { bibcode: 'A-high', window_citations: 200, window_cohort_top10_weight: 1 }],
		['B-low', { bibcode: 'B-low', window_citations: 133, window_cohort_top10_weight: 0 }]
	]);
	// The full-mission table reuses the window_* field names for its own scope's values.
	const fullRows = new Map([
		['A-high', { bibcode: 'A-high', window_citations: 260, window_cohort_top10_weight: 1 }],
		['B-low', { bibcode: 'B-low', window_citations: 140, window_cohort_top10_weight: 0 }]
	]);
	const file = buildPapersFile({
		id: 'demo',
		asOf: '2026-09-18',
		lifetimeRows,
		windowRows,
		fullRows,
		curatedBibcodes: new Set(['C-tie']),
		top1Cutoff: cutoff,
		fullTop1Cutoff: cutoff
	});

	it('sorts by citations descending, then bibcode', () => {
		assert.deepEqual(file.columns.b, ['A-high', 'B-low', 'C-tie']);
	});

	it('writes the columns in the contract order', () => {
		assert.deepEqual(Object.keys(file.columns), ['b', 'y', 't', 'a', 'c', 's', 'e', 'f', 'fe', 'f1', 'w', 'we', 'w1', 'i']);
	});

	it('fills the full-mission columns from the full-mission table and its own cutoff', () => {
		assert.deepEqual(file.columns.f, [260, 140, null]);
		assert.deepEqual(file.columns.fe, [1, 0, null]);
		// 140 is above the 133 cutoff here, while the same paper's 133 window citations only tie it.
		assert.deepEqual(file.columns.f1, [1, 1, null]);
	});

	it('leaves the full-mission columns null when no full-mission table is given', () => {
		const bare = buildPapersFile({
			id: 'demo',
			asOf: '2026-09-18',
			lifetimeRows,
			windowRows,
			curatedBibcodes: new Set(),
			top1Cutoff: cutoff
		});
		for (const column of ['f', 'fe', 'f1']) assert.deepEqual(bare.columns[column], [null, null, null]);
		assert.deepEqual(bare.columns.w, [200, 133, null]);
	});

	it('keeps every column the same length', () => {
		assert.equal(file.rows, 3);
		for (const values of Object.values(file.columns)) assert.equal(values.length, 3);
		assertColumnLengths(file);
	});

	it('derives the window top-1% weight from the pooled window cutoff', () => {
		assert.deepEqual(file.columns.w1, [1, 0.47, null]);
	});

	it('leaves window columns null for papers outside the cohort', () => {
		assert.deepEqual(file.columns.w, [200, 133, null]);
		assert.deepEqual(file.columns.we, [1, 0, null]);
	});

	it('keeps a null era-adjusted weight distinct from a measured zero', () => {
		assert.deepEqual(file.columns.e, [1, 0, null]);
	});

	it('flags papers the query did not return', () => {
		assert.deepEqual(file.columns.i, [0, 0, 1]);
	});

	it('throws when a column length drifts', () => {
		const broken = { ...file, columns: { ...file.columns, b: ['only-one'] } };
		assert.throws(() => assertColumnLengths(broken), /column "b"/);
	});
});

describe('topPapers', () => {
	const row = (mission, bibcode, window_citations) => ({ mission, bibcode, title: bibcode, first_author: 'A', year: 2000, citations: 999, window_citations });

	it('ranks each paper once by its highest count and lists the missions sharing it', () => {
		const rows = [row('B', 'p1', 5), row('A', 'p1', 9), row('A', 'p2', 9), row('C', 'p3', 20), row('A', 'p4', 1)];
		const top = topPapers(rows, 'window_citations', 3);
		assert.deepEqual(top.map((p) => [p.bibcode, p.citations, p.missions]), [
			['p3', 20, ['C']],
			['p1', 9, ['A', 'B']],
			['p2', 9, ['A']]
		]);
	});
});
