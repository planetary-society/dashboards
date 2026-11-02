// Build-time data access. Imported only from +page.server.js / +layout.server.js, so the
// packaged JSON is rendered into each prerendered page rather than shipped as one bundle.
import { error } from '@sveltejs/kit';
import site from './generated/site.json';
import index from './generated/index.json';
import scrolly from './generated/scrolly.json';
import clpsLanders from './generated/clps.json';

const divisionFiles = import.meta.glob('./generated/divisions/*.json', { import: 'default', eager: true });
const missionFiles = import.meta.glob('./generated/missions/*.json', { import: 'default' });

const divisions = site.divisions.map((d) => divisionFiles[`./generated/divisions/${d.slug}.json`]);

export { site, index, scrolly, clpsLanders };

export async function loadDivision(slug) {
	const division = divisions.find((d) => d.slug === slug);
	if (!division) error(404, 'No such division');
	return division;
}

export async function loadMission(slug, id) {
	const load = missionFiles[`./generated/missions/${id}.json`];
	if (!load) error(404, 'No such mission');
	const mission = await load();
	if (mission.division !== slug) error(404, 'No such mission');
	return mission;
}

const scopeFields = ({ papers, citations, top10, top1, status }) => ({ papers, citations, top10, top1, status });
/**
 * A division doc's mission row, trimmed to what the division page (its table, charts and CSV) and the
 * download page read: of the window bounds only the full window's dates (the CSV's), and no first-paper details.
 */
export const missionFields = (m) => ({
	id: m.id, shortTitle: m.shortTitle, name: m.name, cost: m.cost, lcc: m.lcc, launchYear: m.launchYear, type: m.type,
	failed: m.failed, shortfall: m.shortfall, status: m.status, hasThumb: m.hasThumb, selection: m.selection, dates: m.dates,
	indices: { h: m.indices?.h ?? null, g: m.indices?.g ?? null },
	full: { ...scopeFields(m.full), bounds: { start: m.full.bounds?.start ?? null, end: m.full.bounds?.end ?? null } },
	lifetime: scopeFields(m.lifetime)
});

export const divisionEntries = () => site.divisions.map((d) => ({ division: d.slug }));
export const missionEntries = () => index.map((m) => ({ division: m.division, mission: m.id }));
