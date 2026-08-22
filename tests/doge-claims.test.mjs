import test from 'node:test';
import assert from 'node:assert/strict';
import { dogeClaimRow, loadCsv, withoutColumns } from './fixtures.mjs';
import {
    BAR_SEGMENTS,
    OUTCOME_META,
    OUTCOME_ORDER,
    SEGMENT_META,
    claimOutcome,
    dogeStats,
    normalizeDogeClaims,
    outcomeMix,
    overlapWithTerminations,
    statusLabel
} from '../docs/cancellations/js/doge-claims.js';

const CLAIMS_PATH = 'docs/data/cancellations/doge_claims.csv';
const TERMINATIONS_PATH = 'docs/data/cancellations/terminations.csv';

// ---------------------------------------------------------------------------
// claimOutcome truth table
// ---------------------------------------------------------------------------

test('claimOutcome returns unmatched when the award was never found', () => {
    const row = dogeClaimRow({
        usaspending_found: 'false',
        has_explicit_termination: 'false',
        doge_award_id: '',
        generated_award_id: '',
        current_end_date: ''
    });

    assert.equal(claimOutcome(row), 'unmatched');
});

test('claimOutcome treats a name-only claim (blank award id) as unmatched', () => {
    // The 4 unmatched live rows carry a recipient name and nothing else; it is
    // usaspending_found that decides, not the blank id.
    const row = dogeClaimRow({
        claim_type: 'grant',
        doge_award_id: '',
        generated_award_id: '',
        doge_status: '',
        usaspending_found: 'false',
        has_explicit_termination: 'false',
        current_obligation: '',
        current_end_date: ''
    });

    assert.equal(claimOutcome(row), 'unmatched');
});

test('claimOutcome outranks a termination flag with a missing match', () => {
    // Rule order, not a preference ranking: with no matched award there is no
    // transaction history for the termination flag to describe.
    const row = dogeClaimRow({ usaspending_found: 'false', has_explicit_termination: 'true' });

    assert.equal(claimOutcome(row), 'unmatched');
});

test('claimOutcome returns terminated on an explicit termination action', () => {
    const row = dogeClaimRow({ usaspending_found: 'true', has_explicit_termination: 'true' });

    assert.equal(claimOutcome(row), 'terminated');
});

test('claimOutcome prefers the termination action over a passed end date', () => {
    const row = dogeClaimRow({
        has_explicit_termination: 'true',
        current_end_date: '2025-06-06',
        checked_date: '2026-08-20'
    });

    assert.equal(claimOutcome(row), 'terminated');
});

test('claimOutcome returns ended when the end date precedes the check date', () => {
    const row = dogeClaimRow({
        has_explicit_termination: 'false',
        current_end_date: '2025-06-06',
        checked_date: '2026-08-20'
    });

    assert.equal(claimOutcome(row), 'ended');
});

test('claimOutcome returns active when the end date is still ahead', () => {
    const row = dogeClaimRow({
        has_explicit_termination: 'false',
        current_end_date: '2027-01-31',
        checked_date: '2026-08-20'
    });

    assert.equal(claimOutcome(row), 'active');
});

test('claimOutcome returns active when the end date equals the check date', () => {
    const row = dogeClaimRow({
        has_explicit_termination: 'false',
        current_end_date: '2026-08-20',
        checked_date: '2026-08-20'
    });

    assert.equal(claimOutcome(row), 'active');
});

test('claimOutcome returns active when the end date is blank', () => {
    // A blank string sorts before every real date, so a naive string compare
    // would call this "ended". It is not: we simply do not know when it ends.
    const row = dogeClaimRow({ has_explicit_termination: 'false', current_end_date: '' });

    assert.equal(claimOutcome(row), 'active');
});

test('claimOutcome returns active when the end date is not a calendar date', () => {
    const row = dogeClaimRow({ has_explicit_termination: 'false', current_end_date: '2025-02-30' });

    assert.equal(claimOutcome(row), 'active');
});

test('claimOutcome returns active when the check date is missing', () => {
    const row = dogeClaimRow({
        has_explicit_termination: 'false',
        current_end_date: '2025-06-06',
        checked_date: ''
    });

    assert.equal(claimOutcome(row), 'active');
});

test('claimOutcome treats a dropped usaspending_found column as unmatched, without throwing', () => {
    const [row] = withoutColumns([dogeClaimRow()], 'usaspending_found');

    assert.equal(claimOutcome(row), 'unmatched');
});

// ---------------------------------------------------------------------------
// Status label normalization
// ---------------------------------------------------------------------------

