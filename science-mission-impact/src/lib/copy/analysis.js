// Copy rules for the Analysis page. Every claim the page makes about the record is decided here
// from packaged facts (site.analysis), so a refresh that changes the data changes the words or
// drops the sentence instead of leaving it wrong. Pure: facts in, facts out.
import { listify } from '../format.js';
import { edgeMoney } from '../analysis/tiers.js';
import { wilson } from '../data/public.js';

/** Fewer missions than this in a tier and its median is shown but never singled out in prose. */
export const MIN_REACHED = 3;

/** A time tier where most missions have no first top-10% paper yet. */
export const mostUnreached = (tier) => tier.reached * 2 < tier.missions;

/** Both selection methods need at least this many missions in a group before the page compares them. */
export const MIN_COMPARE = 10;

/** Two medians this close (years) are named together rather than one "shortest". */
export const CLOSE_YEARS = 0.5;

/** A tier edge in running prose, exact rather than rounded, in the charts' short style: 50 → "$50M", 1550 → "$1.55B". */
export const edgeWords = edgeMoney;

/** "$50M or less", "$50M to $150M", "more than $1.55B" (membership is lo < cost <= hi). */
export function tierWords({ lo, hi }) {
	if (hi == null) return `more than ${edgeWords(lo)}`;
	if (lo === 0) return `${edgeWords(hi)} or less`;
	return `${edgeWords(lo)} to ${edgeWords(hi)}`;
}

/** N50 per $M as printed: two decimals below 10, one above. */
export const rate = (v) => (v == null ? '—' : v < 10 ? v.toFixed(2) : v.toFixed(1));

/** An efficiency ratio as printed in the heatmap: "1.4×". */
export const ratio = (v) => (v == null ? '—' : `${v.toFixed(1)}×`);

/**
 * The tier whose missions reached a first top-10% paper soonest from formulation, among tiers
 * with at least MIN_REACHED dated missions; `close` is the runner-up when within CLOSE_YEARS.
 */
export function shortestTier(time) {
	const ranked = time.tiers
		.map((t, index) => ({ index, median: t.formulation.median, dated: t.reached - t.undated }))
		.filter((t) => t.median != null && t.dated >= MIN_REACHED)
		.sort((a, b) => a.median - b.median || a.index - b.index);
	if (!ranked.length) return null;
	const [first, second] = ranked;
	return { ...first, close: second && second.median - first.median < CLOSE_YEARS ? second : null };
}

/**
 * How the wait from the start of science runs with cost: 'falls' when every costlier tier's median
 * is shorter than the one before; 'ends' when only the cheapest tier is longest and the costliest
 * shortest; null otherwise (the page then makes no ordering claim), and null when any tier has
 * fewer than MIN_REACHED missions with a first top-10% paper, too few for its median to rank.
 */
export function scienceOrder(time) {
	if (time.tiers.some((t) => t.reached < MIN_REACHED)) return null;
	const medians = time.tiers.map((t) => t.science.median);
	if (medians.some((m) => m == null)) return null;
	if (medians.every((m, i) => i === 0 || m < medians[i - 1])) return 'falls';
	const max = Math.max(...medians);
	const min = Math.min(...medians);
	const once = (v) => medians.filter((m) => m === v).length === 1;
	return medians[0] === max && medians.at(-1) === min && once(max) && once(min) ? 'ends' : null;
}

/** The costliest tier's median wait from formulation is longer than every other dated tier's. */
export function slowestBuild(time) {
	const last = time.tiers.at(-1);
	return last.formulation.median != null && time.tiers.every((t) => t === last || t.formulation.median == null || t.formulation.median < last.formulation.median);
}

/** The wait from formulation doesn't simply grow with cost: some costlier tier's median is shorter than a cheaper one's. */
export function notLinear(time) {
	const medians = time.tiers.map((t) => t.formulation.median).filter((m) => m != null);
	return medians.some((m, i) => i > 0 && m < medians[i - 1]);
}

