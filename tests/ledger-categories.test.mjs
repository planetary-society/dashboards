import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV } from '../docs/shared/js/utils.js';
import {
    LENSES,
    CANCELLED_STATUSES,
    REVERSED_STATUSES,
    NON_LENS_STATUSES,
    STATUS_PILLS,
    SUSPICIOUS_PILL,
    EXTENDED_PILL,
    categorize,
    applyLens,
    isExtensionCarveOut,
    summarize,
    deriveBadges,
    detectionEvidence,
    splitSources,
    EVIDENCE_TIER_ORDER,
    CLAIM_OUTCOME_ORDER,
    evidenceTier,
    truncationDays,
    claimOutcome,
    verificationConflict,
    tierMix,
    claimOutcomeMix,
    latestVerification,
    monthlyActivity,
    endDateChanges
} from '../docs/cancellations/js/ledger-categories.js';
import { row, mirrorRow, captureWarnings } from './fixtures.mjs';

const LEDGER_PATH = 'docs/data/cancellations/master_ledger_latest.csv';
const METADATA_PATH = 'docs/data/cancellations/metadata.json';

// --- lens flags -------------------------------------------------------------

test('categorize flags a plain cancelled-status row as cancelled only', () => {
    assert.deepEqual(categorize(row()), {
        cancelled: true,
        doge: false,
        suspicious: false,
        reversed: false
    });
});

test('categorize flags DOGE claims regardless of status', () => {
    assert.equal(categorize(row({ 'Claiming Source': 'DOGE' })).doge, true);
    assert.equal(categorize(row({ Status: 'reinstated', 'Claiming Source': 'DOGE' })).doge, true);
    assert.equal(categorize(row({ 'Claiming Source': '' })).doge, false);
});

test('categorize flags reversed statuses and keeps them out of cancelled', () => {
    for (const status of REVERSED_STATUSES) {
        const flags = categorize(row({ Status: status }));
        assert.equal(flags.reversed, true, status);
        assert.equal(flags.cancelled, false, status);
        assert.equal(flags.suspicious, false, status);
    }
});

test('categorize puts every cancelled status in at most one of cancelled/suspicious', () => {
    for (const status of CANCELLED_STATUSES) {
        const hard = categorize(row({ Status: status }));
        assert.equal(hard.cancelled, true, status);
        assert.equal(hard.suspicious, false, status);

        const soft = categorize(mirrorRow({ Status: status }));
        assert.equal(soft.cancelled, false, status);
        assert.equal(soft.suspicious, true, status);

        // The one carve-out: date-only evidence that grew the award is neither
        const extended = categorize(mirrorRow({
            Status: status,
            'Initial Reported End Date': '2026-01-01',
            'End Date': '2027-01-01'
        }));
        assert.equal(extended.cancelled, false, status);
        assert.equal(extended.suspicious, false, status);
    }
});

test('a date-only row whose end date moved later lands in no lens', () => {
    const flags = categorize(mirrorRow({
        'Initial Reported End Date': '2025-06-30',
        'End Date': '2026-06-30'
    }));

    assert.equal(flags.suspicious, false);
    assert.equal(flags.cancelled, false);
    assert.equal(flags.reversed, false);
    assert.equal(flags.doge, false);
});

test('a date-only row whose end date was cut stays suspicious', () => {
    const flags = categorize(mirrorRow({
        'Initial Reported End Date': '2026-06-30',
        'End Date': '2025-06-30'
    }));

    assert.equal(flags.suspicious, true);
    assert.equal(flags.cancelled, false);
});

test('a date-only row with no parseable dates stays suspicious', () => {
    // The detection itself implies a truncation, possibly one predating the
    // baseline, so an unmeasurable row is not carved out
    assert.equal(
        categorize(mirrorRow({
            'Initial Reported End Date': '',
            'End Date': ''
        })).suspicious,
        true
    );
    assert.equal(
        categorize(mirrorRow({
            'Initial Reported End Date': 'unknown',
            'End Date': '2026-06-30'
        })).suspicious,
        true
    );
});

test('a date-only row whose end date never moved stays suspicious', () => {
    const flags = categorize(mirrorRow({
        'Initial Reported End Date': '2026-06-30',
        'End Date': '2026-06-30'
    }));

    assert.equal(flags.suspicious, true);
    assert.equal(flags.cancelled, false);
});

test('the extension carve-out falls back to First End Date when no original is recorded', () => {
    assert.equal(
        categorize(mirrorRow({
            'First End Date': '2025-06-30',
            'End Date': '2026-06-30'
        })).suspicious,
        false
    );
});

test('the suspicious lens yields only cuts through the full pipeline', () => {
    // Spans categorize, applyLens, and endDateChanges at once: the chart's
    // cuts-only assumption holds because the lens filters extensions, not
    // because anything downstream re-checks
    const rows = [
        mirrorRow({
            'Award ID': 'CUT',
            'Initial Reported End Date': '2026-06-30',
            'End Date': '2025-06-30'
        }),
        mirrorRow({
            'Award ID': 'EXT',
            'Initial Reported End Date': '2025-06-30',
            'End Date': '2026-06-30'
        }),
        row({ 'Award ID': 'HARD' })
    ];

    const { items, unchanged, unmeasured } = endDateChanges(applyLens(rows, 'suspicious'));

    assert.deepEqual(items.map((item) => item.row['Award ID']), ['CUT']);
    assert.ok(items.every((item) => item.days > 0));
    assert.equal(unchanged + unmeasured, 0);
});

test('isExtensionCarveOut names exactly the extension carve-out', () => {
    const extended = mirrorRow({
        'Initial Reported End Date': '2025-06-30',
        'End Date': '2026-06-30'
    });
    assert.equal(isExtensionCarveOut(extended), true);

    // Cut, hard-evidence, descoped, and reversed rows are all not carve-outs
    assert.equal(isExtensionCarveOut(mirrorRow({
        'Initial Reported End Date': '2026-06-30',
        'End Date': '2025-06-30'
    })), false);
    assert.equal(isExtensionCarveOut(row()), false);
    assert.equal(isExtensionCarveOut(row({ Status: 'descoped' })), false);
    assert.equal(isExtensionCarveOut(row({ Status: 'reinstated' })), false);
});

test('deriveBadges pills the extension carve-out as excluded, not cancelled', () => {
    const badges = deriveBadges(mirrorRow({
        'Initial Reported End Date': '2025-06-30',
        'End Date': '2026-06-30'
    }));

    assert.deepEqual(badges.statusPill, EXTENDED_PILL);
    assert.equal(badges.statusPill.cls, 'badge--excluded');
});

test('categorize excludes non-lens statuses from every lens', () => {
    for (const status of NON_LENS_STATUSES) {
        assert.deepEqual(categorize(row({ Status: status, Sources: 'LocalUSASpendingMirror' })), {
            cancelled: false,
            doge: false,
            suspicious: false,
            reversed: false
        });
    }
});

