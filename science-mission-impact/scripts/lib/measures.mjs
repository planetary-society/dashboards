/**
 * The impact measures.
 *
 * Three scopes, each a prefix on the raw mission fields: `full` (full_mission_*,
 * the full-mission window), `window` (window_*, the prime-phase window) and
 * `lifetime` (lifetime_*). Top 10% is the era-adjusted (publication-year
 * cohort) measure in every scope: `<prefix>_cohort_top10`. Top 1% exists in the
 * two windowed scopes only, pooled and not era-adjusted: `<prefix>_top_k["1"]`.
 *
 * Every paper count is a fractional tie weight. They are summed, never counted.
 * null means unavailable; 0 means measured zero.
 */

import { num, ratio, share, weight, daysToYears, sum, yearsBetween } from './util.mjs';

const FAILURE_STATUSES = ['failed', 'failure'];
// A mission that fell short of its goals: a failure, or upstream's partial failure or partial success.
const SHORTFALL_STATUSES = [...FAILURE_STATUSES, 'partial failure', 'partial success'];
const hasStatus = (status, list) => typeof status === 'string' && list.includes(status.trim().toLowerCase());

/** Every scope, default first. */
export const SCOPES = Object.freeze(['full', 'window', 'lifetime']);
/** The scopes with a publication window, and so a pooled top 1%. */
export const WINDOWED_SCOPES = Object.freeze(['full', 'window']);

const PREFIX = { full: 'full_mission', window: 'window', lifetime: 'lifetime' };

/** The raw field `<prefix>_<name>` of one mission in one scope. */
export function scopeField(statsMission, scope, name) {
	const prefix = PREFIX[scope];
	if (!prefix) throw new Error(`unknown scope: ${scope}`);
	return statsMission?.[`${prefix}_${name}`];
}

/** True when a mission_status spells a launch/mission failure. */
export function isFailure(status) {
	return hasStatus(status, FAILURE_STATUSES);
}

/** True when a mission_status spells a failure, partial failure or partial success. */
export function isShortfall(status) {
	return hasStatus(status, SHORTFALL_STATUSES);
}

/** The top-k value of one mission in one scope, as a raw (unrounded) number. */
export function missionTop10(statsMission, scope) {
	return num(scopeField(statsMission, scope, 'cohort_top10'));
}

/** Pooled top-1% credit for one mission; the windowed scopes only. */
export function missionTop1(statsMission, scope) {
	if (!WINDOWED_SCOPES.includes(scope)) return null;
	return num(scopeField(statsMission, scope, 'top_k')?.['1']);
}

/** Papers claimed by one mission in one scope. */
export function missionPapers(statsMission, scope) {
	return num(scopeField(statsMission, scope, 'papers'));
}

/** Citations of one mission's papers in one scope. */
export function missionCitations(statsMission, scope) {
	return num(scopeField(statsMission, scope, 'citations'));
}

/**
 * Cost comparisons require the configured minimum pooled paper count in the
 * scope and at least two measured missions with positive, known costs.
 */
export function isRankable({ poolPapers, missions, rankingMinPapers, scope = 'full' }) {
	const measured = missions.filter((m) => scopeField(m, scope, 'status') === 'available' &&
		scopeField(m, scope, 'output_basis') === 'measured' && m.adjusted_lcc > 0 && missionTop10(m, scope) !== null);
	return (num(poolPapers) ?? 0) >= rankingMinPapers && measured.length > 1;
}

/**
 * FirstTopPaper for one mission in one scope.
 *
 * `first_qualifying` on the division's pooled top-10% level is the earliest
 * published paper that ranks in the division's top decile today. Time runs from
 * the start of science, and again from the start of formulation when that date
 * is on record: the same paper read from when the agency committed to the
 * project. How long the mission took to build is a separate figure
 * (`yearsToBuild`, formulation to launch).
 */
export function buildFirstTopPaper({ firstQualifying, failed, papers, formulation = null }) {
	if (firstQualifying) {
		return {
			state: 'reached',
			yearsFromScienceStart: daysToYears(firstQualifying.days_after_ops_start),
			yearsFromFormulation: yearsBetween(formulation, firstQualifying.date),
			bibcode: firstQualifying.bibcode ?? null,
			date: firstQualifying.date ?? null
		};
	}
	let state = 'none';
	if (failed) state = 'failure';
	else if (num(papers) === null) state = 'unavailable';
	else if (num(papers) === 0) state = 'no_papers';
	return {
		state,
		yearsFromScienceStart: null,
		yearsFromFormulation: null,
		bibcode: null,
		date: null
	};
}

/**
 * MissionScopeStats for one mission in one scope.
 *
 * `divisionTop10` / `divisionTop1` are the sums of the same measure over every
 * mission of the division, so a mission's share is its own value over them.
 */
export function buildMissionScopeStats({
	statsMission,
	scope,
	percentileView,
	divisionTop10,
	divisionTop1,
	formulation = null
}) {
	const papers = missionPapers(statsMission, scope);
	const top10 = missionTop10(statsMission, scope);
	const top1 = missionTop1(statsMission, scope);
	const firstQualifying = percentileView?.by_top_percent?.['10']?.first_qualifying ?? null;
	return {
		papers,
		outputBasis: scopeField(statsMission, scope, 'output_basis') ?? (papers === null ? 'unavailable' : 'measured'),
		citations: missionCitations(statsMission, scope),
		top10: weight(top10),
		top10ShareOfDivision: top10 === null ? null : share(ratio(top10, divisionTop10)),
		top1: weight(top1),
		top1ShareOfDivision: top1 === null ? null : share(ratio(top1, divisionTop1)),
		first: buildFirstTopPaper({
			firstQualifying,
			failed: isFailure(statsMission?.mission_status),
			papers,
			formulation
		})
	};
}

/**
 * Exclusive percentile tiers for one mission in one scope: the differences of
 * the pooled tie-weighted credit across the configured percents, with the last
 * tier holding everything below the widest percent.
 *
 * Returns null when the scope has no measured papers (null is not zero).
 */
export function buildTiers({ percentileView, papers, tierPercents }) {
	const total = num(papers);
	if (total === null || !percentileView?.by_top_percent) return null;
	const credits = [];
	for (const percent of tierPercents) {
		const credit = num(percentileView.by_top_percent[String(percent)]?.tie_weighted_credit);
		if (credit === null) return null;
		credits.push(credit);
	}
	const values = [];
	for (let i = 0; i < credits.length; i += 1) {
		values.push(weight(i === 0 ? credits[0] : credits[i] - credits[i - 1]));
	}
	values.push(weight(total - credits.at(-1)));
	return values;
}

/** Sum of a measure over a division's missions, used as a share denominator. */
export function divisionTotal(missions, accessor) {
	return sum(missions.map(accessor));
}
