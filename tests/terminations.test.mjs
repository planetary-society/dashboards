import test from 'node:test';
import assert from 'node:assert/strict';
import {
    OVERRIDE_META,
    monthlyCounts,
    normalizeTerminations,
    overrideMeta,
    terminationIdSet,
    terminationStats,
    usaspendingUrl
} from '../docs/cancellations/js/terminations.js';
import { captureWarnings, loadCsv, terminationRow, withoutColumns } from './fixtures.mjs';

const TERMINATIONS_PATH = 'docs/data/cancellations/terminations.csv';

/**
 * Normalize a set of fixture rows and return just the rows
 * @param {Array<Object>} rows - Raw rows
 * @returns {Array<Object>} Normalized rows
 */
function normalized(rows) {
    return normalizeTerminations(rows).rows;
}

// --- normalization ----------------------------------------------------------

test('normalizeTerminations parses dollar columns into numbers', () => {
    const [row] = normalized([
        terminationRow({ total_obligated: '$1,234,567.89', total_potential_value: '2000000' })
    ]);

    assert.equal(row._obligated, 1234567.89);
    assert.equal(row._potential, 2000000);
    assert.equal(typeof row._obligated, 'number');
});

test('normalizeTerminations leaves blank dollar values null, not zero', () => {
    const [row] = normalized([
        terminationRow({ total_obligated: '', total_potential_value: '' })
    ]);

    assert.equal(row._obligated, null);
    assert.equal(row._potential, null);
});

test('normalizeTerminations copies the raw row through untouched', () => {
    const [row] = normalized([terminationRow({ recipient_name: 'Acme Labs' })]);

    assert.equal(row.recipient_name, 'Acme Labs');
    assert.equal(row.total_obligated, '1000000');
    assert.equal(row.override_status, '');
});

test('normalizeTerminations assembles the district from place of performance', () => {
    const [row] = normalized([terminationRow({ pop_state: 'VA', pop_district: '11' })]);

    assert.equal(row._district, 'VA-11');
    assert.equal(row._geoid, '5111');
});

test('normalizeTerminations falls back to the recipient district', () => {
    const [row] = normalized([
        terminationRow({
            pop_state: '',
            pop_district: '',
            recipient_state: 'TX',
            recipient_district: '20'
        })
    ]);

    assert.equal(row._district, 'TX-20');
    assert.equal(row._geoid, '4820');
});

test('normalizeTerminations leaves the district empty when neither pair is complete', () => {
    const [row] = normalized([
        terminationRow({
            pop_state: '',
            pop_district: '',
            recipient_state: '',
            recipient_district: ''
        })
    ]);

    assert.equal(row._district, '');
    assert.equal(row._geoid, null);
});

test("normalizeTerminations maps DC's district 98 onto the geojson GEOID", () => {
    const [row] = normalized([terminationRow({ pop_state: 'DC', pop_district: '98' })]);

    assert.equal(row._district, 'DC-98');
    assert.equal(row._geoid, '1198');
});

test('_partial is true for exactly the two partial statuses', () => {
    const partialFor = (status) => normalized([terminationRow({ override_status: status })])[0]._partial;

    assert.equal(partialFor('descoped'), true);
    assert.equal(partialFor('closed_out'), true);
    assert.equal(partialFor(''), false);
    assert.equal(partialFor('still_terminated'), false);
    assert.equal(partialFor('invented_status'), false);
});

test('normalizeTerminations tolerates no rows and non-arrays', () => {
    assert.deepEqual(normalizeTerminations([]), {
        rows: [],
        columns: { districts: false, obligated: false, potential: false }
    });
    assert.deepEqual(normalizeTerminations(undefined).rows, []);
    assert.deepEqual(captureWarnings(() => normalizeTerminations([])), []);
});

// --- column availability -----------------------------------------------------

test('columns reports every expected column present on a full file', () => {
    const { columns } = normalizeTerminations([terminationRow()]);

    assert.deepEqual(columns, { districts: true, obligated: true, potential: true });
    assert.deepEqual(captureWarnings(() => normalizeTerminations([terminationRow()])), []);
});