test('a descoped award is not a cancellation', () => {
    // Regression: NNG09FA40C — only part of the work was cut, the award
    // continues, so descopes must never surface in the Cancelled lens or
    // wear the cancelled-red badge
    assert.ok(!CANCELLED_STATUSES.includes('descoped'));
    assert.ok(NON_LENS_STATUSES.includes('descoped'));
    assert.equal(categorize(row({ Status: 'descoped' })).cancelled, false);
    assert.notEqual(deriveBadges(row({ Status: 'descoped' })).statusPill.cls, 'badge--cancelled');
});

// --- Detection-present branch ----------------------------------------------

test('Detection with a termination action is cancelled, not suspicious', () => {
    const flags = categorize(
        row({
            Sources: 'LocalUSASpendingMirror',
            Detection: 'Terminate-for-convenience action P00180 on 2026-05-06'
        })
    );

    assert.equal(flags.cancelled, true);
    assert.equal(flags.suspicious, false);
});

test('Detection with truncation only is suspicious', () => {
    const flags = categorize(
        row({
            Sources: 'NPDV; USAspendingTerminations',
            Detection: 'End date truncated 893 days by mod P00001 on 2026-01-20'
        })
    );

    assert.equal(flags.suspicious, true);
    assert.equal(flags.cancelled, false);
});

test('truncation-only Detection with a DOGE claim is cancelled and doge, never suspicious', () => {
    const flags = categorize(
        row({
            Sources: 'LocalUSASpendingMirror',
            'Claiming Source': 'DOGE',
            Detection: 'End date truncated 893 days by mod P00001 on 2026-01-20; TERMINATED'
        })
    );

    assert.equal(flags.cancelled, true);
    assert.equal(flags.doge, true);
    assert.equal(flags.suspicious, false);
});

test('truncation plus a clawback phrase is cancelled', () => {
    const flags = categorize(
        row({
            Detection:
                'End date truncated 12 days by mod P00003 on 2026-02-01; Clawback of 100% ($448,257) on 2026-01-14'
        })
    );

    assert.equal(flags.cancelled, true);
    assert.equal(flags.suspicious, false);
});

test('Pure-clawback deobligation is matched case-insensitively', () => {
    const flags = categorize(
        row({
            Detection:
                'End date truncated 5 days by mod P00001 on 2026-01-20; Pure-clawback deobligation P00001 on 2026-01-20 (100% of $448,257)'
        })
    );

    assert.equal(flags.cancelled, true);
    assert.equal(flags.suspicious, false);
});

test('termination-language transaction Detection is cancelled', () => {
    const flags = categorize(
        row({
            Sources: 'LocalUSASpendingMirror',
            Detection: 'End date truncated 30 days by mod P00002 on 2026-03-01; Termination-language transaction on 2026-03-01'
        })
    );

    assert.equal(flags.cancelled, true);
    assert.equal(flags.suspicious, false);
});

test('Detection present but without truncation text is cancelled even for mirror-only rows', () => {
    const flags = categorize(
        row({
            Sources: 'LocalUSASpendingMirror',
            Detection: 'Legal-contract-cancellation action P00004 on 2026-04-02'
        })
    );

    assert.equal(flags.cancelled, true);
    assert.equal(flags.suspicious, false);
});

// --- Detection-absent fallback branch ---------------------------------------

test('mirror-only rows are suspicious when Detection is absent', () => {
    assert.equal(categorize(row({ Sources: 'LocalUSASpendingMirror' })).suspicious, true);
});

test('mirror-only rows are suspicious when Detection is empty', () => {
    assert.equal(
        categorize(row({ Sources: 'LocalUSASpendingMirror', Detection: '   ' })).suspicious,
        true
    );
});

test('mirror-only rows with a claim are not suspicious', () => {
    const flags = categorize(row({ Sources: 'LocalUSASpendingMirror', 'Claiming Source': 'DOGE' }));

    assert.equal(flags.suspicious, false);
    assert.equal(flags.cancelled, true);
    assert.equal(flags.doge, true);
});

test('multi-source rows including the mirror are cancelled, not suspicious', () => {
    const flags = categorize(row({ Sources: 'LocalUSASpendingMirror; NPDV' }));

    assert.equal(flags.cancelled, true);
    assert.equal(flags.suspicious, false);
});

test('End Date Trend alone never drives the suspicious flag', () => {
    assert.equal(categorize(row({ 'End Date Trend': 'truncated' })).suspicious, false);
    assert.equal(
        categorize(row({ Sources: 'LocalUSASpendingMirror', 'End Date Trend': 'unchanged' }))
            .suspicious,
        true
    );
});

// --- unknown values ---------------------------------------------------------

test('unknown status lands in no lens and does not throw', () => {
    const flags = categorize(row({ Status: 'invented_status' }));

    assert.deepEqual(flags, {
        cancelled: false,
        doge: false,
        suspicious: false,
        reversed: false
    });
});

test('missing status and empty rows do not throw', () => {
    assert.doesNotThrow(() => categorize({}));
    assert.equal(categorize({}).cancelled, false);
});

test('unknown lens falls back to cancelled', () => {
    const rows = [row(), row({ Status: 'reinstated' })];

    assert.deepEqual(applyLens(rows, 'nonsense'), applyLens(rows, 'cancelled'));
});

// --- applyLens --------------------------------------------------------------

test('applyLens selects rows per lens', () => {
    const rows = [
        row({ 'Award ID': 'hard' }),
        row({ 'Award ID': 'soft', Sources: 'LocalUSASpendingMirror' }),
        row({ 'Award ID': 'claim', 'Claiming Source': 'DOGE' }),
        row({ 'Award ID': 'back', Status: 'reinstated' }),
        row({ 'Award ID': 'out', Status: 'excluded_by_design' })
    ];

    const ids = (lens) => applyLens(rows, lens).map((r) => r['Award ID']);

    assert.deepEqual(ids('cancelled'), ['hard', 'claim']);
    assert.deepEqual(ids('suspicious'), ['soft']);
    assert.deepEqual(ids('doge'), ['claim']);
    assert.deepEqual(ids('reversed'), ['back']);
});

// --- summarize --------------------------------------------------------------

test('summarize sums currency columns and treats blanks as zero', () => {
    const stats = summarize([
        row({ 'Award Amount': '1000.00', 'Total Outlays': '250.50', 'Claimed Savings': '1423496.00' }),
        row({ 'Award Amount': '', 'Total Outlays': '', 'Claimed Savings': '' }),
        row({ 'Award Amount': '$2,000', 'Total Outlays': '10', 'Claimed Savings': '4.00' })
    ]);

    assert.equal(stats.count, 3);
    assert.equal(stats.totalObligations, 3000);
    assert.equal(stats.totalOutlays, 260.5);
    assert.equal(stats.claimedSavings, 1423500);
});

