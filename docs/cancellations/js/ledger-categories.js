/**
 * Master Ledger Category Module
 *
 * Pure classification helpers for master-ledger rows. No DOM, no fetch, no
 * state beyond a warn-once registry, so this module is safe to import from
 * both the browser dashboard and Node test runners.
 *
 * The ledger is viewed through four overlapping "lenses":
 *   - cancelled   contract actions with hard cancellation evidence
 *   - doge        rows a DOGE claim is attached to
 *   - suspicious  cancelled-status rows whose only evidence is a truncated
 *                 end date (quiet cancellations, no termination action)
 *   - reversed    cancellations that were undone
 *
 * `cancelled` and `suspicious` split the cancelled-status set between them,
 * minus one carve-out: a date-only row whose end date turned out to move later
 * lands in neither, since its sole evidence grew the award rather than cutting
 * it. Those rows survive only in the Raw Data tab, the same treatment descopes
 * get. `doge` and `reversed` cut across the whole set.
 */

import { countUnique, parseCurrency, parseIsoDateUTC, sumBy } from '../../shared/js/utils.js';

/**
 * The four lens names, in display order
 * @type {string[]}
 */
export const LENSES = ['cancelled', 'doge', 'suspicious', 'reversed'];

/**
 * Status values that mean the award itself was cancelled
 *
 * `descoped` is deliberately absent: a curated descope means part of the work
 * was cut while the award itself continues (e.g. NNG09FA40C, where only DEI
 * task work was terminated on an otherwise active contract). Counting it as a
 * cancellation would overstate the effect, so descopes sit in
 * NON_LENS_STATUSES and appear only in the Raw Data tab.
 *
 * @type {string[]}
 */
export const CANCELLED_STATUSES = ['listed', 'still_terminated', 'closed_out'];

/**
 * Status values that mean a cancellation was undone
 * @type {string[]}
 */
export const REVERSED_STATUSES = ['reinstated', 'vacated', 'continued'];

/**
 * Status values that are intentionally kept out of every lens
 *
 * `descoped` lives here because the award continues — only part of its work
 * was cut — so it is neither a cancellation nor a reversal.
 *
 * @type {string[]}
 */
export const NON_LENS_STATUSES = [
    'descoped',
    'excluded_by_design',
    'needs_manual_review',
    'dropped_pending_review',
    'source_retired'
];

/** Sources value identifying rows seen only in the local USAspending mirror */
const MIRROR_ONLY_SOURCE = 'LocalUSASpendingMirror';

/** Detection phrases that mean evidence beyond a moved end date exists */
const HARD_EVIDENCE_RE = /action|language transaction|clawback/i;

/** Detection phrase for an end date that moved earlier, capturing the day count */
const TRUNCATION_RE = /End date truncated (\d+) days/;

/** Prefix marking a claim that diverges from the observed record */
const DIVERGENCE_PREFIX = 'claimed_but_';

/** Milliseconds in one whole day */
const MS_PER_DAY = 86400000;

/** Distinct values already warned about, so each is logged at most once */
const warnedUnknowns = new Set();

/**
 * Log a warning the first time a given value is seen
 * @param {string} key - De-duplication key
 * @param {string} message - Message to log
 * @returns {void}
 */
function warnOnce(key, message) {
    if (warnedUnknowns.has(key)) return;
    warnedUnknowns.add(key);
    console.warn(message);
}

/**
 * Read a ledger field as a trimmed string, tolerating missing columns
 * @param {Object} row - Ledger row
 * @param {string} key - Column name
 * @returns {string} Trimmed value, or '' when absent
 */
function field(row, key) {
    return String(row?.[key] ?? '').trim();
}

/**
 * Test whether a row's only cancellation evidence is a truncated end date
 *
 * Two branches, because the upstream `Detection` column is still rolling out:
 * when Detection text is present it is authoritative; when it is missing the
 * mirror-only source stands in for it, since rows sourced solely from the
 * local USAspending mirror are exactly the date-truncation detections. Note
 * that `End Date Trend` is not consulted: it records whether the end date
 * moved, not whether that movement is the row's only evidence.
 *
 * A DOGE claim always disqualifies a row, because claim text (e.g.
 * "TERMINATED") can appear in Detection without being detection evidence.
 *
 * @param {Object} row - Ledger row
 * @returns {boolean} True when the row has date-only evidence
 */
