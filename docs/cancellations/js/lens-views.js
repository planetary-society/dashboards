/**
 * Lens Display Module
 *
 * Display configuration for the four ledger lenses: the copy each lens shows
 * and the value boxes it fills. DOM-free and side-effect-free, so it is safe to
 * import from both the browser dashboard and Node test runners.
 *
 * ledger-categories.js owns what a lens *means*; this module owns what it
 * *says*.
 */

import { ICONS } from '../../shared/js/constants.js';
import { formatCurrency, pluralCount } from '../../shared/js/utils.js';
import { categorize, obligatedValue, truncationDays } from './ledger-categories.js';

/**
 * Display copy for each lens
 *
 * `label` is the short name used in prose; `headline` is the one-line
 * description shown under the lens bar and as the first value box's title.
 *
 * @type {Object<string, {label: string, headline: string}>}
 */
export const LENS_META = {
    cancelled: {
        label: 'Cancelled',
        headline: 'Awards terminated since Jan 2025'
    },
    doge: {
        label: 'DOGE Claims',
        headline: 'Awards claimed as cancelled by DOGE'
    },
    suspicious: {
        label: 'Suspicious',
        headline: 'Awards with suspicious end-date changes'
    },
    reversed: {
        label: 'Reversed',
        headline: 'Terminations reversed or not upheld'
    }
};

/**
 * Display copy for each evidence tier
 *
 * The description is written for a reader who has never heard of FPDS or NPDV:
 * it says what kind of record backs the row, not which system it came from.
 * `cls` styles the per-row badge; `segCls` fills the tier's segment in the
 * evidence bar.
 *
 * @type {Object<string, {label: string, description: string, cls: string, segCls: string}>}
 */
export const TIER_META = {
    official: {
        label: 'Federal record',
        description: 'A termination or deobligation action appears in the award\'s federal record (USAspending/FPDS), found by our daily source sweeps or the weekly re-verification of its transaction history.',
        cls: 'badge--tier-official',
        segCls: 'seg--official'
    },
    'nasa-list': {
        label: 'NASA list',
        description: 'Appears on NASA internal cancellation or grant-termination lists; no federal termination action found yet.',
        cls: 'badge--tier-nasa',
        segCls: 'seg--nasa'
    },
    mirror: {
        label: 'Inferred',
        description: 'Detected by comparing daily USAspending snapshots: the award\'s end date was quietly cut short.',
        cls: 'badge--tier-mirror',
        segCls: 'seg--mirror'
    },
    'claim-only': {
        label: 'Uncorroborated',
        description: 'The only evidence is DOGE\'s own claim; no federal record, NASA list, or weekly re-verification corroborates it.',
        cls: 'badge--tier-claim',
        segCls: 'seg--claim'
    }
};

/**
 * Display copy for each claim-verification outcome
 *
 * `segCls` fills the outcome's segment in the claims bar. The tier bar and
 * claims bar are never shown together, so their fills may share hues.
 *
 * @type {Object<string, {label: string, description: string, segCls: string}>}
 */
export const OUTCOME_META = {
    verified: {
        label: 'Termination verified',
        description: 'A termination action appears in the award\'s federal transaction history.',
        segCls: 'seg--verified'
    },
    expired: {
        label: 'Expired on schedule',
        description: 'No termination action found; the award\'s period of performance simply ended.',
        segCls: 'seg--expired'
    },
    'no-signal': {
        label: 'No termination found',
        description: 'No termination action appears in the federal record for this award.',
        segCls: 'seg--no-signal'
    },
    other: {
        label: 'Reversed or other',
        description: 'Reinstated, vacated by a court, descoped, or excluded from our totals.',
        segCls: 'seg--other'
    }
};

/**
 * Display copy for each weekly re-verification verdict (`Auto Status`)
 *
 * Per-row companion to OUTCOME_META: the bar buckets claims into four
 * outcomes, while this names the exact verdict on an individual award.
 * Labels are unique so they can double as sortable cell text.
 *
 * @type {Object<string, {label: string, description: string}>}
 */
export const VERDICT_META = {
    still_terminated: {
        label: 'Termination verified',
        description: 'The weekly re-check found a termination action in the award\'s federal transaction history.'
    },
    naturally_expired: {
        label: 'Expired on schedule',
        description: 'No termination action found; the award\'s period of performance simply ended.'
    },
    no_termination_signal: {
        label: 'No termination found',
        description: 'No termination action appears in the award\'s federal transaction history.'
    },
    reinstated: {
        label: 'Reinstated',
        description: 'The award was terminated and later reinstated.'
    },
    vacated: {
        label: 'Vacated by court',
        description: 'A court vacated the termination.'
    },
    continued: {
        label: 'Continued',
        description: 'The award continued despite the cancellation signal.'
    },
    descoped: {
        label: 'Partially descoped',
        description: 'A modification cut part of the work while the award itself continues.'
    },
    excluded_by_design: {
        label: 'Excluded',
        description: 'Outside the dashboard\'s scope by design.'
    },
    needs_manual_review: {
        label: 'Under review',
        description: 'The evidence is not yet sufficient to classify this award.'
    },
    unresolved: {
        label: 'Unresolved',
        description: 'The re-check could not reach a verdict on this award.'
    }
};

