// Rows for the key-measures tables, one builder per page. Pure (no $lib, no $app) so node can
// test it: a hint carries its methods anchor and the table turns that into a link.
import { FOOTNOTES, noteText } from './footnotes.js';
import { int, money, weight, longDate } from '../format.js';

/** h-index is a count; m-index runs 0–12 and needs its decimal. */
export function indexValue(index, v) {
	if (v == null) return '—';
	return index === 'h' ? String(Math.round(v)) : v.toFixed(1);
}

const rowsFor = (site, scope) => (label, ids, value, note = null) => ({
	label,
	value,
	note,
	hint: ids && { text: noteText(ids, site, scope), anchor: FOOTNOTES[ids[0]].anchor }
});

const SELECTION = { competed: 'Competed', directed: 'Directed' };
const MANAGEMENT = { agency: 'Agency-led', pi: 'PI-led', commercial: 'Commercial-led' };

/**
 * The quiet line under a mission's name: type, selection, management, launch, status, then the
 * life-cycle cost as reported and adjusted (an unknown side a dash, never a zero). A part the
 * catalog leaves blank drops out. The cost comes apart from the lead (which ends on its separator)
 * so the page can keep it on one line with its definition.
 */
export function missionLine(meta, site) {
	const status = meta.status?.trim();
	const parts = [
		meta.type,
		SELECTION[meta.selection],
		MANAGEMENT[meta.management],
		meta.dates.launch && `Launched on ${longDate(meta.dates.launch)}`,
		status && status !== 'unknown' && status
	].filter(Boolean);
	const cost = meta.lcc != null || meta.cost != null ? `LCC: ${money(meta.lcc)}/${money(meta.cost)} (${site.costBaseYear} $)` : null;
	return { lead: parts.join(' · ') + (cost && parts.length ? ' · ' : ''), cost };
}

/**
 * The mission's own publication dates for each scope, added to the scope switch's hints: a
 * measured window's exported bounds, and the lifetime from the first publication year to the
 * data's as-of date. A scope with nothing measured gets none.
 */
export function scopeSpans(mission, site) {
	const b = mission.full?.spread && mission.full.bounds?.status === 'available' && mission.full.bounds.start ? mission.full.bounds : null;
	const first = mission.facts?.publicationYears?.[0];
	return {
		full: b && `For ${mission.name}, papers published ${longDate(b.start)} to ${longDate(b.end)}.`,
		lifetime: first && `For ${mission.name}, papers published from ${first} to ${longDate(site.asOf)}.`
	};
}

/**
 * A mission's selected-scope counts, then its citation indices: h, g and m in the selected scope
 * (a window's own, from `windowIndices`), tori and riq always lifetime (Casey's choice; upstream
 * has no window citation graph). Top 1% is measured in the windows only, so Lifetime has no row.
 */
export function missionMeasureGroups(mission, scope, site) {
	const row = rowsFor(site, scope);
	const s = mission[scope];
	const sp = s?.spread;
	const life = mission.indices ?? {};
	const ix = scope === 'lifetime' ? life : (s?.indices ?? {});
	return [
		{
			// the scope switch names the scope and its dates (`scopeSpans`), so the counts go unheaded
			heading: null,
			// Spread is null when the scope's output was not measured: no row may read as a zero then.
			rows: sp
				? [
						row('Tracked publications', ['publications'], int(s.papers)),
						row('Citations', ['citations'], int(s.citations)),
						row('Top-10% papers', ['top10', 'shared'], weight(s.top10)),
						scope !== 'lifetime' && row('Top-1% papers', ['top1', 'shared'], weight(s.top1))
					].filter(Boolean)
				: []
		},
		{
			heading: 'Citation indices',
			rows: [
				row('h-index', ['hindex'], int(ix.h)),
				row('g-index', ['gindex'], int(ix.g)),
				row('m-index', ['mindex'], indexValue('m', ix.m)), // one decimal, as the division chart prints it; a lifetime one's date is in the hint
				row('tori', ['tori'], weight(life.tori)),
				row('riq', ['riq'], int(life.riq))
			]
		}
	];
}
