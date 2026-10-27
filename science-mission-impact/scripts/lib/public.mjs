// The discussion figures use actual adjusted costs, from the packaged division documents.
import { pooledBand } from './costcurve.mjs';
import { byText, median, round, share, sum } from './util.mjs';
const hasCost = (mission) => Number.isFinite(mission.cost) && mission.cost > 0;
/** Inside the threshold: a positive cost at or below it ($M, the snapshot's adjusted dollar year). */
export const underThreshold = (cost) => (mission) => hasCost(mission) && mission.cost <= cost;

/** A costed mission whose output in the scope was measured: a failure counts, as a zero; unavailable output does not. */
const measuredIn = (scope) => (m) => hasCost(m) && (m[scope]?.status ?? 'available') === 'available' && m[scope]?.top10 != null;

/** Missions and shortfalls (failure, partial failure, partial success) on one side, with the rate; `lost` counts the outright failures among them. */
function shortfalls(members) {
	const failed = members.filter((m) => m.shortfall).length;
	return { missions: members.length, failed, lost: members.filter((m) => m.failed).length, rate: members.length ? share(failed / members.length) : null };
}

/** The costliest outright failure among `members` ($M); null when none was lost. */
const lostCostMax = (members) => {
	const costs = members.filter((m) => m.failed).map((m) => m.cost);
	return costs.length ? round(Math.max(...costs), 3) : null;
};

/** The Wilson 95% interval for k of n, as [low, high] shares; null for an empty side. */
export function wilson(k, n, z = 1.96) {
	if (!(n > 0)) return null;
	const p = k / n;
	const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
	return [share(Math.max(0, centre - half)), share(Math.min(1, centre + half))];
}

/**
 * Each division has its own denominator; never sum top-paper credit across fields as if their
 * citation cultures were one. The figures that span divisions take the rankable ones and
 * either keep them apart (`perDollar`), weight them equally (`pooledBand`) or count papers
 * that were already ranked within their own field (`comparison`).
 *
 * @param {object[]} divisions the packaged Division documents, config order
 * @param {object} options
 * @param {number} options.thresholdCost the editorial line ($M): under is `0 < cost <= thresholdCost`, over is above it
 * @param {'full'|'window'|'lifetime'} [options.scope] the scope every figure is read in
 * @param {string|null} [options.focusDivision] the division the story walks through (its
 *   citation primer and running total); null leaves `focusDivision` and `primer` null
 */
