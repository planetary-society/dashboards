/**
 * FY Awards Module
 *
 * Pure reader for `cancellations_for_convenience_awards_by_fiscal_year.csv`, a
 * rollup of NASA awards terminated for convenience across all of NASA, one row
 * per federal fiscal year, zero-filled from FY2010 to the current one.
 *
 * The file carries a single count column: distinct awards the tracker has
 * adjudicated as terminated for convenience — reversed and vacated terminations
 * cleared, terminations for cause excluded, human overrides and de-scope routing
 * applied — each award counted once, in the fiscal year of the transaction that
 * terminated it.
 *
 * It is a wider universe than the Confirmed Cancellations panel: it covers all
 * of NASA and every administration, and its fiscal years start on October 1
 * rather than at the January 20, 2025 cut. That qualifier is stated in the About
 * tab and in the chart's aria-label; this module's only jobs are to read the two
 * columns it needs, drop rows it cannot trust, and flag the fiscal year not yet
 * finished.
 *
 * No DOM, no fetch — safe to import from Node test runners.
 */

import { warnOnce, hasColumn } from './panel-common.js';

/**
 * Fiscal-year column header, exactly as upstream writes it
 * @type {string}
 */
const FY_COLUMN = 'fiscal_year';

/** Award-count column header, exactly as upstream writes it @type {string} */
const COUNT_COLUMN = 'terminated_awards';

/**
 * Zero-based month in which a US federal fiscal year begins (October)
 * @type {number}
 */
const FY_START_MONTH = 9;

/**
 * Parse a CSV cell as a finite integer
 *
 * Deliberately stricter than `parseInt`, which happily reads '2026-08' as 2026
 * and 'FY2025' as NaN-then-silence. Anything that is not wholly an integer is
 * rejected so the caller can count it as a skipped row.
 *
 * @param {string|number|null|undefined} value - Raw cell value
 * @returns {number|null} The integer, or null when the cell is not one
 */
function parseInteger(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();

    if (text === '') {
        return null;
    }

    const parsed = Number(text);

    return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Check whether every value in a row is empty
 *
 * A CSV that ends in a stray newline can parse to one all-empty row. That is a
 * file artifact rather than bad data, so it is dropped without a warning —
 * warning about it would train readers to ignore the message that matters.
 *
 * @param {Object} row - Parsed CSV row
 * @returns {boolean} True when no column carries a value
 */
function isBlankRow(row) {
    return Object.values(row).every((value) => {
        return value === null || value === undefined || String(value).trim() === '';
    });
}

/**
 * Determine the US federal fiscal year containing a date
 *
 * Federal fiscal years start on October 1 and are named for the calendar year
 * they end in, so October–December belong to the *next* year's FY. UTC accessors
 * are used throughout: the answer must not depend on the reader's time zone, and
 * tests must be able to pin it.
 *
 * @param {Date} [now] - Date to place; defaults to the current moment
 * @returns {number} Federal fiscal year, e.g. 2027 for 2026-10-01
 */
export function currentFederalFy(now = new Date()) {
    const year = now.getUTCFullYear();

    return now.getUTCMonth() >= FY_START_MONTH ? year + 1 : year;
}

/**
 * Read the FY awards CSV into chart-ready rows
 *
 * Returns an ascending series so the chart can render it without re-sorting.
 * Degrades rather than throws: a renamed column yields an empty series and one
 * warning, and unparseable rows are counted and summarised in a single warning
 * rather than one per row.
 *
 * @param {Array<Object>} rawRows - Rows from `parseCSV`
 * @param {Object} [options] - Reader options
 * @param {number} [options.fromFy] - Earliest fiscal year to keep (inclusive)
 * @param {Date} [options.now] - Date used to decide which FY is still in progress
 * @returns {Array<{fy: number, count: number, partial: boolean}>} Ascending by fy
 */
export function parseFyAwards(rawRows, { fromFy = 2020, now = new Date() } = {}) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return [];
    }

    if (!hasColumn(rawRows, FY_COLUMN) || !hasColumn(rawRows, COUNT_COLUMN)) {
        warnOnce(
            'fy-awards:columns',
            `FY awards CSV is missing "${FY_COLUMN}" or "${COUNT_COLUMN}" — the fiscal-year chart will be empty.`
        );

        return [];
    }

    const activeFy = currentFederalFy(now);
    const parsed = [];
    let skipped = 0;

    for (const row of rawRows) {
        if (isBlankRow(row)) {
            continue;
        }

        const fy = parseInteger(row[FY_COLUMN]);
        const count = parseInteger(row[COUNT_COLUMN]);

        if (fy === null || count === null) {
            skipped += 1;
            continue;
        }

        if (fy < fromFy) {
            continue;
        }

        parsed.push({ fy, count, partial: fy === activeFy });
    }

    if (skipped > 0) {
        warnOnce(
            'fy-awards:rows',
            `FY awards CSV: skipped ${skipped} row(s) with an unparseable fiscal year or award count.`
        );
    }

    return parsed.sort((a, b) => a.fy - b.fy);
}
