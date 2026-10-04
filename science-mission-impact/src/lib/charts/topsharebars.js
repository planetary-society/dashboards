import { int, plural, weight } from '../format.js';

const count = (n) => Number.isFinite(n) && n >= 0;

/**
 * One row per mission measured in `scope`. A rankable division ranks each mission's top-`top`%
 * paper credit (`value`: shared papers split credit, so it can be fractional); a division too
 * small to rank counts tracked publications instead. Unavailable output is never a measured
 * zero: it is left out, not drawn.
 */
export function topShareModel(missions, scope, { rankable = true, top = 10 } = {}) {
	const key = top === 1 ? 'top1' : 'top10';
	const rows = [];
	const unavailable = [];
	for (const m of missions) {
		const s = m[scope];
		const credit = rankable ? s?.[key] : 0;
		if (!s || !['measured', 'assumed_zero'].includes(s.outputBasis) ||
			(s.status && s.status !== 'available') || !count(s.papers) || !count(credit) ||
			(s.papers === 0 && credit !== 0)) {
			unavailable.push(m.name);
			continue;
		}
		const value = rankable ? credit : s.papers;
		const papers = `${int(s.papers)} tracked ${plural(s.papers, 'publication')}`;
		rows.push({
			id: m.id, name: m.name, failed: !!m.failed, hasThumb: !!m.hasThumb,
			papers: s.papers, value,
			text: rankable ? weight(value) : int(value),
			label: rankable ? `${m.name}: ${weight(credit)} top-${top}% papers of ${papers}` : `${m.name}: ${papers}`
		});
	}
	rows.sort((a, b) => b.value - a.value || b.papers - a.papers || a.name.localeCompare(b.name));
	const max = Math.max(0, ...rows.map((r) => r.value));
	for (const r of rows) r.width = max > 0 ? r.value / max * 100 : 0;
	return { rows, unavailable };
}