export function buildDiscussion(divisions, { thresholdCost, scope = 'full', focusDivision = null } = {}) {
	if (!(thresholdCost > 0)) throw new Error(`buildDiscussion: thresholdCost must be a positive number, got ${JSON.stringify(thresholdCost)}`);
	const under = underThreshold(thresholdCost);
	const over = (m) => hasCost(m) && !under(m);
	/** The two sides of the threshold, in the order the story reads them. */
	const sides = [['under', under], ['over', over]];
	const all = divisions.flatMap((d) => d.missions);
	const selected = all.filter(under);
	const stats = (m) => m[scope] ?? {};
	const measured = measuredIn(scope);
	const breakdown = divisions.map((d) => {
		const pool = d.missions.filter(under);
		const costedAll = d.missions.filter(hasCost);
		const eligible = d.missions.filter(measured);
		const small = eligible.filter(under);
		const top = sum(small.map((m) => stats(m).top10));
		const total = sum(eligible.map((m) => stats(m).top10));
		const costMeasured = sum(eligible.map((m) => m.cost));
		const citations = sum(eligible.map((m) => stats(m).citations));
		return { division: d.slug, name: d.name, missions: pool.length,
			measuredMissions: small.length, top10: round(top, 6),
			share: d.rankable && total > 0 ? top / total : null,
			missionsAll: costedAll.length,
			// the small side's shares of missions, spending, citations and top papers all count the
			// same missions, costed with output measured in the scope, so they can be read against each other
			missionShare: eligible.length ? share(small.length / eligible.length) : null,
			costShare: costMeasured > 0 ? share(sum(small.map((m) => m.cost)) / costMeasured) : null,
			// the same side's share of the division's citations, read against costShare per dollar
			citationShare: d.rankable && citations > 0 ? share(sum(small.map((m) => stats(m).citations)) / citations) : null };
	});
	const rankable = divisions.filter((d) => d.rankable && d.costCurves?.[scope]?.[10]);
	const bands = rankable.map((d) => ({ division: d.slug, name: d.name, ...d.costCurves[scope][10].band }));
	// Only a division that holds top credit can say where its papers sit.
	const pooledFrom = rankable.filter((d) => d.costCurves[scope][10].points.some((p) => p.topShare > 0));
	const pooled = pooledBand(pooledFrom.map((d) => d.costCurves[scope][10]));
	const rankableMissions = rankable.flatMap((d) => d.missions).filter(hasCost);
	// Mission papers: a paper two missions claim counts once for each.
	const measuredUnder = selected.filter((m) => stats(m).papers != null);
	const papersOf = (list) => sum(list.map((m) => stats(m).papers));
	const costed = all.filter(hasCost);
	const failureUnder = shortfalls(costed.filter(under));
	const failureOver = shortfalls(costed.filter(over));
	const focus = rankable.find((d) => d.slug === focusDivision) ?? null;
	// The comparison kept apart by field: the same groups, one rankable division at a time.
	const comparisonByDivision = rankable.map((d) => {
		const side = ([key, fn]) => {
			const { missions, failed, withTop, top10, top10PerMission, largest } = comparisonGroup(key, d.missions.filter(measured).filter(fn), stats);
			return [key, { missions, failed, withTop, top10, top10PerMission, largest }];
		};
		return { division: d.slug, name: d.name, ...Object.fromEntries(sides.map(side)) };
	});
	return {
		/** Membership is inclusive: under the threshold means 0 < cost <= referenceCost. */
		referenceCost: thresholdCost,
		scope,
		threshold: {
			missions: selected.length,
			total: costed.length,
			ids: selected.map((m) => m.id),
			papers: papersOf(measuredUnder),
			costMedian: round(median(selected.map((m) => m.cost)), 3)
		},
		failure: {
			statuses: ['Failure', 'Partial Failure', 'Partial Success'],
			under: { ...failureUnder, interval: wilson(failureUnder.failed, failureUnder.missions), lostCostMax: lostCostMax(costed.filter(under)) },
			over: { ...failureOver, interval: wilson(failureOver.failed, failureOver.missions), lostCostMax: lostCostMax(costed.filter(over)) },
			higher: higherRate(failureUnder.rate, failureOver.rate),
			byDivision: divisions.map((d) => {
				const pool = d.missions.filter(hasCost);
				const side = (fn) => { const { missions, failed, lost } = shortfalls(pool.filter(fn)); return { missions, failed, lost }; };
				return { division: d.slug, name: d.name, under: side(under), over: side(over) };
			})
		},
		divisions: breakdown,
		bands,
		comparison: {
			divisions: rankable.map((d) => d.slug),
			groups: sides.map(([key, side]) => comparisonGroup(key, rankableMissions.filter(measured).filter(side), stats)),
			byDivision: comparisonByDivision
		},
		pooledBand: pooled ? {
			divisions: pooledFrom.map((d) => d.slug),
			...pooled,
			...bandShares(pooledFrom.map((d) => d.costCurves[scope][10].points), pooled)
		} : null,
		focusDivision: focus?.slug ?? null,
		primer: focus ? primerFacts(focus, scope) : null,
		perDollar: rankable.map((d) => perDollarFacts(d, d.missions.filter(measured), stats, sides))
	};
}

/**
 * A division page's small-vs-larger figures in every scope: each division's own rows of the
 * discussion read in that scope. The page's scope switch picks one; nothing is recomputed there.
 *
 * @returns {Record<string, Record<'full'|'window'|'lifetime', {divisions: object, failure: object, comparison: object|null, perDollar: object|null}>>}
 */
export function divisionFacts(divisions, { thresholdCost }) {
	const out = Object.fromEntries(divisions.map((d) => [d.slug, {}]));
	for (const scope of ['full', 'window', 'lifetime']) {
		const s = buildDiscussion(divisions, { thresholdCost, scope });
		const row = (list, slug) => list.find((r) => r.division === slug) ?? null;
		for (const d of divisions) {
			out[d.slug][scope] = { divisions: row(s.divisions, d.slug), failure: row(s.failure.byDivision, d.slug),
				comparison: row(s.comparison.byDivision, d.slug), perDollar: row(s.perDollar, d.slug) };
		}
	}
	return out;
}

/**
 * How much of each pooled division's spending, and of its costed missions, sits inside the pooled
 * band (p25 ≤ cost ≤ p75), averaged with equal weight across those divisions as the band itself is.
 * Each curve's points are in ascending cost with a cumulative `costShare`.
 */
function bandShares(curves, { p25, p75 }) {
	const inside = curves.map((points) => {
		const below = points.filter((p) => p.cost < p25);
		const through = points.filter((p) => p.cost <= p75);
		const reached = (list) => list.at(-1)?.costShare ?? 0;
		return { cost: reached(through) - reached(below), missions: (through.length - below.length) / points.length };
	});
	const mean = (key) => share(sum(inside.map((d) => d[key])) / inside.length);
	return { costShare: mean('cost'), missionShare: mean('missions') };
}

/** Citations per $100M of one side, as published: null for a side with no cost. */
function perHundredM(members, stats) {
	const cost = sum(members.map((m) => m.cost));
	return cost > 0 ? round((sum(members.map((m) => stats(m).citations)) / cost) * 100, 3) : null;
}

/** The side with the higher rate; null when either side is empty or the rates are equal. */
const higherRate = (under, over) => (under === null || over === null || under === over ? null : under > over ? 'under' : 'over');

