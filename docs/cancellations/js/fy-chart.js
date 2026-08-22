/**
 * Fiscal-Year Awards Bar Chart
 *
 * D3.js column chart of NASA *awards* cancelled for convenience by federal
 * fiscal year. A deliberate fork of timeline-chart.js rather than an option on
 * it — the two charts share machinery (chart-common.js) but not a purpose.
 *
 * The chart carries no visible label of its own. It plots a wider population
 * than the panel it sits on (all of NASA, every administration, fiscal years
 * rather than the January 20, 2025 cut) — that qualifier now lives only in the
 * About tab and in the SVG's aria-label.
 *
 * IMPORTANT: Rendering constraints
 * --------------------------------------------------------
 * 1. COUNTS ONLY. One series, one y-axis, no metric toggle, no dollars.
 *
 * 2. FULL REDRAW. render() clears and rebuilds the SVG on every call. The
 *    series is tiny (7 bars) and only ever redrawn on resize, so a data join
 *    would buy nothing.
 *
 * 3. NO ANIMATION.
 *
 * 4. `d3` is a global from the CDN script tag and is referenced only inside
 *    methods, so this module stays importable in Node for wiring checks.
 */

import { escapeHtml, debounce } from '../../shared/js/utils.js';
import {
    ChartTooltip,
    tooltipRow,
    topRoundedPath,
    barPadding,
    labelIndices,
    renderYAxis
} from './chart-common.js';

/**
 * Chart margins. `top` is headroom for the topmost y-axis label, which is
 * centred on its gridline and would otherwise clip. `left` is sized for
 * three-digit integer counts, not currency.
 */
const MARGIN = { top: 10, right: 8, bottom: 26, left: 34 };

/** Minimum horizontal space a 'YYYY' x-axis label needs before thinning, in px */
const MIN_LABEL_SPACE = 34;

/** Fill opacity for complete and in-progress fiscal years */
const FULL_OPACITY = 0.9;
const PARTIAL_OPACITY = 0.45;

/** Dash pattern marking an in-progress fiscal year without relying on colour */
const PARTIAL_DASH = '3 2';

export class FyChart {
    /**
     * Create a fiscal-year bar chart
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {number} options.height - SVG height in px (default: 260)
     * @param {string} options.ariaLabel - Base aria-label for the SVG
     * @param {string} options.barColor - SVG fill for bars, CSS vars allowed
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            height: options.height || 260,
            ariaLabel: options.ariaLabel || 'Awards cancelled for convenience by fiscal year',
            barColor: options.barColor || 'var(--red-500)'
        };

        this.svg = null;
        this.tooltip = null;
        this.barsGroup = null;

        // Last render arguments, replayed on resize
        this.items = null;
        this.renderOptions = null;

        this.width = 0;
        this.height = this.options.height;

        // Registered once so repeated render() calls cannot stack listeners.
        // The visibility guard matters: this card is hidden on the DOGE panel,
        // and a hidden container measures width 0 — rebuilding into it on every
        // resize would draw a chart nobody can see, at the wrong size.
        this.handleResize = debounce(() => {
            if (this.items && this.container?.offsetParent !== null) {
                this.render(this.items, this.renderOptions);
            }
        }, 150);
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Render the chart, replacing any previous contents
     *
     * @param {Array<Object>} items - Ascending fiscal years from parseFyAwards:
     *   {fy: number, count: number, partial: boolean}
     * @param {Object} config - Render configuration
     * @param {string} config.barColor - SVG fill for bars (default: the constructor's)
     * @param {string} config.countLabel - Label for the count row in the tooltip (default: 'Awards')
     */
    render(items, { barColor = this.options.barColor, countLabel = 'Awards' } = {}) {
        if (!this.container) return;

        this.items = items;
        this.renderOptions = { barColor, countLabel };

        this.container.innerHTML = '';
        this.svg = null;
        this.tooltip = null;
        this.barsGroup = null;

        if (!Array.isArray(items) || items.length === 0) {
            this.renderEmpty();
            return;
        }

        this.setupDimensions();

        const innerWidth = Math.max(1, this.width - MARGIN.left - MARGIN.right);
        const innerHeight = Math.max(1, this.height - MARGIN.top - MARGIN.bottom);

        this.createSvg(items);
        this.createTooltip();

        const value = (d) => (Number.isFinite(d.count) ? d.count : 0);
        const maxValue = d3.max(items, value) || 0;

        const x = d3.scaleBand()
            .domain(items.map(d => d.fy))
            .range([0, innerWidth])
            .paddingInner(barPadding(innerWidth, items.length))
            .paddingOuter(0.1);

        const y = d3.scaleLinear()
            .domain([0, maxValue > 0 ? maxValue : 1])
            .nice(4)
            .range([innerHeight, 0]);

        const plot = this.svg.append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

        renderYAxis(plot, y, innerWidth, 'fy');
        this.renderBars(plot, items, x, y, innerHeight, value, barColor);
        this.renderXAxis(plot, items, x, innerHeight);
        this.renderHitBands(plot, items, x, innerWidth, innerHeight);
    }

