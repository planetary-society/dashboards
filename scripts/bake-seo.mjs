/**
 * SEO bake — static content generation for the cancellations dashboard
 *
 * Run daily by .github/workflows/daily-dashboard-update.yml (and locally via
 * `node scripts/bake-seo.mjs`). Three outputs:
 *
 *   1. docs/cancellations/index.html — the headline facts (count sentence,
 *      disclosure note, data date, DOGE outcome lead, FY denominator) injected
 *      between `<!-- bake:* -->` marker pairs, so crawlers that never execute
 *      JavaScript still see the numbers. app.js re-renders identical strings
 *      into the same containers at load.
 *   2. docs/cancellations/districts/ — one static page per congressional
 *      district appearing in either dataset, plus an index. Deleted and
 *      rebuilt from scratch every run.
 *   3. docs/sitemap.xml — regenerated to match what step 2 actually wrote.
 *
 * Drift is the failure mode this script is designed against: every sentence
 * and number comes from the same pure modules app.js renders from
 * (panel-views, terminations, doge-claims), never from copy re-implemented
 * here. Dates come from metadata.json, never "today", so a no-change day
 * produces byte-identical output and the workflow's auto-commit no-ops.
 *
 * Any failure (missing marker, malformed metadata, unwritable file) throws:
 * the daily job must fail loudly and skip the deploy rather than publish a
 * silently degraded page.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { escapeHtml, formatCount, groupBy, parseCSV } from '../docs/shared/js/utils.js';
import { normalizeTerminations, terminationIdSet, terminationStats } from '../docs/cancellations/js/terminations.js';
import { dogeStats, normalizeDogeClaims, overlapWithTerminations } from '../docs/cancellations/js/doge-claims.js';
import { outcomeLead, panelHeadline, panelNote } from '../docs/cancellations/js/panel-views.js';
import { formatIsoDayLong } from '../docs/cancellations/js/chart-common.js';
import { injectMarker, setJsonLdDateModified } from './bake/inject.mjs';
import { SITE_TITLE, renderDistrictPage, renderDistrictsIndex, renderSitemap } from './bake/templates.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const path = (rel) => `${repoRoot}${rel}`;

const DISTRICTS_DIR = path('docs/cancellations/districts');

/** Upstream-derived text becomes a directory name only through this gate. */
const DISTRICT_CODE = /^[A-Z]{2}-\d{2}$/;

/**
 * Group rows by their `_district` code, dropping rows without one
 * @param {Array<Object>} rows - Normalized rows
 * @returns {Object<string, Array<Object>>} Code → rows
 */
function byDistrict(rows) {
    return groupBy(rows.filter((row) => row._district), '_district');
}

/**
 * List the district codes that already have a page on disk
 *
 * The degraded path (district columns gone upstream) keeps yesterday's pages
 * and builds the sitemap from them, so the sitemap can never claim a URL that
 * does not exist.
 *
 * @returns {string[]} Sorted district codes
 */
function districtsOnDisk() {
    let entries;
    try {
        entries = readdirSync(DISTRICTS_DIR, { withFileTypes: true });
    } catch {
        return [];
    }

    return entries
        .filter((e) => e.isDirectory() && DISTRICT_CODE.test(e.name))
        .map((e) => e.name)
        .sort();
}

// --- Load ---------------------------------------------------------------

const metadata = JSON.parse(readFileSync(path('docs/data/cancellations/metadata.json'), 'utf8'));
const lastUpdated = metadata.lastUpdated;
if (!/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated ?? '')) {
    throw new Error(`metadata.json lastUpdated is not an ISO date: ${lastUpdated}`);
}

const terminations = normalizeTerminations(
    parseCSV(readFileSync(path('docs/data/cancellations/terminations.csv'), 'utf8'))
);
const doge = normalizeDogeClaims(
    parseCSV(readFileSync(path('docs/data/cancellations/doge_claims.csv'), 'utf8'))
);

