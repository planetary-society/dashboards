# FY 2027 Appropriations Request Guide — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a new dashboard at `docs/appropriations-guide/` that guides Planetary Society advocates through filling out congressional appropriations request forms, with field-by-field instructions from JSON data or generic markdown fallback.

**Architecture:** Single-page client-side app using vanilla JS + ES6 modules. Loads CSV index of all members, then fetches per-district JSON guides on demand. Falls back to generic markdown directions when no JSON exists. Uses shared CSS/components from other dashboards.

**Tech Stack:** Vanilla JS (ES6 modules), Tom Select (dropdowns), Bootstrap Icons, shared CSS design system (Poppins font, CSS custom properties)

**Design doc:** `docs/plans/2026-03-03-appropriations-guide-design.md`

---

### Data Paths

Current data locations that must be consolidated:
- CSV: `docs/data/appropriations_forms/fy2027_appropriations_request_forms.csv`
- JSON: `docs/data/appropriations_forms/TX-20_castro.json`
- Generic MD: `docs/appropriations_requests/data/fy2027_generic_directions.md`

Target (after Task 1): all files under `docs/data/appropriations_requests/`

### Key JSON Data Keys Reference
```
member.full_name, .chamber, .party, .state_code, .district, .form_url, .deadline, .official_url, .state_district
form_analysis.sections[].header, .description, .fields[]
  fields[]: .label, .field_type, .required, .is_constituent_info, .is_prior_year_field, .draft_value, .rationale, .confidence
nasa_context.spending_by_year (object: {"2023": 72420711.83, ...})
nasa_context.top_contracts[] (array of award objects)
nasa_context.top_grants[] (array of award objects)
nasa_context["Total Contract Awards"] (number)
nasa_context["Total Grant Awards"] (number)

Award object keys: .award_id, .recipient_name, .award_amount, .description, .start_date, .end_date, .category, .place_of_performance.city_name, .place_of_performance.state_code, .generated_award_summary
```

### CSV Columns Reference
```
Member, First Name, Last Name, Chamber, Party, State / District, Link, URL, Deadline, Comment, Submitted, Past Caucus Signatory, Caucus, Appropriator, Authorizer, NASA Center
```

`State / District` format: `"TX-20"` (House) or `"MD"` (Senate, no district number)

---

## Task 1: Consolidate Data Files

Move all data files into `docs/data/appropriations_requests/`.

**Files:**
- Move: `docs/data/appropriations_forms/fy2027_appropriations_request_forms.csv` → `docs/data/appropriations_requests/fy2027_appropriations_request_forms.csv`
- Move: `docs/data/appropriations_forms/TX-20_castro.json` → `docs/data/appropriations_requests/guides/TX-20_castro.json`
- Move: `docs/appropriations_requests/data/fy2027_generic_directions.md` → `docs/data/appropriations_requests/fy2027_generic_directions.md`
- Remove: empty `docs/data/appropriations_forms/` and `docs/appropriations_requests/` directories

**Step 1: Create target directories**
```bash
mkdir -p docs/data/appropriations_requests/guides
```

**Step 2: Move files**
```bash
mv docs/data/appropriations_forms/fy2027_appropriations_request_forms.csv docs/data/appropriations_requests/
mv docs/data/appropriations_forms/TX-20_castro.json docs/data/appropriations_requests/guides/
mv docs/appropriations_requests/data/fy2027_generic_directions.md docs/data/appropriations_requests/
```

**Step 3: Clean up old directories**
```bash
rmdir docs/data/appropriations_forms
rm -rf docs/appropriations_requests
```

**Step 4: Verify**
```bash
ls -la docs/data/appropriations_requests/
ls -la docs/data/appropriations_requests/guides/
```
Expected: CSV and MD at top level, JSON in `guides/`

**Step 5: Commit**
```bash
git add -A docs/data/appropriations_requests/ docs/data/appropriations_forms/ docs/appropriations_requests/
git commit -m "chore: consolidate appropriations data into docs/data/appropriations_requests/"
```

---

## Task 2: Create HTML Page Skeleton

Create the dashboard HTML page with shared CSS, Tom Select, navbar, and empty content containers.