/**
 * Display copy for each lens's monthly timeline
 *
 * `dateNote` explains what the month actually measures, since only the DOGE
 * lens has a true event date; the others use the latest federal contract action
 * as a proxy. `valueLabel` names the dollar series, which likewise differs: the
 * DOGE lens plots claimed savings, every other lens plots obligated value.
 *
 * `barColor` matches the lens's own ink from the lens bar, so a view keeps one
 * colour from selector to chart; `countLabel` names the counted thing, which is
 * a claim on the DOGE lens and an award everywhere else.
 *
 * @type {Object<string, {subtitle: string, dateNote: string, valueLabel: string,
 *   barColor: string, countLabel: string}>}
 */
export const TIMELINE_META = {
    cancelled: {
        subtitle: 'Termination actions by month',
        dateNote: 'Month of the latest federal contract action — a proxy for the termination date.',
        valueLabel: 'Obligated value',
        barColor: 'var(--red-500)',
        countLabel: 'Awards'
    },
    doge: {
        subtitle: 'DOGE claims by month',
        dateNote: 'Month each claim first appeared on DOGE\'s public list.',
        valueLabel: 'Claimed savings',
        barColor: 'var(--purple-500)',
        countLabel: 'Claims'
    },
    suspicious: {
        subtitle: 'Suspicious end-date changes by month',
        dateNote: 'Month of the latest federal contract action — a proxy for when the end date was cut.',
        valueLabel: 'Obligated value',
        barColor: 'var(--orange-500)',
        countLabel: 'Awards'
    },
    reversed: {
        subtitle: 'Reversals by month',
        dateNote: 'Month of the latest federal contract action — a proxy for the reversal date.',
        valueLabel: 'Obligated value',
        barColor: 'var(--green-500)',
        countLabel: 'Awards'
    }
};

/**
 * Display copy for the Suspicious lens's end-date chart
 *
 * Only one lens shows the chart, so this is a single object rather than a
 * per-lens map. The note names the method, because a reader is entitled to know
 * that "cut" here means an inference from two snapshots rather than an
 * announcement anybody made.
 *
 * @type {{heading: string, note: string, color: string}}
 */
export const ENDDATE_META = {
    heading: 'Where the end dates moved',
    note: 'Each arrow runs from the award\'s originally reported end date to its'
        + ' current one. None of these changes were announced — they were found by'
        + ' comparing the award\'s original record against daily USAspending snapshots.',
    // The lens keeps one ink from selector to chart, so the arrow chart's
    // colour is the timeline's, not a second literal
    color: TIMELINE_META.suspicious.barColor
};

/**
 * Sum up an end-date chart in one plain sentence
 *
 * Takes endDateChanges() output and reports only what it plots: the awards
 * whose end date actually moved. Rows that held still or could not be measured
 * are the chart's business, not this sentence's, so they are not counted here.
 *
 * Every movement is a cut, because the Suspicious lens — the only lens that
 * shows this chart — excludes awards whose end date moved later.
 *
 * @param {Object} changes - endDateChanges() output for the active lens
 * @param {Array<{days: number}>} changes.items - Measured end-date movements
 * @returns {string} One sentence, or '' when nothing moved
 */
export function endDateSummary({ items } = {}) {
    const list = items || [];
    if (list.length === 0) return '';

    const days = median(list.map((item) => item.days));

    return `${pluralCount(list.length, 'award')}`
        + ` ${list.length === 1 ? 'had its end date' : 'had their end dates'}`
        + ` quietly cut short — a median of ${pluralCount(days, 'day')} each.`;
}

/**
 * Build the end-date-truncation chip for one row, when it has one
 *
 * Suspicious rows get a chip even though their truncation is unmeasurable: the
 * cut happened before our first observation, and saying so is more honest than
 * showing nothing.
 *
 * @param {Object} row - Ledger row
 * @param {Object} [flags] - Precomputed categorize(row) result, to avoid reclassifying
 * @returns {{label: string, title: string}|null} Chip copy, or null when the row has no truncation
 */
export function truncationChip(row, flags = categorize(row)) {
    const days = truncationDays(row);

    if (days !== null) {
        return {
            label: `End date cut by ${pluralCount(days, 'day')}`,
            title: 'Difference between the originally recorded end date and the current one.'
        };
    }

    if (flags?.suspicious) {
        return {
            label: 'End date cut before tracking began',
            title: 'The truncation happened before our first observation of this award, so its size is unknown.'
        };
    }

    return null;
}

