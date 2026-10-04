import { index, site } from '$lib/data/server.js';
import thumbs from '../../../static/img/missions/manifest.json';

/** Each mission thumbnail's source, grouped by the site that hosts it (largest group first). */
function imageCredits() {
	const groups = new Map();
	for (const mission of [...index].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
		const url = thumbs[mission.id]?.status === 'ok' ? thumbs[mission.id].url : null;
		if (!url) continue;
		const host = new URL(url).hostname.replace(/^www\./, '');
		if (!groups.has(host)) groups.set(host, []);
		// keyed by id in the page: two missions can share one image (HETE 1 and HETE 2 do)
		groups.get(host).push({ id: mission.id, name: mission.name, url });
	}
	return [...groups].map(([host, missions]) => ({ host, missions }))
		.sort((a, b) => b.missions.length - a.missions.length || a.host.localeCompare(b.host, 'en'));
}

// The methods page quotes provenance the layout's trimmed `site` does not carry
// (fetch range, code revision, totals, per-division filter text), so it takes the whole file.
export function load() {
	return { full: site, credits: imageCredits() };
}
