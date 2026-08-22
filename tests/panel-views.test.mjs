/**
 * Panel display-copy suite
 *
 * `panel-views.js` is pure — plain objects in, strings and view-model arrays
 * out — so every editorial rule from the plan is assertable here without a DOM.
 * The stats fixtures below carry the live-file figures (172/5 confirmed,
 * 112 claims, 89/19/4 outcome mix) so a copy change that contradicts the
 * published dashboard fails loudly.
 *
 * Run: node --test "tests/panel-views.test.mjs"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PANEL_META,
    panelHeadline,
    createPanelValueBoxes,
    claimBadgeModel,
    claimCardModel,
    renderOutcomeBar,
    renderOutcomeLegend,
    renderOutcomeDefinitions
} from '../docs/cancellations/js/panel-views.js';
import {
    BAR_SEGMENTS,
    OUTCOME_META,
    OUTCOME_ORDER,
    SEGMENT_META,
    normalizeDogeClaims
} from '../docs/cancellations/js/doge-claims.js';
import { dogeClaimRow } from './fixtures.mjs';

const RAMP_CLASSES = ['seg--outcome-strong', 'seg--outcome-mid', 'seg--outcome-weak', 'seg--outcome-none'];

/**
 * Confirmed-panel stats shaped like `terminationStats` output
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Stats object
 */
function confirmedStats(overrides = {}) {
    return {
        confirmed: 172,
        partials: 5,
        totalPotential: 5_400_000_000,
        recipients: 136,
        districts: 120,
        potentialFillCount: 93,
        ...overrides
    };
}

/**
 * DOGE-panel stats shaped like `dogeStats` output
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Stats object
 */
function dogeStatsFixture(overrides = {}) {
    return {
        count: 112,
        claimedSavings: 78_600_000,
        claimedOnActive: 11_800_000,
        noFigureCount: 62,
        calculatedSavings: 16_400_000,
        calculatedSavingsCount: 71,
        terminated: 89,
        unmatched: 4,
        checkedDate: '2026-08-20',
        ...overrides
    };
}

/**
 * Full four-way outcome mix matching the live file
 * @param {Object} [overrides] - Segment counts to override
 * @returns {{terminated: number, ended: number, active: number, unmatched: number}} Mix
 */
function outcomeMixFixture(overrides = {}) {
    return { terminated: 89, ended: 11, active: 8, unmatched: 4, ...overrides };
}

/**
 * Count non-overlapping occurrences of a literal substring
 * @param {string} haystack - String to search
 * @param {string} needle - Literal substring
 * @returns {number} Occurrence count
 */
function occurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

/**
 * Pull every `style="width: N%"` value out of rendered bar HTML
 * @param {string} html - Bar markup
 * @returns {number[]} Widths as numbers
 */
function segmentWidths(html) {
    return [...html.matchAll(/style="width:\s*([\d.]+)%"/g)].map((match) => Number(match[1]));
}

/**
 * Read the bar's aria-label
 * @param {string} html - Bar markup
 * @returns {string} Label text ('' when absent)
 */
function ariaLabel(html) {
    const match = html.match(/aria-label="([^"]*)"/);
    return match ? match[1] : '';
}

/**
 * Strip tags, leaving only the text nodes
 * @param {string} html - Markup
 * @returns {string} Visible text
 */
function textOf(html) {
    return html.replace(/<[^>]*>/g, '');
}

// --- PANEL_META --------------------------------------------------------------

test('PANEL_META carries exactly the two panel ids', () => {
    assert.deepEqual(Object.keys(PANEL_META).sort(), ['cancellations', 'doge']);
});

test('PANEL_META entries are complete', () => {
    for (const [id, meta] of Object.entries(PANEL_META)) {
        // A panel must always name itself, its row unit and its download.
        for (const key of ['label', 'unitLabel', 'downloadUrl']) {
            assert.equal(typeof meta[key], 'string', `${id}.${key} should be a string`);
            assert.ok(meta[key].length > 0, `${id}.${key} should be non-empty`);
        }
        // tableHeading is optional copy: a panel whose table needs no sentence
        // above it sets '', and app.js renders an empty heading.
        assert.equal(typeof meta.tableHeading, 'string', `${id}.tableHeading should be a string`);
        assert.equal(typeof meta.hasMap, 'boolean', `${id}.hasMap should be a boolean`);
    }
});

