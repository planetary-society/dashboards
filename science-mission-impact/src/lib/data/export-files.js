import { CSV_HEADER, allMissionsCsv, clpsCsv, hasPapers, missionsCsv, publicationsCsv, toCsv } from '../mission/papers.js';

/** The catalog is also the filename allowlist; request parameters never become filesystem paths. */
export function exportCatalog(divisions) {
	return [
		{ filename: 'science-mission-impact-missions.csv', kind: 'missions' },
		// The corpus is the per-mission files combined; zipped so it is committed once, compressed.
		{ filename: 'science-mission-impact-publications.zip', kind: 'publications', archive: 'science-mission-impact-publications.csv' },
		{ filename: 'science-mission-impact-clps.csv', kind: 'clps' },
		...divisions.flatMap((d) => [
			{ filename: `${d.slug}-missions.csv`, kind: 'missions', division: d.slug },
			...d.missions.filter(hasPapers).map((m) => ({
				filename: `${m.id}-publications.csv`, kind: 'publications', division: d.slug,
				mission: m.id, missionKey: m.shortTitle, name: m.name
			}))
		])
	];
}

/** One catalog entry's CSV text, from the same builders the pages use. Paper files are read one at a time. */
export async function buildExport(entry, { divisions, landers, readPapers, missionUrl, scixUrl }) {
	if (entry.kind === 'clps') return clpsCsv(landers, scixUrl);
	const table = (d) => missionsCsv(d.missions, { url: (id) => missionUrl(d.slug, id) });
	if (entry.kind === 'missions') {
		return entry.division ? table(divisions.find((d) => d.slug === entry.division)) : allMissionsCsv(divisions, divisions.map(table));
	}
	if (entry.mission) return toCsv((await readPapers(entry.mission)).columns, scixUrl);
	// The corpus: every mission's papers under division,mission.
	const papers = new Map();
	for (const d of divisions) {
		for (const m of d.missions.filter(hasPapers)) papers.set(m.id, toCsv((await readPapers(m.id)).columns, scixUrl));
	}
	// joinCsv writes nothing for no parts; keep the header so the file is still a valid CSV.
	if (!papers.size) return ['division', 'mission', ...CSV_HEADER].join(',');
	return publicationsCsv(divisions, (id) => papers.get(id));
}