function hasDateOnlyEvidence(row) {
    if (field(row, 'Claiming Source')) return false;

    const detection = field(row, 'Detection');

    if (detection) {
        return TRUNCATION_RE.test(detection) && !HARD_EVIDENCE_RE.test(detection);
    }

    return field(row, 'Sources') === MIRROR_ONLY_SOURCE;
}

/**
 * Classify a ledger row into the four lens flags
 *
 * A date-only row whose end date moved *later* is carved out of both
 * `cancelled` and `suspicious`; see isEndDateExtended for the rationale.
 *
 * Rows with an unrecognized `Status` land in no lens and trigger a one-time
 * console warning per distinct value; this never throws.
 *
 * @param {Object} row - Ledger row
 * @returns {{cancelled: boolean, doge: boolean, suspicious: boolean, reversed: boolean}} Lens flags
 */
export function categorize(row) {
    const status = field(row, 'Status');
    const isCancelledStatus = CANCELLED_STATUSES.includes(status);
    const isReversedStatus = REVERSED_STATUSES.includes(status);

    if (!isCancelledStatus && !isReversedStatus && !NON_LENS_STATUSES.includes(status)) {
        warnOnce(`status:${status}`, `ledger-categories: unknown Status value "${status}"`);
    }

    const dateOnly = isCancelledStatus && hasDateOnlyEvidence(row);

    return {
        cancelled: isCancelledStatus && !dateOnly,
        doge: field(row, 'Claiming Source') === 'DOGE',
        suspicious: dateOnly && !isEndDateExtended(row),
        reversed: isReversedStatus
    };
}

/**
 * Test whether a row is the extension carve-out
 *
 * A cancelled-status row in neither `cancelled` nor `suspicious` is exactly
 * the carve-out: its only evidence was a date change that grew the award. The
 * exclusion gets a name so its consumers — the Raw Data pill and the
 * Suspicious card's disclosure — say why the row is missing instead of
 * defaulting to the upstream "Cancelled" label the carve-out declined to
 * endorse.
 *
 * Never pass this directly to Array.filter — the element index would land in
 * `flags`. Use an explicit lambda.
 *
 * @param {Object} row - Ledger row
 * @param {Object} [flags] - Precomputed categorize(row) result, to avoid reclassifying
 * @returns {boolean} True when the row was carved out for an extended end date
 */
export function isExtensionCarveOut(row, flags = categorize(row)) {
    return CANCELLED_STATUSES.includes(field(row, 'Status'))
        && !flags.cancelled
        && !flags.suspicious;
}

/**
 * Filter rows down to a single lens
 * @param {Array<Object>} rows - Ledger rows
 * @param {'cancelled'|'doge'|'suspicious'|'reversed'} lens - Lens name
 * @returns {Array<Object>} Rows matching the lens
 */
export function applyLens(rows, lens) {
    let key = lens;

    if (!LENSES.includes(key)) {
        warnOnce(`lens:${key}`, `ledger-categories: unknown lens "${key}", falling back to "cancelled"`);
        key = 'cancelled';
    }

    // Rows carrying a precomputed `_cat` (attached at load time) skip
    // reclassification; test fixtures and ad-hoc rows fall back to categorize.
    return (rows || []).filter((row) => (row._cat || categorize(row))[key]);
}

/**
 * Evidence tiers, strongest to weakest
 *
 * The tier answers "how do we know?", not "what happened?": a federal
 * contracting record outranks a NASA-published list, which outranks an
 * inference drawn from our own daily snapshots, which outranks a bare claim.
 *
 * @type {string[]}
 */
export const EVIDENCE_TIER_ORDER = ['official', 'nasa-list', 'mirror', 'claim-only'];

/**
 * Source name → index into EVIDENCE_TIER_ORDER
 *
 * DOGE is a recognized source name that carries no corroboration of its own, so
 * it maps to the weakest tier and DOGE-only rows land in 'claim-only'.
 *
 * @type {Object<string, number>}
 */
const SOURCE_TIER_RANK = {
    USAspendingTerminations: 0,
    FPDS: 0,
    NPDV: 1,
    NASAGrants: 1,
    [MIRROR_ONLY_SOURCE]: 2,
    DOGE: 3
};