test('a missing dollar column flips its flag and warns exactly once', () => {
    for (const column of ['total_obligated', 'total_potential_value']) {
        const rows = withoutColumns([terminationRow(), terminationRow(), terminationRow()], column);
        let result;

        const warnings = captureWarnings(() => {
            result = normalizeTerminations(rows);
        });

        assert.equal(warnings.length, 1, column);
        assert.ok(warnings[0].includes(column), warnings[0]);
        assert.equal(result.columns[column === 'total_obligated' ? 'obligated' : 'potential'], false);
        assert.equal(result.rows[0][column === 'total_obligated' ? '_obligated' : '_potential'], null);
    }
});

test('either district column alone keeps the districts flag true and warns nothing', () => {
    for (const dropped of ['pop_district', 'recipient_district']) {
        let result;

        const warnings = captureWarnings(() => {
            result = normalizeTerminations(withoutColumns([terminationRow()], dropped));
        });

        assert.deepEqual(warnings, [], dropped);
        assert.equal(result.columns.districts, true, dropped);
        assert.equal(result.rows[0]._district, 'CA-16', dropped);
    }
});

test('losing both district columns warns once and empties the district', () => {
    const rows = withoutColumns(
        [terminationRow(), terminationRow()],
        ['pop_district', 'recipient_district']
    );
    let result;

    const warnings = captureWarnings(() => {
        result = normalizeTerminations(rows);
    });

    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('district'));
    assert.equal(result.columns.districts, false);
    assert.equal(result.rows[0]._district, '');
    assert.equal(result.rows[0]._geoid, null);
});

test('a file missing every optional column warns once per column and does not throw', () => {
    const rows = withoutColumns(
        [terminationRow()],
        ['pop_district', 'recipient_district', 'total_obligated', 'total_potential_value']
    );
    let result;

    const warnings = captureWarnings(() => {
        result = normalizeTerminations(rows);
    });

    assert.equal(warnings.length, 3);
    assert.deepEqual(result.columns, { districts: false, obligated: false, potential: false });
});

// --- terminationIdSet ---------------------------------------------------------

test('terminationIdSet collects both id namespaces, distinct and non-empty', () => {
    const ids = terminationIdSet([
        terminationRow({ award_id: 'A', generated_award_id: 'CONT_AWD_A' }),
        terminationRow({ award_id: 'A', generated_award_id: 'CONT_AWD_A' }),
        terminationRow({ award_id: 'B', generated_award_id: '' }),
        terminationRow({ award_id: '', generated_award_id: 'ASST_NON_C' }),
        terminationRow({ award_id: '   ', generated_award_id: '   ' }),
        {}
    ]);

    // Both the bare PIID and USAspending's generated key go in, so a consumer
    // matching either namespace needs only this one Set
    assert.deepEqual([...ids].sort(), ['A', 'ASST_NON_C', 'B', 'CONT_AWD_A']);
});

test('terminationIdSet tolerates no rows', () => {
    assert.equal(terminationIdSet([]).size, 0);
    assert.equal(terminationIdSet(undefined).size, 0);
});

// --- terminationStats ---------------------------------------------------------

test('terminationStats splits confirmed rows from partials', () => {
    const { rows, columns } = normalizeTerminations([
        terminationRow(),
        terminationRow({ override_status: 'still_terminated' }),
        terminationRow({ override_status: 'descoped' }),
        terminationRow({ override_status: 'closed_out' })
    ]);

    const stats = terminationStats(rows, columns);

    assert.equal(stats.confirmed, 2);
    assert.equal(stats.partials, 2);
});

test('terminationStats keeps partial dollars out of both totals', () => {
    const { rows, columns } = normalizeTerminations([
        terminationRow({ total_obligated: '100', total_potential_value: '1000' }),
        terminationRow({ total_obligated: '', total_potential_value: '' }),
        terminationRow({
            override_status: 'descoped',
            total_obligated: '194000000',
            total_potential_value: '194000000'
        }),
        terminationRow({
            override_status: 'closed_out',
            total_obligated: '50',
            total_potential_value: '500'
        })
    ]);

    const stats = terminationStats(rows, columns);

    assert.equal(stats.totalObligated, 100);
    assert.equal(stats.totalPotential, 1000);
});

