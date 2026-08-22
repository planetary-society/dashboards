/**
 * FY Actions Module
 *
 * Pure reader for `cancellations_for_convenience_actions_by_fiscal_year.csv`, a
 * two-column FPDS rollup of termination-for-convenience *contract* actions
 * across all of NASA, one row per federal fiscal year (FY2010–FY2026).
 *
 * This is a different universe from the Confirmed Cancellations panel's own
 * table: it is contracts-only, it covers all administrations, and it counts
 * actions rather than awards. The chart that renders these numbers says so in
 * its own SVG; this module's only jobs are to read the two columns, drop rows it
 * cannot trust, and flag the fiscal year that has not finished yet.
 *
 * No DOM, no fetch — safe to import from Node test runners.
 */

import { warnOnce, hasColumn } from './panel-common.js';

/**
 * Fiscal-year column header, exactly as upstream writes it
 * @type {string}
 */
const FY_COLUMN = 'FY';

/**
 * Action-count column header, exactly as upstream writes it
 * @type {string}
 */
const COUNT_COLUMN = 'Cancellations for Convenience Actions';

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
 * Read the FY actions CSV into chart-ready rows
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
export function parseFyActions(rawRows, { fromFy = 2020, now = new Date() } = {}) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return [];
    }

    if (!hasColumn(rawRows, FY_COLUMN) || !hasColumn(rawRows, COUNT_COLUMN)) {
        warnOnce(
            'fy-actions:columns',
            `FY actions CSV is missing "${FY_COLUMN}" or "${COUNT_COLUMN}" — the fiscal-year chart will be empty.`
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
            'fy-actions:rows',
            `FY actions CSV: skipped ${skipped} row(s) with an unparseable fiscal year or action count.`
        );
    }

    return parsed.sort((a, b) => a.fy - b.fy);
}
