import { site } from '$lib/data/server.js';

// The methods page quotes provenance the layout's trimmed `site` does not carry
// (fetch range, code revision, totals, per-division filter text), so it takes the whole file.
export function load() {
	return { full: site };
}
