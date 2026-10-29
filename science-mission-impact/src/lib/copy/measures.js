// Rows for the key-measures tables, one builder per page. Pure (no $lib, no $app) so node can
// test it: a hint carries its methods anchor and the table turns that into a link.
import { FOOTNOTES, noteText } from './footnotes.js';
import { scopeLabel } from './window.js';
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

/** The prime mission by month, "April 1990 to April 2005", or null when the catalog lacks either end. */
export const primeSpan = ({ scienceStart, primeEnd }) => (scienceStart && primeEnd ? `${longDate(scienceStart.slice(0, 7))} to ${longDate(primeEnd.slice(0, 7))}` : null);

/** When it launched, its prime mission, and what it cost as reported and adjusted; no scope changes these. A fact the catalog leaves blank drops out. */
export function missionFacts(mission, site) {
	const row = rowsFor(site);
	const { meta } = mission;
	return [
		row('Launch date', null, meta.dates.launch && longDate(meta.dates.launch)),
		row('Prime mission', null, primeSpan(meta.dates)),
		// an unknown side is a dash, never a zero
		row('Life-cycle cost', ['cost'], (meta.lcc != null || meta.cost != null) && `${money(meta.lcc)}/${money(meta.cost)} (${site.costBaseYear} $)`)
	].filter((r) => r.value);
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
	// A measured window names its publication dates beside the scope; lifetime and empty windows have none.
	const b = sp && s.bounds?.status === 'available' && s.bounds.start ? s.bounds : null;
	return [
		{
			heading: b ? `${scopeLabel(scope)} · papers ${longDate(b.start)} to ${longDate(b.end)}` : scopeLabel(scope),
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