**Files:**
- Create: `docs/appropriations-guide/index.html`

**Step 1: Create directory**
```bash
mkdir -p docs/appropriations-guide/js
```

**Step 2: Write index.html**

Create `docs/appropriations-guide/index.html` with:
- Standard `<head>` matching `docs/nasa-science/index.html` pattern (meta, favicons, fonts, Bootstrap Icons, Tom Select CSS, shared CSS)
- No Grid.js or D3.js (not needed for this dashboard)
- Title: "FY 2027 Appropriations Request Guide - The Planetary Society"
- `<header id="navbar" class="navbar">` (rendered by Navbar component)
- `<main class="dashboard">` containing:
  - `<div class="guide-hero">` — title + intro text
  - `<div id="selector-container" class="selector-section">` — state/district dropdowns
  - `<div id="member-header">` — member info (hidden initially)
  - `<div id="spending-context">` — NASA spending panel (hidden initially)
  - `<div id="guide-content">` — form walkthrough or generic fallback (hidden initially)
- Tom Select JS (`<script src="https://cdn.jsdelivr.net/npm/tom-select@2.3.1/dist/js/tom-select.complete.min.js">`)
- `<script type="module" src="js/app.js">`
- Dashboard-specific `<style>` block with initial CSS for:
  - `.guide-hero` (centered intro, like landing page hero)
  - `.selector-section` (flex row for dropdowns)
  - `.member-header` (member info card)

**Step 3: Write minimal app.js**

Create `docs/appropriations-guide/js/app.js`:
```javascript
import { Navbar } from '../../shared/js/components/navbar.js';
import { parseCSV, fetchText, escapeHtml } from '../../shared/js/utils.js';

const DATA_URLS = {
    csv: '../data/appropriations_requests/fy2027_appropriations_request_forms.csv',
    guidesBase: '../data/appropriations_requests/guides/',
    genericMd: '../data/appropriations_requests/fy2027_generic_directions.md'
};

class AppropriationsGuide {
    constructor() {
        this.members = [];
        this.stateMap = {};  // { stateAbbr: [memberRows...] }
    }

    async init() {
        new Navbar('navbar', { title: 'FY 2027 Appropriations Request Guide' }).render();
        await this.loadCSV();
    }

    async loadCSV() {
        try {
            const csvText = await fetchText(DATA_URLS.csv);
            this.members = parseCSV(csvText);
            this.buildStateMap();
        } catch (err) {
            document.getElementById('guide-content').innerHTML =
                '<div class="warning-banner">Unable to load member data. Please try again later.</div>';
        }
    }

    buildStateMap() {
        this.stateMap = {};
        for (const row of this.members) {
            const sd = row['State / District'];
            if (!sd) continue;
            const state = sd.includes('-') ? sd.split('-')[0] : sd;
            if (!this.stateMap[state]) this.stateMap[state] = [];
            this.stateMap[state].push(row);
        }
    }
}

const app = new AppropriationsGuide();
app.init();
```

**Step 4: Open in browser and verify**

Run: `open docs/appropriations-guide/index.html` (or use local server)
Expected: Page loads with navbar, title, empty selector area. No JS errors in console.

**Step 5: Commit**
```bash
git add docs/appropriations-guide/
git commit -m "feat: scaffold appropriations guide HTML and app skeleton"
```

---

## Task 3: Build State & District Selector with Tom Select

Implement two Tom Select dropdowns: state selection populates district options.

**Files:**
- Modify: `docs/appropriations-guide/js/app.js`
- Modify: `docs/appropriations-guide/index.html` (add selector HTML + CSS)

**Step 1: Add selector HTML to index.html**

Inside `#selector-container`:
```html
<div class="selector-row">
    <div class="selector-field">
        <label for="state-select">State</label>
        <select id="state-select" placeholder="Select a state..."></select>
    </div>
    <div class="selector-field">
        <label for="district-select">Representative</label>
        <select id="district-select" placeholder="Select state first..." disabled></select>
    </div>
</div>
```

Add CSS for `.selector-row` (flex, gap, responsive stacking), `.selector-field` (flex-grow).

**Step 2: Implement initSelector() in app.js**

