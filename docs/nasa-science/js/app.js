/**
 * NASA Science Spending Dashboard Application
 * Main entry point and dashboard-specific logic
 */

import { DATA_URLS, STATE_FIPS_MAP } from '../../shared/js/constants.js';
import {
    parseCSV,
    formatCurrency,
    formatDate,
    getGeoidFromDistrict,
    fetchText,
    groupBy,
    sumBy
} from '../../shared/js/utils.js';
import { ValueBox, createScienceValueBoxes } from '../../shared/js/components/value-box.js';
import { TabNavigation } from '../../shared/js/components/tabs.js';
import { HashRouter } from '../../shared/js/components/hash-router.js';
import { ChoroplethMap } from '../../shared/js/components/choropleth-map.js';
import { DataTable } from '../../shared/js/components/data-table.js';
import { StateSelector } from '../../shared/js/components/state-selector.js';

/**
 * Extract fiscal years from CSV headers
 * Looks for columns matching pattern: fy_XXXX_obligations
 * @param {Object} row - First row of parsed CSV data
 * @returns {number[]} Array of fiscal years, sorted descending (newest first)
 */
function extractFiscalYears(row) {
    return Object.keys(row)
        .filter(key => /^fy_\d{4}_obligations$/.test(key))
        .map(key => parseInt(key.match(/fy_(\d{4})_obligations/)[1]))
        .sort((a, b) => b - a); // Descending order (newest first)
}

