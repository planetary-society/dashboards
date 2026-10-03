import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineWindows, fullMissionPolicy, missionWindow, windowPolicy } from '../lib/windows.mjs';

const policy = windowPolicy({ post_prime_years: 2, citation_years: 3, maturity_grace_months: 3 });
test('window dimensions follow mission dates, including the exclusive end year', () => {
	const short = missionWindow({ publication_start_date: '2010-12-01', publication_end_date: '2013-01-01', status: 'available' }, policy, 'short');
	assert.equal(short.months, 25);
	assert.equal(short.citationBuckets, 6);
	const long = missionWindow({ publication_start_date: '2000-02-01', publication_end_date: '2017-04-01', status: 'available' }, policy, 'long');
	assert.equal(long.months, 206);
	assert.equal(long.citationBuckets, 21);
	assert.throws(() => missionWindow({ status: 'available' }, policy, 'missing'), /increasing publication/);
	assert.throws(() => windowPolicy({ post_prime_years: 'two', citation_years: 3 }), /post_prime_years/);
	assert.throws(() => missionWindow({ publication_start_date: '2010-02-30', publication_end_date: '2013-01-01', status: 'available' }, policy, 'invalid'), /increasing publication/);
	assert.throws(() => windowPolicy({ post_prime_years: 2, publication_years: 3, citation_years: 3 }), /ambiguous/);
	assert.throws(() => windowPolicy({ post_prime_years: 2, citation_years: 3, maturity_grace_months: -1 }), /maturity_grace/);
	assert.throws(() => windowPolicy({ post_prime_years: 2, citation_years: 3, anchor: 'mission_end' }), /unsupported full-mission/);
});

test('the full-mission policy opens at mission start and ends at mission end', () => {
	const raw = { post_prime_years: 2, citation_years: 3, maturity_grace_months: 3, anchor: 'mission_end', opens_at: 'mission_start', min_window_years: 2 };
	const full = fullMissionPolicy(raw);
	assert.deepEqual(full, { kind: 'full', postEndYears: 2, citationYears: 3, minWindowYears: 2 });
	const { opens_at: _opens, min_window_years: _min, ...bare } = raw;
	assert.deepEqual(fullMissionPolicy(bare), { kind: 'full', postEndYears: 2, citationYears: 3, minWindowYears: null });
	const window = missionWindow({ publication_start_date: '2004-04-01', publication_end_date: '2019-10-01', status: 'available' }, full, 'full');
	assert.equal(window.months, 186);
	assert.equal(window.citationBuckets, 19);
	assert.throws(() => fullMissionPolicy(undefined, 'astro'), /astro: run\.full_mission_policy is missing/);
	assert.throws(() => fullMissionPolicy({ ...raw, anchor: 'prime_end' }), /must open at mission start and end at mission end/);
	assert.throws(() => fullMissionPolicy({ ...raw, opens_at: 'launch' }), /must open at mission start and end at mission end/);
	assert.throws(() => fullMissionPolicy({ ...raw, post_prime_years: -1 }), /invalid full-mission post_prime_years policy/);
	assert.throws(() => fullMissionPolicy({ ...raw, post_prime_years: 'two' }), /invalid full-mission post_prime_years policy/);
	assert.throws(() => fullMissionPolicy({ ...raw, min_window_years: 0 }), /min_window_years/);
	assert.throws(() => fullMissionPolicy({ ...raw, min_window_years: 1.5 }), /min_window_years/);
	assert.throws(() => fullMissionPolicy({ ...raw, citation_years: -1 }), /citation_years/);
});

test('division series preserve long tails and report varying measured coverage', () => {
	const series = (months, outputBasis = 'measured', status = 'available') => ({ papersByMonth: Array(months).fill(1), citationsByYearOffset: [1, 2, 3, 4], status, outputBasis });
	const combined = combineWindows([series(12), series(25), series(40, 'unavailable'), series(40, 'measured', 'immature')]);
	assert.equal(combined.missionsIncluded, 2);
	assert.deepEqual(combined.missionsByYear, [2, 1, 1]);
	assert.equal(combined.papersByMonth.reduce((a, b) => a + b, 0), 37);
	assert.deepEqual(combined.citationsByYearOffset, [2, 4, 6, 8]);
	assert.equal(combineWindows([series(12, 'unavailable')]).status, 'unavailable');
});
