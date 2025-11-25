/**
 * Data Table Component
 * Grid.js wrapper for interactive data tables
 */

import { parseCurrency } from '../utils.js';

export class DataTable {
    /**
     * Create a data table
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {boolean} options.pagination - Enable pagination
     * @param {number} options.pageSize - Number of rows per page
     * @param {boolean} options.search - Enable search
     * @param {boolean} options.sort - Enable sorting
     * @param {string} options.className - Additional CSS classes
     * @param {number} options.height - Fixed height with scroll
     */
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.options = {
            pagination: options.pagination !== false,
            pageSize: options.pageSize || 25,
            search: options.search || false,
            sort: options.sort !== false,
            className: options.className || '',
            height: options.height || null,
            fixedHeader: options.fixedHeader || false
        };
        this.grid = null;
    }

    /**
     * Render the table with data
     * @param {Array} columns - Column configuration
     * @param {Array} data - Row data
     */
    render(columns, data) {
        if (!this.container) {
            console.error('Table container not found:', this.containerId);
            return;
        }

        // Destroy existing grid if present
        this.destroy();

        // Configure grid options
        const gridConfig = {
            columns: this.processColumns(columns),
            data: data,
            sort: this.options.sort,
            className: {
                table: `gridjs-table ${this.options.className}`,
                th: 'gridjs-th',
                td: 'gridjs-td'
            }
        };

        // Add pagination if enabled
        if (this.options.pagination) {
            gridConfig.pagination = {
                limit: this.options.pageSize,
                summary: true
            };
        }

        // Add search if enabled
        if (this.options.search) {
            gridConfig.search = true;
        }

        // Add fixed header height if specified
        if (this.options.height) {
            gridConfig.height = this.options.height + 'px';
            gridConfig.fixedHeader = this.options.fixedHeader;
        }

        // Create and render the grid
        this.grid = new gridjs.Grid(gridConfig);
        this.grid.render(this.container);
    }

    /**
     * Process column configuration for Grid.js
     * @param {Array} columns - Column definitions
     * @returns {Array} Processed columns for Grid.js
     */
    processColumns(columns) {
        return columns.map(col => {
            if (typeof col === 'string') {
                const colId = col.toLowerCase().replace(/\s+/g, '_');
                return {
                    name: col,
                    id: colId,
                    attributes: (cell) => ({ 'data-column-id': colId })
                };
            }

            const colId = col.id || col.name?.toLowerCase().replace(/\s+/g, '_');
            const processedCol = {
                name: col.name || col.label,
                id: colId
            };

            // Add width if specified
            if (col.width) {
                processedCol.width = col.width;
            }

            // Add custom formatter
            if (col.formatter) {
                processedCol.formatter = col.formatter;
            }

            // Add HTML formatter for links
            if (col.html) {
                processedCol.formatter = (cell) => gridjs.html(cell);
            }

            // Add custom sort for currency columns
            if (col.currency) {
                processedCol.sort = {
                    compare: (a, b) => {
                        const numA = this.parseCurrencyValue(a);
                        const numB = this.parseCurrencyValue(b);
                        return numA - numB;
                    }
                };
            }

            // Add data-column-id attribute for mobile card labels
            // Merge with hideOnMobile class if needed
            processedCol.attributes = (cell) => {
                const attrs = { 'data-column-id': colId };
                if (col.hideOnMobile) {
                    attrs['class'] = 'hide-mobile';
                }
                return attrs;
            };

            return processedCol;
        });
    }

    /**
     * Parse a currency string to number for sorting
     * @param {string} value - Currency string
     * @returns {number} Numeric value
     */
    parseCurrencyValue(value) {
        return parseCurrency(value) || 0;
    }

    /**
     * Update the table data
     * @param {Array} data - New row data
     */
    updateData(data) {
        if (this.grid) {
            this.grid.updateConfig({ data }).forceRender();
        }
    }

    /**
     * Update configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config) {
        if (this.grid) {
            this.grid.updateConfig(config).forceRender();
        }
    }

    /**
     * Destroy the table
     */
    destroy() {
        if (this.grid) {
            this.grid.destroy();
            this.grid = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

/**
 * Create a districts table
 * @param {string} containerId - Container element ID
 * @param {Array} data - District data [{district, contractCount, totalObligations}]
 * @param {Object} options - Additional options
 * @returns {DataTable} Table instance
 */
export function createDistrictsTable(containerId, data, options = {}) {
    const table = new DataTable(containerId, {
        pageSize: options.pageSize || 20,
        ...options
    });

    const columns = [
        { name: 'District', id: 'district' },
        { name: '# of Contracts', id: 'contracts' },
        { name: 'Total Obligations', id: 'obligations', currency: true }
    ];

    const rows = data.map(row => [
        row.district,
        row.contractCount || row.contracts,
        row.totalObligations || row.obligations
    ]);

    table.render(columns, rows);
    return table;
}

/**
 * Create a recipients table
 * @param {string} containerId - Container element ID
 * @param {Array} data - Recipient data [{recipient, contractCount, totalObligations}]
 * @param {Object} options - Additional options
 * @returns {DataTable} Table instance
 */
export function createRecipientsTable(containerId, data, options = {}) {
    const table = new DataTable(containerId, {
        pageSize: options.pageSize || 20,
        ...options
    });

    const columns = [
        { name: 'Recipient', id: 'recipient', width: '50%' },
        { name: '# of Contracts', id: 'contracts' },
        { name: 'Total Obligations', id: 'obligations', currency: true }
    ];

    const rows = data.map(row => [
        row.recipient,
        row.contractCount || row.contracts,
        row.totalObligations || row.obligations
    ]);

    table.render(columns, rows);
    return table;
}

/**
 * Create a full contracts table with links
 * @param {string} containerId - Container element ID
 * @param {Array} data - Contract data
 * @param {Object} options - Additional options
 * @returns {DataTable} Table instance
 */
export function createContractsTable(containerId, data, options = {}) {
    const table = new DataTable(containerId, {
        pageSize: options.pageSize || 25,
        className: 'table-nowrap',
        ...options
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
        { name: 'Recipient', id: 'recipient', width: '200px' },
        { name: 'Start Date', id: 'start_date', hideOnMobile: true },
        { name: 'End Date', id: 'end_date', hideOnMobile: true },
        { name: 'Total Obligations', id: 'obligations', currency: true },
        { name: 'Total Outlays', id: 'outlays', currency: true, hideOnMobile: true },
        { name: 'Description', id: 'description', width: '250px', hideOnMobile: true },
        { name: 'URL', id: 'url', hidden: true }
    ];

    const rows = data.map(row => [
        row['Award ID'] || row.awardId,
        row['Source'] || row.source,
        row['District'] || row.district,
        row['Recipient'] || row.recipient,
        row['Start Date'] || row.startDate,
        row['Nominal End Date'] || row.endDate,
        row['Total Obligations'] || row.totalObligations,
        row['Total Outlays'] || row.totalOutlays,
        row['Description'] || row.description,
        row['URL'] || row.url
    ]);

    table.render(columns, rows);
    return table;
}
