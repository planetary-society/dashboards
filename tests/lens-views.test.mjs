import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV } from '../docs/shared/js/utils.js';
import {
    LENSES,
    EVIDENCE_TIER_ORDER,
    CLAIM_OUTCOME_ORDER
} from '../docs/cancellations/js/ledger-categories.js';
import {
    LENS_META,
    TIER_META,
    OUTCOME_META,
    TIMELINE_META,
    VERDICT_META,
    ENDDATE_META,
    createLensValueBoxes,
    truncationChip,
    selectSpotlights,
    endDateSummary
} from '../docs/cancellations/js/lens-views.js';
import { row } from './fixtures.mjs';

/**
 * Representative raw summarize() output — unformatted numbers throughout
 */
function stats(overrides = {}) {
    return {
        count: 42,
        totalObligations: 1_234_567,
        totalOutlays: 456_789,
        claimedSavings: 987_654,
        divergedClaims: 3,
        districts: 17,
        avgDaysTruncated: 893.4,
        courtVacaturs: 2,
        ...overrides
    };
}

test('LENS_META covers exactly the four lenses', () => {
    assert.deepEqual(Object.keys(LENS_META).sort(), [...LENSES].sort());
});

test('every lens has non-empty display copy', () => {
    for (const lens of LENSES) {
        assert.ok(LENS_META[lens].label.length > 0, lens);
        assert.ok(LENS_META[lens].headline.length > 0, lens);
    }
});

test('every lens renders exactly four fully-formed boxes', () => {
    for (const lens of LENSES) {
        const boxes = createLensValueBoxes(stats(), lens);

        assert.equal(boxes.length, 4, lens);

        for (const box of boxes) {
            assert.equal(typeof box.title, 'string', lens);
            assert.equal(typeof box.value, 'string', lens);
            assert.ok(box.title.length > 0, lens);
            assert.ok(box.value.length > 0, lens);
            assert.ok(box.icon, lens);
            assert.ok(box.type, lens);
        }
    }
});

test('the first box title is the lens headline', () => {
    for (const lens of LENSES) {
        assert.equal(createLensValueBoxes(stats(), lens)[0].title, LENS_META[lens].headline, lens);
    }
});

test('the factory formats raw numbers itself', () => {
    const boxes = createLensValueBoxes(stats({ count: 1234, totalObligations: 2_500_000 }), 'cancelled');

    assert.equal(boxes[0].value, (1234).toLocaleString());
    assert.equal(boxes[1].value, '$2.5M');
});

test('an unknown or missing lens falls back to cancelled', () => {
    assert.deepEqual(createLensValueBoxes(stats(), 'nonsense'), createLensValueBoxes(stats(), 'cancelled'));
    assert.deepEqual(createLensValueBoxes(stats()), createLensValueBoxes(stats(), 'cancelled'));
});

test('a null average truncation renders as an em dash', () => {
    const boxes = createLensValueBoxes(stats({ avgDaysTruncated: null }), 'suspicious');
    const avgBox = boxes.find((box) => box.title === 'Average days truncated');

    assert.equal(avgBox.value, '—');
    assert.equal(
        createLensValueBoxes(stats({ avgDaysTruncated: 893.4 }), 'suspicious')
            .find((box) => box.title === 'Average days truncated').value,
        '893'
    );
});

// --- TIER_META / OUTCOME_META / TIMELINE_META --------------------------------

test('TIER_META covers exactly the evidence tiers with distinct, non-empty copy', () => {
    assert.deepEqual(Object.keys(TIER_META).sort(), [...EVIDENCE_TIER_ORDER].sort());

    for (const tier of EVIDENCE_TIER_ORDER) {
        const meta = TIER_META[tier];

        assert.ok(meta.label.length > 0, tier);
        assert.ok(meta.description.length > 0, tier);
        assert.match(meta.cls, /^badge--tier-/, tier);
        assert.match(meta.segCls, /^seg--/, tier);
    }

    const classes = EVIDENCE_TIER_ORDER.map((tier) => TIER_META[tier].cls);
    assert.equal(new Set(classes).size, classes.length);

    const labels = EVIDENCE_TIER_ORDER.map((tier) => TIER_META[tier].label);
    assert.equal(new Set(labels).size, labels.length);
});

