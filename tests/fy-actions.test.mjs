import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFyActions, currentFederalFy } from '../docs/cancellations/js/fy-actions.js';
import { captureWarnings, loadCsv } from './fixtures.mjs';

const FY_COLUMN = 'FY';
const COUNT_COLUMN = 'Cancellations for Convenience Actions';

const DEPLOYED_PATH = 'docs/data/cancellations/cancellations_for_convenience_actions_by_fiscal_year.csv';

/**
 * Build an FY actions row
 * @param {number|string} fy - Fiscal year cell
 * @param {number|string} count - Action count cell
 * @returns {Object} Row shaped like `parseCSV` output
 */
function fyRow(fy, count) {
    return { [FY_COLUMN]: String(fy), [COUNT_COLUMN]: String(count) };
}

// --- currentFederalFy --------------------------------------------------------

test('currentFederalFy names the year a federal FY ends in', () => {
    assert.equal(currentFederalFy(new Date('2026-08-21T00:00:00Z')), 2026);
});

test('currentFederalFy treats September 30 as the last day of the FY', () => {
    assert.equal(currentFederalFy(new Date('2026-09-30T23:59:59Z')), 2026);
});

test('currentFederalFy rolls over on October 1', () => {
    assert.equal(currentFederalFy(new Date('2026-10-01T00:00:00Z')), 2027);
});

test('currentFederalFy keeps December in the next fiscal year', () => {
    assert.equal(currentFederalFy(new Date('2026-12-31T00:00:00Z')), 2027);
});

// --- fromFy slicing ----------------------------------------------------------

test('parseFyActions keeps only fiscal years at or after fromFy', () => {
    const rows = [2018, 2019, 2020, 2021, 2022].map((fy) => fyRow(fy, fy - 2000));

    const series = parseFyActions(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });

    assert.equal(series.length, 3);
    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2021, 2022]
    );
    assert.deepEqual(
        series.map((entry) => entry.count),
        [20, 21, 22]
    );
});

test('parseFyActions defaults fromFy to 2020', () => {
    const rows = [2018, 2019, 2020, 2021, 2022].map((fy) => fyRow(fy, 1));

    const series = parseFyActions(rows, { now: new Date('2026-08-21T00:00:00Z') });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2021, 2022]
    );
});

test('parseFyActions returns the series ascending regardless of file order', () => {
    const rows = [fyRow(2022, 3), fyRow(2020, 1), fyRow(2021, 2)];

    const series = parseFyActions(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2021, 2022]
    );
});

// --- partial flag ------------------------------------------------------------

test('parseFyActions marks only the in-progress fiscal year partial', () => {
    const rows = [2020, 2021, 2022].map((fy) => fyRow(fy, 5));

    const series = parseFyActions(rows, { fromFy: 2020, now: new Date('2022-08-21T00:00:00Z') });

    assert.deepEqual(
        series.map((entry) => entry.partial),
        [false, false, true]
    );
});

test('parseFyActions moves the partial flag when the injected date crosses October 1', () => {
    const rows = [2021, 2022, 2023].map((fy) => fyRow(fy, 5));

    const before = parseFyActions(rows, { fromFy: 2020, now: new Date('2022-09-30T00:00:00Z') });
    const after = parseFyActions(rows, { fromFy: 2020, now: new Date('2022-10-01T00:00:00Z') });

    assert.deepEqual(
        before.filter((entry) => entry.partial).map((entry) => entry.fy),
        [2022]
    );
    assert.deepEqual(
        after.filter((entry) => entry.partial).map((entry) => entry.fy),
        [2023]
    );
});

test('parseFyActions flags nothing partial when the current FY is absent', () => {
    const rows = [2020, 2021].map((fy) => fyRow(fy, 5));

    const series = parseFyActions(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });

    assert.ok(series.every((entry) => entry.partial === false));
});

// --- malformed and blank rows ------------------------------------------------

test('parseFyActions skips an unparseable row with exactly one warning', () => {
    const rows = [fyRow(2020, 9), fyRow('FY2021', 'n/a'), fyRow(2022, 8)];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyActions(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2022]
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /skipped 1 row/);
});

test('parseFyActions counts multiple bad rows in a single warning', () => {
    const rows = [fyRow(2020, 9), fyRow('', '4'), fyRow(2021, '3.5'), fyRow(2022, 8)];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyActions(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2022]
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /skipped 2 row/);
});

test('parseFyActions drops a fully blank row without warning', () => {
    const rows = [fyRow(2020, 9), fyRow('', ''), fyRow(2021, 5)];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyActions(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2021]
    );
    assert.deepEqual(warnings, []);
});

// --- missing columns ---------------------------------------------------------

test('parseFyActions returns [] with one warning when the count column is renamed', () => {
    const rows = [{ [FY_COLUMN]: '2020', 'Convenience Actions': '9' }];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyActions(rows, { now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(series, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Cancellations for Convenience Actions/);
});

test('parseFyActions returns [] with one warning when the FY column is renamed', () => {
    const rows = [{ fiscal_year: '2020', [COUNT_COLUMN]: '9' }];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyActions(rows, { now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(series, []);
    assert.equal(warnings.length, 1);
});

test('parseFyActions returns [] without warning for empty input', () => {
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyActions([], { now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(series, []);
    assert.deepEqual(warnings, []);
});

// --- live CSV smoke ----------------------------------------------------------
//
// Unlike terminations.csv and doge_claims.csv, this file is static rather than
// workflow-refreshed, so the exact figures below are safe to pin.

const LIVE_OPTS = { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') };
const liveRows = loadCsv(DEPLOYED_PATH);
const liveSeries = parseFyActions(liveRows, LIVE_OPTS);

test('live CSV carries the exact expected headers', () => {
    assert.ok(FY_COLUMN in liveRows[0]);
    assert.ok(COUNT_COLUMN in liveRows[0]);
    assert.equal(Object.keys(liveRows[0]).length, 2);
});

test('live CSV yields FY2020–FY2026 with the expected counts', () => {
    assert.equal(liveSeries.length, 7);
    assert.deepEqual(
        liveSeries.map((entry) => entry.fy),
        [2020, 2021, 2022, 2023, 2024, 2025, 2026]
    );
    assert.deepEqual(
        liveSeries.map((entry) => entry.count),
        [9, 5, 8, 2, 8, 74, 28]
    );
});

test('live CSV parses without warnings', () => {
    const warnings = captureWarnings(() => {
        parseFyActions(liveRows, LIVE_OPTS);
    });

    assert.deepEqual(warnings, []);
});

test('live CSV marks FY2026 partial and nothing else', () => {
    assert.deepEqual(
        liveSeries.filter((entry) => entry.partial).map((entry) => entry.fy),
        [2026]
    );
});
