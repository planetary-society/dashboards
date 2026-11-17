import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAwaitingMissions } from '../lib/inclusion.mjs';

const asOf = '2026-11-14';
function fixture() {
	const policy = { post_prime_years: 2, citation_years: 3, maturity_grace_months: 3 };
	const filter = 'Launch Date <= 2026-11-14 (launched missions only) AND Division = "Astrophysics" AND Nation in {"United States*"}';
	const run = (mature) => ({
		division: { slug: 'astrophysics' }, resolved: [],
		stats: {
			run: { policy, filter: { description: filter + (mature ? ' AND Publication window mature by 2026-11-14 or failure 2 years after mission end with no recorded publications' : '') } },
			provenance: { input_policies: { include_mature_failures: mature, failure_maturity_years: 2, failure_maturity_anchor: 'mission_end_date', failure_maturity_requires_empty_corpus: true } }
		}
	});
	const source = { runs: [run(true)], missions: new Map() };
	const latest = { runs: [run(false)], missions: new Map() };
	function add(id, changes = {}) {
		const mission = {
			statsMission: { eligible: true, mission_status: 'Active', lifetime_papers: 0, lifetime_output_basis: 'measured', window_status: 'immature', window_cohort: { mature_date: '2032-10-01' }, full_mission_cohort: { mature_date: '2027-10-01' }, ...changes.stats },
			corpus: { mission: { mission_launch_date: '2025-02-26', mission_end_date: '2025-02-27', ...changes.meta }, corpus: { record_count: 0, ...changes.corpus } }
		};
		latest.missions.set(id, mission);
		latest.runs[0].resolved.push({ id });
		return mission;
	}
	return { source, latest, add, select: () => selectAwaitingMissions({ source, latest, asOf }) };
}

test('awaiting membership uses selected missions and prime maturity, preserving unknown dates', () => {
	const f = fixture();
	f.add('jwst');
	f.add('existing');
	f.source.missions.set('existing', {});
	f.add('excluded', { stats: { eligible: false } });
	f.add('mature', { stats: { window_status: 'available', window_cohort: { mature_date: '2026-10-01' } } });
	f.add('boundary', { stats: { window_cohort: { mature_date: asOf } } });
	f.add('unknown', { stats: { window_status: 'unavailable_end_date', window_cohort: { mature_date: null } } });
	f.add('invalid', { stats: { window_status: 'invalid_data' } });
	assert.deepEqual([...f.select()], [
		['jwst', { date: '2032-10-01', basis: 'window' }],
		['unknown', { date: null, basis: 'window' }]
	]);
});

test('empty failures use the earlier mission-end anniversary, with leap-day clamping', () => {
	const f = fixture();
	f.add('trailblazer', { stats: { mission_status: ' Failure ' } });
	f.add('leap', { stats: { mission_status: 'Failure', lifetime_output_basis: 'assumed_zero' }, meta: { mission_end_date: '2028-02-29' } });
	f.add('already-mature', { stats: { mission_status: 'Failure' }, meta: { mission_launch_date: '2024-01-01', mission_end_date: '2024-11-14' } });
	assert.deepEqual([...f.select()], [
		['trailblazer', { date: '2027-02-27', basis: 'failure' }],
		['leap', { date: '2030-02-28', basis: 'failure' }]
	]);
});

test('a window available in the next-day latest snapshot remains pending at the analysis snapshot', () => {
	const f = fixture();
	f.source.runs[0].stats.run.as_of_date = asOf;
	f.latest.runs[0].stats.run.as_of_date = '2026-11-15';
	f.add('next-day', { stats: { window_status: 'available', window_cohort: { mature_date: '2026-11-15' } } });
	f.add('already-mature', { stats: { window_status: 'available', window_cohort: { mature_date: asOf } } });
	f.add('undated-available', { stats: { window_status: 'available', window_cohort: { mature_date: null } } });
	assert.deepEqual([...f.select()], [['next-day', { date: '2026-11-15', basis: 'window' }]]);
});

test('only missions launched by the snapshot appear, including a launch on that date', () => {
	const f = fixture();
	f.add('future', { meta: { mission_launch_date: '2026-11-15' } });
	f.add('missing', { meta: { mission_launch_date: null } });
	f.add('invalid', { meta: { mission_launch_date: 'unknown' } });
	f.add('today', { meta: { mission_launch_date: asOf } });
	assert.deepEqual([...f.select().keys()], ['today']);
});

test('records, unavailable output, partial success, and invalid end dates cannot claim the failure exception', () => {
	const f = fixture();
	f.add('non-refereed', { stats: { mission_status: 'Failure', lifetime_papers: 0 }, corpus: { record_count: 1 } });
	f.add('unknown-records', { stats: { mission_status: 'Failure' }, corpus: { record_count: null } });
	f.add('unavailable', { stats: { mission_status: 'Failure', lifetime_output_basis: 'unavailable' } });
	f.add('partial', { stats: { mission_status: 'Partial Success' } });
	f.add('early-end', { stats: { mission_status: 'Failure' }, meta: { mission_end_date: '2025-02-25' } });
	f.add('invalid-end', { stats: { mission_status: 'Failure' }, meta: { mission_end_date: '2025-02-30' } });
	for (const inclusion of f.select().values()) assert.deepEqual(inclusion, { date: '2032-10-01', basis: 'window' });
});

test('the failure exception follows analysis policy and never delays ordinary inclusion', () => {
	const f = fixture();
	f.add('ordinary-first', { stats: { mission_status: 'Failure', window_cohort: { mature_date: '2027-01-01' } } });
	f.add('failure');
	f.latest.missions.get('failure').statsMission.mission_status = 'Failure';
	assert.deepEqual(f.select().get('ordinary-first'), { date: '2027-01-01', basis: 'window' });
	f.source.runs[0].stats.provenance.input_policies.include_mature_failures = false;
	assert.deepEqual(f.select().get('failure'), { date: '2032-10-01', basis: 'window' });
});

test('incompatible selections, policies, and invalid dates fail instead of inventing inclusion dates', () => {
	const f = fixture();
	const mission = f.add('bad-date', { stats: { window_cohort: { mature_date: '2032-02-30' } } });
	assert.throws(f.select, /invalid prime-window maturity date/);
	mission.statsMission.window_cohort.mature_date = '2032-10-01';
	f.latest.runs[0].stats.run.policy = { ...f.latest.runs[0].stats.run.policy, citation_years: 4 };
	assert.throws(f.select, /maturity policies differ/);
	f.latest.runs[0].stats.run.policy.citation_years = 3;
	f.latest.runs[0].stats.run.filter.description += ' AND Short Title not in {"JWST"}';
	assert.throws(f.select, /selection filters differ/);
});
