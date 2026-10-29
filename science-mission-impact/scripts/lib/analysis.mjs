/**
 * The Analysis page's figures (site.analysis, `AnalysisFacts` in src/lib/data/types.d.ts): each
 * mission's citation-weighted output N50 per $M by cost tier and group, failure rates, time to a
 * first top-10% paper, each tier's share of output against its share of cost, and selection.
 *
 * Pure: the packaged division documents in, the facts out. Every statistic is computed from
 * unrounded values; only what is published is rounded.
 */

import { PackagingError } from './invariants.mjs';
import { byText, median, round, share, sum } from './util.mjs';

const SELECTIONS = new Map([['Competed', 'competed'], ['Directed', 'directed']]);

/**
 * A mission's upstream `selection_strategy` as published: 'Competed' / 'Directed', null for
 * 'Unknown' or blank. Any other label means the export predates the classification; the older
 * 'PI led' / 'Strategic' labels described management, not selection, so they are never mapped.
 */
export function selectionOf(label, id) {
	if (label == null || label === '' || label === 'Unknown') return null;
	if (!SELECTIONS.has(label)) {
		throw new PackagingError(`${id}: selection_strategy ${JSON.stringify(label)} is not Competed, Directed or Unknown; the export predates the Competed/Directed classification (re-export upstream at mission schema 6)`);
	}
	return SELECTIONS.get(label);
}

/** $M edges -> ranges: lo < cost <= hi, the first from 0, the last open (hi null). */
const ranges = (edges) => [0, ...edges].map((lo, i) => ({ lo, hi: edges[i] ?? null }));
/** Whether a cost falls in a range (lo < cost <= hi, an open hi null): the one tier rule, shared with the story's tier chart. */
export const inTier = (r, cost) => cost > r.lo && (r.hi == null || cost <= r.hi);
const rangeOf = (list, cost) => list.findIndex((r) => inTier(r, cost));
const hasCost = (m) => Number.isFinite(m.cost) && m.cost > 0;

/** The p-quantile of ascending values by linear interpolation between order statistics (numpy's default, R type 7). */
export function quantile(sorted, p) {
	const h = (sorted.length - 1) * p;
	const i = Math.floor(h);
	return sorted[i] + (h - i) * ((sorted[i + 1] ?? sorted[i]) - sorted[i]);
}

/** A RateSpread: quartiles, Tukey whiskers (the most extreme values within 1.5 IQR of the box) and zeros. */
export function rateSpread(values) {
	const sorted = values.slice().sort((a, b) => a - b);
	if (!sorted.length) return { missions: 0, zeros: 0, median: null, q1: null, q3: null, whiskers: null };
	const [q1, mid, q3] = [0.25, 0.5, 0.75].map((p) => quantile(sorted, p));
	const reach = 1.5 * (q3 - q1);
	const low = sorted.find((v) => v >= q1 - reach);
	const high = sorted.findLast((v) => v <= q3 + reach);
	return { missions: sorted.length, zeros: sorted.filter((v) => v === 0).length, median: share(mid), q1: share(q1), q3: share(q3), whiskers: [share(low), share(high)] };
}

/** Median and minimum of the non-null values, in years (2 dp). */
function years(values) {
	const known = values.filter((v) => v != null);
	return { median: round(median(known), 2), min: known.length ? round(Math.min(...known), 2) : null };
}

/** The shortest time from formulation to a first top-10% paper (ties: cost, then id); null when none is dated. */
function fastestOf(members) {
	const dated = members.filter((m) => m.first.state === 'reached' && m.first.yearsFromFormulation != null);
	const [best] = dated.sort((a, b) => a.first.yearsFromFormulation - b.first.yearsFromFormulation || a.cost - b.cost || byText(a.id, b.id));
	return best ? { id: best.id, name: best.name, division: best.division, years: round(best.first.yearsFromFormulation, 2) } : null;
}

/** Ok / failed / partial counts: a partial is a shortfall short of outright failure. */
const outcomes = (list) => ({
	ok: list.filter((m) => !m.shortfall).length,
	failed: list.filter((m) => m.failed).length,
	partial: list.filter((m) => m.shortfall && !m.failed).length
});

/** Missions and shortfalls on one side of the threshold, the rate unrounded. */
const shortfallSide = (list) => {
	const shortfall = list.filter((m) => m.shortfall).length;
	return { missions: list.length, shortfall, rate: list.length ? shortfall / list.length : null };
};

