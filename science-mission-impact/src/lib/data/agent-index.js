import { scopeLabel } from '../copy/window.js';

/** Navigation and data semantics only; the authors' analysis stays on its own page. */
export function agentIndex(site, root) {
	return [
		'# Science Mission Impact',
		'',
		'> NASA science mission costs, tracked publications, and citations from The Planetary Society.',
		'',
		`Data snapshot: ${site.asOf}. Use the export manifest for the dataset version and file inventory.`,
		'Active Mission Window and Lifetime are distinct measurement scopes. Base mission and division URLs show the active window; append lifetime/ for lifetime measurements. Each view is available as static HTML.',
		'CSV mission summaries include both scopes. Read the dictionary before comparing costs or aggregating publications: missing values differ from zero, and a publication can be associated with more than one mission.',
		'',
		'## Research',
		`- [Overview](${root}): Study context and interactive exploration.`,
		`- [Analysis](${root}analysis/): The authors’ findings and supporting evidence.`,
		`- [Methods](${root}methods/): Selection, measurement windows, limitations, and sources.`,
		'',
		'## Data and reuse',
		`- [Downloads](${root}download/): CSV downloads, data dictionary, and dataset citation.`,
		`- [Manifest](${root}data/exports/manifest.json): File URLs, sizes, row counts, versions, and mission pages.`,
		`- [Data dictionary](${root}data/exports/dictionary.json): Field definitions, units, scopes, and source terms.`,
		`- [Citation and license](${root}download/#citation): CC BY 4.0 for TPS’s original contributions; third-party terms are identified separately.`,
		'',
		'## Divisions',
		...site.divisions.flatMap((d) => [
			`- [${d.name}: ${scopeLabel('full')}](${root}${d.slug}/): Mission comparisons in the active window.`,
			`- [${d.name}: ${scopeLabel('lifetime')}](${root}${d.slug}/lifetime/): Lifetime measurements and mission links.`
		]),
		''
	].join('\n');
}
