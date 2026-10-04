import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fullQuery, hasReconciliation } from './query.js';

const base = { adsReturned: 0, curatedOut: 0, curatedIn: 0, libraryOut: 0, otherOut: 0, duplicates: 0, final: 0 };

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
