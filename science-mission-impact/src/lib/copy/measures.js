// Rows for the key-measures tables, one builder per page. Pure (no $lib, no $app) so node can
// test it: a hint carries its methods anchor and the table turns that into a link.
import { FOOTNOTES, noteText } from './footnotes.js';
import { scopeLabel } from './window.js';
import { int, weight, pct, longDate } from '../format.js';

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
			heading: b ? `${scopeLabel(scope, site)} · papers ${longDate(b.start)} to ${longDate(b.end)}` : scopeLabel(scope, site),
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
							? row('Top-1% credit', ['top1', 'shared'], '—', 'windowed scopes only')
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