```javascript
initSelector() {
    // State names for display
    const STATE_NAMES = {
        'AL': 'Alabama', 'AK': 'Alaska', /* ... full list ... */ 'WY': 'Wyoming',
        'DC': 'District of Columbia', 'AS': 'American Samoa', 'GU': 'Guam',
        'MP': 'Northern Mariana Islands', 'PR': 'Puerto Rico', 'VI': 'U.S. Virgin Islands'
    };

    // Build state options from CSV data (only states that have members)
    const stateOptions = Object.keys(this.stateMap)
        .sort()
        .map(abbr => ({ value: abbr, text: STATE_NAMES[abbr] || abbr }));

    this.stateSelect = new TomSelect('#state-select', {
        options: stateOptions,
        maxItems: 1,
        onChange: (value) => this.onStateChange(value)
    });

    this.districtSelect = new TomSelect('#district-select', {
        options: [],
        maxItems: 1,
        onChange: (value) => this.onDistrictChange(value)
    });
}
```

**Step 3: Implement onStateChange()**

```javascript
onStateChange(stateAbbr) {
    const members = this.stateMap[stateAbbr] || [];
    this.districtSelect.clear();
    this.districtSelect.clearOptions();

    const options = members.map(m => {
        const sd = m['State / District'];
        const districtPart = sd.includes('-') ? sd.split('-')[1] : null;
        const isSenate = m['Chamber'] === 'Senate';
        const label = isSenate
            ? `Senate — ${m['Member']} (${m['Party'][0]})`
            : `District ${districtPart} — ${m['Member']} (${m['Party'][0]})`;
        return { value: sd, text: label };
    });

    this.districtSelect.addOptions(options);
    this.districtSelect.enable();
}
```

**Step 4: Implement onDistrictChange() stub**

```javascript
async onDistrictChange(stateDistrict) {
    const member = this.members.find(m => m['State / District'] === stateDistrict);
    if (!member) return;
    this.renderMemberHeader(member);
    await this.loadGuide(member);
}
```

**Step 5: Visual test**

Open in browser. Select a state → district dropdown populates. Select a district → nothing rendered yet (stubs). No console errors.

**Step 6: Commit**
```bash
git add docs/appropriations-guide/
git commit -m "feat: add Tom Select state/district selector with CSV data"
```

---

## Task 4: Render Member Info Header

Display member name, party, chamber, deadline, and form link/warning.

**Files:**
- Modify: `docs/appropriations-guide/js/app.js`
- Modify: `docs/appropriations-guide/index.html` (add CSS for member header)

**Step 1: Add CSS for member header**

Add to `<style>`:
```css
.member-header { /* card-like section with member info */ }
.member-header h2 { /* Rep. Name (P) — ST-DD */ }
.member-header .deadline { /* deadline text */ }
.member-header .form-button { /* prominent CTA button */ }
.warning-banner { /* orange/red warning for edge cases */ }
```

**Step 2: Implement renderMemberHeader(member)**

```javascript
renderMemberHeader(member) {
    const container = document.getElementById('member-header');
    const url = member['URL'] || '';
    const name = escapeHtml(member['Member']);
    const party = member['Party'] ? member['Party'][0] : '';
    const chamber = member['Chamber'];
    const sd = escapeHtml(member['State / District']);
    const prefix = chamber === 'Senate' ? 'Sen.' : 'Rep.';
    const deadline = member['Deadline'] || '';

    // Determine URL type
    const isEmail = url.toLowerCase().startsWith('mailto:') ||
                    member['Comment']?.toLowerCase().includes('email');
    const hasUrl = url && url !== 'link' && url.trim() !== '';
    const deadlinePassed = deadline && new Date(deadline) < new Date();

    let formHtml = '';
    if (isEmail) {
        const email = url.startsWith('mailto:') ? url.replace('mailto:', '') :
                      (member['Comment'] || '').replace(/^email\s*/i, '');
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
        deadlineHtml = deadlinePassed
            ? `<div class="warning-banner warning-banner--subtle">
                <i class="bi bi-clock"></i> The deadline for this office (${escapeHtml(deadline)}) has passed.
               </div>`
            : `<p class="deadline"><i class="bi bi-calendar-event"></i> Deadline: ${escapeHtml(deadline)}</p>`;
    }

    container.innerHTML = `
        <h2>${prefix} ${name} (${party}) — ${sd}</h2>
        ${deadlineHtml}
        ${formHtml}
    `;
    container.style.display = 'block';
}
```

