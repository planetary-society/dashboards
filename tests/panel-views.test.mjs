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
    panelNote,
    createPanelValueBoxes,
    valueBoxNote,
    renderOutcomeBar,
    renderOutcomeLegend,
    renderOutcomeDefinitions
} from '../docs/cancellations/js/panel-views.js';
import { BAR_SEGMENTS, SEGMENT_META } from '../docs/cancellations/js/doge-claims.js';

const RAMP_CLASSES = ['seg--outcome-strong', 'seg--outcome-mid', 'seg--outcome-weak'];

/**
 * Confirmed-panel stats shaped like `terminationStats` output
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Stats object
 */
function confirmedStats(overrides = {}) {
    return {
        confirmed: 172,
        partials: 5,
        descoped: 3,
        closedOut: 2,
        totalObligated: 2_000_000_000,
        totalPotential: 5_400_000_000,
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
        terminated: 89,
        unmatched: 4,
        checkedDate: '2026-08-20',
        ...overrides
    };
}

/**
 * Full three-way outcome mix matching the live file
 * @param {Object} [overrides] - Segment counts to override
 * @returns {{terminated: number, noTermination: number, unmatched: number}} Mix
 */
function outcomeMixFixture(overrides = {}) {
    return { terminated: 89, noTermination: 19, unmatched: 4, ...overrides };
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
        for (const key of ['label', 'unitLabel', 'downloadUrl', 'tableHeading']) {
            assert.equal(typeof meta[key], 'string', `${id}.${key} should be a string`);
            assert.ok(meta[key].length > 0, `${id}.${key} should be non-empty`);
        }
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
    assert.match(panelHeadline('cancellations', confirmedStats({ confirmed: 1 })), /^1 NASA award\b/);
    assert.match(panelHeadline('cancellations', confirmedStats({ confirmed: 172 })), /^172 NASA awards\b/);
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
    assert.match(panelHeadline('doge', dogeStatsFixture({ count: 1 })), /^1 cancellation claim\b/);
    assert.match(panelHeadline('doge', dogeStatsFixture({ count: 112 })), /^112 cancellation claims\b/);
});

// --- panelNote ---------------------------------------------------------------

test('panelNote discloses the partial-action split on the confirmed panel', () => {
    const note = panelNote('cancellations', confirmedStats());

    assert.ok(note.includes('5 partial actions'), note);
    assert.ok(note.includes('3 descoped'), note);
    assert.ok(note.includes('2 closed out'), note);
    assert.ok(note.includes('excluded from the totals'), note);
});

test('panelNote singularizes a lone partial action and drops absent kinds', () => {
    const note = panelNote('cancellations', confirmedStats({ partials: 1, descoped: 1, closedOut: 0 }));

    assert.ok(note.includes('1 partial action (1 descoped)'), note);
    assert.ok(!note.includes('closed out'), note);
});

test('panelNote breakdown is data-driven, never a hardcoded split', () => {
    const note = panelNote('cancellations', confirmedStats({ partials: 7, descoped: 6, closedOut: 1 }));

    assert.ok(note.includes('7 partial actions (6 descoped, 1 closed out)'), note);
});

test('panelNote says nothing on the confirmed panel when there are no partials', () => {
    assert.equal(panelNote('cancellations', confirmedStats({ partials: 0 })), '');
});

test('panelNote states the overlap and the never-sum warning on the DOGE panel', () => {
    const note = panelNote('doge', dogeStatsFixture(), 88);

    assert.ok(note.includes('88'), note);
    assert.ok(note.includes('112'), note);
    assert.ok(note.includes('must not be added together'), note);
});

test('panelNote keeps the historical framing alongside the overlap', () => {
    const note = panelNote('doge', dogeStatsFixture(), 88);

    assert.ok(note.includes('DOGE is no longer active'), note);
    assert.ok(note.includes('historical record'), note);
});

test('panelNote reports a zero overlap rather than hiding it', () => {
    const note = panelNote('doge', dogeStatsFixture(), 0);

    assert.ok(note.includes('must not be added together'), note);
    assert.match(note, /^0 of these 112 claims/, note);
});

test('panelNote drops only the overlap sentence when the overlap is unknown', () => {
    const note = panelNote('doge', dogeStatsFixture());

    assert.ok(!note.includes('must not be added together'), note);
    assert.ok(note.includes('DOGE is no longer active'), note);
});

test('panelNote drops the overlap sentence for a non-finite overlap', () => {
    for (const overlap of [null, NaN, undefined, 'many']) {
        const note = panelNote('doge', dogeStatsFixture(), { overlap });
        assert.ok(!note.includes('also appear under Confirmed Cancellations'), String(overlap));
    }
});

test('panelNote tolerates a missing extras argument', () => {
    assert.equal(panelNote('doge', dogeStatsFixture()), panelNote('doge', dogeStatsFixture(), {}));
});

// --- createPanelValueBoxes ---------------------------------------------------

