/**
 * Shared Chart Helpers
 *
 * The pieces the dashboard's D3 charts (timeline-chart.js, enddate-chart.js)
 * have in common: timezone-safe date-label formatting and the container-scoped
 * hover tooltip. Each chart keeps its own scales, marks, axes, and tooltip
 * *content*; only the machinery lives here. A full base class would be
 * over-abstraction — the render pipelines genuinely differ.
 *
 * Formatters split date strings rather than handing them to `new Date`, whose
 * local-timezone parsing of date-only strings shifts them by a day.
 */

import { escapeHtml } from '../../shared/js/utils.js';

/** Full month names indexed by 1-based month number */
export const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/** Abbreviated month names indexed by 1-based month number */
export const MONTH_ABBR = MONTH_NAMES.map(name => name.slice(0, 3));

/**
 * Split a 'YYYY-MM' or 'YYYY-MM-DD' key into its parts
 * @param {string} value - Candidate month or date key
 * @returns {{year: string, index: number, day: number}} Parts; index is 0 when unparseable
 */
function splitIso(value) {
    const [year, monthPart, dayPart] = String(value || '').split('-');
    const index = parseInt(monthPart, 10);

    if (!year || !Number.isInteger(index) || index < 1 || index > 12) {
        return { year: '', index: 0, day: NaN };
    }

    return { year, index, day: parseInt(dayPart, 10) };
}

/**
 * Format a 'YYYY-MM' key as 'February 2025'
 * @param {string} month - Month key
 * @returns {string} Spelled-out month and year, or the raw value when unparseable
 */
export function formatIsoMonthLong(month) {
    const { year, index } = splitIso(month);
    return index ? `${MONTH_NAMES[index]} ${year}` : String(month || '');
}

/**
 * Format a 'YYYY-MM' key as 'Feb ’25'
 * @param {string} month - Month key
 * @returns {string} Abbreviated month and two-digit year, or the raw value when unparseable
 */
export function formatIsoMonthShort(month) {
    const { year, index } = splitIso(month);
    return index ? `${MONTH_ABBR[index]} ’${year.slice(-2)}` : String(month || '');
}

/**
 * Format a 'YYYY-MM-DD' string as 'February 10, 2025'
 * @param {string} value - ISO date string
 * @returns {string} Spelled-out date, or the raw value when unparseable
 */
export function formatIsoDayLong(value) {
    const { year, index, day } = splitIso(value);

    if (!index || !Number.isInteger(day)) return String(value || '');

    return `${MONTH_NAMES[index]} ${day}, ${year}`;
}

/**
 * Format a Date (e.g. a D3 tick) as 'Feb ’25' using its UTC parts
 * @param {Date} date - Tick date
 * @returns {string} Abbreviated month and two-digit year
 */
export function formatUtcMonthShort(date) {
    const year = String(date.getUTCFullYear());

    return `${MONTH_ABBR[date.getUTCMonth() + 1]} ’${year.slice(-2)}`;
}

/**
 * Build one label/value row of a chart tooltip
 * @param {string} label - Row label
 * @param {string} value - Row value
 * @returns {string} Escaped tooltip row HTML
 */
export function tooltipRow(label, value) {
    return '<div class="chart-tooltip-row">'
        + `<span class="chart-tooltip-label">${escapeHtml(label)}</span>`
        + `<span class="chart-tooltip-value">${escapeHtml(value)}</span>`
        + '</div>';
}

/**
 * Container-scoped hover tooltip shared by the charts
 *
 * Built on the `.map-tooltip` surface — absolute positioning, pointer-events:
 * none, `.visible`-driven opacity — so visibility is a class toggle alone.
 * Positioned against the container rather than the page so it can be clamped
 * inside the chart's own bounds, and measured once per show() rather than per
 * mousemove: offsetWidth/Height and getBoundingClientRect after a style write
 * each force a reflow, and neither the content size nor the container bounds
 * change during a hover.
 */
export class ChartTooltip {
    /**
     * Create the tooltip element inside a chart container
     * @param {HTMLElement} container - Chart container (given position: relative if static)
     * @param {string} [extraClass] - Chart-specific class hook (e.g. 'timeline-tooltip')
     */
    constructor(container, extraClass = '') {
        this.container = container;

        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const node = document.createElement('div');
        node.className = `map-tooltip${extraClass ? ` ${extraClass}` : ''}`;
        node.style.left = '0px';
        node.style.top = '0px';
        container.appendChild(node);
        this.node = node;

        this.width = 0;
        this.height = 0;
        this.bounds = null;
    }

    /**
     * Populate, measure, and show the tooltip
     * @param {MouseEvent} event - Triggering event
     * @param {string} html - Pre-escaped tooltip content
     */
    show(event, html) {
        this.node.innerHTML = html;
        this.node.classList.add('visible');

        this.width = this.node.offsetWidth;
        this.height = this.node.offsetHeight;
        this.bounds = this.container.getBoundingClientRect();

        this.move(event);
    }

    /**
     * Place the tooltip near the cursor, clamped to the container
     *
     * Flips to the left of the cursor near the right edge so the tooltip never
     * overflows the chart card.
     *
     * @param {MouseEvent} event - Triggering event
     */
    move(event) {
        const bounds = this.bounds;
        if (!bounds) return;

        const cursorX = event.clientX - bounds.left;
        const cursorY = event.clientY - bounds.top;
        const pad = 4;

        let left = cursorX + 14;
        if (left + this.width > bounds.width - pad) {
            left = cursorX - this.width - 14;
        }
        left = Math.max(pad, Math.min(left, bounds.width - this.width - pad));

        const top = Math.max(pad, Math.min(cursorY - this.height - 12, bounds.height - this.height - pad));

        this.node.style.left = `${left}px`;
        this.node.style.top = `${top}px`;
    }

    /**
     * Hide the tooltip
     */
    hide() {
        this.node.classList.remove('visible');
        this.bounds = null;
    }
}