test('terminationStats counts distinct non-empty districts and recipients', () => {
    const { rows, columns } = normalizeTerminations([
        terminationRow({ pop_state: 'CA', pop_district: '37', recipient_name: 'Acme' }),
        terminationRow({ pop_state: 'CA', pop_district: '37', recipient_name: 'Acme' }),
        terminationRow({ pop_state: 'TX', pop_district: '20', recipient_name: 'Beta' }),
        terminationRow({
            pop_state: '',
            pop_district: '',
            recipient_state: '',
            recipient_district: '',
            recipient_name: ''
        })
    ]);

    const stats = terminationStats(rows, columns);

    assert.equal(stats.districts, 2);
    assert.equal(stats.recipients, 2);
});

test('terminationStats counts partial rows towards districts and recipients', () => {
    // A descoped award still sits in a district and still has a recipient; only
    // the headline count and the dollar totals exclude it
    const { rows, columns } = normalizeTerminations([
        terminationRow({
            override_status: 'descoped',
            pop_state: 'FL',
            pop_district: '08',
            recipient_name: 'Bechtel'
        })
    ]);

    const stats = terminationStats(rows, columns);

    assert.equal(stats.confirmed, 0);
    assert.equal(stats.partials, 1);
    assert.equal(stats.districts, 1);
    assert.equal(stats.recipients, 1);
});

test('terminationStats nulls the totals whose column is absent', () => {
    const { rows, columns } = normalizeTerminations(
        withoutColumns(
            [terminationRow()],
            ['pop_district', 'recipient_district', 'total_obligated', 'total_potential_value']
        )
    );

    const stats = terminationStats(rows, columns);

    assert.equal(stats.totalObligated, null);
    assert.equal(stats.totalPotential, null);
    assert.equal(stats.districts, null);
    // Recipients never depend on an optional column
    assert.equal(stats.recipients, 1);
});

test('terminationStats derives the column flags when none are supplied', () => {
    const { rows } = normalizeTerminations([terminationRow({ total_obligated: '25' })]);

    assert.equal(terminationStats(rows).totalObligated, 25);
});

test('terminationStats tolerates no rows', () => {
    const stats = terminationStats([]);

    assert.equal(stats.confirmed, 0);
    assert.equal(stats.partials, 0);
    assert.equal(stats.recipients, 0);
    assert.deepEqual(terminationStats(undefined), stats);
});

// --- monthlyCounts -------------------------------------------------------------

test('monthlyCounts zero-fills the months between the first and last action', () => {
    const { months, skipped } = monthlyCounts([
        terminationRow({ action_date: '2025-01-15' }),
        terminationRow({ action_date: '2025-01-31' }),
        terminationRow({ action_date: '2025-04-02' })
    ]);

    assert.equal(skipped, 0);
    assert.deepEqual(months, [
        { month: '2025-01', count: 2 },
        { month: '2025-02', count: 0 },
        { month: '2025-03', count: 0 },
        { month: '2025-04', count: 1 }
    ]);
});

test('monthlyCounts fills gap months across a year boundary', () => {
    const { months } = monthlyCounts([
        terminationRow({ action_date: '2025-11-01' }),
        terminationRow({ action_date: '2026-02-28' })
    ]);

    assert.deepEqual(months.map((entry) => entry.month), [
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02'
    ]);
});

test('monthlyCounts buckets a date by its UTC calendar month, not the local one', () => {
    // A month-boundary date parsed as local time can land in the previous month
    const { months } = monthlyCounts([terminationRow({ action_date: '2025-03-01' })]);

    assert.deepEqual(months, [{ month: '2025-03', count: 1 }]);
});

