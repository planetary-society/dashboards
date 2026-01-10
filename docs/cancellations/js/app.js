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
    countUnique,
    truncateText
} from '../../shared/js/utils.js';
import { ValueBox, createCancellationsValueBoxes } from '../../shared/js/components/value-box.js';
import { TabNavigation, CardTabs } from '../../shared/js/components/tabs.js';
import { HashRouter } from '../../shared/js/components/hash-router.js';
import { ChoroplethMap } from '../../shared/js/components/choropleth-map.js';
import { DataTable } from '../../shared/js/components/data-table.js';

class CancellationsDashboard {
    constructor() {
        this.rawData = [];
        this.cleanedData = [];
        this.districtCounts = {};
        this.hoverInfo = {};
        this.maxContracts = 1;

        this.map = null;
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

            // Render components
            this.renderValueBoxes();
            await this.renderMap();
            this.renderTables();

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
     * Load CSV data
     */
    async loadData() {
        const csvText = await fetchText(DATA_URLS.cancellations);
        this.rawData = parseCSV(csvText);
        this.processData();
    }

    /**
     * Extract reported savings amount from description text
     * @param {string} description - Description field text
     * @returns {number} Savings amount as float, or 0 if not found
     */
    extractReportedSavings(description) {
        if (!description) return 0;
        const match = description.match(/Reported savings: \$([\d,]+(?:\.\d{2})?)/);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        }
        return 0;
    }

    /**
     * Process the raw data
     */
    processData() {
        // Filter out total row and clean data
        this.cleanedData = this.rawData
            .filter(row => {
                // Skip total row
                const endDate = row['End Date'] || '';
                return endDate.toLowerCase() !== 'total';
            })
            .map(row => {
                // Parse and clean total obligations
                const obligations = parseCurrency(row['Award Amount']);
                const outlays = parseCurrency(row['Total Outlays']);

                return {
                    ...row,
                    totalObligations: obligations,
                    totalOutlays: outlays,
                    geoid: getGeoidFromDistrict(row['District']),
                    reportedSavings: this.extractReportedSavings(row['Description'])
                };
            })
            .filter(row => row.totalObligations !== null);

        // Calculate district counts and hover info
        this.calculateDistrictData();
    }

    /**
     * Calculate district counts and hover info for map
     */
    calculateDistrictData() {
        const districtGroups = groupBy(
            this.cleanedData.filter(row => row.geoid),
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
                return `<b>${contract['Recipient']}</b><br>${amt} (Award ID: ${contract['Award ID']})`;
            });

