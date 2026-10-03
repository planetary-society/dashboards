import { site } from '$lib/data/server.js';

export const prerender = true;
export const trailingSlash = 'always';

export function load() {
	return {
		site: {
			asOf: site.asOf,
			attribution: site.attribution,
			divisions: site.divisions,
			referenceCost: site.story.referenceCost,
			costBaseYear: site.costBaseYear,
			windowPolicy: site.windowPolicy,
			fullPolicy: site.fullPolicy
		}
	};
}
