/**
 * Monthly Timeline Bar Chart
 * D3.js column chart of monthly ledger activity for the cancellations dashboard
 *
 * IMPORTANT: Rendering constraints
 * --------------------------------------------------------
 * 1. COUNTS ONLY. The chart plots actions per month against a single y-axis.
 *    The old count/dollars toggle is gone: 129 of the 177 confirmed
 *    terminations carry a zero transaction amount, so a dollars view described
 *    a quarter of the corpus and implied it was all of it.
 *
 * 2. FULL REDRAW. render() clears and rebuilds the SVG on every call because
 *    panel switches change the month domain entirely; there is no stable key to
 *    join against across views.
 *
 * 3. NO ANIMATION. Bars appear statically. The chart re-renders on every panel
 *    change, so transitions would read as noise, not motion.
 *
 * 4. `d3` is a global from the CDN script tag and is referenced only inside
 *    methods, so this module stays importable in Node for wiring checks.
 */

import { formatCurrency, escapeHtml, debounce } from '../../shared/js/utils.js';
import {
    ChartTooltip,
    tooltipRow,
    formatIsoMonthLong,
    formatIsoMonthShort,
    topRoundedPath,
    barPadding,
    labelIndices,
    renderYAxis
} from './chart-common.js';

/** Chart margins; left is sized for integer count labels */
const MARGIN = { top: 12, right: 8, bottom: 26, left: 34 };

/** Minimum horizontal space an x-axis label needs before labels are thinned, in px */
const MIN_LABEL_SPACE = 46;

/** Maximum top awards listed in the tooltip */
const MAX_TOP_AWARDS = 3;

export class TimelineChart {
    /**
     * Create a monthly timeline bar chart
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {number} options.height - Overall SVG height in px (default: 260)
     * @param {string} options.ariaLabel - Base aria-label for the SVG (default: 'Monthly activity chart')
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            height: options.height || 260,
            ariaLabel: options.ariaLabel || 'Monthly activity chart'
        };

        this.svg = null;
        this.tooltip = null;
        this.barsGroup = null;

        // Last render arguments, replayed on resize
        this.months = null;
        this.renderOptions = null;

        this.width = 0;
        this.height = this.options.height;

        // Registered once so repeated render() calls cannot stack listeners.
        // The visibility guard matters: this card is hidden while other panels
        // are showing, and a hidden container measures width 0 — rebuilding into
        // it on every resize would draw a chart nobody can see, at the fallback
        // width, which then persists when the panel comes back.
        this.handleResize = debounce(() => {
            if (this.months && this.container?.offsetParent !== null) {
                this.render(this.months, this.renderOptions);
            }
        }, 150);
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Render the chart, replacing any previous contents
     *
     * Called on every panel switch, so it is a full teardown and rebuild rather
     * than a data join.
     *
     * A stray `metric` key in `config` is accepted and ignored: the toggle it
     * belonged to is gone, and refusing the key would break callers for nothing.
     *
     * @param {Array<Object>} months - Ascending, gap-filled months:
     *   {month: 'YYYY-MM', count: number, top?: Array<{recipient: string, amount: number}>}
     * @param {Object} config - Render configuration
     * @param {string} config.barColor - SVG fill for bars, CSS vars allowed (default: 'var(--red-500)')
     * @param {string} config.countLabel - Label for the row count in the tooltip (default: 'Awards')
     */
    render(months, { barColor = 'var(--red-500)', countLabel = 'Awards' } = {}) {
        if (!this.container) return;

        this.months = months;
        this.renderOptions = { barColor, countLabel };

        this.container.innerHTML = '';
        this.svg = null;
        this.tooltip = null;
        this.barsGroup = null;

        if (!Array.isArray(months) || months.length === 0) {
            this.renderEmpty();
            return;
        }

        this.setupDimensions();
        this.createSvg(months);
        this.createTooltip();

        const innerWidth = Math.max(1, this.width - MARGIN.left - MARGIN.right);
        const innerHeight = Math.max(1, this.height - MARGIN.top - MARGIN.bottom);

        const value = (d) => (Number.isFinite(d.count) ? d.count : 0);
        const maxValue = d3.max(months, value) || 0;

        const x = d3.scaleBand()
            .domain(months.map(d => d.month))
            .range([0, innerWidth])
            .paddingInner(barPadding(innerWidth, months.length))
            .paddingOuter(0.1);

        const y = d3.scaleLinear()
            .domain([0, maxValue > 0 ? maxValue : 1])
            .nice(4)
            .range([innerHeight, 0]);

        const plot = this.svg.append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

        renderYAxis(plot, y, innerWidth, 'timeline');
        this.renderBars(plot, months, x, y, innerHeight, value, barColor);
        this.renderXAxis(plot, months, x, innerHeight);
        this.renderHitBands(plot, months, x, innerWidth, innerHeight);
    }

