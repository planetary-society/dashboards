/**
 * Shared Chart Helpers
 *
 * The pieces the dashboard's D3 bar charts (timeline-chart.js, fy-chart.js)
 * have in common: timezone-safe date-label formatting, the bar/axis geometry
 * both charts compute identically, and the container-scoped hover tooltip.
 * Each chart keeps its own scales, marks, axes, and tooltip *content*; only the
 * machinery lives here. A full base class would be over-abstraction — the
 * render pipelines genuinely differ.
 *
 * Formatters split date strings rather than handing them to `new Date`, whose
 * local-timezone parsing of date-only strings shifts them by a day.
 *
 * The geometry helpers are pure functions of numbers (plus a D3 scale for
 * yTicks), so they carry no `d3` or `document` reference and this module stays
 * importable in Node for wiring checks.
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

/** Default minimum horizontal gap between bars, in px */
export const MIN_BAR_GAP = 2;

/** Default corner radius applied to the top of each bar, in px */
export const BAR_RADIUS = 3;

/**
 * Build a path for a bar with only its top corners rounded
 *
 * Bars are paths, not rects: a plain rect's `rx` would round the baseline
 * corners too, which detaches the bar from the axis.
 *
 * @param {number} x - Left edge
 * @param {number} y - Top edge
 * @param {number} width - Bar width
 * @param {number} height - Bar height
 * @param {number} [radius] - Requested corner radius in px, clamped to the bar
 * @returns {string} SVG path data
 */
export function topRoundedPath(x, y, width, height, radius = BAR_RADIUS) {
    const r = Math.max(0, Math.min(radius, width / 2, height));

    return [
        `M${x},${y + height}`,
        `V${y + r}`,
        `Q${x},${y} ${x + r},${y}`,
        `H${x + width - r}`,
        `Q${x + width},${y} ${x + width},${y + r}`,
        `V${y + height}`,
        'Z'
    ].join(' ');
}

/**
 * Band padding that keeps at least `minGap` px between bars
 *
 * Capped so dense views thin the bars rather than dissolving them.
 *
 * @param {number} innerWidth - Plot width in px
 * @param {number} count - Number of bands
 * @param {number} [minGap] - Minimum gap between bars in px
 * @returns {number} paddingInner fraction
 */
export function barPadding(innerWidth, count, minGap = MIN_BAR_GAP) {
    const step = innerWidth / Math.max(1, count);

    return Math.max(0.15, Math.min(0.7, minGap / step));
}

/**
 * Pick which bands get an x-axis label
 *
 * Labels are thinned to whatever the current width can fit without collisions;
 * the first and last band are always labelled so the span is readable at any
 * density. `minLabelSpace` is per chart, since it depends on how wide that
 * chart's label text runs ('Feb ’25' needs more room than 'YYYY').
 *
 * @param {number} count - Number of bands
 * @param {number} step - Band step in px
 * @param {number} minLabelSpace - Minimum horizontal space one label needs, in px
 * @returns {Array<number>} Ascending band indices to label
 */
export function labelIndices(count, step, minLabelSpace) {
    if (count <= 1) return [0];

    const every = Math.max(1, Math.ceil(minLabelSpace / Math.max(1, step)));
    const indices = [];
    for (let i = 0; i < count; i += every) {
        indices.push(i);
    }

    const last = count - 1;
    if (indices[indices.length - 1] !== last) {
        // The final index always crowds the stride's tail: the gap is
        // (count-1) mod every, necessarily < every. So the previous label
        // is dropped unconditionally (when one exists) to make room.
        if (indices.length > 1) {
            indices.pop();
        }
        indices.push(last);
    }

    return indices;
}

/**
 * Choose y-axis tick values, ~`count` of them
 *
 * Both charts plot whole things (actions, awards), so fractional ticks are
 * dropped rather than formatted away.
 *
 * @param {Function} y - D3 linear y scale
 * @param {number} [count] - Requested tick count
 * @returns {Array<number>} Tick values
 */
export function yTicks(y, count = 4) {
    const whole = [...new Set(y.ticks(count).filter(Number.isInteger))];

    return whole.length > 0 ? whole : [0, Math.ceil(y.domain()[1])];
}

/**
 * Draw y-axis gridlines and labels (no axis line)
 *
 * Both column charts want the same axis — whole-number ticks, full-width
 * gridlines, right-aligned labels outside the plot — and differ only in the
 * class prefix their CSS hooks use, so that is the one parameter.
 *
 * `d3` is a global from the CDN script tag; this function is only ever called
 * from a render path, so the module stays importable in Node.
 *
 * @param {Object} plot - D3 selection of the plot group
 * @param {Function} y - D3 linear y scale
 * @param {number} innerWidth - Plot width in px
 * @param {string} prefix - CSS class prefix, e.g. 'fy' or 'timeline'
 */
export function renderYAxis(plot, y, innerWidth, prefix) {
    const format = d3.format('d');
    const ticks = yTicks(y);

    const axis = plot.append('g').attr('class', `${prefix}-y-axis`);

    axis.selectAll(`line.${prefix}-gridline`)
        .data(ticks)
        .join('line')
        .attr('class', `${prefix}-gridline`)
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', d => y(d))
        .attr('y2', d => y(d))
        .attr('stroke', 'var(--gray-200)')
        .attr('stroke-width', 1)
        .attr('shape-rendering', 'crispEdges');

    axis.selectAll(`text.${prefix}-y-label`)
        .data(ticks)
        .join('text')
        .attr('class', `${prefix}-y-label`)
        .attr('x', -8)
        .attr('y', d => y(d))
        .attr('dy', '0.32em')
        .attr('text-anchor', 'end')
        .attr('font-size', 11)
        .attr('fill', 'var(--gray-600)')
        .text(format);
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
