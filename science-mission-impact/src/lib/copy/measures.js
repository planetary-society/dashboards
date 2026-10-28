// Rows for the key-measures tables, one builder per page. Pure (no $lib, no $app) so node can
// test it: a hint carries its methods anchor and the table turns that into a link.
import { FOOTNOTES, noteText } from './footnotes.js';
import { fullWindowLabel, scopeLabel } from './window.js';
import { int, money, weight, pct, longDate } from '../format.js';

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
const share = (s) => (s == null ? null : `${pct(s)} of division`);
const uncited = (n, papers) => (papers && n != null ? `${int(n)} (${pct(n / papers)})` : int(n));

/** What the mission is and what it cost, from its catalog entry; no scope changes these. A fact the catalog leaves blank drops out. */
export function missionFactGroups(mission, site) {
	const row = rowsFor(site);
	const { meta } = mission;
	const d = meta.dates;
	return [
		{
			heading: 'Mission',
			rows: [
				row('Program', null, meta.program),
				row('Type', null, meta.type),
				row('Target', null, meta.target),
				row('Status', null, meta.status),
				row('Launch', null, d.launch && longDate(d.launch), meta.launchVehicle),
				row('Prime mission', null, d.scienceStart && d.primeEnd && `${longDate(d.scienceStart)} to ${longDate(d.primeEnd)}`),
				row('Mission end', null, d.missionEnd && longDate(d.missionEnd))
			].filter((r) => r.value)
		},
		{
			heading: 'Life-cycle cost · through the prime mission, with partner contributions',
			rows: [
				row('As reported', null, money(meta.lcc), 'nominal dollars'),
				row(`Adjusted to ${site.costBaseYear} dollars`, ['cost'], money(meta.cost))
			]
		}
	];
}

/** A mission's selected-scope counts, then the lifetime indices, which no scope changes. */
export function missionMeasureGroups(mission, scope, site) {
	const row = rowsFor(site, scope);
	const s = mission[scope];
	const sp = s?.spread;
	const ix = mission.indices ?? {};
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
						row('Mean citations per publication', ['meanCitations'], weight(sp.mean)),
						row('Median citations per publication', ['medianCitations'], weight(sp.median)),
						row('Uncited publications', ['uncited'], uncited(sp.uncited, s.papers)),
						row('Top-10% credit', ['top10', 'shared'], weight(s.top10), share(s.top10ShareOfDivision)),
						scope === 'lifetime'
							? row('Top-1% credit', ['top1', 'shared'], '—', `${fullWindowLabel} only`)
							: row('Top-1% credit', ['top1', 'shared'], weight(s.top1), share(s.top1ShareOfDivision))
					]
				: []
		},
		{
			heading: 'Lifetime indices · every tracked publication to date, in any scope',
			rows: [
				row('h-index', ['hindex'], int(ix.h)),
				row('g-index', ['gindex'], int(ix.g)),
				row(`m-index, as of ${longDate(site.asOf)}`, ['mindex'], indexValue('m', ix.m)), // one decimal, as the division chart prints it
				row('tori', ['tori'], weight(ix.tori)),
				row('riq', ['riq'], int(ix.riq))
			]
		}
	];
}
