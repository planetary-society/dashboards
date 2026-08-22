/**
 * Panel Views Module
 *
 * Display copy and view-model builders for the two panels (Confirmed
 * Cancellations / DOGE Claims). Pure functions over plain objects — no DOM
 * reads, no fetches — so everything here is importable and testable in Node.
 * app.js owns the DOM; this module owns what the panels say.
 *
 * Editorial rules encoded here (from the 2026-08 review):
 *  - Counts sit next to the noun they count, in the panel headline — never in
 *    the panel-bar tab labels, where a screenshot would show addable numbers.
 *  - The cross-panel overlap is stated in the DOGE panel's own headline area.
 *  - DOGE's claimed-savings total is never rendered without its caveats.
 *  - Segment definitions are visible text, not title-attribute tooltips.
 */

import { formatCurrency, escapeHtml, escapeAttr, pluralCount } from '../../shared/js/utils.js';
import { ICONS, DATA_URLS } from '../../shared/js/constants.js';
import { MISSING, placeLine, usaspendingUrl } from './panel-common.js';
import { formatIsoDayLong } from './chart-common.js';
import { overrideMeta } from './terminations.js';
import { BAR_SEGMENTS, OUTCOME_META, SEGMENT_META } from './doge-claims.js';

/**
 * Static display metadata for each panel
 *
 * `label` also heads the panel's group on district pages; `unitLabel` heads
 * the count column of the districts/recipients summary tables.
 */
export const PANEL_META = {
    cancellations: {
        label: 'Confirmed Cancellations',
        unitLabel: 'Awards',
        downloadUrl: DATA_URLS.terminations,
        tableHeading: 'Every termination action in the federal record',
        hasMap: true
    },
    doge: {
        label: 'DOGE Claims',
        unitLabel: 'Claims',
        downloadUrl: DATA_URLS.dogeClaims,
        tableHeading: 'Every award cancellation DOGE claimed',
        hasMap: false
    }
};

/**
 * Panel headline: the count beside the noun it counts
 * @param {'cancellations'|'doge'} panelId - Active panel
 * @param {Object} stats - That panel's stats object
 * @returns {string} Plain-text headline
 */
export function panelHeadline(panelId, stats) {
    if (panelId === 'doge') {
        return `${pluralCount(stats.count, 'cancellation claim')} by DOGE`;
    }
    return `${pluralCount(stats.confirmed, 'NASA award')} terminated since January 2025`;
}

/**
 * Panel disclosure line, rendered directly under the headline
 *
 * Confirmed: the partial-action split, so the headline number and the table's
 * badges can never contradict each other. DOGE: the overlap with the confirmed
 * panel plus the historical framing — stated here, next to the count it
 * qualifies, where a screenshot cannot crop it away.
 *
 * @param {'cancellations'|'doge'} panelId - Active panel
 * @param {Object} stats - That panel's stats object
 * @param {number} [overlap] - Claims shared with the confirmed panel, computed at load
 * @returns {string} Plain-text note ('' when nothing needs disclosing)
 */
export function panelNote(panelId, stats, overlap) {
    if (panelId === 'doge') {
        const parts = [];
        if (Number.isFinite(overlap)) {
            parts.push(`${overlap} of these ${stats.count} claims also appear under Confirmed Cancellations — the two panels overlap and must not be added together.`);
        }
        parts.push('DOGE is no longer active; this panel is a historical record of its claims and their outcomes.');
        return parts.join(' ');
    }

    if (stats.partials > 0) {
        // Breakdown comes from the data, never hardcoded — the split changes
        // as upstream reclassifies awards.
        const kinds = [];
        if (stats.descoped > 0) kinds.push(`${stats.descoped} descoped`);
        if (stats.closedOut > 0) kinds.push(`${stats.closedOut} closed out`);
        const breakdown = kinds.length ? ` (${kinds.join(', ')})` : '';

        return `Plus ${pluralCount(stats.partials, 'partial action')}${breakdown}, listed in the table with their own labels and excluded from the totals above.`;
    }
    return '';
}

/**
 * Value boxes for a panel — only boxes whose data exists
 *
 * A box with nothing to say is omitted rather than rendered as a dash: one
 * honest sentence under the row (see valueBoxNote) beats a grid of blanks.
 *
 * @param {'cancellations'|'doge'} panelId - Active panel
 * @param {Object} stats - That panel's stats object
 * @returns {Array<{title: string, value: string, icon: string, type: string}>}
 */
