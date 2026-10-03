// Build-time data access. Imported only from +page.server.js / +layout.server.js, so the
// packaged JSON is rendered into each prerendered page rather than shipped as one bundle.
import { error } from '@sveltejs/kit';
import site from './generated/site.json';
import index from './generated/index.json';
import scrolly from './generated/scrolly.json';

const divisionFiles = import.meta.glob('./generated/divisions/*.json', { import: 'default', eager: true });
const missionFiles = import.meta.glob('./generated/missions/*.json', { import: 'default' });

const divisions = site.divisions.map((d) => divisionFiles[`./generated/divisions/${d.slug}.json`]);

export { site, index, scrolly };

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

export const divisionEntries = () => site.divisions.map((d) => ({ division: d.slug }));
export const missionEntries = () => index.map((m) => ({ division: m.division, mission: m.id }));
