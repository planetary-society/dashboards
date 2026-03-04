/**
 * FY 2027 Appropriations Request Guide
 * Interactive tool for finding representatives and appropriations request forms
 */

import { Navbar } from '../../shared/js/components/navbar.js';
import { parseCSV, fetchText, formatCurrency, truncateText, escapeHtml } from '../../shared/js/utils.js';

const DATA_URLS = {
    csv: '../data/appropriations_requests/fy2027_appropriations_request_forms.csv',
    guidesBase: '../data/appropriations_requests/guides/',
    genericMd: '../data/appropriations_requests/fy2027_generic_directions.md'
};

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

class AppropriationsGuide {
    constructor() {
        this.members = [];
        this.stateMap = {};
        this.stateSelect = null;
        this.districtSelect = null;
    }

    async init() {
        new Navbar('navbar', { title: 'FY 2027 Appropriations Request Guide' }).render();
        await this.loadCSV();
        this.initSelector();
    }

    async loadCSV() {
        const csvText = await fetchText(DATA_URLS.csv);
        this.members = parseCSV(csvText);
        this.buildStateMap();
    }

    buildStateMap() {
        this.stateMap = {};
        for (const member of this.members) {
            const sd = member['State / District'] || '';
            // "TX-20" -> state "TX", "MD" (no dash) -> state "MD"
            const state = sd.includes('-') ? sd.split('-')[0] : sd;
            if (!state) continue;
            if (!this.stateMap[state]) {
                this.stateMap[state] = [];
            }
            this.stateMap[state].push(member);
        }
    }

    initSelector() {
        // Build state options sorted alphabetically by name
        const stateKeys = Object.keys(this.stateMap).sort((a, b) => {
            const nameA = STATE_NAMES[a] || a;
            const nameB = STATE_NAMES[b] || b;
            return nameA.localeCompare(nameB);
        });

        const stateOptions = stateKeys.map(abbr => ({
            value: abbr,
            text: STATE_NAMES[abbr] || abbr
        }));

        // Init Tom Select for state
        this.stateSelect = new TomSelect('#state-select', {
            options: stateOptions,
            placeholder: 'Select a state...',
            allowEmptyOption: true,
            onChange: (value) => this.onStateChange(value)
        });

        // Init Tom Select for district (empty, disabled initially)
        this.districtSelect = new TomSelect('#district-select', {
            options: [],
            placeholder: 'Select state first...',
            allowEmptyOption: true,
            onChange: (value) => {
                if (value) this.onDistrictChange(value);
            }
        });
        this.districtSelect.disable();
    }

    onStateChange(stateAbbr) {
        // Clear district select
        this.districtSelect.clear();
        this.districtSelect.clearOptions();

        // Hide member header and guide content
        document.getElementById('member-header').style.display = 'none';
        document.getElementById('spending-context').style.display = 'none';
        document.getElementById('guide-content').innerHTML = '';

        if (!stateAbbr || !this.stateMap[stateAbbr]) {
            this.districtSelect.disable();
            return;
        }

        const members = this.stateMap[stateAbbr];

        // Build options: Senate first, then House by district number
        const options = members.map(member => {
            const sd = member['State / District'] || '';
            const name = member['Member'] || '';
            const party = member['Party'] ? member['Party'][0] : '';
            const chamber = member['Chamber'] || '';

            let label;
            if (chamber === 'Senate') {
                label = `Senate \u2014 ${name} (${party})`;
            } else {
                const distNum = sd.includes('-') ? sd.split('-')[1] : '';
                label = `District ${distNum} \u2014 ${name} (${party})`;
            }

            return {
                value: sd,
                text: label,
                chamber: chamber,
                distNum: sd.includes('-') ? parseInt(sd.split('-')[1], 10) || 0 : 0
            };
        });

        // Sort: Senate first, then by district number
        options.sort((a, b) => {
            if (a.chamber === 'Senate' && b.chamber !== 'Senate') return -1;
            if (a.chamber !== 'Senate' && b.chamber === 'Senate') return 1;
            return a.distNum - b.distNum;
        });

        // Add options to Tom Select
        for (const opt of options) {
            this.districtSelect.addOption({ value: opt.value, text: opt.text });
        }

        this.districtSelect.enable();
    }

    async onDistrictChange(stateDistrict) {
        // Find member row
        const member = this.members.find(m => m['State / District'] === stateDistrict);
        if (!member) return;

        this.renderMemberHeader(member);
        await this.loadGuide(member);
    }