/**
 * Determine the strongest evidence tier backing a row
 *
 * Rows list every source that saw them, so the tier is the strongest source
 * present. Unrecognized source names trigger a one-time console warning per
 * distinct value and are ignored for tiering, which keeps a new upstream source
 * from silently promoting rows.
 *
 * A `still_terminated` re-verification verdict also counts as federal-record
 * evidence: it means the weekly re-check found a termination action in the
 * award's transaction history, which is the same class of proof as a daily
 * source detection. Without this, a claim the record later confirmed would
 * still read as uncorroborated. Weaker verdicts (naturally_expired,
 * no_termination_signal, reversals) corroborate nothing and do not promote.
 *
 * @param {Object} row - Ledger row
 * @returns {'official'|'nasa-list'|'mirror'|'claim-only'} Strongest tier present
 */
export function evidenceTier(row) {
    // Seeded rather than early-returned so unknown source names still warn
    let rank = field(row, 'Auto Status') === 'still_terminated'
        ? 0
        : EVIDENCE_TIER_ORDER.length - 1;

    for (const source of splitSources(field(row, 'Sources'))) {
        const sourceRank = SOURCE_TIER_RANK[source];

        if (sourceRank === undefined) {
            warnOnce(`source:${source}`, `ledger-categories: unknown Sources value "${source}"`);
            continue;
        }

        if (sourceRank < rank) rank = sourceRank;
    }

    return EVIDENCE_TIER_ORDER[rank];
}

/**
 * Read the end date an award started with, for measuring movement
 *
 * The single definition of the baseline rule: `Initial Reported End Date` —
 * the award's original end date, populated for every row since the July 2026
 * ledger schema — falling back to `First End Date` (first observed) for older
 * data. Consumed only through endDateMove, so every caller measures against
 * the same baseline by construction.
 *
 * @param {Object} row - Ledger row
 * @returns {{value: string, ms: number|null}} Chosen baseline string and its parsed timestamp
 */
function endDateBaseline(row) {
    const initial = field(row, 'Initial Reported End Date');
    const initialMs = parseIsoDateUTC(initial);

    if (initialMs !== null) return { value: initial, ms: initialMs };

    const first = field(row, 'First End Date');

    return { value: first, ms: parseIsoDateUTC(first) };
}

/**
 * Measure a row's end-date movement in whole days
 *
 * The one comparison every end-date consumer shares: lens membership
 * (isEndDateExtended), the value box (truncationDays), and the chart
 * (endDateChanges) all read this, so they cannot quietly disagree on which
 * way a date moved or by how much.
 *
 * @param {Object} row - Ledger row
 * @returns {{baseline: string, current: string, days: number}|null} Movement —
 *   days > 0 is a cut, < 0 an extension — or null when either date is missing
 *   or unparseable
 */
function endDateMove(row) {
    const baseline = endDateBaseline(row);
    const current = field(row, 'End Date');
    const currentMs = parseIsoDateUTC(current);

    if (baseline.ms === null || currentMs === null) return null;

    return {
        baseline: baseline.value,
        current,
        days: Math.round((baseline.ms - currentMs) / MS_PER_DAY)
    };
}

/**
 * Test whether a row's end date now sits later than the one it started with
 *
 * Only a measurable move counts: when either date is missing or unparseable the
 * row is not treated as extended, since the Suspicious lens's carve-out has to
 * be positively demonstrated rather than assumed.
 *
 * @param {Object} row - Ledger row
 * @returns {boolean} True when the current end date is later than the baseline
 */
function isEndDateExtended(row) {
    const move = endDateMove(row);

    return move !== null && move.days < 0;
}

/**
 * Measure how many days a row's end date was pulled in, when measurable
 *
 * The upstream `Detection` text is authoritative when present; otherwise the
 * cut is measured against `Initial Reported End Date` — the award's original
 * end date, populated for every row since the July 2026 ledger schema — with
 * `First End Date` (first observed) as the fallback for older data. Only rows
 * upstream marks `End Date Trend` = 'truncated' are measured; an extension is
 * not a truncation.
 *
 * @param {Object} row - Ledger row
 * @returns {number|null} Whole days the end date moved earlier, or null when unmeasurable
 */