test('PANEL_META download URLs point at the two source files', () => {
    assert.ok(PANEL_META.cancellations.downloadUrl.endsWith('terminations.csv'));
    assert.ok(PANEL_META.doge.downloadUrl.endsWith('doge_claims.csv'));
});

test("PANEL_META unit labels name each panel's row unit", () => {
    assert.equal(PANEL_META.cancellations.unitLabel, 'Awards');
    assert.equal(PANEL_META.doge.unitLabel, 'Claims');
});

test('PANEL_META gives a map to the confirmed panel only', () => {
    assert.equal(PANEL_META.cancellations.hasMap, true);
    assert.equal(PANEL_META.doge.hasMap, false);
});

test('PANEL_META labels carry no counts (counts belong in the headline)', () => {
    for (const meta of Object.values(PANEL_META)) {
        assert.doesNotMatch(meta.label, /\d/);
    }
});

// --- panelHeadline -----------------------------------------------------------

test('panelHeadline counts confirmed terminations, not confirmed plus partials', () => {
    const headline = panelHeadline('cancellations', confirmedStats());

    assert.ok(headline.includes('172'), headline);
    assert.ok(!headline.includes('177'), headline);
});

test('panelHeadline pluralizes the confirmed noun', () => {
    const one = panelHeadline('cancellations', confirmedStats({ confirmed: 1 }));
    const many = panelHeadline('cancellations', confirmedStats({ confirmed: 172 }));

    assert.match(one, /^1 /);
    assert.match(many, /^172 /);
    // Beyond the digits, the singular and plural sentences must differ —
    // that difference is the plural form of whatever the noun currently is.
    assert.notEqual(one.replace(/[\d,]+/g, ''), many.replace(/[\d,]+/g, ''));
});

test('panelHeadline thousands-separates the confirmed count', () => {
    assert.ok(panelHeadline('cancellations', confirmedStats({ confirmed: 1234 })).includes('1,234'));
});

test('panelHeadline uses stats.count on the DOGE panel', () => {
    const headline = panelHeadline('doge', dogeStatsFixture());

    assert.ok(headline.includes('112'), headline);
    assert.ok(headline.includes('DOGE'), headline);
});

test('panelHeadline pluralizes the DOGE noun', () => {
    const one = panelHeadline('doge', dogeStatsFixture({ count: 1 }));
    const many = panelHeadline('doge', dogeStatsFixture({ count: 112 }));

    assert.match(one, /^1 /);
    assert.match(many, /^112 /);
    assert.notEqual(one.replace(/[\d,]+/g, ''), many.replace(/[\d,]+/g, ''));
});

// --- createPanelValueBoxes ---------------------------------------------------

test('createPanelValueBoxes renders four confirmed boxes in order', () => {
    const boxes = createPanelValueBoxes('cancellations', confirmedStats());

    // Boxes are identified by their values, not their titles — the title
    // wording is copy, free to change without touching this suite.
    assert.equal(boxes.length, 4);
    assert.equal(boxes[0].value, '172');
    assert.equal(boxes[1].value, '$5.4B');
    assert.equal(boxes[2].value, '136');
    assert.equal(boxes[3].value, '120');
});

test('createPanelValueBoxes never gives obligations a box of their own', () => {
    // The potential total already contains them, so a second money box would
    // invite a reader to add two overlapping figures together.
    const boxes = createPanelValueBoxes('cancellations', confirmedStats());

    assert.ok(!boxes.some((box) => /obligat/i.test(box.title)), boxes.map((b) => b.title).join(' | '));
});

