import { missionsCsv, toCsv } from '$lib/mission/papers.js';
import { canonical, missionHref, papersUrl, scixAbstract } from '$lib/paths.js';

// The download page's CSVs, built one way wherever they are built: its server measures each file with
// these, so a button's size is the size of the file it saves. The division table's CSV matches `tableCsv`.

/** A division's mission table, each mission linked on the live site. */
export const tableCsv = ({ slug, missions }) => missionsCsv(missions, { url: (id) => canonical(missionHref(slug, id)) });

/** A mission's papers, as its paper list writes them, fetched through `fetchFn` (SvelteKit's own on the server). */
export async function paperCsv(id, fetchFn = fetch) {
	const response = await fetchFn(papersUrl(id));
	if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
	return toCsv((await response.json()).columns, scixAbstract);
}