/** The member with the most of `value`, ties broken by name (then id) so the pick is stable. */
const largestBy = (members, value) =>
	members.slice().sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0) || byText(a.name, b.name) || byText(a.id, b.id))[0] ?? null;

/** The most common non-null value and how many members carry it, ties broken by name; null when none. */
function mostCommon(values) {
	const counts = new Map();
	for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
	const [type, missions] = [...counts].sort((a, b) => b[1] - a[1] || byText(a[0], b[0]))[0] ?? [];
	return type === undefined ? null : { type, missions };
}

/**
 * Citations per $100M either side of the threshold in one division. `favors` names the side with
 * the higher rate only when that ordering survives dropping any one measured mission from the
 * division (both rates recomputed without it; a side left empty counts as not surviving).
 * `flipsOn` names the missions it does not survive dropping; empty exactly when `favors` is set,
 * or when there is no order to keep (a tie or an empty side).
 */
function perDollarFacts(division, members, stats, sides) {
	const groups = sides.map(([key, side]) => {
		const group = members.filter(side);
		return { key, missions: group.length, cost: round(sum(group.map((m) => m.cost)), 3),
			citations: sum(group.map((m) => stats(m).citations)), perHundredM: perHundredM(group, stats) };
	});
	const [under, over] = groups.map((g) => g.perHundredM);
	const order = higherRate(under, over);
	const rates = (pool) => sides.map(([, side]) => perHundredM(pool.filter(side), stats));
	// The missions whose removal alone reverses the order (or leaves a side empty, so no order).
	const breakers = order === null ? [] : members.filter((dropped) => higherRate(...rates(members.filter((m) => m !== dropped))) !== order);
	const underSide = members.filter(sides[0][1]);
	const underCitations = sum(underSide.map((m) => stats(m).citations));
	const top = largestBy(underSide, (m) => stats(m).citations);
	return {
		division: division.slug,
		name: division.name,
		groups,
		favors: order !== null && breakers.length === 0 ? order : null,
		flipsOn: breakers.map((m) => ({ id: m.id, name: m.name, side: sides[0][1](m) ? 'under' : 'over' })),
		margin: under === null || over === null || Math.max(under, over) === 0 ? null : share(Math.abs(under - over) / Math.max(under, over)),
		largestUnder: underCitations > 0 ? { id: top.id, name: top.name, share: share((stats(top).citations ?? 0) / underCitations) } : null
	};
}

/**
 * The story's primer on one division: its papers by citation count in the scope (one bar per
 * count, up to the most cited), how many in each bar are top-10% papers (papers tied at the cutoff
 * share the last places, so that bar is only partly in), and the cutoff. `topPapers` sums them:
 * the division's top-10% total, as the running total counts it.
 */
function primerFacts(division, scope) {
	const histogram = division.citationHistogram?.[scope];
	const cut = division.stats?.[scope]?.cutoffs?.find((c) => c.percent === 10);
	return histogram && cut ? { division: division.slug, name: division.name, ...histogram, cutoff: cut.citations, topPapers: round(sum(histogram.top), 3) } : null;
}

/** The median launch year of the missions that have one, as a whole year; null when none does. */
function launchMedian(members) {
	const middle = median(members.map((m) => m.launchYear));
	return middle === null ? null : Math.round(middle);
}

/** One side of the threshold: totals and per-mission averages, failures included as measured zeros. */
function comparisonGroup(key, members, stats) {
	const n = members.length;
	const top10 = sum(members.map((m) => stats(m).top10));
	const top1 = sum(members.map((m) => stats(m).top1));
	const costs = members.map((m) => m.cost);
	const launches = members.map((m) => m.launchYear).filter(Number.isFinite);
	const largest = top10 > 0 ? largestBy(members, (m) => stats(m).top10) : null;
	return {
		key,
		missions: n,
		failed: members.filter((m) => m.failed).length,
		withTop: members.filter((m) => stats(m).top10 > 0).length,
		top10: round(top10, 3),
		top10PerMission: n ? round(top10 / n, 3) : null,
		top1: round(top1, 3),
		top1PerMission: n ? round(top1 / n, 3) : null,
		cost: round(sum(members.map((m) => m.cost)), 3),
		citations: sum(members.map((m) => stats(m).citations)),
		median: round(median(members.map((m) => stats(m).top10)), 3),
		papersMedian: round(median(members.map((m) => stats(m).papers)), 3),
		noPapers: members.filter((m) => stats(m).papers === 0).length,
		largest: largest ? { id: largest.id, name: largest.name, top10: round(stats(largest).top10, 3), share: share(stats(largest).top10 / top10) } : null,
		costMin: n ? round(Math.min(...costs), 3) : null,
		costMax: n ? round(Math.max(...costs), 3) : null,
		launchYears: launches.length ? [Math.min(...launches), Math.max(...launches)] : null,
		launchMedian: launchMedian(members),
		topType: mostCommon(members.map((m) => m.type))
	};
}
