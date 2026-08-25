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
import { injectMarker, setJsonLdDateModified, setMetaDescription } from '../scripts/bake/inject.mjs';
import {
    SITE_BASE,
    renderDistrictPage,
    renderDistrictsIndex,
    renderSitemap
} from '../scripts/bake/templates.mjs';
import { districtOf, placeLine } from '../docs/cancellations/js/panel-common.js';
import { normalizeTerminations, overrideMeta } from '../docs/cancellations/js/terminations.js';
import { OUTCOME_META, normalizeDogeClaims } from '../docs/cancellations/js/doge-claims.js';
import { districtEmptyNote, metaDescription } from '../docs/cancellations/js/panel-views.js';
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
    // Prettier reflows the deployed page, so a marker pair can land on its own
    // lines with the old text indented between them.
    const reflowed = [
        '<span class="freshness-bar">',
        '  <!-- bake:last-updated -->',
        '  August 20, 2026',
        '  <!-- /bake:last-updated -->',
        '</span>'
    ].join('\n');

    const output = injectMarker(reflowed, 'last-updated', 'new copy');

    assert.ok(output.includes('<!-- bake:last-updated -->new copy<!-- /bake:last-updated -->'));
    assert.ok(!output.includes('August 20, 2026'));
});

test('injectMarker tolerates extra whitespace inside the comment delimiters', () => {
    const spaced = '<p><!--  bake:headline  -->x<!--  /bake:headline  --></p>';

    assert.ok(injectMarker(spaced, 'headline', 'y').includes('y'));
});