test('summarize counts only claimed_but_* as diverged claims', () => {
    const stats = summarize([
        row({ 'Claim Divergence': '' }),
        row({ 'Claim Divergence': 'consistent' }),
        row({ 'Claim Divergence': 'claimed_and_shrank' }),
        row({ 'Claim Divergence': 'claimed_but_grew' }),
        row({ 'Claim Divergence': 'claimed_but_extended' })
    ]);

    assert.equal(stats.divergedClaims, 2);
});

test('summarize counts distinct non-empty districts', () => {
    const stats = summarize([
        row({ District: 'CA-37' }),
        row({ District: 'CA-37' }),
        row({ District: 'TX-20' }),
        row({ District: '' })
    ]);

    assert.equal(stats.districts, 2);
});

test('summarize averages truncated days from Detection, null when absent', () => {
    const withDays = summarize([
        row({ Detection: 'End date truncated 100 days by mod P00001 on 2026-01-20' }),
        row({ Detection: 'End date truncated 200 days by mod P00002 on 2026-02-20' }),
        row({ Detection: 'Termination action P00003 on 2026-03-20' }),
        row()
    ]);

    assert.equal(withDays.avgDaysTruncated, 150);
    assert.equal(summarize([row(), row()]).avgDaysTruncated, null);
    assert.equal(summarize([]).avgDaysTruncated, null);
});

test('summarize counts court vacaturs', () => {
    const stats = summarize([row({ Status: 'vacated' }), row({ Status: 'reinstated' }), row()]);

    assert.equal(stats.courtVacaturs, 1);
});

// --- deriveBadges -----------------------------------------------------------

test('deriveBadges covers every known status with the right badge family', () => {
    // Assert coverage and class families rather than restating STATUS_PILLS
    // label-for-label; the labels themselves are display copy owned by the module
    const knownStatuses = [...CANCELLED_STATUSES, ...REVERSED_STATUSES, ...NON_LENS_STATUSES];
    assert.deepEqual(Object.keys(STATUS_PILLS).sort(), [...knownStatuses].sort());

    const families = [
        [CANCELLED_STATUSES, 'badge--cancelled'],
        [REVERSED_STATUSES, 'badge--reversed'],
        [NON_LENS_STATUSES, 'badge--excluded']
    ];

    assert.equal(SUSPICIOUS_PILL.cls, 'badge--suspicious');
    assert.ok(SUSPICIOUS_PILL.label.length > 0);

    for (const [statuses, cls] of families) {
        for (const status of statuses) {
            const pill = deriveBadges(row({ Status: status })).statusPill;
            assert.equal(pill.cls, cls, status);
            assert.ok(pill.label.length > 0, status);
        }
    }
});

test('deriveBadges falls back to the raw status for unknown values', () => {
    assert.deepEqual(deriveBadges(row({ Status: 'wat' })).statusPill, {
        label: 'wat',
        cls: 'badge--excluded'
    });
});

test('deriveBadges lets the suspicious lens override the status pill', () => {
    const badges = deriveBadges(row({ Status: 'listed', Sources: 'LocalUSASpendingMirror' }));

    assert.deepEqual(badges.statusPill, SUSPICIOUS_PILL);
    assert.deepEqual(badges.statusPill, { label: 'Suspicious', cls: 'badge--suspicious' });
});

test('splitSources returns trimmed, non-empty names', () => {
    assert.deepEqual(splitSources(''), []);
    assert.deepEqual(splitSources(undefined), []);
    assert.deepEqual(splitSources('NPDV'), ['NPDV']);
    assert.deepEqual(splitSources('NPDV; DOGE'), ['NPDV', 'DOGE']);
    assert.deepEqual(splitSources(' NPDV ;; DOGE ;'), ['NPDV', 'DOGE']);
});

test('deriveBadges lists sources', () => {
    assert.deepEqual(deriveBadges(row({ Sources: '' })).sources, []);
    assert.deepEqual(deriveBadges(row({ Sources: 'NPDV' })).sources, ['NPDV']);
    assert.deepEqual(deriveBadges(row({ Sources: 'NPDV; DOGE' })).sources, ['NPDV', 'DOGE']);
    assert.deepEqual(deriveBadges(row({ Sources: 'NPDV; DOGE; LocalUSASpendingMirror' })).sources, [
        'NPDV',
        'DOGE',
        'LocalUSASpendingMirror'
    ]);
});

test('deriveBadges surfaces only claimed_but_* divergences', () => {
    assert.equal(deriveBadges(row({ 'Claim Divergence': '' })).divergence, null);
    assert.equal(deriveBadges(row({ 'Claim Divergence': 'consistent' })).divergence, null);
    assert.equal(deriveBadges(row({ 'Claim Divergence': 'claimed_and_shrank' })).divergence, null);

    assert.deepEqual(deriveBadges(row({ 'Claim Divergence': 'claimed_but_grew' })).divergence, {
        code: 'claimed_but_grew',
        label: 'Claim diverges: grew',
        cls: 'badge--doge'
    });

    assert.deepEqual(deriveBadges(row({ 'Claim Divergence': 'claimed_but_extended' })).divergence, {
        code: 'claimed_but_extended',
        label: 'Claim diverges: extended',
        cls: 'badge--doge'
    });
});

test('deriveBadges falls back to a generic label for unseen claimed_but_* codes', () => {
    assert.deepEqual(deriveBadges(row({ 'Claim Divergence': 'claimed_but_renamed' })).divergence, {
        code: 'claimed_but_renamed',
        label: 'Claim diverges',
        cls: 'badge--doge'
    });
});

// --- detectionEvidence -------------------------------------------------------

test('detectionEvidence returns nothing when Detection is empty or missing', () => {
    assert.equal(detectionEvidence(row()), '');
    assert.equal(detectionEvidence(row({ Detection: '   ' })), '');
    assert.equal(detectionEvidence({}), '');
});

test('detectionEvidence suppresses Detection that merely restates the claim', () => {
    assert.equal(
        detectionEvidence(row({ Detection: 'TERMINATED', 'Claimed Status': 'TERMINATED' })),
        ''
    );
    assert.equal(
        detectionEvidence(row({ Detection: 'terminated', 'Claimed Status': ' TERMINATED ' })),
        ''
    );
});

test('detectionEvidence passes real evidence through untruncated', () => {
    const detection = 'End date truncated 893 days by mod P00001 on 2026-01-20';

    assert.equal(detectionEvidence(row({ Detection: detection })), detection);
    assert.equal(
        detectionEvidence(row({ Detection: detection, 'Claimed Status': 'TERMINATED' })),
        detection
    );
});

