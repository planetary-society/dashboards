/**
 * Static Page Templates Module
 *
 * Builds the crawlable half of the cancellations dashboard: one plain HTML page
 * per congressional district, an index over them, and the site sitemap. Pure
 * string builders — no fs, no DOM, no clock — so the same inputs always produce
 * byte-identical output and the daily bake only writes files that really moved.
 *
 * These pages exist because the dashboard itself renders everything client-side
 * behind a hash route: a crawler asking for #CA-16 gets an empty shell. So the
 * pages carry ZERO JavaScript — no D3, no Grid.js, not even an icon font — and
 * every fact on them comes from the same modules the dashboard uses:
 * `panel-views.js` for the sentences and the card view-models (badges, fields,
 * descriptions), `panel-common.js` for the award links. Nothing is retyped
 * here, so the static page and the live panel cannot drift apart.
 */

import {
    escapeAttr,
    escapeHtml,
    pluralCount,
    truncateText
} from '../../docs/shared/js/utils.js';
import { STATE_NAMES } from '../../docs/shared/js/constants.js';
import { renderAwardLink } from '../../docs/cancellations/js/panel-common.js';
import {
    PANEL_META,
    claimCardModel,
    districtEmptyNote,
    districtSummaryLine,
    terminationCardModel
} from '../../docs/cancellations/js/panel-views.js';
import { formatIsoDayLong } from '../../docs/cancellations/js/chart-common.js';

/** Canonical origin for every absolute URL these pages emit */
export const SITE_BASE = 'https://dashboards.planetary.org';

/**
 * Characters of an award description kept on a card
 *
 * Matches app.js's CARD_DESCRIPTION_CHARS clamp. The dashboard clamps in CSS
 * and keeps the full text in the DOM behind a toggle; these pages have no
 * script, so the same budget is applied with `truncateText` instead.
 *
 * @type {number}
 */
const CARD_DESCRIPTION_CHARS = 400;

/**
 * Navbar title, identical to the dashboard's
 *
 * Rendered as a span rather than an h1 on these subpages: the page's one h1 is
 * the district heading, which is also what a search result should show.
 *
 * Exported so the bake can assert it still matches the dashboard's own navbar
 * h1 — a rebrand that edits index.html but not this constant must fail the
 * job, not quietly ship ~78 district pages wearing the old name.
 *
 * @type {string}
 */
export const SITE_TITLE = 'NASA Contract & Grant Cancellations Tracker';

/**
 * Path prefixes for a page nested one level under /cancellations/districts/
 * @type {{root: string, panels: string, dashboard: string, index: string}}
 */
const DISTRICT_PAGE_PATHS = {
    root: '../../../',
    panels: '../../css/panels.css',
    dashboard: '../../',
    index: '../'
};

/**
 * Path prefixes for /cancellations/districts/index.html
 * @type {{root: string, panels: string, dashboard: string, index: string}}
 */
const INDEX_PAGE_PATHS = {
    root: '../../',
    panels: '../css/panels.css',
    dashboard: '../',
    index: './'
};

/**
 * Render the shared `<head>` for a baked page
 *
 * Head conventions (favicon set, Poppins, stylesheet order) are copied from
 * `docs/cancellations/index.html`; the CDN icon font and Grid.js theme are
 * deliberately not, since these pages draw neither.
 *
 * @param {Object} options - Head inputs
 * @param {string} options.title - Full `<title>` text
 * @param {string} options.description - Meta/OG description, plain text
 * @param {string} options.canonical - Absolute canonical URL
 * @param {{root: string, panels: string}} options.paths - Relative path prefixes
 * @returns {string} HTML for the head element
 */
