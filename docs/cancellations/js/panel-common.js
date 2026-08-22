/**
 * Panel Common Module
 *
 * Shared plumbing for the cancellations dashboard's panel modules. No DOM, no
 * fetch, no state beyond a warn-once registry, so this module is safe to import
 * from both the browser dashboard and Node test runners.
 *
 * Every panel reads a different upstream CSV, but they share these problems:
 *   - a column the code wants may be missing from the file entirely, which must
 *     degrade to a single warning rather than a thrown error or a wall of noise
 *   - congressional districts arrive as a state column plus a bare zero-padded
 *     district number, in two flavours (place of performance, recipient)
 *   - both carry a USAspending `generated_award_id` that links to the award page
 */

/** Base URL for a USAspending award page */
const USASPENDING_AWARD_BASE = 'https://www.usaspending.gov/award/';

/**
 * Placeholder for a value that is absent
 *
 * Deliberately not 'N/A': `formatCurrency` returns 'N/A' for negative input, so
 * reusing it here would make "no data" and "negative dollars" indistinguishable.
 *
 * @type {string}
 */
export const MISSING = '—';

/**
 * Warn keys already emitted this session
 * @type {Set<string>}
 */
const warnedKeys = new Set();

/**
 * Log a console warning at most once per key per session
 *
 * Data problems here are per-column or per-value-shape, so a row-level loop
 * would otherwise emit the same message hundreds of times.
 *
 * @param {string} key - Dedupe key (column name, unknown value, etc.)
 * @param {string} message - Message to log the first time `key` is seen
 * @returns {void}
 */
export function warnOnce(key, message) {
    if (warnedKeys.has(key)) {
        return;
    }

    warnedKeys.add(key);
    console.warn(message);
}

/**
 * Clear the warn-once registry
 *
 * Exported for tests, which need each case to observe its own warnings.
 *
 * @returns {void}
 */
export function resetWarnings() {
    warnedKeys.clear();
}

/**
 * Read a CSV field as a trimmed string, tolerating missing columns
 *
 * The accessor every derived field goes through — one definition, so both
 * datasets treat absent columns and stray whitespace identically.
 *
 * @param {Object} row - Parsed CSV row
 * @param {string} key - Column name
 * @returns {string} Trimmed value, or '' when absent
 */
export function field(row, key) {
    return String(row?.[key] ?? '').trim();
}

/**
 * Link to an award's USAspending page
 *
 * Both datasets carry `generated_award_id` (the USAspending key), so the URL
 * shape lives here rather than per-dataset.
 *
 * @param {Object} row - Row carrying generated_award_id
 * @returns {string|null} Award page URL, or null when the key is blank
 */
export function usaspendingUrl(row) {
    const id = field(row, 'generated_award_id');
    return id ? USASPENDING_AWARD_BASE + encodeURIComponent(id) : null;
}

/**
 * Check whether a parsed CSV carries a column
 *
 * Tests header presence, not value presence: `parseCSV` gives every row a key
 * for every header, so a column that exists but is empty everywhere still
 * counts as present — and one dropped upstream is absent from every row.
 *
 * @param {Array<Object>} rows - Parsed CSV rows
 * @param {string} name - Column name to look for
 * @returns {boolean} True when the rows carry that header
 */
export function hasColumn(rows, name) {
    return Array.isArray(rows) && rows.length > 0 && name in rows[0];
}

/**
 * Assemble a congressional district code from a state/district column pair
 * @param {Object} row - Parsed CSV row
 * @param {string} stateKey - State column name
 * @param {string} districtKey - District-number column name
 * @returns {string} District code, or '' when either half is missing
 */
function districtFromPair(row, stateKey, districtKey) {
    const state = field(row, stateKey).toUpperCase();
    const number = field(row, districtKey);

    if (!state || !number) {
        return '';
    }

    // Upstream already zero-pads; the pad is defensive against a future source
    // that emits bare integers ("7" rather than "07").
    return `${state}-${number.padStart(2, '0')}`;
}

/**
 * Derive a congressional district code for a row
 *
 * Prefers place of performance — where the work happened is the question the
 * map answers — and falls back to the recipient's own address. Returns '' when
 * neither pair is complete, which is a real state of the data (1 termination
 * row and 4 DOGE claims carry no district at all).
 *
 * District numbers arrive as bare zero-padded strings ('11', '98', '00'); DC's
 * 98 is what the districts geojson uses, so no special-casing is needed.
 *
 * @param {Object} row - Parsed CSV row
 * @returns {string} District code such as 'VA-11' or 'DC-98', or ''
 */
export function districtOf(row) {
    if (!row) {
        return '';
    }

    return (
        districtFromPair(row, 'pop_state', 'pop_district') ||
        districtFromPair(row, 'recipient_state', 'recipient_district')
    );
}
