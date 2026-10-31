/**
 * Pure helpers behind PaperBrowser, plus the CSV of a division's mission table.
 *
 * The papers file is columnar and can hold ~19k rows, so nothing here ever
 * materialises an array of row objects: filtering and sorting work on an index
 * array of integers over the columns, and a row object is built only for the
 * hundred rows actually on screen.
 *
 * Relative imports (not $lib) so `node --test` can run the tests without Vite.
 */

/**
 * Journal abbreviation out of a 19-character bibcode: characters 4-8 with the
 * padding dots stripped. "2004Sci...305..842P" -> "Sci".
 *
 * @param {string | null | undefined} bibcode
 * @returns {string}
 */
export function journalFromBibcode(bibcode) {
	if (typeof bibcode !== 'string' || bibcode.length < 5) return '';
	return bibcode.slice(4, 9).replace(/\./g, '').trim();
}

/**
 * One lowercase "title first-author" string per row, built once per loaded file
 * and reused by every keystroke. Building it for 19k rows costs a few ms;
 * rebuilding it per keystroke would not.
 *
 * @param {import('../data/types.d.ts').PapersFile['columns']} columns
 * @returns {string[]}
 */
export function buildSearchIndex(columns) {
	const titles = columns.t;
	const authors = columns.a;
	const n = titles.length;
	const out = new Array(n);
	for (let i = 0; i < n; i += 1) {
		const title = titles[i] ?? '';
		const author = authors[i] ?? '';
		out[i] = (author ? `${title} ${author}` : title).toLowerCase();
	}
	return out;
}

/**
 * Column keys per scope: citations counted in the scope, top-10% weight, pooled
 * top-1% weight. Lifetime has no top 1%; the view never pairs them, and if asked it reads
 * the full-mission window. The files carry no prime-window columns, so that scope reads full too.
 */
const SCOPE_COLUMNS = {
	full: { cited: 'f', top10: 'fe', top1: 'f1' },
	lifetime: { cited: 'c', top10: 'e', top1: 'f1' }
};
const keysFor = (scope) => SCOPE_COLUMNS[scope] ?? SCOPE_COLUMNS.full;

/**
 * The tie-weight column that decides "is this paper a top paper" for a given
 * view: top 1% exists in the two windowed scopes only; top 10% exists in every scope.
 *
 * @param {import('../data/types.d.ts').PapersFile['columns']} columns
 * @param {import('../data/types.d.ts').Scope} scope
 * @param {10 | 1} top
 */
export function topColumn(columns, scope, top) {
	const keys = keysFor(scope);
	return columns[Number(top) === 1 ? keys.top1 : keys.top10];
}

/**
 * Indices of the rows that match the current search and top-papers toggle, in
 * `order` (a sortIndex result, so a keystroke never re-sorts), or file order
 * (most cited first) without one.
 *
 * @param {import('../data/types.d.ts').PapersFile['columns']} columns
 * @param {{ search?: string, topOnly?: boolean, scope?: import('../data/types.d.ts').Scope, top?: 10|1, haystack?: string[] | null, order?: number[] | null }} [options]
 * @returns {number[]}
 */
export function filterIndex(columns, options = {}) {
	const { search = '', topOnly = false, scope = 'full', top = 10, haystack = null, order = null } = options;
	const n = order ? order.length : columns.b.length;
	const needle = String(search ?? '')
		.trim()
		.toLowerCase();
	const hay = needle ? (haystack ?? buildSearchIndex(columns)) : null;
	const weights = topOnly ? topColumn(columns, scope, top) : null;

	const out = [];
	for (let k = 0; k < n; k += 1) {
		const i = order ? order[k] : k;
		if (weights && !(weights[i] > 0)) continue;
		if (hay && !hay[i].includes(needle)) continue;
		out.push(i);
	}
	return out;
}

/** Descending, with null/undefined always last. */
function nullsLastDesc(a, b) {
	const aNull = a == null;
	const bNull = b == null;
	if (aNull && bNull) return 0;
	if (aNull) return 1;
	if (bNull) return -1;
	return b - a;
}

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Sort an index array. Every order is total — ties fall back to lifetime
 * citations and then the bibcode — so the list never wobbles between renders.
 *
 * "cited" is lifetime citations in every scope: the count each row shows, and the order
 * of the prerendered list, so loading the full table never reshuffles what is on screen.
 *
 * @param {number[]} index
 * @param {import('../data/types.d.ts').PapersFile['columns']} columns
 * @param {{ sort?: 'cited'|'newest'|'oldest' }} [options]
 * @returns {number[]}
 */
export function sortIndex(index, columns, options = {}) {
	const { sort = 'cited' } = options;
	const out = index.slice();
	const citations = columns.c;
	const years = columns.y;
	const bibcodes = columns.b;

	const tieBreak = (i, j) => {
		const d = (citations[j] ?? 0) - (citations[i] ?? 0);
		return d !== 0 ? d : compareStrings(bibcodes[i], bibcodes[j]);
	};

	if (sort === 'cited') {
		out.sort((i, j) => nullsLastDesc(citations[i], citations[j]) || compareStrings(bibcodes[i], bibcodes[j]));
		return out;
	}

	const dir = sort === 'oldest' ? 1 : -1;
	out.sort((i, j) => {
		const a = years[i];
		const b = years[j];
		if (a == null && b == null) return tieBreak(i, j);
		if (a == null) return 1;
		if (b == null) return -1;
		if (a !== b) return (a - b) * dir;
		return tieBreak(i, j);
	});
	return out;
}

