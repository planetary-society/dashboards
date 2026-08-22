/**
 * NASA Cancellations Dashboard
 *
 * Two independent panels over two independent datasets:
 *
 *   cancellations — terminations.csv: NASA awards whose federal record shows
 *                   a termination action (the default, high-confidence panel)
 *   doge          — doge_claims.csv: every cancellation DOGE claimed, checked
 *                   against the award's federal transaction history
 *
 * The panels are datasets, not filters of one dataset: 88 of the 112 DOGE
 * claims also appear among the confirmed terminations, so their counts must
 * never be summed. That rule shapes the UI — counts live in each panel's
 * headline next to the noun they count (never in the panel-bar tab labels),
 * and the overlap is stated in the DOGE panel's own headline area.
 *
 * Architecture: one DOM skeleton shared by both panels; applyPanel() re-renders
 * the shared containers and hides the cards a panel doesn't use. Pure data
 * logic lives in terminations.js / doge-claims.js / fy-actions.js (Node-tested);
 * display copy in panel-views.js; this file owns the DOM and the routing.
 *
 * Routes: #cancellations (default) · #doge · #about · bare district codes
 * (#CA-37). District pages are dataset-independent — one URL means one thing —
 * showing both datasets for the district as labelled groups. Legacy routes
 * (#summary, #raw-data, #cancelled, #suspicious, #reversed) redirect with
 * history.replaceState so the Back button is never trapped.
 */

import {
    parseCSV,
    formatCurrency,
    formatDate,
    fetchText,
    groupBy,
    escapeHtml,
    escapeAttr,
    truncateText,
    pluralCount,
    formatCount
} from '../../shared/js/utils.js';
import { DATA_URLS } from '../../shared/js/constants.js';
import { ChoroplethMap } from '../../shared/js/components/choropleth-map.js';
import { DataTable } from '../../shared/js/components/data-table.js';
import { ValueBox } from '../../shared/js/components/value-box.js';
import { TabNavigation, CardTabs } from '../../shared/js/components/tabs.js';
import { HashRouter } from '../../shared/js/components/hash-router.js';
import { MISSING, placeLine, renderAwardLink } from './panel-common.js';
import {
    normalizeTerminations,
    terminationStats,
    monthlyCounts,
    overrideMeta,
    usaspendingUrl
} from './terminations.js';
import {
    normalizeDogeClaims,
    dogeStats,
    outcomeMix,
    overlapWithTerminations,
    OUTCOME_META
} from './doge-claims.js';
import { parseFyActions } from './fy-actions.js';
import {
    PANEL_META,
    panelHeadline,
    panelNote,
    createPanelValueBoxes,
    valueBoxNote,
    outcomeLead,
    timelineNote,
    districtSummaryLine,
    districtEmptyNote,
    terminationCardModel,
    claimCardModel,
    renderOutcomeBar,
    renderOutcomeLegend,
    renderOutcomeDefinitions
} from './panel-views.js';
import { TimelineChart } from './timeline-chart.js';
import { FyChart } from './fy-chart.js';

/** Matches district codes such as CA-37 or NY-01 */
const DISTRICT_CODE_RE = /^[A-Z]{2}-\d+$/;

/** Characters shown before a table description truncates */
const TABLE_DESCRIPTION_CHARS = 140;

/**
 * Hidden data-carrier column indexes, assigned where each table declares its
 * columns (findIndex on the column id — never a hardcoded position)
 */
const URL_COL = { terminations: -1, doge: -1 };

/** Characters shown before an award card's description clamps */
const CARD_DESCRIPTION_CHARS = 400;

/**
 * Routes that no longer exist; all redirect to the default panel
 *
 * Redirected with {replace: true} so the dead route never enters history —
 * otherwise Back would bounce the visitor straight back onto the redirect.
 */
const LEGACY_ROUTES = new Set(['summary', 'raw-data', 'cancelled', 'suspicious', 'reversed']);

/**
 * Render an outcome pill for a DOGE table cell or award card
 * @param {string} outcome - claimOutcome() key
 * @returns {string} HTML for the pill
 */