    /**
     * Remove the resize listener and clear the container
     */
    destroy() {
        window.removeEventListener('resize', this.handleResize);
        this.items = null;
        this.renderOptions = null;
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * Render the placeholder shown when the FY series is unavailable
     */
    renderEmpty() {
        const empty = document.createElement('p');
        empty.className = 'chart-empty';
        empty.textContent = 'Fiscal-year award counts are unavailable.';
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
     * @param {Array<Object>} items - Fiscal-year records being plotted
     */
    createSvg(items) {
        const span = items.length === 1
            ? `FY ${items[0].fy}`
            : `FY ${items[0].fy} to FY ${items[items.length - 1].fy}`;

        this.svg = d3.select(this.container)
            .append('svg')
            .attr('class', 'fy-chart-svg')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('role', 'img')
            .attr('aria-label', `${this.options.ariaLabel}: number of awards by fiscal year, ${span}`)
            .style('width', '100%')
            .style('height', 'auto')
            .style('display', 'block');
    }

    /**
     * Create the container-scoped tooltip
     */
    createTooltip() {
        this.tooltip = new ChartTooltip(this.container, 'timeline-tooltip fy-tooltip');
    }


    /**
     * Render the bars
     *
     * Bars are paths, not rects: a plain rect's `rx` would round the baseline
     * corners too, which detaches the bar from the axis.
     *
     * An in-progress fiscal year is drawn in the same hue at reduced opacity
     * *and* with a dashed outline. Opacity alone is not a signal — it survives
     * neither greyscale printing nor several kinds of colour vision.
     *
     * @param {Object} plot - D3 selection of the plot group
     * @param {Array<Object>} items - Fiscal-year records
     * @param {Function} x - Band scale
     * @param {Function} y - Y scale
     * @param {number} innerHeight - Plot height in px
     * @param {Function} value - Accessor for the plotted count
     * @param {string} barColor - SVG fill string
     */
    renderBars(plot, items, x, y, innerHeight, value, barColor) {
        const bandWidth = x.bandwidth();

        this.barsGroup = plot.append('g').attr('class', 'fy-bars');

        this.barsGroup.selectAll('path.fy-bar')
            .data(items.filter(d => value(d) > 0), d => d.fy)
            .join('path')
            .attr('class', d => `fy-bar${d.partial ? ' fy-bar--partial' : ''}`)
            .attr('d', (d) => {
                // Floor at 1.5px so a small but non-zero year stays visible
                const barHeight = Math.max(1.5, innerHeight - y(value(d)));
                return topRoundedPath(x(d.fy), innerHeight - barHeight, bandWidth, barHeight);
            })
            .attr('fill', barColor)
            .attr('fill-opacity', d => (d.partial ? PARTIAL_OPACITY : FULL_OPACITY))
            .attr('stroke', d => (d.partial ? barColor : 'none'))
            .attr('stroke-width', d => (d.partial ? 1 : 0))
            .attr('stroke-dasharray', d => (d.partial ? PARTIAL_DASH : null));
    }

    /**
     * Render x-axis fiscal-year labels and ticks (no axis line)
     * @param {Object} plot - D3 selection of the plot group
     * @param {Array<Object>} items - Fiscal-year records
     * @param {Function} x - Band scale
     * @param {number} innerHeight - Plot height in px
     */
    renderXAxis(plot, items, x, innerHeight) {
        const indices = labelIndices(items.length, x.step(), MIN_LABEL_SPACE);
        const axis = plot.append('g')
            .attr('class', 'fy-x-axis')
            .attr('transform', `translate(0,${innerHeight})`);

        const labelled = indices.map(i => items[i]);
        const center = (d) => x(d.fy) + x.bandwidth() / 2;

        axis.selectAll('line.fy-x-tick')
            .data(labelled)
            .join('line')
            .attr('class', 'fy-x-tick')
            .attr('x1', center)
            .attr('x2', center)
            .attr('y1', 0)
            .attr('y2', 3)
            .attr('stroke', 'var(--gray-300)')
            .attr('stroke-width', 1);

        axis.selectAll('text.fy-x-label')
            .data(labelled)
            .join('text')
            .attr('class', 'fy-x-label')
            .attr('x', center)
            .attr('y', 15)
            .attr('dy', '0.32em')
            .attr('text-anchor', 'middle')
            .attr('font-size', 11)
            .attr('fill', 'var(--gray-600)')
            .text(d => String(d.fy));
    }

    /**
     * Render the invisible full-height hover targets
     *
     * Hover is driven by a band covering the year's full column rather than by
     * the bar itself, so a short bar is as easy to hit as a tall one.
     *
     * @param {Object} plot - D3 selection of the plot group
     * @param {Array<Object>} items - Fiscal-year records
     * @param {Function} x - Band scale
     * @param {number} innerWidth - Plot width in px
     * @param {number} innerHeight - Plot height in px
     */
    renderHitBands(plot, items, x, innerWidth, innerHeight) {
        const gap = x.step() - x.bandwidth();
        const bandX = d => Math.max(0, x(d.fy) - gap / 2);

        plot.append('g')
            .attr('class', 'fy-hit-bands')
            .selectAll('rect.fy-hit-band')
            .data(items, d => d.fy)
            .join('rect')
            .attr('class', 'fy-hit-band')
            .attr('x', bandX)
            .attr('y', 0)
            .attr('width', d => Math.min(x.step(), innerWidth - bandX(d)))
            .attr('height', innerHeight)
            .attr('fill', 'transparent')
            .style('cursor', 'default')
            .on('mouseenter', (event, d) => {
                this.highlightBar(d.fy);
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
     *
     * The partial year stays visibly lighter even when hovered — the hover
     * emphasis must not read as "this year is complete after all".
     *
     * @param {number|null} fy - Hovered fiscal year, or null to clear
     */
    highlightBar(fy) {
        if (!this.barsGroup) return;
        this.barsGroup.selectAll('path.fy-bar')
            .attr('fill-opacity', (d) => {
                const base = d.partial ? PARTIAL_OPACITY : FULL_OPACITY;
                return d.fy === fy ? Math.min(1, base + 0.1) : base;
            });
    }

    /**
     * Populate and show the tooltip for a fiscal year
     * @param {MouseEvent} event - Triggering event
     * @param {Object} d - Fiscal-year record
     */
    showTooltip(event, d) {
        this.tooltip?.show(event, this.tooltipHtml(d));
    }

    /**
     * Build the tooltip markup
     * @param {Object} d - Fiscal-year record
     * @returns {string} Tooltip HTML
     */
    tooltipHtml(d) {
        const { countLabel } = this.renderOptions;
        const count = Number.isFinite(d.count) ? d.count : 0;
        const heading = `FY ${d.fy}${d.partial ? ' (fiscal year in progress)' : ''}`;

        return [
            `<div class="timeline-tooltip-month">${escapeHtml(heading)}</div>`,
            tooltipRow(countLabel, String(count))
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
}