**Step 3: Visual test**

Select TX-20 → Should show "Rep. Joaquin Castro (D) — TX-20" with deadline and form button.
Select a member with no URL (e.g., Pete Aguilar CA-33) → Should show warning.
Select Brian Babin TX-36 → Should show email link (has "Email sam.bryant@mail.house.gov" in Comment).

**Step 4: Commit**
```bash
git add docs/appropriations-guide/
git commit -m "feat: render member info header with form link edge cases"
```

---

## Task 5: Load and Route to JSON Guide or Generic Fallback

Implement `loadGuide()` that fetches JSON, and routes to guided walkthrough or generic fallback.

**Files:**
- Modify: `docs/appropriations-guide/js/app.js`

**Step 1: Implement loadGuide()**

```javascript
async loadGuide(member) {
    const guideContent = document.getElementById('guide-content');
    const spendingContext = document.getElementById('spending-context');
    guideContent.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
    spendingContext.innerHTML = '';
    spendingContext.style.display = 'none';

    // Build the guide key from CSV: lowercase last name, state-district
    const sd = member['State / District'];
    const lastName = member['Last Name'].toLowerCase().replace(/[^a-z]/g, '');
    const guideKey = `${sd}_${lastName}`;

    try {
        const response = await fetch(`${DATA_URLS.guidesBase}${guideKey}.json`);
        if (!response.ok) throw new Error('Not found');
        const guideData = await response.json();

        // Render guided walkthrough
        this.renderSpendingContext(guideData.nasa_context);
        this.renderFormWalkthrough(guideData);
    } catch (err) {
        // Fallback to generic guide
        console.log(`No guide for ${guideKey}, using generic directions`);
        await this.renderGenericFallback(member);
    }
}
```

**Step 2: Add placeholder methods**

```javascript
renderSpendingContext(nasaContext) {
    // Implemented in Task 6
    document.getElementById('spending-context').innerHTML = '<p>Spending context placeholder</p>';
    document.getElementById('spending-context').style.display = 'block';
}

renderFormWalkthrough(guideData) {
    // Implemented in Task 7
    document.getElementById('guide-content').innerHTML = '<p>Form walkthrough placeholder</p>';
}

async renderGenericFallback(member) {
    // Implemented in Task 8
    document.getElementById('guide-content').innerHTML = '<p>Generic fallback placeholder</p>';
}
```

**Step 3: Visual test**

Select TX-20 (Castro) → placeholders for spending context + form walkthrough appear.
Select any other district → "Generic fallback placeholder" appears.

**Step 4: Commit**
```bash
git add docs/appropriations-guide/js/app.js
git commit -m "feat: add guide loading with JSON/fallback routing"
```

---

## Task 6: Render NASA Spending Context Panel

Display fiscal year spending, award counts, and expandable award list.

**Files:**
- Modify: `docs/appropriations-guide/js/app.js`
- Modify: `docs/appropriations-guide/index.html` (add CSS)

**Step 1: Add CSS for spending panel**

```css
.spending-context { border, padding, card-like }
.spending-summary { inline flex items for FY values }
.award-counts { summary counts line }
.award-list { list of award rows }
.award-row { clickable, border-bottom, padding }
.award-row .award-summary { truncated text }
.award-row .award-details { hidden by default, full info }
.award-row.expanded .award-details { display: block }
.award-type-badge { small colored badge for Contract/Grant }
```

**Step 2: Implement renderSpendingContext()**

