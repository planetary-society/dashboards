import { site } from '$lib/data/server.js';

// The methods page quotes provenance the layout's trimmed `site` does not carry (code revision,
// totals) and a few of the story's figures; it gets those and nothing else.
export function load() {
	const { asOf, codeRevision, costBaseYear, fullPolicy, windowPolicy, launchYears, missions, papersDistinct, story } = site;
	const { referenceCost, failure, divisions, comparison } = story;
	return {
		full: { asOf, codeRevision, costBaseYear, fullPolicy, windowPolicy, launchYears, missions, papersDistinct,
			story: { referenceCost, failure, divisions, comparison: { groups: comparison.groups } } }
	};
}
