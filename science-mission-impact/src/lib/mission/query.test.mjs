import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fullQuery, hasReconciliation, reconciliationSentence } from './query.js';

const base = { adsReturned: 0, curatedOut: 0, curatedIn: 0, libraryOut: 0, otherOut: 0, duplicates: 0, final: 0 };

describe('reconciliationSentence', () => {
	it('reads every adjustment in order', () => {
		assert.equal(
			reconciliationSentence({ ...base, adsReturned: 3388, curatedOut: 22, libraryOut: 5, otherOut: 1, duplicates: 3, curatedIn: 36, final: 3399 }),
			'ADS returns 3,388. Curated out 22, excluded instrument and overview papers 5, other filters 1, duplicates 3, curated in 36: 3,399 tracked publications.'
		);
	});

	it('skips zero terms and keeps the rest in order', () => {
		assert.equal(
			reconciliationSentence({ ...base, adsReturned: 120, curatedOut: 0, libraryOut: 4, otherOut: 0, duplicates: 0, curatedIn: 2, final: 118 }),
			'ADS returns 120. Excluded instrument and overview papers 4, curated in 2: 118 tracked publications.'
		);
	});

	it('drops the middle clause when nothing was added or removed', () => {
		assert.equal(reconciliationSentence({ ...base, adsReturned: 3388, final: 3388 }), 'ADS returns 3,388 tracked publications.');
	});

	it('still states both numbers when all adjustments are zero but the totals differ', () => {
		assert.equal(reconciliationSentence({ ...base, adsReturned: 10, final: 9 }), 'ADS returns 10: 9 tracked publications.');
	});

	it('uses the singular for one publication', () => {
		assert.equal(reconciliationSentence({ ...base, adsReturned: 1, final: 1 }), 'ADS returns 1 tracked publication.');
		assert.equal(
			reconciliationSentence({ ...base, adsReturned: 2, duplicates: 1, final: 1 }),
			'ADS returns 2. Duplicates 1: 1 tracked publication.'
		);
	});

	it('keeps singular adjustment counts as written (the term is a label, not a noun phrase)', () => {
		assert.equal(
			reconciliationSentence({ ...base, adsReturned: 5, curatedOut: 1, final: 4 }),
			'ADS returns 5. Curated out 1: 4 tracked publications.'
		);
	});

	it('drops the ADS lead for a mission that was never queried', () => {
		assert.equal(reconciliationSentence({ ...base, adsReturned: 0, curatedIn: 7, final: 7 }), 'Curated in 7: 7 tracked publications.');
		assert.equal(reconciliationSentence({ ...base, adsReturned: 0, curatedIn: 1, final: 1 }), 'Curated in 1: 1 tracked publication.');
	});

	it('still says so when a real query returned nothing', () => {
		assert.equal(reconciliationSentence({ ...base, adsReturned: 0, final: 0 }), 'ADS returns 0 tracked publications.');
	});

	it('returns null when there is nothing to reconcile', () => {
		assert.equal(reconciliationSentence(null), null);
		assert.equal(reconciliationSentence(undefined), null);
		assert.equal(reconciliationSentence('nope'), null);
	});

	it('treats missing or unparsable fields as zero', () => {
		assert.equal(reconciliationSentence({ adsReturned: 4, final: 4 }), 'ADS returns 4 tracked publications.');
		assert.equal(reconciliationSentence({ adsReturned: '4', curatedOut: null, final: '4' }), 'ADS returns 4 tracked publications.');
	});

	it('adds thousands separators to the adjustments too', () => {
		assert.equal(
			reconciliationSentence({ ...base, adsReturned: 20000, curatedOut: 1200, final: 18800 }),
			'ADS returns 20,000. Curated out 1,200: 18,800 tracked publications.'
		);
	});
});

describe('hasReconciliation', () => {
	it('is false for an all-zero object (a mission that was never queried)', () => {
		assert.equal(hasReconciliation({ ...base }), false);
	});

	it('is false when there is no object', () => {
		assert.equal(hasReconciliation(null), false);
		assert.equal(hasReconciliation(undefined), false);
	});

	it('is true as soon as one field is non-zero', () => {
		assert.equal(hasReconciliation({ ...base, final: 4, curatedIn: 4 }), true);
		assert.equal(hasReconciliation({ ...base, adsReturned: 1 }), true);
		assert.equal(hasReconciliation({ ...base, duplicates: 1 }), true);
	});
});

describe('fullQuery', () => {
	it('rejoins arms and filters with the AND the splitter removed', () => {
		assert.equal(fullQuery({ arms: 'abs:"Cassini"', filters: 'property:refereed AND doctype:article' }), 'abs:"Cassini" AND property:refereed AND doctype:article');
	});

	it('returns whichever half exists on its own', () => {
		assert.equal(fullQuery({ arms: 'abs:"Cassini"', filters: null }), 'abs:"Cassini"');
		assert.equal(fullQuery({ arms: null, filters: 'property:refereed' }), 'property:refereed');
	});

	it('is an empty string when there is no query', () => {
		assert.equal(fullQuery({ arms: null, filters: null }), '');
		assert.equal(fullQuery(null), '');
	});

	it('trims stray whitespace around each half', () => {
		assert.equal(fullQuery({ arms: '  a  ', filters: '  b  ' }), 'a AND b');
	});
});