```javascript
renderSpendingContext(ctx) {
    if (!ctx) return;
    const container = document.getElementById('spending-context');

    // Spending by year
    const years = Object.entries(ctx.spending_by_year || {})
        .sort(([a], [b]) => a.localeCompare(b));
    const yearHtml = years.map(([fy, amt]) =>
        `<span class="fy-value">FY${fy}: ${formatCurrency(amt)}</span>`
    ).join(' <span class="separator">·</span> ');

    // Award counts and totals
    const contracts = ctx.top_contracts || [];
    const grants = ctx.top_grants || [];
    const totalContracts = ctx['Total Contract Awards'] || contracts.length;
    const totalGrants = ctx['Total Grant Awards'] || grants.length;
    const contractSum = contracts.reduce((s, c) => s + (c.award_amount || 0), 0);
    const grantSum = grants.reduce((s, g) => s + (g.award_amount || 0), 0);

    // Combined award list sorted by amount
    const allAwards = [
        ...contracts.map(c => ({ ...c, type: 'Contract' })),
        ...grants.map(g => ({ ...g, type: 'Grant' }))
    ].sort((a, b) => (b.award_amount || 0) - (a.award_amount || 0));

    const awardRowsHtml = allAwards.map(award => {
        const city = award.place_of_performance?.city_name || '';
        const state = award.place_of_performance?.state_code || '';
        const location = city && state ? `${city}, ${state}` : '';
        const summary = award.generated_award_summary ||
            truncateText(award.description, 200);

        return `
        <div class="award-row" onclick="this.classList.toggle('expanded')">
            <div class="award-row-header">
                <span class="award-type-badge award-type-badge--${award.type.toLowerCase()}">${award.type}</span>
                <span class="award-recipient">${escapeHtml(award.recipient_name)}</span>
                <span class="award-location">${escapeHtml(location)}</span>
                <span class="award-amount">${formatCurrency(award.award_amount)}</span>
            </div>
            <div class="award-summary">${escapeHtml(summary)}</div>
            <div class="award-details">
                <p><strong>Award ID:</strong> ${escapeHtml(award.award_id)}</p>
                <p><strong>Period:</strong> ${award.start_date || 'N/A'} → ${award.end_date || 'N/A'}</p>
                <p><strong>Description:</strong> ${escapeHtml(award.description || 'N/A')}</p>
            </div>
        </div>`;
    }).join('');

    const sd = `${ctx.state_code}-${ctx.district}`;
    container.innerHTML = `
        <h3><i class="bi bi-rocket-takeoff"></i> NASA Science in ${escapeHtml(sd)}</h3>
        <div class="spending-summary">${yearHtml}</div>
        <div class="award-counts">
            ${totalContracts} Contracts (${formatCurrency(contractSum)})
            <span class="separator">·</span>
            ${totalGrants} Grants (${formatCurrency(grantSum)})
        </div>
        <div class="award-list">${awardRowsHtml}</div>
    `;
    container.style.display = 'block';
}
```

Import `formatCurrency` and `truncateText` from utils.js at the top of app.js.

**Step 3: Visual test**

Select TX-20 → spending panel shows FY values, counts, and expandable award rows. Click a row → expands to show details. Click again → collapses.

**Step 4: Commit**
```bash
git add docs/appropriations-guide/
git commit -m "feat: render NASA spending context panel with expandable awards"
```

---

## Task 7: Render Form Walkthrough (JSON-Guided)

Render the field-by-field walkthrough from `form_analysis.sections`.

**Files:**
- Modify: `docs/appropriations-guide/js/app.js`
- Modify: `docs/appropriations-guide/index.html` (add CSS)

**Step 1: Add CSS for form walkthrough**

```css
.form-walkthrough h3 { section headers }
.guide-field { card-like instruction for each field, border-left accent }
.guide-field .field-label { bold label text }
.guide-field .field-instruction { the instruction text }
.constituent-field { muted background, person icon }
.confidence-high { green checkmark }
.confidence-medium { yellow dot }
.confidence-low { orange flag, highlighted background }
.copyable-block { pre-formatted text block }
.copyable-block .copy-btn { copy to clipboard button }
.rationale-toggle { info icon that shows rationale on click }
```

**Step 2: Implement renderFormWalkthrough()**