/** The one compared division whose small missions have the highest share-for-share ratio; null on a tie or none. */
export function topUnder(efficiency) {
	const rows = efficiency.divisions.filter((d) => d.under.missions > 0 && d.under.ratio != null).sort((a, b) => b.under.ratio - a.under.ratio);
	return rows.length && (rows.length === 1 || rows[0].under.ratio > rows[1].under.ratio) ? rows[0] : null;
}

/** Of the divisions the story compares per dollar, those where costlier missions drew more citations per dollar (packaged `favors`). */
export const favorsOver = (perDollar) => perDollar.filter((p) => p.favors === 'over');

/**
 * The cost group where both selection methods are common enough to compare, with which side's
 * median N50 per dollar is higher; null when no group qualifies or the medians tie.
 */
export function selectionContrast(selection) {
	const index = selection.groups.findIndex((g) => g.competed.missions >= MIN_COMPARE && g.directed.missions >= MIN_COMPARE);
	if (index < 0) return null;
	const { competed, directed } = selection.groups[index];
	if (competed.median === directed.median) return null;
	return { index, competed, directed, higher: competed.median > directed.median ? 'competed' : 'directed' };
}

/** A series whose items carry lists of their own ("ELFIN and TRACE in Heliophysics") is split by semicolons; a plain one is listify's. */
export function series(items) {
	const nested = items.length > 1 && items.some((item) => item.includes(',') || item.includes(' and '));
	return nested ? `${items.slice(0, -1).join('; ')}; and ${items.at(-1)}` : listify(items);
}

/** The smallest cost group's median N50 per dollar is below every other group's. */
export function smallLowest(groupRates) {
	const [small, ...rest] = groupRates;
	return small.median != null && rest.length > 0 && rest.every((g) => g.median != null && small.median < g.median);
}

/**
 * One division's missions and shortfalls (failed + partial) in all, at or under a tier edge and
 * over it, summed from the packaged per-tier counts (`failures.tiers[].byDivision`, in `tiers`
 * order). `below` and `above` are null for an `edge` that is not a tier's upper edge, so a
 * mistyped edge drops the comparison but never the totals.
 */
export function divisionShortfalls(tiers, failureTiers, division, edge) {
	const split = tiers.some((t) => t.hi === edge);
	const side = () => ({ missions: 0, short: 0 });
	const out = { all: side(), below: split ? side() : null, above: split ? side() : null };
	failureTiers.forEach((t, i) => {
		const d = t.byDivision.find((row) => row.division === division);
		if (!d) return;
		const n = d.ok + d.failed + d.partial;
		const k = d.failed + d.partial;
		const sides = [out.all];
		if (split) sides.push(tiers[i].hi != null && tiers[i].hi <= edge ? out.below : out.above);
		for (const s of sides) {
			s.missions += n;
			s.short += k;
		}
	});
	return out;
}

/** Two Wilson 95% intervals ([low, high] shares) with `a` wholly above `b`; false when either is missing. */
export const apart = (a, b) => a != null && b != null && a[0] > b[1];

/** `a` fell short at a clearly higher rate than `b` (`{ missions, short }` each): their Wilson intervals apart. */
export const clearlyHigher = (a, b) => a != null && b != null && apart(wilson(a.short, a.missions), wilson(b.short, b.missions));

/** "About" in a cost comparison: within a quarter either way. */
const about = (a, b) => a > 0 && b > 0 && Math.abs(a / b - 1) < 0.25;

/**
 * The CLPS comparators (site.clps.comparison.comparators, each with its packaged cost), the landers'
 * summed (`all`) and mean (`each`) cost, the comparator that cost about as much as one lander
 * (`likeOne`) or as all of them together (`likeAll`; null where none does or a lander's cost is
 * unknown), and `either`, how prose names the comparators together.
 */
export function clpsCosts(clps) {
	const compared = clps.comparison?.comparators ?? [];
	const all = clps.comparison?.cost ?? null;
	const each = clps.comparison?.costEach ?? null;
	return {
		compared, all, each,
		either: compared.length === 2 ? 'either' : 'each of them',
		likeOne: compared.find((c) => about(c.cost, each)) ?? null,
		likeAll: compared.find((c) => about(c.cost, all)) ?? null
	};
}