test('OUTCOME_META covers exactly the claim outcomes with non-empty copy', () => {
    assert.deepEqual(Object.keys(OUTCOME_META).sort(), [...CLAIM_OUTCOME_ORDER].sort());

    for (const outcome of CLAIM_OUTCOME_ORDER) {
        assert.ok(OUTCOME_META[outcome].label.length > 0, outcome);
        assert.ok(OUTCOME_META[outcome].description.length > 0, outcome);
        assert.match(OUTCOME_META[outcome].segCls, /^seg--/, outcome);
    }
});

test('VERDICT_META has unique labels and non-empty copy', () => {
    const entries = Object.values(VERDICT_META);

    for (const meta of entries) {
        assert.ok(meta.label.length > 0);
        assert.ok(meta.description.length > 0);
    }

    // Labels double as sortable cell text in the Raw Data Verification
    // column, so two verdicts must never share one
    const labels = entries.map((meta) => meta.label);
    assert.equal(new Set(labels).size, labels.length);
});

test('every Auto Status value in the deployed ledger has a verdict entry', () => {
    const rows = parseCSV(
        readFileSync('docs/data/cancellations/master_ledger_latest.csv', 'utf8')
    );

    for (const r of rows) {
        const raw = String(r['Auto Status'] ?? '').trim();
        if (raw) {
            assert.ok(VERDICT_META[raw], `unmapped Auto Status "${raw}"`);
        }
    }
});

test('TIMELINE_META covers exactly the four lenses', () => {
    assert.deepEqual(Object.keys(TIMELINE_META).sort(), [...LENSES].sort());

    for (const lens of LENSES) {
        const meta = TIMELINE_META[lens];

        assert.ok(meta.subtitle.length > 0, lens);
        assert.ok(meta.dateNote.length > 0, lens);
        assert.ok(meta.valueLabel.length > 0, lens);
        assert.match(meta.barColor, /^var\(--[a-z]+-\d+\)$/, lens);
        assert.ok(meta.countLabel.length > 0, lens);
    }
});

test('only the doge timeline plots claimed savings', () => {
    assert.equal(TIMELINE_META.doge.valueLabel, 'Claimed savings');

    for (const lens of LENSES.filter((l) => l !== 'doge')) {
        assert.equal(TIMELINE_META[lens].valueLabel, 'Obligated value', lens);
        // Non-doge lenses date rows by a proxy and must say so
        assert.match(TIMELINE_META[lens].dateNote, /proxy/, lens);
    }
});

// --- truncationChip ----------------------------------------------------------

test('truncationChip reports a measured day count', () => {
    const chip = truncationChip(
        row({ Detection: 'End date truncated 1234 days by mod P00001 on 2026-01-20' })
    );

    assert.equal(chip.label, `End date cut by ${(1234).toLocaleString()} days`);
    assert.ok(chip.title.length > 0);

    assert.equal(
        truncationChip(
            row({
                'End Date Trend': 'truncated',
                'First End Date': '2026-03-11',
                'End Date': '2026-03-01'
            })
        ).label,
        'End date cut by 10 days'
    );
});

test('truncationChip falls back to an unmeasurable chip for suspicious rows', () => {
    // Mirror-only rows have equal end dates, so the size of the cut is unknown
    const chip = truncationChip(row({ Sources: 'LocalUSASpendingMirror' }));

    assert.equal(chip.label, 'End date cut before tracking began');
    assert.ok(chip.title.length > 0);

    assert.equal(truncationChip(row(), { suspicious: true }).label, 'End date cut before tracking began');
});

test('truncationChip prefers the measured count over the suspicious fallback', () => {
    const chip = truncationChip(
        row({ Detection: 'End date truncated 5 days by mod P00001 on 2026-01-20' }),
        { suspicious: true }
    );

    assert.equal(chip.label, 'End date cut by 5 days');
});

test('truncationChip is null when there is nothing to say', () => {
    assert.equal(truncationChip(row()), null);
    assert.equal(truncationChip(row(), {}), null);
    assert.equal(truncationChip({}, {}), null);
});

// --- selectSpotlights --------------------------------------------------------

/**
 * Award-value fixture: an id plus an obligated amount
 */
function award(id, amount) {
    return row({ 'Award ID': id, 'Award Amount': String(amount) });
}

test('selectSpotlights returns the largest awards plus a median-representative one', () => {
    const picks = selectSpotlights([
        award('a', 10),
        award('b', 1000),
        award('c', 50),
        award('d', 900),
        award('e', 40)
    ]);

    assert.deepEqual(picks.rows.map((r) => r['Award ID']), ['b', 'd', 'c']);
    assert.equal(picks.hasRepresentative, true);
});

