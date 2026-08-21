/**
 * Shared test fixtures for the cancellations dashboard suites
 *
 * Not matched by the `tests/*.test.mjs` glob, so this file adds no tests of
 * its own.
 */

/**
 * Build a minimal ledger row with sane defaults
 * @param {Object} [overrides] - Column values to override
 * @returns {Object} Ledger row
 */
export function row(overrides = {}) {
    return {
        'Award ID': 'A1',
        Recipient: 'Acme',
        District: 'CA-37',
        Sources: 'NPDV',
        Status: 'listed',
        'Claiming Source': '',
        'Claimed Savings': '',
        'Claim Divergence': '',
        'Amount Trend': 'flat',
        'End Date Trend': 'unchanged',
        'Award Amount': '0.00',
        'Total Outlays': '0.00',
        ...overrides
    };
}

/**
 * Build a mirror-only row — the date-only-evidence shape the Suspicious lens
 * keys on
 * @param {Object} [overrides] - Column values to override
 * @returns {Object} Ledger row sourced solely from the local USAspending mirror
 */
export function mirrorRow(overrides = {}) {
    return row({ Sources: 'LocalUSASpendingMirror', ...overrides });
}

/**
 * Run a function with console.warn captured, restoring it afterwards
 * @param {Function} fn - Code expected to (maybe) warn
 * @returns {Array<string>} Messages passed to console.warn
 */
export function captureWarnings(fn) {
    const original = console.warn;
    const warnings = [];
    console.warn = (message) => warnings.push(message);

    try {
        fn();
    } finally {
        console.warn = original;
    }

    return warnings;
}
