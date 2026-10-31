import { site, scrolly } from '$lib/data/server.js';

export function load() {
	const { missions, papersDistinct, citationsDistinct, launchYears, story, clps, analysis } = site;
	// Keep shared packaged data intact for the division pages, Analysis and reports. The story reads
	// neither each lander at its own age nor the per-division small-side shares and failure counts
	// (FAIL_NOTE reads analysis.failures.tiers).
	const { threshold, bands, pooledBand, scope, divisions, failure: { byDivision, ...failure }, ...storyRest } = story;
	const homeStory = { ...storyRest, failure };
	const { surface, comparison, ...rest } = clps;
	const { landers, ...homeComparison } = comparison;
	const homeClps = { ...rest, comparison: homeComparison };
	const tiles = scrolly.tiles.map(({ share, papers, launchDate, size, ...tile }) => tile);
	// analysis.time gates the third finding, the same time-to-science tiers the Analysis page reads;
	// the cost tiers and their failure counts are the FAILURE step's, the Analysis page's Figure 3
	return {
		facts: { missions, papersDistinct, citationsDistinct, launchYears, story: homeStory, clps: homeClps, time: analysis.time, tiers: analysis.tiers, failureTiers: analysis.failures.tiers },
		scrolly: { ...scrolly, tiles }
	};
}
