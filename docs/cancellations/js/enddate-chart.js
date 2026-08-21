/**
 * End-Date Change Chart
 * D3.js arrow plot of how far each award's end date moved, for the Suspicious lens
 *
 * IMPORTANT: Rendering constraints
 * --------------------------------------------------------
 * 1. ONE ROW PER AWARD. Every measured award gets its own line, so a long view
 *    scrolls rather than aggregating. Binning the cuts would hide the thing the
 *    chart exists to show: that individual awards lost years at a time.
 *
 * 2. CUTS ONLY. The Suspicious lens excludes awards whose end date moved later,
 *    so every arrow here points the same way — left, from the original end date
 *    to the earlier current one.
 *
 * 3. FULL REDRAW. render() clears and rebuilds both SVGs on every call; a lens
 *    switch changes the row set and the date domain entirely.
 *
 * 4. NO ANIMATION. Marks appear statically, the same rule the timeline follows.
 *
 * 5. `d3` is a global from the CDN script tag and is referenced only inside
 *    methods, so this module stays importable in Node for wiring checks.
 */

import { escapeHtml, debounce, parseIsoDateUTC, pluralCount } from '../../shared/js/utils.js';
import {
    ChartTooltip,
    tooltipRow,
    formatUtcMonthShort,
    formatIsoDayLong
} from './chart-common.js';

/** Height of the fixed axis header, in px */
const AXIS_HEIGHT = 22;

/** Vertical space per award row, in px */
const ROW_HEIGHT = 18;

/** Height at which the body starts scrolling, in px */
const MAX_BODY_HEIGHT = 420;

/** Width of the recipient label gutter, in px */
const LABEL_GUTTER = 140;

/** Narrower label gutter used below NARROW_WIDTH, in px */
const LABEL_GUTTER_NARROW = 90;

/** Container width at or below which the narrow gutter applies, in px */
const NARROW_WIDTH = 480;

/** Space kept clear to the right of the plot, in px */
const MARGIN_RIGHT = 10;

/**
 * Approximate width of one character of the 11px label type, in px
 *
 * Sized for the worst case: federal recipient names are frequently ALL CAPS,
 * whose glyphs run wider than mixed case.
 */
const LABEL_CHAR_WIDTH = 7;

/** Radius of the hollow marker sitting on the original end date, in px */
const BASELINE_RADIUS = 3.5;

/** Length and half-width of the arrowhead at the current end date, in px */
const ARROW_LENGTH = 6;
const ARROW_HALF = 3.5;

/** Shortest connector drawn, so a one-day move is still visible, in px */
const MIN_SPAN = 4;

/** Resting opacity of every mark; hovering a row raises it to 1 */
const MARK_OPACITY = 0.85;

/** Horizontal space one axis label needs before ticks are thinned, in px */
const MIN_TICK_SPACE = 74;

/** Share of the date span added to each end so end marks are not clipped */
const DOMAIN_PAD = 0.03;

/** Fallback padding when every award moved between the same two dates, in ms */
const FALLBACK_PAD = 30 * 86400000;

