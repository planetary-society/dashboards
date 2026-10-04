import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
	buildFirstTopPaper,
	buildMissionScopeStats,
	firstEraTop,
	buildTiers,
	divisionTotal,
	isFailure,
	isShortfall,
	isRankable,
	missionTop1,
	missionTop10,
	scopeField,
	SCOPES,
	WINDOWED_SCOPES
} from '../lib/measures.mjs';

const measured = {
	short_title: 'Big',
	mission_status: 'Completed',
	cost_bin: '$1B - $2.5B',
	lifetime_papers: 100,
	lifetime_citations: 5000,
	lifetime_cohort_top10: 20,
	window_status: 'available',
	window_papers: 40,
	window_citations: 900,
	window_cohort_top10: 8,
	window_top_k: { 1: 2, 10: 9 },
	full_mission_status: 'available',
	full_mission_output_basis: 'measured',
	full_mission_papers: 70,
	full_mission_citations: 2000,
	full_mission_cohort_top10: 14,
	full_mission_top_k: { 1: 3, 10: 15 }
};

const unavailable = {
	short_title: 'Lost',
	mission_status: 'Failed',
	cost_bin: '< $100M',
	lifetime_papers: null,
	lifetime_citations: null,
	lifetime_cohort_top10: null,
	window_status: 'available',
	window_papers: null,
	window_citations: null,
	window_cohort_top10: null,
	window_top_k: { 1: null, 10: null },
	full_mission_status: 'available',
	full_mission_papers: null,
	full_mission_citations: null,
	full_mission_cohort_top10: null,
	full_mission_top_k: { 1: null, 10: null }
};

describe('scopes', () => {
	it('lists the full-mission scope first and keeps top 1% to the windowed scopes', () => {
		assert.deepEqual(SCOPES, ['full', 'window', 'lifetime']);
		assert.deepEqual(WINDOWED_SCOPES, ['full', 'window']);
	});

	it('reads each scope through its raw field prefix', () => {
		assert.equal(scopeField(measured, 'full', 'papers'), 70);
		assert.equal(scopeField(measured, 'window', 'papers'), 40);
		assert.equal(scopeField(measured, 'lifetime', 'papers'), 100);
		assert.equal(missionTop10(measured, 'full'), 14);
		assert.equal(missionTop1(measured, 'full'), 3);
		assert.equal(missionTop1(measured, 'window'), 2);
		assert.equal(missionTop1(measured, 'lifetime'), null);
	});

	it('throws on an unknown scope rather than reading undefined', () => {
		assert.throws(() => scopeField(measured, 'prime', 'papers'), /unknown scope: prime/);
		assert.throws(() => missionTop10(measured, 'full_mission'), /unknown scope: full_mission/);
	});
});

describe('isFailure', () => {
	it('normalises both failure spellings in the data', () => {
		assert.equal(isFailure('Failure'), true);
		assert.equal(isFailure('Failed'), true);
		assert.equal(isFailure('failure'), true);
		assert.equal(isFailure('Partial Success'), false);
		assert.equal(isFailure('Completed'), false);
		assert.equal(isFailure(null), false);
	});

	it('counts partial failures and partial successes as shortfalls, failures included', () => {
		assert.deepEqual(['Failure', 'failed', ' Partial Failure ', 'Partial Success', 'Completed', 'Extended', null].map(isShortfall),
			[true, true, true, true, false, false, false]);
	});
});


describe('isRankable', () => {
	const mission = { adjusted_lcc: 10, window_status: 'available', window_output_basis: 'measured', window_cohort_top10: 1, cost_bin: 'anything' };
	it('uses measured mission coverage and the paper minimum without bins', () => {
		const scope = 'window';
		assert.equal(isRankable({ poolPapers: 5, missions: [mission, mission], rankingMinPapers: 50, scope }), false);
		assert.equal(isRankable({ poolPapers: 50, missions: [mission], rankingMinPapers: 50, scope }), false);
		assert.equal(isRankable({ poolPapers: 50, missions: [mission, mission], rankingMinPapers: 50, scope }), true);
		assert.equal(isRankable({ poolPapers: 50, missions: [mission, {...mission, window_output_basis: 'unavailable'}], rankingMinPapers: 50, scope }), false);
	});

	it('reads the full-mission fields by default', () => {
		const full = { adjusted_lcc: 10, full_mission_status: 'available', full_mission_output_basis: 'measured', full_mission_cohort_top10: 1 };
		assert.equal(isRankable({ poolPapers: 50, missions: [full, full], rankingMinPapers: 50 }), true);
		assert.equal(isRankable({ poolPapers: 50, missions: [full, { ...full, full_mission_status: 'immature' }], rankingMinPapers: 50 }), false);
		assert.equal(isRankable({ poolPapers: 50, missions: [full, { ...full, full_mission_cohort_top10: null }], rankingMinPapers: 50 }), false);
		// Window-only coverage does not make a division rankable in the full-mission scope.
		assert.equal(isRankable({ poolPapers: 50, missions: [mission, mission], rankingMinPapers: 50 }), false);
	});
});