    /**
     * Remove the resize listener and clear the container
     */
    destroy() {
        window.removeEventListener('resize', this.handleResize);
        this.months = null;
        this.renderOptions = null;
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * Render the placeholder shown when a view has no dated months
     */
    renderEmpty() {
        const empty = document.createElement('p');
        empty.className = 'chart-empty';
        empty.textContent = 'No dated actions in this view.';
        this.container.appendChild(empty);
    }

    /**
     * Measure the container; width is responsive, height is fixed by option
     */
    setupDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = Math.round(rect.width) || 640;
        this.height = this.options.height;
    }

    /**
     * Create the SVG element with its accessible description
     * @param {Array<Object>} months - Month records being plotted
     */
    createSvg(months) {
        const span = months.length === 1
            ? formatIsoMonthLong(months[0].month)
            : `${formatIsoMonthLong(months[0].month)} to ${formatIsoMonthLong(months[months.length - 1].month)}`;

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('class', 'timeline-chart-svg')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('role', 'img')
            .attr('aria-label', `${this.options.ariaLabel}: number of actions by month, ${span}`)
            .style('width', '100%')
            .style('height', 'auto')
            .style('display', 'block');
    }

    /**
     * Create the container-scoped tooltip
     */
    createTooltip() {
        this.tooltip = new ChartTooltip(this.container, 'timeline-tooltip');
    }

    /**
     * Render the bars
     *
     * Bars are paths, not rects: a plain rect's `rx` would round the baseline
     * corners too, which detaches the bar from the axis.
     *
     * @param {Object} plot - D3 selection of the plot group
     * @param {Array<Object>} months - Month records
     * @param {Function} x - Band scale
     * @param {Function} y - Y scale
     * @param {number} innerHeight - Plot height in px
     * @param {Function} value - Accessor for the plotted value
     * @param {string} barColor - SVG fill string
     */
    renderBars(plot, months, x, y, innerHeight, value, barColor) {
        const bandWidth = x.bandwidth();

        this.barsGroup = plot.append('g').attr('class', 'timeline-bars');

        this.barsGroup.selectAll('path.timeline-bar')
            .data(months.filter(d => value(d) > 0), d => d.month)
            .join('path')
            .attr('class', 'timeline-bar')
            .attr('d', (d) => {
                // Floor at 1.5px so a small but non-zero month stays visible
                const barHeight = Math.max(1.5, innerHeight - y(value(d)));
                return topRoundedPath(x(d.month), innerHeight - barHeight, bandWidth, barHeight);
            })
            .attr('fill', barColor)
            .attr('fill-opacity', 0.9);
    }