function renderHead({ title, description, canonical, paths }) {
    const safeTitle = escapeHtml(title);
    const safeTitleAttr = escapeAttr(title);
    const safeDescription = escapeAttr(description);
    const safeCanonical = escapeAttr(canonical);

    return `<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta name="author" content="Casey Dreier/The Planetary Society">
<meta name="theme-color" content="#037cc2">
<link rel="canonical" href="${safeCanonical}">

<link rel="apple-touch-icon" sizes="180x180" href="https://www.planetary.org/img/site/apple-touch-icon-180x180.png">
<link rel="icon" type="image/png" sizes="32x32" href="https://www.planetary.org/img/site/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="https://www.planetary.org/img/site/favicon-16x16.png">
<link rel="shortcut icon" href="https://www.planetary.org/img/site/favicon.ico">

<meta property="og:type" content="website">
<meta property="og:site_name" content="The Planetary Society">
<meta property="og:title" content="${safeTitleAttr}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeCanonical}">
<meta name="twitter:card" content="summary">
<meta name="twitter:site" content="@exploreplanets">
<meta name="twitter:title" content="${safeTitleAttr}">
<meta name="twitter:description" content="${safeDescription}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;700&amp;display=swap" rel="stylesheet">

<link rel="stylesheet" href="${paths.root}shared/css/variables.css">
<link rel="stylesheet" href="${paths.root}shared/css/base.css">
<link rel="stylesheet" href="${paths.root}shared/css/components.css">
<link rel="stylesheet" href="${paths.root}shared/css/layout.css">
<link rel="stylesheet" href="${paths.panels}">

<script src="https://cdn.usefathom.com/script.js" data-site="UDDGKLNZ" defer></script>
</head>`;
}

/**
 * Render the site navbar
 *
 * Same markup and classes as the dashboard's, except the title is a span: these
 * pages spend their single h1 on the district heading.
 *
 * @param {{root: string, dashboard: string}} paths - Relative path prefixes
 * @returns {string} HTML for the header element
 */
function renderNavbar(paths) {
    return `<header class="navbar">
<div class="navbar-brand">
<a href="https://planetary.org" target="_blank" rel="noopener" class="navbar-logo-link" title="The Planetary Society">
<img src="${paths.root}shared/img/TPS_Logo_3Stack-White.png" alt="The Planetary Society" class="navbar-logo">
</a>
<a href="${paths.dashboard}" class="navbar-title-link"><span class="navbar-title">${escapeHtml(SITE_TITLE)}</span></a>
</div>
<nav class="navbar-nav">
<a href="mailto:casey.dreier@planetary.org" class="navbar-contact">Contact</a>
</nav>
</header>`;
}

/**
 * Render the page footer's navigation
 * @param {{root: string, dashboard: string, index: string}} paths - Relative path prefixes
 * @returns {string} HTML for the footer element
 */
function renderFooter(paths) {
    return `<footer class="site-footer">
<nav aria-label="Site">
<a href="${paths.index}">All districts</a>
<a href="${paths.dashboard}">Interactive dashboard</a>
<a href="${paths.root}">Dashboards home</a>
<a href="https://planetary.org">The Planetary Society</a>
</nav>
</footer>`;
}

/**
 * Wrap a head and body in the document shell
 * @param {string} head - renderHead() output
 * @param {string} body - Body markup
 * @returns {string} Complete HTML document
 */
function renderDocument(head, body) {
    return `<!doctype html>
<html lang="en">
${head}
<body>
${body}
</body>
</html>
`;
}

/**
 * Render one award card from a panel-views card view-model
 *
 * Same class family as app.js's `renderAwardCard`, so `components.css` styles
 * these without a second ruleset — minus the description toggle, which needs a
 * click handler these pages do not have (the description is truncated at the
 * same character budget the dashboard clamps at). The card's copy and field
 * derivations all live in the model, never here.
 *
 * @param {Object} model - `terminationCardModel()`/`claimCardModel()` result
 * @returns {string} HTML for the card
 */
function renderAwardCard({ title, subtitle, badge, fields, description }) {
    const fieldHtml = fields
        .map(({ label, text, url }) => ({
            label,
            value: url ? renderAwardLink(text, url) : text ? escapeHtml(text) : ''
        }))
        .filter(({ value }) => value)
        .map(({ label, value }) => `<div class="award-field">`
            + `<span class="award-label">${escapeHtml(label)}</span>`
            + `<span class="award-value">${value}</span>`
            + '</div>')
        .join('');

    const descriptionHtml = description
        ? '<div class="award-field award-field--full">'
            + '<span class="award-label">Description</span>'
            + `<span class="award-value">${escapeHtml(truncateText(description, CARD_DESCRIPTION_CHARS))}</span>`
            + '</div>'
        : '';

    const subtitleHtml = subtitle
        ? `<p class="award-recipient-place">${escapeHtml(subtitle)}</p>`
        : '';

    return '<article class="award-card">'
        + '<div class="award-card-header">'
        + `<div class="award-card-title"><h3 class="award-recipient">${escapeHtml(title)}</h3>${subtitleHtml}</div>`
        + `<span class="${badge.className}">${escapeHtml(badge.label)}</span>`
        + '</div>'
        + `<div class="award-card-body">${fieldHtml}${descriptionHtml}</div>`
        + '</article>';
}