describe('firstEraTop', () => {
	const rows = [
		{ mission: 'M', bibcode: '2006b', w: 1 },
		{ mission: 'M', bibcode: '2005late', w: 0.4 }, // tied at the cutoff: still qualifies
		{ mission: 'M', bibcode: '2004none', w: 0 },
		{ mission: 'M', bibcode: '2004null', w: null },
		{ mission: 'M', bibcode: '2005year', w: 1 }
	];
	const pubdates = new Map([['2006b', '2006-01-00'], ['2005late', '2005-03-00'], ['2004none', '2004-01-00'], ['2005year', '2005-00-00']]);

	it('picks the earliest-published paper with any era-adjusted weight', () => {
		assert.deepEqual(firstEraTop(rows, 'w', pubdates), { bibcode: '2005late', date: '2005-03-00' });
		// A year-only date reads as 1 July, so it is later than March.
		assert.deepEqual(firstEraTop(rows.slice(0, 2).concat(rows[4]), 'w', new Map([...pubdates, ['2005late', '2005-09-00']])),
			{ bibcode: '2005year', date: '2005-00-00' });
		assert.equal(firstEraTop(rows.slice(2, 4), 'w', pubdates), null);
	});

	it('breaks a date tie by bibcode and throws on a qualifying row with no date', () => {
		const tie = [{ bibcode: 'b', w: 1 }, { bibcode: 'a', w: 1 }];
		assert.equal(firstEraTop(tie, 'w', new Map([['a', '2001-02-00'], ['b', '2001-02-00']])).bibcode, 'a');
		assert.throws(() => firstEraTop([{ mission: 'M', bibcode: 'x', w: 1 }], 'w', new Map()), /M x has no publication date/);
	});
});

describe('buildFirstTopPaper', () => {
	const first = { bibcode: '2005Sci...307.1262Y', date: '2005-02-00' };

	it('reports "reached" with years from the start of science, and from formulation when on record', () => {
		const reached = buildFirstTopPaper({ first, failed: false, papers: 3399, scienceStart: '2004-04-01' });
		assert.equal(reached.state, 'reached');
		// 1 April 2004 to 1 February 2005 (an unknown day reads as the 1st).
		assert.equal(reached.yearsFromScienceStart, 0.838);
		assert.equal(reached.yearsFromFormulation, null);
		assert.equal(reached.bibcode, '2005Sci...307.1262Y');
		assert.equal(reached.date, '2005-02-00');
		const fromFormulation = buildFirstTopPaper({ first, failed: false, papers: 3399, scienceStart: '2004-04-01', formulation: '1990-10-01' });
		assert.equal(fromFormulation.yearsFromFormulation, 14.338);
		// No science start on record, no reading from it.
		assert.equal(buildFirstTopPaper({ first, failed: false, papers: 1 }).yearsFromScienceStart, null);
	});

	it('has no formulation reading when nothing qualifies', () => {
		const none = buildFirstTopPaper({ first: null, failed: false, papers: 12, formulation: '1990-10-01' });
		assert.equal(none.state, 'none');
		assert.equal(none.yearsFromFormulation, null);
	});

	it('keeps a negative time-to-first (papers can predate science start)', () => {
		const early = buildFirstTopPaper({ first: { bibcode: 'x', date: '2000-01-00' }, failed: false, papers: 10, scienceStart: '2002-01-15' });
		assert.equal(early.yearsFromScienceStart, -2.04);
	});

	it('prefers "failure" over "no_papers" for a failed mission', () => {
		assert.equal(buildFirstTopPaper({ first: null, failed: true, papers: 0 }).state, 'failure');
		assert.equal(buildFirstTopPaper({ first: null, failed: true, papers: null }).state, 'failure');
	});

	it('distinguishes "no_papers" from "none"', () => {
		assert.equal(buildFirstTopPaper({ first: null, failed: false, papers: 0 }).state, 'no_papers');
		assert.equal(buildFirstTopPaper({ first: null, failed: false, papers: 12 }).state, 'none');
		// null papers is "unavailable", not a measured zero.
		assert.equal(buildFirstTopPaper({ first: null, failed: false, papers: null }).state, 'unavailable');
	});
});