function renderOutcomePill(outcome) {
    const meta = OUTCOME_META[outcome];
    if (!meta) return escapeHtml(outcome || MISSING);

    return `<span class="outcome-pill outcome-pill--${outcome}">${escapeHtml(meta.short)}</span>`;
}

/**
 * Render a status badge for a terminations table cell or award card
 * @param {Object} row - Normalized termination row
 * @returns {string} HTML for the badge
 */
function renderStatusBadge(row) {
    const meta = overrideMeta(row.override_status);
    return `<span class="badge ${meta.badgeClass}">${escapeHtml(meta.label)}</span>`;
}

/**
 * Two-line recipient cell text: NAME, then CITY, ST — all caps
 *
 * Plain text with a newline separator so Grid.js sorts by name and search
 * matches both lines; the formatter turns the newline into markup.
 *
 * @param {string} name - Recipient name
 * @param {string} place - placeLine() result
 * @returns {string} 'NAME\nCITY, ST', or MISSING when nameless
 */
function recipientCellText(name, place) {
    const line1 = String(name || '').trim().toUpperCase();
    if (!line1) return MISSING;

    return place ? `${line1}\n${place}` : line1;
}

/**
 * Grid.js formatter for stacked two-line cells ('MAIN\nsubline')
 *
 * The data stays plain text (sortable by the first line, searchable on both);
 * this renders the newline as a muted second line.
 *
 * @param {string} cell - Cell data
 * @returns {*} Grid.js HTML cell
 */
function stackedCellFormatter(cell) {
    if (!cell || cell === MISSING) return cell;

    const [main, subline] = String(cell).split('\n');
    return gridjs.html(
        escapeHtml(main)
        + (subline ? `<br><span class="cell-subline">${escapeHtml(subline)}</span>` : '')
    );
}

class CancellationsDashboard {
    constructor() {
        /**
         * Per-panel data, filled by loadData():
         * {cancellations: {rows, stats, columns}, doge: {rows, stats, columns}}
         */
        this.panels = null;
        this.activePanel = 'cancellations';

        /** Cross-panel figures computed once at load */
        this.overlap = null;

        /** Parsed FY actions series for the static FY chart */
        this.fyItems = [];

        /** Map data (confirmed panel only) */
        this.districtCounts = {};
        this.hoverInfo = {};
        this.maxAwards = 1;

        // Component handles
        this.map = null;
        this.timeline = null;
        this.fyChart = null;
        this.pageTabs = null;
        this.router = null;
        this.districtsTable = null;
        this.recipientsTable = null;
        this.panelTable = null;
    }

    async init() {
        try {
            this.initTabs();
            this.updateLastUpdated();

            // The 900 KB district geojson downloads in parallel with the CSVs
            // and is awaited only after the panels have rendered — the map is
            // below the fold and must not delay the headline numbers.
            const mapReady = this.initMap();
            await this.loadData();

            this.initSummaryTables();
            this.initCharts();
            this.initAwardCardInteractions();

            // First render. Any deep-linked tab was already activated by the
            // router pre-load (its applyPanel no-opped on empty panels), so a
            // single explicit apply here renders exactly once.
            this.applyPanel(this.activePanel);

            await mapReady;
            this.map.setData(this.districtCounts, this.hoverInfo, this.maxAwards);

            // Replay a district deep link now that there is data to show
            const route = this.router.getCurrentRoute();
            if (this.isDistrictRoute(route)) {
                this.showDistrictSummary(route);
            }
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showError(error.message);
        }
    }

    /* ------------------------------------------------------------------ *
     *  Data loading
     * ------------------------------------------------------------------ */