```javascript
renderFormWalkthrough(guideData) {
    const container = document.getElementById('guide-content');
    const sections = guideData.form_analysis?.sections || [];

    // Form header/instructions if available
    let headerHtml = '';
    if (guideData.form_analysis?.form_header_text) {
        headerHtml = `<div class="form-intro">
            <h3>${escapeHtml(guideData.form_analysis.form_header_text)}</h3>
            ${guideData.form_analysis.form_instructions_text
                ? `<p class="form-instructions">${escapeHtml(guideData.form_analysis.form_instructions_text)}</p>`
                : ''}
        </div>`;
    }

    const sectionsHtml = sections.map((section, sIdx) => {
        const fieldsHtml = section.fields.map((field, fIdx) => {
            return this.renderField(field, sIdx + 1, fIdx + 1);
        }).join('');

        return `
        <div class="walkthrough-section">
            <h3>Section ${sIdx + 1}: ${escapeHtml(section.header)}</h3>
            ${section.description ? `<p class="section-description">${escapeHtml(section.description)}</p>` : ''}
            ${fieldsHtml}
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="form-walkthrough">
            ${headerHtml}
            ${sectionsHtml}
        </div>`;
}
```

**Step 3: Implement renderField()**

```javascript
renderField(field, sectionNum, fieldNum) {
    const isConstituent = field.is_constituent_info;
    const confidence = field.confidence;
    const fieldClass = isConstituent ? 'guide-field constituent-field' :
        `guide-field${confidence === 'low' ? ' confidence-low' : ''}`;

    // Confidence indicator
    let confidenceIcon = '';
    if (!isConstituent && field.draft_value) {
        if (confidence === 'high') confidenceIcon = '<i class="bi bi-check-circle-fill confidence-icon confidence-high"></i>';
        else if (confidence === 'medium') confidenceIcon = '<i class="bi bi-circle-fill confidence-icon confidence-medium"></i>';
        else if (confidence === 'low') confidenceIcon = '<i class="bi bi-flag-fill confidence-icon confidence-low-icon"></i>';
    }

    // Instruction content
    let instructionHtml;
    if (isConstituent) {
        instructionHtml = `<span class="constituent-hint"><i class="bi bi-person"></i> Use your personal information</span>`;
        if (field.help_text) {
            instructionHtml += `<span class="field-help">${escapeHtml(field.help_text)}</span>`;
        }
    } else if (!field.draft_value) {
        instructionHtml = '<span class="no-draft">No suggested value available</span>';
    } else {
        instructionHtml = this.getFieldInstruction(field);
    }

    // Rationale tooltip
    let rationaleHtml = '';
    if (field.rationale && !isConstituent) {
        rationaleHtml = `<div class="rationale">
            <button class="rationale-toggle" onclick="this.parentElement.classList.toggle('open')" title="Why this value?">
                <i class="bi bi-info-circle"></i>
            </button>
            <span class="rationale-text">${escapeHtml(field.rationale)}</span>
        </div>`;
    }

    const requiredBadge = field.required ? '<span class="required-badge">Required</span>' : '';

    return `
    <div class="${fieldClass}">
        <div class="field-header">
            <span class="field-label">${escapeHtml(field.label)}</span>
            ${requiredBadge}
            ${confidenceIcon}
        </div>
        <div class="field-instruction">${instructionHtml}</div>
        ${rationaleHtml}
    </div>`;
}
```

**Step 4: Implement getFieldInstruction()**

```javascript
getFieldInstruction(field) {
    const value = field.draft_value;

    switch (field.field_type) {
        case 'dropdown':
            return `From the dropdown, select: <strong>${escapeHtml(value)}</strong>`;

        case 'textarea':
            return `<p>Paste the following:</p>
                <div class="copyable-block">
                    <pre>${escapeHtml(value)}</pre>
                    <button class="copy-btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(() => { this.textContent = 'Copied!'; setTimeout(() => this.textContent = 'Copy', 2000); })">
                        <i class="bi bi-clipboard"></i> Copy
                    </button>
                </div>`;

        case 'email':
            return `Enter your email address`;

        case 'phone':
            return `Enter your phone number`;

        case 'address':
            return `Enter your address${field.help_text ? ` (${escapeHtml(field.help_text)})` : ''}`;

        case 'text':
        default:
            return `Type: <strong>${escapeHtml(value)}</strong>`;
    }
}
```

**Step 5: Visual test**

Select TX-20 → Full walkthrough renders with sections, field cards, confidence indicators, copyable textarea blocks. Click "Copy" → text copies to clipboard. Click rationale (i) icon → shows explanation.

