import { site, scrolly } from '$lib/data/server.js';

export function load() {
	const { missions, papersDistinct, citationsDistinct, launchYears, story, clps, analysis } = site;
	// analysis.time gates the third finding, the same time-to-science tiers the Analysis page reads;
	// the cost tiers and their failure counts are the FAILURE step's, the Analysis page's Figure 3
	return { facts: { missions, papersDistinct, citationsDistinct, launchYears, story, clps, time: analysis.time, tiers: analysis.tiers, failureTiers: analysis.failures.tiers }, scrolly };
}