export class EndDateChart {
    /**
     * Create an end-date change chart
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {string} options.ariaLabel - Base aria-label for the chart (default: 'End-date changes chart')
     * @param {string} [options.color] - Ink for every mark (default: the Suspicious lens orange)
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            ariaLabel: options.ariaLabel || 'End-date changes chart',
            color: options.color || 'var(--orange-500)'
        };

        this.wrapper = null;
        this.axisHost = null;
        this.scroll = null;
        this.tooltip = null;
        this.marksGroup = null;

        // Last render argument, replayed on resize
        this.items = null;

        this.width = 0;

        // Registered once so repeated render() calls cannot stack listeners.
        // The visibility guard matters: the card is hidden on three of the four
        // lenses, and a hidden container measures width 0 — rebuilding ~600
        // SVG nodes into it on every resize would be pure waste.
        this.handleResize = debounce(() => {
            if (this.items && this.container?.offsetParent !== null) {
                this.render(this.items);
            }
        }, 150);
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Render the chart, replacing any previous contents
     *
     * A full teardown and rebuild rather than a data join: the row set and the
     * date domain both change wholesale when the lens does.
     *
     * @param {Array<Object>} items - endDateChanges() items, already sorted:
     *   {row: Object, baseline: 'YYYY-MM-DD', current: 'YYYY-MM-DD', days: number}
     */
    render(items) {
        if (!this.container) return;

        this.items = items;

        this.container.innerHTML = '';
        this.wrapper = null;
        this.axisHost = null;
        this.scroll = null;
        this.tooltip = null;
        this.marksGroup = null;

        if (!Array.isArray(items) || items.length === 0) {
            this.renderEmpty();
            return;
        }

        this.setupDimensions();

        const bodyHeight = items.length * ROW_HEIGHT;

        this.buildShell(items);

        const chartWidth = this.width - this.gutterWidth(bodyHeight);
        const labelWidth = this.width <= NARROW_WIDTH ? LABEL_GUTTER_NARROW : LABEL_GUTTER;
        const plotRight = Math.max(labelWidth + MIN_SPAN * 4, chartWidth - MARGIN_RIGHT);

        const x = d3.scaleUtc()
            .domain(this.dateDomain(items))
            .range([labelWidth, plotRight]);

        const ticks = this.axisTicks(x, plotRight - labelWidth);

        const axisSvg = this.appendSvg(this.axisHost, 'enddate-axis-svg', chartWidth, AXIS_HEIGHT);
        const bodySvg = this.appendSvg(this.scroll, 'enddate-body-svg', chartWidth, bodyHeight);

        this.renderAxis(axisSvg, x, ticks);
        this.renderGridlines(bodySvg, x, ticks, bodyHeight);
        this.renderRows(bodySvg, items, x, labelWidth);
        this.renderHitRows(bodySvg, items, chartWidth);

        this.createTooltip();
    }

    /**
     * Remove the resize listener and clear the container
     */
    destroy() {
        window.removeEventListener('resize', this.handleResize);
        this.items = null;
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * Render the placeholder shown when no award's end date moved
     */
    renderEmpty() {
        const empty = document.createElement('p');
        empty.className = 'chart-empty';
        empty.textContent = 'No measurable end-date changes in this view.';
        this.container.appendChild(empty);
    }

    /**
     * Measure the container; width is responsive, height follows the row count
     */
    setupDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = Math.round(rect.width) || 640;
    }

    /**
     * Build the axis header and the scrolling body, wrapped for accessibility
     *
     * The axis lives outside the scrolling element so it stays put while the
     * rows move under it.
     *
     * @param {Array<Object>} items - Movements being plotted
     */
    buildShell(items) {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'enddate-chart';
        this.wrapper.setAttribute('role', 'img');
        this.wrapper.setAttribute('aria-label', this.describe(items));

        this.axisHost = document.createElement('div');
        this.axisHost.className = 'enddate-axis-host';

        this.scroll = document.createElement('div');
        this.scroll.className = 'enddate-scroll';
        this.scroll.style.maxHeight = `${MAX_BODY_HEIGHT}px`;

        this.wrapper.appendChild(this.axisHost);
        this.wrapper.appendChild(this.scroll);
        this.container.appendChild(this.wrapper);
    }

    /**
     * Width the scrollbar will take out of the body, in px
     *
     * Measured rather than assumed: overlay scrollbars take none, classic ones
     * take a dozen-odd pixels, and the axis has to line up with the rows either
     * way. Only measured when the body is actually tall enough to scroll.
     *
     * @param {number} bodyHeight - Height of the body SVG in px
     * @returns {number} Scrollbar width in px
     */
    gutterWidth(bodyHeight) {
        if (!this.scroll || bodyHeight <= MAX_BODY_HEIGHT) return 0;

        this.scroll.style.overflowY = 'scroll';
        const gutter = this.scroll.offsetWidth - this.scroll.clientWidth;
        this.scroll.style.overflowY = '';

        return Math.max(0, gutter);
    }

    /**
     * Append a sized SVG to a parent element
     * @param {HTMLElement} parent - Element to append to
     * @param {string} className - Class for the SVG
     * @param {number} width - Width in px
     * @param {number} height - Height in px
     * @returns {Object} D3 selection of the SVG
     */
    appendSvg(parent, className, width, height) {
        return d3.select(parent)
            .append('svg')
            .attr('class', className)
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .style('display', 'block');
    }