**Step 6: Commit**
```bash
git add docs/appropriations-guide/
git commit -m "feat: render field-by-field form walkthrough with confidence indicators"
```

---

## Task 8: Render Generic Markdown Fallback

Parse and render the generic directions markdown when no JSON guide exists.

**Files:**
- Modify: `docs/appropriations-guide/js/app.js`
- Modify: `docs/appropriations-guide/index.html` (add CSS)

**Step 1: Add CSS for generic fallback**

```css
.generic-guide h1 { collapsible section headers }
.generic-guide h2, h3 { standard subheadings }
.fill-in { background highlight for template placeholders }
.fallback-callout { callout box for "Add a few sentences..." prompts }
.collapsible-header { clickable, with expand/collapse icon }
```

**Step 2: Implement simple markdown parser**

```javascript
parseMarkdown(md) {
    // Split into three request sections by H1 headers
    // "# FY 2027 NASA Science Appropriations..."
    // "# FY 2027 NSF Appropriations..."
    // "# FY 2027 DOE Office of Science..."

    return md
        // Headers
        .replace(/^### (.*$)/gm, '<h4>$1</h4>')
        .replace(/^## (.*$)/gm, '<h3>$1</h3>')
        .replace(/^# (.*$)/gm, '<h2>$1</h2>')
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // Italic (template placeholders) — wrap in .fill-in
        .replace(/\*([^*]+)\*/g, '<span class="fill-in">$1</span>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Escaped angle brackets (callouts)
        .replace(/\\<([^>]+)\\>/g, '<div class="fallback-callout"><i class="bi bi-pencil"></i> $1</div>')
        // Line breaks (double newline = paragraph)
        .replace(/\n\n/g, '</p><p>')
        // Unordered lists
        .replace(/^\* (.*$)/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        // Clean up nested <ul> tags
        .replace(/<\/ul>\s*<ul>/g, '');
}
```

**Step 3: Implement renderGenericFallback()**

```javascript
async renderGenericFallback(member) {
    const container = document.getElementById('guide-content');

    try {
        const md = await fetchText(DATA_URLS.genericMd);
        // Split by H1 headers to create collapsible sections
        const sections = md.split(/(?=^# )/m).filter(s => s.trim());

        const sectionsHtml = sections.map((section, idx) => {
            const titleMatch = section.match(/^# (.+)/m);
            const title = titleMatch ? titleMatch[1] : `Section ${idx + 1}`;
            const body = section.replace(/^# .+\n/, '');
            const parsedBody = this.parseMarkdown(body);

            return `
            <details class="generic-section" open>
                <summary class="collapsible-header">
                    <i class="bi bi-chevron-down"></i> ${escapeHtml(title)}
                </summary>
                <div class="generic-section-body"><p>${parsedBody}</p></div>
            </details>`;
        }).join('');

        container.innerHTML = `
            <div class="generic-guide">
                <div class="generic-intro">
                    <p>A detailed form guide for this office is not yet available. Use the general directions below as a reference when filling out your appropriations request form.</p>
                </div>
                ${sectionsHtml}
            </div>`;
    } catch (err) {
        container.innerHTML = '<div class="warning-banner">Generic directions unavailable. Please try again later.</div>';
    }
}
```

**Step 4: Visual test**

Select any member without a JSON guide (e.g., NC-12 Alma Adams) → generic markdown renders with three collapsible sections, template placeholders highlighted, callout boxes visible. Click section headers → collapse/expand.

**Step 5: Commit**
```bash
git add docs/appropriations-guide/
git commit -m "feat: render generic markdown fallback with collapsible sections"
```

---

## Task 9: Polish CSS and Responsive Layout

Add all remaining dashboard-specific CSS, mobile responsive behavior, and visual polish.

**Files:**
- Modify: `docs/appropriations-guide/index.html` (CSS)

**Step 1: Implement full CSS**

Key classes to finalize in `<style>` block:

