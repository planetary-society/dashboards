import { PackagingError } from './invariants.mjs';
import { monthOffset } from './series.mjs';

/** Policy describes the rule; mission cohorts supply the authoritative dates. */
export function windowPolicy(policy, label = 'statistics') {
	if (!Number.isInteger(policy?.citation_years) || policy.citation_years < 0) {
		throw new PackagingError(`${label}: invalid citation_years policy`);
	}
	const prime = policy.post_prime_years !== undefined;
	if (prime && ((policy.anchor ?? 'prime_end') !== 'prime_end' || (policy.opens_at ?? 'mission_start') !== 'mission_start' || policy.min_window_years != null)) {
		throw new PackagingError(`${label}: unsupported full-mission or extended-phase window policy; select the standard prime-phase statistics dataset`);
	}
	if (prime && policy.publication_years !== undefined) throw new PackagingError(`${label}: ambiguous prime and fixed publication-window policies`);
	if (prime && (!Number.isInteger(policy.maturity_grace_months ?? 0) || (policy.maturity_grace_months ?? 0) < 0)) {
		throw new PackagingError(`${label}: invalid maturity_grace_months policy`);
	}
	const years = prime ? policy.post_prime_years : policy.publication_years;
	if (!Number.isInteger(years) || years < (prime ? 0 : 1)) {
		throw new PackagingError(`${label}: expected post_prime_years or positive publication_years`);
	}
	return { kind: prime ? 'prime' : 'fixed', citationYears: policy.citation_years,
		...(prime ? { postPrimeYears: years, maturityGraceMonths: policy.maturity_grace_months ?? 0 }
			: { publicationYears: years }) };
}

/**
 * The full-mission window policy (`run.full_mission_policy`): a cohort that opens at mission
 * start and ends at mission end plus `post_prime_years`, never shorter than `min_window_years`.
 * Anything else anchored differently is some other upstream experiment and is refused.
 */
export function fullMissionPolicy(policy, label = 'statistics') {
	if (!policy || typeof policy !== 'object') {
		throw new PackagingError(`${label}: run.full_mission_policy is missing; regenerate the statistics with the full-mission scope`);
	}
	if (!Number.isInteger(policy.citation_years) || policy.citation_years < 0) {
		throw new PackagingError(`${label}: invalid full-mission citation_years policy`);
	}
	if (policy.anchor !== 'mission_end' || (policy.opens_at ?? 'mission_start') !== 'mission_start') {
		throw new PackagingError(`${label}: full_mission_policy must open at mission start and end at mission end (anchor ${JSON.stringify(policy.anchor)}, opens_at ${JSON.stringify(policy.opens_at)})`);
	}
	if (!Number.isInteger(policy.post_prime_years) || policy.post_prime_years < 0) {
		throw new PackagingError(`${label}: invalid full-mission post_prime_years policy`);
	}
	const min = policy.min_window_years ?? null;
	if (min !== null && (!Number.isInteger(min) || min <= 0)) {
		throw new PackagingError(`${label}: invalid full-mission min_window_years policy`);
	}
	return { kind: 'full', postEndYears: policy.post_prime_years, citationYears: policy.citation_years, minWindowYears: min };
}

export function missionWindow(cohort, policy, id) {
	const start = cohort?.publication_start_date ?? null;
	const end = cohort?.publication_end_date ?? null;
	const months = monthOffset(end, start);
	const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
	if (cohort?.status === 'available' && (!(months > 0) || !validDate(start) || !validDate(end))) {
		throw new PackagingError(`${id}: available window requires valid increasing publication_start_date/publication_end_date`);
	}
	return { start, end, matureDate: cohort?.mature_date ?? null, status: cohort?.status ?? 'unavailable',
		months: months > 0 ? months : 0,
		citationBuckets: months > 0 ? new Date(Date.parse(end) - 1).getUTCFullYear() - Number(start.slice(0, 4)) + policy.citationYears + 1 : 0 };
}

/** Each elapsed-year cell reports how many measured mission windows still cover it. */
export function combineWindows(series) {
	const included = series.filter((s) => s?.status === 'available' && s.outputBasis === 'measured');
	const months = Math.max(0, ...included.map((s) => s.papersByMonth.length));
	const buckets = Math.max(0, ...included.map((s) => s.citationsByYearOffset.length));
	const papersByMonth = new Array(months).fill(0);
	const citationsByYearOffset = new Array(buckets).fill(0);
	const missionsByYear = new Array(Math.ceil(months / 12)).fill(0);
	for (const s of included) {
		for (let i = 0; i < s.papersByMonth.length; i++) papersByMonth[i] += s.papersByMonth[i];
		for (let i = 0; i < s.citationsByYearOffset.length; i++) citationsByYearOffset[i] += s.citationsByYearOffset[i];
		for (let i = 0; i < Math.ceil(s.papersByMonth.length / 12); i++) missionsByYear[i]++;
	}
	return { papersByMonth, citationsByYearOffset, missionsByYear, missionsIncluded: included.length,
		status: included.length ? 'available' : 'unavailable' };
}
