/**
 * NASA Cancellations Dashboard Application
 * Main entry point and dashboard-specific logic
 */

import { DATA_URLS, FIPS_STATE_MAP } from '../../shared/js/constants.js';
import {
    parseCSV,
    formatCurrency,
    formatDate,
    getGeoidFromDistrict,
    fetchText,
    groupBy,
    sumBy,
    countUnique
} from '../../shared/js/utils.js';
import { Navbar } from '../../shared/js/components/navbar.js';
import { ValueBox, createCancellationsValueBoxes } from '../../shared/js/components/value-box.js';
import { TabNavigation, CardTabs } from '../../shared/js/components/tabs.js';
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

            // Render components
            this.renderValueBoxes();
            await this.renderMap();
            this.renderTables();

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
            title: 'NASA Cancelled Awards Tracking Dashboard',
            logoUrl: '../shared/img/TPS_Logo_3Stack-White.png',
            logoLink: 'https://planetary.org'
        });
        navbar.render();
    }

    /**
     * Initialize tab navigation
     */
    initTabs() {
        // Page-level tabs
        this.pageTabs = new TabNavigation('page-tabs', {
            tabClass: 'page-tab',
            contentClass: 'tab-content'
        });
        this.pageTabs.init();

        // Card-level tabs for tables
        this.tableTabs = new CardTabs('table-tabs', {
            tabClass: 'card-tab',
            contentClass: 'card-tab-content'
        });
        this.tableTabs.init();
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
     * Process the raw data
     */
    processData() {
        // Filter out total row and clean data
        this.cleanedData = this.rawData
            .filter(row => {
                // Skip total row
                const endDate = row['Nominal End Date'] || '';
                return endDate.toLowerCase() !== 'total';
            })
            .map(row => {
                // Parse and clean total obligations
                const obligations = this.parseCurrency(row['Total Obligations']);
                const outlays = this.parseCurrency(row['Total Outlays']);

                return {
                    ...row,
                    totalObligations: obligations,
                    totalOutlays: outlays,
                    geoid: getGeoidFromDistrict(row['District'])
                };
            })
            .filter(row => row.totalObligations !== null);

        // Calculate district counts and hover info
        this.calculateDistrictData();
    }

    /**
     * Truncate text to specified length, ending on word boundary
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum character length
     * @returns {string} Truncated text with ellipsis if needed
     */
    truncateText(text, maxLength = 200) {
        if (!text || text.length <= maxLength) return text;

        // Find the last space within the limit
        const truncated = text.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');

        // If no space found, just cut at maxLength
        const cutPoint = lastSpace > 0 ? lastSpace : maxLength;
        return text.substring(0, cutPoint) + '...';
    }

    /**
     * Parse currency string to number
     */
    parseCurrency(value) {
        if (!value) return null;
        const cleaned = String(value).replace(/[$,\s]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
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

        return {
            totalContracts: this.cleanedData.length,
            totalObligations: formatCurrency(totalObligations, true),
            uniqueRecipients: countUnique(this.cleanedData, 'Recipient'),
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
            pageSize: 15,
            pagination: true
        });

        this.districtsTable.render(
            [
                { name: 'District', id: 'district' },
                { name: 'Cancellations', id: 'contracts' },
                { name: 'Total Value', id: 'obligations', currency: true }
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
            pageSize: 15,
            pagination: true
        });

        this.recipientsTable.render(
            [
                { name: 'Recipient', id: 'recipient', width: '50%' },
                { name: 'Cancellations', id: 'contracts' },
                { name: 'Total Value', id: 'obligations', currency: true }
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
            className: 'table-nowrap'
        });

        const columns = [
            {
                name: 'Award ID',
                id: 'award_id',
                formatter: (cell, row) => {
                    const url = row.cells[9]?.data || '#';
                    return gridjs.html(`<a href="${url}" target="_blank">${cell}</a>`);
                }
            },
            { name: 'Source', id: 'source' },
            { name: 'District', id: 'district' },
            { name: 'Recipient', id: 'recipient' },
            { name: 'Start Date', id: 'start_date' },
            { name: 'End Date', id: 'end_date' },
            { name: 'Total Obligations', id: 'obligations', currency: true },
            { name: 'Total Outlays', id: 'outlays', currency: true },
            { name: 'Description', id: 'description', width: '250px' },
            { name: 'URL', id: 'url', hidden: true }
        ];

        const rows = this.cleanedData.map(row => [
            row['Award ID'],
            row['Source'],
            row['District'],
            row['Recipient'],
            row['Start Date'],
            row['Nominal End Date'],
            formatCurrency(row.totalObligations, false),
            formatCurrency(row.totalOutlays, false),
            this.truncateText(row['Description'], 200),
            row['URL']
        ]);

        this.contractsTable.render(columns, rows);
    }

    /**
     * Update last updated date in the UI
     */
    updateLastUpdated() {
        const lastUpdatedEl = document.getElementById('last-updated');
        if (lastUpdatedEl) {
            // Use current date as we're loading latest data
            const now = new Date();
            lastUpdatedEl.textContent = formatDate(now, 'long');
        }
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
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new CancellationsDashboard();
    dashboard.init();
});
