/**
 * Panel Views Module
 *
 * Display copy and view-model builders for the two panels (Confirmed
 * Cancellations / DOGE Claims). Pure functions over plain objects — no DOM
 * reads, no fetches — so everything here is importable and testable in Node.
 * app.js owns the DOM; this module owns what the panels say.
 *
 * Editorial rules encoded here (from the 2026-08 review, trimmed in the
 * copy declutter):
 *  - Counts live in the value boxes — never in the panel-bar tab labels,
 *    where a screenshot would show addable numbers. panelHeadline() survives
 *    as the screen-reader panel announcement.
 *  - Per-figure caveats ride their value box as a hover/focus note.
 *  - DOGE's claimed-savings total is never rendered without its caveats.
 *  - Segment definitions are visible text, not title-attribute tooltips.
 */

import { formatCount, formatCurrency, escapeHtml, escapeAttr, pluralCount } from '../../shared/js/utils.js';
import { ICONS, DATA_URLS } from '../../shared/js/constants.js';
import { MISSING, placeLine, usaspendingUrl } from './panel-common.js';
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
        tableHeading: 'All awards explicitly terminated for "convenience" since January 2025.',
        hasMap: true
    },
    doge: {
        label: 'DOGE Claims',
        unitLabel: 'Claims',
        downloadUrl: DATA_URLS.dogeClaims,
        tableHeading: 'Award terminations claimed by DOGE.',
        hasMap: false
    }
};

/**
 * One-sentence panel summary: the count beside the noun it counts
 *
 * No longer rendered as a visible heading (the value boxes carry the counts);
 * app.js uses it for the screen-reader announcement on panel switches.
 *
 * @param {'cancellations'|'doge'} panelId - Active panel
 * @param {Object} stats - That panel's stats object
 * @returns {string} Plain-text summary
 */
export function panelHeadline(panelId, stats) {
    if (panelId === 'doge') {
        return `${pluralCount(stats.count, 'cancellation claim')} by DOGE`;
    }
    return `${pluralCount(stats.confirmed, 'NASA award')} terminated since January 2025`;
}

/**
 * The page's meta description — the one place a crawler reads real figures
 *
 * The dashboard's numbers are rendered by JavaScript, so a crawler that never
 * executes it sees no counts on the page itself. This sentence is baked into
 * the description/og:description/twitter:description attributes, which is why
 * it leads with the figures rather than describing the tool.
 *
 * Kept under ~160 characters: search results truncate past that, and a sentence
 * cut mid-clause reads as neglect. The freshness signal is deliberately left
 * out — JSON-LD carries `dateModified`, and a date here would cost a quarter of
 * the budget to say what the structured data already says.
 *
 * Built from `panelHeadline` so the crawler's first clause and the screen
 * reader's panel announcement can never state different counts.
 *
 * @param {Object} terminations - terminationStats() result
 * @param {Object} claims - dogeStats() result
 * @returns {string} Plain-text description
 */
export function metaDescription(terminations, claims) {
    const clauses = [panelHeadline('cancellations', terminations)];

    if (Number.isFinite(terminations.totalPotential) && Number.isFinite(terminations.districts)) {
        clauses.push(
            `${formatCurrency(terminations.totalPotential)} across `
            + `${pluralCount(terminations.districts, 'congressional district')}`
        );
    }

    return `${clauses.join(' — ')}, plus `
        + `${pluralCount(claims.count, 'DOGE claim')} checked against the federal record.`;
}

/**
 * Value boxes for a panel — only boxes whose data exists
 *
 * A box with nothing to say is omitted rather than rendered as a dash. Caveats
 * a figure cannot stand without ride the box itself as a hover/focus note (see
 * `note` in value-box.js), never a separate line the eye has to pair back up
 * with the number it qualifies.
 *
 * @param {'cancellations'|'doge'} panelId - Active panel
 * @param {Object} stats - That panel's stats object
 * @returns {Array<{title: string, value: string, icon: string, type: string, note?: string}>}
 */
export function createPanelValueBoxes(panelId, stats) {
    if (panelId === 'doge') {
        return [
            {
                title: 'Terminations claimed by DOGE',
                value: formatCount(stats.count),
                icon: ICONS.contracts,
                type: 'contracts'
            },
            {
                title: 'In savings claimed by DOGE',
                value: formatCurrency(stats.claimedSavings),
                icon: 'piggy-bank',
                type: 'value',
                note: claimedSavingsNote(stats)
            },
            {
                title: 'Terminations confirmed in federal records',
                value: formatCount(stats.terminated),
                icon: 'file-earmark-check',
                type: 'recipients'
            },
            {
                title: 'Calculated savings from confirmed terminations',
                value: formatCurrency(stats.calculatedSavings),
                icon: 'scissors',
                type: 'districts',
                note: calculatedSavingsNote(stats)
            }
        ];
    }

    const boxes = [
        {
            title: 'Awards terminated since Jan 2025',
            value: formatCount(stats.confirmed),
            icon: ICONS.contracts,
            type: 'contracts'
        }
    ];

    // Number.isFinite, not a null check: an absent stats field (undefined)
    // must omit the box exactly like an unavailable column (null) does.
    if (Number.isFinite(stats.totalPotential)) {
        // The total mixes two bases — contract ceilings and, for grants, the
        // obligated amount — so the box always says so. The coverage clause is
        // added only when an award contributed neither. Both ride the box
        // itself as a hover/focus note.
        const covered = stats.potentialFillCount;
        const note = 'Contract ceilings plus obligations on grants, which report no ceiling.'
            + (covered < stats.confirmed
                ? ` Covers ${formatCount(covered)} of the ${formatCount(stats.confirmed)} awards.`
                : '');

        boxes.push({
            title: 'Total potential value',
            value: formatCurrency(stats.totalPotential),
            icon: 'graph-up',
            type: 'value',
            note
        });
    }
    if (Number.isFinite(stats.recipients)) {
        boxes.push({
            title: 'Recipients impacted',
            value: formatCount(stats.recipients),
            icon: ICONS.recipients,
            type: 'recipients'
        });
    }
    if (Number.isFinite(stats.districts)) {
        boxes.push({
            title: 'Congressional districts affected',
            value: formatCount(stats.districts),
            icon: ICONS.districts,
            type: 'districts'
        });
    }

    return boxes;
}

