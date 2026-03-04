/**
 * FY 2027 Appropriations Request Guide
 * Interactive tool for finding representatives and appropriations request forms
 */

import { Navbar } from '../../shared/js/components/navbar.js';
import { HashRouter } from '../../shared/js/components/hash-router.js';
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
        this.router = null;
        this.currentMember = null;
        this.stickyBar = null;
        this.stickyObserver = null;
        this.sectionObserver = null;
    }

    async init() {
        new Navbar('navbar', { title: 'FY 2027 Appropriations Request Guide' }).render();
        this.initEventDelegation();
        document.getElementById('back-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showSelector();
        });
        await this.loadCSV();
        this.initSelector();
        this.initRouter();
    }

    showResults() {
        document.querySelector('.guide-hero').style.display = 'none';
        document.getElementById('selector-container').style.display = 'none';
        document.getElementById('back-nav').style.display = 'block';
    }

    showSelector() {
        document.querySelector('.guide-hero').style.display = '';
        document.getElementById('selector-container').style.display = '';
        document.getElementById('back-nav').style.display = 'none';
        document.getElementById('member-header').style.display = 'none';
        document.getElementById('section-nav').style.display = 'none';
        document.getElementById('guide-content').innerHTML = '';
        this.removeStickyBar();
        if (this.sectionObserver) {
            this.sectionObserver.disconnect();
            this.sectionObserver = null;
        }
        this.stateSelect.value = '';
        this.districtSelect.innerHTML = '<option value="">Select state first...</option>';
        this.districtSelect.disabled = true;
        this.router.navigate('', false);
    }

    initEventDelegation() {
        // Event delegation for dynamically generated elements
        const handleClick = (e) => {
            // Award list show/hide toggle
            const awardsToggleBtn = e.target.closest('.awards-toggle-btn');
            if (awardsToggleBtn) {
                const awardList = awardsToggleBtn.nextElementSibling;
                if (awardList) {
                    const isExpanded = awardList.classList.toggle('expanded');
                    awardsToggleBtn.textContent = isExpanded ? 'Hide awards' : 'See awards';
                }
            }

            // Section nav click to scroll
            const sectionStep = e.target.closest('.section-step');
            if (sectionStep) {
                const idx = sectionStep.dataset.section;
                const target = document.getElementById(`section-${idx}`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            // Award row expand/collapse
            const awardRow = e.target.closest('.award-row');
            if (awardRow && !e.target.closest('.award-details a')) {
                awardRow.classList.toggle('expanded');
            }

            // Info icon tooltip toggle (for mobile tap support)
            const infoBtn = e.target.closest('.info-icon-btn');
            if (infoBtn) {
                const infoContainer = infoBtn.closest('.confidence-info');
                if (infoContainer) {
                    const isActive = infoContainer.classList.contains('active');
                    document.querySelectorAll('.confidence-info.active').forEach(el => el.classList.remove('active'));
                    if (!isActive) infoContainer.classList.add('active');
                }
                return;
            }
            // Close any open tooltips when clicking outside
            if (!e.target.closest('.confidence-info')) {
                document.querySelectorAll('.confidence-info.active').forEach(el => el.classList.remove('active'));
            }

            // Instructions toggle
            const instrToggle = e.target.closest('.instructions-toggle');
            if (instrToggle) {
                const instrText = instrToggle.previousElementSibling;
                if (instrText) {
                    const isTruncated = instrText.classList.toggle('truncated');
                    instrToggle.textContent = isTruncated ? 'Read more' : 'Show less';
                }
            }

            // Copy button
            const copyBtn = e.target.closest('.copy-btn');
            if (copyBtn) {
                const pre = copyBtn.previousElementSibling;
                if (pre) {
                    navigator.clipboard.writeText(pre.textContent).then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                    }).catch(() => {
                        copyBtn.textContent = 'Copy failed';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                    });
                }
            }
        };

        document.querySelector('main.dashboard').addEventListener('click', handleClick);
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

    initRouter() {
        this.router = new HashRouter({
            onRouteChange: (route) => this.restoreFromHash(route)
        });
        this.router.init();
    }

    restoreFromHash(route) {
        if (!route) { this.showSelector(); return; }
        const state = route.includes('-') ? route.split('-')[0] : route;
        if (!this.stateMap[state]) return;

        this.stateSelect.value = state;
        this.onStateChange(state);

        const match = [...this.districtSelect.options].find(o => o.value === route);
        if (match) {
            this.districtSelect.value = route;
            this.onDistrictChange(route); // already calls showResults()
        }
    }

    initSelector() {
        // Build state options sorted alphabetically by name
        const stateKeys = Object.keys(this.stateMap).sort((a, b) => {
            const nameA = STATE_NAMES[a] || a;
            const nameB = STATE_NAMES[b] || b;
            return nameA.localeCompare(nameB);
        });

        this.stateSelect = document.getElementById('state-select');
        this.stateSelect.innerHTML = '<option value="">Select a state...</option>' +
            stateKeys.map(abbr =>
                `<option value="${abbr}">${STATE_NAMES[abbr] || abbr}</option>`
            ).join('');
        this.stateSelect.addEventListener('change', () => this.onStateChange(this.stateSelect.value));

        this.districtSelect = document.getElementById('district-select');
        this.districtSelect.addEventListener('change', () => {
            if (this.districtSelect.value) this.onDistrictChange(this.districtSelect.value);
        });
    }

    onStateChange(stateAbbr) {
        // Hide member header and guide content
        document.getElementById('member-header').style.display = 'none';
        document.getElementById('section-nav').style.display = 'none';
        document.getElementById('guide-content').innerHTML = '';

        if (!stateAbbr || !this.stateMap[stateAbbr]) {
            this.districtSelect.innerHTML = '<option value="">Select state first...</option>';
            this.districtSelect.disabled = true;
            this.router.navigate('', false);
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

        this.districtSelect.innerHTML = '<option value="">Select representative...</option>' +
            options.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
        this.districtSelect.disabled = false;
    }

    async onDistrictChange(stateDistrict) {
        // Find member row
        const member = this.members.find(m => m['State / District'] === stateDistrict);
        if (!member) return;

        this.router.navigate(stateDistrict, false);
        this.showResults();
        this.renderMemberHeader(member);
        await this.loadGuide(member);
        this.createStickyBar();
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
        const deadlineDate = deadline ? new Date(deadline) : null;
        const now = new Date();
        const deadlinePassed = deadlineDate && !isNaN(deadlineDate.getTime()) && deadlineDate < now;
        const msInWeek = 7 * 24 * 60 * 60 * 1000;
        const deadlineUrgent = deadlineDate && !isNaN(deadlineDate.getTime()) && !deadlinePassed && (deadlineDate - now) <= msInWeek;

        // Action button (form or email) - displayed inline on desktop
        let actionHtml = '';
        if (isEmail) {
            let email = '';
            if (url.startsWith('mailto:')) {
                email = url.replace('mailto:', '');
            } else {
                const emailMatch = comment.match(/[\w.-]+@[\w.-]+/);
                email = emailMatch ? emailMatch[0] : comment;
            }
            actionHtml = `<a href="mailto:${escapeHtml(email)}" class="form-button form-button--email">
                <i class="bi bi-envelope"></i> Email request to: ${escapeHtml(email)}
            </a>`;
        } else if (hasUrl) {
            actionHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="form-button">
                <i class="bi bi-box-arrow-up-right"></i> Open Request Form
            </a>`;
        }

        // Warning banners (full width, below header content row)
        let warningHtml = '';
        if (!isEmail && !hasUrl) {
            warningHtml += `<div class="warning-banner">
                <i class="bi bi-exclamation-triangle"></i>
                No FY 2027 appropriations request form currently tracked.
                Visit <a href="${chamber === 'Senate' ? 'https://www.senate.gov/senators/senators-contact.htm' : 'https://www.house.gov/representatives/find-your-representative'}" target="_blank">${name}'s official website</a> to contact the office.
            </div>`;
        }
        if (deadline && deadlinePassed) {
            warningHtml += `<div class="warning-banner warning-banner--subtle">
                <i class="bi bi-clock"></i> The deadline for this office (${escapeHtml(deadline)}) has passed.
            </div>`;
        }

        // Inline deadline (only when not passed)
        let inlineDeadlineHtml = '';
        if (deadline && !deadlinePassed) {
            const urgentClass = deadlineUrgent ? ' deadline--urgent' : '';
            const urgentLabel = deadlineUrgent ? '<span class="deadline-label">Due soon</span>' : '';
            inlineDeadlineHtml = `<p class="deadline${urgentClass}"><i class="bi bi-calendar-event"></i> Deadline: ${escapeHtml(deadline)}${urgentLabel}</p>`;
        }

        container.innerHTML = `
            <div class="member-header-content">
                <div class="member-header-info">
                    <h2>${prefix} ${name} (${party}) \u2014 ${sd}</h2>
                    ${inlineDeadlineHtml}
                </div>
                ${actionHtml ? `<div class="member-header-action">${actionHtml}</div>` : ''}
            </div>
            ${warningHtml}
            <div id="spending-details-slot"></div>
        `;
        container.style.display = 'block';

        // Store member info for sticky bar
        this.currentMember = { name: `${prefix} ${name}`, url, isEmail, spendingSummary: null };
    }

    async loadGuide(member) {
        const guideContent = document.getElementById('guide-content');
        guideContent.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';

        // Build guide key: "TX-20_castro" from "State / District" + lowercase last name
        const sd = member['State / District'];
        const lastName = (member['Last Name'] || '').toLowerCase().replace(/[^a-z]/g, '');
        const guideKey = `${sd}_${lastName}`;

        try {
            const response = await fetch(`${DATA_URLS.guidesBase}${encodeURIComponent(guideKey)}.json`);
            if (!response.ok) throw new Error('Not found');
            const guideData = await response.json();
            this.renderSpendingContext(guideData.nasa_context);

            // Fall back to generic form_analysis if member JSON has empty/null form_analysis
            if (guideData.form_analysis && guideData.form_analysis.sections?.length) {
                this.renderFormWalkthrough(guideData, true);
            } else {
                console.log(`No form_analysis for ${guideKey}, using generic form walkthrough`);
                const genericResponse = await fetch(`${DATA_URLS.guidesBase}generic.json`);
                if (!genericResponse.ok) throw new Error('Generic not found');
                const genericData = await genericResponse.json();
                this.renderFormWalkthrough(genericData, false);
            }
        } catch (err) {
            console.log(`No guide for ${guideKey}, using generic directions`);
            try {
                const genericResponse = await fetch(`${DATA_URLS.guidesBase}generic.json`);
                if (!genericResponse.ok) throw new Error('Generic not found');
                const genericData = await genericResponse.json();
                this.renderFormWalkthrough(genericData, false);
            } catch (genericErr) {
                console.error('Failed to load generic guide:', genericErr);
                await this.renderGenericFallback(member);
            }
        }
    }

    renderSpendingContext(ctx) {
        if (!ctx) return;
        const container = document.getElementById('spending-details-slot');
        if (!container) return;

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

        const countsLine = `${escapeHtml(String(contractCount))} Contracts (${formatCurrency(contractTotal)} total potential value)`
            + `<span class="separator">&middot;</span>`
            + `${escapeHtml(String(grantCount))} Grants (${formatCurrency(grantTotal)} total potential value)`;

        // Store spending summary for sticky bar
        if (this.currentMember) {
            this.currentMember.spendingSummary = { fyParts, contractCount, grantCount, contractTotal, grantTotal };
        }

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

            return `<div class="award-row">
                <div class="award-row-header">
                    <i class="bi bi-chevron-right award-chevron"></i>
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
            <details class="spending-details" open>
                <summary><i class="bi bi-rocket-takeoff"></i> Local NASA Science Impact ${distLabel} <i class="bi bi-chevron-down chevron"></i></summary>
                <div class="spending-details-body">
                    <div class="spending-summary">SPENDING IN ${fyParts}</div>
                    <div class="award-counts">${countsLine}</div>
                    <button class="awards-toggle-btn">See awards</button>
                    <div class="award-list">${awardRows}</div>
                </div>
            </details>
        `;
    }

    renderFormWalkthrough(guideData, isCustom = false) {
        const container = document.getElementById('guide-content');
        const fa = guideData.form_analysis;
        if (!fa) {
            container.innerHTML = '';
            return;
        }

        let html = '<div class="form-walkthrough">';

        if (isCustom) {
            html += `<div class="ai-disclaimer">
                <i class="bi bi-stars"></i>
                <div>
                    <strong>AI-generated guide</strong> &mdash; Beta feature. Field suggestions and draft responses below were generated by AI based on the official form. Review all content carefully and rewrite in your own voice before submitting.
                </div>
            </div>`;
        }

        const sections = fa.sections || [];

        sections.forEach((section, sIdx) => {
            html += `<div class="walkthrough-section" id="section-${sIdx}">`;
            if (section.header) {
                html += `<h3>${escapeHtml(section.header)}</h3>`;
            }
            if (section.description) {
                html += `<p class="section-description">${escapeHtml(section.description)}</p>`;
            }

            // Section field summary
            const fields = section.fields || [];
            const preFilled = fields.filter(f => !f.is_constituent_info && f.draft_value).length;
            const personal = fields.filter(f => f.is_constituent_info).length;
            const needsReview = fields.filter(f => !f.is_constituent_info && f.draft_value && (f.confidence === 'low' || f.confidence === 'medium')).length;
            if (fields.length > 0) {
                let summaryParts = [];
                if (preFilled > 0) summaryParts.push(`<span class="section-summary-item">${preFilled} pre-filled</span>`);
                if (personal > 0) summaryParts.push(`<span class="section-summary-item">${personal} your info</span>`);
                if (needsReview > 0) summaryParts.push(`<span class="section-summary-item">${needsReview} to review</span>`);
                if (summaryParts.length > 0) {
                    html += `<div class="section-summary">${summaryParts.join('<span class="separator">&middot;</span>')}</div>`;
                }
            }
            // Group consecutive constituent fields into a single condensed box
            let i = 0;
            while (i < fields.length) {
                if (fields[i].is_constituent_info) {
                    // Collect consecutive constituent fields
                    const constituentFields = [];
                    while (i < fields.length && fields[i].is_constituent_info) {
                        constituentFields.push(fields[i]);
                        i++;
                    }
                    html += this.renderConstituentGroup(constituentFields);
                } else {
                    html += this.renderField(fields[i]);
                    i++;
                }
            }

            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;

        // Build section progress bar
        this.buildSectionNav(sections);
    }

    buildSectionNav(sections) {
        const nav = document.getElementById('section-nav');
        if (!nav || sections.length < 2) {
            if (nav) nav.style.display = 'none';
            return;
        }

        const steps = sections.map((section, idx) => {
            const hasUserFields = (section.fields || []).some(f => f.is_constituent_info);
            const activeClass = idx === 0 ? ' active' : '';
            const userClass = hasUserFields ? ' has-user-fields' : '';
            return `<button class="section-step${activeClass}${userClass}" data-section="${idx}">${escapeHtml(section.header || `Section ${idx + 1}`)}</button>`;
        }).join('');

        nav.innerHTML = `<div class="section-progress" role="navigation" aria-label="Form sections">${steps}</div>`;
        nav.style.display = 'block';

        // IntersectionObserver to track active section
        this.initSectionObserver(sections.length);
    }

    initSectionObserver(count) {
        if (this.sectionObserver) this.sectionObserver.disconnect();

        const steps = document.querySelectorAll('.section-step');
        this.sectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    const idx = entry.target.id.replace('section-', '');
                    steps.forEach(s => s.classList.remove('active'));
                    const activeStep = document.querySelector(`.section-step[data-section="${idx}"]`);
                    if (activeStep) {
                        activeStep.classList.add('active');
                        // Horizontal-only scroll within the progress bar (never the page)
                        const bar = activeStep.parentElement;
                        if (bar) {
                            bar.scrollTo({
                                left: activeStep.offsetLeft - (bar.offsetWidth - activeStep.offsetWidth) / 2,
                                behavior: 'smooth'
                            });
                        }
                    }
                }
            }
        }, { rootMargin: '-80px 0px -60% 0px' });

        for (let i = 0; i < count; i++) {
            const section = document.getElementById(`section-${i}`);
            if (section) this.sectionObserver.observe(section);
        }
    }

    createStickyBar() {
        this.removeStickyBar();
        if (!this.currentMember) return;

        const { name, url, isEmail } = this.currentMember;
        const hasUrl = url && url.toLowerCase() !== 'link' && url.trim() !== '';

        let actionHtml = '';
        if (isEmail) {
            const email = url.startsWith('mailto:') ? url.replace('mailto:', '') : '';
            if (email) {
                actionHtml = `<a href="mailto:${escapeHtml(email)}" class="form-button form-button--email"><i class="bi bi-envelope"></i> Email</a>`;
            }
        } else if (hasUrl) {
            actionHtml = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="form-button"><i class="bi bi-box-arrow-up-right"></i> Open Form</a>`;
        }

        if (!actionHtml) return;

        // Build spending summary for sticky bar
        let spendingHtml = '';
        const spending = this.currentMember.spendingSummary;
        if (spending) {
            // FY spending line: "NASA SCIENCE SPENDING: FY23 $72.4M · FY24 $77.9M · FY25 $119.6M"
            spendingHtml += `<span class="sticky-spending">NASA SCIENCE SPENDING: ${spending.fyParts}</span>`;
            // Awards line: "244 ACTIVE AWARDS WORTH $1.2B"
            const totalAwards = spending.contractCount + spending.grantCount;
            const totalValue = formatCurrency(spending.contractTotal + spending.grantTotal);
            spendingHtml += `<span class="sticky-awards">${totalAwards} active awards worth ${totalValue}</span>`;
        }

        const bar = document.createElement('div');
        bar.className = 'sticky-form-bar';
        bar.setAttribute('aria-label', 'Quick access to form link');
        bar.innerHTML = `<div class="sticky-form-bar-inner">
            <div class="sticky-member-info">
                <span class="member-name">${escapeHtml(name)}</span>
                ${spendingHtml}
            </div>
            ${actionHtml}
        </div>`;
        document.body.appendChild(bar);
        this.stickyBar = bar;

        // Show bar only after entire member header (including spending details)
        // scrolls out of view.
        const header = document.getElementById('member-header');
        if (header) {
            this.stickyObserver = new IntersectionObserver((entries) => {
                bar.classList.toggle('visible', !entries[0].isIntersecting);
            }, { threshold: 0 });
            this.stickyObserver.observe(header);
        }
    }

    removeStickyBar() {
        if (this.stickyObserver) {
            this.stickyObserver.disconnect();
            this.stickyObserver = null;
        }
        if (this.stickyBar) {
            this.stickyBar.remove();
            this.stickyBar = null;
        }
    }

    getActionType(field) {
        if (field.is_constituent_info) return 'personal';
        const type = (field.field_type || 'text').toLowerCase();
        const hasDraft = field.draft_value != null && field.draft_value !== '';
        if (type === 'textarea' && hasDraft) return 'copy';
        if (type === 'dropdown') return 'dropdown';
        return 'type';
    }

    renderField(field) {
        const isConstituent = field.is_constituent_info === true;
        const hasDraft = field.draft_value != null && field.draft_value !== '';
        const confidence = field.confidence || null;
        const isLowConfidence = confidence === 'low' && hasDraft && !isConstituent;
        const actionType = this.getActionType(field);

        // Build class list
        let classes = 'guide-field';
        classes += ` guide-field--${actionType}`;
        if (isConstituent) classes += ' constituent-field';
        if (isLowConfidence) classes += ' confidence-low';

        let html = `<div class="${classes}">`;

        // Field header with input type prefix
        html += '<div class="field-header">';

        // Determine literal input type prefix
        const type = (field.field_type || 'text').toLowerCase();
        let typePrefix = 'Text box';
        if (type === 'textarea') typePrefix = 'Text field';
        else if (type === 'dropdown') typePrefix = 'Dropdown';
        if (isConstituent) typePrefix = type === 'dropdown' ? 'Dropdown' : 'Text box';

        html += `<span class="field-type-prefix field-type-prefix--${actionType}">${typePrefix}:</span>`;
        html += `<span class="field-label">${escapeHtml(field.label || '')}</span>`;

        html += '</div>';

        // Field instruction
        html += '<div class="field-instruction">';
        html += this.getFieldInstruction(field);
        html += '</div>';

        // Confidence bars + info icon (only when has draft and not constituent)
        if (hasDraft && !isConstituent && confidence) {
            const barCount = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
            const barsHtml = Array(barCount).fill('<div class="confidence-bar"></div>').join('');

            let infoHtml = '';
            if (field.rationale) {
                const rationaleText = `AI generated result with the following justification: ${escapeHtml(field.rationale)}`;
                infoHtml = `<div class="confidence-info">
                    <button class="info-icon-btn" type="button" aria-label="View AI justification">
                        <i class="bi bi-info-circle"></i>
                    </button>
                    <div class="info-tooltip" role="tooltip">${rationaleText}</div>
                </div>`;
            }

            html += `<div class="confidence-display">
                <span class="confidence-label">Confidence</span>
                <div class="confidence-bars confidence-bars--${confidence}">${barsHtml}</div>
                ${infoHtml}
            </div>`;
        }

        html += '</div>';
        return html;
    }

    renderConstituentGroup(fields) {
        return `<div class="guide-field guide-field--personal constituent-field constituent-group">
            <div class="field-header">
                <span class="field-label"><i class="bi bi-person"></i> Your Information</span>
            </div>
            <p class="constituent-group-instruction">Fill in the following fields with your personal/constituent information:</p>
            <ul class="constituent-field-list">
                ${fields.map(f => {
                    const helpText = f.help_text ? ` — <span class="constituent-help">${escapeHtml(f.help_text)}</span>` : '';
                    return `<li>${escapeHtml(f.label || '')}${helpText}</li>`;
                }).join('')}
            </ul>
            <div class="org-details-note">
                <p>If requested, use the following for organizational details:</p>
                <strong>The Planetary Society</strong><br>
                60 S. Los Robles Ave, Pasadena, CA 91101<br>
                Organizational contact: Jack Kiraly, Director of Government Relations, <a href="mailto:jack.kiraly@planetary.org">jack.kiraly@planetary.org</a>
            </div>
        </div>`;
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
                return `Enter: &ldquo;<strong>${escapeHtml(field.draft_value)}</strong>&rdquo;`;

            case 'dropdown':
                return `Select: &ldquo;<strong>${escapeHtml(field.draft_value)}</strong>&rdquo;`;

            case 'textarea':
                return `Suggested response (rewrite in your own voice):
                    <div class="copyable-block">
                        <pre>${escapeHtml(field.draft_value)}</pre>
                        <button class="copy-btn">Copy</button>
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
            const listMatch = line.match(/^[\*\-] (.+)$/);
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
        // Escape everything first to prevent XSS
        text = escapeHtml(text);
        // Then apply formatting on the safe string (content is already escaped)
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<span class="fill-in">$1</span>');
        // Links: [text](url) - both text and url are already escaped by escapeHtml
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
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