test('deriveBadges builds trend glyphs from trends and Detection', () => {
    assert.deepEqual(deriveBadges(row()).trendGlyphs, []);

    assert.deepEqual(deriveBadges(row({ 'Amount Trend': 'shrank' })).trendGlyphs, [
        { glyph: '▼', title: 'Award amount reduced since first observation' }
    ]);

    assert.deepEqual(deriveBadges(row({ 'End Date Trend': 'truncated' })).trendGlyphs, [
        { glyph: '◀', title: 'End date moved earlier since first observation' }
    ]);

    assert.deepEqual(
        deriveBadges(row({ Detection: 'End date truncated 8 days by mod P00001 on 2026-01-20' }))
            .trendGlyphs,
        [{ glyph: '◀', title: 'End date moved earlier since first observation' }]
    );

    assert.equal(
        deriveBadges(row({ 'Amount Trend': 'shrank', 'End Date Trend': 'truncated' })).trendGlyphs
            .length,
        2
    );
});

// --- evidenceTier -----------------------------------------------------------

test('evidenceTier maps each recognized source to its tier', () => {
    assert.equal(evidenceTier(row({ Sources: 'USAspendingTerminations' })), 'official');
    assert.equal(evidenceTier(row({ Sources: 'FPDS' })), 'official');
    assert.equal(evidenceTier(row({ Sources: 'NPDV' })), 'nasa-list');
    assert.equal(evidenceTier(row({ Sources: 'NASAGrants' })), 'nasa-list');
    assert.equal(evidenceTier(row({ Sources: 'LocalUSASpendingMirror' })), 'mirror');
    assert.equal(evidenceTier(row({ Sources: 'DOGE' })), 'claim-only');
});

test('evidenceTier takes the strongest source on multi-source rows', () => {
    assert.equal(evidenceTier(row({ Sources: 'DOGE; NPDV' })), 'nasa-list');
    assert.equal(evidenceTier(row({ Sources: 'DOGE; LocalUSASpendingMirror' })), 'mirror');
    assert.equal(evidenceTier(row({ Sources: 'LocalUSASpendingMirror; NPDV' })), 'nasa-list');
    assert.equal(evidenceTier(row({ Sources: 'NPDV; FPDS' })), 'official');
    assert.equal(
        evidenceTier(row({ Sources: 'DOGE; LocalUSASpendingMirror; NASAGrants; USAspendingTerminations' })),
        'official'
    );
    // Source order in the column must not change the answer
    assert.equal(evidenceTier(row({ Sources: 'USAspendingTerminations; DOGE' })), 'official');
});

test('evidenceTier falls back to claim-only for empty or missing Sources', () => {
    assert.equal(evidenceTier(row({ Sources: '' })), 'claim-only');
    assert.equal(evidenceTier({}), 'claim-only');
});

test('evidenceTier counts a verified termination as federal-record evidence', () => {
    // The weekly re-verifier found a termination action in the transaction
    // history — the same class of proof as a daily source detection
    assert.equal(evidenceTier(row({ Sources: 'DOGE', 'Auto Status': 'still_terminated' })), 'official');
    assert.equal(evidenceTier(row({ Sources: 'NPDV', 'Auto Status': 'still_terminated' })), 'official');
    assert.equal(
        evidenceTier(row({ Sources: 'LocalUSASpendingMirror', 'Auto Status': 'still_terminated' })),
        'official'
    );
});

test('evidenceTier does not promote on weaker re-verification verdicts', () => {
    for (const verdict of ['naturally_expired', 'no_termination_signal', 'reinstated', 'vacated', '']) {
        assert.equal(
            evidenceTier(row({ Sources: 'DOGE', 'Auto Status': verdict })),
            'claim-only',
            verdict || '(blank)'
        );
    }
});

test('evidenceTier promotion does not suppress unknown-source warnings', () => {
    const warnings = captureWarnings(() => {
        assert.equal(
            evidenceTier(row({
                Sources: 'PromotedButUnknownSource',
                'Auto Status': 'still_terminated'
            })),
            'official'
        );
    });

    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('PromotedButUnknownSource'));
});

test('evidenceTier ignores unknown sources and warns once per distinct name', () => {
    const warnings = captureWarnings(() => {
        assert.equal(evidenceTier(row({ Sources: 'InventedSource' })), 'claim-only');
        assert.equal(evidenceTier(row({ Sources: 'InventedSource; NPDV' })), 'nasa-list');
        assert.equal(evidenceTier(row({ Sources: 'OtherInventedSource' })), 'claim-only');
    });

    assert.equal(warnings.length, 2);
    assert.ok(warnings[0].includes('InventedSource'));
    assert.ok(warnings[1].includes('OtherInventedSource'));
});

test('EVIDENCE_TIER_ORDER runs strongest to weakest', () => {
    assert.deepEqual(EVIDENCE_TIER_ORDER, ['official', 'nasa-list', 'mirror', 'claim-only']);
});

// --- truncationDays ---------------------------------------------------------

test('truncationDays reads the day count out of Detection', () => {
    assert.equal(
        truncationDays(row({ Detection: 'End date truncated 893 days by mod P00001 on 2026-01-20' })),
        893
    );
    assert.equal(
        truncationDays(
            row({
                Detection: 'End date truncated 12 days by mod P00003 on 2026-02-01; Clawback of 100%'
            })
        ),
        12
    );
});

test('truncationDays prefers Detection over the date columns', () => {
    const days = truncationDays(
        row({
            Detection: 'End date truncated 7 days by mod P00001 on 2026-01-20',
            'End Date Trend': 'truncated',
            'First End Date': '2027-01-01',
            'End Date': '2026-01-01'
        })
    );

    assert.equal(days, 7);
});

test('truncationDays differences the date columns when the trend is truncated', () => {
    assert.equal(
        truncationDays(
            row({
                'End Date Trend': 'truncated',
                'First End Date': '2026-03-11',
                'End Date': '2026-03-01'
            })
        ),
        10
    );

    // Spans a DST boundary in local time; UTC arithmetic must still give whole days
    assert.equal(
        truncationDays(
            row({
                'End Date Trend': 'truncated',
                'First End Date': '2026-03-31',
                'End Date': '2026-03-01'
            })
        ),
        30
    );

    assert.equal(
        truncationDays(
            row({
                'End Date Trend': 'truncated',
                'First End Date': '2027-01-06',
                'End Date': '2025-07-07'
            })
        ),
        548
    );
});

test('truncationDays is null when the trend does not say truncated', () => {
    assert.equal(
        truncationDays(
            row({
                'End Date Trend': 'unchanged',
                'First End Date': '2026-03-11',
                'End Date': '2026-03-01'
            })
        ),
        null
    );
    assert.equal(
        truncationDays(
            row({
                'End Date Trend': 'extended',
                'First End Date': '2026-03-11',
                'End Date': '2026-03-01'
            })
        ),
        null
    );
});