/**
 * The caveat riding the claimed-savings box
 *
 * DOGE's total never stands alone: the clauses say what is inside it — money
 * claimed against awards the record still shows as running, and claims that
 * carry no figure at all. Both clauses are data-conditional; the base sentence
 * is not, because the number is DOGE's own claim whatever else is true of it.
 *
 * @param {Object} stats - dogeStats() result
 * @returns {string} Plain-text note
 */
function claimedSavingsNote(stats) {
    const clauses = [];
    if (stats.claimedOnActive > 0) {
        clauses.push(`${formatCurrency(stats.claimedOnActive)} sits on awards still active`);
    }
    if (stats.noFigureCount > 0) {
        clauses.push(`${formatCount(stats.noFigureCount)} of ${formatCount(stats.count)} claims list no figure`);
    }

    const base = 'Savings figures are DOGE’s own claims';
    return clauses.length ? `${base} — ${clauses.join(', and ')}.` : `${base}.`;
}

/**
 * The caveat riding the calculated-savings box
 *
 * Says what the figure is (ceiling less what was already obligated) and which
 * claims it covers, since the awards still inside their period of performance
 * are deliberately excluded — nothing has been saved on those yet.
 *
 * @param {Object} stats - dogeStats() result
 * @returns {string} Plain-text note
 */
function calculatedSavingsNote(stats) {
    const base = 'Award ceilings less what they had already obligated, for the claims whose awards stopped';

    return Number.isFinite(stats.calculatedSavingsCount)
        ? `${base} — ${pluralCount(stats.calculatedSavingsCount, 'claim')} of ${formatCount(stats.count)}.`
        : `${base}.`;
}

/**
 * The summary sentence atop a district page
 * @param {number} terminations - Confirmed terminations listing the district
 * @param {number} claims - DOGE claims listing the district
 * @returns {string} Plain-text sentence
 */
export function districtSummaryLine(terminations, claims) {
    return `${pluralCount(terminations, 'confirmed termination')} and `
        + `${pluralCount(claims, 'DOGE claim')} list this district; `
        + 'an award can appear in both.';
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
 * Badge view-model for a confirmed termination's status
 *
 * One definition serving the panel table, the district-view cards, and the
 * baked static pages, so an award's status cannot read one way in the table and
 * another on its card.
 *
 * @param {Object} row - Normalized termination row
 * @returns {{label: string, className: string}} Badge view-model
 */
export function terminationBadgeModel(row) {
    const meta = overrideMeta(row.override_status);

    return { label: meta.label, className: `badge ${meta.badgeClass}` };
}

/**
 * Badge view-model for what the federal record shows about a DOGE claim
 *
 * The same four-way rubric the summary bar segments by — `claimOutcome` decides
 * it once per row, and every surface that shows a claim's status reads it from
 * here, so the table, the cards and the chart can never disagree.
 *
 * @param {Object} row - Normalized DOGE claim row
 * @returns {{label: string, className: string}} Badge view-model
 */
export function claimBadgeModel(row) {
    const meta = OUTCOME_META[row?._outcome];

    if (!meta) {
        return { label: MISSING, className: 'badge badge--excluded' };
    }

    return { label: meta.short, className: `badge ${meta.badgeClass}` };
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
    return {
        title: (row._recipient || 'Unknown recipient').toUpperCase(),
        subtitle: placeLine(row),
        badge: terminationBadgeModel(row),
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
        badge: claimBadgeModel(row),
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
 * @param {Object<string, number>} mix - Zero-filled counts
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
        .map((key) => `${SEGMENT_META[key].label}: ${formatCount(mix[key])}`)
        .join(', ');

    return `<div class="seg-bar" role="img" aria-label="${escapeAttr(summary)}">${segments}</div>`;
}

/**
 * Render the outcome bar's legend, counts included
 *
 * Every segment appears, including the ones at zero, so a reader can tell an
 * absent outcome from an unlisted one.
 *
 * @param {Object<string, number>} mix - Zero-filled counts
 * @returns {string} HTML for the legend
 */
export function renderOutcomeLegend(mix) {
    const items = BAR_SEGMENTS.map((key) => {
        const zero = mix[key] === 0 ? ' seg-legend-item--zero' : '';

        return `<span class="seg-legend-item${zero}">`
            + `<span class="seg-swatch ${SEGMENT_META[key].segClass}"></span>`
            + `<span class="seg-legend-label">${escapeHtml(SEGMENT_META[key].label)}</span>`
            + `<span class="seg-legend-count">${formatCount(mix[key])}</span>`
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
