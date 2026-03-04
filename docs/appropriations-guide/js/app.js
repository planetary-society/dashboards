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
        try {
            const csvText = await fetchText(DATA_URLS.csv);
            this.members = parseCSV(csvText);
            this.buildStateMap();
        } catch (err) {
            console.error('Failed to load member data:', err);
            document.getElementById('guide-content').innerHTML =
                '<div class="warning-banner">Unable to load member data. Please try again later.</div>';
            throw err; // Prevent initSelector from running
        }
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

        // URL type detection: form URL takes priority over email in comment
        const isMailto = url.toLowerCase().startsWith('mailto:');
        const hasUrl = url && url.toLowerCase() !== 'link' && url.trim() !== '';
        const isEmailOnly = !hasUrl && comment.toLowerCase().includes('email');
        const isEmail = isMailto || isEmailOnly;

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
                Visit <a href="${chamber === 'Senate' ? 'https://www.senate.gov/senators/senators-contact.htm' : 'https://www.house.gov/representatives/find-your-representative'}" target="_blank">${name}'s official website</a> to contact the office.
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
        const container = document.getElementById('spending-context');

        // Build FY spending line
        const fyParts = Object.entries(ctx.spending_by_year || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([yr, amt]) => `<span class="fy-value">FY${escapeHtml(yr)}: ${formatCurrency(amt)}</span>`)
            .join('<span class="separator">&middot;</span>');

        // Compute totals from award arrays
        const contracts = ctx.top_contracts || [];
        const grants = ctx.top_grants || [];
        const contractTotal = contracts.reduce((sum, a) => sum + (a.award_amount || 0), 0);
        const grantTotal = grants.reduce((sum, a) => sum + (a.award_amount || 0), 0);
        const contractCount = ctx['Total Contract Awards'] || ctx.total_contract_count || contracts.length;
        const grantCount = ctx['Total Grant Awards'] || ctx.total_grant_count || grants.length;

        const countsLine = `${escapeHtml(String(contractCount))} Contracts (${formatCurrency(contractTotal)})`
            + `<span class="separator">&middot;</span>`
            + `${escapeHtml(String(grantCount))} Grants (${formatCurrency(grantTotal)})`;

        // District label
        const stateCode = escapeHtml(ctx.state_code || '');
        const district = ctx.district ? escapeHtml(ctx.district) : '';
        const distLabel = district ? `${stateCode}-${district}` : stateCode;

        // Combine and sort awards
        const allAwards = [...contracts, ...grants].sort((a, b) => (b.award_amount || 0) - (a.award_amount || 0));

        const awardRows = allAwards.map(award => {
            const type = (award.category || '').toLowerCase();
            const badgeClass = type === 'contract' ? 'award-type-badge--contract' : 'award-type-badge--grant';
            const badgeLabel = type === 'contract' ? 'Contract' : 'Grant';
            const city = award.place_of_performance?.city_name || '';
            const st = award.place_of_performance?.state_code || '';
            const locationStr = city && st ? `${escapeHtml(city)}, ${escapeHtml(st)}` : escapeHtml(city || st);
            const summaryText = award.generated_award_summary || truncateText(award.description, 200);

            return `<div class="award-row" onclick="this.classList.toggle('expanded')">
                <div class="award-row-header">
                    <span class="award-type-badge ${badgeClass}">${badgeLabel}</span>
                    <span class="award-recipient">${escapeHtml(award.recipient_name || '')}</span>
                    <span class="award-location">${locationStr}</span>
                    <span class="award-amount">${formatCurrency(award.award_amount)}</span>
                </div>
                <div class="award-summary">${escapeHtml(summaryText)}</div>
                <div class="award-details">
                    <p><strong>Award ID:</strong> ${escapeHtml(award.award_id || '')}</p>
                    <p><strong>Period:</strong> ${escapeHtml(award.start_date || '')} &rarr; ${escapeHtml(award.end_date || '')}</p>
                    <p><strong>Description:</strong> ${escapeHtml(award.description || '')}</p>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = `
            <h3><i class="bi bi-rocket-takeoff"></i> NASA Science in ${distLabel}</h3>
            <div class="spending-summary">${fyParts}</div>
            <div class="award-counts">${countsLine}</div>
            <div class="award-list">${awardRows}</div>
        `;
        container.style.display = 'block';
    }

    renderFormWalkthrough(guideData) {
        const container = document.getElementById('guide-content');
        const fa = guideData.form_analysis;
        if (!fa) {
            container.innerHTML = '';
            return;
        }

        let html = '<div class="form-walkthrough">';

        // Optional form header and instructions
        if (fa.form_header_text || fa.form_instructions_text) {
            html += '<div class="form-intro">';
            if (fa.form_header_text) {
                html += `<h3>${escapeHtml(fa.form_header_text)}</h3>`;
            }
            if (fa.form_instructions_text) {
                html += `<p class="form-instructions">${escapeHtml(fa.form_instructions_text)}</p>`;
            }
            html += '</div>';
        }

        // Sections
        const sections = fa.sections || [];
        sections.forEach((section, sIdx) => {
            html += '<div class="walkthrough-section">';
            if (section.header) {
                html += `<h3>${escapeHtml(section.header)}</h3>`;
            }
            if (section.description) {
                html += `<p class="section-description">${escapeHtml(section.description)}</p>`;
            }

            const fields = section.fields || [];
            fields.forEach((field, fIdx) => {
                html += this.renderField(field, sIdx, fIdx);
            });

            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;
    }

    renderField(field, sectionNum, fieldNum) {
        const isConstituent = field.is_constituent_info === true;
        const hasDraft = field.draft_value != null && field.draft_value !== '';
        const confidence = field.confidence || null;
        const isLowConfidence = confidence === 'low' && hasDraft && !isConstituent;

        // Build class list
        let classes = 'guide-field';
        if (isConstituent) classes += ' constituent-field';
        if (isLowConfidence) classes += ' confidence-low';

        let html = `<div class="${classes}">`;

        // Field header
        html += '<div class="field-header">';
        html += `<span class="field-label">${escapeHtml(field.label || '')}</span>`;
        if (field.required) {
            html += '<span class="required-badge">Required</span>';
        }
        // Confidence icon (only when has draft and not constituent)
        if (hasDraft && !isConstituent && confidence) {
            if (confidence === 'high') {
                html += '<i class="bi bi-check-circle-fill confidence-icon confidence-high"></i>';
            } else if (confidence === 'medium') {
                html += '<i class="bi bi-circle-fill confidence-icon confidence-medium"></i>';
            } else if (confidence === 'low') {
                html += '<i class="bi bi-flag-fill confidence-icon confidence-low-icon"></i>';
            }
        }
        html += '</div>';

        // Field instruction
        html += '<div class="field-instruction">';
        html += this.getFieldInstruction(field);
        html += '</div>';

        // Rationale (only when has rationale)
        if (field.rationale && !isConstituent) {
            html += `<div class="rationale">
                <button class="rationale-toggle" onclick="this.parentElement.classList.toggle('open')">
                    <i class="bi bi-info-circle"></i>
                </button>
                <span class="rationale-text">${escapeHtml(field.rationale)}</span>
            </div>`;
        }

        html += '</div>';
        return html;
    }

    getFieldInstruction(field) {
        const isConstituent = field.is_constituent_info === true;
        const hasDraft = field.draft_value != null && field.draft_value !== '';
        const type = (field.field_type || 'text').toLowerCase();

        // Constituent info fields
        if (isConstituent) {
            let hint = '<span class="constituent-hint"><i class="bi bi-person"></i> Use your personal information</span>';
            if (field.help_text) {
                hint += `<span class="field-help">${escapeHtml(field.help_text)}</span>`;
            }
            return hint;
        }

        // Fields without draft values
        if (!hasDraft) {
            // Special types that don't need draft values
            if (type === 'email') return 'Enter your email address';
            if (type === 'phone') return 'Enter your phone number';
            if (type === 'address') {
                let instruction = 'Enter your address';
                if (field.help_text) {
                    instruction += `<span class="field-help">${escapeHtml(field.help_text)}</span>`;
                }
                return instruction;
            }
            return '<span class="no-draft">No suggested value available</span>';
        }

        // Fields with draft values by type
        switch (type) {
            case 'text':
                return `Type: &ldquo;<strong>${escapeHtml(field.draft_value)}</strong>&rdquo;`;

            case 'dropdown':
                return `From the dropdown, select: &ldquo;<strong>${escapeHtml(field.draft_value)}</strong>&rdquo;`;

            case 'textarea':
                return `Paste the following:
                    <div class="copyable-block">
                        <pre>${escapeHtml(field.draft_value)}</pre>
                        <button class="copy-btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(() => { this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 2000); })">Copy</button>
                    </div>`;

            case 'email':
                return 'Enter your email address';

            case 'phone':
                return 'Enter your phone number';

            case 'address': {
                let instruction = 'Enter your address';
                if (field.help_text) {
                    instruction += `<span class="field-help">${escapeHtml(field.help_text)}</span>`;
                }
                return instruction;
            }

            default:
                return `Type: &ldquo;<strong>${escapeHtml(field.draft_value)}</strong>&rdquo;`;
        }
    }

    async renderGenericFallback(member) {
        const container = document.getElementById('guide-content');

        let md;
        try {
            md = await fetchText(DATA_URLS.genericMd);
        } catch (err) {
            console.error('Failed to load generic directions:', err);
            container.innerHTML = `<div class="warning-banner">
                <i class="bi bi-exclamation-triangle"></i>
                Unable to load generic appropriations directions. Please try again later.
            </div>`;
            return;
        }

        // Split by H1 headers (lines starting with "# ")
        const sections = [];
        let currentTitle = '';
        let currentBody = '';

        const lines = md.split('\n');
        for (const line of lines) {
            const h1Match = line.match(/^# (.+)$/);
            if (h1Match) {
                // Save previous section if any
                if (currentTitle || currentBody.trim()) {
                    sections.push({ title: currentTitle, body: currentBody.trim() });
                }
                currentTitle = h1Match[1].trim();
                currentBody = '';
            } else {
                currentBody += line + '\n';
            }
        }
        // Push last section
        if (currentTitle || currentBody.trim()) {
            sections.push({ title: currentTitle, body: currentBody.trim() });
        }

        const memberName = escapeHtml(member['Member'] || '');

        let html = '<div class="generic-guide">';
        html += `<div class="generic-intro">
            <p>A detailed form guide for this office is not yet available. Use the general directions below to fill out your appropriations request form for ${memberName}.</p>
        </div>`;

        for (const section of sections) {
            if (!section.title && !section.body) continue;
            const parsedBody = this.parseMarkdown(section.body);
            html += `<details open class="generic-section">
                <summary class="collapsible-header">
                    <i class="bi bi-chevron-down"></i>
                    ${escapeHtml(section.title)}
                </summary>
                <div class="generic-section-body">${parsedBody}</div>
            </details>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }

    parseMarkdown(md) {
        if (!md) return '';

        // Process line by line for block-level elements
        const lines = md.split('\n');
        let html = '';
        let inList = false;
        let paragraphBuffer = '';

        const flushParagraph = () => {
            if (paragraphBuffer.trim()) {
                html += `<p>${this.parseInlineMarkdown(paragraphBuffer.trim())}</p>`;
                paragraphBuffer = '';
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Headings (process ### before ## before #)
            const h3Match = line.match(/^### (.+)$/);
            if (h3Match) {
                flushParagraph();
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h4>${this.parseInlineMarkdown(h3Match[1].trim())}</h4>`;
                continue;
            }

            const h2Match = line.match(/^## (.+)$/);
            if (h2Match) {
                flushParagraph();
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h3>${this.parseInlineMarkdown(h2Match[1].trim())}</h3>`;
                continue;
            }

            // Callout blocks: \<text\>
            const calloutMatch = line.match(/^\\<(.+)\\>$/);
            if (calloutMatch) {
                flushParagraph();
                if (inList) { html += '</ul>'; inList = false; }
                html += `<div class="fallback-callout"><i class="bi bi-pencil"></i> ${escapeHtml(calloutMatch[1])}</div>`;
                continue;
            }

            // List items: "* item"
            const listMatch = line.match(/^\* (.+)$/);
            if (listMatch) {
                flushParagraph();
                if (!inList) { html += '<ul>'; inList = true; }
                html += `<li>${this.parseInlineMarkdown(listMatch[1])}</li>`;
                continue;
            }

            // Empty line = paragraph break
            if (line.trim() === '') {
                if (inList) { html += '</ul>'; inList = false; }
                flushParagraph();
                continue;
            }

            // Regular text: accumulate into paragraph
            if (paragraphBuffer) {
                paragraphBuffer += ' ' + line;
            } else {
                paragraphBuffer = line;
            }
        }

        // Flush remaining
        if (inList) html += '</ul>';
        flushParagraph();

        return html;
    }

    parseInlineMarkdown(text) {
        if (!text) return '';

        // Bold: **text** -> <strong>
        text = text.replace(/\*\*(.+?)\*\*/g, (_, content) => `<strong>${escapeHtml(content)}</strong>`);

        // Italic (template placeholders): *text* -> <span class="fill-in">
        text = text.replace(/\*(.+?)\*/g, (_, content) => `<span class="fill-in">${escapeHtml(content)}</span>`);

        // Links: [text](url) -> <a>
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
            return `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(linkText)}</a>`;
        });

        // Escape remaining plain text segments that aren't already wrapped in HTML tags
        // We need to be careful not to double-escape text already inside tags
        // Since bold/italic/links have already been escaped inside, just return as-is
        // for any remaining text that doesn't match patterns (already safe from markdown source)
        return text;
    }
}

// Initialize the guide
document.addEventListener('DOMContentLoaded', () => {
    const guide = new AppropriationsGuide();
    guide.init().catch(err => {
        console.error('Failed to initialize Appropriations Guide:', err);
    });
});