test('statusLabel renders a blank DOGE status as "Not stated"', () => {
    assert.equal(statusLabel(dogeClaimRow({ doge_status: '' })), 'Not stated');
    assert.equal(statusLabel(dogeClaimRow({ doge_status: '   ' })), 'Not stated');
});

test('statusLabel sentence-cases ALL-CAPS DOGE statuses', () => {
    const cases = [
        ['TERMINATED', 'Terminated'],
        ['FUNDING ONLY ACTION', 'Funding only action'],
        ['OTHER ADMINISTRATIVE ACTION', 'Other administrative action'],
        ['SUPPLEMENTAL AGREEMENT FOR WORK WITHIN SCOPE', 'Supplemental agreement for work within scope'],
        [
            'ADDITIONAL WORK (NEW AGREEMENT, JUSTIFICATION REQUIRED)',
            'Additional work (new agreement, justification required)'
        ]
    ];

    for (const [raw, expected] of cases) {
        assert.equal(statusLabel(dogeClaimRow({ doge_status: raw })), expected, raw);
    }
});

test('statusLabel keeps known acronyms uppercase', () => {
    assert.equal(statusLabel(dogeClaimRow({ doge_status: 'NOT FOUND IN FPDS' })), 'Not found in FPDS');
});

test('statusLabel leaves an already mixed-case status alone', () => {
    assert.equal(statusLabel(dogeClaimRow({ doge_status: 'Expired' })), 'Expired');
});

test('statusLabel trims surrounding whitespace', () => {
    assert.equal(statusLabel(dogeClaimRow({ doge_status: '  TERMINATED  ' })), 'Terminated');
});

// ---------------------------------------------------------------------------
// normalizeDogeClaims
// ---------------------------------------------------------------------------

test('normalizeDogeClaims derives the panel fields for a row', () => {
    const { rows } = normalizeDogeClaims([
        dogeClaimRow({
            doge_savings: '604288',
            doge_value: '911540',
            current_obligation: '149834.25',
            doge_status: 'FUNDING ONLY ACTION',
            pop_state: 'MA',
            pop_district: '07'
        })
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]._savings, 604288);
    assert.equal(rows[0]._value, 911540);
    assert.equal(rows[0]._obligation, 149834.25);
    assert.equal(rows[0]._district, 'MA-07');
    assert.equal(rows[0]._statusLabel, 'Funding only action');
    assert.equal(rows[0]._outcome, 'terminated');
});

test('normalizeDogeClaims maps a blank savings figure to null, not 0', () => {
    const { rows } = normalizeDogeClaims([
        dogeClaimRow({ doge_savings: '' }),
        dogeClaimRow({ doge_savings: '0' })
    ]);

    assert.equal(rows[0]._savings, null);
    assert.equal(rows[1]._savings, 0);
    // The distinction has to survive: "no figure published" and "$0 saved" are
    // different claims, even though both count toward noFigureCount.
    assert.notEqual(rows[0]._savings, rows[1]._savings);
});

test('normalizeDogeClaims falls back to the recipient district, then to ""', () => {
    const { rows } = normalizeDogeClaims([
        dogeClaimRow({ pop_state: '', pop_district: '', recipient_state: 'VA', recipient_district: '11' }),
        dogeClaimRow({ pop_state: '', pop_district: '', recipient_state: '', recipient_district: '' })
    ]);

    assert.equal(rows[0]._district, 'VA-11');
    assert.equal(rows[1]._district, '');
});

test('normalizeDogeClaims does not mutate the rows it was given', () => {
    const raw = dogeClaimRow();
    normalizeDogeClaims([raw]);

    assert.equal(raw._outcome, undefined);
    assert.equal(raw._savings, undefined);
});

test('normalizeDogeClaims reports column availability', () => {
    const rows = [dogeClaimRow()];

    const present = normalizeDogeClaims(rows).columns;
    assert.deepEqual(present, {
        popDistrict: true,
        recipientDistrict: true,
        district: true,
        totalPotentialValue: true
    });

    const noPop = normalizeDogeClaims(withoutColumns(rows, ['pop_state', 'pop_district'])).columns;
    assert.equal(noPop.popDistrict, false);
    assert.equal(noPop.recipientDistrict, true);
    assert.equal(noPop.district, true, 'the recipient pair still yields districts');

    const noDistricts = normalizeDogeClaims(
        withoutColumns(rows, ['pop_state', 'pop_district', 'recipient_state', 'recipient_district'])
    ).columns;
    assert.equal(noDistricts.district, false);

    const noPotential = normalizeDogeClaims(withoutColumns(rows, 'total_potential_value')).columns;
    assert.equal(noPotential.totalPotentialValue, false);
});