class NASAScienceDashboard {
    constructor() {
        // Configuration - fiscal years will be detected from CSV headers
        this.fiscalYears = []; // Array of years, sorted descending (newest first)
        this.startYear = null; // Will be set from fiscalYears (oldest)
        this.endYear = null;   // Will be set from fiscalYears (newest)
        this.minSpending = 50000; // Minimum spending threshold for "districts with spending"

        // Raw data from CSVs
        this.districtRawData = [];
        this.stateRawData = [];

        // Processed data
        this.districtData = [];
        this.stateData = [];
        this.districtDataMap = {};
        this.stateDataMap = {};
        this.districtHoverInfo = {};
        this.stateHoverInfo = {};

        // Components
        this.districtMap = null;
        this.districtTable = null;
        this.stateTable = null;
        this.stateSelector = null;
        this.pageTabs = null;
        this.router = null;

        // Route to tab ID mapping
        this.routeMap = {
            'maps': 'summary-tab',
            'data': 'data-tab',
            'about': 'about-tab'
        };

        // Data file last modified
        this.lastUpdated = null;
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

            // Calculate statistics and render components
            this.renderValueBoxes();
            await this.renderMaps();
            this.renderTables();
            this.initStateSelector();

            // Update last updated date
            this.updateLastUpdated();

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
                const route = Object.entries(this.routeMap).find(([r, t]) => t === tabId)?.[0];
                if (route && this.router) {
                    this.router.navigate(route, false);
                }
            }
        });
        this.pageTabs.init();

        // Initialize hash router for deep-linking
        this.router = new HashRouter({
            defaultRoute: 'maps',
            onRouteChange: (route) => {
                const tabId = this.routeMap[route] || this.routeMap['maps'];
                this.pageTabs.activateTab(tabId);
            }
        });
        this.router.init();
    }

    /**
     * Load CSV data from both district and state files
     */
    async loadData() {
        const [districtCsvText, stateCsvText] = await Promise.all([
            fetchText(DATA_URLS.scienceDistrict),
            fetchText(DATA_URLS.scienceState)
        ]);

        this.districtRawData = parseCSV(districtCsvText);
        this.stateRawData = parseCSV(stateCsvText);

        // Detect fiscal years from CSV headers
        if (this.districtRawData.length > 0) {
            this.fiscalYears = extractFiscalYears(this.districtRawData[0]);
            this.endYear = this.fiscalYears[0]; // Most recent (first in descending array)
            this.startYear = this.fiscalYears[this.fiscalYears.length - 1]; // Oldest (last in array)
        }

        this.processData();
    }

    /**
     * Process the raw data into usable format
     */
    processData() {
        // Process district data
        this.districtData = this.districtRawData.map(row => {
            // Dynamically extract fiscal year values
            const fyValues = {};
            this.fiscalYears.forEach(year => {
                fyValues[`fy${year}`] = parseFloat(row[`fy_${year}_obligations`]) || 0;
            });
            const values = Object.values(fyValues);
            const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            const geoid = getGeoidFromDistrict(row['district']);

            return {
                state: row['state'],
                district: row['district'],
                ...fyValues,
                average,
                geoid
            };
        }).filter(row => row.geoid); // Filter out invalid districts

        // Process state data
        this.stateData = this.stateRawData.map(row => {
            // Dynamically extract fiscal year values
            const fyValues = {};
            this.fiscalYears.forEach(year => {
                fyValues[`fy${year}`] = parseFloat(row[`fy_${year}_obligations`]) || 0;
            });
            const values = Object.values(fyValues);
            const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            const fips = STATE_FIPS_MAP[row['state']];

            return {
                state: row['state'],
                ...fyValues,
                average,
                fips
            };
        }).filter(row => row.state); // Filter out invalid states

        // Build data maps and hover info for maps
        this.buildDistrictMapData();
        this.buildStateMapData();
    }

    /**
     * Build district data map and hover info for the choropleth
     */
    buildDistrictMapData() {
        this.districtDataMap = {};
        this.districtHoverInfo = {};

        this.districtData.forEach(row => {
            if (row.geoid) {
                this.districtDataMap[row.geoid] = row.average;
                this.districtHoverInfo[row.geoid] = `
                    <b>${row.district}</b><br>
                    Average Annual Obligations: ${formatCurrency(row.average, false)}
                `;
            }
        });
    }

    /**
     * Build state data map and hover info for the choropleth
     */
    buildStateMapData() {
        this.stateDataMap = {};
        this.stateHoverInfo = {};

        this.stateData.forEach(row => {
            if (row.state && row.fips) {
                // Use FIPS code as key (matches TopoJSON feature IDs like "01", "02", etc.)
                this.stateDataMap[row.fips] = row.average;
                this.stateHoverInfo[row.fips] = `
                    <b>${row.state}</b><br>
                    Average Annual Obligations: ${formatCurrency(row.average, false)}
                `;
            }
        });
    }

    /**
     * Get summary statistics for value boxes
     */
    getSummaryStats() {
        // Total spending for most recent fiscal year
        const mostRecentFY = `fy${this.fiscalYears[0]}`;
        const totalRecentFY = sumBy(this.districtData, mostRecentFY);

        // Districts with spending above threshold in any fiscal year
        const districtsWithSpending = this.districtData.filter(d =>
            this.fiscalYears.some(year => d[`fy${year}`] >= this.minSpending)
        );
        const districtCount = districtsWithSpending.length;
        const percentDistricts = Math.round((districtCount / 435) * 100);

        // States with spending in any fiscal year
        const statesWithSpending = this.stateData.filter(s =>
            this.fiscalYears.some(year => s[`fy${year}`] >= this.minSpending)
        );
        const stateCount = statesWithSpending.length;

        return {
            totalSpending: formatCurrency(totalRecentFY, true),
            districtsReached: districtCount,
            percentDistricts,
            statesCount: stateCount,
            recentFYSpending: formatCurrency(totalRecentFY, true),
            recentFY: this.endYear
        };
    }

    /**
     * Render value boxes with summary statistics
     */
    renderValueBoxes() {
        const stats = this.getSummaryStats();
        const boxes = createScienceValueBoxes(stats);
        ValueBox.render('value-boxes', boxes);
        ValueBox.animateIn('value-boxes');
    }

    /**
     * Render the district choropleth map
     */
    async renderMaps() {
        // Single district map with state boundaries
        this.districtMap = new ChoroplethMap('unified-map', {
            colorScale: 'science',
            level: 'district',
            mapType: 'choropleth',
            showLegend: true,
            showStateBoundaries: true  // Enable state boundary outlines
        });
        await this.districtMap.init(DATA_URLS.districts);
        this.districtMap.setData(this.districtDataMap, this.districtHoverInfo);
    }

    /**
     * Render data tables for districts and states
     */
    renderTables() {
        this.renderDistrictTable();
        this.renderStateTable();
    }

    /**
     * Render the district spending table
     */
    renderDistrictTable() {
        // Sort by most recent fiscal year spending descending
        const mostRecentFY = `fy${this.fiscalYears[0]}`;
        const sortedData = [...this.districtData].sort((a, b) => b[mostRecentFY] - a[mostRecentFY]);

        this.districtTable = new DataTable('district-table', {
            pageSize: 20,
            pagination: true
        });

        // Build columns dynamically from fiscal years
        const columns = [
            { name: 'District', id: 'district' },
            ...this.fiscalYears.map(year => ({
                name: `FY ${year} ($)`,
                id: `fy${year}`,
                currency: true
            }))
        ];

        this.districtTable.render(
            columns,
            sortedData.map(row => [
                row.district,
                ...this.fiscalYears.map(year => formatCurrency(row[`fy${year}`], false))
            ])
        );
    }

    /**
     * Render the state spending table
     */
    renderStateTable() {
        // Sort by most recent fiscal year spending descending
        const mostRecentFY = `fy${this.fiscalYears[0]}`;
        const sortedData = [...this.stateData].sort((a, b) => b[mostRecentFY] - a[mostRecentFY]);

        this.stateTable = new DataTable('state-table', {
            pageSize: 20,
            pagination: true
        });

        // Build columns dynamically from fiscal years
        const columns = [
            { name: 'State', id: 'state' },
            ...this.fiscalYears.map(year => ({
                name: `FY ${year} ($)`,
                id: `fy${year}`,
                currency: true
            }))
        ];

        this.stateTable.render(
            columns,
            sortedData.map(row => [
                row.state,
                ...this.fiscalYears.map(year => formatCurrency(row[`fy${year}`], false))
            ])
        );
    }

    /**
     * Initialize the state selector with map integration
     */
    initStateSelector() {
        this.stateSelector = new StateSelector('reports-table', {
            minSpending: this.minSpending, // Threshold for PDF availability
            mapContainer: document.querySelector('.map-container'), // For mobile UX - hide map during selection

            onStateSelect: (stateAbbr, districts) => {
                // Zoom map to state
                if (this.districtMap) {
                    this.districtMap.zoomToState(stateAbbr);
                }
            },

            onDistrictSelect: (districtCode, districtData) => {
                // Highlight district on map
                if (this.districtMap) {
                    this.districtMap.highlightDistrict(districtCode);
                }
            },

            onReset: () => {
                // Reset map to national view
                if (this.districtMap) {
                    this.districtMap.resetZoom();
                }
            }
        });

        // Pass ALL district data - StateSelector will handle insufficient data display
        this.stateSelector.init(this.districtData, this.stateData);

        // Set up click-to-zoom: clicking a state on the map triggers state selection
        if (this.districtMap) {
            this.districtMap.setStateClickHandler((stateAbbr) => {
                // Select state in sidebar (triggers zoom via onStateSelect)
                if (this.stateSelector) {
                    this.stateSelector.stateSelect?.setValue(stateAbbr, true);
                    this.stateSelector.selectState(stateAbbr);
                }
            });

            // Set up district click handler for when zoomed into a state
            this.districtMap.setDistrictClickHandler((districtCode) => {
                // When district is clicked on map, select it in the sidebar
                if (this.stateSelector) {
                    this.stateSelector.selectDistrictFromMap(districtCode);
                }
                // Also highlight on map
                this.districtMap.highlightDistrict(districtCode);
            });
        }
    }

    /**
     * Update last updated date and fiscal year range in the UI
     */
    updateLastUpdated() {
        const lastUpdatedEl = document.getElementById('last-updated');
        if (lastUpdatedEl) {
            // Use current date since we don't have file modification info in browser
            const now = new Date();
            lastUpdatedEl.textContent = formatDate(now, 'long');
        }

        // Update fiscal year range in About section
        const fiscalYearRangeEl = document.getElementById('fiscal-year-range');
        if (fiscalYearRangeEl && this.startYear && this.endYear) {
            fiscalYearRangeEl.textContent = `${this.startYear}-${this.endYear}`;
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        const mapContainer = document.getElementById('state-map');
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
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new NASAScienceDashboard();
    dashboard.init();
});