test('truncationDays prefers the Initial Reported End Date baseline', () => {
    // The July 2026 schema populates the award's original end date, which
    // beats the first-observed fallback when both are present
    assert.equal(
        truncationDays(
            row({
                'End Date Trend': 'truncated',
                'Initial Reported End Date': '2026-05-25',
                'First End Date': '2026-05-04',
                'End Date': '2026-05-04'
            })
        ),
        21
    );
});

test('truncationDays measures mirror rows once the original end date is known', () => {
    // Pre-schema mirror rows had First End Date == End Date (the cut predated
    // observation) and were unmeasurable; with Initial Reported End Date
    // populated the same row now measures
    const legacy = row({
        Sources: 'LocalUSASpendingMirror',
        'End Date Trend': 'truncated',
        'First End Date': '2026-05-04',
        'End Date': '2026-05-04'
    });

    assert.equal(truncationDays(legacy), null);
    assert.equal(categorize(legacy).suspicious, true);

    assert.equal(
        truncationDays({ ...legacy, 'Initial Reported End Date': '2026-06-03' }),
        30
    );
});

test('truncationDays is null when the end date moved later', () => {
    assert.equal(
        truncationDays(
            row({
                'End Date Trend': 'truncated',
                'First End Date': '2026-01-01',
                'End Date': '2026-06-01'
            })
        ),
        null
    );
});

test('truncationDays is null for blank or unparseable dates', () => {
    const bad = (first, end) =>
        truncationDays(row({ 'End Date Trend': 'truncated', 'First End Date': first, 'End Date': end }));

    assert.equal(bad('', ''), null);
    assert.equal(bad('2026-03-11', ''), null);
    assert.equal(bad('not a date', '2026-03-01'), null);
    assert.equal(bad('3/11/2026', '3/1/2026'), null);
    assert.equal(bad('2026-13-45', '2026-03-01'), null);
    assert.equal(bad('2026-02-30', '2026-01-01'), null);
    assert.equal(truncationDays({}), null);
});

test('summarize averages measurable truncations from either source', () => {
    const stats = summarize([
        row({ Detection: 'End date truncated 100 days by mod P00001 on 2026-01-20' }),
        row({
            'End Date Trend': 'truncated',
            'First End Date': '2026-03-11',
            'End Date': '2026-03-01'
        }),
        row({ Sources: 'LocalUSASpendingMirror' }),
        row()
    ]);

    assert.equal(stats.avgDaysTruncated, 55);
});

// --- endDateChanges ---------------------------------------------------------

/**
 * Build a row whose end date moved between two known dates
 * @param {string} initial - Initial Reported End Date
 * @param {string} end - End Date
 * @param {Object} [overrides] - Further column values
 * @returns {Object} Ledger row
 */
function moved(initial, end, overrides = {}) {
    return row({ 'Initial Reported End Date': initial, 'End Date': end, ...overrides });
}

test('endDateChanges measures a cut as positive days', () => {
    const { items, unchanged, unmeasured } = endDateChanges([moved('2026-06-03', '2026-05-04')]);

    assert.equal(items.length, 1);
    assert.equal(items[0].days, 30);
    assert.equal(items[0].baseline, '2026-06-03');
    assert.equal(items[0].current, '2026-05-04');
    assert.equal(unchanged, 0);
    assert.equal(unmeasured, 0);
});

test('endDateChanges measures an extension as negative days', () => {
    const { items } = endDateChanges([moved('2026-05-04', '2026-06-03')]);

    assert.equal(items.length, 1);
    assert.equal(items[0].days, -30);
});

test('endDateChanges spans a leap day without drifting', () => {
    // Date.UTC arithmetic, not local-time parsing: 2024-02-29 exists and the
    // difference is a whole number of days
    const { items } = endDateChanges([moved('2024-03-01', '2024-02-01')]);

    assert.equal(items[0].days, 29);
});

test('endDateChanges counts an unmoved end date as unchanged', () => {
    const { items, unchanged, unmeasured } = endDateChanges([moved('2026-05-04', '2026-05-04')]);

    assert.deepEqual(items, []);
    assert.equal(unchanged, 1);
    assert.equal(unmeasured, 0);
});

test('endDateChanges counts blank or unparseable dates as unmeasured', () => {
    const { items, unchanged, unmeasured } = endDateChanges([
        moved('', '2026-05-04', { 'First End Date': '' }),
        moved('2026-05-04', ''),
        moved('not a date', '2026-05-04', { 'First End Date': '' }),
        moved('2026-02-30', '2026-05-04', { 'First End Date': '' }),
        moved('5/4/2026', '2026-05-04', { 'First End Date': '' }),
        {}
    ]);

    assert.deepEqual(items, []);
    assert.equal(unchanged, 0);
    assert.equal(unmeasured, 6);
});

test('endDateChanges falls back to First End Date when the original is unusable', () => {
    const { items } = endDateChanges([
        moved('', '2026-05-04', { 'First End Date': '2026-06-03' }),
        moved('2026-13-45', '2026-05-04', { 'First End Date': '2026-05-14' })
    ]);

    assert.equal(items.length, 2);
    assert.deepEqual(items.map((item) => item.baseline), ['2026-06-03', '2026-05-14']);
    assert.deepEqual(items.map((item) => item.days), [30, 10]);
});

test('endDateChanges prefers the original end date over the first observed one', () => {
    const { items } = endDateChanges([
        moved('2026-06-03', '2026-05-04', { 'First End Date': '2026-05-14' })
    ]);

    assert.equal(items[0].baseline, '2026-06-03');
    assert.equal(items[0].days, 30);
});

test('endDateChanges sorts cuts deepest first, then extensions nearest first', () => {
    const { items } = endDateChanges([
        moved('2026-05-04', '2026-06-03'),  // -30
        moved('2026-05-05', '2026-05-04'),  // 1
        moved('2026-05-04', '2026-05-05'),  // -1
        moved('2026-06-03', '2026-05-04'),  // 30
        moved('2026-05-04', '2026-05-04')   // unchanged
    ]);

    assert.deepEqual(items.map((item) => item.days), [30, 1, -1, -30]);
});

test('endDateChanges breaks ties on Award ID', () => {
    const { items } = endDateChanges([
        moved('2026-06-03', '2026-05-04', { 'Award ID': 'B' }),
        moved('2026-06-03', '2026-05-04', { 'Award ID': 'A' }),
        moved('2026-06-03', '2026-05-04', { 'Award ID': 'C' })
    ]);

    assert.deepEqual(items.map((item) => item.row['Award ID']), ['A', 'B', 'C']);
});

test('endDateChanges carries the whole row through for display', () => {
    const source = moved('2026-06-03', '2026-05-04', { Recipient: 'Acme Labs' });
    const { items } = endDateChanges([source]);

    assert.equal(items[0].row, source);
});