export function truncationDays(row) {
    const match = field(row, 'Detection').match(TRUNCATION_RE);
    if (match) return Number(match[1]);

    if (field(row, 'End Date Trend') !== 'truncated') return null;

    const move = endDateMove(row);

    return move !== null && move.days > 0 ? move.days : null;
}

/**
 * Measure how far each row's end date moved from the originally reported one
 *
 * Written for the Suspicious lens's end-date chart, where the quiet cuts are
 * the whole story, but the measurement itself is lens-agnostic: any row subset
 * can be passed in.
 *
 * The baseline is `Initial Reported End Date` — the award's original end date,
 * populated for every row since the July 2026 ledger schema — falling back to
 * `First End Date` (first observed) when the original is blank or unparseable.
 * Unlike truncationDays, this does not consult `Detection` or `End Date Trend`:
 * the chart plots the movement between two dates it can draw, and a row whose
 * cut is only described in prose has no second point to draw to.
 *
 * `days` is positive for a cut (the end date moved earlier) and negative for
 * an extension, so a descending sort puts the deepest cuts first.
 *
 * @param {Array<Object>} rows - Ledger rows (typically one lens)
 * @returns {{items: Array<{row: Object, baseline: string, current: string, days: number}>,
 *   unchanged: number, unmeasured: number}} Measured movements, plus counts of
 *   the rows whose end date held still and the rows that could not be measured
 */
export function endDateChanges(rows) {
    const items = [];
    let unchanged = 0;
    let unmeasured = 0;

    for (const row of rows || []) {
        const move = endDateMove(row);

        if (move === null) {
            unmeasured++;
        } else if (move.days === 0) {
            unchanged++;
        } else {
            items.push({ row, ...move });
        }
    }

    // Descending days puts the deepest cuts first; ties break on Award ID so
    // the same rows always draw in the same order.
    items.sort((a, b) => {
        if (a.days !== b.days) return b.days - a.days;

        const left = field(a.row, 'Award ID');
        const right = field(b.row, 'Award ID');

        return left < right ? -1 : left > right ? 1 : 0;
    });

    return { items, unchanged, unmeasured };
}

/**
 * Claim outcome buckets, in display order
 * @type {string[]}
 */
export const CLAIM_OUTCOME_ORDER = ['verified', 'expired', 'no-signal', 'other'];

/**
 * `Auto Status` value → claim outcome bucket
 * @type {Object<string, string>}
 */
const CLAIM_OUTCOMES = {
    still_terminated: 'verified',
    naturally_expired: 'expired',
    no_termination_signal: 'no-signal'
};

/**
 * Bucket what re-verification found for a claimed award
 *
 * The tracking repo re-walks each claimed award's federal transaction history
 * weekly and records the result in `Auto Status`. Both 'expired' and 'no-signal'
 * mean the same thing — no termination action was found in the record — and
 * differ only in whether the period of performance has also run out. Everything
 * else (vacated, continued, descoped, reinstated, excluded, blank, unknown)
 * collapses into 'other'.
 *
 * @param {Object} row - Ledger row
 * @returns {'verified'|'expired'|'no-signal'|'other'|null} Bucket, or null when the row carries no claim
 */
export function claimOutcome(row) {
    if (!field(row, 'Claiming Source')) return null;

    return CLAIM_OUTCOMES[field(row, 'Auto Status')] || 'other';
}

/** `Auto Status` values meaning re-verification found no termination action */
const NO_TERMINATION_STATUSES = ['naturally_expired', 'no_termination_signal'];

/**
 * Test whether a row's cancelled status contradicts its re-verification result
 *
 * Mirror-tier rows are excluded: their evidence *is* a truncated end date, so
 * 'naturally_expired' is an artifact of the cut rather than a contradiction.
 *
 * @param {Object} row - Ledger row
 * @param {string} [tier] - Precomputed evidenceTier(row) result, to avoid re-deriving
 * @returns {boolean} True when a cancelled row has no termination action on record
 */
export function verificationConflict(row, tier = evidenceTier(row)) {
    if (!CANCELLED_STATUSES.includes(field(row, 'Status'))) return false;
    if (tier === 'mirror') return false;

    return NO_TERMINATION_STATUSES.includes(field(row, 'Auto Status'));
}

