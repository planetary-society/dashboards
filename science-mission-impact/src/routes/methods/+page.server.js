import { site } from '$lib/data/server.js';

// The methods page quotes provenance the layout's trimmed `site` does not carry (code revision,
// totals), the story's reference cost and the analysis's N_c divisors; it gets those and nothing else.
export function load() {
	const { asOf, codeRevision, costBaseYear, fullPolicy, windowPolicy, launchYears, missions, papersDistinct, story } = site;
	return {
		full: { asOf, codeRevision, costBaseYear, fullPolicy, windowPolicy, launchYears, missions, papersDistinct,
			story: { referenceCost: story.referenceCost } },
		nc: site.analysis.nc
	};
}
