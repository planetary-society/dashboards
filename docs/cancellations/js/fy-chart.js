/**
 * Fiscal-Year Actions Bar Chart
 *
 * D3.js column chart of FPDS termination-for-convenience *contract* actions by
 * federal fiscal year. A deliberate fork of timeline-chart.js rather than an
 * option on it — the two charts share machinery (chart-common.js) but not a
 * purpose.
 *
 * IMPORTANT: Rendering constraints
 * --------------------------------------------------------
 * 1. THE UNIVERSE LABEL LIVES INSIDE THE SVG. This chart plots a different
 *    population from the panel it sits on (all of NASA, contracts only, all
 *    administrations). The title and the qualifying subtitle are drawn as SVG
 *    text above the plot area so a screenshot of the chart cannot crop the
 *    qualifier away. They are not optional, and they are not HTML.
 *
 * 2. COUNTS ONLY. One series, one y-axis, no metric toggle, no dollars.
 *
 * 3. FULL REDRAW. render() clears and rebuilds the SVG on every call. The
 *    series is tiny (7 bars) and only ever redrawn on resize, so a data join
 *    would buy nothing.
 *
 * 4. NO ANIMATION.
 *
 * 5. `d3` is a global from the CDN script tag and is referenced only inside
 *    methods, so this module stays importable in Node for wiring checks.
 */

import { escapeHtml, debounce } from '../../shared/js/utils.js';
import {
    ChartTooltip,
    tooltipRow,
    topRoundedPath,
    barPadding,
    labelIndices,
    yTicks
} from './chart-common.js';

/**
 * Chart margins. `top` is computed per render from the title block (see
 * titleBlockMetrics) — this is the rest of the frame. `left` is sized for
 * three-digit integer counts, not currency.
 */
const MARGIN = { right: 8, bottom: 26, left: 34 };

/** In-SVG chart title: what is counted */
const TITLE_TEXT = 'FPDS termination-for-convenience contract actions, all NASA';

/** In-SVG subtitle: the universe qualifier that must survive a screenshot */
const SUBTITLE_TEXT = 'Contracts only — a subset of the awards listed on this panel';

/** Baseline of the first title line, measured from the top of the SVG, in px */
const TITLE_BASELINE = 13;

/** Title font size and line height, in px */
const TITLE_FONT_SIZE = 12;
const TITLE_LINE_HEIGHT = 15;

/** Subtitle font size and line height, in px */
const SUBTITLE_FONT_SIZE = 11;
const SUBTITLE_LINE_HEIGHT = 14;

/** Extra gap between the title block and the subtitle block, in px */
const TITLE_SUBTITLE_GAP = 2;

/** Gap between the last subtitle line and the top of the plot area, in px */
const BLOCK_BOTTOM_GAP = 10;

/**
 * Average glyph widths used to wrap the title and subtitle, in px
 *
 * Wrapping is estimated rather than measured: getComputedTextLength() would
 * force a layout per candidate line, and the copy is fixed, so a conservative
 * per-character estimate is enough to keep the block off the bars.
 */
const TITLE_CHAR_WIDTH = 6.5;
const SUBTITLE_CHAR_WIDTH = 5.8;

/** Minimum horizontal space a 'YYYY' x-axis label needs before thinning, in px */
const MIN_LABEL_SPACE = 34;

/** Fill opacity for complete and in-progress fiscal years */
const FULL_OPACITY = 0.9;
const PARTIAL_OPACITY = 0.45;

/** Dash pattern marking an in-progress fiscal year without relying on colour */
const PARTIAL_DASH = '3 2';

/**
 * Wrap words to a target line length, in characters
 * @param {Array<string>} words - Tokens to place
 * @param {number} target - Soft maximum characters per line
 * @returns {Array<string>} Lines; a word longer than the target gets its own line
 */
function greedyWrap(words, target) {
    const lines = [];
    let line = '';

    for (const word of words) {
        if (!line) {
            line = word;
        } else if (line.length + 1 + word.length <= target) {
            line += ` ${word}`;
        } else {
            lines.push(line);
            line = word;
        }
    }

    if (line) lines.push(line);

    return lines;
}

/**
 * Break a fixed string into lines that fit the plot width
 *
 * Balances the lines: a plain greedy fill packs the first line to the margin and
 * strands "NASA" alone underneath, which reads as a mistake rather than a wrap.
 * So it takes the smallest line length that still fits the copy in the minimum
 * number of lines. Both strings are short and fixed, so the search is cheap.
 *
 * @param {string} text - Copy to wrap
 * @param {number} availableWidth - Plot width in px
 * @param {number} charWidth - Average glyph width in px
 * @returns {Array<string>} One or more lines
 */
function wrapToWidth(text, availableWidth, charWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const maxChars = Math.max(8, Math.floor(availableWidth / charWidth));
    if (text.length <= maxChars) return [text];

    const lineCount = Math.max(2, Math.ceil(text.length / maxChars));

    for (let target = Math.ceil(text.length / lineCount); target <= maxChars; target++) {
        const lines = greedyWrap(words, target);
        if (lines.length <= lineCount) return lines;
    }

    // Unreachable for the shipped copy; kept so a longer string still wraps
    return greedyWrap(words, maxChars);
}

