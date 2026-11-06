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
			top10_weight: 0,
			in_window: true
		},
		{
			bibcode: 'A-high',
			year: 2005,
			title: 'High',
			first_author: 'Alpha',
			citations: 500,
			shared_by: 1,
			top10_weight: 1,
			in_window: true
		},
		{
			bibcode: 'C-tie',
			year: 2004,
			title: null,
			first_author: null,
			citations: 5,
			shared_by: 1,
			top10_weight: null,
			in_window: false
		}
	];
	// The full-mission table reuses the window_* field names for its own scope's values.
	const fullRows = new Map([
		['A-high', { bibcode: 'A-high', window_citations: 260, window_top10_weight: 1 }],
		['B-low', { bibcode: 'B-low', window_citations: 140, window_top10_weight: 0 }]
	]);
	const file = buildPapersFile({
		id: 'demo',
		asOf: '2026-09-18',
		lifetimeRows,
		fullRows,
		curatedBibcodes: new Set(['C-tie']),
		fullTop1Cutoff: cutoff,
		pubdates: new Map([['A-high', '2005-03-00'], ['B-low', '2006-00-00']])
	});

	it('sorts by citations descending, then bibcode', () => {
		assert.deepEqual(file.columns.bibcode, ['A-high', 'B-low', 'C-tie']);
	});

	it('writes the columns in the contract order', () => {
		assert.deepEqual(Object.keys(file.columns), ['bibcode', 'year', 'pubdate', 'title', 'first_author', 'citations', 'shared_by', 'full_window_citations', 'top10_weight_full', 'top1_weight_full', 'curated']); // no lifetime top-10% column
	});

	it('describes itself and links the dictionary that defines its columns', () => {
		assert.match(file.about, /Columnar/);
		assert.match(file.dictionary, /^https:\/\/.+\/data\/exports\/dictionary\.json$/);
	});

	it('writes each paper’s ADS pubdate as given, null when unknown', () => {
		assert.deepEqual(file.columns.pubdate, ['2005-03-00', '2006-00-00', null]);
	});

	it('fills the full-mission columns from the full-mission table and its own cutoff', () => {
		assert.deepEqual(file.columns.full_window_citations, [260, 140, null]);
		assert.deepEqual(file.columns.top10_weight_full, [1, 0, null]);
		// 140 is above the 133 cutoff here.
		assert.deepEqual(file.columns.top1_weight_full, [1, 1, null]);
	});

	it('leaves the full-mission columns null when no full-mission table is given', () => {
		const bare = buildPapersFile({
			id: 'demo',
			asOf: '2026-09-18',
			lifetimeRows,
			curatedBibcodes: new Set()
		});
		for (const column of ['full_window_citations', 'top10_weight_full', 'top1_weight_full']) assert.deepEqual(bare.columns[column], [null, null, null]);
	});

	it('keeps every column the same length', () => {
		assert.equal(file.rows, 3);
		for (const values of Object.values(file.columns)) assert.equal(values.length, 3);
		assertColumnLengths(file);
	});

	it('flags papers the query did not return', () => {
		assert.deepEqual(file.columns.curated, [0, 0, 1]);
	});

	it('throws when a column length drifts', () => {
		const broken = { ...file, columns: { ...file.columns, bibcode: ['only-one'] } };
		assert.throws(() => assertColumnLengths(broken), /column "bibcode"/);
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