test('endDateChanges tolerates no rows at all', () => {
    assert.deepEqual(endDateChanges([]), { items: [], unchanged: 0, unmeasured: 0 });
    assert.deepEqual(endDateChanges(null), { items: [], unchanged: 0, unmeasured: 0 });
});

// --- claimOutcome and verificationConflict -----------------------------------

test('claimOutcome is null for rows carrying no claim', () => {
    assert.equal(claimOutcome(row({ 'Auto Status': 'still_terminated' })), null);
    assert.equal(claimOutcome({}), null);
});

test('claimOutcome buckets each Auto Status value', () => {
    const outcome = (autoStatus) =>
        claimOutcome(row({ 'Claiming Source': 'DOGE', 'Auto Status': autoStatus }));

    assert.equal(outcome('still_terminated'), 'verified');
    assert.equal(outcome('naturally_expired'), 'expired');
    assert.equal(outcome('no_termination_signal'), 'no-signal');

    for (const other of ['vacated', 'continued', 'descoped', 'reinstated', 'excluded_by_design', '', 'wat']) {
        assert.equal(outcome(other), 'other', other);
    }

    assert.equal(claimOutcome(row({ 'Claiming Source': 'DOGE' })), 'other');
});

test('CLAIM_OUTCOME_ORDER lists every bucket claimOutcome can return', () => {
    assert.deepEqual(CLAIM_OUTCOME_ORDER, ['verified', 'expired', 'no-signal', 'other']);
});

test('verificationConflict is true for cancelled rows with no termination on record', () => {
    for (const status of CANCELLED_STATUSES) {
        assert.equal(
            verificationConflict(row({ Status: status, 'Auto Status': 'naturally_expired' })),
            true,
            status
        );
        assert.equal(
            verificationConflict(row({ Status: status, 'Auto Status': 'no_termination_signal' })),
            true,
            status
        );
    }
});

test('verificationConflict is false when the record agrees or the row is not cancelled', () => {
    assert.equal(verificationConflict(row({ 'Auto Status': 'still_terminated' })), false);
    assert.equal(verificationConflict(row({ 'Auto Status': '' })), false);
    assert.equal(
        verificationConflict(row({ Status: 'reinstated', 'Auto Status': 'naturally_expired' })),
        false
    );
    assert.equal(
        verificationConflict(row({ Status: 'excluded_by_design', 'Auto Status': 'naturally_expired' })),
        false
    );
    assert.equal(verificationConflict({}), false);
});

test('verificationConflict excludes mirror-tier rows, whose expiry is an artifact', () => {
    assert.equal(
        verificationConflict(
            row({ Sources: 'LocalUSASpendingMirror', 'Auto Status': 'naturally_expired' })
        ),
        false
    );
    // A stronger source alongside the mirror lifts the row out of the exclusion
    assert.equal(
        verificationConflict(
            row({ Sources: 'LocalUSASpendingMirror; NPDV', 'Auto Status': 'naturally_expired' })
        ),
        true
    );
    // DOGE-only rows are claim-only, not mirror, so they can conflict
    assert.equal(
        verificationConflict(
            row({ Sources: 'DOGE', 'Claiming Source': 'DOGE', 'Auto Status': 'no_termination_signal' })
        ),
        true
    );
});

// --- mixes and latestVerification --------------------------------------------

test('tierMix zero-fills every tier', () => {
    assert.deepEqual(tierMix([]), {
        official: 0,
        'nasa-list': 0,
        mirror: 0,
        'claim-only': 0
    });
    assert.deepEqual(tierMix(undefined), tierMix([]));

    assert.deepEqual(
        tierMix([
            row({ Sources: 'FPDS' }),
            row({ Sources: 'USAspendingTerminations; DOGE' }),
            row({ Sources: 'NPDV' }),
            row({ Sources: 'LocalUSASpendingMirror' })
        ]),
        { official: 2, 'nasa-list': 1, mirror: 1, 'claim-only': 0 }
    );
});

test('claimOutcomeMix zero-fills and counts only claimed rows', () => {
    assert.deepEqual(claimOutcomeMix([]), {
        verified: 0,
        expired: 0,
        'no-signal': 0,
        other: 0
    });
    assert.deepEqual(claimOutcomeMix(undefined), claimOutcomeMix([]));

    const mix = claimOutcomeMix([
        row({ 'Claiming Source': 'DOGE', 'Auto Status': 'still_terminated' }),
        row({ 'Claiming Source': 'DOGE', 'Auto Status': 'still_terminated' }),
        row({ 'Claiming Source': 'DOGE', 'Auto Status': 'naturally_expired' }),
        row({ 'Claiming Source': 'DOGE', 'Auto Status': 'vacated' }),
        row({ 'Auto Status': 'still_terminated' })
    ]);

    assert.deepEqual(mix, { verified: 2, expired: 1, 'no-signal': 0, other: 1 });
});

test('latestVerification returns the newest date, or empty when none exists', () => {
    assert.equal(latestVerification([]), '');
    assert.equal(latestVerification(undefined), '');
    assert.equal(latestVerification([row(), row()]), '');
    assert.equal(
        latestVerification([
            row({ 'Auto Verified Date': '2026-05-04' }),
            row({ 'Auto Verified Date': '2026-07-18' }),
            row({ 'Auto Verified Date': '' }),
            row({ 'Auto Verified Date': '2025-12-31' })
        ]),
        '2026-07-18'
    );
});

// --- monthlyActivity ---------------------------------------------------------

test('monthlyActivity buckets ISO modification dates and fills gap months', () => {
    const { months, skipped } = monthlyActivity(
        [
            row({ 'Latest Action Date': '2026-01-15', 'Award Amount': '100' }),
            row({ 'Latest Action Date': '2026-01-31', 'Award Amount': '50' }),
            row({ 'Latest Action Date': '2026-04-02', 'Award Amount': '25' })
        ],
        'cancelled'
    );

    assert.equal(skipped, 0);
    assert.deepEqual(months.map((m) => m.month), ['2026-01', '2026-02', '2026-03', '2026-04']);
    assert.deepEqual(months.map((m) => m.count), [2, 0, 0, 1]);
    assert.deepEqual(months.map((m) => m.dollars), [150, 0, 0, 25]);
    assert.deepEqual(months[1].top, []);
});