test('injectMarker throws, naming the marker, when the pair is absent', () => {
    assert.throws(
        () => injectMarker('<p>no markers here</p>', 'missing-marker', 'text'),
        /bake:missing-marker/
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

// --- setMetaDescription ------------------------------------------------------

/** The three description tags, as the deployed page writes them */
const DESCRIPTION_HEAD = [
    '<meta name="description" content="old copy" />',
    '<meta property="og:description" content="old copy" />',
    '<meta name="twitter:description" content="old copy" />'
].join('\n');

/**
 * Every content attribute value in a fragment
 * @param {string} html - Markup
 * @returns {string[]} Attribute values
 */
function contentValues(html) {
    return [...html.matchAll(/content="([^"]*)"/g)].map((match) => match[1]);
}

test('setMetaDescription rewrites all three description tags together', () => {
    const output = setMetaDescription(DESCRIPTION_HEAD, '172 awards terminated');

    assert.deepEqual(contentValues(output), [
        '172 awards terminated',
        '172 awards terminated',
        '172 awards terminated'
    ]);
});

test('setMetaDescription leaves the identifying attributes untouched', () => {
    const output = setMetaDescription(DESCRIPTION_HEAD, 'new copy');

    assert.ok(output.includes('name="description"'));
    assert.ok(output.includes('property="og:description"'));
    assert.ok(output.includes('name="twitter:description"'));
});

test('setMetaDescription is idempotent', () => {
    const once = setMetaDescription(DESCRIPTION_HEAD, 'same copy');

    assert.equal(setMetaDescription(once, 'same copy'), once);
});

test('setMetaDescription survives prettier wrapping the attributes across lines', () => {
    const reflowed = [
        '<meta',
        '  name="description"',
        '  content="old copy"',
        '/>',
        '<meta property="og:description" content="old copy" />',
        '<meta name="twitter:description" content="old copy" />'
    ].join('\n');

    const output = setMetaDescription(reflowed, 'new copy');

    assert.deepEqual(contentValues(output), ['new copy', 'new copy', 'new copy']);
});

test('setMetaDescription escapes a value that would otherwise close the tag', () => {
    const output = setMetaDescription(DESCRIPTION_HEAD, 'DOGE\'s "savings" > $1B & rising');

    assert.ok(!output.includes('"savings"'), output);
    assert.ok(output.includes('&quot;savings&quot;'), output);
    assert.ok(output.includes('&gt;'), output);
    // Still exactly three tags — nothing was closed early
    assert.equal(contentValues(output).length, 3);
});

test('setMetaDescription does not treat $& in the text as a replacement pattern', () => {
    const output = setMetaDescription(DESCRIPTION_HEAD, 'cost $& rising');

    assert.ok(output.includes('cost $&amp; rising'));
});

test('setMetaDescription throws, naming the tag, when one is missing', () => {
    const missingTwitter = [
        '<meta name="description" content="x" />',
        '<meta property="og:description" content="x" />'
    ].join('\n');

    assert.throws(() => setMetaDescription(missingTwitter, 'y'), /twitter:description/);
    assert.throws(() => setMetaDescription('<p>nothing here</p>', 'y'), /name="description"/);
});

test('setMetaDescription throws when a description tag is duplicated', () => {
    const doubled = `${DESCRIPTION_HEAD}\n<meta name="description" content="again" />`;

    assert.throws(() => setMetaDescription(doubled, 'y'), /exactly once/);
});

test('setMetaDescription throws when the tag carries no content attribute', () => {
    const contentless = [
        '<meta name="description" />',
        '<meta property="og:description" content="x" />',
        '<meta name="twitter:description" content="x" />'
    ].join('\n');

    assert.throws(() => setMetaDescription(contentless, 'y'), /content attribute/);
});

// --- metaDescription ---------------------------------------------------------

/**
 * Stats pair shaped like the bake's inputs
 * @param {Object} [terminations] - terminationStats overrides
 * @param {Object} [claims] - dogeStats overrides
 * @returns {string} Description sentence
 */
function description(terminations = {}, claims = {}) {
    return metaDescription(
        { confirmed: 172, totalPotential: 2_871_000_000, districts: 76, ...terminations },
        { count: 112, ...claims }
    );
}

test('metaDescription leads with the counts a crawler cannot get from the page', () => {
    const text = description();

    assert.ok(text.startsWith('172'), text);
    assert.ok(text.includes('$2.9B'), text);
    assert.ok(text.includes('76'), text);
    assert.ok(text.includes('112'), text);
});

test('metaDescription stays inside the length a search result will show', () => {
    // Past ~160 characters the tail is truncated mid-clause, which reads worse
    // than a shorter sentence. Checked at implausibly large figures too, since
    // digits are the part that grows with the data.
    for (const text of [description(), description({ confirmed: 12_345, districts: 435 }, { count: 9_999 })]) {
        assert.ok(text.length <= 160, `${text.length} chars: ${text}`);
    }
});

test('metaDescription drops the dollar clause rather than inventing a figure', () => {
    const text = description({ totalPotential: null, districts: null });

    assert.ok(text.startsWith('172'), text);
    assert.ok(text.includes('112'), text);
    assert.ok(!text.includes('$'), text);
    assert.ok(!/\bnull\b|NaN|undefined/.test(text), text);
});

test('metaDescription pluralizes rather than printing a bare "1 districts"', () => {
    const text = description({ confirmed: 1, districts: 1 }, { count: 1 });

    assert.ok(!/\b1 districts\b/.test(text), text);
    assert.ok(!/\b1 claims\b/.test(text), text);
    assert.ok(!/\b1 awards\b/.test(text), text);
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

test('renderDistrictsIndex is deterministic', () => {
    const first = renderDistrictsIndex(INDEX_ENTRIES, '2026-08-20');
    const second = renderDistrictsIndex([...INDEX_ENTRIES].reverse(), '2026-08-20');

    assert.equal(first, second);
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
    assert.equal(placeLine({ pop_city: 'Mountain View', pop_state: 'ca' }), 'MOUNTAIN VIEW, CA');
});

test('placeLine prefers place of performance over the recipient address', () => {
    const row = {
        pop_city: 'Huntsville',
        pop_state: 'AL',
        recipient_city: 'Mountain View',
        recipient_state: 'CA'
    };

    assert.equal(placeLine(row), 'HUNTSVILLE, AL');
});

test('placeLine falls back to the recipient address when no place of performance is given', () => {
    const row = { pop_city: '', pop_state: '', recipient_city: 'Houston', recipient_state: 'TX' };

    assert.equal(placeLine(row), 'HOUSTON, TX');
});

test('placeLine never pairs a city from one address with a state from the other', () => {
    // A pop state with no pop city keeps the state alone; borrowing the
    // recipient's city could place it in a state it does not sit in.
    const row = { pop_city: '', pop_state: 'VA', recipient_city: 'Houston', recipient_state: 'TX' };

    assert.equal(placeLine(row), 'VA');
});

test('placeLine drops the missing half rather than emitting a stray comma', () => {
    assert.equal(placeLine({ pop_city: '', pop_state: 'CA' }), 'CA');
    assert.equal(placeLine({ pop_city: 'HOUSTON', pop_state: '' }), 'HOUSTON');
    assert.equal(placeLine({}), '');
    assert.equal(placeLine(undefined), '');
});

// --- live-file smoke --------------------------------------------------------
//
// Both files are read and normalized once for the whole suite, and each row's
// district is resolved once into `byDistrict` — the same single grouping pass
// the bake itself makes, rather than a filter per district code.

const liveTerminations = normalizeTerminations(loadCsv(TERMINATIONS_PATH)).rows;
const liveClaims = normalizeDogeClaims(loadCsv(DOGE_PATH)).rows;

/** District code → {terminations, claims} rows, built in one pass over each file */
const byDistrict = new Map();

/**
 * Add a row to its district's bucket
 * @param {string} code - District code, or '' to skip the row
 * @param {'terminations'|'claims'} key - Which list the row belongs to
 * @param {Object} row - Normalized row
 */
function bucket(code, key, row) {
    if (!code) return;
    if (!byDistrict.has(code)) byDistrict.set(code, { terminations: [], claims: [] });
    byDistrict.get(code)[key].push(row);
}

for (const row of liveTerminations) bucket(row._district, 'terminations', row);
for (const row of liveClaims) bucket(districtOf(row), 'claims', row);

test('renderDistrictPage builds the busiest live district without throwing', () => {
    assert.ok(byDistrict.size > 0, 'live files carry no districts');

    // Deterministic pick: most termination rows, ties broken by code.
    const [code, rows] = [...byDistrict.entries()].sort(
        (a, b) => b[1].terminations.length - a[1].terminations.length || (a[0] < b[0] ? -1 : 1)
    )[0];

    const html = renderDistrictPage({
        code,
        terminationRows: rows.terminations,
        dogeRows: rows.claims,
        lastUpdated: '2026-08-20'
    });

    assert.ok(html.length > 1000);
    assert.ok(html.includes(code));
    assert.deepEqual(bareAmpersands(html), []);
});

test('renderDistrictsIndex and renderSitemap cover every live district', () => {
    const codes = new Set(byDistrict.keys());

    const entries = [...byDistrict].map(([code, rows]) => ({
        code,
        terminations: rows.terminations.length,
        claims: rows.claims.length
    }));

    const html = renderDistrictsIndex(entries, '2026-08-20');
    const xml = renderSitemap({ districtCodes: [...codes], lastUpdated: '2026-08-20' });

    for (const code of codes) {
        assert.ok(html.includes(`<a href="${code}/">${code}</a>`), `index missing ${code}`);
        assert.ok(xml.includes(`/cancellations/districts/${code}/`), `sitemap missing ${code}`);
    }
    assert.equal((xml.match(/<url>/g) || []).length, 5 + codes.size);
});
