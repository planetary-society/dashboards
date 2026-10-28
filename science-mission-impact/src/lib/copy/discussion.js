// Sentences and the summary table for a division page, each built from the division's slice of
// site.story, plus the per-dollar trend wording the overview shares. A trend "rises" or "falls"
// only from the packaged fit's slope, is "nearly flat" by its tenfold, and carries the caveat only
// when dropping one mission reverses it. Pure (no $lib, no $app) so node can test it. Every figure
// is in the scope the page passes, at the top-10% level. "Small" means at or under the threshold.
import { int, money, moneyWords, plural, spell, upperFirst, weight } from '../format.js';

/** Below this many top-10% papers, one mission's share of the small side says little. */
const CARRIER_MIN_TOP = 5;
/** AP possessive: "Heliophysics’", "Earth Science’s". */
const whose = (name) => `${name}’${name.endsWith('s') ? '' : 's'}`;

/** A division whose every costed mission is small, so it has nothing to compare: `d` is a story.divisions row. */
export const allSmall = (d) => d.missions > 0 && d.missions === d.missionsAll;

/** "Nearly flat": under a quarter more (or less) per dollar at ten times the cost. `fit` is a packaged perDollar fit. */
export const flat = (fit) => Math.abs(fit.tenfold - 1) < 0.25;
export const direction = (fit) => (fit.slope > 0 ? 'rises' : fit.slope < 0 ? 'falls' : 'is flat');
export const times = (v) => (Math.abs(v - 2) < 0.05 ? 'twice' : `${v.toFixed(1)} times`);
/** A trend the copy won't state plainly: nearly flat, or reversed by leaving out one mission. Charts draw it dashed grey. */
export const soft = (fit) => flat(fit) || fit.holds === false;
/** A rise the copy states and sizes with no caveat: tested, holding, and not nearly flat. */
export const firm = (fit) => fit.slope > 0 && fit.holds === true && !flat(fit);
/** The caveat a trend carries when leaving out one mission reverses it. */
export const TIPS = 'leaving out a single mission tips it the other way';
/** A rise's size in words: "a mission that cost 10 times as much drew about twice as many citations per dollar". */
export const tenfold = (fit) => `a mission that cost 10 times as much drew about ${times(fit.tenfold)} as many citations per dollar`;

/**
 * The small side's one dominant mission: more than half its top-10% papers, and enough of them to
 * mean something. `under` is a comparison.byDivision row's under side. The overview uses it.
 */
export function carrier(under) {
	return under?.largest && under.largest.share > 0.5 && under.top10 >= CARRIER_MIN_TOP ? under.largest : null;
}

/** "of the seven, four were lost", "of the five, one fell short of its goals": led by "of" so no sentence opens on a numeral. */
function shortfallClause({ missions, failed, lost }) {
	const of = `of the ${spell(missions)}`;
	if (failed === 0) return `${of}, none failed or fell short`;
	const verb = lost === failed ? `${plural(failed, 'was', 'were')} lost`
		: lost === 0 ? `fell short of ${plural(failed, 'its', 'their')} goals`
		: `failed or fell short (${spell(lost)} lost outright)`;
	return `${of}, ${spell(failed)} ${verb}`;
}

/** The small side's lead per dollar when it rests on its own largest mission alone; `p` is a perDollar row. The overview uses it. */
export function loneFlip(p) {
	const rate = (key) => p.groups.find((g) => g.key === key)?.perHundredM;
	return p.flipsOn.length === 1 && p.flipsOn[0].id === p.largestUnder?.id && rate('under') > rate('over') ? p.largestUnder : null;
}

/**
 * The division's costed, measured missions together. The packaged under and over sides are
 * disjoint, so each figure is their sum. Null for a division with nothing to compare.
 */
function divisionTotals(f) {
	const c = f.comparison;
	if (!c) return null;
	const both = (side, key) => side.under[key] + side.over[key];
	const sum = (key) => (f.perDollar?.groups ?? []).reduce((s, g) => s + g[key], 0);
	const cost = sum('cost');
	return {
		missions: both(c, 'missions'),
		top10: both(c, 'top10'),
		withTop: both(c, 'withTop'),
		cost,
		perHundredM: cost > 0 ? (sum('citations') / cost) * 100 : null,
		failed: both(f.failure, 'failed'),
		failureMissions: both(f.failure, 'missions')
	};
}

/** The best fit across the division's missions in one sentence, worded as the overview words it. */
function trendSentence(fit) {
	if (!fit) return null;
	const caveat = fit.holds === false ? `, though ${TIPS}` : '';
	const across = `Per dollar, the best fit across its ${spell(fit.missions)} missions with citations`;
	if (flat(fit)) return `${across} is nearly flat${caveat}.`;
	const ten = fit.slope > 0 ? `: ${upperFirst(tenfold(fit))}` : '';
	return `${across} ${direction(fit)} with cost${ten}${caveat}.`;
}

/** The stats section's lede: what the division's missions cost and produced, then the per-dollar trend. */
export function statsLede(f, division) {
	const d = f.divisions;
	const ref = moneyWords(f.referenceCost);
	if (!division.rankable) {
		return [
			allSmall(d)
				? `All ${spell(d.missions)} ${division.name} missions in this study cost ${ref} or less, so there are no larger missions to compare them with.`
				: `Of ${whose(division.name)} ${spell(d.missionsAll)} missions in this study, ${spell(d.missions)} cost ${ref} or less.`,
			`${upperFirst(shortfallClause(f.failure.under))}.`
		].join(' ');
	}
	const t = divisionTotals(f);
	if (!t) return `${whose(division.name)} ${spell(d.missionsAll)} missions in this study have no costs to compare.`;
	// the totals cover only costed, measured missions: "in this study" only when that is every one
	const counted = t.missions === (division.missions?.length ?? t.missions)
		? `${whose(division.name)} ${spell(t.missions)} missions in this study`
		: `The ${spell(t.missions)} ${division.name} missions with costs and measured output`;
	return [
		`${counted} cost ${moneyWords(t.cost)} in all and produced ${weight(t.top10)} top-10% papers, the ones other scientists cited most; ${spell(t.withTop)} of them had at least one.`,
		trendSentence(f.perDollar?.fit)
	].filter(Boolean).join(' ');
}

/**
 * The division's summary table: one row per measure, already formatted. `note` names the
 * FOOTNOTES entry behind the row's "i". Empty for a division with nothing to compare.
 */
export function statRows(f) {
	const t = divisionTotals(f);
	if (!t) return [];
	const of = (k, n) => `${int(k)} of ${int(n)}`;
	return [
		{ label: 'Missions', value: int(t.missions) },
		{ label: 'Spending', note: 'cost', value: money(t.cost) },
		{ label: 'Top-10% papers', note: 'top10', value: weight(t.top10) },
		{ label: 'Missions with a top-10% paper', value: of(t.withTop, t.missions) },
		{ label: `Citations per ${money(100)}`, note: 'perDollar', value: int(t.perHundredM) },
		{ label: 'Failed or fell short', note: 'failed', value: of(t.failed, t.failureMissions) }
	];
}
