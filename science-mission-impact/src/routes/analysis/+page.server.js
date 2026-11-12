import { site } from '$lib/data/server.js';

// The Analysis page renders the packaged analysis facts plus the few site and story figures its
// copy cites (the top-10% comparison, the per-dollar verdicts, the window policy and the CLPS
// surface-mission comparison); it computes nothing. The time figures' per-cost-group cells (with
// every mission's points) are the overview's, read on another clock: this page reads only the tiers.
export function load() {
	const { asOf, missions, launchYears, papersDistinct, costBaseYear, fullPolicy, analysis: whole, story, clps } = site;
	const { groups: _overview, ...time } = whole.time;
	const analysis = { ...whole, time };
	const perDollar = story.perDollar.map(({ division, name, favors }) => ({ division, name, favors }));
	return {
		full: { asOf, missions, launchYears, papersDistinct, costBaseYear, fullPolicy, analysis, perDollar, comparison: story.comparison.groups, clps }
	};
}