/**
 * Return the ascending-sorted median of a list of numbers
 * @param {number[]} values - Numbers to reduce
 * @returns {number} Median value
 */
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Pick a handful of rows that stand in for the whole lens
 *
 * The biggest awards carry the headline, but a page of only headline numbers
 * misrepresents a ledger whose typical row is far smaller — so the last slot
 * goes to the award nearest the median obligated value. Rows with no readable
 * value are skipped, and duplicate award IDs are collapsed.
 *
 * `hasRepresentative` is the selector's own verdict on whether the last row is
 * a median-representative pick rather than just another large award — callers
 * must not re-derive it from row counts, which miss rows with unparseable
 * values.
 *
 * @param {Array<Object>} rows - Ledger rows (typically one lens)
 * @param {number} [n=3] - Maximum rows to return
 * @returns {{rows: Array<Object>, hasRepresentative: boolean}} Up to n rows,
 *   largest first with the median-representative last when one exists
 */
export function selectSpotlights(rows, n = 3) {
    if (n <= 0) return { rows: [], hasRepresentative: false };

    const seen = new Set();
    const scored = [];

    for (const row of rows || []) {
        const value = obligatedValue(row);
        if (!Number.isFinite(value)) continue;

        const id = String(row?.['Award ID'] ?? '').trim();
        if (id) {
            if (seen.has(id)) continue;
            seen.add(id);
        }

        scored.push({ row, value });
    }

    scored.sort((a, b) => b.value - a.value);

    if (scored.length <= n) {
        return { rows: scored.map((entry) => entry.row), hasRepresentative: false };
    }

    const target = median(scored.map((entry) => entry.value));
    const remaining = scored.slice(n - 1);

    let representative = remaining[0];
    for (const entry of remaining) {
        if (Math.abs(entry.value - target) < Math.abs(representative.value - target)) {
            representative = entry;
        }
    }

    return {
        rows: [...scored.slice(0, n - 1).map((entry) => entry.row), representative.row],
        hasRepresentative: true
    };
}

/**
 * Build the four value boxes for a lens
 *
 * Takes raw `summarize()` output — unformatted numbers — and does all the
 * presentation here, so callers never pre-format. Each lens renders exactly
 * four boxes to match the fixed 4-column grid.
 *
 * @param {Object} stats - Raw summarize() output for the active lens
 * @param {number} stats.count - Number of rows in the lens
 * @param {number} stats.totalObligations - Total obligated value
 * @param {number} stats.claimedSavings - DOGE claimed savings
 * @param {number} stats.divergedClaims - Rows whose DOGE claim diverges from award data
 * @param {number} stats.districts - Number of unique congressional districts
 * @param {number|null} stats.avgDaysTruncated - Mean days end dates were pulled in
 * @param {number} stats.courtVacaturs - Rows with a vacated status
 * @param {'cancelled'|'doge'|'suspicious'|'reversed'} [lens='cancelled'] - Active lens
 * @returns {Array<{title: string, value: string, icon: string, type: string}>} Exactly four boxes
 */
export function createLensValueBoxes(stats, lens = 'cancelled') {
    const key = LENS_META[lens] ? lens : 'cancelled';

    // The first box always counts the lens, so its title is the lens headline
    const countBox = {
        title: LENS_META[key].headline,
        value: stats.count.toLocaleString(),
        icon: ICONS.contracts,
        type: 'contracts'
    };

    const districtsBox = {
        title: 'Congressional districts affected',
        value: stats.districts.toLocaleString(),
        icon: ICONS.districts,
        type: 'districts'
    };

    const claimedSavingsBox = {
        title: 'In savings claimed by DOGE',
        value: formatCurrency(stats.claimedSavings, true),
        icon: 'piggy-bank',
        type: 'recipients'
    };

    const obligationsBox = (title) => ({
        title,
        value: formatCurrency(stats.totalObligations, true),
        icon: ICONS.value,
        type: 'value'
    });

    const lenses = {
        cancelled: [
            countBox,
            obligationsBox('Value of terminated awards'),
            claimedSavingsBox,
            districtsBox
        ],
        doge: [
            countBox,
            claimedSavingsBox,
            obligationsBox('Actual obligated value'),
            {
                title: 'Claims diverging from award data',
                value: stats.divergedClaims.toLocaleString(),
                icon: 'exclamation-triangle',
                type: 'recipients'
            }
        ],
        suspicious: [
            countBox,
            obligationsBox('Value at risk'),
            {
                title: 'Average days truncated',
                value: stats.avgDaysTruncated == null
                    ? '—'
                    : Math.round(stats.avgDaysTruncated).toLocaleString(),
                icon: 'calendar-x',
                type: 'recipients'
            },
            districtsBox
        ],
        reversed: [
            countBox,
            obligationsBox('Value restored'),
            {
                title: 'Court vacaturs',
                value: stats.courtVacaturs.toLocaleString(),
                icon: 'arrow-counterclockwise',
                type: 'recipients'
            },
            districtsBox
        ]
    };

    return lenses[key];
}