    /**
     * Compute the padded UTC date domain covering every baseline and current date
     *
     * Dates arrive as 'YYYY-MM-DD' strings and are split into UTC parts rather
     * than handed to `new Date`, whose local-timezone parsing of date-only
     * strings shifts them by a day.
     *
     * @param {Array<Object>} items - Movements being plotted
     * @returns {Array<Date>} Two-element [start, end] domain
     */
    dateDomain(items) {
        let min = Infinity;
        let max = -Infinity;

        // endDateChanges() guarantees both dates parse, so no null handling
        for (const item of items) {
            const baseline = parseIsoDateUTC(item.baseline);
            const current = parseIsoDateUTC(item.current);

            if (baseline < min) min = baseline;
            if (current < min) min = current;
            if (baseline > max) max = baseline;
            if (current > max) max = current;
        }

        // Zero span when every award moved between the same two dates
        const pad = (max - min) * DOMAIN_PAD || FALLBACK_PAD;

        return [new Date(min - pad), new Date(max + pad)];
    }

    /**
     * Choose axis tick dates, thinned to what the plot width can label
     *
     * D3 picks the interval — years or quarters over a long domain, finer over a
     * short one — and near-identical labels are collapsed the way the timeline
     * collapses repeated currency ticks.
     *
     * @param {Function} x - UTC time scale
     * @param {number} plotWidth - Plot width in px
     * @returns {Array<Date>} Tick dates
     */
    axisTicks(x, plotWidth) {
        const count = Math.max(2, Math.floor(plotWidth / MIN_TICK_SPACE));
        const seen = new Set();

        return x.ticks(count).filter((date) => {
            const label = formatUtcMonthShort(date);
            if (seen.has(label)) return false;
            seen.add(label);
            return true;
        });
    }

    /**
     * Render the fixed axis header: tick marks and their labels
     * @param {Object} svg - D3 selection of the header SVG
     * @param {Function} x - UTC time scale
     * @param {Array<Date>} ticks - Tick dates
     */
    renderAxis(svg, x, ticks) {
        const axis = svg.append('g').attr('class', 'enddate-axis');

        axis.selectAll('text.enddate-axis-label')
            .data(ticks)
            .join('text')
            .attr('class', 'enddate-axis-label')
            .attr('x', d => x(d))
            .attr('y', 11)
            .attr('dy', '0.32em')
            .attr('text-anchor', 'middle')
            .attr('font-size', 11)
            .attr('fill', 'var(--gray-600)')
            .text(d => formatUtcMonthShort(d));

        axis.selectAll('line.enddate-axis-tick')
            .data(ticks)
            .join('line')
            .attr('class', 'enddate-axis-tick')
            .attr('x1', d => x(d))
            .attr('x2', d => x(d))
            .attr('y1', AXIS_HEIGHT - 4)
            .attr('y2', AXIS_HEIGHT)
            .attr('stroke', 'var(--gray-300)')
            .attr('stroke-width', 1)
            .attr('shape-rendering', 'crispEdges');
    }

    /**
     * Render the recessive gridlines the rows are read against
     * @param {Object} svg - D3 selection of the body SVG
     * @param {Function} x - UTC time scale
     * @param {Array<Date>} ticks - Tick dates
     * @param {number} bodyHeight - Height of the body SVG in px
     */
    renderGridlines(svg, x, ticks, bodyHeight) {
        svg.append('g')
            .attr('class', 'enddate-gridlines')
            .selectAll('line.enddate-gridline')
            .data(ticks)
            .join('line')
            .attr('class', 'enddate-gridline')
            .attr('x1', d => x(d))
            .attr('x2', d => x(d))
            .attr('y1', 0)
            .attr('y2', bodyHeight)
            .attr('stroke', 'var(--gray-200)')
            .attr('stroke-width', 1)
            .attr('shape-rendering', 'crispEdges');
    }

