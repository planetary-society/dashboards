# FY 2027 Appropriations Request Guide — Design Document

## Purpose

A new dashboard that guides Planetary Society member-advocates through filling out congressional appropriations request forms. The user selects their state and district, sees their representative's info, and gets a field-by-field walkthrough of the form — or generic directions if no detailed guide exists.

## Architecture

**Approach:** Single-page client-side app. No build step. Matches existing dashboard patterns (vanilla JS, ES6 modules, static files served from `docs/`).

**Data loading:**
1. On page load, fetch the CSV index of all members
2. On district selection, attempt to fetch `guides/{key}.json`
3. If 404, fall back to rendering the generic markdown directions

### File Structure

```
docs/appropriations-guide/
├── index.html
└── js/
    └── app.js

docs/data/appropriations_requests/
├── fy2027_appropriations_request_forms.csv
├── fy2027_generic_directions.md
└── guides/
    └── TX-20_castro.json          (more added over time)
```

Uses shared assets from `docs/shared/` (CSS, navbar, constants, utils).

## Components

### 1. State & District Selector

A dedicated, simple selector for this dashboard using **Tom Select** for consistency with other dashboards.

- **State dropdown:** All 50 states + DC + territories, populated from CSV data
- **District dropdown:** Populated dynamically from CSV entries matching the selected state. Shows member name alongside district number (e.g., "District 20 — Joaquin Castro (D)")
- Senate members shown as "Senate — [Name]" entries

### 2. Member Info Header

Displayed after district selection. Data source: CSV (always available) or JSON `member` object (when available).

```
Rep. Joaquin Castro (D) — TX-20
Deadline: March 6, 2026
[★ Open Appropriations Request Form]    ← target="_blank"
```

**Edge cases:**
- **No URL / empty URL / placeholder "link":** Show warning: "No FY 2027 appropriations request form currently tracked. Visit [Member Name]'s official website to contact the office." with link to official website.
- **mailto: or email-based URL:** Display the email address directly as a `mailto:` link instead of an "Open Form" button. E.g., "Email your request to: staffer@house.gov"
- **Deadline passed:** Show warning banner: "The deadline for this office has passed."

### 3. NASA Spending Context Panel (JSON-only)

Appears between member header and form walkthrough when JSON data is available. Shows `nasa_context` data.

**Layout:**
- **Spending by Fiscal Year:** Inline values (e.g., "FY2023: $72.4M · FY2024: $88.1M · FY2025: $119.6M")
- **Summary counts:** "12 Contracts ($1.18B) · 12 Grants ($89.7M)"
- **Award list:** Combined contracts + grants, sorted by amount descending

**Each award row (collapsed):**
```
[Contract|Grant] · Recipient Name · City, State · $Amount
generated_award_summary or first 200 chars of description
```

**Expanded (on click):**
- Award ID
- Start Date → End Date
- Full description (untruncated)

### 4. Form Walkthrough (JSON-guided)

Renders `form_analysis.sections` as a scrolling guide.

**Section rendering:**
- Section header and description displayed as headings
- Each field rendered as an instruction card

**Field instruction patterns by type:**

| field_type | Instruction |
|---|---|
| `text` | Type: "{draft_value}" |
| `dropdown` | From the dropdown, select: "{draft_value}" |
| `textarea` | Paste the following: [copyable block with Copy button] |
| `email` | Enter your email address |
| `phone` | Enter your phone number |
| `address` | Enter your address |

**Special handling:**
- `is_constituent_info: true` → Show person icon + "Use your personal information" in muted text. Skip draft_value display.
- `is_prior_year_field: true` → No special treatment, just show draft_value normally.

**Confidence indicators:**
- **High:** Green checkmark icon (subtle, next to instruction)
- **Medium:** Yellow dot icon
- **Low:** Orange flag icon with slightly highlighted background

**Rationale:** Shown as expandable tooltip or small info icon that reveals the rationale text on hover/click.

### 5. Generic Fallback (no JSON)

When no JSON guide exists for the selected district:

- Render the generic markdown file as HTML (simple regex-based parser — headers, bold, italic, lists, links)
- Three appropriations requests (NASA SMD, NSF, DOE) rendered as collapsible sections, all expanded by default
- Template placeholders (`*Your First Name*`, `*Your Title*`) highlighted with a distinct "fill-in" style
- `\<Add a few sentences...\>` rendered as callout boxes

## Styling

Uses existing shared CSS (variables.css, base.css, layout.css, components.css). Dashboard-specific styles in `index.html` `<style>` block or a local CSS file if needed.

**New CSS needed:**
- `.guide-field` — instruction card for each form field
- `.confidence-high/medium/low` — indicator styling
- `.constituent-field` — muted style for personal info fields
- `.copyable-block` — textarea draft value with copy button
- `.award-row` — expandable contract/grant row
- `.award-row.expanded` — expanded state
- `.fallback-callout` — placeholder callout in generic guide
- `.fill-in` — highlighted template placeholder
- `.warning-banner` — deadline passed / no form URL warnings

## Data Model

### CSV columns used:
- `Member` (full name), `First Name`, `Last Name`
- `Chamber` (House/Senate), `Party`
- `State / District` (e.g., "TX-20" or "MD" for senators)
- `URL` (form URL, may be empty/mailto/placeholder)
- `Deadline`
- `Comment`
- `Past Caucus Signatory`, `Caucus`, `Appropriator`, `Authorizer`, `NASA Center` (booleans, for potential future use)

### JSON structure used:
- `member.*` — enriched member data
- `form_analysis.sections[].header` — section title
- `form_analysis.sections[].description` — section description
- `form_analysis.sections[].fields[]` — field objects with label, field_type, is_constituent_info, draft_value, rationale, confidence, options, required
- `nasa_context.spending_by_year` — fiscal year spending totals
- `nasa_context.top_contracts[]` — contract award objects
- `nasa_context["Top Grant Recipients"][]` — grant objects
- `nasa_context["Total Contract Awards"]`, `nasa_context["Total Grant Awards"]` — counts

## Mobile Behavior

- Single-column layout throughout
- Selectors stack vertically
- Spending context section collapses to summary only (expandable)
- Award rows show abbreviated info (type, recipient, amount only)
- Copy buttons remain functional
- No iframe or split-screen attempt on any screen size

## Error Handling

| Scenario | Behavior |
|---|---|
| CSV fetch fails | Show error message, disable selector |
| JSON 404 | Fall back to generic guide (expected behavior) |
| JSON parse error | Fall back to generic guide + console warning |
| Markdown fetch fails | Show "Generic directions unavailable" message |
| Empty/missing form URL | Warning: "No form tracked. Visit official website." |
| mailto: URL | Show email link directly |
| Past deadline | Warning banner above guide content |