export function createPanelValueBoxes(panelId, stats) {
    if (panelId === 'doge') {
        return [
            {
                title: 'Claims made',
                value: stats.count.toLocaleString(),
                icon: ICONS.contracts,
                type: 'contracts'
            },
            {
                title: 'Savings claimed by DOGE',
                value: formatCurrency(stats.claimedSavings),
                icon: 'piggy-bank',
                type: 'value'
            },
            {
                title: 'Terminations found in federal records',
                value: stats.terminated.toLocaleString(),
                icon: 'file-earmark-check',
                type: 'recipients'
            },
            {
                title: 'Not found in federal records',
                value: stats.unmatched.toLocaleString(),
                icon: 'question-circle',
                type: 'districts'
            }
        ];
    }

    const boxes = [
        {
            title: 'Awards terminated',
            value: stats.confirmed.toLocaleString(),
            icon: ICONS.contracts,
            type: 'contracts'
        }
    ];

    // Number.isFinite, not a null check: an absent stats field (undefined)
    // must omit the box exactly like an unavailable column (null) does.
    if (Number.isFinite(stats.totalObligated)) {
        boxes.push({
            title: 'Obligated to terminated awards',
            value: formatCurrency(stats.totalObligated),
            icon: ICONS.value,
            type: 'value'
        });
    }
    if (Number.isFinite(stats.totalPotential)) {
        boxes.push({
            title: 'Total potential value',
            value: formatCurrency(stats.totalPotential),
            icon: 'graph-up',
            type: 'recipients'
        });
    }
    if (Number.isFinite(stats.districts)) {
        boxes.push({
            title: 'Congressional districts affected',
            value: stats.districts.toLocaleString(),
            icon: ICONS.districts,
            type: 'districts'
        });
    }

    return boxes;
}

/**
 * The caveat sentence under the value boxes
 *
 * DOGE's claimed-savings total never stands alone (the box above it shows
 * $78.6M; this line says what that number is made of). Confirmed panel: the
 * potential-value column is only partially filled upstream, so its sum reads
 * low — say so rather than let a careful reader catch it.
 *
 * @param {'cancellations'|'doge'} panelId - Active panel
 * @param {Object} stats - That panel's stats object
 * @returns {string} Plain-text note ('' when nothing needs saying)
 */
export function valueBoxNote(panelId, stats) {
    if (panelId === 'doge') {
        const parts = [];
        if (stats.claimedOnActive > 0) {
            parts.push(`${formatCurrency(stats.claimedOnActive)} of the claimed savings is attached to awards that remain active.`);
        }
        if (stats.noFigureCount > 0) {
            parts.push(`${stats.noFigureCount} of ${stats.count} claims list no savings figure.`);
        }
        parts.push('Savings figures are DOGE’s own claims, not verified amounts.');
        return parts.join(' ');
    }

    // Same universe as the box it qualifies: the potential-value box sums
    // confirmed awards only, so the fill fraction is confirmed-only too.
    if (stats.potentialFillCount !== undefined && stats.potentialFillCount < stats.confirmed) {
        return `Total potential value is reported for ${stats.potentialFillCount} of the ${stats.confirmed} confirmed awards, so its sum understates the true total.`;
    }
    return '';
}

/**
 * The DOGE outcome card's lead sentence
 *
 * States the check date and how the record-first rule played out — every
 * figure from the data, never hardcoded copy that rots as the file updates.
 *
 * @param {Object} stats - dogeStats() result
 * @returns {string} Plain-text lead
 */
export function outcomeLead(stats) {
    const checked = stats.checkedDate ? formatIsoDayLong(stats.checkedDate) : null;
    const parts = [
        'Each claim was checked against the award\'s federal transaction history'
            + (checked ? ` — last check ${checked}.` : '.'),
        'The outcome shown follows the federal record, not DOGE\'s label'
    ];

    if (stats.expiredButTerminated > 0) {
        parts[1] += `: ${pluralCount(stats.expiredButTerminated, 'award')} DOGE listed as "expired" show explicit termination actions.`;
    } else {
        parts[1] += '.';
    }

    return parts.join(' ');
}

/**
 * The note under the monthly timeline
 * @param {number} skipped - Rows without a usable action date
 * @returns {string} Plain-text note
 */
export function timelineNote(skipped) {
    const parts = ['Each award is bucketed by the date of its termination action in the federal record.'];
    if (skipped > 0) {
        parts.push(`${pluralCount(skipped, 'award')} lack a usable date and are not drawn.`);
    }
    return parts.join(' ');
}

/**
 * The summary sentence atop a district page
 * @param {number} terminations - Confirmed terminations listing the district
 * @param {number} claims - DOGE claims listing the district
 * @returns {string} Plain-text sentence
 */
export function districtSummaryLine(terminations, claims) {
    return `${pluralCount(terminations, 'confirmed termination')} and `
        + `${pluralCount(claims, 'DOGE claim')} list this district. `
        + 'The two lists overlap: an award can appear in both.';
}

/**
 * The empty-state line for a district page group with no rows
 * @param {'cancellations'|'doge'} panelId - Which dataset came up empty
 * @returns {string} Plain-text sentence
 */
export function districtEmptyNote(panelId) {
    return panelId === 'doge'
        ? 'No DOGE claims list this district.'
        : 'No confirmed terminations list this district.';
}

/**
 * View-model for one confirmed termination's award card
 *
 * The single source for what a termination card says: the dashboard's district
 * view and the baked static district pages both render from this model, so a
 * label rename or field change here reaches ~78 static pages and the live view
 * in one edit. Rows must be normalized (`normalizeTerminations`).
 *
 * Fields are data, not markup: `url` is null except on linkable values, and a
 * field whose `text` is '' is omitted by the renderers.
 *
 * @param {Object} row - Normalized termination row
 * @returns {{title: string, subtitle: string, badge: {label: string,
 *   className: string}, fields: Array<{label: string, text: string,
 *   url: string|null}>, description: string}} Card view-model
 */
