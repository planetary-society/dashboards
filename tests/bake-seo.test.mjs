/**
 * SEO bake suite
 *
 * Covers the pure half of the daily bake: the marker/JSON-LD rewrites in
 * `scripts/bake/inject.mjs` and the static page builders in
 * `scripts/bake/templates.mjs`. Both are string-in/string-out, so the whole
 * pipeline is assertable without fs, a DOM, or a network.
 *
 * Two properties matter more than any single assertion and are checked
 * throughout: the bake FAILS LOUDLY when the page it edits has moved (a missing
 * marker must never degrade to a silent no-op), and it is DETERMINISTIC, so the
 * daily commit only appears when the data really changed.
 *
 * Run: node --test "tests/bake-seo.test.mjs"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { injectMarker, setJsonLdDateModified } from '../scripts/bake/inject.mjs';
import {
    SITE_BASE,
    renderDistrictPage,
    renderDistrictsIndex,
    renderSitemap
} from '../scripts/bake/templates.mjs';
import { districtOf, placeLine } from '../docs/cancellations/js/panel-common.js';
import { normalizeTerminations, overrideMeta } from '../docs/cancellations/js/terminations.js';
import { OUTCOME_META, normalizeDogeClaims } from '../docs/cancellations/js/doge-claims.js';
import { districtEmptyNote } from '../docs/cancellations/js/panel-views.js';
import { dogeClaimRow, loadCsv, terminationRow } from './fixtures.mjs';

const TERMINATIONS_PATH = 'docs/data/cancellations/terminations.csv';
const DOGE_PATH = 'docs/data/cancellations/doge_claims.csv';

/** A recipient name carrying every character escapeHtml/escapeAttr must handle */
const AWKWARD_RECIPIENT = 'O\'Brien & Sons "Rocketry"';

/**
 * A page fragment with one marker pair
 * @param {string} inner - Content between the markers
 * @returns {string} HTML fragment
 */
function page(inner) {
    return `<p><!-- bake:headline -->${inner}<!-- /bake:headline --></p>`;
}

/**
 * Render a district page from fixture rows
 * @param {Object} [options] - Overrides
 * @param {string} [options.code] - District code
 * @param {Array<Object>} [options.terminations] - Raw termination rows
 * @param {Array<Object>} [options.doge] - Raw DOGE rows
 * @returns {string} Page HTML
 */
function fixturePage({ code = 'CA-16', terminations = [], doge = [] } = {}) {
    return renderDistrictPage({
        code,
        terminationRows: normalizeTerminations(terminations).rows,
        dogeRows: normalizeDogeClaims(doge).rows,
        lastUpdated: '2026-08-20'
    });
}

/**
 * Find ampersands that are not the start of an entity
 * @param {string} html - Rendered markup
 * @returns {Array<string>} Offending snippets
 */
