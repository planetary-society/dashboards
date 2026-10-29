import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipSpan } from './perdollar.js';

test('a line is cut where it leaves the rate domain, never bent', () => {
	// log rate = 1 + log cost: inside [10, 1000] only for log costs 0 to 2
	assert.deepEqual(clipSpan({ intercept: 1, slope: 1 }, [-1, 3], [10, 1000]), [0, 2]);
	// log rate = 3 − log cost: inside [10, 100] only for log costs 1 to 2
	assert.deepEqual(clipSpan({ intercept: 3, slope: -1 }, [0, 1.5], [10, 100]), [1, 1.5]);
	assert.deepEqual(clipSpan({ intercept: 2, slope: 0 }, [-1, 3], [10, 1000]), [-1, 3]);
	assert.equal(clipSpan({ intercept: 5, slope: 1 }, [0, 1], [10, 1000]), null);
});