    /**
     * Render x-axis month labels and ticks (no axis line)
     * @param {Object} plot - D3 selection of the plot group
     * @param {Array<Object>} months - Month records
     * @param {Function} x - Band scale
     * @param {number} innerHeight - Plot height in px
     */
    renderXAxis(plot, months, x, innerHeight) {
        const indices = labelIndices(months.length, x.step(), MIN_LABEL_SPACE);
        const axis = plot.append('g')
            .attr('class', 'timeline-x-axis')
            .attr('transform', `translate(0,${innerHeight})`);

        const labelled = indices.map(i => months[i]);
        const center = (d) => x(d.month) + x.bandwidth() / 2;

        axis.selectAll('line.timeline-x-tick')
            .data(labelled)
            .join('line')
            .attr('class', 'timeline-x-tick')
            .attr('x1', center)
            .attr('x2', center)
            .attr('y1', 0)
            .attr('y2', 3)
            .attr('stroke', 'var(--gray-300)')
            .attr('stroke-width', 1);

        axis.selectAll('text.timeline-x-label')
            .data(labelled)
            .join('text')
            .attr('class', 'timeline-x-label')
            .attr('x', center)
            .attr('y', 15)
            .attr('dy', '0.32em')
            .attr('text-anchor', 'middle')
            .attr('font-size', 11)
            .attr('fill', 'var(--gray-600)')
            .text(d => formatIsoMonthShort(d.month));
    }

    /**
     * Render the invisible full-height hover targets
     *
     * Bars can be a few px wide, so hover is driven by a band covering the
     * month's full column rather than by the bar itself.
     *
     * @param {Object} plot - D3 selection of the plot group
     * @param {Array<Object>} months - Month records
     * @param {Function} x - Band scale
     * @param {number} innerWidth - Plot width in px
     * @param {number} innerHeight - Plot height in px
     */
    renderHitBands(plot, months, x, innerWidth, innerHeight) {
        const gap = x.step() - x.bandwidth();
        const bandX = d => Math.max(0, x(d.month) - gap / 2);

        plot.append('g')
            .attr('class', 'timeline-hit-bands')
            .selectAll('rect.timeline-hit-band')
            .data(months, d => d.month)
            .join('rect')
            .attr('class', 'timeline-hit-band')
            .attr('x', bandX)
            .attr('y', 0)
            .attr('width', d => Math.min(x.step(), innerWidth - bandX(d)))
            .attr('height', innerHeight)
            .attr('fill', 'transparent')
            .style('cursor', 'default')
            .on('mouseenter', (event, d) => {
                this.highlightBar(d.month);
                this.showTooltip(event, d);
            })
            .on('mousemove', (event) => this.positionTooltip(event))
            .on('mouseleave', () => {
                this.highlightBar(null);
                this.hideTooltip();
            });
    }

    /**
     * Deepen the hovered bar and restore the rest
     * @param {string|null} month - 'YYYY-MM' of the hovered month, or null to clear
     */
    highlightBar(month) {
        if (!this.barsGroup) return;
        this.barsGroup.selectAll('path.timeline-bar')
            .attr('fill-opacity', d => (d.month === month ? 1 : 0.9));
    }

    /**
     * Populate and show the tooltip for a month
     * @param {MouseEvent} event - Triggering event
     * @param {Object} d - Month record
     */
    showTooltip(event, d) {
        this.tooltip?.show(event, this.tooltipHtml(d));
    }

    /**
     * Build the tooltip markup
     *
     * Every value drawn from the ledger is escaped: recipient names are free
     * text from the source data.
     *
     * @param {Object} d - Month record
     * @returns {string} Tooltip HTML
     */
    tooltipHtml(d) {
        const { countLabel } = this.renderOptions;
        const count = Number.isFinite(d.count) ? d.count : 0;
        const top = Array.isArray(d.top) ? d.top.slice(0, MAX_TOP_AWARDS) : [];

        const rows = [
            `<div class="timeline-tooltip-month">${escapeHtml(formatIsoMonthLong(d.month))}</div>`,
            tooltipRow(countLabel, String(count))
        ];

        if (top.length > 0) {
            const items = top.map(award => (
                `<li class="timeline-tooltip-top-item">` +
                    `<span class="timeline-tooltip-top-name">${escapeHtml(award?.recipient || 'Unknown recipient')}</span>` +
                    `<span class="timeline-tooltip-top-amount">${escapeHtml(formatCurrency(award?.amount, true, 1))}</span>` +
                `</li>`
            )).join('');
            rows.push(`<ul class="timeline-tooltip-top">${items}</ul>`);
        }

        return rows.join('');
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
}
