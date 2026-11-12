import { site, scrolly } from '$lib/data/server.js';

export function load() {
	const { missions, papersDistinct, citationsDistinct, launchYears, story, clps, analysis } = site;
	// Keep shared packaged data intact for the division pages, Analysis and reports. The story reads
	// neither each lander at its own age nor the per-division small-side shares and failure counts.
	const { threshold, bands, pooledBand, scope, divisions, failure: { byDivision, ...failure }, ...storyRest } = story;
	const homeStory = { ...storyRest, failure };
	const { surface, comparison, ...rest } = clps;
	const { landers, ...homeComparison } = comparison;
	const homeClps = { ...rest, comparison: homeComparison };
	const tiles = scrolly.tiles.map(({ share, papers, launchDate, size, ...tile }) => tile);
	// The story's failure chart, time swarm and third finding read the Analysis page's three cost groups
	// (BINS's) as its `tiers`, never its six tiers: analysis.groups with the failure counts and
	// time-to-science medians packaged over them (the swarm reads nothing else of analysis.time)
	return {
		facts: { missions, papersDistinct, citationsDistinct, launchYears, story: homeStory, clps: homeClps, time: { tiers: analysis.time.groups }, tiers: analysis.groups, failureTiers: analysis.failures.groups },
		scrolly: { ...scrolly, tiles }
	};
}