test('createPanelValueBoxes renders four confirmed boxes in order', () => {
    const boxes = createPanelValueBoxes('cancellations', confirmedStats());

    assert.equal(boxes.length, 4);
    assert.deepEqual(
        boxes.map((box) => box.title),
        [
            'Awards terminated',
            'Obligated to terminated awards',
            'Total potential value',
            'Congressional districts affected'
        ]
    );
    assert.equal(boxes[0].value, '172');
    assert.equal(boxes[1].value, '$2.0B');
    assert.equal(boxes[3].value, '120');
});

test('createPanelValueBoxes omits the obligated box when its data is missing', () => {
    const boxes = createPanelValueBoxes('cancellations', confirmedStats({ totalObligated: null }));

    assert.equal(boxes.length, 3);
    assert.equal(boxes[0].title, 'Awards terminated');
    assert.ok(!boxes.some((box) => box.title === 'Obligated to terminated awards'));
});

test('createPanelValueBoxes omits each optional box independently', () => {
    assert.equal(createPanelValueBoxes('cancellations', confirmedStats({ totalPotential: null })).length, 3);
    assert.equal(createPanelValueBoxes('cancellations', confirmedStats({ districts: null })).length, 3);
});

test('createPanelValueBoxes always keeps the count box first', () => {
    const stats = confirmedStats({ totalObligated: null, totalPotential: null, districts: null });
    const boxes = createPanelValueBoxes('cancellations', stats);

    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].title, 'Awards terminated');
});

test('createPanelValueBoxes never renders an N/A tile for missing confirmed data', () => {
    const boxes = createPanelValueBoxes('cancellations', confirmedStats({ totalObligated: null, districts: null }));

    assert.ok(boxes.every((box) => box.value !== 'N/A' && box.value !== '—'));
});