if (terminations.rows.length === 0 || doge.rows.length === 0) {
    throw new Error('a source CSV parsed to zero rows — refusing to bake an empty site');
}

const tStats = terminationStats(terminations.rows, terminations.columns);
const dStats = dogeStats(doge.rows);

const overlap = overlapWithTerminations(doge.rows, terminationIdSet(terminations.rows));

// --- Inject index.html ---------------------------------------------------

const indexPath = path('docs/cancellations/index.html');
let html = readFileSync(indexPath, 'utf8');

// The district pages' navbar carries SITE_TITLE; the dashboard's navbar h1 is
// hand-written HTML. A rebrand that updates one but not the other must fail
// here, not ship ~78 pages wearing the old name.
if (!html.includes(escapeHtml(SITE_TITLE))) {
    throw new Error(
        `index.html no longer contains the site title "${SITE_TITLE}" — update SITE_TITLE in scripts/bake/templates.mjs to match the page's navbar`
    );
}

html = injectMarker(html, 'headline', panelHeadline('cancellations', tStats));
html = injectMarker(html, 'panel-note', panelNote('cancellations', tStats, overlap));
html = injectMarker(html, 'last-updated', formatIsoDayLong(lastUpdated));
html = injectMarker(html, 'outcome-lead', outcomeLead(dStats));
html = injectMarker(html, 'fy-denominator', formatCount(terminations.rows.length));
html = setJsonLdDateModified(html, lastUpdated);

writeFileSync(indexPath, html);
console.log(`index.html: baked headline for ${tStats.confirmed} confirmed / ${dStats.count} claims, data date ${lastUpdated}`);

// --- District pages ------------------------------------------------------

let districtCodes;

if (!terminations.columns.districts && !doge.columns.district) {
    // District columns vanished upstream. Deleting ~78 indexed URLs over a
    // column rename is worse than serving day-old pages: keep what's on disk,
    // surface a warning, and let the sitemap follow reality. The ::warning::
    // prefix is GitHub Actions annotation syntax — noise anywhere else.
    const prefix = process.env.GITHUB_ACTIONS ? '::warning::' : 'WARNING: ';
    console.log(`${prefix}district columns missing from both datasets — keeping existing district pages`);
    districtCodes = districtsOnDisk();
} else {
    const terminationGroups = byDistrict(terminations.rows);
    const dogeGroups = byDistrict(doge.rows);

    const codes = [
        ...new Set([...Object.keys(terminationGroups), ...Object.keys(dogeGroups)])
    ].sort();
    const invalid = codes.filter((code) => !DISTRICT_CODE.test(code));
    if (invalid.length > 0) {
        throw new Error(`district codes unsafe as directory names: ${invalid.join(', ')}`);
    }

    rmSync(DISTRICTS_DIR, { recursive: true, force: true });
    mkdirSync(DISTRICTS_DIR, { recursive: true });

    const entries = [];
    for (const code of codes) {
        const terminationRows = terminationGroups[code] ?? [];
        const dogeRows = dogeGroups[code] ?? [];

        mkdirSync(`${DISTRICTS_DIR}/${code}`);
        writeFileSync(
            `${DISTRICTS_DIR}/${code}/index.html`,
            renderDistrictPage({ code, terminationRows, dogeRows, lastUpdated })
        );
        entries.push({ code, terminations: terminationRows.length, claims: dogeRows.length });
    }

    writeFileSync(`${DISTRICTS_DIR}/index.html`, renderDistrictsIndex(entries, lastUpdated));

    districtCodes = codes;
    console.log(`districts/: ${codes.length} pages + index regenerated`);
}

// --- Sitemap -------------------------------------------------------------

writeFileSync(path('docs/sitemap.xml'), renderSitemap({ districtCodes, lastUpdated }));
console.log(`sitemap.xml: ${districtCodes.length + 5} URLs`);
