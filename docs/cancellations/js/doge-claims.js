/**
 * DOGE Claims Module
 *
 * Pure derivation over `docs/data/cancellations/doge_claims.csv` (112 rows, 30
 * columns). No DOM, no fetch, no state, so this module is safe to import from
 * both the browser dashboard and Node test runners.
 *
 * The panel's job is to hold DOGE's claims next to what the federal record
 * actually shows. Each row carries two accounts of the same award:
 *   - what DOGE published — `doge_status`, `doge_savings`, `doge_claim_date`
 *   - what USAspending's transaction history says — `usaspending_found`,
 *     `has_explicit_termination`, `current_end_date`, checked file-wide on
 *     `checked_date`
 *
 * `claimOutcome` reduces the second account to four values, and the panel
 * always shows those rather than DOGE's own label: 15 of the 24 awards DOGE
 * called "Expired" carry explicit termination actions, and one it called
 * "TERMINATED" merely reached its end date. The badge follows the record.
 *
 * `checked_date` is one file-wide snapshot, not a per-row observation — every
 * row in a given file carries the same value.
 */

import { parseCurrency, parseIsoDateUTC } from '../../shared/js/utils.js';
import { districtOf, field, hasColumn } from './panel-common.js';

/**
 * The four claim outcomes, in display order
 *
 * The panel table shows all four; the summary bar aggregates the middle two
 * (see BAR_SEGMENTS).
 *
 * @type {string[]}
 */
export const OUTCOME_ORDER = ['terminated', 'ended', 'active', 'unmatched'];

/**
 * Display metadata for each claim outcome
 *
 * Carries both altitudes so the bar and the table cannot drift apart:
 *   - `label` is the bar/legend wording, deliberately shared by 'ended' and
 *     'active' because both mean the same thing about the federal record —
 *     no termination action was found
 *   - `short` is the table badge, where the ended/active distinction is worth
 *     the extra word
 *   - `description` is printed as visible text, never a `title=` tooltip; the
 *     ended/active difference is invisible otherwise
 *   - `segment` names the bar segment the outcome rolls up into, so a badge can
 *     reuse the segment's swatch colour without a second mapping
 *
 * @type {Object<string, {label: string, short: string, description: string, segment: string}>}
 */
export const OUTCOME_META = {
    // `badgeClass` puts outcomes in the same .badge family the terminations
    // panel wears, so a DOGE award renders exactly like any other award:
    // cancelled-red only when the federal record shows a termination, the
    // neutral badge otherwise (the short text carries the distinction).
    terminated: {
        label: 'Termination on record',
        short: 'Terminated',
        description: "A termination action appears in the award's federal transaction history.",
        segment: 'terminated',
        badgeClass: 'badge--cancelled'
    },
    ended: {
        label: 'No termination found',
        short: 'Ended',
        description: 'Reached its scheduled end date; no termination action recorded.',
        segment: 'noTermination',
        badgeClass: 'badge--excluded'
    },
    active: {
        label: 'No termination found',
        short: 'Active',
        description: 'Award still active as of the last check; no termination action recorded.',
        segment: 'noTermination',
        badgeClass: 'badge--excluded'
    },
    unmatched: {
        label: 'Not in federal records',
        short: 'Not found',
        description: 'Could not be matched to any award in federal spending records.',
        segment: 'unmatched',
        badgeClass: 'badge--excluded'
    }
};

/**
 * The three summary-bar segments, strongest evidence first
 *
 * 'ended' and 'active' collapse into `noTermination`: the bar answers "did the
 * record show a termination?", which is a three-way question. The four-way
 * detail survives in the table.
 *
 * @type {string[]}
 */
export const BAR_SEGMENTS = ['terminated', 'noTermination', 'unmatched'];

/**
 * Display metadata for the three-segment summary bar
 *
 * Validated red ordinal ramp — passes all-pairs CVD in both themes via the
 * dataviz validate_palette.js; the legend's printed counts and the panel table
 * are what relieve the light-end contrast WARN — if either is dropped this
 * becomes a hard fail; do not re-derive without re-running the validator.
 *
 * The hexes live in CSS against these class names (added in a later phase):
 * `seg--outcome-strong` #991B1B, `seg--outcome-mid` #DC2626,
 * `seg--outcome-weak` #F87171.
 *
 * @type {Object<string, {label: string, description: string, segClass: string}>}
 */
export const SEGMENT_META = {
    terminated: {
        label: 'Termination on record',
        description: OUTCOME_META.terminated.description,
        segClass: 'seg--outcome-strong'
    },
    noTermination: {
        label: 'No termination found',
        description: 'Matched to a federal award, but no termination action was recorded.',
        segClass: 'seg--outcome-mid'
    },
    unmatched: {
        label: 'Not in federal records',
        description: OUTCOME_META.unmatched.description,
        segClass: 'seg--outcome-weak'
    }
};

