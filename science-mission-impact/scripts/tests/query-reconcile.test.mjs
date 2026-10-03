import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { splitQuery } from '../lib/query.mjs';
import { buildReconciliation } from '../lib/reconcile.mjs';

describe('splitQuery', () => {
	it('splits at the first top-level " AND property:refereed"', () => {
		const { arms, filters } = splitQuery(
			'((abs:"GeneSat" OR abs:"GeneSat-1")) AND property:refereed AND doctype:article'
		);
		assert.equal(arms, '((abs:"GeneSat" OR abs:"GeneSat-1"))');
		assert.equal(filters, 'property:refereed AND doctype:article');
	});

	it('ignores the marker while inside parentheses', () => {
		const { arms, filters } = splitQuery(
			'(abs:X AND property:refereed OR abs:Y) AND property:refereed AND doctype:article'
		);
		assert.equal(arms, '(abs:X AND property:refereed OR abs:Y)');
		assert.equal(filters, 'property:refereed AND doctype:article');
	});

	it('ignores the marker inside a quoted phrase', () => {
		const { arms, filters } = splitQuery(
			'abs:"a AND property:refereed b" AND property:refereed AND doctype:article'
		);
		assert.equal(arms, 'abs:"a AND property:refereed b"');
		assert.equal(filters, 'property:refereed AND doctype:article');
	});

	it('puts everything in arms when the pattern is absent', () => {
		const { arms, filters } = splitQuery('abs:Cassini AND doctype:article');
		assert.equal(arms, 'abs:Cassini AND doctype:article');
		assert.equal(filters, null);
	});

	it('gives two nulls for a mission with no query', () => {
		assert.deepEqual(splitQuery(null), { arms: null, filters: null });
		assert.deepEqual(splitQuery('   '), { arms: null, filters: null });
	});
});

describe('buildReconciliation', () => {
	it('includes same-paper duplicates alongside overlapping bibcodes', () => {
		const { reconciliation, balanced } = buildReconciliation({
			ads_count: 10, include_count: 3, duplicates_removed: 1,
			same_paper_duplicates_removed: 2
		}, 10);
		assert.equal(reconciliation.duplicates, 3);
		assert.equal(balanced, true);
	});
	it('closes the identity for the documented merge order', () => {
		// Cassini's real shape: 3388 - 22 curated out - 3 duplicates + 36 curated in = 3399.
		const { reconciliation, balanced } = buildReconciliation(
			{
				ads_count: 3388,
				ads_raw_count: 3388,
				include_count: 36,
				duplicates_removed: 3,
				curation_exclusions_removed: 22,
				library_exclusions_removed: 0,
				news_venue_exclusions_removed: 0,
				doctype_exclusions_removed: 0,
				filtered_count: 3399
			},
			3399
		);
		assert.equal(balanced, true);
		assert.deepEqual(reconciliation, {
			adsReturned: 3388,
			curatedOut: 22,
			curatedIn: 36,
			libraryOut: 0,
			otherOut: 0,
			duplicates: 3,
			final: 3399
		});
	});

	it('folds news-venue and doctype removals into otherOut', () => {
		const { reconciliation, balanced } = buildReconciliation(
			{
				ads_count: 100,
				include_count: 0,
				duplicates_removed: 0,
				curation_exclusions_removed: 1,
				library_exclusions_removed: 2,
				news_venue_exclusions_removed: 3,
				doctype_exclusions_removed: 4
			},
			90
		);
		assert.equal(reconciliation.otherOut, 7);
		assert.equal(balanced, true);
	});

	it('still returns a best-effort object when the identity cannot close', () => {
		const { reconciliation, balanced } = buildReconciliation(
			{ ads_count: 10, include_count: 0, duplicates_removed: 0 },
			7
		);
		assert.equal(balanced, false);
		assert.equal(reconciliation.adsReturned, 10);
		assert.equal(reconciliation.final, 7);
	});

	it('returns null only when there are no merge stats at all', () => {
		assert.deepEqual(buildReconciliation(null, 0), { reconciliation: null, balanced: true });
	});
});