test('normalizeDogeClaims tolerates empty and non-array input', () => {
    for (const input of [[], null, undefined]) {
        const { rows, columns } = normalizeDogeClaims(input);
        assert.deepEqual(rows, []);
        assert.equal(columns.district, false);
        assert.equal(columns.totalPotentialValue, false);
    }
});

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

test('OUTCOME_META covers every outcome with bar and badge copy', () => {
    assert.deepEqual(Object.keys(OUTCOME_META).sort(), [...OUTCOME_ORDER].sort());

    for (const outcome of OUTCOME_ORDER) {
        const meta = OUTCOME_META[outcome];
        assert.ok(meta.label, `${outcome} label`);
        assert.ok(meta.short, `${outcome} short`);
        assert.ok(meta.description.endsWith('.'), `${outcome} description is a sentence`);
        assert.ok(BAR_SEGMENTS.includes(meta.segment), `${outcome} rolls up into a real segment`);
    }
});

test('ended and active share a bar label but differ in the table', () => {
    assert.equal(OUTCOME_META.ended.label, OUTCOME_META.active.label);
    assert.equal(OUTCOME_META.ended.segment, OUTCOME_META.active.segment);
    assert.notEqual(OUTCOME_META.ended.short, OUTCOME_META.active.short);
});

test('SEGMENT_META covers the three bar segments with the red-ramp classes', () => {
    assert.deepEqual(Object.keys(SEGMENT_META).sort(), [...BAR_SEGMENTS].sort());
    assert.deepEqual(
        BAR_SEGMENTS.map((segment) => SEGMENT_META[segment].segClass),
        ['seg--outcome-strong', 'seg--outcome-mid', 'seg--outcome-weak']
    );

    for (const segment of BAR_SEGMENTS) {
        assert.ok(SEGMENT_META[segment].label, `${segment} label`);
        assert.ok(SEGMENT_META[segment].description, `${segment} definition is printable`);
    }
});

// ---------------------------------------------------------------------------
// outcomeMix
// ---------------------------------------------------------------------------

test('outcomeMix collapses ended and active into one segment', () => {
    const { rows } = normalizeDogeClaims([
        dogeClaimRow({ has_explicit_termination: 'true' }),
        dogeClaimRow({ has_explicit_termination: 'false', current_end_date: '2025-01-01' }),
        dogeClaimRow({ has_explicit_termination: 'false', current_end_date: '2030-01-01' }),
        dogeClaimRow({ usaspending_found: 'false', has_explicit_termination: 'false' })
    ]);

    assert.deepEqual(outcomeMix(rows), { terminated: 1, noTermination: 2, unmatched: 1 });
});

test('outcomeMix zero-fills every segment', () => {
    for (const rows of [[], null, undefined]) {
        assert.deepEqual(outcomeMix(rows), { terminated: 0, noTermination: 0, unmatched: 0 });
    }
});

test('outcomeMix derives outcomes for un-normalized rows', () => {
    assert.deepEqual(outcomeMix([dogeClaimRow()]), { terminated: 1, noTermination: 0, unmatched: 0 });
});

// ---------------------------------------------------------------------------
// dogeStats
// ---------------------------------------------------------------------------

test('dogeStats summarizes claims, savings and outcomes', () => {
    const { rows } = normalizeDogeClaims([
        dogeClaimRow({ doge_savings: '1000', has_explicit_termination: 'true' }),
        dogeClaimRow({ doge_savings: '250.50', has_explicit_termination: 'false', current_end_date: '2030-01-01' }),
        dogeClaimRow({ doge_savings: '0', has_explicit_termination: 'false', current_end_date: '2025-01-01' }),
        dogeClaimRow({ doge_savings: '', usaspending_found: 'false', has_explicit_termination: 'false' }),
        dogeClaimRow({ doge_savings: '99', usaspending_found: 'false', has_explicit_termination: 'false' })
    ]);

    assert.deepEqual(dogeStats(rows), {
        count: 5,
        claimedSavings: 1349.5,
        claimedOnActive: 250.5,
        noFigureCount: 2,
        terminated: 1,
        unmatched: 2,
        expiredButTerminated: 0,
        checkedDate: '2026-08-20'
    });
});