1. **Hero section:** `.guide-hero` — centered, max-width 800px, like landing page
2. **Selector:** `.selector-row` — flex row, gap, responsive stacking below 768px
3. **Member header:** `.member-header` — card with subtle shadow, form button CTA
4. **Form button:** `.form-button` — primary blue, hover lift, icon alignment
5. **Warning banner:** `.warning-banner` — yellow-50 bg, orange-500 left border, icon
6. **Spending panel:** `.spending-context` — card with header, FY values inline, award list
7. **Award rows:** `.award-row` — cursor pointer, hover bg, transition expand
8. **Award badges:** `.award-type-badge--contract` (blue), `--grant` (purple)
9. **Form walkthrough:** `.walkthrough-section` — section headings with bottom border
10. **Guide fields:** `.guide-field` — left border accent, padding, margin-bottom
11. **Constituent fields:** `.constituent-field` — gray bg, muted text
12. **Confidence icons:** colors matching design (green, yellow, orange)
13. **Copyable block:** `.copyable-block` — gray-50 bg, monospace font, copy button top-right
14. **Rationale:** `.rationale` — hidden by default, `.open .rationale-text` visible
15. **Generic guide:** `.fill-in` — yellow highlight, `.fallback-callout` — blue-50 left border
16. **Mobile:** `@media (max-width: 768px)` — stack selectors, single column, smaller text

**Step 2: Tom Select custom styles**

Override Tom Select defaults to match the design system:
```css
.ts-wrapper { font-family, border-radius, border-color matching design }
.ts-control { min-height: 44px for touch targets }
```

**Step 3: Visual test at multiple viewports**

Test at 1280px, 768px, and 375px widths. Verify:
- Desktop: full width, comfortable spacing
- Tablet: selectors side-by-side, content narrower
- Mobile: selectors stacked, award rows abbreviated, copy buttons accessible

**Step 4: Commit**
```bash
git add docs/appropriations-guide/index.html
git commit -m "feat: add polished CSS with responsive layout"
```

---

## Task 10: Add Dashboard Card to Landing Page

Add a card for the new dashboard on the main landing page.

**Files:**
- Modify: `docs/index.html`

**Step 1: Add dashboard card**

Inside `.dashboard-grid` in `docs/index.html`, add a third card after the existing two:

```html
<a href="appropriations-guide/" class="dashboard-card">
    <div class="dashboard-card-body" style="padding-top: var(--space-8);">
        <h2 class="dashboard-card-title">
            <i class="bi bi-pencil-square" style="color: var(--purple-500);"></i>
            FY 2027 Appropriations Request Guide
        </h2>
        <p class="dashboard-card-description">
            Step-by-step guide for filling out congressional appropriations request forms. Find your representative and get personalized instructions for requesting NASA Science, NSF, and DOE funding.
        </p>
        <span class="dashboard-card-arrow">
            Get Started <i class="bi bi-arrow-right"></i>
        </span>
    </div>
</a>
```

Note: No preview image for now (use icon + text card instead). An image can be added later.

**Step 2: Visual test**

Open `docs/index.html` → three cards in grid. Click the new card → navigates to `appropriations-guide/`.

**Step 3: Commit**
```bash
git add docs/index.html
git commit -m "feat: add appropriations guide card to landing page"
```

---

## Task 11: Final Review and Cleanup

Review the complete dashboard end-to-end, fix any issues.

**Files:**
- Potentially any file modified in previous tasks

**Step 1: End-to-end walkthrough**

Test these scenarios in the browser:
1. **TX-20 (Castro):** Full JSON guide — member header, spending panel, form walkthrough with all field types
2. **NC-12 (Adams):** No JSON — member header, generic fallback with 3 collapsible sections
3. **TX-36 (Babin):** Email-based submission — email link instead of form button
4. **CA-33 (Aguilar):** No URL — warning banner about no form tracked
5. **MD (Senate member):** Senate member displays correctly as "Sen."
6. **Mobile viewport:** Everything stacks, no horizontal overflow

**Step 2: Check console for errors**

Open browser dev tools, navigate through all scenarios. Fix any JS errors or missing resources.

**Step 3: Verify copy-to-clipboard works**

Click "Copy" on a textarea instruction → paste somewhere → text matches.

**Step 4: Final commit if any fixes needed**
```bash
git add docs/appropriations-guide/
git commit -m "fix: final review cleanup for appropriations guide"
```