test('monthlyCounts reports unparseable dates as skipped', () => {
    const { months, skipped } = monthlyCounts([
        terminationRow({ action_date: '2025-01-05' }),
        terminationRow({ action_date: '' }),
        terminationRow({ action_date: 'sometime' }),
        terminationRow({ action_date: '1/5/2025' }),
        terminationRow({ action_date: '2025-13-05' }),
        terminationRow({ action_date: '2025-02-30' }),
        {}
    ]);

    assert.equal(skipped, 6);
    assert.deepEqual(months, [{ month: '2025-01', count: 1 }]);
});

test('monthlyCounts tolerates no rows', () => {
    assert.deepEqual(monthlyCounts([]), { months: [], skipped: 0 });
    assert.deepEqual(monthlyCounts(undefined), { months: [], skipped: 0 });
});

// --- override badges ------------------------------------------------------------

test('overrideMeta returns the mapped badge for every known status', () => {
    for (const [status, meta] of Object.entries(OVERRIDE_META)) {
        assert.deepEqual(overrideMeta(status), meta, status);
        assert.ok(meta.label.length > 0, status);
    }

    assert.equal(OVERRIDE_META[''].label, 'Terminated');
    // still_terminated is a review-workflow note, not a different outcome:
    // it renders identically to a plain termination (Casey's call, 2026-08-21)
    assert.deepEqual(OVERRIDE_META.still_terminated, OVERRIDE_META['']);
});

test('partial statuses never wear the cancelled badge', () => {
    // The award continues; a red badge would read as a cancellation at a glance
    assert.notEqual(overrideMeta('descoped').badgeClass, 'badge--cancelled');
    assert.notEqual(overrideMeta('closed_out').badgeClass, 'badge--cancelled');
});

test('overrideMeta treats a missing status as the blank one', () => {
    assert.deepEqual(overrideMeta(undefined), OVERRIDE_META['']);
    assert.deepEqual(overrideMeta(null), OVERRIDE_META['']);
    assert.deepEqual(overrideMeta('  '), OVERRIDE_META['']);
});

test('overrideMeta warns once per unknown value and shows it verbatim', () => {
    let meta;

    const warnings = captureWarnings(() => {
        meta = overrideMeta('invented_status');
        overrideMeta('invented_status');
        overrideMeta('another_one');
    });

    assert.deepEqual(meta, { label: 'invented_status', badgeClass: 'badge--excluded' });
    assert.equal(warnings.length, 2);
    assert.ok(warnings[0].includes('invented_status'));
    assert.ok(warnings[1].includes('another_one'));
});

// --- usaspendingUrl --------------------------------------------------------------

test('usaspendingUrl links an award by its generated award id', () => {
    assert.equal(
        usaspendingUrl(terminationRow({ generated_award_id: 'CONT_AWD_ABC_8000' })),
        'https://www.usaspending.gov/award/CONT_AWD_ABC_8000'
    );
});

test('usaspendingUrl is null when the row carries no id', () => {
    assert.equal(usaspendingUrl(terminationRow({ generated_award_id: '' })), null);
    assert.equal(usaspendingUrl(terminationRow({ generated_award_id: '   ' })), null);
    assert.equal(usaspendingUrl({}), null);
    assert.equal(usaspendingUrl(undefined), null);
});

// --- integrity against the deployed CSV --------------------------------------------
//
// terminations.csv is refreshed daily by a workflow that auto-commits, so these
// assert invariants that survive data growth rather than the day's figures.
// Each test names the value observed on 2026-08-21 so drift stays visible.

const live = normalizeTerminations(loadCsv(TERMINATIONS_PATH));
const liveStats = terminationStats(live.rows, live.columns);

test('the deployed file carries every column the panel needs', () => {
    assert.deepEqual(live.columns, { districts: true, obligated: true, potential: true });
});

test('the deployed file holds a full set of rows with unique award ids', () => {
    // 2026-08-21: 177 rows
    assert.ok(live.rows.length >= 100, `rows=${live.rows.length}`);

    const awardIds = live.rows.map((row) => row.award_id);

    for (const id of awardIds) assert.ok(id && id.trim(), 'every row carries an award_id');
    assert.equal(new Set(awardIds).size, awardIds.length, 'award_ids are unique');

    // Two id namespaces per row (PIID + generated key), all distinct
    assert.equal(terminationIdSet(live.rows).size, 2 * live.rows.length);
});