test('createPanelValueBoxes omits each optional box independently', () => {
    assert.equal(createPanelValueBoxes('cancellations', confirmedStats({ totalPotential: null })).length, 3);
    assert.equal(createPanelValueBoxes('cancellations', confirmedStats({ recipients: null })).length, 3);
    assert.equal(createPanelValueBoxes('cancellations', confirmedStats({ districts: null })).length, 3);
});

test('createPanelValueBoxes always keeps the count box first', () => {
    const stats = confirmedStats({ totalPotential: null, recipients: null, districts: null });
    const boxes = createPanelValueBoxes('cancellations', stats);

    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].value, '172');
});

test('createPanelValueBoxes never renders an N/A tile for missing confirmed data', () => {
    const boxes = createPanelValueBoxes('cancellations', confirmedStats({ totalPotential: null, districts: null }));

    assert.ok(boxes.every((box) => box.value !== 'N/A' && box.value !== '—'));
});

test('createPanelValueBoxes renders all four DOGE boxes in order', () => {
    const boxes = createPanelValueBoxes('doge', dogeStatsFixture());

    assert.equal(boxes.length, 4);
    assert.equal(boxes[0].value, '112');
    assert.equal(boxes[1].value, '$78.6M');
    assert.equal(boxes[2].value, '89');
    assert.equal(boxes[3].value, '$16.4M');
});

test('createPanelValueBoxes keeps the DOGE row at four boxes even at zero', () => {
    const stats = dogeStatsFixture({ claimedSavings: 0, terminated: 0, unmatched: 0 });
    const boxes = createPanelValueBoxes('doge', stats);

    assert.equal(boxes.length, 4);
    assert.equal(boxes[1].value, '$0');
});

test('createPanelValueBoxes gives every box a title, value, icon and type', () => {
    const boxes = [
        ...createPanelValueBoxes('cancellations', confirmedStats()),
        ...createPanelValueBoxes('doge', dogeStatsFixture())
    ];

    for (const box of boxes) {
        for (const key of ['title', 'value', 'icon', 'type']) {
            assert.equal(typeof box[key], 'string', `${box.title}.${key}`);
            assert.ok(box[key].length > 0, `${box.title}.${key} should be non-empty`);
        }
    }
});

test('createPanelValueBoxes uses a distinct type per box so the tint scale reads', () => {
    for (const panelId of ['cancellations', 'doge']) {
        const stats = panelId === 'doge' ? dogeStatsFixture() : confirmedStats();
        const types = createPanelValueBoxes(panelId, stats).map((box) => box.type);
        assert.equal(new Set(types).size, types.length, panelId);
    }
});

// --- DOGE box notes ----------------------------------------------------------

/**
 * The note on one DOGE box, found by a word in its title
 * Boxes are found by their rendered value, not their title — the titles are
 * copy, free to be reworded without touching this suite.
 *
 * @param {string} value - The box's formatted value, e.g. '$78.6M'
 * @param {Object} [overrides] - Stats overrides that leave that value unchanged
 * @returns {string|undefined} That box's note
 */
function dogeNoteFor(value, overrides = {}) {
    return createPanelValueBoxes('doge', dogeStatsFixture(overrides))
        .find((box) => box.value === value)?.note;
}

// Each optional clause is identified by the figure only it carries
// ($11.8M for the active-award caveat, 62 for the no-figure count), so the
// prose around those figures can be reworded freely.
test('the claimed-savings total never stands alone', () => {
    const note = dogeNoteFor('$78.6M');

    assert.ok(note.includes('$11.8M'), note);
    assert.ok(note.includes('62'), note);
    assert.ok(note.includes('112'), note);
});

test('the claimed-savings note drops the active-award clause when nothing sits on active awards', () => {
    const note = dogeNoteFor('$78.6M', { claimedOnActive: 0 });

    assert.ok(!note.includes('$11.8M'), note);
    assert.ok(note.includes('62'), note);
});

test('the claimed-savings note drops the no-figure clause when every claim carries a figure', () => {
    const note = dogeNoteFor('$78.6M', { noFigureCount: 0 });

    assert.ok(!note.includes('62'), note);
    assert.ok(note.length > 0, 'the standing caveat should remain');
});