describe('buildMissionScopeStats', () => {
	const first = { bibcode: 'x', date: '2005-02-00' };

	it('uses cohort fields for top 10% and pooled window fields for top 1%', () => {
		const stats = buildMissionScopeStats({
			statsMission: measured,
			scope: 'window',
			first,
			divisionTop10: 32,
			divisionTop1: 8
		});
		assert.equal(stats.papers, 40);
		assert.equal(stats.top10, 8);
		assert.equal(stats.top10ShareOfDivision, 0.25);
		assert.equal(stats.top1, 2);
		assert.equal(stats.top1ShareOfDivision, 0.25);
	});

	it('reads the full-mission fields in the full scope, with the formulation reading of the first top paper', () => {
		const stats = buildMissionScopeStats({
			statsMission: measured,
			scope: 'full',
			first,
			divisionTop10: 56,
			divisionTop1: 12,
			scienceStart: '2004-04-01',
			formulation: '1990-10-01'
		});
		assert.equal(stats.papers, 70);
		assert.equal(stats.citations, 2000);
		assert.equal(stats.outputBasis, 'measured');
		assert.equal(stats.top10, 14);
		assert.equal(stats.top10ShareOfDivision, 0.25);
		assert.equal(stats.top1, 3);
		assert.equal(stats.top1ShareOfDivision, 0.25);
		assert.equal(stats.first.state, 'reached');
		assert.equal(stats.first.yearsFromScienceStart, 0.838);
		assert.equal(stats.first.yearsFromFormulation, 14.338);
	});

	it('throws when the paper rows and the mission credit disagree about any top-10% paper', () => {
		const args = { statsMission: measured, scope: 'full', divisionTop10: 56, divisionTop1: 12 };
		assert.throws(() => buildMissionScopeStats({ ...args, first: null }), /Big \(full\): top-10% credit 14 but no paper row/);
		assert.throws(() => buildMissionScopeStats({ ...args, statsMission: { ...measured, full_mission_cohort_top10: 0 }, first }), /credit 0 but a paper row/);
	});

	it('has no top 1% in the lifetime scope', () => {
		const stats = buildMissionScopeStats({
			statsMission: measured,
			scope: 'lifetime',
			first,
			divisionTop10: 40,
			divisionTop1: 0
		});
		assert.equal(stats.top10, 20);
		assert.equal(stats.top1, null);
		assert.equal(stats.top1ShareOfDivision, null);
	});

	it('propagates unavailable (null) measures rather than turning them into zero', () => {
		const stats = buildMissionScopeStats({
			statsMission: unavailable,
			scope: 'lifetime',
			first: null,
			divisionTop10: 40,
			divisionTop1: 0
		});
		assert.equal(stats.papers, null);
		assert.equal(stats.citations, null);
		assert.equal(stats.top10, null);
		assert.equal(stats.top10ShareOfDivision, null);
		assert.equal(stats.first.state, 'failure');
	});

	it('yields a null share when the division has no top papers at all', () => {
		const stats = buildMissionScopeStats({
			statsMission: { ...measured, window_cohort_top10: 0 },
			scope: 'window',
			first: null,
			divisionTop10: 0,
			divisionTop1: 0
		});
		assert.equal(stats.top10, 0);
		assert.equal(stats.top10ShareOfDivision, null);
	});
});

describe('buildTiers', () => {
	const percentileView = {
		by_top_percent: {
			0.1: { tie_weighted_credit: 3 },
			1: { tie_weighted_credit: 26.281666 },
			5: { tie_weighted_credit: 124.468181 },
			10: { tie_weighted_credit: 272.5 },
			25: { tie_weighted_credit: 841.698039 },
			50: { tie_weighted_credit: 1790.487719 }
		}
	};

	it('produces exclusive differences with the remainder as the last tier', () => {
		const tiers = buildTiers({
			percentileView,
			papers: 3399,
			tierPercents: [0.1, 1, 5, 10, 25, 50]
		});
		assert.equal(tiers.length, 7);
		assert.equal(tiers[0], 3);
		assert.equal(tiers[1], 23.282);
		assert.equal(tiers.at(-1), 1608.512);
		const total = tiers.reduce((a, b) => a + b, 0);
		assert.ok(Math.abs(total - 3399) < 0.01, `tiers should sum to the paper count, got ${total}`);
	});

	it('is null when the scope has no measured papers', () => {
		assert.equal(buildTiers({ percentileView, papers: null, tierPercents: [0.1, 1] }), null);
		assert.equal(buildTiers({ percentileView: null, papers: 10, tierPercents: [0.1, 1] }), null);
	});

	it('is null when any credit level is unavailable', () => {
		assert.equal(
			buildTiers({
				percentileView: { by_top_percent: { 0.1: { tie_weighted_credit: null } } },
				papers: 10,
				tierPercents: [0.1]
			}),
			null
		);
	});
});

describe('divisionTotal', () => {
	it('sums a measure across missions, ignoring unavailable values', () => {
		assert.equal(divisionTotal([measured, unavailable], (m) => missionTop10(m, 'window')), 8);
		assert.equal(divisionTotal([measured, unavailable], (m) => missionTop1(m, 'window')), 2);
		assert.equal(divisionTotal([measured, unavailable], (m) => missionTop10(m, 'full')), 14);
		assert.equal(divisionTotal([measured, unavailable], (m) => missionTop1(m, 'full')), 3);
	});
});