test('monthlyActivity fills gap months across a year boundary', () => {
    const { months } = monthlyActivity(
        [
            row({ 'Latest Action Date': '2025-11-01' }),
            row({ 'Latest Action Date': '2026-02-01' })
        ],
        'cancelled'
    );

    assert.deepEqual(months.map((m) => m.month), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('monthlyActivity reads Claim Date in M/D/YYYY for the doge lens', () => {
    const { months, skipped } = monthlyActivity(
        [
            row({ 'Claim Date': '3/21/2025', 'Claimed Savings': '1000' }),
            row({ 'Claim Date': '11/04/2025', 'Claimed Savings': '2000' })
        ],
        'doge'
    );

    assert.equal(skipped, 0);
    assert.equal(months[0].month, '2025-03');
    assert.equal(months.at(-1).month, '2025-11');
    assert.equal(months.length, 9);
});

test('monthlyActivity plots claimed savings for doge and obligations elsewhere', () => {
    const claimed = [
        row({
            'Claim Date': '3/21/2025',
            'Latest Action Date': '2025-03-21',
            'Claimed Savings': '1000',
            'Award Amount': '9999'
        })
    ];

    assert.equal(monthlyActivity(claimed, 'doge').months[0].dollars, 1000);
    assert.equal(monthlyActivity(claimed, 'cancelled').months[0].dollars, 9999);
});

test('monthlyActivity prefers the numeric totalObligations attached at load', () => {
    const withAttached = [
        { ...row({ 'Latest Action Date': '2026-01-05', 'Award Amount': '1' }), totalObligations: 500 }
    ];

    assert.equal(monthlyActivity(withAttached, 'cancelled').months[0].dollars, 500);

    const nullAttached = [
        { ...row({ 'Latest Action Date': '2026-01-05', 'Award Amount': '42' }), totalObligations: null }
    ];

    assert.equal(monthlyActivity(nullAttached, 'cancelled').months[0].dollars, 42);
});

test('monthlyActivity counts unparseable dates as skipped', () => {
    const { months, skipped } = monthlyActivity(
        [
            row({ 'Latest Action Date': '2026-01-05' }),
            row({ 'Latest Action Date': '' }),
            row({ 'Latest Action Date': 'sometime' }),
            row({ 'Latest Action Date': '1/5/2026' }),
            row({ 'Latest Action Date': '2026-13-05' })
        ],
        'cancelled'
    );

    assert.equal(skipped, 4);
    assert.equal(months.length, 1);
    assert.equal(months[0].count, 1);

    assert.deepEqual(monthlyActivity([], 'cancelled'), { months: [], skipped: 0 });
    assert.deepEqual(monthlyActivity(undefined, 'cancelled'), { months: [], skipped: 0 });
});

test('monthlyActivity returns the three largest recipients per month, largest first', () => {
    const { months } = monthlyActivity(
        [
            row({ 'Latest Action Date': '2026-01-05', Recipient: 'Small', 'Award Amount': '10' }),
            row({ 'Latest Action Date': '2026-01-06', Recipient: 'Big', 'Award Amount': '400' }),
            row({ 'Latest Action Date': '2026-01-07', Recipient: 'Mid', 'Award Amount': '200' }),
            row({ 'Latest Action Date': '2026-01-08', Recipient: 'Huge', 'Award Amount': '900' })
        ],
        'cancelled'
    );

    assert.deepEqual(months[0].top, [
        { recipient: 'Huge', amount: 900 },
        { recipient: 'Big', amount: 400 },
        { recipient: 'Mid', amount: 200 }
    ]);
    assert.equal(months[0].count, 4);
    assert.equal(months[0].dollars, 1510);
});

test('monthlyActivity counts rows with no readable value but adds zero dollars', () => {
    const { months } = monthlyActivity(
        [
            row({ 'Latest Action Date': '2026-01-05', 'Award Amount': '' }),
            row({ 'Latest Action Date': '2026-01-06', 'Award Amount': '100' })
        ],
        'cancelled'
    );

    assert.equal(months[0].count, 2);
    assert.equal(months[0].dollars, 100);
});

// --- integrity against the deployed ledger ----------------------------------

const ledgerRows = parseCSV(readFileSync(LEDGER_PATH, 'utf8'));
const metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
const lensRows = Object.fromEntries(LENSES.map((lens) => [lens, applyLens(ledgerRows, lens)]));

test('parsed ledger row count matches metadata.rowCount', () => {
    assert.equal(ledgerRows.length, metadata.rowCount);
});

test('cancelled and suspicious split the cancelled-status set, minus the extensions', () => {
    const cancelledStatusRows = ledgerRows.filter((r) => CANCELLED_STATUSES.includes(r.Status));
    let carvedOut = 0;

    for (const r of cancelledStatusRows) {
        const flags = categorize(r);
        assert.ok(!(flags.cancelled && flags.suspicious), `in both lenses: ${r['Award ID']}`);

        // The named predicate and the lens flags must tell the same story
        assert.equal(
            isExtensionCarveOut(r, flags),
            !(flags.cancelled || flags.suspicious),
            r['Award ID']
        );

        if (flags.cancelled || flags.suspicious) continue;

        // The only way out of both lenses: date-only evidence that turned out
        // to extend the award
        carvedOut++;
        const { items } = endDateChanges([r]);
        assert.equal(items.length, 1, `unexplained drop-out: ${r['Award ID']}`);
        assert.ok(items[0].days < 0, `unexplained drop-out: ${r['Award ID']}`);
    }

    assert.ok(carvedOut > 0, `carvedOut=${carvedOut}`);

    for (const r of [...lensRows.cancelled, ...lensRows.suspicious]) {
        assert.ok(CANCELLED_STATUSES.includes(r.Status), `unexpected status ${r.Status}`);
    }
});

test('reversed lens matches the reversed-status count', () => {
    const expected = ledgerRows.filter((r) => REVERSED_STATUSES.includes(r.Status)).length;

    assert.equal(lensRows.reversed.length, expected);
});

test('doge lens matches the DOGE claiming-source count', () => {
    const expected = ledgerRows.filter((r) => r['Claiming Source'] === 'DOGE').length;

    assert.equal(lensRows.doge.length, expected);
});

test('no outcome lens contains excluded or under-review rows', () => {
    // The doge lens is deliberately not checked: it is the claims ledger and
    // follows the claim regardless of status, so a future DOGE claim on an
    // excluded award belongs there.
    for (const lens of ['cancelled', 'suspicious', 'reversed']) {
        for (const r of lensRows[lens]) {
            assert.ok(
                !NON_LENS_STATUSES.includes(r.Status),
                `${lens} lens leaked status ${r.Status}`
            );
        }
    }
});

test('summarize over the full ledger produces sane totals', () => {
    const stats = summarize(ledgerRows);
    const vacated = ledgerRows.filter((r) => r.Status === 'vacated').length;

    assert.equal(stats.count, ledgerRows.length);
    // 359 rows span ~140 distinct districts today; 100 is a loose floor that
    // survives daily refreshes while still catching a broken District read.
    assert.ok(stats.districts > 100, `districts=${stats.districts}`);
    assert.ok(stats.districts < ledgerRows.length, `districts=${stats.districts}`);
    assert.ok(stats.totalObligations > 0, `totalObligations=${stats.totalObligations}`);
    assert.ok(stats.claimedSavings > 0, `claimedSavings=${stats.claimedSavings}`);
    assert.equal(stats.courtVacaturs, vacated);
});

test('tierMix partitions the whole ledger and every tier is populated', () => {
    // Exact counts are deliberately not pinned: the ledger refreshes daily.
    const mix = tierMix(ledgerRows);

    assert.deepEqual(Object.keys(mix).sort(), [...EVIDENCE_TIER_ORDER].sort());
    assert.equal(
        EVIDENCE_TIER_ORDER.reduce((sum, tier) => sum + mix[tier], 0),
        ledgerRows.length
    );

    for (const tier of EVIDENCE_TIER_ORDER) {
        assert.ok(mix[tier] > 0, `${tier}=${mix[tier]}`);
    }
});

test('every ledger row carries only recognized source names', () => {
    // evidenceTier warns on unknown sources; a clean run means the vocabulary
    // in SOURCE_TIER_RANK still covers the upstream data.
    const warnings = captureWarnings(() => {
        for (const r of ledgerRows) evidenceTier(r);
    });

    assert.deepEqual(warnings, []);
});

test('claimOutcomeMix covers exactly the rows carrying a claim', () => {
    const claimed = ledgerRows.filter((r) => r['Claiming Source']);
    const mix = claimOutcomeMix(ledgerRows);

    assert.deepEqual(Object.keys(mix).sort(), [...CLAIM_OUTCOME_ORDER].sort());
    assert.equal(
        CLAIM_OUTCOME_ORDER.reduce((sum, outcome) => sum + mix[outcome], 0),
        claimed.length
    );
    assert.ok(claimed.length > 0, `claimed=${claimed.length}`);
    assert.ok(mix.verified > 0, `verified=${mix.verified}`);
});

test('verification conflicts are a real but minority slice of cancelled rows', () => {
    const cancelledStatusRows = ledgerRows.filter((r) => CANCELLED_STATUSES.includes(r.Status));
    // Explicit lambda: verificationConflict's optional second parameter is a
    // precomputed tier, which Array.filter would clobber with the index
    const conflicts = ledgerRows.filter((r) => verificationConflict(r));

    assert.ok(conflicts.length > 0, `conflicts=${conflicts.length}`);
    assert.ok(conflicts.length < cancelledStatusRows.length, `conflicts=${conflicts.length}`);

    for (const r of conflicts) {
        assert.ok(CANCELLED_STATUSES.includes(r.Status), `unexpected status ${r.Status}`);
        assert.notEqual(evidenceTier(r), 'mirror', `mirror row leaked: ${r['Award ID']}`);
    }
});

test('latestVerification over the ledger returns a plausible ISO date', () => {
    const latest = latestVerification(ledgerRows);

    assert.match(latest, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(latest >= '2025-01-01', latest);
});

test('suspicious-lens truncations are measurable now that original end dates are populated', () => {
    // Before the July 2026 schema the suspicious lens was entirely
    // unmeasurable (the cut predated first observation); Initial Reported
    // End Date reopened it
    const measurableSuspicious = lensRows.suspicious
        .map((r) => truncationDays(r))
        .filter((days) => days !== null);

    assert.ok(measurableSuspicious.length > 0, `measurable=${measurableSuspicious.length}`);

    const measurable = ledgerRows.map((r) => truncationDays(r)).filter((days) => days !== null);

    assert.ok(measurable.length >= measurableSuspicious.length);
    for (const days of measurable) assert.ok(days > 0, `days=${days}`);
});

test('monthlyActivity covers every ledger row across the lenses', () => {
    for (const lens of LENSES) {
        const rows = lensRows[lens];
        const { months, skipped } = monthlyActivity(rows, lens);
        const counted = months.reduce((sum, m) => sum + m.count, 0);

        assert.equal(counted + skipped, rows.length, lens);
        assert.ok(months.length > 0, lens);

        // Months are ascending, continuous, and well-formed
        for (const [index, entry] of months.entries()) {
            assert.match(entry.month, /^\d{4}-\d{2}$/, lens);
            assert.ok(entry.top.length <= 3, lens);
            if (index > 0) assert.ok(entry.month > months[index - 1].month, lens);
        }

        const [firstYear, firstMonth] = months[0].month.split('-').map(Number);
        const [lastYear, lastMonth] = months.at(-1).month.split('-').map(Number);
        const span = (lastYear * 12 + lastMonth) - (firstYear * 12 + firstMonth) + 1;

        assert.equal(months.length, span, lens);
    }

    // Every non-doge lens dates rows off a column that is always populated
    for (const lens of ['cancelled', 'suspicious', 'reversed']) {
        assert.equal(monthlyActivity(lensRows[lens], lens).skipped, 0, lens);
    }
});

test('endDateChanges measures every suspicious-lens row against its original end date', () => {
    // The whole point of the Suspicious lens: a cut nobody announced, now
    // measurable because Initial Reported End Date is populated
    const { items, unchanged, unmeasured } = endDateChanges(lensRows.suspicious);

    assert.equal(items.length + unchanged + unmeasured, lensRows.suspicious.length);
    assert.ok(items.length > 0, `items=${items.length}`);

    for (const item of items) {
        // Structural, not incidental: categorize carves extensions out of the
        // lens with the same measurement endDateChanges makes
        assert.ok(item.days > 0, item.row['Award ID']);
        assert.ok(item.baseline > item.current, item.row['Award ID']);
        assert.match(item.baseline, /^\d{4}-\d{2}-\d{2}$/);
        assert.match(item.current, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(item.row, 'item carries its row');
    }
});

test('endDateChanges returns the deployed ledger in strict display order', () => {
    for (const lens of LENSES) {
        const { items } = endDateChanges(lensRows[lens]);

        for (let i = 1; i < items.length; i++) {
            const previous = items[i - 1];
            const current = items[i];

            assert.ok(previous.days >= current.days, `${lens} at ${i}`);

            if (previous.days === current.days) {
                assert.ok(
                    previous.row['Award ID'] <= current.row['Award ID'],
                    `${lens} tie at ${i}`
                );
            }
        }
    }
});

test('endDateChanges accounts for every row of every lens', () => {
    for (const lens of LENSES) {
        const { items, unchanged, unmeasured } = endDateChanges(lensRows[lens]);

        assert.equal(items.length + unchanged + unmeasured, lensRows[lens].length, lens);
    }

    const whole = endDateChanges(ledgerRows);

    assert.equal(whole.items.length + whole.unchanged + whole.unmeasured, ledgerRows.length);
});

test('measured suspicious truncations agree with the chart movements', () => {
    // truncationDays and endDateChanges read the same two columns from
    // different directions; where both speak they must not disagree
    for (const r of lensRows.suspicious) {
        const days = truncationDays(r);
        if (days === null) continue;

        const { items } = endDateChanges([r]);

        assert.equal(items.length, 1, r['Award ID']);
        assert.equal(items[0].days, days, r['Award ID']);
    }
});
