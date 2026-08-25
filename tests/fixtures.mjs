/**
 * Shared test fixtures for the cancellations dashboard suites
 *
 * Row builders mirror the upstream CSVs column-for-column, so a suite can
 * override the one field it cares about and trust the rest to look like real
 * data. Every value is a string: `parseCSV` never coerces, so booleans arrive
 * as 'true'/'false' and dollars as '1000000.00'.
 *
 * Not matched by the `tests/*.test.mjs` glob, so this file adds no tests of
 * its own.
 */

import { readFileSync } from 'node:fs';
import { resetWarnings } from '../docs/cancellations/js/panel-common.js';
import { parseCSV } from '../docs/shared/js/utils.js';

let awardSeq = 0;

/**
 * Read and parse a repo-relative CSV with the shared parser
 *
 * Resolved against this module's URL rather than `process.cwd()`, so a suite
 * reads the same file whether the runner was started from the repo root or
 * from `tests/`. The real `parseCSV`, not a split-on-comma stand-in: award
 * descriptions are quoted free text containing commas.
 *
 * @param {string} repoRelativePath - Path relative to the repo root
 * @returns {Array<Object>} Parsed rows
 */
export function loadCsv(repoRelativePath) {
    return parseCSV(readFileSync(new URL(`../${repoRelativePath}`, import.meta.url), 'utf8'));
}

/**
 * Build a terminations.csv row with sane defaults
 *
 * Covers all 27 columns of `docs/data/cancellations/terminations.csv`.
 * `award_id` auto-increments so a set of rows built without overrides is
 * distinct, which the id-set and recipient-count helpers depend on.
 *
 * @param {Object} [overrides] - Column values to override
 * @returns {Object} Termination row
 */
export function terminationRow(overrides = {}) {
    awardSeq += 1;
    const awardId = `80NSSC25FA${String(awardSeq).padStart(3, '0')}`;

    return {
        award_key: `CONT_AWD_${awardId}_8000`,
        award_id: awardId,
        generated_award_id: `CONT_AWD_${awardId}_8000`,
        award_type: 'contract',
        award_type_code: 'C',
        recipient_name: 'Acme Aerospace, LLC',
        action_date: '2025-03-15',
        action_type: 'F',
        modification_number: 'P00001',
        transaction_amount: '-40647.00',
        transaction_description: 'Termination for convenience of the government.',
        award_description: 'RESEARCH SUPPORT SERVICES',
        recipient_address1: '1635 KING ST',
        recipient_address2: '',
        recipient_city: 'MOUNTAIN VIEW',
        recipient_state: 'CA',
        recipient_zip: '94043',
        recipient_district: '16',
        pop_city: 'MOUNTAIN VIEW',
        pop_state: 'CA',
        pop_zip: '94043',
        pop_district: '16',
        total_obligated: '1000000',
        total_potential_value: '2000000',
        detected_by: 'action_code',
        sources: 'api',
        override_status: '',
        ...overrides
    };
}

/**
 * Build a descoped.csv row with sane defaults
 *
 * `descoped.csv` carries the identical 27 columns as `terminations.csv`, so
 * this is `terminationRow` with the descriptions that file actually holds — a
 * stop-work notice rather than a termination — and a blank `override_status`,
 * which is the majority case there. The blank is the point: nothing inside the
 * row says "descoped", so only the file it came from can say so.
 *
 * @param {Object} [overrides] - Column values to override
 * @returns {Object} Descoped row
 */
export function descopedRow(overrides = {}) {
    return terminationRow({
        action_type: 'M',
        transaction_description: 'STOP WORK NOTICE ISSUED WITH NOTIFICATION OF INTENT TO DE-SCOPE.',
        detected_by: 'description',
        override_status: '',
        ...overrides
    });
}

/**
 * Build a doge_claims.csv row with sane defaults
 *
 * Covers all 30 columns of `docs/data/cancellations/doge_claims.csv`. Defaults
 * describe the majority case: a claim matched to a federal award that carries an
 * explicit termination action. `checked_date` is a file-wide snapshot, identical
 * on every row.
 *
 * @param {Object} [overrides] - Column values to override
 * @returns {Object} DOGE claim row
 */
export function dogeClaimRow(overrides = {}) {
    awardSeq += 1;
    const awardId = `80NSSC25K${String(awardSeq).padStart(4, '0')}`;

    return {
        claim_type: 'contract',
        doge_award_id: awardId,
        recipient: 'ACME AEROSPACE, LLC',
        doge_value: '911540',
        doge_savings: '604288',
        doge_claim_date: '2025-09-18',
        doge_status: 'TERMINATED',
        source_url: `https://www.fpds.gov/ezsearch/jsp/viewLinkController.jsp?PIID=${awardId}`,
        usaspending_found: 'true',
        generated_award_id: `CONT_AWD_${awardId}_8000`,
        award_type: 'contract',
        award_type_code: 'C',
        has_explicit_termination: 'true',
        latest_action_date: '2025-05-11',
        latest_action_type: 'F',
        latest_description: 'Termination for convenience of the government.',
        current_obligation: '149834.25',
        current_end_date: '2025-06-06',
        recipient_address1: '169 HOLLAND ST',
        recipient_address2: '',
        recipient_city: 'MOUNTAIN VIEW',
        recipient_state: 'CA',
        recipient_zip: '94043',
        recipient_district: '16',
        pop_city: 'MOUNTAIN VIEW',
        pop_state: 'CA',
        pop_zip: '94043',
        pop_district: '16',
        total_potential_value: '2000000',
        checked_date: '2026-08-20',
        ...overrides
    };
}

/**
 * Copy rows with the named columns removed
 *
 * Simulates a CSV whose headers changed upstream: `parseCSV` gives every row a
 * key for every header, so a dropped column is missing from all rows at once.
 *
 * @param {Array<Object>} rows - Rows to strip
 * @param {Array<string>|string} names - Column name(s) to delete
 * @returns {Array<Object>} New rows without those keys
 */
export function withoutColumns(rows, names) {
    const drop = new Set(Array.isArray(names) ? names : [names]);

    return rows.map((row) => {
        const copy = { ...row };
        for (const name of drop) {
            delete copy[name];
        }
        return copy;
    });
}

/**
 * Run a function with console.warn captured, restoring it afterwards
 *
 * Clears the shared warn-once registry first, so each case sees the warnings it
 * provokes rather than nothing at all because an earlier case got there first.
 *
 * @param {Function} fn - Code expected to (maybe) warn
 * @returns {Array<string>} Messages passed to console.warn
 */
export function captureWarnings(fn) {
    const original = console.warn;
    const warnings = [];

    resetWarnings();
    console.warn = (message) => warnings.push(message);

    try {
        fn();
    } finally {
        console.warn = original;
    }

    return warnings;
}
