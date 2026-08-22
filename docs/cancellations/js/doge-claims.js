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
 * `checked_date` is per row: upstream re-checks claims in batches, so a file
 * can carry several dates at once. `dogeStats` reports the newest.
 */

import { parseCurrency, parseIsoDateUTC } from '../../shared/js/utils.js';
import { districtOf, field, hasColumn } from './panel-common.js';

/**
 * The four claim outcomes, in display order
 *
 * The panel table and the summary bar both show all four (see BAR_SEGMENTS).
 *
 * @type {string[]}
 */
export const OUTCOME_ORDER = ['terminated', 'ended', 'active', 'unmatched'];

/**
 * Display metadata for each claim outcome
 *
 * Carries both altitudes so the bar and the table cannot drift apart:
 *   - `label` is the bar/legend wording
 *   - `short` is the table badge
 *   - `description` is printed as visible text, never a `title=` tooltip
 *
 * 'ended' and 'active' say different things about the award — one ran out its
 * period of performance, the other is still inside it — so they carry their own
 * labels and their own bar segments rather than collapsing into one
 * "no termination found" bucket that hides which happened.
 *
 * @type {Object<string, {label: string, short: string, description: string, badgeClass: string}>}
 */
export const OUTCOME_META = {
    // `badgeClass` puts outcomes in the same .badge family the terminations
    // panel wears, so a DOGE award renders exactly like any other award:
    // cancelled-red only when the federal record shows a termination, the
    // neutral badge otherwise (the short text carries the distinction).
    terminated: {
        label: 'Termination on record',
        short: 'Terminated',
        description: "A termination action is in the award's federal record.",
        badgeClass: 'badge--cancelled'
    },
    ended: {
        label: 'Expired',
        short: 'Expired',
        description: 'Ran out its period of performance; no termination action recorded.',
        badgeClass: 'badge--excluded'
    },
    active: {
        label: 'Still active',
        short: 'Still active',
        description: 'Still inside its period of performance; no termination action recorded.',
        badgeClass: 'badge--excluded'
    },
    unmatched: {
        label: 'Not in federal records',
        short: 'Not found',
        description: 'No matching award in federal spending records.',
        badgeClass: 'badge--excluded'
    }
};

/**
 * The summary-bar segments, strongest evidence first
 *
 * One segment per outcome — the bar and the table now answer the same four-way
 * question, so there is no roll-up mapping to keep in step.
 *
 * @type {string[]}
 */
export const BAR_SEGMENTS = OUTCOME_ORDER;

/**
 * Display metadata for the summary bar
 *
 * Ordinal ramp: three reds descending by strength of termination evidence, then
 * neutral gray for the claims with no federal record at all. Gray is not a
 * fourth step of the ramp — an unmatched claim is missing evidence rather than
 * weaker evidence, and a single hue cannot carry four steps that stay apart.
 *
 * The three reds are #991B1B / #DC2626 / #F87171 with monotonically rising
 * lightness, which is the check that governs a sequential ramp (the dataviz
 * categorical validator FAILs any sequential ramp by design — see
 * references/color-formula.md). Against the light surface they clear the
 * lightness band and adjacent-pair CVD separation; the light end's sub-3:1
 * contrast is relieved by the legend's printed counts, the definitions list,
 * and the panel table. Drop any of those three and this becomes a hard fail.
 *
 * The hexes live in CSS against these class names: `seg--outcome-strong`,
 * `seg--outcome-mid`, `seg--outcome-weak`, `seg--outcome-none`.
 *
 * @type {Object<string, {label: string, description: string, segClass: string}>}
 */
export const SEGMENT_META = {
    terminated: {
        label: OUTCOME_META.terminated.label,
        description: OUTCOME_META.terminated.description,
        segClass: 'seg--outcome-strong'
    },
    ended: {
        label: OUTCOME_META.ended.label,
        description: OUTCOME_META.ended.description,
        segClass: 'seg--outcome-mid'
    },
    active: {
        label: OUTCOME_META.active.label,
        description: OUTCOME_META.active.description,
        segClass: 'seg--outcome-weak'
    },
    unmatched: {
        label: OUTCOME_META.unmatched.label,
        description: OUTCOME_META.unmatched.description,
        segClass: 'seg--outcome-none'
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
        _potential: parseCurrency(field(row, 'total_potential_value')),
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
 * @returns {Object<string, number>} Segment counts
 */
export function outcomeMix(rows) {
    const mix = Object.fromEntries(BAR_SEGMENTS.map((segment) => [segment, 0]));

    for (const row of rows || []) {
        mix[outcomeOf(row)]++;
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
 * `calculatedSavings` is the independent figure DOGE's claims are measured
 * against: the award's ceiling less what it had already obligated, which is the
 * money the cancellation actually took off the table. It is summed only over
 * claims whose award stopped spending — terminated or expired — since an award
 * still inside its period of performance has saved nothing yet, and an unmatched
 * claim has no federal figures to subtract. `calculatedSavingsCount` says how
 * many claims carried both figures, so the display can qualify the total.
 *
 * @param {Array<Object>} rows - DOGE claim rows
 * @returns {{count: number, claimedSavings: number, claimedOnActive: number,
 *   noFigureCount: number, calculatedSavings: number, calculatedSavingsCount: number,
 *   terminated: number, unmatched: number, expiredButTerminated: number,
 *   checkedDate: string}} Summary statistics
 */
export function dogeStats(rows) {
    const list = rows || [];
    let claimedSavings = 0;
    let claimedOnActive = 0;
    let noFigureCount = 0;
    let calculatedSavings = 0;
    let calculatedSavingsCount = 0;
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

        // Only an award that stopped spending can have saved anything, so a
        // still-active award contributes nothing however DOGE scored it.
        if (outcome === 'terminated' || outcome === 'ended') {
            const potential = row?._potential ?? parseCurrency(field(row, 'total_potential_value'));
            const obligation = row?._obligation ?? parseCurrency(field(row, 'current_obligation'));

            if (Number.isFinite(potential) && Number.isFinite(obligation)) {
                calculatedSavings += potential - obligation;
                calculatedSavingsCount++;
            }
        }

        // ISO 'YYYY-MM-DD', so a lexicographic max is the chronological max.
        // Rows re-checked in a later batch carry a later date; the panel quotes
        // the newest rather than implying the whole file was checked at once.
        const checked = field(row, 'checked_date');
        if (checked > checkedDate) checkedDate = checked;
    }

    return {
        count: list.length,
        claimedSavings,
        claimedOnActive,
        noFigureCount,
        calculatedSavings,
        calculatedSavingsCount,
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