export class FyChart {
    /**
     * Create a fiscal-year bar chart
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {number} options.height - Nominal SVG height in px at a one-line
     *   title block (default: 260). Extra title lines grow the SVG rather than
     *   squeezing the bars.
     * @param {string} options.ariaLabel - Base aria-label for the SVG
     * @param {string} options.barColor - SVG fill for bars, CSS vars allowed
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            height: options.height || 260,
            ariaLabel: options.ariaLabel || 'Contract actions by fiscal year',
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

        // The plot area keeps this height whatever the title block costs
        this.plotHeight = Math.max(1, this.options.height - this.baseTopMargin() - MARGIN.bottom);

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
     * @param {Array<Object>} items - Ascending fiscal years from parseFyActions:
     *   {fy: number, count: number, partial: boolean}
     * @param {Object} config - Render configuration
     * @param {string} config.barColor - SVG fill for bars (default: the constructor's)
     * @param {string} config.countLabel - Label for the count row in the tooltip (default: 'Actions')
     */
    render(items, { barColor = this.options.barColor, countLabel = 'Actions' } = {}) {
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
        const titleLines = wrapToWidth(TITLE_TEXT, innerWidth, TITLE_CHAR_WIDTH);
        const subtitleLines = wrapToWidth(SUBTITLE_TEXT, innerWidth, SUBTITLE_CHAR_WIDTH);
        const marginTop = this.topMargin(titleLines.length, subtitleLines.length);

        // Grow the SVG for a wrapped title instead of shortening the bars
        this.height = marginTop + this.plotHeight + MARGIN.bottom;
        const innerHeight = this.plotHeight;

        this.createSvg(items);
        this.createTooltip();
        this.renderTitleBlock(titleLines, subtitleLines);

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
            .attr('transform', `translate(${MARGIN.left},${marginTop})`);

        this.renderYAxis(plot, y, innerWidth);
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
        empty.textContent = 'Fiscal-year action counts are unavailable.';
        this.container.appendChild(empty);
    }

    /**
     * Top margin for a single-line title and single-line subtitle
     * @returns {number} Height of the smallest possible title block, in px
     */
    baseTopMargin() {
        return this.topMargin(1, 1);
    }

    /**
     * Vertical space the in-SVG title block needs
     * @param {number} titleLineCount - Wrapped title lines
     * @param {number} subtitleLineCount - Wrapped subtitle lines
     * @returns {number} Top margin in px
     */
    topMargin(titleLineCount, subtitleLineCount) {
        return this.subtitleBaseline(titleLineCount, subtitleLineCount - 1) + BLOCK_BOTTOM_GAP;
    }

    /**
     * Baseline y of one subtitle line
     * @param {number} titleLineCount - Wrapped title lines above it
     * @param {number} index - Zero-based subtitle line index
     * @returns {number} Baseline offset from the top of the SVG, in px
     */
    subtitleBaseline(titleLineCount, index) {
        const titleBottom = TITLE_BASELINE + Math.max(0, titleLineCount - 1) * TITLE_LINE_HEIGHT;
        return titleBottom + TITLE_SUBTITLE_GAP + (index + 1) * SUBTITLE_LINE_HEIGHT;
    }

    /**
     * Measure the container; width is responsive, plot height is fixed
     */
    setupDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = Math.round(rect.width) || 640;
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
            .attr('aria-label', `${this.options.ariaLabel}: number of actions by fiscal year, ${span}`)
            .style('width', '100%')
            .style('height', 'auto')
            .style('display', 'block');
    }

    /**
     * Draw the title and universe subtitle inside the SVG
     *
     * Left-aligned with the plot area, above it, and always rendered: this block
     * is the only thing standing between a cropped screenshot and a reader who
     * thinks these bars count the awards in the table below.
     *
     * @param {Array<string>} titleLines - Wrapped title
     * @param {Array<string>} subtitleLines - Wrapped subtitle
     */
    renderTitleBlock(titleLines, subtitleLines) {
        const block = this.svg.append('g').attr('class', 'fy-chart-title-block');

        block.selectAll('text.fy-chart-title')
            .data(titleLines)
            .join('text')
            .attr('class', 'fy-chart-title')
            .attr('x', MARGIN.left)
            .attr('y', (d, i) => TITLE_BASELINE + i * TITLE_LINE_HEIGHT)
            .attr('font-size', TITLE_FONT_SIZE)
            .attr('font-weight', 600)
            .attr('fill', 'var(--gray-800)')
            .text(d => d);

        block.selectAll('text.fy-chart-subtitle')
            .data(subtitleLines)
            .join('text')
            .attr('class', 'fy-chart-subtitle')
            .attr('x', MARGIN.left)
            .attr('y', (d, i) => this.subtitleBaseline(titleLines.length, i))
            .attr('font-size', SUBTITLE_FONT_SIZE)
            .attr('fill', 'var(--gray-600)')
            .text(d => d);
    }

    /**
     * Create the container-scoped tooltip
     */
    createTooltip() {
        this.tooltip = new ChartTooltip(this.container, 'timeline-tooltip fy-tooltip');
    }

    /**
     * Render y-axis gridlines and labels (no axis line)
     *
     * @param {Object} plot - D3 selection of the plot group
     * @param {Function} y - Y scale
     * @param {number} innerWidth - Plot width in px
     */
    renderYAxis(plot, y, innerWidth) {
        const format = d3.format('d');
        const ticks = yTicks(y);

        const axis = plot.append('g').attr('class', 'fy-y-axis');

        axis.selectAll('line.fy-gridline')
            .data(ticks)
            .join('line')
            .attr('class', 'fy-gridline')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', d => y(d))
            .attr('y2', d => y(d))
            .attr('stroke', 'var(--gray-200)')
            .attr('stroke-width', 1)
            .attr('shape-rendering', 'crispEdges');

        axis.selectAll('text.fy-y-label')
            .data(ticks)
            .join('text')
            .attr('class', 'fy-y-label')
            .attr('x', -8)
            .attr('y', d => y(d))
            .attr('dy', '0.32em')
            .attr('text-anchor', 'end')
            .attr('font-size', 11)
            .attr('fill', 'var(--gray-600)')
            .text(format);
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