/**
 * One row object, built on demand for a row that is about to be rendered.
 *
 * @param {import('../data/types.d.ts').PapersFile['columns']} columns
 * @param {number} i
 * @param {import('../data/types.d.ts').Scope} [scope] which window and weights drive the row
 */
export function rowAt(columns, i, scope = 'full') {
	const bibcode = columns.b[i];
	const keys = keysFor(scope);
	const top10 = columns[keys.top10][i];
	const shared = Number(columns.s[i] ?? 1);
	return {
		i,
		bibcode,
		year: columns.y[i],
		title: columns.t[i],
		firstAuthor: columns.a[i],
		citations: columns.c[i],
		windowCitations: scope === 'lifetime' ? null : columns[keys.cited][i],
		shared,
		sharedWith: shared > 1 ? shared - 1 : 0,
		addedByHand: columns.i[i] === 1,
		journal: journalFromBibcode(bibcode),
		top10: top10 ?? 0,
		top1: (columns[keys.top1][i] ?? 0) > 0
	};
}

/** Row objects for a slice of an index array. */
export function rowsFor(columns, index, start, end, scope = 'full') {
	const out = [];
	const stop = Math.min(end, index.length);
	for (let k = start; k < stop; k += 1) out.push(rowAt(columns, index[k], scope));
	return out;
}

export const CSV_HEADER = [
	'bibcode',
	'year',
	'title',
	'first_author',
	'citations',
	'top10_weight_lifetime',
	'full_window_citations',
	'top10_weight_full',
	'top1_weight_full',
	'shared_by',
	'added_by_hand',
	'ads_url'
];

/** RFC 4180 field: quote when it holds a quote, comma or newline; double the quotes. */
export function csvField(value) {
	if (value == null) return '';
	const s = String(value);
	return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The whole loaded table as CSV, CRLF-delimited.
 *
 * @param {import('../data/types.d.ts').PapersFile['columns']} columns
 * @param {(bibcode: string) => string} adsUrl passed in so this module stays free of $app imports
 * @param {number[] | null} [index] optional subset, in the order given
 */
export function toCsv(columns, adsUrl = (b) => b, index = null) {
	const n = columns.b.length;
	const lines = new Array((index ? index.length : n) + 1);
	lines[0] = CSV_HEADER.join(',');
	for (let k = 0; k < lines.length - 1; k += 1) {
		const i = index ? index[k] : k;
		lines[k + 1] = [
			csvField(columns.b[i]),
			csvField(columns.y[i]),
			csvField(columns.t[i]),
			csvField(columns.a[i]),
			csvField(columns.c[i]),
			csvField(columns.e[i]),
			csvField(columns.f[i]),
			csvField(columns.fe[i]),
			csvField(columns.f1[i]),
			csvField(columns.s[i]),
			csvField(columns.i[i]),
			csvField(adsUrl(columns.b[i]))
		].join(',');
	}
	return lines.join('\r\n');
}

/** The reader's scopes as the CSV names them, after the reader-facing names. */
const MISSION_SCOPES = [['full', 'active'], ['lifetime', 'lifetime']];
/** A mission's figures in one scope count only when the scope is measured: the packager's own rule for its averages and totals. */
export const measured = (s) => s != null && (s.status ?? 'available') === 'available';

/**
 * A division's missions as CSV, CRLF-delimited: both scopes and both tiers, so a page that shows
 * one scope at a time hides nothing. Unmeasured output stays blank, never zero.
 *
 * @param {object[]} missions the division doc's missions
 * @param {{ costBaseYear: number, url?: (id: string) => string }} opts
 */
export function missionsCsv(missions, { costBaseYear, url = (id) => id }) {
	const header = ['mission', 'id', 'launch_year', 'type', `cost_millions_${costBaseYear}_usd`, 'size', 'outcome'];
	for (const [, name] of MISSION_SCOPES) header.push(`${name}_papers`, `${name}_citations`, `${name}_top10`, `${name}_top1`);
	header.push('h_index', 'g_index', 'url');
	const lines = [header.join(',')];
	for (const m of missions) {
		const row = [m.name, m.id, m.launchYear, m.type, m.cost, { under: 'small', over: 'larger' }[m.size] ?? '', m.failed ? 'lost' : m.shortfall ? 'partial' : ''];
		for (const [key] of MISSION_SCOPES) {
			const s = m[key];
			row.push(...(measured(s) ? [s.papers, s.citations, s.top10, s.top1] : [null, null, null, null]));
		}
		row.push(m.indices?.h, m.indices?.g, url(m.id));
		lines.push(row.map(csvField).join(','));
	}
	return lines.join('\r\n');
}
