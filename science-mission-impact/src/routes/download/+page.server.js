import { clpsLanders, loadDivision, missionFields, site } from '$lib/data/server.js';
import { allMissionsCsv, clpsCsv, hasPapers, publicationsCsv } from '$lib/mission/papers.js';
import { scixAbstract } from '$lib/paths.js';
import { paperCsv, tableCsv } from './files.js';

const bytes = (text) => Buffer.byteLength(text);

// Every division's mission rows, trimmed as the division pages trim them, and the CLPS landers' CSV,
// small enough to hand over ready-made. Every other file is built in the browser, on request; its size
// is measured here, at prerender, with the same builders, so each button can say how big its file is.
export async function load({ fetch }) {
	const divisions = await Promise.all(
		site.divisions.map(async ({ slug, name }) => ({ slug, name, missions: (await loadDivision(slug)).missions.map(missionFields) }))
	);
	const tables = divisions.map(tableCsv);
	const papers = new Map(
		await Promise.all(divisions.flatMap((d) => d.missions.filter(hasPapers).map(async (m) => [m.id, await paperCsv(m.id, fetch)])))
	);
	const publications = (list) => publicationsCsv(list, (id) => papers.get(id));
	const clps = clpsCsv(clpsLanders, scixAbstract);
	return {
		divisions,
		clps,
		landers: site.clps.missions.length,
		sizes: {
			allMissions: bytes(allMissionsCsv(divisions, tables)),
			allPublications: bytes(publications(divisions)),
			clps: bytes(clps),
			divisions: Object.fromEntries(divisions.map((d, k) => [d.slug, { missions: bytes(tables[k]), publications: bytes(publications([d])) }])),
			missions: Object.fromEntries([...papers].map(([id, csv]) => [id, bytes(csv)]))
		}
	};
}