/**
 * @param {object[]} divisionDocs the packaged Division documents, config order
 * @param {object} options
 * @param {number} options.thresholdCost the editorial line ($M); under is 0 < cost <= it
 * @param {number[]} options.costTiers ascending $M edges (smi.config.json analysis.costTiers)
 * @param {number[]} options.costGroups ascending $M edges (analysis.costGroups)
 * @param {string|null} [options.focusDivision] the story's focus division (story.focusDivision)
 * @param {{slug: string, name: string}[]} [options.divisions] every configured division, config order
 */
export function buildAnalysis(divisionDocs, { thresholdCost, costTiers, costGroups, focusDivision = null, divisions = divisionDocs }) {
	const tiers = ranges(costTiers);
	const groups = ranges(costGroups);
	const docOf = new Map(divisionDocs.map((d) => [d.slug, d]));
	const cutoffOf = (doc, percent) => doc?.stats?.full?.cutoffs?.find((c) => c.percent === percent)?.citations;
	const excluded = { noCost: 0, unmeasured: 0 };

	// The measured, costed missions, each with its N50 against its own division's c. A failure
	// counts what it published: usually nothing, a measured zero (CuPID published one paper).
	const missions = [];
	for (const doc of divisionDocs) {
		const c = cutoffOf(doc, 50);
		for (const row of doc.missions) {
			if (!hasCost(row)) { excluded.noCost += 1; continue; }
			if (row.full?.status !== 'available' || row.full?.papers == null) { excluded.unmeasured += 1; continue; }
			if (!(c > 0)) throw new PackagingError(`${doc.slug}: no positive full-scope top-50% citation cutoff, which N50 divides by; regenerate the statistics with 50 in tierPercents`);
			const n50 = row.full.papers + Number(row.full.citations ?? 0) / c;
			missions.push({
				id: row.id, name: row.name, division: doc.slug, cost: row.cost,
				tier: rangeOf(tiers, row.cost), group: rangeOf(groups, row.cost),
				failed: row.failed, shortfall: row.shortfall, selection: row.selection ?? null,
				n50, rate: n50 / row.cost, top10: Number(row.full.top10 ?? 0), first: row.lifetime.first
			});
		}
	}
	missions.sort((a, b) => a.cost - b.cost || byText(a.id, b.id));
	const ofTier = (list, t) => list.filter((m) => m.tier === t);
	const ofDivision = (list, slug) => list.filter((m) => m.division === slug);
	const rankable = divisionDocs.filter((d) => d.rankable);

	const under = shortfallSide(missions.filter((m) => m.cost <= thresholdCost));
	const over = shortfallSide(missions.filter((m) => m.cost > thresholdCost));
	const flown = missions.filter((m) => !m.failed); // a failure has no time to a first paper

	return {
		scope: 'full',
		timeScope: 'lifetime',
		referenceCost: thresholdCost,
		tiers,
		groups,
		nc: {
			percent: 50,
			focus: focusDivision,
			divisions: divisions.filter((d) => docOf.get(d.slug)?.stats?.full).map((d) => {
				const doc = docOf.get(d.slug);
				const cutoffs = Object.fromEntries([50, 10, 1].map((p) => [p, cutoffOf(doc, p)]));
				if (Object.values(cutoffs).some((v) => v == null)) throw new PackagingError(`${d.slug}: N_c needs the full-scope top 50%, 10% and 1% cutoffs; add them to tierPercents`);
				return { division: d.slug, name: d.name, papers: doc.stats.full.papers, c: cutoffs[50], cutoffs };
			})
		},
		missions: missions.map((m) => ({
			id: m.id, name: m.name, division: m.division, cost: m.cost, tier: m.tier, group: m.group,
			failed: m.failed, shortfall: m.shortfall, selection: m.selection, n50: round(m.n50, 3), rate: share(m.rate)
		})),
		excluded,
		failures: {
			tiers: tiers.map((_, t) => {
				const members = ofTier(missions, t);
				const counts = outcomes(members);
				return {
					missions: members.length,
					...counts,
					rate: members.length ? share((counts.failed + counts.partial) / members.length) : null,
					byDivision: divisions.map((d) => ({ division: d.slug, ...outcomes(ofDivision(members, d.slug)) }))
				};
			}),
			under: { ...under, rate: share(under.rate) },
			over: { ...over, rate: share(over.rate) },
			successPremium: under.rate === null || over.rate === null || under.rate === 1 ? null : share((1 - over.rate) / (1 - under.rate) - 1)
		},
		groupRates: groups.map((_, g) => {
			const members = missions.filter((m) => m.group === g);
			return { ...rateSpread(members.map((m) => m.rate)), shortfall: members.filter((m) => m.shortfall).length, failed: members.filter((m) => m.failed).length };
		}),
		time: {
			tiers: tiers.map((_, t) => {
				const members = ofTier(flown, t);
				const reached = members.filter((m) => m.first.state === 'reached');
				return {
					missions: members.length,
					reached: reached.length,
					without: members.length - reached.length,
					undated: reached.filter((m) => m.first.yearsFromFormulation == null).length,
					formulation: years(reached.map((m) => m.first.yearsFromFormulation)),
					science: years(reached.map((m) => m.first.yearsFromScienceStart))
				};
			}),
			failedExcluded: missions.length - flown.length,
			fastest: fastestOf(flown),
			byDivision: divisions.map((d) => ({ division: d.slug, name: d.name, fastest: fastestOf(ofDivision(flown, d.slug)) }))
		},
		efficiency: {
			divisions: rankable.map((d) => {
				const members = ofDivision(missions, d.slug);
				const cells = efficiencyCells(members, tiers.length);
				const best = bestTier(cells);
				const small = members.filter((m) => m.cost <= thresholdCost);
				const smallShare = efficiencyCell(small, members);
				return {
					division: d.slug,
					name: d.name,
					cells: cells.map((cell) => cell && { missions: cell.missions, n50Share: share(cell.n50Share), costShare: share(cell.costShare), ratio: share(cell.ratio) }),
					under: { missions: small.length, ratio: smallShare ? share(smallShare.ratio) : null, top10: round(sum(small.map((m) => m.top10)), 3) },
					// holds: the same tier stays highest whichever single mission is left out, totals and all
					best: best && {
						tier: best.tier,
						ratio: share(best.ratio),
						holds: members.every((dropped) => bestTier(efficiencyCells(members.filter((m) => m !== dropped), tiers.length))?.tier === best.tier)
					}
				};
			})
		},
		selection: {
			groups: groups.map((_, g) => {
				const members = missions.filter((m) => m.group === g);
				const spreadOf = (key) => rateSpread(members.filter((m) => m.selection === key).map((m) => m.rate));
				return { competed: spreadOf('competed'), directed: spreadOf('directed') };
			}),
			unclassified: missions.filter((m) => m.selection === null).length
		},
		standouts: rankable.map((d) => {
			const members = ofDivision(missions, d.slug);
			const overMedian = median(members.filter((m) => m.cost > thresholdCost).map((m) => m.rate));
			const beat = overMedian === null ? [] : members.filter((m) => m.cost <= thresholdCost && m.rate > overMedian);
			return {
				division: d.slug,
				name: d.name,
				overMedian: share(overMedian),
				missions: beat.sort((a, b) => b.rate - a.rate || byText(a.id, b.id)).map((m) => ({ id: m.id, name: m.name, cost: m.cost, rate: share(m.rate) }))
			};
		})
	};
}

/** `members`' share of the division's N50 over their share of its cost (`all` the division); null when empty. */
function efficiencyCell(members, all) {
	if (!members.length) return null;
	const totalN50 = sum(all.map((m) => m.n50));
	const n50Share = totalN50 > 0 ? sum(members.map((m) => m.n50)) / totalN50 : 0;
	const costShare = sum(members.map((m) => m.cost)) / sum(all.map((m) => m.cost));
	return { missions: members.length, n50Share, costShare, ratio: n50Share / costShare };
}

const efficiencyCells = (members, count) => Array.from({ length: count }, (_, t) => efficiencyCell(members.filter((m) => m.tier === t), members));

/** The tier with the highest ratio, ties to the lower tier; null with no cells. */
function bestTier(cells) {
	let best = null;
	cells.forEach((cell, tier) => {
		if (cell && (best === null || cell.ratio > best.ratio)) best = { tier, ratio: cell.ratio };
	});
	return best;
}