/**
 * Render one labelled dataset group, or its empty-state line
 * @param {'cancellations'|'doge'} panelId - Which dataset
 * @param {Array<Object>} rows - That dataset's normalized rows for the district
 * @param {Function} modelFor - Card view-model builder for a row
 * @returns {string} HTML for the section
 */
function renderGroup(panelId, rows, modelFor) {
    const body = rows.length
        ? `<div class="award-cards-grid">${rows.map((row) => renderAwardCard(modelFor(row))).join('')}</div>`
        : `<p class="district-group-note">${escapeHtml(districtEmptyNote(panelId))}</p>`;

    return '<section class="district-group">'
        + `<h2 class="district-group-heading">${escapeHtml(PANEL_META[panelId].label)}</h2>`
        + body
        + '</section>';
}

/**
 * Render the "Data updated …" line
 * @param {string} lastUpdated - ISO 'YYYY-MM-DD' data date
 * @returns {string} HTML for the paragraph
 */
function renderFreshness(lastUpdated) {
    return `<p class="freshness-bar">Data updated ${escapeHtml(formatIsoDayLong(lastUpdated))}</p>`;
}

/**
 * Render one district's static page
 *
 * The same facts as the dashboard's `#CA-16` view — both datasets as labelled
 * groups, one card per row — with a link back into the interactive dashboard so
 * the static page is an entry point rather than a dead end.
 *
 * @param {Object} options - Page inputs
 * @param {string} options.code - District code, e.g. 'CA-16'
 * @param {Array<Object>} options.terminationRows - Termination rows for this district
 * @param {Array<Object>} options.dogeRows - DOGE claim rows for this district
 * @param {string} options.lastUpdated - ISO 'YYYY-MM-DD' data date
 * @returns {string} Complete HTML document
 */
export function renderDistrictPage({ code, terminationRows = [], dogeRows = [], lastUpdated = '' }) {
    const canonical = `${SITE_BASE}/cancellations/districts/${encodeURIComponent(code)}/`;
    const title = `NASA Cancellations in ${code} | The Planetary Society`;
    const description = `${pluralCount(terminationRows.length, 'confirmed NASA award termination')} and `
        + `${pluralCount(dogeRows.length, 'DOGE cancellation claim')} list congressional district `
        + `${code}. Recipients, award IDs, dollars, and dates from federal award records.`;

    const body = [
        renderNavbar(DISTRICT_PAGE_PATHS),
        '<main class="dashboard">',
        '<section class="district-summary-section">',
        '<div class="district-summary-header">',
        `<h1 class="district-title">NASA Award Cancellations in ${escapeHtml(code)}</h1>`,
        '</div>',
        `<p class="district-summary-stats">${escapeHtml(districtSummaryLine(terminationRows.length, dogeRows.length))}</p>`,
        `<p class="district-dashboard-link"><a href="${DISTRICT_PAGE_PATHS.dashboard}#${escapeAttr(code)}">`
            + 'View this district on the interactive dashboard &rarr;</a></p>',
        renderGroup('cancellations', terminationRows, terminationCardModel),
        renderGroup('doge', dogeRows, claimCardModel),
        renderFreshness(lastUpdated),
        renderFooter(DISTRICT_PAGE_PATHS),
        '</section>',
        '</main>'
    ].join('\n');

    return renderDocument(
        renderHead({ title, description, canonical, paths: DISTRICT_PAGE_PATHS }),
        body
    );
}

/**
 * Compare two district codes for sorting
 *
 * A plain code comparison, not `localeCompare`: the bake must produce the same
 * bytes on any runner, whatever its default locale. District numbers arrive
 * zero-padded, so lexicographic order is also numeric order. The one
 * comparator both the index and the sitemap sort with, so their orders can
 * never diverge.
 *
 * @param {string} a - District code
 * @param {string} b - District code
 * @returns {number} Sort comparator result
 */