function bareAmpersands(html) {
    return html.match(/&(?!(?:amp|lt|gt|quot|apos|rarr|mdash|ndash|hellip|#\d+|#x[0-9a-f]+);)/gi) || [];
}

// --- injectMarker -----------------------------------------------------------

test('injectMarker replaces the content between the marker pair', () => {
    const output = injectMarker(page('old text'), 'headline', 'new text');

    assert.equal(output, page('new text'));
});

test('injectMarker leaves the markers themselves in place, so the bake can repeat', () => {
    const once = injectMarker(page(''), 'headline', '172 NASA awards terminated');
    const twice = injectMarker(once, 'headline', '172 NASA awards terminated');

    assert.ok(once.includes('<!-- bake:headline -->'));
    assert.ok(once.includes('<!-- /bake:headline -->'));
    assert.equal(twice, once);
});

test('injectMarker escapes markup characters in the injected text', () => {
    const output = injectMarker(page(''), 'headline', 'Ames & <script>alert(1)</script>');

    assert.ok(output.includes('Ames &amp; &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!output.includes('<script'));
});

test('injectMarker replaces multi-line reformatted content', () => {
    const reflowed = [
        '<span class="panel-headline">',
        '  <!-- bake:headline -->',
        '  172 NASA awards terminated since January 2025',
        '  <!-- /bake:headline -->',
        '</span>'
    ].join('\n');

    const output = injectMarker(reflowed, 'headline', 'new copy');

    assert.ok(output.includes('<!-- bake:headline -->new copy<!-- /bake:headline -->'));
    assert.ok(!output.includes('172 NASA awards'));
});

test('injectMarker tolerates extra whitespace inside the comment delimiters', () => {
    const spaced = '<p><!--  bake:headline  -->x<!--  /bake:headline  --></p>';

    assert.ok(injectMarker(spaced, 'headline', 'y').includes('y'));
});

test('injectMarker throws, naming the marker, when the pair is absent', () => {
    assert.throws(
        () => injectMarker('<p>no markers here</p>', 'panel-note', 'text'),
        /bake:panel-note/
    );
});

test('injectMarker throws when only the closing marker survives', () => {
    assert.throws(
        () => injectMarker('<p>text<!-- /bake:headline --></p>', 'headline', 'x'),
        /bake:headline/
    );
});

test('injectMarker throws when the marker pair appears twice', () => {
    assert.throws(
        () => injectMarker(page('a') + page('b'), 'headline', 'x'),
        /exactly once/
    );
});

test('injectMarker does not treat $& in the text as a replacement pattern', () => {
    const output = injectMarker(page(''), 'headline', 'cost $& rising');

    assert.ok(output.includes('cost $&amp; rising'));
});

// --- setJsonLdDateModified --------------------------------------------------

test('setJsonLdDateModified replaces only the value', () => {
    const json = '{ "name": "x", "dateModified": "2020-01-01", "url": "y" }';
    const output = setJsonLdDateModified(json, '2026-08-21');

    assert.equal(output, '{ "name": "x", "dateModified": "2026-08-21", "url": "y" }');
});

test('setJsonLdDateModified tolerates whitespace around the colon', () => {
    const json = '{\n  "dateModified"  :   "2020-01-01"\n}';

    assert.ok(setJsonLdDateModified(json, '2026-08-21').includes('"2026-08-21"'));
});

test('setJsonLdDateModified rewrites every occurrence', () => {
    const json = '{"dateModified": "2020-01-01", "d": [{"dateModified": "2019-05-05"}]}';
    const output = setJsonLdDateModified(json, '2026-08-21');

    assert.equal(output.match(/2026-08-21/g).length, 2);
    assert.ok(!output.includes('2020-01-01'));
    assert.ok(!output.includes('2019-05-05'));
});

test('setJsonLdDateModified is idempotent', () => {
    const json = '{"dateModified": "2020-01-01"}';
    const once = setJsonLdDateModified(json, '2026-08-21');

    assert.equal(setJsonLdDateModified(once, '2026-08-21'), once);
});

test('setJsonLdDateModified throws when the field is absent', () => {
    assert.throws(() => setJsonLdDateModified('{"name": "x"}', '2026-08-21'), /dateModified/);
});

test('setJsonLdDateModified throws on a malformed date', () => {
    const json = '{"dateModified": "2020-01-01"}';

    assert.throws(() => setJsonLdDateModified(json, 'August 21, 2026'), /YYYY-MM-DD/);
    assert.throws(() => setJsonLdDateModified(json, '2026-8-1'), /YYYY-MM-DD/);
    assert.throws(() => setJsonLdDateModified(json, ''), /YYYY-MM-DD/);
});

// --- renderDistrictPage -----------------------------------------------------

test('renderDistrictPage emits a canonical URL with a trailing slash', () => {
    const html = fixturePage({ terminations: [terminationRow()] });

    assert.ok(html.includes(
        `<link rel="canonical" href="${SITE_BASE}/cancellations/districts/CA-16/">`
    ));
});

test('renderDistrictPage titles the page after the district', () => {
    // The district code must appear in the title and the h1; the wording
    // around it is copy, free to change.
    const html = fixturePage({ terminations: [terminationRow()] });

    assert.match(html, /<title>[^<]*CA-16[^<]*<\/title>/);
    assert.match(html, /<h1 class="district-title">[^<]*CA-16[^<]*<\/h1>/);
});

test('renderDistrictPage links back into the interactive dashboard', () => {
    const html = fixturePage({ terminations: [terminationRow()] });

    // A visible-text anchor pointing at the district's hash route.
    assert.match(html, /<a href="\.\.\/\.\.\/#CA-16">[^<]+/);
});

test('renderDistrictPage escapes ampersands and angle brackets everywhere', () => {
    const html = fixturePage({
        code: 'CA-16',
        terminations: [terminationRow({
            recipient_name: AWKWARD_RECIPIENT,
            transaction_description: 'Termination <partial> & closeout'
        })],
        doge: [dogeClaimRow({ recipient: AWKWARD_RECIPIENT })]
    });

    assert.ok(html.includes('O\'BRIEN &amp; SONS "ROCKETRY"'));
    assert.ok(html.includes('Termination &lt;partial&gt; &amp; closeout'));
    assert.deepEqual(bareAmpersands(html), []);
});

test('renderDistrictPage shows the shared empty-state line for a dataset with no rows', () => {
    const html = fixturePage({ terminations: [terminationRow()], doge: [] });

    assert.ok(html.includes(districtEmptyNote('doge')));
    assert.ok(!html.includes(districtEmptyNote('cancellations')));
});

test('renderDistrictPage carries no JavaScript at all', () => {
    const html = fixturePage({
        terminations: [terminationRow()],
        doge: [dogeClaimRow()]
    });

    assert.ok(!html.includes('<script'));
    assert.ok(!html.includes('gridjs'));
    assert.ok(!html.includes('bootstrap-icons'));
});

test('renderDistrictPage badges a termination with the shared override label', () => {
    const html = fixturePage({ terminations: [terminationRow({ override_status: '' })] });
    const meta = overrideMeta('');

    assert.ok(html.includes(`<span class="badge ${meta.badgeClass}">${meta.label}</span>`));
});

test('renderDistrictPage links award ids to USAspending in a new tab', () => {
    const row = terminationRow({ award_id: '80NSSC25FA999', generated_award_id: 'CONT_AWD_X_8000' });
    const html = fixturePage({ terminations: [row] });

    assert.ok(html.includes(
        '<a href="https://www.usaspending.gov/award/CONT_AWD_X_8000" target="_blank" rel="noopener">80NSSC25FA999</a>'
    ));
});

test('renderDistrictPage badges a DOGE outcome like any other award', () => {
    const html = fixturePage({ doge: [dogeClaimRow({ doge_claim_date: '2025-09-18' })] });

    // The fixture claim has a termination on record, so it wears the same
    // cancelled badge a confirmed termination does.
    assert.ok(html.includes(`badge ${OUTCOME_META.terminated.badgeClass}`));
    assert.ok(html.includes('2025-09-18'));
});

test('renderDistrictPage prints the data date in long form', () => {
    const html = fixturePage({ terminations: [terminationRow()] });

    assert.ok(html.includes('Data updated August 20, 2026'));
});

test('renderDistrictPage is deterministic', () => {
    // Rows are built once: the fixture builders auto-increment their award ids,
    // so re-building them would change the input, not test the renderer.
    const rows = {
        terminations: [terminationRow({ award_id: 'A1' })],
        doge: [dogeClaimRow({ doge_award_id: 'A1' })]
    };

    assert.equal(fixturePage(rows), fixturePage(rows));
});

// --- renderDistrictsIndex ---------------------------------------------------

/** Index entries spanning three states, deliberately out of order */
const INDEX_ENTRIES = [
    { code: 'TX-22', terminations: 2, claims: 1 },
    { code: 'CA-16', terminations: 7, claims: 3 },
    { code: 'AL-05', terminations: 1, claims: 0 },
    { code: 'CA-08', terminations: 4, claims: 2 }
];

test('renderDistrictsIndex groups districts under full state names', () => {
    const html = renderDistrictsIndex(INDEX_ENTRIES, '2026-08-20');

    assert.ok(html.includes('>Alabama</h2>'));
    assert.ok(html.includes('>California</h2>'));
    assert.ok(html.includes('>Texas</h2>'));
    assert.equal(html.match(/>California</g).length, 1);
});

test('renderDistrictsIndex links each district and states both counts', () => {
    const html = renderDistrictsIndex(INDEX_ENTRIES, '2026-08-20');
    const itemFor = (code) => html.split('<li>').find((chunk) => chunk.includes(`${code}/`));

    assert.ok(html.includes('<a href="CA-16/">CA-16</a>'));
    // Each entry's list item carries both of its counts — including an
    // explicit zero — whatever the phrasing around the digits.
    assert.match(itemFor('CA-16'), /\b7\b/);
    assert.match(itemFor('CA-16'), /\b3\b/);
    assert.match(itemFor('AL-05'), /\b1\b/);
    assert.match(itemFor('AL-05'), /\b0\b/);
});

test('renderDistrictsIndex orders entries by code, not by input order', () => {
    const html = renderDistrictsIndex(INDEX_ENTRIES, '2026-08-20');
    const order = [...html.matchAll(/<a href="([A-Z]{2}-\d+)\/">/g)].map((match) => match[1]);

    assert.deepEqual(order, ['AL-05', 'CA-08', 'CA-16', 'TX-22']);
});

test('renderDistrictsIndex is deterministic and script-free', () => {
    const first = renderDistrictsIndex(INDEX_ENTRIES, '2026-08-20');
    const second = renderDistrictsIndex([...INDEX_ENTRIES].reverse(), '2026-08-20');

    assert.equal(first, second);
    assert.ok(!first.includes('<script'));
    assert.deepEqual(bareAmpersands(first), []);
});

test('renderDistrictsIndex canonical points at the districts directory', () => {
    const html = renderDistrictsIndex(INDEX_ENTRIES, '2026-08-20');

    assert.ok(html.includes(`<link rel="canonical" href="${SITE_BASE}/cancellations/districts/">`));
});

// --- renderSitemap ----------------------------------------------------------

test('renderSitemap emits the five fixed URLs plus one per district', () => {
    const codes = ['CA-16', 'TX-22', 'AL-05'];
    const xml = renderSitemap({ districtCodes: codes, lastUpdated: '2026-08-20' });

    assert.equal((xml.match(/<url>/g) || []).length, 5 + codes.length);
    assert.equal((xml.match(/<loc>/g) || []).length, 5 + codes.length);
});

test('renderSitemap dates only the cancellations URLs', () => {
    const xml = renderSitemap({ districtCodes: ['CA-16'], lastUpdated: '2026-08-20' });
    const entries = xml.split('<url>').slice(1);

    for (const entry of entries) {
        const dated = entry.includes('<lastmod>2026-08-20</lastmod>');
        const cancellations = /<loc>[^<]*\/cancellations\//.test(entry);

        assert.equal(dated, cancellations, `lastmod mismatch on entry: ${entry.trim()}`);
    }
});

test('renderSitemap keeps the fixed URLs in priority order', () => {
    const xml = renderSitemap({ districtCodes: ['CA-16'], lastUpdated: '2026-08-20' });
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    assert.deepEqual(locs.slice(0, 5), [
        `${SITE_BASE}/`,
        `${SITE_BASE}/nasa-science/`,
        `${SITE_BASE}/cancellations/`,
        `${SITE_BASE}/appropriations-guide/`,
        `${SITE_BASE}/cancellations/districts/`
    ]);
    assert.ok(xml.includes('<priority>1.0</priority>'));
    assert.ok(xml.includes('<priority>0.5</priority>'));
});

test('renderSitemap sorts district URLs and is deterministic', () => {
    const first = renderSitemap({ districtCodes: ['TX-22', 'AL-05'], lastUpdated: '2026-08-20' });
    const second = renderSitemap({ districtCodes: ['AL-05', 'TX-22'], lastUpdated: '2026-08-20' });

    assert.equal(first, second);
    assert.ok(first.indexOf('AL-05') < first.indexOf('TX-22'));
});

test('renderSitemap is well-formed and carries no unescaped ampersands', () => {
    const xml = renderSitemap({ districtCodes: ['CA-16'], lastUpdated: '2026-08-20' });

    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'));
    assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
    assert.ok(xml.trimEnd().endsWith('</urlset>'));
    assert.equal((xml.match(/<url>/g) || []).length, (xml.match(/<\/url>/g) || []).length);
    assert.deepEqual(bareAmpersands(xml), []);
});

// --- placeLine --------------------------------------------------------------

test('placeLine renders city and state uppercased', () => {
    assert.equal(placeLine({ recipient_city: 'Mountain View', recipient_state: 'ca' }), 'MOUNTAIN VIEW, CA');
});

test('placeLine drops the missing half rather than emitting a stray comma', () => {
    assert.equal(placeLine({ recipient_city: '', recipient_state: 'CA' }), 'CA');
    assert.equal(placeLine({ recipient_city: 'HOUSTON', recipient_state: '' }), 'HOUSTON');
    assert.equal(placeLine({}), '');
});

// --- live-file smoke --------------------------------------------------------

test('renderDistrictPage builds the busiest live district without throwing', () => {
    const terminations = normalizeTerminations(loadCsv(TERMINATIONS_PATH)).rows;
    const claims = normalizeDogeClaims(loadCsv(DOGE_PATH)).rows;

    const byDistrict = new Map();
    for (const row of terminations) {
        const code = row._district;
        if (code) byDistrict.set(code, (byDistrict.get(code) || 0) + 1);
    }

    assert.ok(byDistrict.size > 0, 'live terminations carry no districts');

    // Deterministic pick: most rows, ties broken by code.
    const [code] = [...byDistrict.entries()].sort(
        (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
    )[0];

    const html = renderDistrictPage({
        code,
        terminationRows: terminations.filter((row) => row._district === code),
        dogeRows: claims.filter((row) => districtOf(row) === code),
        lastUpdated: '2026-08-20'
    });

    assert.ok(html.length > 1000);
    assert.ok(html.includes(code));
    assert.ok(!html.includes('<script'));
    assert.deepEqual(bareAmpersands(html), []);
});

test('renderDistrictsIndex and renderSitemap cover every live district', () => {
    const terminations = normalizeTerminations(loadCsv(TERMINATIONS_PATH)).rows;
    const claims = normalizeDogeClaims(loadCsv(DOGE_PATH)).rows;

    const codes = new Set();
    for (const row of terminations) if (row._district) codes.add(row._district);
    for (const row of claims) {
        const code = districtOf(row);
        if (code) codes.add(code);
    }

    const entries = [...codes].map((code) => ({
        code,
        terminations: terminations.filter((row) => row._district === code).length,
        claims: claims.filter((row) => districtOf(row) === code).length
    }));

    const html = renderDistrictsIndex(entries, '2026-08-20');
    const xml = renderSitemap({ districtCodes: [...codes], lastUpdated: '2026-08-20' });

    for (const code of codes) {
        assert.ok(html.includes(`<a href="${code}/">${code}</a>`), `index missing ${code}`);
        assert.ok(xml.includes(`/cancellations/districts/${code}/`), `sitemap missing ${code}`);
    }
    assert.equal((xml.match(/<url>/g) || []).length, 5 + codes.size);
});