/**
 * Uppercase tokens that stay uppercase through sentence-casing
 *
 * Without this, DOGE's 'NOT FOUND IN FPDS' would render as 'Not found in fpds'.
 *
 * @type {Set<string>}
 */
const ACRONYMS = new Set(['FPDS', 'NASA', 'DOGE', 'IDV', 'IDIQ']);

/**
 * Label used when DOGE published no status for a claim
 * @type {string}
 */
const NO_STATUS_LABEL = 'Not stated';

/**
 * Re-case an ALL-CAPS status for display, leaving mixed-case values untouched
 *
 * DOGE's feed mixes shouting FPDS action descriptions ('FUNDING ONLY ACTION')
 * with ordinary words ('Expired'). Only the former are re-cased: a value that
 * already carries lowercase letters was written by a human who chose that
 * casing, and rewriting it would be a guess.
 *
 * @param {string} value - Trimmed status text
 * @returns {string} Sentence-cased text, or the input unchanged
 */
function normalizeStatusCase(value) {
    if (value !== value.toUpperCase()) {
        return value;
    }

    const lowered = value
        .toLowerCase()
        .replace(/[a-z]+/g, (word) => (ACRONYMS.has(word.toUpperCase()) ? word.toUpperCase() : word));

    return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/**
 * Build the display label for a row's DOGE-stated status
 *
 * @param {Object} row - DOGE claim row
 * @returns {string} e.g. 'Terminated', 'Funding only action', 'Expired', 'Not stated'
 */
export function statusLabel(row) {
    const raw = field(row, 'doge_status');

    return raw ? normalizeStatusCase(raw) : NO_STATUS_LABEL;
}

/**
 * Classify what the federal record shows for a claimed award
 *
 * The rule order matters and is not a preference ranking — each step answers a
 * question the next one presumes:
 *   1. no matched award at all, so there is no record to read
 *   2. the record carries an explicit termination action (the strongest
 *      evidence, and what the panel counts as a confirmed termination)
 *   3. no termination action, but the period of performance ran out before the
 *      check date, so the award ended on its own schedule
 *   4. no termination action and still inside its period of performance
 *
 * Both dates are ISO 'YYYY-MM-DD', so a lexicographic comparison is also the
 * chronological one; `parseIsoDateUTC` is used only to reject blanks and
 * non-calendar values, since a blank string sorts before every real date and
 * would otherwise read as "ended".
 *
 * @param {Object} row - DOGE claim row
 * @returns {'terminated'|'ended'|'active'|'unmatched'} Outcome bucket
 */
export function claimOutcome(row) {
    if (field(row, 'usaspending_found') !== 'true') {
        return 'unmatched';
    }

    if (field(row, 'has_explicit_termination') === 'true') {
        return 'terminated';
    }

    const endDate = field(row, 'current_end_date');
    const checkedDate = field(row, 'checked_date');

    if (parseIsoDateUTC(endDate) !== null && parseIsoDateUTC(checkedDate) !== null && endDate < checkedDate) {
        return 'ended';
    }

    return 'active';
}

/**
 * Read a row's claimed savings as a number
 *
 * Prefers the value `normalizeDogeClaims` attached; ad-hoc rows and test
 * fixtures fall back to the raw column. Nullish-coalescing rather than `||`,
 * because 0 is a real and common value here — 62 of the 112 claims list no
 * savings figure, and every one of them says so with a literal '0'.
 *
 * @param {Object} row - DOGE claim row
 * @returns {number|null} Claimed savings, or null when the column is blank
 */
function savingsOf(row) {
    return row?._savings ?? parseCurrency(field(row, 'doge_savings'));
}

/**
 * Read a row's outcome, deriving it when it was not precomputed
 * @param {Object} row - DOGE claim row
 * @returns {'terminated'|'ended'|'active'|'unmatched'} Outcome bucket
 */
function outcomeOf(row) {
    return row?._outcome || claimOutcome(row);
}

/**
 * Normalize parsed doge_claims.csv rows for the panel
 *
 * Derives everything the views need once, so no downstream module re-parses a
 * currency string or re-derives an outcome. Rows are copied rather than mutated
 * in place; the underscore prefix marks fields that are ours, not upstream's.
 *
 * @param {Array<Object>} rawRows - Rows from `parseCSV`
 * @returns {{rows: Array<Object>, columns: {popDistrict: boolean,
 *   recipientDistrict: boolean, district: boolean, totalPotentialValue: boolean}}}
 *   Normalized rows plus availability flags for the optional columns
 */
export function normalizeDogeClaims(rawRows) {
    const list = Array.isArray(rawRows) ? rawRows : [];

    const popDistrict = hasColumn(list, 'pop_state') && hasColumn(list, 'pop_district');
    const recipientDistrict = hasColumn(list, 'recipient_state') && hasColumn(list, 'recipient_district');

    const rows = list.map((row) => ({
        ...row,
        _savings: parseCurrency(field(row, 'doge_savings')),
        _value: parseCurrency(field(row, 'doge_value')),
        _obligation: parseCurrency(field(row, 'current_obligation')),
        _district: districtOf(row),
        _recipient: field(row, 'recipient'),
        _statusLabel: statusLabel(row),
        _outcome: claimOutcome(row)
    }));

    return {
        rows,
        columns: {
            popDistrict,
            recipientDistrict,
            district: popDistrict || recipientDistrict,
            totalPotentialValue: hasColumn(list, 'total_potential_value')
        }
    };
}

/**
 * Count rows per summary-bar segment
 *
 * Zero-filled across every segment in BAR_SEGMENTS, so the bar builder can read
 * all three keys without guarding. On the live file this is 89 / 19 / 4.
 *
 * @param {Array<Object>} rows - DOGE claim rows
 * @returns {{terminated: number, noTermination: number, unmatched: number}} Segment counts
 */
export function outcomeMix(rows) {
    const mix = Object.fromEntries(BAR_SEGMENTS.map((segment) => [segment, 0]));

    for (const row of rows || []) {
        mix[OUTCOME_META[outcomeOf(row)].segment]++;
    }

    return mix;
}

/**
 * Compute raw summary statistics over DOGE claim rows
 *
 * All values are unformatted numbers; callers decide on presentation. The
 * savings figures exist to be shown together — `claimedSavings` alone overstates
 * what DOGE demonstrated, since `claimedOnActive` sits on awards the record
 * still shows as running and `noFigureCount` claims carry no figure at all.
 *
 * "No figure" covers both a blank cell and a literal zero: upstream writes '0'
 * for a claim DOGE published without a savings number, and treating that as a
 * real $0 saving would put 62 of 112 claims into an average that means nothing.
 *
 * @param {Array<Object>} rows - DOGE claim rows
 * @returns {{count: number, claimedSavings: number, claimedOnActive: number,
 *   noFigureCount: number, terminated: number, unmatched: number, checkedDate: string}}
 *   Summary statistics
 */
export function dogeStats(rows) {
    const list = rows || [];
    let claimedSavings = 0;
    let claimedOnActive = 0;
    let noFigureCount = 0;
    let terminated = 0;
    let unmatched = 0;
    let expiredButTerminated = 0;
    let checkedDate = '';

    for (const row of list) {
        const savings = savingsOf(row);
        const outcome = outcomeOf(row);

        if (savings === null || savings === 0) {
            noFigureCount++;
        } else {
            claimedSavings += savings;
            if (outcome === 'active') claimedOnActive += savings;
        }

        if (outcome === 'terminated') {
            terminated++;
            // DOGE listed the award as merely expired, but the federal record
            // shows an explicit termination — the badge follows the record,
            // and the outcome card states how often the two disagree.
            if (field(row, 'doge_status').toLowerCase() === 'expired') {
                expiredButTerminated++;
            }
        }
        if (outcome === 'unmatched') unmatched++;

        // ISO 'YYYY-MM-DD', so a lexicographic max is the chronological max.
        // One file-wide snapshot in practice; the max guards against a future
        // file assembled from more than one check.
        const checked = field(row, 'checked_date');
        if (checked > checkedDate) checkedDate = checked;
    }

    return {
        count: list.length,
        claimedSavings,
        claimedOnActive,
        noFigureCount,
        terminated,
        unmatched,
        expiredButTerminated,
        checkedDate
    };
}

/**
 * Count claims that also appear as confirmed terminations
 *
 * The two files key awards differently: terminations.csv carries both a bare
 * PIID (`award_id`) and the long USAspending key (`generated_award_id` /
 * `award_key`), while a DOGE claim carries the bare PIID as `doge_award_id` and
 * the long key as `generated_award_id`. Rather than dictate which one the
 * caller's Set holds, each row is tested on both of its keys — the two
 * namespaces cannot collide, so this cannot double-count, and it verifies
 * against the live files at 88 of 112 whichever key `terminationIdSet` chose.
 * (A PIID-keyed Set matches on `doge_award_id`; a long-key Set matches on
 * `generated_award_id`. Both give 88.)
 *
 * @param {Array<Object>} rows - DOGE claim rows
 * @param {Set<string>} terminationIds - Award identifiers from terminations.csv
 * @returns {number} Rows sharing an award with the terminations file
 */
export function overlapWithTerminations(rows, terminationIds) {
    if (!(terminationIds instanceof Set) || terminationIds.size === 0) {
        return 0;
    }

    let overlap = 0;

    for (const row of rows || []) {
        const generated = field(row, 'generated_award_id');
        const piid = field(row, 'doge_award_id');

        if ((generated && terminationIds.has(generated)) || (piid && terminationIds.has(piid))) {
            overlap++;
        }
    }

    return overlap;
}