test('selectSpotlights orders the top picks largest first', () => {
    const picks = selectSpotlights([award('small', 1), award('big', 999), award('mid', 500)], 3);

    // Fewer rows than n after the median pick would collide, so all three come back sorted
    assert.deepEqual(picks.rows.map((r) => r['Award ID']), ['big', 'mid', 'small']);
    // Every row is on display, so no card is a stand-in for a distribution
    assert.equal(picks.hasRepresentative, false);
});

test('selectSpotlights honours a custom n', () => {
    const rows = [award('a', 10), award('b', 20), award('c', 30), award('d', 40), award('e', 50)];

    assert.equal(selectSpotlights(rows, 2).rows.length, 2);
    assert.equal(selectSpotlights(rows, 1).rows.length, 1);
    assert.deepEqual(selectSpotlights(rows, 2).rows.map((r) => r['Award ID'])[0], 'e');
    assert.deepEqual(selectSpotlights(rows, 0), { rows: [], hasRepresentative: false });
});

test('selectSpotlights never repeats an award ID', () => {
    const picks = selectSpotlights([
        award('dup', 1000),
        award('dup', 1000),
        award('dup', 1000),
        award('other', 5)
    ]);

    assert.deepEqual(picks.rows.map((r) => r['Award ID']), ['dup', 'other']);
    assert.equal(picks.hasRepresentative, false);
});

test('selectSpotlights skips rows with no readable value', () => {
    const picks = selectSpotlights([
        award('a', 100),
        row({ 'Award ID': 'blank', 'Award Amount': '' }),
        row({ 'Award ID': 'junk', 'Award Amount': 'n/a' })
    ]);

    assert.deepEqual(picks.rows.map((r) => r['Award ID']), ['a']);
});

test('selectSpotlights reports no representative when too few rows have values', () => {
    // Five rows, but only three carry a parseable value — a row-count check
    // would wrongly claim a median representative exists
    const picks = selectSpotlights([
        award('a', 100),
        award('b', 50),
        award('c', 10),
        row({ 'Award ID': 'blank', 'Award Amount': '' }),
        row({ 'Award ID': 'junk', 'Award Amount': 'n/a' })
    ]);

    assert.equal(picks.rows.length, 3);
    assert.equal(picks.hasRepresentative, false);
});

test('selectSpotlights prefers the numeric totalObligations attached at load', () => {
    const picks = selectSpotlights(
        [
            { ...award('attached', 1), totalObligations: 5000 },
            { ...award('raw', 900), totalObligations: null }
        ],
        2
    );

    assert.deepEqual(picks.rows.map((r) => r['Award ID']), ['attached', 'raw']);
});

test('selectSpotlights copes with empty and undefined input', () => {
    assert.deepEqual(selectSpotlights([]), { rows: [], hasRepresentative: false });
    assert.deepEqual(selectSpotlights(undefined), { rows: [], hasRepresentative: false });
});

// --- end-date chart copy ----------------------------------------------------

/**
 * Build endDateChanges()-shaped items from a list of day deltas
 * @param {number[]} days - Whole days moved, positive for a cut
 * @returns {{items: Array<{days: number}>}} Chart input
 */
function movements(days) {
    return { items: days.map((value) => ({ days: value })) };
}

test('ENDDATE_META carries a heading and a method note', () => {
    assert.ok(ENDDATE_META.heading.length > 0);
    assert.ok(ENDDATE_META.note.length > 0);
    // The note has to say where the numbers come from, since nobody announced them
    assert.match(ENDDATE_META.note, /snapshot/i);
});

test('endDateSummary counts the cuts and reports their median', () => {
    assert.equal(
        endDateSummary(movements([900, 351, 100])),
        '3 awards had their end dates quietly cut short — a median of 351 days each.'
    );
});

test('endDateSummary keeps its grammar at a count of one', () => {
    assert.equal(
        endDateSummary(movements([7])),
        '1 award had its end date quietly cut short — a median of 7 days each.'
    );
});

test('endDateSummary averages an even number of cuts into a half day', () => {
    assert.match(endDateSummary(movements([10, 11])), /median of 10\.5 days/);
});

test('endDateSummary returns nothing when nothing moved', () => {
    assert.equal(endDateSummary({ items: [] }), '');
    assert.equal(endDateSummary({}), '');
    assert.equal(endDateSummary(), '');
});