function compareCodes(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

/**
 * Sort district entries by code
 * @param {Array<{code: string}>} entries - District entries
 * @returns {Array<{code: string}>} New sorted array
 */
function sortedByCode(entries) {
    return [...entries].sort((a, b) => compareCodes(a.code, b.code));
}

/**
 * Render the index over every district page
 *
 * Grouped by state so the list is scannable at ~78 entries, with the full state
 * name as the heading and the two per-dataset counts beside each link.
 *
 * @param {Array<{code: string, terminations: number, claims: number}>} entries - District entries
 * @param {string} lastUpdated - ISO 'YYYY-MM-DD' data date
 * @returns {string} Complete HTML document
 */
export function renderDistrictsIndex(entries, lastUpdated = '') {
    const sorted = sortedByCode(entries);
    const canonical = `${SITE_BASE}/cancellations/districts/`;
    const title = 'NASA Cancellations by Congressional District | The Planetary Society';
    const description = `NASA award cancellations and DOGE claims in ${pluralCount(sorted.length, 'congressional district')}, `
        + 'one page per district, from federal award records.';

    // Insertion order follows the sorted codes, so the groups and the links
    // inside them are both deterministic without a second sort.
    const groups = new Map();
    for (const entry of sorted) {
        const state = entry.code.slice(0, 2);
        if (!groups.has(state)) groups.set(state, []);
        groups.get(state).push(entry);
    }

    const groupHtml = [...groups.entries()].map(([state, items]) => {
        const links = items.map((entry) => {
            const counts = `${pluralCount(entry.terminations, 'confirmed termination')}, `
                + pluralCount(entry.claims, 'DOGE claim');

            return `<li><a href="${escapeAttr(encodeURIComponent(entry.code))}/">${escapeHtml(entry.code)}</a> `
                + `&mdash; ${escapeHtml(counts)}</li>`;
        }).join('');

        return '<section class="district-group">'
            + `<h2 class="district-group-heading">${escapeHtml(STATE_NAMES[state] || state)}</h2>`
            + `<ul class="district-index-list">${links}</ul>`
            + '</section>';
    }).join('\n');

    const body = [
        renderNavbar(INDEX_PAGE_PATHS),
        '<main class="dashboard">',
        '<section class="district-summary-section">',
        '<div class="district-summary-header">',
        '<h1 class="district-title">NASA Cancellations by Congressional District</h1>',
        '</div>',
        `<p class="district-summary-stats">${escapeHtml(description)}</p>`,
        groupHtml,
        renderFreshness(lastUpdated),
        renderFooter(INDEX_PAGE_PATHS),
        '</section>',
        '</main>'
    ].join('\n');

    return renderDocument(
        renderHead({ title, description, canonical, paths: INDEX_PAGE_PATHS }),
        body
    );
}

/**
 * Site URLs that exist regardless of the data, in sitemap order
 *
 * `lastmod` is carried only by the cancellations pages, the only ones whose
 * content is dated by a data file. The others are edited by hand at no fixed
 * cadence, so stamping them with today's date would be a fabricated freshness
 * signal — omission is the honest answer.
 *
 * @type {Array<{path: string, priority: string, dated: boolean}>}
 */
const FIXED_URLS = [
    { path: '/', priority: '1.0', dated: false },
    { path: '/nasa-science/', priority: '0.9', dated: false },
    { path: '/cancellations/', priority: '0.9', dated: true },
    { path: '/appropriations-guide/', priority: '0.8', dated: false },
    { path: '/cancellations/districts/', priority: '0.6', dated: true }
];

/**
 * Render one `<url>` entry
 * @param {string} path - Site-root-relative path, e.g. '/cancellations/'
 * @param {string} priority - Sitemap priority
 * @param {string} lastmod - ISO date, or '' to omit the element
 * @returns {string} XML fragment
 */
function renderUrlEntry(path, priority, lastmod) {
    const lines = [
        '  <url>',
        `    <loc>${escapeHtml(SITE_BASE + path)}</loc>`
    ];

    if (lastmod) lines.push(`    <lastmod>${escapeHtml(lastmod)}</lastmod>`);
    lines.push(`    <priority>${priority}</priority>`, '  </url>');

    return lines.join('\n');
}

/**
 * Render the site sitemap
 *
 * @param {Object} options - Sitemap inputs
 * @param {Array<string>} options.districtCodes - District codes with a baked page
 * @param {string} options.lastUpdated - ISO 'YYYY-MM-DD' data date
 * @returns {string} Sitemap XML
 */
export function renderSitemap({ districtCodes = [], lastUpdated = '' }) {
    const codes = [...districtCodes].sort(compareCodes);

    const entries = [
        ...FIXED_URLS.map((url) => renderUrlEntry(url.path, url.priority, url.dated ? lastUpdated : '')),
        ...codes.map((code) =>
            renderUrlEntry(`/cancellations/districts/${encodeURIComponent(code)}/`, '0.5', lastUpdated))
    ];

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + entries.join('\n')
        + '\n</urlset>\n';
}
