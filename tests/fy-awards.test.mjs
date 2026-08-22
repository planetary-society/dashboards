import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFyAwards, currentFederalFy } from '../docs/cancellations/js/fy-awards.js';
import { captureWarnings, loadCsv } from './fixtures.mjs';

const FY_COLUMN = 'fiscal_year';
const COUNT_COLUMN = 'action_code_or_keyword_cancellation_awards';

/** The two component columns the chart deliberately does not plot */
const ACTION_CODE_COLUMN = 'action_code_cancellation_awards';
const KEYWORD_COLUMN = 'keyword_cancellation_awards';

const DEPLOYED_PATH = 'docs/data/cancellations/cancellations_for_convenience_awards_by_fiscal_year.csv';

/**
 * Build an FY awards row
 * @param {number|string} fy - Fiscal year cell
 * @param {number|string} count - Award count cell
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

test('parseFyAwards keeps only fiscal years at or after fromFy', () => {
    const rows = [2018, 2019, 2020, 2021, 2022].map((fy) => fyRow(fy, fy - 2000));

    const series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });

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

test('parseFyAwards defaults fromFy to 2020', () => {
    const rows = [2018, 2019, 2020, 2021, 2022].map((fy) => fyRow(fy, 1));

    const series = parseFyAwards(rows, { now: new Date('2026-08-21T00:00:00Z') });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2021, 2022]
    );
});

test('parseFyAwards returns the series ascending regardless of file order', () => {
    const rows = [fyRow(2022, 3), fyRow(2020, 1), fyRow(2021, 2)];

    const series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2021, 2022]
    );
});

// --- column choice -----------------------------------------------------------

test('parseFyAwards plots the union column, not either component column', () => {
    const rows = [{
        [FY_COLUMN]: '2021',
        [ACTION_CODE_COLUMN]: '3',
        [KEYWORD_COLUMN]: '7',
        [COUNT_COLUMN]: '9'
    }];

    const series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });

    assert.equal(series.length, 1);
    assert.equal(series[0].count, 9);
});

// --- partial flag ------------------------------------------------------------

test('parseFyAwards marks only the in-progress fiscal year partial', () => {
    const rows = [2020, 2021, 2022].map((fy) => fyRow(fy, 5));

    const series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2022-08-21T00:00:00Z') });

    assert.deepEqual(
        series.map((entry) => entry.partial),
        [false, false, true]
    );
});

test('parseFyAwards moves the partial flag when the injected date crosses October 1', () => {
    const rows = [2021, 2022, 2023].map((fy) => fyRow(fy, 5));

    const before = parseFyAwards(rows, { fromFy: 2020, now: new Date('2022-09-30T00:00:00Z') });
    const after = parseFyAwards(rows, { fromFy: 2020, now: new Date('2022-10-01T00:00:00Z') });

    assert.deepEqual(
        before.filter((entry) => entry.partial).map((entry) => entry.fy),
        [2022]
    );
    assert.deepEqual(
        after.filter((entry) => entry.partial).map((entry) => entry.fy),
        [2023]
    );
});

test('parseFyAwards flags nothing partial when the current FY is absent', () => {
    const rows = [2020, 2021].map((fy) => fyRow(fy, 5));

    const series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });

    assert.ok(series.every((entry) => entry.partial === false));
});

// --- malformed and blank rows ------------------------------------------------

test('parseFyAwards skips an unparseable row with exactly one warning', () => {
    const rows = [fyRow(2020, 9), fyRow('FY2021', 'n/a'), fyRow(2022, 8)];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2022]
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /skipped 1 row/);
});

test('parseFyAwards counts multiple bad rows in a single warning', () => {
    const rows = [fyRow(2020, 9), fyRow('', '4'), fyRow(2021, '3.5'), fyRow(2022, 8)];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2022]
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /skipped 2 row/);
});

test('parseFyAwards drops a fully blank row without warning', () => {
    const rows = [fyRow(2020, 9), fyRow('', ''), fyRow(2021, 5)];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyAwards(rows, { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(
        series.map((entry) => entry.fy),
        [2020, 2021]
    );
    assert.deepEqual(warnings, []);
});

// --- missing columns ---------------------------------------------------------

test('parseFyAwards returns [] with one warning when the count column is renamed', () => {
    const rows = [{ [FY_COLUMN]: '2020', [ACTION_CODE_COLUMN]: '9' }];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyAwards(rows, { now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(series, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], new RegExp(COUNT_COLUMN));
});

test('parseFyAwards returns [] with one warning when the FY column is renamed', () => {
    const rows = [{ FY: '2020', [COUNT_COLUMN]: '9' }];
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyAwards(rows, { now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(series, []);
    assert.equal(warnings.length, 1);
});

test('parseFyAwards returns [] without warning for empty input', () => {
    let series;

    const warnings = captureWarnings(() => {
        series = parseFyAwards([], { now: new Date('2026-08-21T00:00:00Z') });
    });

    assert.deepEqual(series, []);
    assert.deepEqual(warnings, []);
});

// --- live CSV smoke ----------------------------------------------------------
//
// Shape and invariants only. Every figure in this file — the counts, how many
// fiscal years it covers, where the series starts and ends — moves whenever the
// rollup is regenerated, so nothing below pins one. A data refresh must never
// look like a bug.

const LIVE_OPTS = { fromFy: 2020, now: new Date('2026-08-21T00:00:00Z') };
const liveRows = loadCsv(DEPLOYED_PATH);
const liveSeries = parseFyAwards(liveRows, LIVE_OPTS);

test('live CSV carries the columns the chart reads', () => {
    assert.ok(FY_COLUMN in liveRows[0]);
    assert.ok(COUNT_COLUMN in liveRows[0]);
});

test('live CSV yields fiscal years in ascending order, each one once', () => {
    // A duplicate year would draw two bars on one band; an out-of-order one
    // would put the chart's x-axis out of sequence.
    assert.ok(liveSeries.length > 0);

    const years = liveSeries.map((entry) => entry.fy);

    assert.ok(years[0] >= LIVE_OPTS.fromFy, `series starts at FY${years[0]}`);
    years.forEach((fy, index) => {
        if (index > 0) assert.ok(fy > years[index - 1], `FY${fy} follows FY${years[index - 1]}`);
    });
});

test('every live count is a non-negative integer', () => {
    for (const entry of liveSeries) {
        assert.ok(Number.isInteger(entry.count), `FY${entry.fy} count is not an integer`);
        assert.ok(entry.count >= 0, `FY${entry.fy} count is negative`);
    }
});

test('the plotted column is the union of the two detection methods', () => {
    // An award can carry both an action code and termination language, so the
    // union sits between the larger component and their sum — never outside it.
    // Skipped rather than failed if the component columns ever go away: the
    // chart does not read them, so their absence is not a chart bug.
    if (!(ACTION_CODE_COLUMN in liveRows[0] && KEYWORD_COLUMN in liveRows[0])) {
        return;
    }

    for (const row of liveRows) {
        const byCode = Number(row[ACTION_CODE_COLUMN]);
        const byKeyword = Number(row[KEYWORD_COLUMN]);
        const union = Number(row[COUNT_COLUMN]);

        if (![byCode, byKeyword, union].every(Number.isFinite)) continue;

        assert.ok(union >= Math.max(byCode, byKeyword), `FY${row[FY_COLUMN]} union is below a component`);
        assert.ok(union <= byCode + byKeyword, `FY${row[FY_COLUMN]} union exceeds the component sum`);
    }
});

test('live CSV parses without warnings', () => {
    const warnings = captureWarnings(() => {
        parseFyAwards(liveRows, LIVE_OPTS);
    });

    assert.deepEqual(warnings, []);
});

test('live CSV marks the in-progress fiscal year partial and nothing else', () => {
    const partial = liveSeries.filter((entry) => entry.partial).map((entry) => entry.fy);

    assert.ok(partial.length <= 1);
    for (const fy of partial) {
        assert.equal(fy, currentFederalFy(LIVE_OPTS.now));
    }
});
