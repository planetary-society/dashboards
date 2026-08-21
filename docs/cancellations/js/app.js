/**
 * NASA Cancellations Dashboard Application
 * Main entry point and dashboard-specific logic
 */

import { DATA_URLS, FIPS_STATE_MAP } from '../../shared/js/constants.js';
import {
    parseCSV,
    parseCurrency,
    formatCurrency,
    formatDate,
    getGeoidFromDistrict,
    fetchText,
    groupBy,
    sumBy,
    truncateText,
    escapeHtml,
    escapeAttr,
    pluralCount
} from '../../shared/js/utils.js';
import {
    categorize,
    summarize,
    deriveBadges,
    detectionEvidence,
    evidenceTier,
    verificationConflict,
    tierMix,
    claimOutcomeMix,
    latestVerification,
    monthlyActivity,
    endDateChanges,
    isExtensionCarveOut,
    obligatedValue,
    EVIDENCE_TIER_ORDER,
    CLAIM_OUTCOME_ORDER,
    STATUS_PILLS,
    SUSPICIOUS_PILL,
    applyLens as filterByLens
} from './ledger-categories.js';
import {
    LENS_META,
    TIER_META,
    OUTCOME_META,
    TIMELINE_META,
    VERDICT_META,
    truncationChip,
    selectSpotlights,
    createLensValueBoxes,
    ENDDATE_META,
    endDateSummary
} from './lens-views.js';
import { ValueBox } from '../../shared/js/components/value-box.js';
import { TabNavigation, CardTabs } from '../../shared/js/components/tabs.js';
import { HashRouter } from '../../shared/js/components/hash-router.js';
import { ChoroplethMap } from '../../shared/js/components/choropleth-map.js';
import { DataTable } from '../../shared/js/components/data-table.js';
import { TimelineChart } from './timeline-chart.js';
import { EndDateChart } from './enddate-chart.js';

/** District codes that can be routed to, e.g. "CA-37" */
const DISTRICT_CODE_RE = /^[A-Z]{2}-\d+$/;

/** Longest description rendered unclamped on an award card, in characters */
const DESCRIPTION_CLAMP_CHARS = 400;

/** Longest description rendered without a disclosure control in the table, in characters */
const DESCRIPTION_SUMMARY_CHARS = 120;

/** Spotlight cards drawn beneath the summary */
const SPOTLIGHT_COUNT = 3;

/**
 * Marker written into the Raw Data table's hidden conflict column
 *
 * Grid.js cells hold plain data, so the boolean travels as a string the status
 * formatter can test.
 */
const CONFLICT_FLAG = 'conflict';

/**
 * Tier label → tier display metadata
 *
 * Evidence cells carry the tier label so Grid.js sorts them as plain text; the
 * matching badge class and description are looked up here, the same trick
 * PILL_CLASSES uses for status cells. Labels are unique by construction.
 *
 * @type {Object<string, {label: string, description: string, cls: string}>}
 */
const TIER_BY_LABEL = Object.fromEntries(
    Object.values(TIER_META).map((meta) => [meta.label, meta])
);

/**
 * Verification-verdict label → verdict display metadata
 *
 * Same label-is-the-cell trick as TIER_BY_LABEL, for the Raw Data
 * Verification column. Labels are unique by construction.
 *
 * @type {Object<string, {label: string, description: string}>}
 */
const VERDICT_BY_LABEL = Object.fromEntries(
    Object.values(VERDICT_META).map((meta) => [meta.label, meta])
);

/**
 * Resolve a row's weekly re-verification verdict for display
 *
 * Unknown or blank verdicts fall back to the raw value so new upstream
 * vocabulary degrades to visible text rather than disappearing.
 *
 * @param {Object} row - Ledger row
 * @returns {{label: string, description: string}} Verdict display metadata
 */
function rowVerdict(row) {
    const raw = String(row['Auto Status'] ?? '').trim();
    return VERDICT_META[raw] || { label: raw || '—', description: '' };
}

/**
 * The ⍰ glyph marking a cancelled row with no termination action on record
 *
 * The About tab renders this same glyph with the same title text so readers
 * can hover the explanation there too — keep the two copies in sync
 * (index.html, "Re-checked every week" section).
 *
 * @type {string}
 */
const CONFLICT_GLYPH = '<i class="bi bi-question-circle award-conflict" title="'
    + 'No termination action found in this award’s federal transaction history;'
    + ' its cancelled status comes from NASA’s internal lists."></i>';

/**
 * Pill label → badge class
 *
 * Status cells carry the pill label so Grid.js sorts them as plain text; the
 * matching class is looked up here.
 *
 * @type {Object<string, string>}
 */
const PILL_CLASSES = Object.fromEntries(
    [...Object.values(STATUS_PILLS), SUSPICIOUS_PILL].map(({ label, cls }) => [label, cls])
);

/**
 * Format a row's claimed savings
 *
 * A blank means no claim was ever made, which is a different fact from a claim
 * of zero, so blanks render as an em dash and zeros render as $0.
 *
 * @param {Object} row - Ledger row
 * @returns {string} Formatted amount, or '—' when unclaimed
 */
function formatClaimedSavings(row) {
    const amount = parseCurrency(row['Claimed Savings']);
    return amount === null ? '—' : formatCurrency(amount, false);
}

/**
 * Render an evidence-tier badge
 *
 * The one rendering of the tier badge, shared by the spotlight cards, the
 * award cards, and the Raw Data Evidence column so the markup cannot drift.
 *
 * @param {{label: string, cls: string, description: string}} tier - TIER_META entry
 * @param {string} [title] - Tooltip text (defaults to the tier description)
 * @returns {string} HTML for the badge
 */
