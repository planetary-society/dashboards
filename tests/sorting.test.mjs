import test from 'node:test';
import assert from 'node:assert/strict';
import * as panelCommon from '../docs/cancellations/js/panel-common.js';

test('grouped counts sort by award count descending, then district name ascending', () => {
    assert.equal(typeof panelCommon.sortGroupedCounts, 'function');

    const rows = [
        ['TX-07', 3],
        ['CA-16', 1],
        ['NY-13', 1],
        ['CA-36', 3],
        ['CA-14', 3]
    ];

    assert.deepEqual(panelCommon.sortGroupedCounts(rows), [
        ['CA-14', 3],
        ['CA-36', 3],
        ['TX-07', 3],
        ['CA-16', 1],
        ['NY-13', 1]
    ]);
    assert.deepEqual(rows[0], ['TX-07', 3], 'the source rows stay unchanged');
});

test('awards sort by action date descending across terminated and descoped rows', () => {
    assert.equal(typeof panelCommon.sortAwardsByActionDateDesc, 'function');

    const rows = [
        { award_id: 'T-OLD', action_date: '2025-01-15', _status: 'TERMINATED' },
        { award_id: 'T-NEW', action_date: '2025-05-20', _status: 'TERMINATED' },
        { award_id: 'D-MID', action_date: '2025-03-10', _status: 'DESCOPED' }
    ];

    assert.deepEqual(
        panelCommon.sortAwardsByActionDateDesc(rows).map((row) => row.award_id),
        ['T-NEW', 'D-MID', 'T-OLD']
    );
    assert.equal(rows[0].award_id, 'T-OLD', 'the shared panel rows stay unchanged');
});