            this.hoverInfo[geoid] = header + '<br><br>' + lines.join('<br>');
        });
    }

    /**
     * Get summary statistics
     */
    getSummaryStats() {
        const totalObligations = sumBy(this.cleanedData, 'totalObligations');
        const totalReportedSavings = sumBy(this.cleanedData, 'reportedSavings');

        return {
            totalContracts: this.cleanedData.length,
            totalObligations: formatCurrency(totalObligations, true),
            totalReportedSavings: formatCurrency(totalReportedSavings, true),
            uniqueDistricts: countUnique(this.cleanedData, 'District')
        };
    }

    /**
     * Render value boxes
     */
    renderValueBoxes() {
        const stats = this.getSummaryStats();
        const boxes = createCancellationsValueBoxes(stats);
        ValueBox.render('value-boxes', boxes);
        ValueBox.animateIn('value-boxes');
    }

    /**
     * Render the choropleth map
     */
    async renderMap() {
        this.map = new ChoroplethMap('choropleth-map', {
            colorScale: 'cancellations',
            level: 'district'
        });

        await this.map.init(DATA_URLS.districts);
        this.map.setData(this.districtCounts, this.hoverInfo, this.maxContracts);

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
     * Render data tables
     */
    renderTables() {
        this.renderDistrictsTable();
        this.renderRecipientsTable();
        this.renderContractsTable();
    }

    /**
     * Render districts table
     */
    renderDistrictsTable() {
        // Aggregate by district
        const districtGroups = groupBy(this.cleanedData, 'District');
        const districtData = Object.entries(districtGroups)
            .map(([district, contracts]) => {
                const rawTotal = sumBy(contracts, 'totalObligations');
                return {
                    district,
                    contractCount: contracts.length,
                    rawObligations: rawTotal,
                    totalObligations: formatCurrency(rawTotal, false)
                };
            })
            .sort((a, b) => b.rawObligations - a.rawObligations);  // Sort by Total Obligations desc

        this.districtsTable = new DataTable('districts-table', {
            pagination: false,
            height: 400,
            fixedHeader: true
        });

        this.districtsTable.render(
            [
                {
                    name: 'District',
                    id: 'district',
                    formatter: (cell) => {
                        return gridjs.html(`<a href="#${cell}" class="district-link">${cell}</a>`);
                    }
                },
                { name: 'Cancellations', id: 'contracts' },
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
        const recipientGroups = groupBy(this.cleanedData, 'Recipient');
        const recipientData = Object.entries(recipientGroups)
            .map(([recipient, contracts]) => ({
                recipient,
                contractCount: contracts.length,
                totalObligations: formatCurrency(sumBy(contracts, 'totalObligations'), false)
            }))
            .sort((a, b) => b.contractCount - a.contractCount);

        this.recipientsTable = new DataTable('recipients-table', {
            pagination: false,
            height: 400,
            fixedHeader: true
        });

        this.recipientsTable.render(
            [
                { name: 'Recipient', id: 'recipient', width: '50%' },
                { name: 'Cancellations', id: 'contracts' },
                { name: 'Total', id: 'obligations', currency: true }
            ],
            recipientData.map(row => [row.recipient, row.contractCount, row.totalObligations])
        );
    }

    /**
     * Render full contracts table
     */
    renderContractsTable() {
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
                    const url = row.cells[8]?.data || '#';
                    return gridjs.html(`<a href="${url}" target="_blank">${cell}</a>`);
                }
            },
            { name: 'District', id: 'district', width: '130px' },
            { name: 'Recipient', id: 'recipient' },
            { name: 'Start Date', id: 'start_date', width: '140px' },
            { name: 'End Date', id: 'end_date', width: '140px' },
            { name: 'Total Obligations', id: 'obligations', currency: true },
            { name: 'Total Outlays', id: 'outlays', currency: true },
            { name: 'Description', id: 'description', width: '250px' },
            { name: 'URL', id: 'url', hidden: true }
        ];

        const rows = this.cleanedData.map(row => [
            row['Award ID'],
            row['District'],
            row['Recipient'],
            row['Start Date'],
            row['End Date'],
            formatCurrency(row.totalObligations, false),
            formatCurrency(row.totalOutlays, false),
            truncateText(row['Description'], 200),
            row['URL']
        ]);

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
        return /^[A-Z]{2}-\d+$/.test(route);
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
     * Render award cards for a specific district
     * @param {string} districtCode - District code (e.g., "CA-37")
     */
    renderDistrictAwards(districtCode) {
        const container = document.getElementById('district-awards');
        const titleEl = document.getElementById('district-title');
        const statsEl = document.getElementById('district-summary-stats');

        if (!container || !titleEl) return;

        // Filter awards for this district
        const districtAwards = this.cleanedData.filter(
            row => row.District === districtCode
        );

        // Update title
        titleEl.textContent = districtCode;

        // Update summary stats
        if (statsEl) {
            if (districtAwards.length === 0) {
                statsEl.textContent = '';
            } else {
                const totalObligations = sumBy(districtAwards, 'totalObligations');
                const totalReportedSavings = sumBy(districtAwards, 'reportedSavings');

                let statsText = `Found <strong>${districtAwards.length} cancelled award${districtAwards.length !== 1 ? 's' : ''}</strong> valued at <strong>${formatCurrency(totalObligations, true)}</strong>`;

                if (totalReportedSavings > 0) {
                    statsText += ` with <strong>${formatCurrency(totalReportedSavings, true)}</strong> in savings claimed by DOGE`;
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
        const obligations = formatCurrency(award.totalObligations, false);
        const outlays = formatCurrency(award.totalOutlays, false);
        const description = award.Description || '—';
        const url = award.URL || '#';

        return `
            <div class="award-card">
                <div class="award-card-header">
                    <a href="${url}" target="_blank">${award['Award ID']}</a>
                </div>
                <div class="award-card-body">
                    <div class="award-field">
                        <span class="award-label">Recipient</span>
                        <span class="award-value">${award.Recipient}</span>
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
                        <span class="award-value">${award['Start Date']}</span>
                    </div>
                    <div class="award-field">
                        <span class="award-label">End Date</span>
                        <span class="award-value">${award['End Date']}</span>
                    </div>
                    <div class="award-field award-field--full">
                        <span class="award-label">Description</span>
                        <span class="award-value">${description}</span>
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