    /**
     * Render one labelled arrow per award
     * @param {Object} svg - D3 selection of the body SVG
     * @param {Array<Object>} items - Movements being plotted
     * @param {Function} x - UTC time scale
     * @param {number} labelWidth - Width of the recipient gutter in px
     */
    renderRows(svg, items, x, labelWidth) {
        const maxChars = Math.max(4, Math.floor((labelWidth - 10) / LABEL_CHAR_WIDTH));

        const labels = svg.append('g').attr('class', 'enddate-labels');

        labels.selectAll('text.enddate-label')
            .data(items)
            .join('text')
            .attr('class', 'enddate-label')
            .attr('x', 0)
            .attr('y', (d, i) => this.rowCenter(i))
            .attr('dy', '0.32em')
            .attr('font-size', 11)
            .attr('fill', 'var(--gray-700)')
            .text(d => clip(recipientOf(d), maxChars))
            .append('title')
            .text(d => recipientOf(d));

        this.marksGroup = svg.append('g').attr('class', 'enddate-marks');

        const marks = this.marksGroup.selectAll('g.enddate-mark')
            .data(items)
            .join('g')
            .attr('class', 'enddate-mark')
            .attr('fill-opacity', MARK_OPACITY)
            .attr('stroke-opacity', MARK_OPACITY);

        marks.append('line')
            .attr('class', 'enddate-connector')
            .attr('x1', d => x(isoDate(d.baseline)))
            .attr('x2', d => this.arrowTip(d, x))
            .attr('y1', (d, i) => this.rowCenter(i))
            .attr('y2', (d, i) => this.rowCenter(i))
            .attr('stroke', this.options.color)
            .attr('stroke-width', 2);

        marks.append('circle')
            .attr('class', 'enddate-origin')
            .attr('cx', d => x(isoDate(d.baseline)))
            .attr('cy', (d, i) => this.rowCenter(i))
            .attr('r', BASELINE_RADIUS)
            .attr('fill', 'var(--color-surface, #FFFFFF)')
            .attr('stroke', this.options.color)
            .attr('stroke-width', 1.5);

        marks.append('path')
            .attr('class', 'enddate-arrowhead')
            .attr('d', (d, i) => this.arrowPath(d, x, this.rowCenter(i)))
            .attr('fill', this.options.color);
    }

    /**
     * Vertical centre of a row, in px
     * @param {number} index - Row index
     * @returns {number} Y coordinate of the row's centre line
     */
    rowCenter(index) {
        return index * ROW_HEIGHT + ROW_HEIGHT / 2;
    }

    /**
     * X coordinate of the arrow's point, floored to a visible span
     *
     * A cut of a day or two is real and must not collapse into the origin
     * marker, so the connector is stretched leftward to MIN_SPAN.
     *
     * @param {Object} d - One movement
     * @param {Function} x - UTC time scale
     * @returns {number} X coordinate of the arrow tip
     */
    arrowTip(d, x) {
        const from = x(isoDate(d.baseline));
        const to = x(isoDate(d.current));

        return Math.min(to, from - MIN_SPAN);
    }

    /**
     * Build the arrowhead triangle at the current end date
     * @param {Object} d - One movement
     * @param {Function} x - UTC time scale
     * @param {number} y - Row centre line
     * @returns {string} SVG path data
     */
    arrowPath(d, x, y) {
        const tip = this.arrowTip(d, x);
        const base = tip + ARROW_LENGTH;

        return `M${tip},${y} L${base},${y - ARROW_HALF} L${base},${y + ARROW_HALF} Z`;
    }

    /**
     * Render the invisible full-width hover targets, one per row
     *
     * A connector can be a few px long, so hover is driven by the whole row
     * rather than by the mark itself.
     *
     * @param {Object} svg - D3 selection of the body SVG
     * @param {Array<Object>} items - Movements being plotted
     * @param {number} chartWidth - Full SVG width in px
     */
    renderHitRows(svg, items, chartWidth) {
        svg.append('g')
            .attr('class', 'enddate-hit-rows')
            .selectAll('rect.enddate-hit-row')
            .data(items)
            .join('rect')
            .attr('class', 'enddate-hit-row')
            .attr('x', 0)
            .attr('y', (d, i) => this.rowCenter(i) - ROW_HEIGHT / 2)
            .attr('width', chartWidth)
            .attr('height', ROW_HEIGHT)
            .attr('fill', 'transparent')

            .on('mouseenter', (event, d) => {
                this.highlightRow(d);
                this.showTooltip(event, d);
            })
            .on('mousemove', (event) => this.positionTooltip(event))
            .on('mouseleave', () => {
                this.highlightRow(null);
                this.hideTooltip();
            });
    }

