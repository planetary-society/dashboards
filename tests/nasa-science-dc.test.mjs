import test from 'node:test';
import assert from 'node:assert/strict';
import { createScienceValueBoxes } from '../docs/shared/js/components/value-box.js';

test('NASA Science value boxes use supplied geography totals instead of hardcoded 50 and 435', () => {
    const boxes = createScienceValueBoxes({
        recentFY: 2025,
        recentFYSpending: '$1.0B',
        statesCount: 51,
        totalStateGeographies: 51,
        districtsReached: 436,
        totalDistrictGeographies: 436,
        percentDistricts: 100
    });

    assert.equal(boxes[1].value, '51 of 51');
    assert.equal(boxes[2].value, '436 of 436');
});