test('createPanelValueBoxes renders all four DOGE boxes with the record-first wording', () => {
    const boxes = createPanelValueBoxes('doge', dogeStatsFixture());

    assert.equal(boxes.length, 4);
    assert.deepEqual(
        boxes.map((box) => box.title),
        [
            'Claims made',
            'Savings claimed by DOGE',
            'Terminations found in federal records',
            'Not found in federal records'
        ]
    );
    assert.equal(boxes[0].value, '112');
    assert.equal(boxes[1].value, '$78.6M');
    assert.equal(boxes[2].value, '89');
    assert.equal(boxes[3].value, '4');
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

// --- valueBoxNote ------------------------------------------------------------

test('valueBoxNote never lets the DOGE savings total stand alone', () => {
    const note = valueBoxNote('doge', dogeStatsFixture());

    assert.ok(note.includes('$11.8M'), note);
    assert.ok(note.includes('remain active'), note);
    assert.ok(note.includes('62 of 112 claims list no savings figure'), note);
    assert.ok(note.includes('DOGE’s own claims'), note);
    assert.ok(note.includes('not verified amounts'), note);
});

test('valueBoxNote drops the active-award sentence when nothing sits on active awards', () => {
    const note = valueBoxNote('doge', dogeStatsFixture({ claimedOnActive: 0 }));

    assert.ok(!note.includes('remain active'), note);
    assert.ok(note.includes('62 of 112 claims list no savings figure'), note);
    assert.ok(note.includes('DOGE’s own claims'), note);
});

test('valueBoxNote drops the no-figure sentence when every claim carries a figure', () => {
    const note = valueBoxNote('doge', dogeStatsFixture({ noFigureCount: 0 }));

    assert.ok(!note.includes('list no savings figure'), note);
    assert.ok(note.includes('DOGE’s own claims'), note);
});

test('valueBoxNote always keeps the DOGE caveat, even with nothing else to say', () => {
    const note = valueBoxNote('doge', dogeStatsFixture({ claimedOnActive: 0, noFigureCount: 0 }));

    assert.equal(note, 'Savings figures are DOGE’s own claims, not verified amounts.');
});

test('valueBoxNote flags the partly-filled potential-value column with both numbers', () => {
    const note = valueBoxNote('cancellations', confirmedStats());

    // Denominator is the confirmed count — the same universe the
    // potential-value box sums — never the full row count.
    assert.ok(note.includes('93'), note);
    assert.ok(note.includes('172'), note);
    assert.ok(!note.includes('177'), note);
    assert.ok(note.includes('understates'), note);
});

test('valueBoxNote says nothing when the potential-value column is fully filled', () => {
    assert.equal(valueBoxNote('cancellations', confirmedStats({ potentialFillCount: 177 })), '');
});

test('valueBoxNote says nothing when the fill count was not computed', () => {
    assert.equal(valueBoxNote('cancellations', confirmedStats({ potentialFillCount: undefined })), '');
});

// --- renderOutcomeBar --------------------------------------------------------

test('renderOutcomeBar draws one segment per non-zero outcome', () => {
    const html = renderOutcomeBar(outcomeMixFixture());

    assert.equal(occurrences(html, 'seg-bar__segment'), 3);
});

test('renderOutcomeBar drops zero-count segments from the bar', () => {
    const html = renderOutcomeBar(outcomeMixFixture({ unmatched: 0 }));

    assert.equal(occurrences(html, 'seg-bar__segment'), 2);
    assert.ok(!html.includes(SEGMENT_META.unmatched.segClass), html);
});

test('renderOutcomeBar segment widths sum to 100 percent', () => {
    for (const mix of [outcomeMixFixture(), outcomeMixFixture({ unmatched: 0 }), { terminated: 1, noTermination: 0, unmatched: 0 }]) {
        const widths = segmentWidths(renderOutcomeBar(mix));
        const total = widths.reduce((sum, width) => sum + width, 0);
        assert.ok(Math.abs(total - 100) < 0.05, `widths ${widths.join('/')} summed to ${total}`);
    }
});

test('renderOutcomeBar sizes segments in proportion to their counts', () => {
    const widths = segmentWidths(renderOutcomeBar({ terminated: 75, noTermination: 20, unmatched: 5 }));

    assert.deepEqual(widths, [75, 20, 5]);
});

test('renderOutcomeBar exposes the whole mix to assistive tech', () => {
    const label = ariaLabel(renderOutcomeBar(outcomeMixFixture()));

    for (const key of BAR_SEGMENTS) {
        assert.ok(label.includes(`${SEGMENT_META[key].label}: `), `${key} missing from ${label}`);
    }
    assert.ok(label.includes('89'), label);
    assert.ok(label.includes('19'), label);
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
    assert.equal(renderOutcomeBar({ terminated: 0, noTermination: 0, unmatched: 0 }), '');
});

// --- renderOutcomeLegend -----------------------------------------------------

test('renderOutcomeLegend lists every segment with its label and count', () => {
    const html = renderOutcomeLegend(outcomeMixFixture());

    assert.equal(occurrences(html, 'seg-legend-item'), 3);
    for (const key of BAR_SEGMENTS) {
        assert.ok(html.includes(SEGMENT_META[key].label), key);
        assert.ok(html.includes(SEGMENT_META[key].segClass), key);
    }
    assert.ok(html.includes('>89<'), html);
    assert.ok(html.includes('>19<'), html);
    assert.ok(html.includes('>4<'), html);
});

test('renderOutcomeLegend keeps a zero segment visible and marks it zero', () => {
    const html = renderOutcomeLegend(outcomeMixFixture({ unmatched: 0 }));

    assert.equal(occurrences(html, 'seg-legend-item"'), 2);
    assert.equal(occurrences(html, 'seg-legend-item--zero'), 1);
    assert.ok(html.includes(SEGMENT_META.unmatched.label), html);
    assert.ok(html.includes('>0<'), html);
});

test('renderOutcomeLegend marks nothing zero when every segment has a count', () => {
    assert.equal(occurrences(renderOutcomeLegend(outcomeMixFixture()), 'seg-legend-item--zero'), 0);
});

test('renderOutcomeLegend still renders for an all-zero mix', () => {
    const html = renderOutcomeLegend({ terminated: 0, noTermination: 0, unmatched: 0 });

    assert.equal(occurrences(html, 'seg-legend-item--zero'), 3);
});

test('renderOutcomeLegend thousands-separates its counts', () => {
    assert.ok(renderOutcomeLegend({ terminated: 1234, noTermination: 1, unmatched: 0 }).includes('1,234'));
});

// --- renderOutcomeDefinitions ------------------------------------------------

test('renderOutcomeDefinitions prints one visible definition per segment', () => {
    const html = renderOutcomeDefinitions();

    assert.equal(occurrences(html, '<li>'), 3);
    assert.equal(occurrences(html, '</li>'), 3);
    for (const key of BAR_SEGMENTS) {
        assert.ok(html.includes(SEGMENT_META[key].label), `${key} label`);
        assert.ok(html.includes(SEGMENT_META[key].description), `${key} description`);
    }
});

test('renderOutcomeDefinitions pairs each term with its own description', () => {
    const items = renderOutcomeDefinitions().match(/<li>[\s\S]*?<\/li>/g);

    assert.equal(items.length, 3);
    items.forEach((item, index) => {
        const key = BAR_SEGMENTS[index];
        assert.ok(item.includes(`>${SEGMENT_META[key].label}<`), item);
        assert.ok(item.includes(SEGMENT_META[key].description), item);
    });
});

test('renderOutcomeDefinitions carries the definitions as text, not tooltips', () => {
    const html = renderOutcomeDefinitions();

    assert.ok(!html.includes('title='), html);
    assert.ok(textOf(html).includes(SEGMENT_META.noTermination.description));
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

    assert.ok(!renderOutcomeBar(mix).includes('seg--outcome-weak'));
    assert.ok(renderOutcomeLegend(mix).includes('seg--outcome-weak'));
});