    /**
     * Fetch and normalize both datasets plus the FY series
     *
     * All three files load in parallel; each panel keeps its rows, its stats,
     * and its column-availability flags. Cross-panel figures (the DOGE overlap)
     * are computed once here, not per render.
     */
    async loadData() {
        const [terminationsText, dogeText, fyText] = await Promise.all([
            fetchText(DATA_URLS.terminations),
            fetchText(DATA_URLS.dogeClaims),
            fetchText(DATA_URLS.fyActions)
        ]);

        const terminations = normalizeTerminations(parseCSV(terminationsText));
        const doge = normalizeDogeClaims(parseCSV(dogeText));

        this.panels = {
            cancellations: {
                rows: terminations.rows,
                columns: terminations.columns,
                stats: terminationStats(terminations.rows, terminations.columns)
            },
            doge: {
                rows: doge.rows,
                columns: doge.columns,
                stats: dogeStats(doge.rows)
            }
        };

        // Both ID namespaces are checked per row (see doge-claims.js), so the
        // Set can carry either key; give it both and stay immune to upstream
        // key-shape changes.
        const idSet = new Set();
        for (const row of terminations.rows) {
            if (row.award_id) idSet.add(row.award_id);
            if (row.generated_award_id) idSet.add(row.generated_award_id);
        }
        this.overlap = overlapWithTerminations(doge.rows, idSet);

        this.fyItems = parseFyActions(parseCSV(fyText));

        this.calculateDistrictData();
    }

    /**
     * District counts and hover info for the map (confirmed awards only)
     *
     * Partial actions (descoped / closed out) are excluded: the map's legend
     * says "Terminated awards", and a descoped award is not one. This keeps
     * the map's total consistent with the panel headline.
     */
    calculateDistrictData() {
        const confirmed = this.panels.cancellations.rows.filter(
            (row) => !row._partial && row._geoid
        );
        const byGeoid = groupBy(confirmed, '_geoid');

        this.districtCounts = {};
        this.hoverInfo = {};
        this.maxAwards = 1;

        Object.entries(byGeoid).forEach(([geoid, rows]) => {
            const count = rows.length;
            this.districtCounts[geoid] = count;
            this.maxAwards = Math.max(this.maxAwards, count);

            const district = rows[0]._district;
            this.hoverInfo[geoid] = `
                <strong>${escapeHtml(district)}</strong><br>
                ${pluralCount(count, 'terminated award')}
            `;
        });
    }

    /* ------------------------------------------------------------------ *
     *  Tabs and routing
     * ------------------------------------------------------------------ */