test('dogeStats counts DOGE-"Expired" claims whose record shows a termination', () => {
    const { rows } = normalizeDogeClaims([
        dogeClaimRow({ doge_status: 'Expired', has_explicit_termination: 'true' }),
        dogeClaimRow({ doge_status: 'EXPIRED', has_explicit_termination: 'true' }),
        dogeClaimRow({ doge_status: 'Expired', has_explicit_termination: 'false', current_end_date: '2025-01-01' }),
        dogeClaimRow({ doge_status: 'TERMINATED', has_explicit_termination: 'true' })
    ]);

    // Case-insensitive on DOGE's label; only counted when the record's
    // outcome is 'terminated' (the third row ended without a termination)
    assert.equal(dogeStats(rows).expiredButTerminated, 2);
});

test('dogeStats counts both blank and zero savings as "no figure"', () => {
    const { rows } = normalizeDogeClaims([
        dogeClaimRow({ doge_savings: '' }),
        dogeClaimRow({ doge_savings: '0' }),
        dogeClaimRow({ doge_savings: '0.00' }),
        dogeClaimRow({ doge_savings: '1' })
    ]);

    assert.equal(dogeStats(rows).noFigureCount, 3);
    assert.equal(dogeStats(rows).claimedSavings, 1);
});

test('dogeStats takes the latest checked_date across rows', () => {
    const rows = [
        dogeClaimRow({ checked_date: '2026-08-19' }),
        dogeClaimRow({ checked_date: '2026-08-20' }),
        dogeClaimRow({ checked_date: '' })
    ];

    assert.equal(dogeStats(rows).checkedDate, '2026-08-20');
});

test('dogeStats returns zeros for an empty set', () => {
    assert.deepEqual(dogeStats([]), {
        count: 0,
        claimedSavings: 0,
        claimedOnActive: 0,
        noFigureCount: 0,
        terminated: 0,
        unmatched: 0,
        expiredButTerminated: 0,
        checkedDate: ''
    });
});

test('dogeStats works on un-normalized rows', () => {
    const stats = dogeStats([dogeClaimRow({ doge_savings: '500' })]);

    assert.equal(stats.claimedSavings, 500);
    assert.equal(stats.terminated, 1);
});

// ---------------------------------------------------------------------------
// overlapWithTerminations
// ---------------------------------------------------------------------------

test('overlapWithTerminations counts rows matched on the long USAspending key', () => {
    const rows = [
        dogeClaimRow({ generated_award_id: 'CONT_AWD_A_8000', doge_award_id: 'A' }),
        dogeClaimRow({ generated_award_id: 'CONT_AWD_B_8000', doge_award_id: 'B' }),
        dogeClaimRow({ generated_award_id: '', doge_award_id: '' })
    ];

    assert.equal(overlapWithTerminations(rows, new Set(['CONT_AWD_A_8000'])), 1);
});

test('overlapWithTerminations counts rows matched on the bare PIID', () => {
    const rows = [
        dogeClaimRow({ generated_award_id: 'CONT_AWD_A_8000', doge_award_id: 'A' }),
        dogeClaimRow({ generated_award_id: 'CONT_AWD_B_8000', doge_award_id: 'B' })
    ];

    // terminationIdSet may be keyed on award_id rather than generated_award_id;
    // either flavour of Set has to work against the same rows.
    assert.equal(overlapWithTerminations(rows, new Set(['A', 'B'])), 2);
});

test('overlapWithTerminations counts each row once even when both keys match', () => {
    const rows = [dogeClaimRow({ generated_award_id: 'CONT_AWD_A_8000', doge_award_id: 'A' })];

    assert.equal(overlapWithTerminations(rows, new Set(['A', 'CONT_AWD_A_8000'])), 1);
});

test('overlapWithTerminations never matches on a blank identifier', () => {
    const rows = [dogeClaimRow({ generated_award_id: '', doge_award_id: '' })];

    assert.equal(overlapWithTerminations(rows, new Set([''])), 0);
});

test('overlapWithTerminations returns 0 for empty or missing input', () => {
    assert.equal(overlapWithTerminations([dogeClaimRow()], new Set()), 0);
    assert.equal(overlapWithTerminations([dogeClaimRow()], undefined), 0);
    assert.equal(overlapWithTerminations([], new Set(['A'])), 0);
});

// ---------------------------------------------------------------------------
// Live-CSV smoke tests
//
// doge_claims.csv is refreshed daily by a workflow that auto-commits, so these
// assert accounting and shape invariants that survive data growth rather than
// the day's figures. Each test names the value observed on 2026-08-21 so drift
// stays visible to a reader.
// ---------------------------------------------------------------------------

const liveRaw = loadCsv(CLAIMS_PATH);
const live = normalizeDogeClaims(liveRaw);
const liveStats = dogeStats(live.rows);