    /**
     * Deepen the hovered row's mark and restore the rest
     * @param {Object|null} item - Hovered movement, or null to clear
     */
    highlightRow(item) {
        if (!this.marksGroup) return;

        this.marksGroup.selectAll('g.enddate-mark')
            .attr('fill-opacity', d => (d === item ? 1 : MARK_OPACITY))
            .attr('stroke-opacity', d => (d === item ? 1 : MARK_OPACITY));
    }

    /**
     * Create the container-scoped tooltip
     *
     * Attached to the container, not the inner scroll element: an absolutely
     * positioned box inside a scroll container can extend its scrollable
     * overflow.
     */
    createTooltip() {
        this.tooltip = new ChartTooltip(this.container, 'enddate-tooltip');
    }

    /**
     * Populate and show the tooltip for one movement
     * @param {MouseEvent} event - Triggering event
     * @param {Object} d - One movement
     */
    showTooltip(event, d) {
        this.tooltip?.show(event, this.tooltipHtml(d));
    }

    /**
     * Build the tooltip markup
     *
     * Every value drawn from the ledger is escaped: recipient names and award
     * IDs are free text from the source data.
     *
     * @param {Object} d - One movement
     * @returns {string} Tooltip HTML
     */
    tooltipHtml(d) {
        return [
            `<div class="enddate-tooltip-name">${escapeHtml(recipientOf(d))}</div>`,
            `<div class="enddate-tooltip-id">${escapeHtml(fieldOf(d, 'Award ID')) || '—'}</div>`,
            tooltipRow('Originally', formatIsoDayLong(d.baseline)),
            tooltipRow('Now', formatIsoDayLong(d.current)),
            `<div class="enddate-tooltip-move">Cut by ${pluralCount(d.days, 'day')}</div>`
        ].join('');
    }

    /**
     * Reposition the tooltip as the cursor moves
     * @param {MouseEvent} event - Triggering event
     */
    positionTooltip(event) {
        this.tooltip?.move(event);
    }

    /**
     * Hide the tooltip
     */
    hideTooltip() {
        this.tooltip?.hide();
    }

    /**
     * Describe the whole chart for assistive technology
     * @param {Array<Object>} items - Movements being plotted
     * @returns {string} aria-label text
     */
    describe(items) {
        return `${this.options.ariaLabel}: ${pluralCount(items.length, 'award')} with end dates cut short.`;
    }

}

/**
 * Convert a 'YYYY-MM-DD' string to a Date the time scale can place
 *
 * endDateChanges() guarantees the string parses, so no fallback is needed.
 *
 * @param {string} value - ISO date string
 * @returns {Date} Date at UTC midnight
 */
function isoDate(value) {
    return new Date(parseIsoDateUTC(value));
}

/**
 * Read a ledger column off a movement's row
 * @param {Object} item - One movement
 * @param {string} key - Column name
 * @returns {string} Trimmed value, or '' when absent
 */
function fieldOf(item, key) {
    return String(item?.row?.[key] ?? '').trim();
}

/**
 * Read a movement's recipient name
 * @param {Object} item - One movement
 * @returns {string} Recipient name, or a stand-in when the row carries none
 */
function recipientOf(item) {
    return fieldOf(item, 'Recipient') || 'Unknown recipient';
}

/**
 * Hard-clip a label to a character budget
 *
 * A hard cut rather than a word-boundary truncation: the gutter is fixed width,
 * so overflowing it matters more than ending on a whole word.
 *
 * @param {string} text - Label text
 * @param {number} maxChars - Longest rendered length, ellipsis included
 * @returns {string} Text that fits the gutter
 */
function clip(text, maxChars) {
    const value = String(text || '');

    return value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`;
}