function renderTierBadge(tier, title = tier.description) {
    return `<span class="badge ${tier.cls}" title="${escapeAttr(title)}">${escapeHtml(tier.label)}</span>`;
}

/**
 * Render a horizontal segmented bar over one categorical mix
 *
 * The segments carry no text: the fills are light enough that any label on top
 * of them would fail contrast, so identity and counts live in the legend
 * beneath. Zero-count categories are dropped from the bar (a zero-width segment
 * is not a thing) but kept in the legend, so the full vocabulary stays visible.
 *
 * @param {string[]} order - Category keys in display order
 * @param {Object<string, {label: string, description: string}>} meta - Display copy per key
 * @param {Object<string, number>} mix - Zero-filled counts per key
 * @param {string} noun - Singular noun for the counted rows
 * @returns {string} HTML for the bar, or '' when the mix is empty
 */
function renderSegmentedBar(order, meta, mix, noun) {
    const total = order.reduce((sum, key) => sum + mix[key], 0);
    if (total === 0) return '';

    const segments = order
        .filter((key) => mix[key] > 0)
        .map((key) => {
            const width = (mix[key] / total) * 100;
            const title = `${meta[key].label} — ${pluralCount(mix[key], noun)}. ${meta[key].description}`;

            return `<div class="seg-bar__segment ${meta[key].segCls}"`
                + ` style="width: ${width.toFixed(2)}%"`
                + ` title="${escapeAttr(title)}"></div>`;
        })
        .join('');

    const summary = order.map((key) => `${meta[key].label}: ${mix[key].toLocaleString()}`).join(', ');

    return `<div class="seg-bar" role="img" aria-label="${escapeAttr(summary)}">${segments}</div>`;
}

/**
 * Render the legend that names a segmented bar's categories
 *
 * Every category appears, including the ones at zero, so a reader can tell an
 * absent tier from an unlisted one.
 *
 * @param {string[]} order - Category keys in display order
 * @param {Object<string, {label: string, description: string}>} meta - Display copy per key
 * @param {Object<string, number>} mix - Zero-filled counts per key
 * @returns {string} HTML for the legend
 */
function renderSegmentLegend(order, meta, mix) {
    const items = order.map((key) => {
        const zero = mix[key] === 0 ? ' seg-legend-item--zero' : '';

        return `<span class="seg-legend-item${zero}" title="${escapeAttr(meta[key].description)}">`
            + `<span class="seg-swatch ${meta[key].segCls}"></span>`
            + `<span class="seg-legend-label">${escapeHtml(meta[key].label)}</span>`
            + `<span class="seg-legend-count">${mix[key].toLocaleString()}</span>`
            + '</span>';
    }).join('');

    return `<div class="seg-legend">${items}</div>`;
}

/**
 * Render one column of the claim comparison row
 * @param {string} label - Column label
 * @param {string} value - Pre-formatted currency value
 * @returns {string} HTML string for the column
 */
function renderClaimCell(label, value) {
    return `
        <div class="award-claim-item">
            <span class="award-label">${label}</span>
            <span class="award-value">${value}</span>
        </div>
    `;
}

class CancellationsDashboard {
    constructor() {
        // Every ledger row, with derived fields attached
        this.allRows = [];
        // The active lens's subset of allRows — drives every summary view
        this.lensRows = [];
        this.activeLens = 'cancelled';
        this.districtCounts = {};
        this.hoverInfo = {};
        this.maxContracts = 1;
        // Latest weekly re-verification date across the whole ledger, read once
        // at load: it describes the data, not the active lens
        this.lastVerified = '';
        // Timeline metric, kept across lens switches so a reader who chose
        // dollars stays in dollars
        this.timelineMetric = 'count';

        this.map = null;
        this.timeline = null;
        this.endDateChart = null;
        this.lensTabs = null;
        this.districtsTable = null;
        this.recipientsTable = null;
        this.contractsTable = null;
        this.pageTabs = null;
        this.tableTabs = null;
        this.router = null;

        // Route to tab ID mapping
        this.routeMap = {
            'summary': 'summary-tab',
            'raw-data': 'contracts-tab',
            'about': 'about-tab'
        };
    }

    /**
     * Initialize the dashboard
     */
    async init() {
        try {
            // Initialize tab navigation
            this.initTabs();

            // Load and process data
            await this.loadData();

            // Lens selector: one active lens drives every summary view
            this.initLensBar();
            this.renderLensCounts();

            // Lens-independent, so filled once rather than per lens switch
            this.renderVerificationFreshness();

            // Build the map shell; applyLens supplies its data
            await this.renderMap();

            // Summary tables are built once and re-rendered on every lens switch
            this.initSummaryTables();

            // The chart instances and the timeline's metric toggle outlive
            // every lens switch, so they must exist before the first applyLens
            // call
            this.initTimeline();
            this.endDateChart = new EndDateChart('enddate-chart', {
                ariaLabel: 'End-date changes',
                color: ENDDATE_META.color
            });

            // Award-card description toggles, delegated from the static container
            this.initAwardCardInteractions();

            // Render every lens-driven view for the default lens
            this.applyLens(this.activeLens);

            // Raw Data tab always shows the full ledger, lens-independent
            this.renderRawDataTable();

            // Re-process district route if page loaded with one (data wasn't ready earlier)
            const currentRoute = this.router.getCurrentRoute();
            if (this.isDistrictRoute(currentRoute)) {
                this.showDistrictSummary(currentRoute);
            }

            // Update last updated date
            await this.updateLastUpdated();

        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showError(error.message);
        }
    }

