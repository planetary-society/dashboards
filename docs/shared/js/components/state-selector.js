/**
 * State Selector Component
 * Provides autocomplete state selection with district drill-down for economic impact reports
 */

import { STATE_FIPS_MAP } from '../constants.js';
import { groupBy, formatCurrency } from '../utils.js';

// Full state names mapping
const STATE_NAMES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
    'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine',
    'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska',
    'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico',
    'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
    'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas',
    'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
    'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'AS': 'American Samoa', 'GU': 'Guam', 'MP': 'Northern Mariana Islands',
    'PR': 'Puerto Rico', 'VI': 'U.S. Virgin Islands'
};

// Threshold for showing district search
const LARGE_STATE_THRESHOLD = 15;

export class StateSelector {
    /**
     * Create a state selector component
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Configuration options
     * @param {Function} options.onStateSelect - Callback when state is selected (stateAbbr, districts)
     * @param {Function} options.onDistrictSelect - Callback when district is selected (districtCode, districtData)
     * @param {Function} options.onReset - Callback when selection is reset
     * @param {string} options.reportBaseUrl - Base URL for report PDFs
     * @param {number} options.minSpending - Minimum spending threshold for PDF availability
     */
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            onStateSelect: options.onStateSelect || (() => {}),
            onDistrictSelect: options.onDistrictSelect || (() => {}),
            onReset: options.onReset || (() => {}),
            reportBaseUrl: options.reportBaseUrl ||
                'https://planetary.s3.amazonaws.com/assets/impact-reports',
            minSpending: options.minSpending || 50000,
            mapContainer: options.mapContainer || null  // Reference to map container element for mobile UX
        };

        this.districtData = [];
        this.stateData = [];
        this.districtsByState = {};

        this.stateSelect = null;       // Tom Select instance
        this.districtSearch = null;    // Tom Select instance (for large states)

        this.selectedState = null;
        this.selectedDistrict = null;
    }

    /**
     * Initialize with data
     * @param {Array} districtData - Array of district data objects
     * @param {Array} stateData - Array of state data objects
     */
    init(districtData, stateData) {
        this.districtData = districtData;
        this.stateData = stateData;

        // Group districts by state
        this.districtsByState = groupBy(districtData, 'state');

        this.render();
        this.initTomSelect();
    }

    /**
     * Render the component HTML
     */
    render() {
        this.container.innerHTML = `
            <div class="state-selector">
                <div class="state-selector-row">
                    <label for="state-select" class="selector-label">
                        Select Your State
                    </label>
                    <div class="state-select-wrapper">
                        <select id="state-select" placeholder="Type or select..." autocomplete="off">
                            <option value="">Choose a state...</option>
                        </select>
                        <button type="button" class="reset-btn-inline" id="reset-selection"
                                style="display: none;">
                            View All
                        </button>
                    </div>
                </div>

                <div id="state-details" class="state-details" style="display: none;">
                    <!-- Populated when state is selected -->
                </div>
            </div>
        `;

        // Populate state options
        this.populateStateOptions();

        // Bind reset button
        this.container.querySelector('#reset-selection')
            .addEventListener('click', () => this.resetSelection());
    }

    /**
     * Populate state dropdown options
     */
    populateStateOptions() {
        const select = this.container.querySelector('#state-select');
        const states = Object.keys(this.districtsByState).sort();

        states.forEach(state => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = this.getStateName(state);
            select.appendChild(option);
        });
    }

    /**
     * Initialize Tom Select on the state dropdown
     */
    initTomSelect() {
        const selectEl = this.container.querySelector('#state-select');
        const self = this;

        this.stateSelect = new TomSelect(selectEl, {
            create: false,
            sortField: { field: 'text', direction: 'asc' },
            maxOptions: 60,
            placeholder: 'Type or select a state...',
            // Prevent browser autofill with search input type and attributes
            controlInput: '<input type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true">',
            render: {
                option: function(data, escape) {
                    const districtCount = self.districtsByState[data.value]?.length || 0;
                    return `<div class="state-option">
                        <span class="state-name">${escape(data.text)}</span>
                        <span class="district-count">${districtCount} district${districtCount !== 1 ? 's' : ''}</span>
                    </div>`;
                },
                item: function(data, escape) {
                    return `<div class="state-item">${escape(data.text)}</div>`;
                }
            },
            onChange: (value) => {
                if (value) {
                    this.selectState(value);
                }
            }
        });

        // Additional autofill prevention after initialization
        const inputEl = this.stateSelect.control_input;
        if (inputEl) {
            inputEl.setAttribute('autocomplete', 'off');
            inputEl.setAttribute('name', 'state-search-' + Date.now());
        }
    }

    /**
     * Handle state selection
     * @param {string} stateAbbr - Two-letter state abbreviation
     */
    selectState(stateAbbr) {
        this.selectedState = stateAbbr;
        this.selectedDistrict = null;

        const districts = this.districtsByState[stateAbbr] || [];
        const isLargeState = districts.length > LARGE_STATE_THRESHOLD;

        // Show reset button
        this.container.querySelector('#reset-selection').style.display = 'inline-flex';

        // Render state details
        this.renderStateDetails(stateAbbr, districts, isLargeState);

        // Blur the Tom Select input to dismiss mobile keyboard
        if (this.stateSelect) {
            this.stateSelect.blur();
        }

        // On mobile, scroll district list into view after keyboard dismisses
        if (this.isMobileDevice()) {
            setTimeout(() => {
                const detailsEl = this.container.querySelector('#state-details');
                if (detailsEl) {
                    detailsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 150);
        }

        // Trigger callback
        this.options.onStateSelect(stateAbbr, districts);
    }

    /**
     * Render state details panel
     * @param {string} stateAbbr - State abbreviation
     * @param {Array} districts - Array of district data for this state
     * @param {boolean} showSearch - Whether to show district search
     */
    renderStateDetails(stateAbbr, districts, showSearch) {
        const detailsEl = this.container.querySelector('#state-details');

        // Get state-level report URL
        const stateReportUrl = `${this.options.reportBaseUrl}/${stateAbbr}/${stateAbbr}-NASA-Science.pdf`;

        // Detect at-large only state (single district ending in -00)
        const isAtLargeOnly = districts.length === 1 &&
            districts[0].district.split('-')[1] === '00';

        // Sort districts by number
        const sortedDistricts = [...districts].sort((a, b) => {
            const numA = parseInt(a.district.split('-')[1], 10) || 0;
            const numB = parseInt(b.district.split('-')[1], 10) || 0;
            return numA - numB;
        });

        // For at-large only states, just show statewide download (same as at-large district)
        if (isAtLargeOnly) {
            detailsEl.innerHTML = `
                <div class="district-list-header">
                    <div class="district-item district-item--state">
                        <div class="district-info">
                            <span class="district-number">Statewide</span>
                        </div>
                        <a href="${stateReportUrl}" target="_blank" class="district-download">
                            <i class="bi bi-download"></i>
                            Download
                        </a>
                    </div>
                </div>
            `;
        } else {
            detailsEl.innerHTML = `
                <div class="district-list-header">
                    <div class="district-item district-item--state">
                        <div class="district-info">
                            <span class="district-number">Statewide</span>
                        </div>
                        <a href="${stateReportUrl}" target="_blank" class="district-download">
                            <i class="bi bi-download"></i>
                            Download
                        </a>
                    </div>
                    <span class="district-count-label">
                        ${districts.length} Congressional District${districts.length !== 1 ? 's' : ''}
                    </span>
                </div>

                <div class="district-list">
                    ${sortedDistricts.map(d => this.renderDistrictItem(d)).join('')}
                </div>
            `;
        }

        detailsEl.style.display = 'block';

        // Bind district click handlers
        this.bindDistrictClickHandlers();
    }

    /**
     * Render district search dropdown HTML
     * @param {string} stateAbbr - State abbreviation
     * @returns {string} HTML string
     */
    renderDistrictSearch(stateAbbr) {
        return `
            <div class="district-search-container">
                <label for="district-search" class="search-label">
                    Find Your District
                </label>
                <select id="district-search" placeholder="Type district number...">
                    <option value="">Search by district number...</option>
                </select>
            </div>
        `;
    }

    /**
     * Initialize Tom Select for district search
     * @param {string} stateAbbr - State abbreviation
     * @param {Array} districts - Sorted array of district data
     */
    initDistrictSearch(stateAbbr, districts) {
        const searchEl = this.container.querySelector('#district-search');
        if (!searchEl) return;

        // Populate options
        districts.forEach(d => {
            const num = d.district.split('-')[1].padStart(2, '0');
            const displayCode = num === '00' ? `${stateAbbr} At-Large` : `${stateAbbr}-${num}`;
            const option = document.createElement('option');
            option.value = d.district;
            option.textContent = `${displayCode} - ${formatCurrency(d.average, true)} /year`;
            searchEl.appendChild(option);
        });

        this.districtSearch = new TomSelect(searchEl, {
            create: false,
            maxOptions: 60,
            placeholder: 'Type district number...',
            onChange: (value) => {
                if (value) {
                    this.selectDistrict(value);
                }
            }
        });
    }

    /**
     * Check if district has sufficient data for a downloadable report
     * @param {Object} district - District data object
     * @returns {boolean} True if district meets spending threshold
     */
    hasSufficientData(district) {
        return district.fy2024 >= this.options.minSpending ||
               district.fy2023 >= this.options.minSpending ||
               district.fy2022 >= this.options.minSpending;
    }

    /**
     * Render a single district item
     * @param {Object} district - District data object
     * @returns {string} HTML string
     */
    renderDistrictItem(district) {
        const num = district.district.split('-')[1].padStart(2, '0');
        const stateAbbr = district.state;

        const reportUrl = num === '00'
            ? `${this.options.reportBaseUrl}/${stateAbbr}/${stateAbbr}-NASA-Science.pdf`
            : `${this.options.reportBaseUrl}/${stateAbbr}/${num}/${stateAbbr}-${num}-NASA-Science.pdf`;

        // Format: "WA-02" or "At-Large" for 00 districts
        const displayCode = num === '00' ? `${stateAbbr} At-Large` : `${stateAbbr}-${num}`;

        // Check if district has sufficient data for report
        const hasSufficientData = this.hasSufficientData(district);

        return `
            <div class="district-item" data-district="${district.district}">
                <div class="district-info">
                    <span class="district-number">${displayCode}</span>
                    <span class="district-spending">${formatCurrency(district.average, true)}/yr</span>
                </div>
                ${hasSufficientData
                    ? `<a href="${reportUrl}" target="_blank" class="district-download"
                         title="Download report for ${displayCode}">
                        <i class="bi bi-download"></i>
                        Download
                      </a>`
                    : `<span class="district-insufficient">Insufficient data</span>`
                }
            </div>
        `;
    }

    /**
     * Bind click handlers to district items
     */
    bindDistrictClickHandlers() {
        this.container.querySelectorAll('.district-item').forEach(el => {
            el.addEventListener('click', (e) => {
                // Don't trigger if clicking download link
                if (e.target.closest('.district-download')) return;

                const districtCode = el.dataset.district;
                this.selectDistrict(districtCode);
            });
        });
    }

    /**
     * Handle district selection
     * @param {string} districtCode - District code (e.g., 'CA-37')
     */
    selectDistrict(districtCode) {
        this.selectedDistrict = districtCode;

        // Highlight in list
        this.container.querySelectorAll('.district-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.district === districtCode);
        });

        // Scroll selected item into view
        const selectedEl = this.container.querySelector(`.district-item[data-district="${districtCode}"]`);
        if (selectedEl) {
            selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Sync district search dropdown if it exists
        if (this.districtSearch && this.districtSearch.getValue() !== districtCode) {
            this.districtSearch.setValue(districtCode, true); // silent = true to avoid loop
        }

        // Get district data
        const district = this.districtData.find(d => d.district === districtCode);

        // Trigger callback
        this.options.onDistrictSelect(districtCode, district);
    }

    /**
     * Programmatically select a district (for bidirectional map sync)
     * @param {string} districtCode - District code (e.g., 'CA-37')
     */
    selectDistrictFromMap(districtCode) {
        // First ensure the state is selected
        const stateAbbr = districtCode.split('-')[0];

        if (this.selectedState !== stateAbbr) {
            // Need to select the state first
            if (this.stateSelect) {
                this.stateSelect.setValue(stateAbbr, true); // silent
            }
            this.selectState(stateAbbr);
        }

        // Then select the district (without firing callback to avoid loop)
        this.selectedDistrict = districtCode;

        // Use setTimeout to ensure DOM is rendered after state selection
        setTimeout(() => {
            // Highlight in list
            this.container.querySelectorAll('.district-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.district === districtCode);
            });

            // Scroll selected item into view
            const selectedEl = this.container.querySelector(`.district-item[data-district="${districtCode}"]`);
            if (selectedEl) {
                selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            // Sync district search dropdown if it exists
            if (this.districtSearch) {
                this.districtSearch.setValue(districtCode, true);
            }
        }, 50);
    }

    /**
     * Reset selection to initial state
     */
    resetSelection() {
        this.selectedState = null;
        this.selectedDistrict = null;

        // Reset Tom Select instances
        if (this.stateSelect) {
            this.stateSelect.clear(true);
        }
        if (this.districtSearch) {
            this.districtSearch.destroy();
            this.districtSearch = null;
        }

        // Hide details
        const detailsEl = this.container.querySelector('#state-details');
        if (detailsEl) {
            detailsEl.style.display = 'none';
        }

        // Hide reset button
        const resetBtn = this.container.querySelector('#reset-selection');
        if (resetBtn) {
            resetBtn.style.display = 'none';
        }

        // Trigger callback
        this.options.onReset();
    }

    /**
     * Get full state name from abbreviation
     * @param {string} abbr - State abbreviation
     * @returns {string} Full state name
     */
    getStateName(abbr) {
        return STATE_NAMES[abbr] || abbr;
    }

    /**
     * Check if current device is mobile/tablet
     * @returns {boolean}
     */
    isMobileDevice() {
        return window.matchMedia('(max-width: 1024px)').matches;
    }

    /**
     * Hide map on mobile during selection to maximize screen space
     */
    hideMapOnMobile() {
        if (this.isMobileDevice() && this.options.mapContainer) {
            this.options.mapContainer.classList.add('mobile-hidden');
        }
    }

    /**
     * Show map on mobile (restore default view)
     */
    showMapOnMobile() {
        if (this.options.mapContainer) {
            this.options.mapContainer.classList.remove('mobile-hidden');
        }
    }

    /**
     * Get currently selected state
     * @returns {string|null} State abbreviation or null
     */
    getSelectedState() {
        return this.selectedState;
    }

    /**
     * Get currently selected district
     * @returns {string|null} District code or null
     */
    getSelectedDistrict() {
        return this.selectedDistrict;
    }

    /**
     * Get districts for a specific state
     * @param {string} stateAbbr - State abbreviation
     * @returns {Array} Array of district data
     */
    getDistrictsForState(stateAbbr) {
        return this.districtsByState[stateAbbr] || [];
    }

    /**
     * Destroy the component and clean up
     */
    destroy() {
        if (this.stateSelect) {
            this.stateSelect.destroy();
            this.stateSelect = null;
        }
        if (this.districtSearch) {
            this.districtSearch.destroy();
            this.districtSearch = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