export function terminationCardModel(row) {
    const meta = overrideMeta(row.override_status);

    return {
        title: (row._recipient || 'Unknown recipient').toUpperCase(),
        subtitle: placeLine(row),
        badge: { label: meta.label, className: `badge ${meta.badgeClass}` },
        fields: [
            { label: 'Award', text: row.award_id || MISSING, url: usaspendingUrl(row) },
            { label: 'Type', text: row.award_type || MISSING, url: null },
            { label: 'Action date', text: row.action_date || MISSING, url: null },
            {
                label: 'Obligated',
                text: row._obligated !== null ? formatCurrency(row._obligated, false) : '',
                url: null
            }
        ],
        description: row.transaction_description || row.award_description || ''
    };
}

/**
 * View-model for one DOGE claim's award card
 *
 * Same contract as `terminationCardModel`. Rows must be normalized
 * (`normalizeDogeClaims`), which guarantees `_outcome` is one of the four
 * OUTCOME_META keys and `_statusLabel` is never blank.
 *
 * @param {Object} row - Normalized DOGE claim row
 * @returns {{title: string, subtitle: string, badge: {label: string,
 *   className: string}, fields: Array<{label: string, text: string,
 *   url: string|null}>, description: string}} Card view-model
 */
export function claimCardModel(row) {
    return {
        title: (row._recipient || 'Unknown recipient').toUpperCase(),
        subtitle: placeLine(row),
        badge: {
            label: OUTCOME_META[row._outcome].short,
            className: `outcome-pill outcome-pill--${row._outcome}`
        },
        fields: [
            row.generated_award_id
                ? {
                      label: 'Award',
                      text: row.doge_award_id || row.generated_award_id,
                      url: usaspendingUrl(row)
                  }
                : { label: 'Award', text: MISSING, url: null },
            { label: 'Claim date', text: row.doge_claim_date || MISSING, url: null },
            {
                label: 'Claimed savings',
                text: row._savings ? formatCurrency(row._savings, false) : '',
                url: null
            },
            { label: "DOGE's stated status", text: row._statusLabel, url: null }
        ],
        description: row.latest_description || ''
    };
}

/**
 * Render the DOGE claims-vs-outcomes segmented bar
 *
 * Three segments on the validated red ordinal ramp (see SEGMENT_META in
 * doge-claims.js for the palette contract). Zero-count segments are dropped
 * from the bar but always shown in the legend.
 *
 * @param {{terminated: number, noTermination: number, unmatched: number}} mix - Zero-filled counts
 * @returns {string} HTML for the bar, or '' when the mix is empty
 */
export function renderOutcomeBar(mix) {
    const total = BAR_SEGMENTS.reduce((sum, key) => sum + mix[key], 0);
    if (total === 0) return '';

    const segments = BAR_SEGMENTS
        .filter((key) => mix[key] > 0)
        .map((key) => {
            const width = (mix[key] / total) * 100;
            return `<div class="seg-bar__segment ${SEGMENT_META[key].segClass}"`
                + ` style="width: ${width.toFixed(2)}%"></div>`;
        })
        .join('');

    const summary = BAR_SEGMENTS
        .map((key) => `${SEGMENT_META[key].label}: ${mix[key].toLocaleString()}`)
        .join(', ');

    return `<div class="seg-bar" role="img" aria-label="${escapeAttr(summary)}">${segments}</div>`;
}

/**
 * Render the outcome bar's legend, counts included
 *
 * Every segment appears, including the ones at zero, so a reader can tell an
 * absent outcome from an unlisted one.
 *
 * @param {{terminated: number, noTermination: number, unmatched: number}} mix - Zero-filled counts
 * @returns {string} HTML for the legend
 */
export function renderOutcomeLegend(mix) {
    const items = BAR_SEGMENTS.map((key) => {
        const zero = mix[key] === 0 ? ' seg-legend-item--zero' : '';

        return `<span class="seg-legend-item${zero}">`
            + `<span class="seg-swatch ${SEGMENT_META[key].segClass}"></span>`
            + `<span class="seg-legend-label">${escapeHtml(SEGMENT_META[key].label)}</span>`
            + `<span class="seg-legend-count">${mix[key].toLocaleString()}</span>`
            + '</span>';
    }).join('');

    return `<div class="seg-legend">${items}</div>`;
}

/**
 * Render the visible definitions list under the outcome legend
 *
 * Definitions as real text: title-attribute tooltips are dead on touch and
 * invisible to keyboards, and "Ended" undefined reads as "cancelled".
 *
 * @returns {string} HTML for the definitions list
 */
export function renderOutcomeDefinitions() {
    const items = BAR_SEGMENTS.map((key) => {
        const meta = SEGMENT_META[key];
        return `<li><span class="seg-term">${escapeHtml(meta.label)}</span> — ${escapeHtml(meta.description)}</li>`;
    }).join('');

    return `<ul class="seg-definitions">${items}</ul>`;
}
