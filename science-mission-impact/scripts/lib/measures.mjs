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

import { PackagingError } from './invariants.mjs';
import { median, num, parseDay, ratio, share, weight, sum, yearsBetween } from './util.mjs';

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
 * The earliest-published paper with era-adjusted top-10% weight among one scope's rows (any
 * weight above zero, so a paper tied at the cutoff counts): the story's high-impact paper.
 * Dated by its ADS pubdate (month resolution, read by `parseDay`), ties in date broken by
 * bibcode so the pick is stable. Null when no row qualifies; throws on a qualifying row with
 * no date rather than skipping it.
 *
 * @param {Iterable<object>} rows one scope's paper rows of one mission
 * @param {string} weightKey the scope's era-adjusted weight field
 * @param {Map<string, string>} pubdates bibcode -> ADS pubdate
 */
export function firstEraTop(rows, weightKey, pubdates) {
	let best = null;
	for (const row of rows) {
		if (!(Number(row[weightKey]) > 0)) continue;
		const date = pubdates.get(row.bibcode) ?? null;
		const day = parseDay(date);
		if (day === null) throw new Error(`first top-10% paper: ${row.mission} ${row.bibcode} has no publication date`);
		if (!best || day < best.day || (day === best.day && row.bibcode < best.bibcode)) best = { bibcode: row.bibcode, date, day };
	}
	return best && { bibcode: best.bibcode, date: best.date };
}

/**
 * FirstTopPaper for one mission in one scope, from `firstEraTop`. Time runs from the start of
 * science (the prime-mission start, else launch, as upstream reads it), and again from the start
 * of formulation when that date is on record: the same paper read from when the agency
 * committed to the project. How long the mission took to build is a separate figure
 * (`yearsToBuild`, formulation to launch).
 */
export function buildFirstTopPaper({ first, failed, papers, scienceStart = null, formulation = null }) {
	if (first) {
		return {
			state: 'reached',
			yearsFromScienceStart: yearsBetween(scienceStart, first.date),
			yearsFromFormulation: yearsBetween(formulation, first.date),
			bibcode: first.bibcode,
			date: first.date
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
 * `first` is the scope's `firstEraTop`; it must exist exactly when the mission
 * holds top-10% credit, or the paper rows and the mission measure disagree.
 */
export function buildMissionScopeStats({
	statsMission,
	scope,
	first,
	divisionTop10,
	divisionTop1,
	scienceStart = null,
	formulation = null
}) {
	const papers = missionPapers(statsMission, scope);
	const top10 = missionTop10(statsMission, scope);
	const top1 = missionTop1(statsMission, scope);
	if (top10 !== null && (first !== null) !== top10 > 0) {
		throw new Error(`${statsMission.short_title} (${scope}): top-10% credit ${top10} but ${first ? 'a' : 'no'} paper row with era-adjusted weight`);
	}
	return {
		papers,
		outputBasis: scopeField(statsMission, scope, 'output_basis') ?? (papers === null ? 'unavailable' : 'measured'),
		citations: missionCitations(statsMission, scope),
		top10: weight(top10),
		top10ShareOfDivision: top10 === null ? null : share(ratio(top10, divisionTop10)),
		top1: weight(top1),
		top1ShareOfDivision: top1 === null ? null : share(ratio(top1, divisionTop1)),
		first: buildFirstTopPaper({
			first,
			failed: isFailure(statsMission?.mission_status),
			papers,
			scienceStart,
			formulation
		})
	};
}

/**
 * CitationSpread for one mission in one scope. `citations` are the in-scope per-paper counts
 * (the PapersFile column); `papers`/`citationsTotal` are the source-reported totals the mean
 * comes from; `thresholds` is the raw `<prefix>_thresholds`. Null when papers is unavailable.
 */
export function buildCitationSpread({ citations, papers, citationsTotal, thresholds }) {
	if (num(papers) === null) return null;
	return {
		mean: weight(ratio(citationsTotal, papers)), // ratio() is null over 0 papers
		median: median(citations),
		uncited: citations.filter((c) => c === 0).length,
		i10: num(thresholds?.by_name?.i10?.count),
		i100: num(thresholds?.by_name?.i100?.count)
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

/**
 * DivisionScopeStats for one division in one scope: the pooled papers of every
 * mission, a shared paper once. `summary` is `stats.summary.<scope>.<Division>`,
 * `scopeBlock` is `stats.scopes.<scope>.divisions.<Division>`. Null without a pool.
 */
export function buildDivisionScopeStats({ summary, scopeBlock, tierPercents }) {
	const pooled = scopeBlock?.pooled;
	if (!pooled) return null;
	const ks = pooled.cutoffs?.ks ?? [];
	const cutoffs = tierPercents.map((percent) => {
		const citations = num(pooled.cutoffs?.cutoffs?.[ks.indexOf(percent)]);
		const papers = num(scopeBlock.pooled_cutoffs?.top_k_distinct_counts?.[String(percent)]);
		if (citations === null || papers === null) {
			throw new PackagingError(`${scopeBlock.division} (${scopeBlock.scope}): no pooled cutoff for top ${percent}%; regenerate the statistics with ks covering tierPercents`);
		}
		return { percent, citations, papers };
	});
	return {
		missions: num(summary?.missions) ?? 0,
		papers: num(pooled.n) ?? 0,
		citations: num(pooled.total) ?? 0,
		mean: weight(pooled.mean),
		median: num(pooled.median),
		uncited: num(pooled.uncited) ?? 0,
		hIndex: num(pooled.h_index),
		topDecileCitationShare: share(pooled.top_decile_hold),
		cutoffs
	};
}