test('the claimed-savings caveat survives even with nothing else to say', () => {
    const note = dogeNoteFor('$78.6M', { claimedOnActive: 0, noFigureCount: 0 });

    assert.ok(note.length > 0, 'the caveat must never disappear entirely');
});

test('the calculated-savings note says how it is derived and how many claims it covers', () => {
    const note = dogeNoteFor('$16.4M');

    // Named by what it subtracts, not by a sentence this suite pins
    assert.match(note, /ceiling/i, note);
    assert.match(note, /obligat/i, note);
    assert.ok(note.includes('71'), note);
    assert.ok(note.includes('112'), note);
});

test('the potential-value note discloses its two bases, and counts awards only when coverage is short', () => {
    // The total is contract ceilings where a ceiling exists and obligations
    // where none does — a reader must never have to guess which. The coverage
    // clause is the conditional half: it appears only when an award reported
    // neither figure.
    const cases = [
        { potentialFillCount: 93, expectsCoverage: true },
        { potentialFillCount: 172, expectsCoverage: false }
    ];

    for (const { potentialFillCount, expectsCoverage } of cases) {
        const boxes = createPanelValueBoxes('cancellations', confirmedStats({ potentialFillCount }));
        const noted = boxes.filter((box) => box.note);

        assert.equal(noted.length, 1, `one box carries a note at fill ${potentialFillCount}`);
        assert.match(noted[0].title, /potential/i);
        assert.match(noted[0].note, /grant/i, noted[0].note);
        assert.match(noted[0].note, /ceiling/i, noted[0].note);

        if (expectsCoverage) {
            // Denominator is the confirmed count — the same universe the box
            // sums — never the full row count.
            assert.ok(noted[0].note.includes('93'), noted[0].note);
            assert.ok(noted[0].note.includes('172'), noted[0].note);
            assert.ok(!noted[0].note.includes('177'), noted[0].note);
        } else {
            assert.doesNotMatch(noted[0].note, /\d/, `full coverage still counted awards: ${noted[0].note}`);
        }
    }
});

// --- claimBadgeModel ---------------------------------------------------------

/**
 * Normalize one DOGE fixture row
 * @param {Object} [overrides] - Raw column overrides
 * @returns {Object} Normalized row
 */
function claimRow(overrides = {}) {
    return normalizeDogeClaims([dogeClaimRow(overrides)]).rows[0];
}

test('claimBadgeModel labels a claim on the same rubric the bar segments by', () => {
    // The table badge and the chart segment must name the same four states —
    // not two vocabularies for one classification.
    for (const outcome of OUTCOME_ORDER) {
        const badge = claimBadgeModel({ _outcome: outcome });

        assert.equal(badge.label, OUTCOME_META[outcome].short, outcome);
        assert.ok(badge.className.includes(OUTCOME_META[outcome].badgeClass), outcome);
        assert.ok(SEGMENT_META[outcome], `${outcome} is also a bar segment`);
    }
});

test('claimBadgeModel follows the federal record, not the label DOGE published', () => {
    // DOGE said "Expired"; the record carries an explicit termination.
    const disagreeing = claimRow({ doge_status: 'Expired', has_explicit_termination: 'true' });

    assert.equal(disagreeing._outcome, 'terminated');
    assert.equal(claimBadgeModel(disagreeing).label, OUTCOME_META.terminated.short);
    // DOGE's own wording survives on the row for the card to show
    assert.equal(disagreeing._statusLabel, 'Expired');
});

test('claimBadgeModel separates an award that ran out from one still running', () => {
    const expired = claimRow({ has_explicit_termination: 'false', current_end_date: '2025-01-01' });
    const stillActive = claimRow({ has_explicit_termination: 'false', current_end_date: '2030-01-01' });

    assert.equal(claimBadgeModel(expired).label, OUTCOME_META.ended.short);
    assert.equal(claimBadgeModel(stillActive).label, OUTCOME_META.active.short);
    assert.notEqual(claimBadgeModel(expired).label, claimBadgeModel(stillActive).label);
});