/**
 * Count rows per evidence tier
 * @param {Array<Object>} rows - Ledger rows
 * @returns {Object<string, number>} Zero-filled counts keyed by every tier in EVIDENCE_TIER_ORDER
 */
export function tierMix(rows) {
    const mix = Object.fromEntries(EVIDENCE_TIER_ORDER.map((tier) => [tier, 0]));

    // Rows carrying a precomputed `_tier` (attached at load time) skip
    // re-derivation, the same idiom applyLens uses for `_cat`
    for (const row of rows || []) mix[row._tier || evidenceTier(row)]++;

    return mix;
}

/**
 * Count claimed rows per claim outcome, ignoring rows with no claim
 * @param {Array<Object>} rows - Ledger rows
 * @returns {Object<string, number>} Zero-filled counts keyed by every bucket in CLAIM_OUTCOME_ORDER
 */
export function claimOutcomeMix(rows) {
    const mix = Object.fromEntries(CLAIM_OUTCOME_ORDER.map((outcome) => [outcome, 0]));

    for (const row of rows || []) {
        const outcome = claimOutcome(row);
        if (outcome) mix[outcome]++;
    }

    return mix;
}

/**
 * Find the most recent re-verification date across rows
 *
 * `Auto Verified Date` is ISO 'YYYY-MM-DD', so a lexicographic max is also the
 * chronological max and no date parsing is needed.
 *
 * @param {Array<Object>} rows - Ledger rows
 * @returns {string} Latest date string, or '' when no row carries one
 */
export function latestVerification(rows) {
    let latest = '';

    for (const row of rows || []) {
        const verified = field(row, 'Auto Verified Date');
        if (verified > latest) latest = verified;
    }

    return latest;
}

/**
 * Compute raw summary statistics over whatever row subset is supplied
 *
 * All values are unformatted numbers; callers decide on presentation.
 *
 * @param {Array<Object>} rows - Ledger rows (typically one lens)
 * @returns {{count: number, totalObligations: number, totalOutlays: number,
 *   claimedSavings: number, divergedClaims: number, districts: number,
 *   avgDaysTruncated: number|null, courtVacaturs: number}} Summary statistics
 */
export function summarize(rows) {
    const list = rows || [];
    const measuredDays = [];
    let divergedClaims = 0;
    let courtVacaturs = 0;

    for (const row of list) {
        if (field(row, 'Claim Divergence').startsWith(DIVERGENCE_PREFIX)) divergedClaims++;
        if (field(row, 'Status') === 'vacated') courtVacaturs++;

        const days = truncationDays(row);
        if (days !== null) measuredDays.push(days);
    }

    return {
        count: list.length,
        totalObligations: sumBy(list, 'Award Amount'),
        totalOutlays: sumBy(list, 'Total Outlays'),
        claimedSavings: sumBy(list, 'Claimed Savings'),
        divergedClaims,
        districts: countUnique(list.filter((row) => field(row, 'District')), 'District'),
        avgDaysTruncated: measuredDays.length
            ? measuredDays.reduce((sum, days) => sum + days, 0) / measuredDays.length
            : null,
        courtVacaturs
    };
}

/**
 * Convert a 'YYYY-MM-DD' date to a 'YYYY-MM' month key
 * @param {string} value - Candidate date string
 * @returns {string|null} Month key, or null when not a real calendar date
 */
function monthFromIso(value) {
    return parseIsoDateUTC(value) === null ? null : value.slice(0, 7);
}

/**
 * Convert an 'M/D/YYYY' date to a 'YYYY-MM' month key
 * @param {string} value - Candidate date string
 * @returns {string|null} Month key, or null when unparseable
 */
function monthFromSlash(value) {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (!match) return null;

    const month = Number(match[1]);
    if (month < 1 || month > 12) return null;

    return `${match[3]}-${String(month).padStart(2, '0')}`;
}

/**
 * Convert a 'YYYY-MM' key to a sortable integer month ordinal
 * @param {string} key - Month key
 * @returns {number} Months since year zero
 */
function monthOrdinal(key) {
    const [year, month] = key.split('-').map(Number);

    return year * 12 + (month - 1);
}

