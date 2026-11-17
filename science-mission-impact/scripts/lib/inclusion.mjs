import { addMonths } from './clps.mjs';
import { PackagingError } from './invariants.mjs';
import { isFailure } from './measures.mjs';
import { launchDateOf, statusOf } from './source.mjs';
import { isIsoDay as validDate, parseDay } from './util.mjs';
import { windowPolicy } from './windows.mjs';

function selectionFilter(run) {
	const description = run.stats.run?.filter?.description;
	if (!description) throw new PackagingError(`${run.division.slug}: missing selection filter for awaiting missions`);
	return description.split(' AND ')
		.filter((clause) => !clause.startsWith('Publication window mature by '))
		.map((clause) => clause.replace(/^Launch Date <= \d{4}-\d{2}-\d{2}/, 'Launch Date <= snapshot'))
		.join(' AND ');
}

/** Latest selected missions outside the analysis whose prime-window inclusion is still pending. */
export function selectAwaitingMissions({ source, latest, asOf }) {
	if (!validDate(asOf)) throw new PackagingError('Awaiting missions require a valid snapshot date');
	const selected = new Map();
	for (const run of latest.runs) {
		const fixed = source.runs.find((candidate) => candidate.division.slug === run.division.slug);
		if (!fixed || selectionFilter(fixed) !== selectionFilter(run)) {
			throw new PackagingError(`${run.division.slug}: latest and analysis selection filters differ beyond maturity`);
		}
		if (JSON.stringify(windowPolicy(fixed.stats.run.policy)) !== JSON.stringify(windowPolicy(run.stats.run.policy))) {
			throw new PackagingError(`${run.division.slug}: latest and analysis maturity policies differ`);
		}
		const policy = fixed.stats.provenance?.input_policies ?? {};
		if (policy.include_mature_failures && (policy.failure_maturity_anchor !== 'mission_end_date' ||
			policy.failure_maturity_requires_empty_corpus !== true || !Number.isInteger(policy.failure_maturity_years) || policy.failure_maturity_years < 0)) {
			throw new PackagingError(`${run.division.slug}: unsupported empty-failure maturity policy`);
		}
		for (const { id } of run.resolved) {
			if (source.missions.has(id)) continue;
			const mission = latest.missions.get(id);
			const { statsMission, corpus } = mission;
			if (statsMission.eligible === false) continue;
			const launch = parseDay(launchDateOf(mission));
			if (launch === null || launch > parseDay(asOf)) continue;
			const cohort = statsMission.window_cohort;
			const status = statsMission.window_status ?? cohort?.status;
			if (!['available', 'immature', 'unavailable_start_date', 'unavailable_end_date'].includes(status)) continue;
			let date = cohort?.mature_date ?? null;
			if (date !== null && !validDate(date)) throw new PackagingError(`${id}: invalid prime-window maturity date`);
			// Latest may be a day ahead: its available window can still be immature at the analysis snapshot.
			if (status === 'available' && date === null) continue;
			let basis = 'window';
			const end = corpus.mission?.mission_end_date;
			// The exception requires an empty canonical corpus, including non-refereed records.
			if (policy.include_mature_failures && isFailure(statusOf(mission)) && corpus.corpus?.record_count === 0 &&
				['measured', 'assumed_zero'].includes(statsMission.lifetime_output_basis) &&
				validDate(end) && parseDay(end) >= launch) {
				const failureDate = addMonths(end, policy.failure_maturity_years * 12);
				if (date === null || failureDate < date) {
					date = failureDate;
					basis = 'failure';
				}
			}
			if (date === null || date > asOf) selected.set(id, { date, basis });
		}
	}
	return selected;
}