    renderMemberHeader(member) {
        const container = document.getElementById('member-header');
        const url = member['URL'] || '';
        const name = escapeHtml(member['Member']);
        const party = member['Party'] ? member['Party'][0] : '';
        const chamber = member['Chamber'];
        const sd = escapeHtml(member['State / District']);
        const prefix = chamber === 'Senate' ? 'Sen.' : 'Rep.';
        const deadline = member['Deadline'] || '';
        const comment = member['Comment'] || '';

        // URL type detection
        const isEmail = url.toLowerCase().startsWith('mailto:') || comment.toLowerCase().includes('email');
        const hasUrl = url && url.toLowerCase() !== 'link' && url.trim() !== '';

        // Parse deadline date (format "3/6/2026")
        const deadlinePassed = deadline && !isNaN(new Date(deadline).getTime()) && new Date(deadline) < new Date();

        let formHtml = '';
        if (isEmail) {
            // Extract email from URL or Comment
            let email = '';
            if (url.startsWith('mailto:')) {
                email = url.replace('mailto:', '');
            } else {
                const emailMatch = comment.match(/[\w.-]+@[\w.-]+/);
                email = emailMatch ? emailMatch[0] : comment;
            }
            formHtml = `<a href="mailto:${escapeHtml(email)}" class="form-button form-button--email">
                <i class="bi bi-envelope"></i> Email your request to: ${escapeHtml(email)}
            </a>`;
        } else if (hasUrl) {
            formHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="form-button">
                <i class="bi bi-box-arrow-up-right"></i> Open Appropriations Request Form
            </a>`;
        } else {
            formHtml = `<div class="warning-banner">
                <i class="bi bi-exclamation-triangle"></i>
                No FY 2027 appropriations request form currently tracked.
                Visit <a href="https://www.house.gov/representatives/find-your-representative" target="_blank">${name}'s official website</a> to contact the office.
            </div>`;
        }

        let deadlineHtml = '';
        if (deadline) {
            if (deadlinePassed) {
                deadlineHtml = `<div class="warning-banner warning-banner--subtle">
                    <i class="bi bi-clock"></i> The deadline for this office (${escapeHtml(deadline)}) has passed.
                </div>`;
            } else {
                deadlineHtml = `<p class="deadline"><i class="bi bi-calendar-event"></i> Deadline: ${escapeHtml(deadline)}</p>`;
            }
        }

        container.innerHTML = `
            <h2>${prefix} ${name} (${party}) \u2014 ${sd}</h2>
            ${deadlineHtml}
            ${formHtml}
        `;
        container.style.display = 'block';
    }

    async loadGuide(member) {
        const guideContent = document.getElementById('guide-content');
        const spendingContext = document.getElementById('spending-context');
        guideContent.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
        spendingContext.innerHTML = '';
        spendingContext.style.display = 'none';

        // Build guide key: "TX-20_castro" from "State / District" + lowercase last name
        const sd = member['State / District'];
        const lastName = member['Last Name'].toLowerCase().replace(/[^a-z]/g, '');
        const guideKey = `${sd}_${lastName}`;

        try {
            const response = await fetch(`${DATA_URLS.guidesBase}${guideKey}.json`);
            if (!response.ok) throw new Error('Not found');
            const guideData = await response.json();
            this.renderSpendingContext(guideData.nasa_context);
            this.renderFormWalkthrough(guideData);
        } catch (err) {
            console.log(`No guide for ${guideKey}, using generic directions`);
            await this.renderGenericFallback(member);
        }
    }

    renderSpendingContext(ctx) {
        if (!ctx) return;
        document.getElementById('spending-context').innerHTML = '<p>Spending context coming soon...</p>';
        document.getElementById('spending-context').style.display = 'block';
    }

    renderFormWalkthrough(guideData) {
        document.getElementById('guide-content').innerHTML = '<p>Form walkthrough coming soon...</p>';
    }

    async renderGenericFallback(member) {
        document.getElementById('guide-content').innerHTML = '<p>Generic directions coming soon...</p>';
    }
}

// Initialize the guide
document.addEventListener('DOMContentLoaded', () => {
    const guide = new AppropriationsGuide();
    guide.init().catch(err => {
        console.error('Failed to initialize Appropriations Guide:', err);
    });
});