    /**
     * Initialize tab navigation with hash-based routing
     */
    initTabs() {
        // Page-level tabs with route sync
        this.pageTabs = new TabNavigation('page-tabs', {
            tabClass: 'page-tab',
            contentClass: 'tab-content',
            onTabChange: (tabId) => {
                // Update URL hash when tab changes (without triggering router callback)
                const route = Object.entries(this.routeMap).find(([r, t]) => t === tabId)?.[0];
                if (route && this.router) {
                    this.router.navigate(route, false);
                }
            }
        });
        this.pageTabs.init();

        // Initialize hash router for deep-linking
        this.router = new HashRouter({
            defaultRoute: 'summary',
            onRouteChange: (route) => {
                // Check if this is a district route (e.g., "CA-37")
                if (this.isDistrictRoute(route)) {
                    this.showDistrictSummary(route);
                    return;
                }

                // Hide district summary if we're navigating away from it
                this.hideDistrictSummary();

                // Handle standard page routes
                const tabId = this.routeMap[route] || this.routeMap['summary'];
                this.pageTabs.activateTab(tabId);
            }
        });
        this.router.init();

        // Card-level tabs for tables
        this.tableTabs = new CardTabs('table-tabs', {
            tabClass: 'card-tab',
            contentClass: 'card-tab-content'
        });
        this.tableTabs.init();

        // Back button handler for district summary
        const backBtn = document.getElementById('back-to-summary');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.router.navigate('summary');
            });
        }
    }

    /**
     * Load the master ledger and attach derived fields
     *
     * Every row is kept, including rows with no parseable award amount:
     * filtering is the lens's job, not this method's.
     */
    async loadData() {
        const csvText = await fetchText(DATA_URLS.cancellations);

        this.allRows = parseCSV(csvText).map(row => {
            const tier = evidenceTier(row);

            return {
                ...row,
                totalObligations: parseCurrency(row['Award Amount']),
                totalOutlays: parseCurrency(row['Total Outlays']),
                geoid: getGeoidFromDistrict(row['District']),
                _cat: categorize(row),
                _tier: tier,
                _conflict: verificationConflict(row, tier)
            };
        });

        // Describes the ledger, not any one lens, so it is read once here
        // rather than recomputed on every lens switch
        this.lastVerified = latestVerification(this.allRows);
    }

    /**
     * Wire the lens selector to the lens-driven views
     *
     * Called after data load, so the callback always has rows to work with.
     */
    initLensBar() {
        this.lensTabs = new TabNavigation('lens-bar', {
            tabClass: 'lens-tab',
            onTabChange: (lens) => this.applyLens(lens)
        });
        this.lensTabs.init();
    }

    /**
     * Write each lens's row count into its tab
     *
     * Counts describe the whole ledger, so they are computed once and never
     * change when the active lens changes.
     */
    renderLensCounts() {
        this.lensTabs.tabs.forEach(tab => {
            const lens = tab.dataset.tab;
            const countEl = tab.querySelector('.lens-count');
            if (lens && countEl) {
                countEl.textContent = filterByLens(this.allRows, lens).length;
            }
        });
    }

    /**
     * Switch the active lens and re-render everything driven by it
     * @param {'cancelled'|'doge'|'suspicious'|'reversed'} lens - Lens to activate
     */
    applyLens(lens) {
        if (!LENS_META[lens]) lens = 'cancelled';

        this.activeLens = lens;
        this.lensRows = filterByLens(this.allRows, lens);

        this.calculateDistrictData();
        this.renderValueBoxes();
        this.renderEvidencePanel();

        if (this.map) {
            this.map.setData(this.districtCounts, this.hoverInfo, this.maxContracts);
        }

        this.renderSummaryTables();
        this.renderTimeline();
        this.renderEndDates();
        this.renderSpotlights();

        const subtitleEl = document.getElementById('lens-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = LENS_META[lens].headline;
        }

        // The district view is a filtered slice of the lens, so it moves too
        const currentRoute = this.router?.getCurrentRoute();
        if (currentRoute && this.isDistrictRoute(currentRoute)) {
            this.renderDistrictAwards(currentRoute);
        }
    }

    /**
     * Calculate district counts and hover info for map
     */
    calculateDistrictData() {
        const districtGroups = groupBy(
            this.lensRows.filter(row => row.geoid),
            'geoid'
        );

        this.districtCounts = {};
        this.hoverInfo = {};
        this.maxContracts = 1;

        Object.entries(districtGroups).forEach(([geoid, contracts]) => {
            const count = contracts.length;
            this.districtCounts[geoid] = count;

            if (count > this.maxContracts) {
                this.maxContracts = count;
            }

            // Build hover HTML
            const header = `<b>Number of awards: ${count}</b>`;
            const lines = contracts.map(contract => {
                const amt = formatCurrency(contract.totalObligations, false);
                const recipient = escapeHtml(contract['Recipient']);
                const awardId = escapeHtml(contract['Award ID']);
                return `<b>${recipient}</b><br>${amt} (Award ID: ${awardId})`;
            });

            this.hoverInfo[geoid] = header + '<br><br>' + lines.join('<br>');
        });
    }

    /**
     * Render value boxes for the active lens
     */
    renderValueBoxes() {
        ValueBox.render('value-boxes', createLensValueBoxes(summarize(this.lensRows), this.activeLens));
        ValueBox.animateIn('value-boxes');
    }

    /**
     * Render the evidence card for the active lens
     *
     * Two mutually exclusive variants. Three lenses ask "how do we know?" and
     * get the evidence-tier mix; the DOGE lens asks "what became of the claim?"
     * and gets the verification-outcome mix instead. The two bars are never
     * shown together: they reuse the same hues for different meanings, and
     * stacking them would invite the reader to compare segments that are not
     * comparable.
     */
    renderEvidencePanel() {
        const container = document.getElementById('evidence-body');
        if (!container) return;

        const isDoge = this.activeLens === 'doge';
        const order = isDoge ? CLAIM_OUTCOME_ORDER : EVIDENCE_TIER_ORDER;
        const meta = isDoge ? OUTCOME_META : TIER_META;
        const mix = isDoge ? claimOutcomeMix(this.lensRows) : tierMix(this.lensRows);
        const noun = isDoge ? 'claim' : 'award';

        const lead = isDoge
            ? '<p class="evidence-lead">Every claim is re-checked weekly against'
                + ' the award’s federal transaction history.</p>'
            : '';

        const bar = renderSegmentedBar(order, meta, mix, noun);
        const body = bar
            ? bar + renderSegmentLegend(order, meta, mix)
            : '<p class="evidence-empty">No awards in this view.</p>';

        // The card's heading and freshness line are lens-independent and live
        // in the static HTML; only the bar region is rewritten per switch
        container.innerHTML = lead + body + this.renderClaimOverlap(isDoge);
    }

    /**
     * Reconcile the evidence tiers with the DOGE Claims count
     *
     * Readers see the DOGE lens tab count and the Uncorroborated tier count on
     * screen at the same time, and the two disagree on purpose: an award is
     * counted under its strongest evidence, so a corroborated claim lands in a
     * higher tier. This line does that arithmetic for the reader instead of
     * leaving it to look like a contradiction.
     *
     * @param {boolean} isDoge - Whether the DOGE lens is active (its bar is
     *   already all claims, so no reconciliation is needed)
     * @returns {string} HTML for the overlap line, or '' when nothing overlaps
     */
    renderClaimOverlap(isDoge) {
        if (isDoge) return '';

        const claimed = this.lensRows.filter(
            row => String(row['Claiming Source'] ?? '').trim()
        ).length;
        if (claimed === 0) return '';

        return `<p class="evidence-overlap">${pluralCount(claimed, 'award')} in this view also`
            + ' appear on DOGE’s claims list. Each award is counted under its strongest'
            + ' evidence, so corroborated claims sit in the tiers above — switch to the'
            + ' DOGE Claims view to see every claim and its verification outcome.</p>';
    }

    /**
     * Fill the static freshness line beneath the evidence bar, once
     *
     * The sentence depends only on the load-time verification date, so it is
     * written after loadData rather than on every lens switch. A ledger with no
     * recorded verification date states the cadence and stops rather than
     * trailing off into an empty "last check".
     */
    renderVerificationFreshness() {
        const el = document.getElementById('verification-freshness');
        if (!el) return;

        const base = 'Every award re-verified against federal spending records weekly';

        // Date-only strings parse as UTC and shift back a day when formatted in
        // western time zones, so the time is pinned first
        el.textContent = this.lastVerified
            ? `${base} — last check ${formatDate(`${this.lastVerified}T00:00:00`, 'long')}.`
            : `${base}.`;
    }

    /**
     * Create the timeline chart and wire its metric toggle
     *
     * Called once, before the first lens is applied. The toggle only changes
     * which series is plotted, so its handler re-renders the chart and nothing
     * else.
     */
    initTimeline() {
        this.timeline = new TimelineChart('timeline-chart', {
            ariaLabel: 'Monthly ledger activity'
        });

        // TabNavigation handles the exclusive-active state, same as the lens
        // bar; only the aria-pressed mirror is toggle-specific
        this.metricToggle = new TabNavigation('timeline-metric-toggle', {
            tabClass: 'metric-toggle-btn',
            onTabChange: (metric) => {
                this.timelineMetric = metric;

                this.metricToggle.tabs.forEach(tab => {
                    tab.setAttribute('aria-pressed', String(tab.dataset.tab === metric));
                });

                this.renderTimeline();
            }
        });
        this.metricToggle.init();
    }

    /**
     * Render the monthly timeline for the active lens
     *
     * The chart is redrawn in full rather than updated: a lens switch changes
     * the month domain entirely, so there is nothing stable to join against.
     */
    renderTimeline() {
        const meta = TIMELINE_META[this.activeLens];
        const { months, skipped } = monthlyActivity(this.lensRows, this.activeLens);

        const subtitleEl = document.getElementById('timeline-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = meta.subtitle;
        }

        const noteEl = document.getElementById('timeline-note');
        if (noteEl) {
            // Undated rows are named rather than silently dropped, so the
            // chart's total and the lens count can be reconciled
            noteEl.textContent = skipped > 0
                ? `${meta.dateNote} ${skipped.toLocaleString()} rows lack a usable date and are not plotted.`
                : meta.dateNote;
        }

        if (this.timeline) {
            this.timeline.render(months, {
                metric: this.timelineMetric,
                barColor: meta.barColor,
                valueLabel: meta.valueLabel,
                countLabel: meta.countLabel
            });
        }
    }

    /**
     * Render the end-date change chart, on the one lens that earns it
     *
     * Only the Suspicious lens is defined by its end dates moving, so the card
     * is hidden outright everywhere else rather than shown with a chart that
     * answers a question nobody asked. The chart is drawn only while the card is
     * visible: a hidden container measures zero and would lay the rows out
     * against a width that does not exist.
     */
    renderEndDates() {
        const card = document.getElementById('enddate-card');
        if (!card) return;

        if (this.activeLens !== 'suspicious') {
            card.hidden = true;
            return;
        }

        card.hidden = false;

        const changes = endDateChanges(this.lensRows);

        // The card's copy comes from ENDDATE_META at runtime, the same way the
        // timeline reads TIMELINE_META — the HTML text is only a static
        // fallback. Exclusions are disclosed rather than silently absent: this
        // lens is defined by end dates, so a row the chart cannot draw — or one
        // carved out because its date moved the other way — is exactly the
        // caveat a reader needs.
        const subtitleEl = document.getElementById('enddate-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = ENDDATE_META.heading;
        }

        const noteEl = document.getElementById('enddate-note');
        if (noteEl) {
            const noteParts = [ENDDATE_META.note];

            if (changes.unmeasured > 0) {
                noteParts.push(`${pluralCount(changes.unmeasured, 'award')} in this view`
                    + ' lack a usable date and are not drawn.');
            }

            // Explicit lambda: isExtensionCarveOut's second parameter is
            // flags, and Array.filter would pass the index into it
            const carvedOut = this.allRows
                .filter((row) => isExtensionCarveOut(row, row._cat)).length;

            if (carvedOut > 0) {
                noteParts.push(`Another ${pluralCount(carvedOut, 'flagged award')} saw`
                    + ` ${carvedOut === 1 ? 'its end date' : 'their end dates'} move later`
                    + ` instead and ${carvedOut === 1 ? 'is' : 'are'} not counted in this view.`);
            }

            noteEl.textContent = noteParts.join(' ');
        }

        const summaryEl = document.getElementById('enddate-summary');
        if (summaryEl) {
            summaryEl.textContent = endDateSummary(changes);
        }

        if (this.endDateChart) {
            this.endDateChart.render(changes.items);
        }
    }

    /**
     * Render the representative-award strip for the active lens
     *
     * Hidden outright on an empty lens: three blank cards would read as missing
     * data rather than as an empty view.
     */
    renderSpotlights() {
        const strip = document.getElementById('spotlight-strip');
        const grid = document.getElementById('spotlight-cards');
        if (!strip || !grid) return;

        // The selector reports whether the last card is genuinely the
        // median-representative pick; with no distribution to represent, the
        // cards are simply every award and carry no eyebrow
        const { rows, hasRepresentative } = selectSpotlights(this.lensRows, SPOTLIGHT_COUNT);

        if (rows.length === 0) {
            strip.style.display = 'none';
            grid.innerHTML = '';
            return;
        }

        strip.style.display = '';

        grid.innerHTML = rows
            .map((row, index) => this.renderSpotlightCard(row, hasRepresentative, index === rows.length - 1))
            .join('');
    }

    /**
     * Render one spotlight card
     * @param {Object} row - Ledger row
     * @param {boolean} labelled - Whether to show the largest/typical eyebrow
     * @param {boolean} isRepresentative - Whether this is the median-representative card
     * @returns {string} HTML string for the card
     */
    renderSpotlightCard(row, labelled, isRepresentative) {
        const tier = TIER_META[row._tier] || TIER_META['claim-only'];
        const district = String(row['District'] ?? '').trim();

        const districtHtml = DISTRICT_CODE_RE.test(district)
            ? `<a href="#${escapeAttr(district)}" class="district-link">${escapeHtml(district)}</a>`
            : escapeHtml(district) || '—';

        const eyebrow = labelled
            ? `<span class="spotlight-eyebrow">${isRepresentative ? 'Closer to typical' : 'Among the largest'}</span>`
            : '';

        return `
            <div class="card spotlight-card">
                ${eyebrow}
                <div class="spotlight-head">
                    <a href="${escapeAttr(row['URL'] || '#')}" target="_blank">${escapeHtml(row['Award ID'])}</a>
                    ${renderTierBadge(tier)}
                </div>
                <div class="spotlight-recipient">${escapeHtml(row['Recipient'])}</div>
                <div class="spotlight-meta">
                    <span class="spotlight-amount">${formatCurrency(obligatedValue(row), false)}</span>
                    <span class="spotlight-district">${districtHtml}</span>
                </div>
                <p class="spotlight-desc">${escapeHtml(truncateText(row['Description'], 180))}</p>
            </div>
        `;
    }

    /**
     * Build the map shell; applyLens supplies its data
     */
    async renderMap() {
        this.map = new ChoroplethMap('choropleth-map', {
            colorScale: 'cancellations',
            level: 'district',
            legendTitle: 'Cancelled Awards'
        });

        await this.map.init(DATA_URLS.districts);

        // Add click handler for map bubbles
        const mapContainer = document.getElementById('choropleth-map');
        if (mapContainer) {
            mapContainer.addEventListener('click', (e) => {
                // Check if clicked element is a bubble
                if (e.target.classList.contains('bubble')) {
                    const d = d3.select(e.target).datum();
                    if (d && d.geoid) {
                        // Convert GEOID to district code (e.g., "0637" -> "CA-37")
                        const stateFips = d.geoid.substring(0, 2);
                        const districtNum = d.geoid.substring(2);
                        const stateAbbr = FIPS_STATE_MAP[stateFips];
                        if (stateAbbr) {
                            const districtCode = `${stateAbbr}-${districtNum}`;
                            this.router.navigate(districtCode);
                        }
                    }
                }
            });
        }
    }

    /**
     * Build the two lens-driven summary tables
     *
     * The instances outlive every lens switch; render() destroys the old grid
     * and draws the new rows in place.
     */
    initSummaryTables() {
        const options = { pagination: false, height: 400, fixedHeader: true };

        this.districtsTable = new DataTable('districts-table', options);
        this.recipientsTable = new DataTable('recipients-table', options);
    }

    /**
     * Render the two lens-driven summary tables
     */
    renderSummaryTables() {
        this.renderDistrictsTable();
        this.renderRecipientsTable();
    }

    /**
     * Render districts table
     */
    renderDistrictsTable() {
        // Aggregate by district
        const districtGroups = groupBy(this.lensRows, 'District');
        const districtData = Object.entries(districtGroups)
            .map(([district, contracts]) => {
                const rawTotal = sumBy(contracts, 'totalObligations');
                return {
                    // Rows with no district still belong somewhere in the table
                    district: district || 'Unknown',
                    contractCount: contracts.length,
                    rawObligations: rawTotal,
                    totalObligations: formatCurrency(rawTotal, false)
                };
            })
            .sort((a, b) => b.rawObligations - a.rawObligations);  // Sort by Total Obligations desc

        this.districtsTable.render(
            [
                {
                    name: 'District',
                    id: 'district',
                    formatter: (cell) => {
                        // "Unknown" has no geoid, so there is no route to link to
                        if (!DISTRICT_CODE_RE.test(cell)) return cell;
                        return gridjs.html(`<a href="#${cell}" class="district-link">${cell}</a>`);
                    }
                },
                { name: 'Awards', id: 'contracts' },
                { name: 'Total', id: 'obligations', currency: true }
            ],
            districtData.map(row => [row.district, row.contractCount, row.totalObligations])
        );
    }

    /**
     * Render recipients table
     */
    renderRecipientsTable() {
        // Aggregate by recipient
        const recipientGroups = groupBy(this.lensRows, 'Recipient');
        const recipientData = Object.entries(recipientGroups)
            .map(([recipient, contracts]) => ({
                recipient,
                contractCount: contracts.length,
                totalObligations: formatCurrency(sumBy(contracts, 'totalObligations'), false)
            }))
            .sort((a, b) => b.contractCount - a.contractCount);

        this.recipientsTable.render(
            [
                { name: 'Recipient', id: 'recipient', width: '50%' },
                { name: 'Awards', id: 'contracts' },
                { name: 'Total', id: 'obligations', currency: true }
            ],
            recipientData.map(row => [row.recipient, row.contractCount, row.totalObligations])
        );
    }

    /**
     * Render the Raw Data table
     *
     * Lens-independent: shows every ledger row, including the rows no lens
     * displays. Rendered once at init.
     */
    renderRawDataTable() {
        this.contractsTable = new DataTable('contracts-table', {
            pageSize: 25,
            pagination: true,
            className: 'table'
        });

        const columns = [
            {
                name: 'Award ID',
                id: 'award_id',
                formatter: (cell, row) => {
                    const url = row.cells[urlIndex]?.data || '#';
                    return gridjs.html(
                        `<a href="${escapeAttr(url)}" target="_blank">${escapeHtml(cell)}</a>`
                    );
                }
            },
            {
                name: 'Status',
                id: 'status',
                formatter: (cell, row) => {
                    const cls = PILL_CLASSES[cell] || 'badge--excluded';
                    const conflict = row.cells[conflictIndex]?.data === CONFLICT_FLAG
                        ? CONFLICT_GLYPH
                        : '';

                    return gridjs.html(
                        `<span class="badge ${cls}">${escapeHtml(cell)}</span>${conflict}`
                    );
                }
            },
            { name: 'District', id: 'district', width: '130px' },
            { name: 'Recipient', id: 'recipient' },
            { name: 'Award Amount', id: 'obligations', currency: true },
            { name: 'Total Outlays', id: 'outlays', currency: true, hideOnMobile: true },
            { name: 'Claimed Savings', id: 'claimed_savings', currency: true, hideOnMobile: true },
            {
                // The tier label is the cell data so Grid.js sorts and searches
                // it as text; the badge and its sourcing are added on render
                name: 'Evidence',
                id: 'evidence',
                formatter: (cell, row) => {
                    const tier = TIER_BY_LABEL[cell];
                    if (!tier) return cell;

                    const sources = row.cells[sourcesIndex]?.data || 'No sources listed';

                    return gridjs.html(renderTierBadge(tier, `${sources} — ${tier.description}`));
                }
            },
            {
                // The verdict label is the cell data so Grid.js sorts and
                // searches it as text, same trick as Evidence and Status
                name: 'Verification',
                id: 'verification',
                hideOnMobile: true,
                formatter: (cell) => {
                    const verdict = VERDICT_BY_LABEL[cell];
                    if (!verdict) return cell;

                    return gridjs.html(
                        `<span title="${escapeAttr(verdict.description)}">${escapeHtml(cell)}</span>`
                    );
                }
            },
            { name: 'First Seen', id: 'first_seen', hideOnMobile: true },
            {
                // Full text is the cell data so search and sort see all of it,
                // same rule as Description; only the rendering is abbreviated
                name: 'Detection',
                id: 'detection',
                hideOnMobile: true,
                formatter: (cell) => {
                    const text = String(cell ?? '');
                    return text.length > DESCRIPTION_SUMMARY_CHARS
                        ? truncateText(text, DESCRIPTION_SUMMARY_CHARS)
                        : text;
                }
            },
            {
                // Full text is the cell data so search and sort see all of it;
                // only the rendering is abbreviated
                name: 'Description',
                id: 'description',
                width: '250px',
                formatter: (cell) => {
                    const text = String(cell ?? '');
                    if (text.length <= DESCRIPTION_SUMMARY_CHARS) return text;

                    return gridjs.html(
                        '<details class="desc-expand">'
                        + `<summary>${escapeHtml(truncateText(text, DESCRIPTION_SUMMARY_CHARS))}</summary>`
                        + `${escapeHtml(text)}</details>`
                    );
                }
            },
            // Data side-channels for the formatters above; hidden by the
            // per-column CSS rules (DataTable ignores a `hidden` flag)
            { name: 'URL', id: 'url' },
            { name: 'Sources', id: 'sources' },
            { name: 'Conflict', id: 'conflict' }
        ];

        const urlIndex = columns.findIndex(column => column.id === 'url');
        const sourcesIndex = columns.findIndex(column => column.id === 'sources');
        const conflictIndex = columns.findIndex(column => column.id === 'conflict');

        const rows = this.allRows.map(row => {
            const evidence = detectionEvidence(row);

            return [
                row['Award ID'],
                deriveBadges(row, row._cat).statusPill.label,
                row['District'],
                row['Recipient'],
                formatCurrency(row.totalObligations, false),
                formatCurrency(row.totalOutlays, false),
                formatClaimedSavings(row),
                TIER_META[row._tier].label,
                rowVerdict(row).label,
                row['First Seen'] || '',
                evidence || '—',
                row['Description'] || '',
                row['URL'],
                row['Sources'] || '',
                row._conflict ? CONFLICT_FLAG : ''
            ];
        });

        this.contractsTable.render(columns, rows);
    }

    /**
     * Update last updated date in the UI
     * Fetches from metadata.json which contains the date of the last data change
     */
    async updateLastUpdated() {
        const lastUpdatedEl = document.getElementById('last-updated');
        if (!lastUpdatedEl) return;

        try {
            const response = await fetch('../data/cancellations/metadata.json');
            if (response.ok) {
                const metadata = await response.json();
                if (metadata.lastUpdated) {
                    // Parse date and format (add time to avoid timezone issues)
                    const date = new Date(metadata.lastUpdated + 'T00:00:00');
                    lastUpdatedEl.textContent = formatDate(date, 'long');
                    return;
                }
            }
        } catch (e) {
            console.warn('Could not fetch metadata.json:', e);
        }

        // Fallback to current date if metadata unavailable
        lastUpdatedEl.textContent = formatDate(new Date(), 'long');
    }

    /**
     * Show error message
     */
    showError(message) {
        const mapContainer = document.getElementById('choropleth-map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div class="error-message">
                    <p><strong>Error loading dashboard:</strong></p>
                    <p>${message}</p>
                    <p>Please try refreshing the page.</p>
                </div>
            `;
        }
    }

    /**
     * Check if a route is a district route (e.g., "CA-37", "NY-01")
     * @param {string} route - Route to check
     * @returns {boolean} True if route matches district pattern
     */
    isDistrictRoute(route) {
        return DISTRICT_CODE_RE.test(route);
    }

    /**
     * Show district summary view with filtered awards
     * @param {string} districtCode - District code (e.g., "CA-37")
     */
    showDistrictSummary(districtCode) {
        // Scroll to top of page
        window.scrollTo(0, 0);

        // Hide page tabs
        const pageTabs = document.getElementById('page-tabs');
        if (pageTabs) {
            pageTabs.style.display = 'none';
        }

        // Hide all tab content
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
        });

        // Show district summary
        const districtSummary = document.getElementById('district-summary');
        if (districtSummary) {
            districtSummary.classList.add('active');
        }

        // Render the awards
        this.renderDistrictAwards(districtCode);
    }

    /**
     * Hide district summary and return to main view
     */
    hideDistrictSummary() {
        // Show page tabs
        const pageTabs = document.getElementById('page-tabs');
        if (pageTabs) {
            pageTabs.style.display = '';
        }

        // Hide district summary
        const districtSummary = document.getElementById('district-summary');
        if (districtSummary) {
            districtSummary.classList.remove('active');
        }
    }

    /**
     * Wire the award-card description toggles
     *
     * Delegated from the static container, which survives every re-render of
     * the cards inside it, so the listener is registered exactly once.
     */
    initAwardCardInteractions() {
        const container = document.getElementById('district-awards');
        if (!container) return;

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.desc-toggle');
            if (!btn) return;

            const clamp = btn.parentElement?.querySelector('.desc-clamp');
            if (!clamp) return;

            btn.textContent = clamp.classList.toggle('expanded') ? 'Show less' : 'Show more';
        });
    }

    /**
     * Render award cards for a specific district
     * @param {string} districtCode - District code (e.g., "CA-37")
     */
    renderDistrictAwards(districtCode) {
        const container = document.getElementById('district-awards');
        const titleEl = document.getElementById('district-title');
        const statsEl = document.getElementById('district-summary-stats');

        if (!container || !titleEl) return;

        // Filter awards for this district
        const districtAwards = this.lensRows.filter(
            row => row.District === districtCode
        );

        // Update title
        titleEl.textContent = districtCode;

        // Update summary stats
        if (statsEl) {
            if (districtAwards.length === 0) {
                statsEl.textContent = '';
            } else {
                const s = summarize(districtAwards);
                const lensLabel = LENS_META[this.activeLens].label;
                const plural = districtAwards.length !== 1 ? 's' : '';

                let statsText = `Found <strong>${districtAwards.length} award${plural}</strong>`
                    + ` valued at <strong>${formatCurrency(s.totalObligations, true)}</strong>`
                    + ` under the <strong>${lensLabel}</strong> view`;

                if (s.claimedSavings > 0) {
                    statsText += ` with <strong>${formatCurrency(s.claimedSavings, true)}</strong> in savings claimed by DOGE`;
                }

                statsEl.innerHTML = statsText;
            }
        }

        // Render cards
        if (districtAwards.length === 0) {
            container.innerHTML = `
                <div class="error-message">
                    <p>No awards found for district ${districtCode}.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = districtAwards.map(award =>
            this.renderAwardCard(award)
        ).join('');
    }

    /**
     * Render a single award card
     * @param {Object} award - Award data object
     * @returns {string} HTML string for the card
     */
    renderAwardCard(award) {
        const { statusPill, divergence, trendGlyphs } = deriveBadges(award, award._cat);

        const obligations = formatCurrency(award.totalObligations, false);
        const outlays = formatCurrency(award.totalOutlays, false);
        const url = escapeAttr(award.URL || '#');

        const tier = TIER_META[award._tier] || TIER_META['claim-only'];
        const tierBadge = renderTierBadge(tier);

        const conflictGlyph = award._conflict ? CONFLICT_GLYPH : '';

        const truncation = truncationChip(award, award._cat);
        const chip = truncation
            ? `<span class="award-chip" title="${escapeAttr(truncation.title)}">${escapeHtml(truncation.label)}</span>`
            : '';

        const verdict = rowVerdict(award);
        const verdictField = `
                    <div class="award-field">
                        <span class="award-label">Weekly check</span>
                        <span class="award-value" title="${escapeAttr(verdict.description)}">${escapeHtml(verdict.label)}</span>
                    </div>`;

        // DOGE's own characterization of the action, when the row carries a claim
        const claimedStatus = String(award['Claimed Status'] ?? '').trim();
        const claimedStatusField = String(award['Claiming Source'] ?? '').trim()
            ? `
                    <div class="award-field">
                        <span class="award-label">DOGE claimed</span>
                        <span class="award-value">${escapeHtml(claimedStatus) || '—'}</span>
                    </div>`
            : '';

        // Curated explanation of the status, present on a minority of rows
        const statusDetail = String(award['Status Detail'] ?? '').trim();
        const statusNoteField = statusDetail
            ? `
                    <div class="award-field award-field--full">
                        <span class="award-label">Status note</span>
                        <span class="award-value">${escapeHtml(statusDetail)}</span>
                    </div>`
            : '';

        const detection = detectionEvidence(award);
        const detectionField = detection
            ? `
                    <div class="award-field award-field--full">
                        <span class="award-label">Detection</span>
                        <span class="award-value">${escapeHtml(detection)}</span>
                    </div>`
            : '';

        // Long descriptions are clamped rather than truncated: the full text
        // stays in the DOM so it is findable and copyable without a round trip
        const descriptionText = String(award.Description ?? '');
        const descriptionHtml = escapeHtml(descriptionText) || '—';
        const descriptionField = descriptionText.length > DESCRIPTION_CLAMP_CHARS
            ? `<span class="award-value desc-clamp">${descriptionHtml}</span>
                        <button class="desc-toggle" type="button">Show more</button>`
            : `<span class="award-value">${descriptionHtml}</span>`;

        const glyphs = trendGlyphs
            .map(({ glyph, title }) =>
                `<span class="award-trend" title="${escapeAttr(title)}">${escapeHtml(glyph)}</span>`
            )
            .join('');

        const divergencePill = divergence
            ? `<span class="badge ${divergence.cls}">${escapeHtml(divergence.label)}</span>`
            : '';

        // Claims only get the three-up comparison; unclaimed awards would show
        // an empty column and imply a claim that was never made.
        const claimRow = String(award['Claiming Source'] ?? '').trim()
            ? `<div class="award-claim-row">
                        ${renderClaimCell('Claimed', formatClaimedSavings(award))}
                        ${renderClaimCell('Obligated', obligations)}
                        ${renderClaimCell('Outlaid', outlays)}
                    </div>`
            : '';

        return `
            <div class="award-card">
                <div class="award-card-header">
                    <a href="${url}" target="_blank">${escapeHtml(award['Award ID'])}</a>
                    <span class="award-card-header-meta">
                        ${glyphs}
                        ${tierBadge}
                        <span class="badge ${statusPill.cls}">${escapeHtml(statusPill.label)}</span>${conflictGlyph}
                        ${divergencePill}
                        ${chip}
                    </span>
                </div>
                ${claimRow}
                <div class="award-card-body">
                    <div class="award-field">
                        <span class="award-label">Recipient</span>
                        <span class="award-value">${escapeHtml(award.Recipient)}</span>
                    </div>
                    <div class="award-field">
                        <span class="award-label">Total Obligations</span>
                        <span class="award-value">${obligations}</span>
                    </div>
                    <div class="award-field">
                        <span class="award-label">Total Outlays</span>
                        <span class="award-value">${outlays}</span>
                    </div>
                    <div class="award-field">
                        <span class="award-label">Start Date</span>
                        <span class="award-value">${escapeHtml(award['Start Date'])}</span>
                    </div>
                    <div class="award-field">
                        <span class="award-label">End Date</span>
                        <span class="award-value">${escapeHtml(award['End Date'])}</span>
                    </div>${verdictField}${claimedStatusField}${statusNoteField}${detectionField}
                    <div class="award-field award-field--full">
                        <span class="award-label">Description</span>
                        ${descriptionField}
                    </div>
                </div>
            </div>
        `;
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new CancellationsDashboard();
    dashboard.init();
});
