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
import { Navbar } from '../../shared/js/components/navbar.js';
import { ValueBox, createScienceValueBoxes } from '../../shared/js/components/value-box.js';
import { TabNavigation, CardTabs } from '../../shared/js/components/tabs.js';
import { HashRouter } from '../../shared/js/components/hash-router.js';
import { ChoroplethMap } from '../../shared/js/components/choropleth-map.js';
import { DataTable } from '../../shared/js/components/data-table.js';

class NASAScienceDashboard {
    constructor() {
        // Configuration
        this.startYear = 2022;
        this.endYear = 2024;
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
        this.stateMap = null;
        this.districtMap = null;
        this.districtTable = null;
        this.stateTable = null;
        this.reportsTable = null;
        this.pageTabs = null;
        this.mapTabs = null;
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
            // Render navbar
            this.renderNavbar();

            // Initialize tab navigation
            this.initTabs();

            // Load and process data
            await this.loadData();

            // Calculate statistics and render components
            this.renderValueBoxes();
            this.renderSummaryText();
            await this.renderMaps();
            this.renderTables();
            this.renderReportsTable();

            // Update last updated date
            this.updateLastUpdated();

        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showError(error.message);
        }
    }

    /**
     * Render the navbar
     */
    renderNavbar() {
        const navbar = new Navbar('navbar', {
            title: 'NASA Science Spending Dashboard',
            logoUrl: '../shared/img/TPS_Logo_3Stack-White.png',
            logoLink: 'https://planetary.org'
        });
        navbar.render();
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

        // Card-level tabs for map switching
        this.mapTabs = new CardTabs('map-tabs', {
            tabClass: 'card-tab',
            contentClass: 'card-tab-content'
        });
        this.mapTabs.init();
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

        this.processData();
    }

    /**
     * Process the raw data into usable format
     */
    processData() {
        // Process district data
        this.districtData = this.districtRawData.map(row => {
            const fy2024 = parseFloat(row['fy_2024_obligations']) || 0;
            const fy2023 = parseFloat(row['fy_2023_obligations']) || 0;
            const fy2022 = parseFloat(row['fy_2022_obligations']) || 0;
            const average = (fy2024 + fy2023 + fy2022) / 3;
            const geoid = getGeoidFromDistrict(row['district']);

            return {
                state: row['state'],
                district: row['district'],
                fy2024,
                fy2023,
                fy2022,
                average,
                geoid
            };
        }).filter(row => row.geoid); // Filter out invalid districts

        // Process state data
        this.stateData = this.stateRawData.map(row => {
            const fy2024 = parseFloat(row['fy_2024_obligations']) || 0;
            const fy2023 = parseFloat(row['fy_2023_obligations']) || 0;
            const fy2022 = parseFloat(row['fy_2022_obligations']) || 0;
            const average = (fy2024 + fy2023 + fy2022) / 3;
            const fips = STATE_FIPS_MAP[row['state']];

            return {
                state: row['state'],
                fy2024,
                fy2023,
                fy2022,
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
        // Total FY2024 spending (most recent year)
        const totalFy2024 = sumBy(this.districtData, 'fy2024');

        // Districts with spending above threshold
        const districtsWithSpending = this.districtData.filter(d =>
            d.fy2024 >= this.minSpending || d.fy2023 >= this.minSpending || d.fy2022 >= this.minSpending
        );
        const districtCount = districtsWithSpending.length;
        const percentDistricts = Math.round((districtCount / 435) * 100);

        // States with spending
        const statesWithSpending = this.stateData.filter(s =>
            s.fy2024 >= this.minSpending || s.fy2023 >= this.minSpending || s.fy2022 >= this.minSpending
        );
        const stateCount = statesWithSpending.length;

        return {
            totalSpending: formatCurrency(totalFy2024, true),
            districtsReached: districtCount,
            percentDistricts,
            statesCount: stateCount,
            recentFYSpending: formatCurrency(totalFy2024, true),
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
     * Render the summary text paragraph
     */
    renderSummaryText() {
        const summaryEl = document.getElementById('summary-text');
        if (summaryEl) {
            summaryEl.innerHTML = `
                Explore NASA Science Mission Directorate spending across the U.S. by state and congressional district.
                Use the maps below to visualize the data, or download detailed economic impact reports for any district.
            `;
        }
    }

    /**
     * Render both state and district choropleth maps
     */
    async renderMaps() {
        // State map (visible by default) - uses pre-projected TopoJSON
        this.stateMap = new ChoroplethMap('state-map', {
            colorScale: 'science',
            level: 'state',
            mapType: 'choropleth',
            showLegend: true,
            preProjected: true  // TopoJSON is pre-projected to Albers USA
        });
        await this.stateMap.init(DATA_URLS.statesTopoJSON);
        this.stateMap.setData(this.stateDataMap, this.stateHoverInfo);

        // District map (hidden initially)
        this.districtMap = new ChoroplethMap('district-map', {
            colorScale: 'science',
            level: 'district',
            mapType: 'choropleth',
            showLegend: true
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
        // Sort by FY2024 spending descending
        const sortedData = [...this.districtData].sort((a, b) => b.fy2024 - a.fy2024);

        this.districtTable = new DataTable('district-table', {
            pageSize: 20,
            pagination: true
        });

        this.districtTable.render(
            [
                { name: 'District', id: 'district' },
                { name: 'FY 2024 ($)', id: 'fy2024', currency: true },
                { name: 'FY 2023 ($)', id: 'fy2023', currency: true },
                { name: 'FY 2022 ($)', id: 'fy2022', currency: true }
            ],
            sortedData.map(row => [
                row.district,
                formatCurrency(row.fy2024, false),
                formatCurrency(row.fy2023, false),
                formatCurrency(row.fy2022, false)
            ])
        );
    }

    /**
     * Render the state spending table
     */
    renderStateTable() {
        // Sort by FY2024 spending descending
        const sortedData = [...this.stateData].sort((a, b) => b.fy2024 - a.fy2024);

        this.stateTable = new DataTable('state-table', {
            pageSize: 20,
            pagination: true
        });

        this.stateTable.render(
            [
                { name: 'State', id: 'state' },
                { name: 'FY 2024 ($)', id: 'fy2024', currency: true },
                { name: 'FY 2023 ($)', id: 'fy2023', currency: true },
                { name: 'FY 2022 ($)', id: 'fy2022', currency: true }
            ],
            sortedData.map(row => [
                row.state,
                formatCurrency(row.fy2024, false),
                formatCurrency(row.fy2023, false),
                formatCurrency(row.fy2022, false)
            ])
        );
    }

    /**
     * Render the economic impact reports table with PDF links
     */
    renderReportsTable() {
        // Filter to districts with spending
        const districtsWithSpending = this.districtData.filter(d =>
            d.fy2024 >= this.minSpending || d.fy2023 >= this.minSpending || d.fy2022 >= this.minSpending
        );

        // Group by state
        const byState = groupBy(districtsWithSpending, 'state');

        // Build rows: each state with its district links
        const rows = Object.entries(byState)
            .sort(([a], [b]) => a.localeCompare(b)) // Sort by state
            .map(([state, districts]) => {
                const stateUrl = `https://planetary.s3.amazonaws.com/assets/impact-reports/${state}/${state}-NASA-Science.pdf`;
                const stateLink = `<a href="${stateUrl}" target="_blank">${state}</a>`;

                // Sort districts and create links
                const districtLinks = districts
                    .sort((a, b) => a.district.localeCompare(b.district))
                    .map(d => {
                        const distNum = d.district.split('-')[1].padStart(2, '0');
                        const url = distNum === '00'
                            ? stateUrl
                            : `https://planetary.s3.amazonaws.com/assets/impact-reports/${state}/${distNum}/${state}-${distNum}-NASA-Science.pdf`;
                        return `<a href="${url}" target="_blank">${distNum}</a>`;
                    })
                    .join(', ');

                return [stateLink, districtLinks];
            });

        this.reportsTable = new DataTable('reports-table', {
            pageSize: 15,
            pagination: true,
            search: false
        });

        this.reportsTable.render(
            [
                { name: 'State', id: 'state', width: '80px',
                    formatter: (cell) => gridjs.html(cell)
                },
                { name: 'Districts', id: 'districts',
                    formatter: (cell) => gridjs.html(cell)
                }
            ],
            rows
        );
    }

    /**
     * Update last updated date in the UI
     */
    updateLastUpdated() {
        const lastUpdatedEl = document.getElementById('last-updated');
        if (lastUpdatedEl) {
            // Use current date since we don't have file modification info in browser
            const now = new Date();
            lastUpdatedEl.textContent = formatDate(now, 'long');
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
