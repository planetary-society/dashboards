import { site, scrolly } from '$lib/data/server.js';

export function load() {
	const { missions, papersDistinct, launchYears, story, clps, kinds } = site;
	return { facts: { missions, papersDistinct, launchYears, story, clps, kinds }, scrolly };
}
