// The discussion figures use actual adjusted costs, from the packaged division documents.
import { pooledBand } from './costcurve.mjs';
import { byText, median, round, share, sum } from './util.mjs';
const hasCost = (mission) => Number.isFinite(mission.cost) && mission.cost > 0;
/** Inside the threshold: a positive cost at or below it ($M, the snapshot's adjusted dollar year). */
export const underThreshold = (cost) => (mission) => hasCost(mission) && mission.cost <= cost;

/** A costed mission whose output in the scope was measured: a failure counts, as a zero; unavailable output does not. */
const measuredIn = (scope) => (m) => hasCost(m) && (m[scope]?.status ?? 'available') === 'available' && m[scope]?.top10 != null;

/** Missions and shortfalls (failure, partial failure, partial success) on one side, with the rate. */
function shortfalls(members) {
	const failed = members.filter((m) => m.shortfall).length;
	return { missions: members.length, failed, rate: members.length ? share(failed / members.length) : null };
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
 * @param {string|null} [options.timingDivision] the division whose time to a first top
 *   paper the story walks through; null leaves `timingDivision` null
 */
export function buildDiscussion(divisions, { thresholdCost, scope = 'full', timingDivision = null } = {}) {
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
		const eligible = d.missions.filter(measured);
		const small = eligible.filter(under);
		const top = sum(small.map((m) => stats(m).top10));
		const total = sum(eligible.map((m) => stats(m).top10));
		return { division: d.slug, name: d.name, missions: pool.length,
			measuredMissions: small.length, top10: round(top, 6),
			share: d.rankable && total > 0 ? top / total : null,
			costTotal: sum(pool.map((m) => m.cost)) };
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
	// The comparison kept apart by field: the same groups, one rankable division at a time.
	const comparisonByDivision = rankable.map((d) => {
		const side = ([key, fn]) => {
			const { missions, failed, withTop, top10, top10PerMission } = comparisonGroup(key, d.missions.filter(measured).filter(fn), stats);
			return [key, { missions, failed, withTop, top10, top10PerMission }];
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
			papersAll: papersOf(all.filter((m) => stats(m).papers != null)),
			unavailable: selected.length - measuredUnder.length,
			launchMedian: launchMedian(selected)
		},
		failure: {
			statuses: ['Failure', 'Partial Failure', 'Partial Success'],
			under: failureUnder,
			over: failureOver,
			higher: higherRate(failureUnder.rate, failureOver.rate),
			byDivision: divisions.map((d) => {
				const pool = d.missions.filter(hasCost);
				const side = (fn) => { const { missions, failed } = shortfalls(pool.filter(fn)); return { missions, failed }; };
				return { division: d.slug, name: d.name, under: side(under), over: side(over) };
			})
		},
		divisions: breakdown,
		bands,
		comparison: {
			divisions: rankable.map((d) => d.slug),
			unavailable: rankableMissions.filter((m) => !measured(m)).length,
			gap: referenceGap(all, thresholdCost),
			groups: sides.map(([key, side]) => comparisonGroup(key, rankableMissions.filter(measured).filter(side), stats)),
			byDivision: comparisonByDivision,
			equalWeight: equalWeight(comparisonByDivision)
		},
		pooledBand: pooled ? {
			divisions: pooledFrom.map((d) => d.slug),
			...pooled,
			...bandShares(pooledFrom.map((d) => d.costCurves[scope][10].points), pooled)
		} : null,
		timingDivision: rankable.some((d) => d.slug === timingDivision) ? timingDivision : null,
		timing: rankable.map((d) => timingFacts(d, d.missions.filter(measured), stats, under)),
		scienceStart: scienceStartFacts(all, stats),
		perDollar: rankable.map((d) => perDollarFacts(d, d.missions.filter(measured), stats, sides)),
		missingCosts: all.filter((m) => !hasCost(m)).length
	};
}

/**
 * Top-10% papers per mission either side, each division weighted equally: the plain mean of the
 * divisions' per-mission figures, over the divisions with at least one mission on both sides.
 */
function equalWeight(byDivision) {
	const both = byDivision.filter((d) => d.under.missions > 0 && d.over.missions > 0);
	const mean = (key) => (both.length ? round(sum(both.map((d) => d[key].top10PerMission)) / both.length, 3) : null);
	return { under: mean('under'), over: mean('over') };
}

/** The costed missions nearest the threshold over every division, rankable or not: the largest cost at or below it, the smallest above it. */
function referenceGap(missions, thresholdCost) {
	const costs = missions.filter(hasCost).map((m) => m.cost);
	const below = costs.filter((c) => c <= thresholdCost);
	const above = costs.filter((c) => c > thresholdCost);
	return {
		below: below.length ? round(Math.max(...below), 3) : null,
		above: above.length ? round(Math.min(...above), 3) : null
	};
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

/** The reached missions in cost order (then name), cut into thirds at round(n/3) and round(2n/3). */
function costThirds(reached, years) {
	const sorted = reached.slice().sort((a, b) => a.cost - b.cost || byText(a.name, b.name));
	const n = sorted.length;
	const cuts = [0, Math.round(n / 3), Math.round((2 * n) / 3), n];
	return ['low', 'mid', 'high'].map((key, i) => {
		const part = sorted.slice(cuts[i], cuts[i + 1]);
		return {
			key,
			missions: part.length,
			costRange: part.length ? [round(part[0].cost, 3), round(part.at(-1).cost, 3)] : null,
			medianYears: round(median(part.map(years)), 3),
			medianBuildYears: round(median(part.map((m) => m.yearsToBuild)), 3)
		};
	});
}

/**
 * Time from project start (formulation) to a first top-10% paper, over one division's measured
 * missions. A mission counts as reached only with both dates on record; `fastest` is the
 * mission that got there soonest, ties broken by name so the pick is stable.
 */
function timingFacts(division, members, stats, isUnder) {
	const years = (m) => stats(m).first?.yearsFromFormulation ?? null;
	const reached = members.filter((m) => stats(m).first?.state === 'reached' && years(m) !== null);
	const under = members.filter(isUnder);
	const first = reached.slice().sort((a, b) => years(a) - years(b) || byText(a.name, b.name))[0] ?? null;
	return {
		division: division.slug,
		name: division.name,
		missions: members.length,
		reached: reached.length,
		never: members.length - reached.length,
		under: { missions: under.length, reached: under.filter((m) => reached.includes(m)).length, failed: under.filter((m) => m.failed).length },
		fastest: first ? { id: first.id, name: first.name, cost: first.cost, years: years(first) } : null,
		medianYears: round(median(reached.map(years)), 3),
		byCostThird: costThirds(reached, years)
	};
}

/**
 * Months from the start of science operations to a first top-10% paper, every division's costed
 * missions together (each paper ranked within its own division), as the overview's timing chart
 * plots them: medians in four equal-count cost groups, cheapest first. `ratio` is the cheapest
 * group's median over the costliest's. Null below twelve missions.
 */
function scienceStartFacts(missions, stats, k = 4) {
	const months = (m) => stats(m).first.yearsFromScienceStart * 12;
	const reached = missions
		.filter((m) => hasCost(m) && stats(m).first?.state === 'reached' && Number.isFinite(stats(m).first.yearsFromScienceStart))
		.sort((a, b) => a.cost - b.cost || byText(a.id, b.id));
	if (reached.length < k * 3) return null;
	const group = (list) => ({ missions: list.length, months: round(median(list.map(months)), 1) });
	const groups = Array.from({ length: k }, (_, i) => {
		const list = reached.slice(Math.round((i * reached.length) / k), Math.round(((i + 1) * reached.length) / k));
		return { lo: list[0].cost, hi: list.at(-1).cost, ...group(list) };
	});
	return {
		missions: reached.length,
		groups,
		ratio: groups.at(-1).months > 0 ? round(groups[0].months / groups.at(-1).months, 2) : null
	};
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
