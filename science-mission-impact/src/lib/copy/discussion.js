// Sentences and the small-vs-larger table for a division page, each built from the division's
// slice of site.story and gated the way the overview gates its claims: a side "leads" only from
// perDollar.favors, a mission is named as carrying the small side only when it holds most of it.
// Pure (no $lib, no $app) so node can test it. Every figure is in the scope the page passes, at the
// top-10% level. "Small" means at or under the threshold, as on the overview.
import { int, money, moneyWords, pct, plural, spell, upperFirst, weight } from '../format.js';

/** Below this many top-10% papers, one mission's share of the small side says little. */
const CARRIER_MIN_TOP = 5;
/** AP possessive: "Heliophysics’", "Earth Science’s". */
const whose = (name) => `${name}’${name.endsWith('s') ? '' : 's'}`;

/** A division whose every costed mission is small, so it has nothing to compare: `d` is a story.divisions row. */
export const allSmall = (d) => d.missions > 0 && d.missions === d.missionsAll;

/**
 * The small side's one dominant mission: more than half its top-10% papers, and enough of them to
 * mean something. `under` is a comparison.byDivision row's under side. The overview uses it too.
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

/** The small side's lead per dollar when it rests on its own largest mission alone; `p` is a perDollar row. The overview uses it too. */
export function loneFlip(p) {
	const rate = (key) => p.groups.find((g) => g.key === key)?.perHundredM;
	return p.flipsOn.length === 1 && p.flipsOn[0].id === p.largestUnder?.id && rate('under') > rate('over') ? p.largestUnder : null;
}

/** Per dollar in one sentence. "Also" only when larger missions led per mission too. */
function perDollarVerdict(f) {
	const p = f.perDollar;
	if (!p) return null;
	const c = f.comparison;
	const also = c && c.under.top10PerMission < c.over.top10PerMission ? ' also' : '';
	if (p.favors === 'over') return `Larger missions${also} drew more citations per dollar.`;
	if (p.favors === 'under') return 'Per dollar, though, small missions drew more citations.';
	const lone = loneFlip(p);
	if (lone) return `Per dollar, small missions drew more citations, but only because of ${lone.name}; without it, larger missions lead.`;
	return 'Per dollar, neither side clearly leads.';
}

/** The stats section's lede: the division's case in two or three sentences. */
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
	if (d.missions === 0) return `None of ${whose(division.name)} ${spell(d.missionsAll)} missions in this study cost ${ref} or less.`;
	const parts = [`Small missions, those that cost ${ref} or less, make up ${pct(d.missionShare)} of ${whose(division.name)} missions in this study and ${pct(d.costShare)} of its spending.`];
	if (d.share != null) parts.push(`They produced ${pct(d.share)} of its top-10% papers, the ones other scientists cited most.`);
	const lead = carrier(f.comparison?.under);
	if (lead) parts.push(lead.share === 1 ? `${lead.name} produced all of that share.` : `${lead.name} alone produced ${pct(lead.share)} of that share.`);
	const verdict = perDollarVerdict(f);
	if (verdict) parts.push(verdict);
	return parts.join(' ');
}

/**
 * The small-vs-larger table: one row per measure, each side already formatted. `note` names the
 * FOOTNOTES entry behind the row's "i". Empty for a division with nothing to compare.
 */
export function statRows(f) {
	const c = f.comparison;
	if (!c) return [];
	const group = (key) => f.perDollar?.groups.find((g) => g.key === key);
	const [u, o] = [group('under'), group('over')];
	const of = (k, n) => `${int(k)} of ${int(n)}`;
	return [
		{ label: 'Missions', under: int(c.under.missions), over: int(c.over.missions) },
		{ label: 'Spending', note: 'cost', under: money(u?.cost), over: money(o?.cost) },
		{ label: 'Top-10% papers', note: 'top10', under: weight(c.under.top10), over: weight(c.over.top10) },
		{ label: 'Missions with a top-10% paper', under: of(c.under.withTop, c.under.missions), over: of(c.over.withTop, c.over.missions) },
		{ label: `Citations per ${money(100)}`, note: 'perDollar', under: int(u?.perHundredM), over: int(o?.perHundredM) },
		{ label: 'Failed or fell short', note: 'failed', under: of(f.failure.under.failed, f.failure.under.missions), over: of(f.failure.over.failed, f.failure.over.missions) }
	];
}

/** The share strip: what the small side accounts for, from missions down to top-10% papers. */
export function shareRows(f) {
	const d = f.divisions;
	if (!f.comparison || d.share == null) return [];
	return [
		{ label: 'Missions', share: d.missionShare },
		{ label: 'Spending', share: d.costShare },
		{ label: 'Citations', share: d.citationShare },
		{ label: 'Top-10% papers', share: d.share }
	];
}