test('a claim card wears the same badge the table gives it', () => {
    const row = claimRow({ has_explicit_termination: 'false', current_end_date: '2025-01-01' });

    assert.deepEqual(claimCardModel(row).badge, claimBadgeModel(row));
});

test('claimBadgeModel degrades to a neutral badge for an unclassified row', () => {
    const badge = claimBadgeModel({});

    assert.ok(badge.label.length > 0);
    assert.match(badge.className, /badge/);
});

// --- renderOutcomeBar --------------------------------------------------------

test('renderOutcomeBar draws one segment per non-zero outcome', () => {
    const html = renderOutcomeBar(outcomeMixFixture());

    assert.equal(occurrences(html, 'seg-bar__segment'), BAR_SEGMENTS.length);
});

test('renderOutcomeBar drops zero-count segments from the bar', () => {
    const html = renderOutcomeBar(outcomeMixFixture({ unmatched: 0 }));

    assert.equal(occurrences(html, 'seg-bar__segment'), BAR_SEGMENTS.length - 1);
    assert.ok(!html.includes(SEGMENT_META.unmatched.segClass), html);
});

test('renderOutcomeBar segment widths sum to 100 percent', () => {
    for (const mix of [outcomeMixFixture(), outcomeMixFixture({ unmatched: 0 }), { ...Object.fromEntries(BAR_SEGMENTS.map((segment) => [segment, 0])), terminated: 1 }]) {
        const widths = segmentWidths(renderOutcomeBar(mix));
        const total = widths.reduce((sum, width) => sum + width, 0);
        assert.ok(Math.abs(total - 100) < 0.05, `widths ${widths.join('/')} summed to ${total}`);
    }
});

test('renderOutcomeBar sizes segments in proportion to their counts', () => {
    const widths = segmentWidths(renderOutcomeBar({ terminated: 75, ended: 15, active: 5, unmatched: 5 }));

    assert.deepEqual(widths, [75, 15, 5, 5]);
});

test('renderOutcomeBar exposes the whole mix to assistive tech', () => {
    const label = ariaLabel(renderOutcomeBar(outcomeMixFixture()));

    for (const key of BAR_SEGMENTS) {
        assert.ok(label.includes(`${SEGMENT_META[key].label}: `), `${key} missing from ${label}`);
    }
    assert.ok(label.includes('89'), label);
    assert.ok(label.includes('11'), label);
    assert.ok(label.includes('8'), label);
    assert.ok(label.includes('4'), label);
});

test('renderOutcomeBar names zero-count outcomes in its aria-label even when undrawn', () => {
    const label = ariaLabel(renderOutcomeBar(outcomeMixFixture({ unmatched: 0 })));

    assert.ok(label.includes(`${SEGMENT_META.unmatched.label}: 0`), label);
});

test('renderOutcomeBar marks the bar as an image, not decoration', () => {
    assert.ok(renderOutcomeBar(outcomeMixFixture()).includes('role="img"'));
});

test('renderOutcomeBar renders nothing for an empty mix', () => {
    assert.equal(renderOutcomeBar(Object.fromEntries(BAR_SEGMENTS.map((segment) => [segment, 0]))), '');
});

// --- renderOutcomeLegend -----------------------------------------------------

test('renderOutcomeLegend lists every segment with its label and count', () => {
    const html = renderOutcomeLegend(outcomeMixFixture());

    assert.equal(occurrences(html, 'seg-legend-item'), BAR_SEGMENTS.length);
    for (const key of BAR_SEGMENTS) {
        assert.ok(html.includes(SEGMENT_META[key].label), key);
        assert.ok(html.includes(SEGMENT_META[key].segClass), key);
    }
    const mix = outcomeMixFixture();
    for (const key of BAR_SEGMENTS) {
        assert.ok(html.includes(`>${mix[key]}<`), `${key} count missing from ${html}`);
    }
});