test('live doge_claims.csv partitions cleanly across the four outcomes', () => {
    // 2026-08-21: 112 rows partitioning 89 terminated / 11 ended / 8 active / 4 unmatched
    assert.ok(live.rows.length >= 50, `rows=${live.rows.length}`);
    assert.equal(live.columns.district, true);
    assert.equal(live.columns.totalPotentialValue, true);

    const partition = Object.fromEntries(OUTCOME_ORDER.map((outcome) => [outcome, 0]));
    for (const row of live.rows) partition[row._outcome]++;

    // Every row lands in exactly one known outcome: no row is uncategorized,
    // and no outcome outside OUTCOME_ORDER appears
    assert.equal(
        OUTCOME_ORDER.reduce((sum, outcome) => sum + partition[outcome], 0),
        live.rows.length
    );
    assert.ok(
        partition.terminated >= partition.unmatched,
        `terminated=${partition.terminated} unmatched=${partition.unmatched}`
    );
});

test('live doge_claims.csv aggregates into the 3-segment bar without losing a row', () => {
    // 2026-08-21: 89 terminated / 19 noTermination / 4 unmatched
    const mix = outcomeMix(live.rows);
    const partition = Object.fromEntries(OUTCOME_ORDER.map((outcome) => [outcome, 0]));
    for (const row of live.rows) partition[row._outcome]++;

    assert.equal(mix.terminated + mix.noTermination + mix.unmatched, live.rows.length);

    // The bar is a strict roll-up of the outcome partition
    assert.equal(mix.terminated, partition.terminated);
    assert.equal(mix.noTermination, partition.ended + partition.active);
    assert.equal(mix.unmatched, partition.unmatched);
});

test('live doge_claims.csv stats stay internally consistent', () => {
    // 2026-08-21: 112 claims, $78,591,434 claimed ($11,801,954 of it on
    // still-active awards), 62 with no figure, 89 terminated, 4 unmatched
    assert.equal(liveStats.count, live.rows.length);
    assert.ok(liveStats.claimedSavings > 0, `claimedSavings was ${liveStats.claimedSavings}`);
    assert.ok(liveStats.claimedOnActive >= 0);
    assert.ok(
        liveStats.claimedOnActive <= liveStats.claimedSavings,
        'savings claimed on active awards are a subset of all claimed savings'
    );
    assert.ok(liveStats.noFigureCount <= liveStats.count);
    assert.ok(liveStats.terminated + liveStats.unmatched <= liveStats.count);
    assert.match(liveStats.checkedDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('live doge_claims.csv rolls both blank and zero savings into noFigureCount', () => {
    // Upstream currently writes "no figure" as a literal '0' rather than a
    // blank; either flavour has to reach the same counter.
    // 2026-08-21: 0 blank, 62 literal zero
    const blank = live.rows.filter((row) => row._savings === null).length;
    const zero = live.rows.filter((row) => row._savings === 0).length;

    assert.equal(blank + zero, liveStats.noFigureCount);
});

test('live doge_claims.csv carries one file-wide checked_date', () => {
    // 2026-08-21: every row reads '2026-08-20'
    const dates = new Set(liveRaw.map((row) => row.checked_date));

    assert.equal(dates.size, 1, `checked_date values: ${[...dates].join(', ')}`);
    assert.match([...dates][0], /^\d{4}-\d{2}-\d{2}$/);
});

test('live doge_claims.csv normalizes every DOGE status to a printable label', () => {
    const labels = new Set(live.rows.map((row) => row._statusLabel));

    assert.ok(labels.size > 0);

    for (const label of labels) {
        assert.notEqual(label, '', 'no row renders an empty status');
        assert.notEqual(label, label.toUpperCase(), `"${label}" is still shouting`);
    }
});

test('live doge_claims.csv shares awards with terminations.csv on either key', () => {
    // 2026-08-21: 88 of 112 claims overlap
    const terminations = loadCsv(TERMINATIONS_PATH);

    // Verified against both flavours of key: whichever column terminationIdSet
    // is built from, the overlap is the same set of awards.
    const byGeneratedId = new Set(terminations.map((row) => row.generated_award_id).filter(Boolean));
    const byAwardId = new Set(terminations.map((row) => row.award_id).filter(Boolean));
    const overlap = overlapWithTerminations(live.rows, byGeneratedId);

    assert.equal(overlapWithTerminations(live.rows, byAwardId), overlap);
    assert.ok(overlap > 0);
    assert.ok(
        overlap <= Math.min(live.rows.length, terminations.length),
        `overlap=${overlap} claims=${live.rows.length} terminations=${terminations.length}`
    );
});