test('confirmed and partial actions partition the deployed file', () => {
    // The headline number is the confirmed count; disclosed partials stay in
    // the table but out of every count and total. 2026-08-21: 172/5
    assert.equal(liveStats.confirmed + liveStats.partials, live.rows.length);
    assert.ok(liveStats.confirmed > liveStats.partials, 'partials stay the rare case');

    const descoped = live.rows.filter((row) => row.override_status === 'descoped');
    const closedOut = live.rows.filter((row) => row.override_status === 'closed_out');

    // The two partial statuses account for every partial, and nothing else
    // 2026-08-21: 3 descoped, 2 closed_out
    assert.equal(descoped.length + closedOut.length, liveStats.partials);
});

test('every deployed action_date is a plain ISO date', () => {
    for (const row of live.rows) {
        assert.match(row.action_date, /^\d{4}-\d{2}-\d{2}$/, row.award_id);
    }

    assert.equal(monthlyCounts(live.rows).skipped, 0);
});

test('every deployed district resolves to a map GEOID', () => {
    // Every district that exists must also resolve to a map GEOID
    for (const row of live.rows) {
        if (row._district) assert.ok(row._geoid, `${row.award_id} ${row._district}`);
    }

    // Districtless rows are the rare exception, not the rule. 2026-08-21: 1 row
    const missing = live.rows.filter((row) => row._district === '');

    assert.ok(missing.length < live.rows.length / 2, `${missing.length} rows without a district`);

    // DC's at-large "98" is not a real CD number; if the file still carries it,
    // it has to land on the geojson GEOID rather than fall out of the map
    for (const row of live.rows.filter((entry) => entry._district === 'DC-98')) {
        assert.equal(row._geoid, '1198');
    }
});

test('confirmed obligations total a positive figure below their potential', () => {
    // 2026-08-21: $2.007B obligated of $2.860B potential
    assert.ok(liveStats.totalObligated > 0, `totalObligated=${liveStats.totalObligated}`);
    assert.ok(liveStats.totalPotential >= liveStats.totalObligated);
});

test('the deployed file names more awards than organizations', () => {
    // Awards are not organizations: copy that says "N organizations lost
    // awards" would be wrong in both directions. 2026-08-21: 136 recipients,
    // 76 districts, 177 rows
    assert.ok(liveStats.recipients > 0);
    assert.ok(liveStats.recipients < live.rows.length);
    assert.ok(liveStats.districts > 0 && liveStats.districts < live.rows.length);
});

test('the deployed file carries only known override_status values', () => {
    const warnings = captureWarnings(() => {
        for (const row of live.rows) overrideMeta(row.override_status);
    });

    assert.deepEqual(warnings, []);
});

test('monthlyCounts over the deployed file is continuous and accounts for every row', () => {
    const { months, skipped } = monthlyCounts(live.rows);
    const counted = months.reduce((sum, entry) => sum + entry.count, 0);

    assert.equal(counted + skipped, live.rows.length);
    assert.ok(months.length > 0);

    for (const [index, entry] of months.entries()) {
        assert.match(entry.month, /^\d{4}-\d{2}$/);
        if (index > 0) assert.ok(entry.month > months[index - 1].month);
    }

    const [firstYear, firstMonth] = months[0].month.split('-').map(Number);
    const [lastYear, lastMonth] = months.at(-1).month.split('-').map(Number);

    assert.equal(months.length, lastYear * 12 + lastMonth - (firstYear * 12 + firstMonth) + 1);

    // The dormant stretch is real data, not a plotting artifact: zero-filled
    // months must survive into the series
    assert.ok(months.some((entry) => entry.count === 0));
});

test('every deployed row links to a USAspending award page', () => {
    for (const row of live.rows) {
        assert.match(usaspendingUrl(row), /^https:\/\/www\.usaspending\.gov\/award\/.+/, row.award_id);
    }
});