/**
 * Convert a month ordinal back to a 'YYYY-MM' key
 * @param {number} ordinal - Months since year zero
 * @returns {string} Month key
 */
function monthKey(ordinal) {
    const year = Math.floor(ordinal / 12);
    const month = (ordinal % 12) + 1;

    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Read a row's obligated value as a number
 *
 * `row.totalObligations` is the numeric value app.js attaches at load time;
 * ad-hoc rows and test fixtures fall back to the raw `Award Amount` column.
 * This is the single definition of "obligated value" — display modules import
 * it rather than re-deriving the fallback.
 *
 * @param {Object} row - Ledger row
 * @returns {number|null} Numeric obligated value, or null when the row carries none
 */
export function obligatedValue(row) {
    if (Number.isFinite(row?.totalObligations)) return row.totalObligations;

    return parseCurrency(field(row, 'Award Amount'));
}

/**
 * Read the value a row contributes to a timeline bucket
 *
 * The DOGE lens plots what was claimed; every other lens plots what was
 * actually obligated.
 *
 * @param {Object} row - Ledger row
 * @param {boolean} isDoge - Whether the DOGE lens is active
 * @returns {number|null} Numeric value, or null when the row carries none
 */
function activityValue(row, isDoge) {
    return isDoge ? parseCurrency(field(row, 'Claimed Savings')) : obligatedValue(row);
}

/**
 * Bucket rows into a continuous monthly timeline for the active lens
 *
 * The date column follows the lens: the DOGE lens dates a row by when the claim
 * appeared ('Claim Date', M/D/YYYY), every other lens by the latest federal
 * contract action ('Latest Action Date', YYYY-MM-DD) as a proxy for when
 * the action landed. Both formats are split rather than fed to `new Date`,
 * which would reinterpret them in the viewer's timezone.
 *
 * Months between the earliest and latest observation are zero-filled so the
 * series can be plotted directly without gap handling. Rows whose date is blank
 * or unparseable are reported in `skipped` rather than silently dropped.
 *
 * @param {Array<Object>} rows - Ledger rows (typically one lens)
 * @param {'cancelled'|'doge'|'suspicious'|'reversed'} lens - Active lens
 * @returns {{months: Array<{month: string, count: number, dollars: number,
 *   top: Array<{recipient: string, amount: number}>}>, skipped: number}} Continuous monthly series
 */
export function monthlyActivity(rows, lens) {
    const isDoge = lens === 'doge';
    const dateColumn = isDoge ? 'Claim Date' : 'Latest Action Date';
    const buckets = new Map();
    let skipped = 0;

    for (const row of rows || []) {
        const raw = field(row, dateColumn);
        const month = isDoge ? monthFromSlash(raw) : monthFromIso(raw);

        if (!month) {
            skipped++;
            continue;
        }

        const value = activityValue(row, isDoge);
        const amount = Number.isFinite(value) ? value : 0;

        if (!buckets.has(month)) buckets.set(month, { count: 0, dollars: 0, entries: [] });

        const bucket = buckets.get(month);
        bucket.count++;
        bucket.dollars += amount;
        bucket.entries.push({ recipient: field(row, 'Recipient'), amount });
    }

    if (buckets.size === 0) return { months: [], skipped };

    const ordinals = [...buckets.keys()].map(monthOrdinal);
    const months = [];

    for (let ordinal = Math.min(...ordinals); ordinal <= Math.max(...ordinals); ordinal++) {
        const month = monthKey(ordinal);
        const bucket = buckets.get(month);

        months.push({
            month,
            count: bucket ? bucket.count : 0,
            dollars: bucket ? bucket.dollars : 0,
            top: bucket
                ? bucket.entries.sort((a, b) => b.amount - a.amount).slice(0, 3)
                : []
        });
    }

    return { months, skipped };
}

/**
 * Status → status-pill display mapping
 * @type {Object<string, {label: string, cls: string}>}
 */
export const STATUS_PILLS = {
    listed: { label: 'Cancelled', cls: 'badge--cancelled' },
    still_terminated: { label: 'Cancelled', cls: 'badge--cancelled' },
    closed_out: { label: 'Closed out', cls: 'badge--cancelled' },
    // Not cancelled-red: the award continues, only part of its work was cut
    descoped: { label: 'Descoped', cls: 'badge--excluded' },
    reinstated: { label: 'Reinstated', cls: 'badge--reversed' },
    vacated: { label: 'Vacated', cls: 'badge--reversed' },
    continued: { label: 'Continued', cls: 'badge--reversed' },
    excluded_by_design: { label: 'Excluded', cls: 'badge--excluded' },
    needs_manual_review: { label: 'Under review', cls: 'badge--excluded' },
    dropped_pending_review: { label: 'Under review', cls: 'badge--excluded' },
    source_retired: { label: 'Source retired', cls: 'badge--excluded' }
};

/**
 * Pill shown in place of the status pill for suspicious rows
 * @type {{label: string, cls: string}}
 */
export const SUSPICIOUS_PILL = { label: 'Suspicious', cls: 'badge--suspicious' };

/**
 * Pill shown in place of the status pill for extension carve-out rows
 *
 * Not cancelled-red: the row's own evidence says the award grew, and
 * "Cancelled" is precisely the upstream claim the carve-out declined to
 * endorse.
 *
 * @type {{label: string, cls: string}}
 */
export const EXTENDED_PILL = { label: 'Date extended', cls: 'badge--excluded' };

/**
 * Divergence code → display label
 * @type {Object<string, string>}
 */
const DIVERGENCE_LABELS = {
    claimed_but_grew: 'Claim diverges: grew',
    claimed_but_extended: 'Claim diverges: extended'
};

/**
 * Split a '; '-joined Sources value into individual source names
 * @param {string} value - Raw Sources value
 * @returns {string[]} Trimmed, non-empty source names
 */
export function splitSources(value) {
    return String(value ?? '')
        .split(';')
        .map((source) => source.trim())
        .filter(Boolean);
}

/**
 * Detection evidence for a row, or '' when the row carries none
 *
 * When DOGE is the winning source the Detection text can simply restate the
 * claim ("TERMINATED"). An assertion is not evidence, so it is suppressed —
 * the same rationale that keeps claim text out of hasDateOnlyEvidence.
 *
 * @param {Object} row - Ledger row
 * @returns {string} Detection text, or '' when absent or merely restating the claim
 */
export function detectionEvidence(row) {
    const detection = field(row, 'Detection');
    if (!detection) return '';

    const claimed = field(row, 'Claimed Status');
    if (claimed && detection.toLowerCase() === claimed.toLowerCase()) return '';

    return detection;
}

/**
 * Build display metadata for one ledger row
 *
 * Two rows override the status pill: suspicious rows, where "listed"
 * understates a quietly truncated end date, and extension carve-outs, where
 * "Cancelled" would overstate a row every lens rejected.
 *
 * @param {Object} row - Ledger row
 * @param {Object} [flags] - Precomputed categorize(row) result, to avoid reclassifying
 * @returns {{statusPill: {label: string, cls: string}, sources: string[],
 *   divergence: {code: string, label: string, cls: string}|null,
 *   trendGlyphs: Array<{glyph: string, title: string}>}} Display metadata
 */
export function deriveBadges(row, flags = categorize(row)) {
    const status = field(row, 'Status');

    const statusPill = flags.suspicious
        ? SUSPICIOUS_PILL
        : isExtensionCarveOut(row, flags)
            ? EXTENDED_PILL
            : STATUS_PILLS[status] || { label: status, cls: 'badge--excluded' };

    const sources = splitSources(field(row, 'Sources'));

    const code = field(row, 'Claim Divergence');
    const divergence = code.startsWith(DIVERGENCE_PREFIX)
        ? {
            code,
            label: DIVERGENCE_LABELS[code] || 'Claim diverges',
            cls: 'badge--doge'
        }
        : null;

    const trendGlyphs = [];

    if (field(row, 'Amount Trend') === 'shrank') {
        trendGlyphs.push({ glyph: '▼', title: 'Award amount reduced since first observation' });
    }

    if (field(row, 'End Date Trend') === 'truncated' || TRUNCATION_RE.test(field(row, 'Detection'))) {
        trendGlyphs.push({ glyph: '◀', title: 'End date moved earlier since first observation' });
    }

    return { statusPill, sources, divergence, trendGlyphs };
}