test('renderOutcomeLegend keeps a zero segment visible and marks it zero', () => {
    const html = renderOutcomeLegend(outcomeMixFixture({ unmatched: 0 }));

    assert.equal(occurrences(html, 'seg-legend-item"'), BAR_SEGMENTS.length - 1);
    assert.equal(occurrences(html, 'seg-legend-item--zero'), 1);
    assert.ok(html.includes(SEGMENT_META.unmatched.label), html);
    assert.ok(html.includes('>0<'), html);
});

test('renderOutcomeLegend marks nothing zero when every segment has a count', () => {
    assert.equal(occurrences(renderOutcomeLegend(outcomeMixFixture()), 'seg-legend-item--zero'), 0);
});

test('renderOutcomeLegend still renders for an all-zero mix', () => {
    const html = renderOutcomeLegend(Object.fromEntries(BAR_SEGMENTS.map((segment) => [segment, 0])));

    assert.equal(occurrences(html, 'seg-legend-item--zero'), BAR_SEGMENTS.length);
});

test('renderOutcomeLegend thousands-separates its counts', () => {
    assert.ok(renderOutcomeLegend({ ...Object.fromEntries(BAR_SEGMENTS.map((segment) => [segment, 0])), terminated: 1234 }).includes('1,234'));
});

// --- renderOutcomeDefinitions ------------------------------------------------

test('renderOutcomeDefinitions prints one visible definition per segment', () => {
    const html = renderOutcomeDefinitions();

    assert.equal(occurrences(html, '<li>'), BAR_SEGMENTS.length);
    assert.equal(occurrences(html, '</li>'), BAR_SEGMENTS.length);
    for (const key of BAR_SEGMENTS) {
        assert.ok(html.includes(SEGMENT_META[key].label), `${key} label`);
        assert.ok(html.includes(SEGMENT_META[key].description), `${key} description`);
    }
});

test('renderOutcomeDefinitions pairs each term with its own description', () => {
    const items = renderOutcomeDefinitions().match(/<li>[\s\S]*?<\/li>/g);

    assert.equal(items.length, BAR_SEGMENTS.length);
    items.forEach((item, index) => {
        const key = BAR_SEGMENTS[index];
        assert.ok(item.includes(`>${SEGMENT_META[key].label}<`), item);
        assert.ok(item.includes(SEGMENT_META[key].description), item);
    });
});

test('renderOutcomeDefinitions carries the definitions as text, not tooltips', () => {
    const html = renderOutcomeDefinitions();

    assert.ok(!html.includes('title='), html);
    assert.ok(textOf(html).includes(SEGMENT_META.ended.description));
});

test('renderOutcomeDefinitions emits no unescaped markup in its text nodes', () => {
    const text = textOf(renderOutcomeDefinitions());

    assert.ok(!text.includes('<'), text);
    assert.ok(!text.includes('>'), text);
});

test('renderOutcomeLegend emits no unescaped markup in its text nodes', () => {
    const text = textOf(renderOutcomeLegend(outcomeMixFixture()));

    assert.ok(!text.includes('<'), text);
    assert.ok(!text.includes('>'), text);
});

// --- the validated red ordinal ramp ------------------------------------------

test('the three ramp classes are exactly the ones SEGMENT_META assigns', () => {
    assert.deepEqual(
        BAR_SEGMENTS.map((key) => SEGMENT_META[key].segClass),
        RAMP_CLASSES
    );
});

test('bar and legend both carry all three ramp classes for a full mix', () => {
    const mix = outcomeMixFixture();

    for (const html of [renderOutcomeBar(mix), renderOutcomeLegend(mix)]) {
        for (const cls of RAMP_CLASSES) {
            assert.ok(html.includes(cls), `${cls} missing from ${html}`);
        }
    }
});

test('the legend keeps the ramp class of a segment the bar dropped', () => {
    const mix = outcomeMixFixture({ unmatched: 0 });

    assert.ok(!renderOutcomeBar(mix).includes(SEGMENT_META.unmatched.segClass));
    assert.ok(renderOutcomeLegend(mix).includes(SEGMENT_META.unmatched.segClass));
});