    initTabs() {
        // No contentClass: the two dataset tabs share one section, so tab→
        // section mapping is managed here (showSection), not by the component.
        this.pageTabs = new TabNavigation('page-tabs', {
            tabClass: 'page-tab',
            onTabChange: (tabId) => {
                if (tabId === 'about') {
                    this.showSection('about-tab');
                } else {
                    this.showSection('summary-tab');
                    this.applyPanel(tabId);
                }
                if (this.router && tabId !== this.router.getCurrentRoute()) {
                    this.router.navigate(tabId, false);
                }
            }
        });
        this.pageTabs.init();

        this.router = new HashRouter({
            defaultRoute: 'cancellations',
            onRouteChange: (route) => this.handleRoute(route)
        });
        this.router.init();

        new CardTabs('table-tabs').init();

        // Back from a district page returns to the panel the visitor left
        const backBtn = document.getElementById('back-to-summary');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.router.navigate(this.activePanel);
            });
        }
    }

    /**
     * Route dispatch: legacy redirects, district pages, panels, about
     * @param {string} route - Current route (without '#')
     */
    handleRoute(route) {
        if (LEGACY_ROUTES.has(route)) {
            // replace, not push: the dead route must not survive in history,
            // or Back becomes a redirect loop
            this.router.navigate('cancellations', { replace: true });
            return;
        }

        if (this.isDistrictRoute(route)) {
            this.showDistrictSummary(route);
            return;
        }

        this.hideDistrictSummary();

        if (route !== 'about') {
            this.activePanel = PANEL_META[route] ? route : 'cancellations';
        }
        const tabId = route === 'about' ? 'about' : this.activePanel;

        if (this.pageTabs.currentTab !== tabId) {
            // Tab change: the onTabChange callback shows the section, applies
            // the panel, and syncs the route (guarded against loops).
            this.pageTabs.activateTab(tabId);
        } else {
            // Same tab (e.g. returning from a district page, which hid every
            // section): restore visibility without a full panel re-render.
            this.showSection(tabId === 'about' ? 'about-tab' : 'summary-tab');
        }
    }

    /**
     * Show one of the two page sections, hiding the other
     * @param {'summary-tab'|'about-tab'} sectionId - Section to show
     */
    showSection(sectionId) {
        for (const id of ['summary-tab', 'about-tab']) {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('active', id === sectionId);
        }
    }

    isDistrictRoute(route) {
        return DISTRICT_CODE_RE.test(route);
    }

    /* ------------------------------------------------------------------ *
     *  Panel switching
     * ------------------------------------------------------------------ */

    /**
     * Switch the active panel and re-render everything driven by it
     * @param {'cancellations'|'doge'} panelId - Panel to activate
     */
    applyPanel(panelId) {
        if (!this.panels) return;

        this.activePanel = panelId;
        const panel = this.panels[panelId];
        const meta = PANEL_META[panelId];

        this.renderHeadline(panelId, panel);
        this.renderValueBoxes(panelId, panel);
        this.renderOutcomePanel(panelId, panel);

        // The map + districts/recipients row belongs to the confirmed panel;
        // the DOGE panel is just the claims record (outcome bar + table).
        this.setMainContentVisibility(meta.hasMap);
        if (meta.hasMap) this.renderSummaryTables(panelId, panel);

        this.setChartVisibility(panelId);
        this.renderPanelTable(panelId, panel);
        this.updateDownloadLink(meta);
        this.announcePanel(meta, panel);
    }

    renderHeadline(panelId, panel) {
        const headlineEl = document.getElementById('panel-headline');
        const noteEl = document.getElementById('panel-note');

        if (headlineEl) headlineEl.textContent = panelHeadline(panelId, panel.stats);
        if (noteEl) noteEl.textContent = panelNote(panelId, panel.stats, this.overlap);
    }

    renderValueBoxes(panelId, panel) {
        ValueBox.render('value-boxes', createPanelValueBoxes(panelId, panel.stats));
        ValueBox.animateIn('value-boxes');

        const noteEl = document.getElementById('value-boxes-note');
        if (noteEl) noteEl.textContent = valueBoxNote(panelId, panel.stats);
    }

    /**
     * DOGE claims-vs-outcomes card (hidden on every other panel)
     */
    renderOutcomePanel(panelId, panel) {
        const card = document.getElementById('outcome-card');
        if (!card) return;

        if (panelId !== 'doge') {
            card.hidden = true;
            return;
        }
        card.hidden = false;

        const leadEl = document.getElementById('outcome-lead');
        if (leadEl) leadEl.textContent = outcomeLead(panel.stats);

        const body = document.getElementById('outcome-body');
        if (body) {
            const mix = outcomeMix(panel.rows);
            body.innerHTML =
                renderOutcomeBar(mix)
                + renderOutcomeLegend(mix)
                + renderOutcomeDefinitions();
        }
    }

    /**
     * Show or hide the whole map + summary-tables row
     *
     * [hidden] is authoritative (base.css), so the row can't be resurrected
     * by the page's mobile .map-container display override.
     */
    setMainContentVisibility(visible) {
        const row = document.getElementById('main-content-row');
        if (row) row.hidden = !visible;
    }

    /**
     * Districts/Recipients summary tables over the active panel's rows
     *
     * Both normalizers emit `_district`/`_recipient`, so the aggregation is
     * panel-agnostic; only the count column's unit label differs.
     */
    renderSummaryTables(panelId, panel) {
        const unitHeader = PANEL_META[panelId].unitLabel;

        // Sorted [key, count] pairs for a derived field
        const countBy = (rows, key) => Object.entries(groupBy(rows.filter((r) => r[key]), key))
            .map(([k, group]) => [k, group.length])
            .sort((a, b) => b[1] - a[1]);

        this.districtsTable.render(
            [
                {
                    name: 'District',
                    id: 'district',
                    formatter: (cell) => {
                        if (!DISTRICT_CODE_RE.test(cell)) return cell;
                        return gridjs.html(`<a href="#${cell}" class="district-link">${cell}</a>`);
                    }
                },
                { name: unitHeader, id: 'count' }
            ],
            countBy(panel.rows, '_district')
        );

        // Recipients aggregate by name but display the two-line NAME +
        // CITY, ST cell; an organization's location comes from its first row.
        const recipientData = Object.entries(groupBy(panel.rows.filter((r) => r._recipient), '_recipient'))
            .map(([name, group]) => [recipientCellText(name, placeLine(group[0])), group.length])
            .sort((a, b) => b[1] - a[1]);

        this.recipientsTable.render(
            [
                {
                    name: 'Recipient',
                    id: 'recipient',
                    width: '70%',
                    formatter: stackedCellFormatter
                },
                { name: unitHeader, id: 'count' }
            ],
            recipientData
        );
    }

    /**
     * The monthly timeline and FY chart belong to the confirmed panel only
     */
    setChartVisibility(panelId) {
        const isConfirmed = panelId === 'cancellations';

        const timelineCard = document.getElementById('timeline-card');
        if (timelineCard) timelineCard.hidden = !isConfirmed;

        const fyCard = document.getElementById('fy-card');
        if (fyCard) fyCard.hidden = !isConfirmed;

        if (isConfirmed) {
            this.renderTimeline();
            // Re-render, not just unhide: a chart first drawn into a hidden
            // container measured a fallback width, and its wrapped in-SVG
            // title only fits when measured at the real one.
            this.renderFyChart();

            // The caption's denominator tracks the live file so the sentence
            // can't rot as the daily refresh adds rows
            const denominator = document.getElementById('fy-denominator');
            if (denominator) {
                denominator.textContent = formatCount(this.panels.cancellations.rows.length);
            }
        }
    }

    /* ------------------------------------------------------------------ *
     *  Charts
     * ------------------------------------------------------------------ */

    initCharts() {
        this.timeline = new TimelineChart('timeline-chart', {
            ariaLabel: 'Confirmed termination actions by month'
        });
        this.fyChart = new FyChart('fy-chart', {
            ariaLabel: 'FPDS termination-for-convenience contract actions by fiscal year, all NASA',
            barColor: 'var(--red-500)'
        });
    }

    renderTimeline() {
        if (!this.timeline) return;

        const { months, skipped } = monthlyCounts(this.panels.cancellations.rows);
        this.timeline.render(months, {
            metric: 'count',
            barColor: 'var(--red-500)',
            countLabel: 'Actions'
        });

        const noteEl = document.getElementById('timeline-note');
        if (noteEl) noteEl.textContent = timelineNote(skipped);
    }

    /**
     * FY chart is static (one series, one file) — rendered once at init
     */
    renderFyChart() {
        if (!this.fyChart) return;
        this.fyChart.render(this.fyItems, { countLabel: 'Actions' });
    }

    /* ------------------------------------------------------------------ *
     *  Map
     * ------------------------------------------------------------------ */

    /**
     * Construct the map and start its geojson download
     *
     * Deliberately does NOT set data — init() awaits the returned promise
     * after the panels are on screen, then calls setData once. Bubble clicks
     * route to the district page through the component's own click contract.
     *
     * @returns {Promise<void>} Resolves when the base map has rendered
     */
    initMap() {
        this.map = new ChoroplethMap('choropleth-map', {
            colorScale: 'cancellations',
            level: 'district',
            legendTitle: 'Terminated awards'
        });
        this.map.setDistrictClickHandler((districtCode) => {
            this.router.navigate(districtCode);
        });

        return this.map.init(DATA_URLS.districts);
    }

    /* ------------------------------------------------------------------ *
     *  Tables
     * ------------------------------------------------------------------ */

    initSummaryTables() {
        const options = { pagination: false, height: 400, fixedHeader: true };
        this.districtsTable = new DataTable('districts-table', options);
        this.recipientsTable = new DataTable('recipients-table', options);
        this.panelTable = new DataTable('panel-table', {
            pageSize: 25,
            pagination: true,
            className: 'table'
        });
    }

    renderPanelTable(panelId, panel) {
        const headingEl = document.getElementById('panel-table-heading');
        if (headingEl) headingEl.textContent = PANEL_META[panelId].tableHeading;

        if (panelId === 'doge') {
            this.renderDogeTable(panel);
        } else {
            this.renderTerminationsTable(panel);
        }
    }

    /**
     * Cell conventions for both panel tables:
     *  - purely presentational cells (badges, pills) carry HTML in the data
     *    array with a pass-through formatter — they are never sorted/searched
     *  - the Award ID stays PLAIN data so Grid.js sorts and searches the bare
     *    id; its link URL rides in a hidden data-carrier column, located by
     *    id (never by a hardcoded index)
     */
    renderTerminationsTable(panel) {
        const columns = [
            {
                name: 'Award ID',
                id: 'award_id',
                formatter: (cell, row) => gridjs.html(
                    renderAwardLink(cell, row.cells[URL_COL.terminations].data)
                )
            },
            {
                name: 'Recipient',
                id: 'recipient',
                width: '22%',
                formatter: stackedCellFormatter
            },
            {
                name: 'Status',
                id: 'status',
                formatter: (cell) => gridjs.html(cell)
            },
            { name: 'District', id: 'district', hideOnMobile: true },
            { name: 'Obligated', id: 'obligated', hideOnMobile: true },
            { name: 'url', id: 'url', hidden: true },
            {
                name: 'Description',
                id: 'description',
                hideOnMobile: true,
                width: '30%'
            }
        ];
        URL_COL.terminations = columns.findIndex((c) => c.id === 'url');

        const data = panel.rows.map((row) => [
            row.award_id,
            recipientCellText(row._recipient, placeLine(row)),
            renderStatusBadge(row)
                + (row.action_date ? `<span class="cell-subline">${escapeHtml(row.action_date)}</span>` : ''),
            row._district || MISSING,
            row._obligated !== null ? formatCurrency(row._obligated, false) : MISSING,
            usaspendingUrl(row),
            truncateText(row.transaction_description || row.award_description || '', TABLE_DESCRIPTION_CHARS)
        ]);

        this.panelTable.render(columns, data);
    }

    renderDogeTable(panel) {
        const columns = [
            {
                name: 'Recipient',
                id: 'recipient',
                width: '22%',
                formatter: stackedCellFormatter
            },
            { name: 'Claimed savings', id: 'savings' },
            {
                name: "DOGE's stated status",
                id: 'status',
                hideOnMobile: true,
                formatter: stackedCellFormatter
            },
            {
                name: 'Outcome',
                id: 'outcome',
                formatter: (cell) => gridjs.html(cell)
            },
            {
                name: 'Award ID',
                id: 'awardId',
                hideOnMobile: true,
                formatter: (cell, row) => gridjs.html(
                    cell === MISSING ? cell : renderAwardLink(cell, row.cells[URL_COL.doge].data)
                )
            },
            { name: 'url', id: 'url', hidden: true },
            { name: 'Current obligation', id: 'obligation', hideOnMobile: true },
            {
                name: 'Description',
                id: 'description',
                hideOnMobile: true,
                width: '25%'
            }
        ];
        URL_COL.doge = columns.findIndex((c) => c.id === 'url');

        const data = panel.rows.map((row) => [
            recipientCellText(row._recipient, placeLine(row)),
            row._savings !== null && row._savings !== 0
                ? formatCurrency(row._savings, false)
                : MISSING,
            row.doge_claim_date
                ? `${row._statusLabel}\n${row.doge_claim_date}`
                : row._statusLabel,
            renderOutcomePill(row._outcome),
            row.generated_award_id ? (row.doge_award_id || row.generated_award_id) : MISSING,
            usaspendingUrl(row),
            row._obligation !== null ? formatCurrency(row._obligation, false) : MISSING,
            truncateText(row.latest_description || '', TABLE_DESCRIPTION_CHARS)
        ]);

        this.panelTable.render(columns, data);
    }

    updateDownloadLink(meta) {
        const link = document.getElementById('panel-download');
        if (link) link.href = meta.downloadUrl;
    }

    announcePanel(meta, panel) {
        const announcer = document.getElementById('panel-announcer');
        if (announcer) {
            announcer.textContent = `Showing ${meta.label} — ${panelHeadline(this.activePanel, panel.stats)}`;
        }
    }

    /* ------------------------------------------------------------------ *
     *  District pages (dataset-independent)
     * ------------------------------------------------------------------ */

    showDistrictSummary(districtCode) {
        window.scrollTo(0, 0);

        const pageTabs = document.getElementById('page-tabs');
        if (pageTabs) pageTabs.style.display = 'none';

        document.querySelectorAll('.tab-content').forEach((el) => {
            el.classList.remove('active');
        });

        const districtSummary = document.getElementById('district-summary');
        if (districtSummary) districtSummary.classList.add('active');

        this.renderDistrictPage(districtCode);
    }

    hideDistrictSummary() {
        const pageTabs = document.getElementById('page-tabs');
        if (pageTabs) pageTabs.style.display = '';

        const districtSummary = document.getElementById('district-summary');
        if (districtSummary) districtSummary.classList.remove('active');
    }

    /**
     * Render one district's page: both datasets, as labelled groups
     *
     * One URL means one thing: a #CA-37 link shows the same page no matter
     * which panel the sharer was on.
     */
    renderDistrictPage(districtCode) {
        const titleEl = document.getElementById('district-title');
        const statsEl = document.getElementById('district-summary-stats');
        const staticLink = document.getElementById('district-static-link');
        const container = document.getElementById('district-groups');
        if (!titleEl || !container) return;

        titleEl.textContent = `Congressional District ${districtCode}`;

        // Data may not be loaded yet on a cold deep link; init() replays.
        if (!this.panels) {
            container.innerHTML = '';
            if (statsEl) statsEl.textContent = 'Loading…';
            if (staticLink) staticLink.hidden = true;
            return;
        }

        const inDistrict = (panelId) => this.panels[panelId].rows.filter(
            (row) => row._district === districtCode
        );
        const groupSpecs = [
            ['cancellations', inDistrict('cancellations'), (row) => this.renderTerminationCard(row)],
            ['doge', inDistrict('doge'), (row) => this.renderClaimCard(row)]
        ];

        if (statsEl) {
            statsEl.textContent = districtSummaryLine(groupSpecs[0][1].length, groupSpecs[1][1].length);
        }

        // The bake generates a static page for every district with data in
        // either dataset, so an empty district (a hand-typed hash) has no
        // page to link to.
        if (staticLink) {
            const hasData = groupSpecs[0][1].length + groupSpecs[1][1].length > 0;
            staticLink.href = `districts/${districtCode}/`;
            staticLink.hidden = !hasData;
        }

        container.innerHTML = groupSpecs.map(([panelId, rows, renderCard]) =>
            this.renderDistrictGroup(
                PANEL_META[panelId].label,
                rows.length
                    ? rows.map(renderCard).join('')
                    : `<p class="district-group-note">${escapeHtml(districtEmptyNote(panelId))}</p>`
            )
        ).join('');
    }

    renderDistrictGroup(heading, bodyHtml) {
        return `
            <section class="district-group">
                <h3 class="district-group-heading">${escapeHtml(heading)}</h3>
                <div class="award-cards-grid">${bodyHtml}</div>
            </section>
        `;
    }

    /**
     * Award card body shared by both datasets
     * @param {Array<[string, string]>} fields - [label, valueHtml] pairs
     * @param {string} description - Full description text ('' to omit)
     * @param {string} badgeHtml - Status/outcome HTML for the header
     * @param {string} title - Card heading (recipient name, caps)
     * @param {string} [subtitle] - Location line under the heading
     * @returns {string} HTML
     */
    renderAwardCard(fields, description, badgeHtml, title, subtitle = '') {
        const fieldHtml = fields
            .filter(([, value]) => value)
            .map(([label, value]) => `
                <div class="award-field">
                    <span class="award-label">${escapeHtml(label)}</span>
                    <span class="award-value">${value}</span>
                </div>
            `)
            .join('');

        // Description is one more field row (award-field carries the card's
        // padding), clamped with a toggle when long — the full text stays in
        // the DOM so it is findable and copyable without a round trip.
        const clamped = description.length > CARD_DESCRIPTION_CHARS;
        const descriptionHtml = description
            ? `
                <div class="award-field award-field--full">
                    <span class="award-label">Description</span>
                    <span class="award-value${clamped ? ' desc-clamp' : ''}">${escapeHtml(description)}</span>
                    ${clamped ? '<button type="button" class="desc-toggle">Show more</button>' : ''}
                </div>
            `
            : '';

        const subtitleHtml = subtitle
            ? `<p class="award-recipient-place">${escapeHtml(subtitle)}</p>`
            : '';

        return `
            <article class="award-card">
                <div class="award-card-header">
                    <div class="award-card-title">
                        <h4 class="award-recipient">${escapeHtml(title)}</h4>
                        ${subtitleHtml}
                    </div>
                    ${badgeHtml}
                </div>
                <div class="award-card-body">${fieldHtml}${descriptionHtml}</div>
            </article>
        `;
    }

    renderTerminationCard(row) {
        return this.renderCardFromModel(terminationCardModel(row));
    }

    renderClaimCard(row) {
        return this.renderCardFromModel(claimCardModel(row));
    }

    /**
     * Turn a card view-model (panel-views.js) into award-card markup
     *
     * The model carries data, not markup; the only rendering decisions made
     * here are the ones the model cannot know: linked values become anchors,
     * blank values drop their field row.
     *
     * @param {Object} model - terminationCardModel()/claimCardModel() result
     * @returns {string} HTML for the card
     */
    renderCardFromModel({ title, subtitle, badge, fields, description }) {
        return this.renderAwardCard(
            fields.map(({ label, text, url }) => [
                label,
                url ? renderAwardLink(text, url) : text ? escapeHtml(text) : ''
            ]),
            description,
            `<span class="${badge.className}">${escapeHtml(badge.label)}</span>`,
            title,
            subtitle
        );
    }

    /**
     * Wire the award-card description toggles (delegated, registered once)
     */
    initAwardCardInteractions() {
        const container = document.getElementById('district-groups');
        if (!container) return;

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.desc-toggle');
            if (!btn) return;

            const clamp = btn.parentElement?.querySelector('.desc-clamp');
            if (!clamp) return;

            btn.textContent = clamp.classList.toggle('expanded') ? 'Show less' : 'Show more';
        });
    }

    /* ------------------------------------------------------------------ *
     *  Chrome
     * ------------------------------------------------------------------ */

    /**
     * Fill the persistent freshness line from metadata.json
     *
     * Reads only the top-level `lastUpdated`, which both the new per-file
     * shape and the legacy flat shape carry. On failure the date reads as
     * absent — never today's date, which would fake freshness.
     */
    async updateLastUpdated() {
        const el = document.getElementById('last-updated');
        if (!el) return;

        try {
            const response = await fetch('../data/cancellations/metadata.json');
            if (response.ok) {
                const metadata = await response.json();
                if (metadata.lastUpdated) {
                    const date = new Date(metadata.lastUpdated + 'T00:00:00');
                    el.textContent = formatDate(date, 'long');
                    return;
                }
            }
        } catch (e) {
            console.warn('Could not fetch metadata.json:', e);
        }

        el.textContent = MISSING;
    }

    showError(message) {
        const mapContainer = document.getElementById('choropleth-map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div class="error-message">
                    <p><strong>Error loading dashboard:</strong></p>
                    <p>${escapeHtml(message)}</p>
                    <p>Please try refreshing the page.</p>
                </div>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CancellationsDashboard().init();
});
