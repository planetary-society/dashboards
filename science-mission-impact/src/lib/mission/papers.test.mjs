import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { CSV_HEADER, buildSearchIndex, csvField, filterIndex, journalFromBibcode, rowAt, rowsFor, sortIndex, toCsv, topColumn } from './papers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const HST_PAPERS = path.join(here, '..', '..', '..', 'static', 'data', 'papers', 'hst.json');

const ads = (b) => `https://scixplorer.org/abs/${encodeURIComponent(b)}/abstract`;

/**
 * Five rows, hand-built so every null case is represented. The three scopes disagree on
 * purpose, so a test reading the wrong scope's column fails.
 */
function fixture() {
	return {
		b: ['2004Sci...305..842P', '1998ApJ...500..525S', '2017Natur.545..456D', '2001AJ....121.2431A', '1995Icar..118....1B'],
		y: [2004, 1998, 2017, null, 1995],
		t: ['Cassini at Saturn', 'Maps of dust', 'A "quoted, comma" title', null, 'Icy moons'],
		a: ['Porco, C.', 'Schlegel, D.', null, 'Adams, J.', 'Brown, R.'],
		c: [900, 900, 300, 50, 10],
		s: [1, 3, 1, 1, 2],
		e: [1, 0.5, 0, null, 0],
		f: [400, 150, null, 30, 8],
		fe: [0, 1, null, 0.5, 0],
		f1: [0, 1, null, 0, 0],
		w: [120, null, 80, 5, null],
		we: [1, null, 0.25, 0, null],
		w1: [1, null, 0, 0, null],
		i: [0, 0, 0, 1, 0]
	};
}

const SCOPES = ['full', 'window', 'lifetime'];

describe('journalFromBibcode', () => {
	it('takes characters 4-8 and strips the padding dots', () => {
		assert.equal(journalFromBibcode('2004Sci...305..842P'), 'Sci');
		assert.equal(journalFromBibcode('2017Natur.545..456D'), 'Natur');
		assert.equal(journalFromBibcode('1998ApJ...500..525S'), 'ApJ');
		assert.equal(journalFromBibcode('2001AJ....121.2431A'), 'AJ');
		assert.equal(journalFromBibcode('1995Icar..118....1B'), 'Icar');
	});

	it('is empty for anything that is not a bibcode', () => {
		assert.equal(journalFromBibcode(null), '');
		assert.equal(journalFromBibcode(''), '');
		assert.equal(journalFromBibcode('2004'), '');
		assert.equal(journalFromBibcode(12345), '');
	});
});

describe('topColumn', () => {
	it('picks the weight column that matches the view', () => {
		const c = fixture();
		assert.equal(topColumn(c, 'full', 10), c.fe);
		assert.equal(topColumn(c, 'full', 1), c.f1);
		assert.equal(topColumn(c, 'window', 10), c.we);
		assert.equal(topColumn(c, 'window', 1), c.w1);
		assert.equal(topColumn(c, 'lifetime', 10), c.e);
	});

	it('has no lifetime top 1%, so falls back to the full-mission window', () => {
		const c = fixture();
		assert.equal(topColumn(c, 'lifetime', 1), c.f1);
	});
});

describe('filterIndex', () => {
	it('filtering a sorted order equals sorting the filtered rows', () => {
		const c = fixture();
		for (const sort of ['cited', 'oldest', 'newest']) {
			for (const scope of SCOPES) {
				const order = sortIndex(c.b.map((_, i) => i), c, { sort, scope });
				const opts = { topOnly: true, scope, top: 10 };
				assert.deepEqual(filterIndex(c, { ...opts, order }), sortIndex(filterIndex(c, opts), c, { sort, scope }));
			}
		}
	});
	it('returns every row when nothing is asked of it', () => {
		assert.deepEqual(filterIndex(fixture()), [0, 1, 2, 3, 4]);
	});

	it('matches titles and first authors, case-insensitively', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { search: 'cassini' }), [0]);
		assert.deepEqual(filterIndex(c, { search: 'SCHLEGEL' }), [1]);
		assert.deepEqual(filterIndex(c, { search: 'o' }).length, 4);
	});

	it('survives null titles and null authors', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { search: 'adams' }), [3]);
		assert.deepEqual(filterIndex(c, { search: 'quoted' }), [2]);
	});

	it('trims the search and treats blank as no search', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { search: '   ' }), [0, 1, 2, 3, 4]);
		assert.deepEqual(filterIndex(c, { search: '  cassini ' }), [0]);
	});

	it('top-only follows scope and threshold, counting only weights above zero', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { topOnly: true, scope: 'lifetime', top: 10 }), [0, 1]);
		assert.deepEqual(filterIndex(c, { topOnly: true, scope: 'full', top: 10 }), [1, 3]);
		assert.deepEqual(filterIndex(c, { topOnly: true, scope: 'full', top: 1 }), [1]);
		assert.deepEqual(filterIndex(c, { topOnly: true, scope: 'window', top: 10 }), [0, 2]);
		assert.deepEqual(filterIndex(c, { topOnly: true, scope: 'window', top: 1 }), [0]);
	});

	it('defaults to the full-mission window', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { topOnly: true }), filterIndex(c, { topOnly: true, scope: 'full', top: 10 }));
	});

	it('combines search and top-only', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { search: 'dust', topOnly: true, scope: 'lifetime', top: 10 }), [1]);
		assert.deepEqual(filterIndex(c, { search: 'dust', topOnly: true, scope: 'full', top: 10 }), [1]);
		assert.deepEqual(filterIndex(c, { search: 'dust', topOnly: true, scope: 'window', top: 10 }), []);
	});

	it('accepts a prebuilt haystack', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { search: 'cassini', haystack: buildSearchIndex(c) }), [0]);
	});
});

describe('sortIndex', () => {
	const all = [0, 1, 2, 3, 4];

	it('most cited is lifetime citations, the count each row shows, ties broken by bibcode', () => {
		// rows 0 and 1 both have 900 citations; "1998..." sorts before "2004...".
		assert.deepEqual(sortIndex(all, fixture(), { sort: 'cited' }), [1, 0, 2, 3, 4]);
		// the scope does not reorder it, so loading the full list never reshuffles the prerendered one
		for (const scope of SCOPES) assert.deepEqual(sortIndex(all, fixture(), { sort: 'cited', scope }), [1, 0, 2, 3, 4], scope);
	});

	it('newest first, nulls last', () => {
		assert.deepEqual(sortIndex(all, fixture(), { sort: 'newest' }), [2, 0, 1, 4, 3]);
	});

	it('oldest first, nulls still last', () => {
		assert.deepEqual(sortIndex(all, fixture(), { sort: 'oldest' }), [4, 1, 0, 2, 3]);
	});

	it('does not mutate the index it is given', () => {
		const index = [4, 3, 2, 1, 0];
		sortIndex(index, fixture(), { sort: 'newest' });
		assert.deepEqual(index, [4, 3, 2, 1, 0]);
	});

	it('is stable across repeated runs', () => {
		const c = fixture();
		for (const scope of SCOPES) {
			const a = sortIndex(all, c, { sort: 'cited', scope });
			const b = sortIndex(all.slice().reverse(), c, { sort: 'cited', scope });
			assert.deepEqual(a, b, scope);
		}
	});
});

describe('rowAt', () => {
	it('builds the shape the row markup reads', () => {
		const r = rowAt(fixture(), 1, 'lifetime');
		assert.deepEqual(r, {
			i: 1,
			bibcode: '1998ApJ...500..525S',
			year: 1998,
			title: 'Maps of dust',
			firstAuthor: 'Schlegel, D.',
			citations: 900,
			windowCitations: null,
			shared: 3,
			sharedWith: 2,
			addedByHand: false,
			journal: 'ApJ',
			top10: 0.5,
			top1: true // lifetime has no top 1%; the marker reads the full-mission window
		});
	});

	it('reads the window weight in the window scope', () => {
		assert.equal(rowAt(fixture(), 1, 'window').top10, 0);
		assert.equal(rowAt(fixture(), 0, 'window').top1, true);
		assert.equal(rowAt(fixture(), 0, 'window').windowCitations, 120);
	});

	it('reads the full-mission columns in the full scope, and by default', () => {
		for (const r of [rowAt(fixture(), 1, 'full'), rowAt(fixture(), 1)]) {
			assert.equal(r.windowCitations, 150);
			assert.equal(r.top10, 1);
			assert.equal(r.top1, true);
		}
		const outside = rowAt(fixture(), 2, 'full');
		assert.equal(outside.windowCitations, null);
		assert.equal(outside.top10, 0);
		assert.equal(outside.top1, false);
	});

	it('has no window citations in the lifetime scope', () => {
		const r = rowAt(fixture(), 0, 'lifetime');
		assert.equal(r.windowCitations, null);
		assert.equal(r.top10, 1);
	});

	it('marks hand-added papers and unshared papers', () => {
		const r = rowAt(fixture(), 3, 'window');
		assert.equal(r.addedByHand, true);
		assert.equal(r.sharedWith, 0);
	});

	it('rowsFor clamps to the end of the index', () => {
		const c = fixture();
		assert.equal(rowsFor(c, [0, 1, 2], 0, 100, 'window').length, 3);
		assert.deepEqual(
			rowsFor(c, [0, 1, 2], 1, 3, 'window').map((r) => r.i),
			[1, 2]
		);
	});
});

describe('csvField', () => {
	it('quotes only what needs quoting', () => {
		assert.equal(csvField('plain'), 'plain');
		assert.equal(csvField('a,b'), '"a,b"');
		assert.equal(csvField('say "hi"'), '"say ""hi"""');
		assert.equal(csvField('two\nlines'), '"two\nlines"');
		assert.equal(csvField('a\r\nb'), '"a\r\nb"');
	});

	it('writes null and undefined as empty', () => {
		assert.equal(csvField(null), '');
		assert.equal(csvField(undefined), '');
		assert.equal(csvField(0), '0');
	});
});

describe('toCsv', () => {
	it('writes the agreed header', () => {
		const lines = toCsv(fixture(), ads).split('\r\n');
		assert.equal(lines[0], CSV_HEADER.join(','));
		assert.equal(
			lines[0],
			'bibcode,year,title,first_author,citations,window_citations,top10_weight_lifetime,top10_weight_window,top1_weight_window,full_window_citations,top10_weight_full,top1_weight_full,shared_by,added_by_hand,ads_url'
		);
	});

	it('writes one line per row with nulls as empty fields', () => {
		const lines = toCsv(fixture(), ads).split('\r\n');
		assert.equal(lines.length, 6);
		assert.equal(
			lines[1],
			'2004Sci...305..842P,2004,Cassini at Saturn,"Porco, C.",900,120,1,1,1,400,0,0,1,0,https://scixplorer.org/abs/2004Sci...305..842P/abstract'
		);
		// row 2: outside the full-mission cohort
		assert.match(lines[3], /,300,80,0,0\.25,0,,,,1,0,https:/);
		// row 3: no year, no title, no lifetime weight
		assert.equal(lines[4], '2001AJ....121.2431A,,,"Adams, J.",50,5,,0,0,30,0.5,0,1,1,https://scixplorer.org/abs/2001AJ....121.2431A/abstract');
	});

	it('quotes a title holding a comma and a quote', () => {
		const lines = toCsv(fixture(), ads).split('\r\n');
		assert.match(lines[3], /"A ""quoted, comma"" title"/);
	});

	it('can write a subset, in the order given', () => {
		const lines = toCsv(fixture(), ads, [2, 0]).split('\r\n');
		assert.equal(lines.length, 3);
		assert.match(lines[1], /^2017Natur/);
		assert.match(lines[2], /^2004Sci/);
	});

	it('every line has the same number of fields as the header', () => {
		const countFields = (line) => {
			let n = 1;
			let quoted = false;
			for (let i = 0; i < line.length; i += 1) {
				const ch = line[i];
				if (ch === '"') quoted = !quoted;
				else if (ch === ',' && !quoted) n += 1;
			}
			return n;
		};
		for (const line of toCsv(fixture(), ads).split('\r\n')) {
			assert.equal(countFields(line), CSV_HEADER.length);
		}
	});
});

describe('performance', () => {
	/** 20k synthetic rows, shaped like the real hst file. */
	function bigColumns(n = 20000) {
		const c = { b: [], y: [], t: [], a: [], c: [], s: [], e: [], f: [], fe: [], f1: [], w: [], we: [], w1: [], i: [] };
		for (let k = 0; k < n; k += 1) {
			const year = 1990 + (k % 35);
			c.b.push(`${year}ApJ...${String(100 + (k % 900))}..${String(100 + (k % 800))}A`);
			c.y.push(k % 97 === 0 ? null : year);
			c.t.push(`Observations of target ${k} with the telescope`);
			c.a.push(`Author${k % 5000}, ${String.fromCharCode(65 + (k % 26))}.`);
			c.c.push((k * 7919) % 5000);
			c.s.push(1 + (k % 3));
			c.e.push(k % 10 === 0 ? 1 : 0);
			c.f.push(k % 5 === 0 ? null : (k * 7907) % 2000);
			c.fe.push(k % 5 === 0 ? null : k % 9 === 0 ? 0.5 : 0);
			c.f1.push(k % 5 === 0 ? null : k % 97 === 0 ? 1 : 0);
			c.w.push(k % 3 === 0 ? null : (k * 104729) % 900);
			c.we.push(k % 3 === 0 ? null : k % 11 === 0 ? 0.5 : 0);
			c.w1.push(k % 3 === 0 ? null : k % 101 === 0 ? 1 : 0);
			c.i.push(k % 997 === 0 ? 1 : 0);
		}
		return c;
	}

	it('filters and sorts 20k rows well under 50 ms', () => {
		const c = bigColumns();
		const haystack = buildSearchIndex(c); // built once per load, not per keystroke
		const start = performance.now();
		const index = filterIndex(c, { search: 'target 1', topOnly: false, scope: 'full', top: 10, haystack });
		const sorted = sortIndex(index, c, { sort: 'cited', scope: 'full' });
		const ms = performance.now() - start;
		assert.ok(sorted.length > 0);
		assert.ok(ms < 50, `filter+sort took ${ms.toFixed(1)} ms`);
	});

	it('sorts the unfiltered 20k rows well under 50 ms', () => {
		const c = bigColumns();
		const all = filterIndex(c);
		const start = performance.now();
		const sorted = sortIndex(all, c, { sort: 'newest', scope: 'window' });
		const ms = performance.now() - start;
		assert.equal(sorted.length, 20000);
		assert.ok(ms < 50, `sort took ${ms.toFixed(1)} ms`);
	});
});

describe('the real hst papers file', { skip: !fs.existsSync(HST_PAPERS) && 'static/data/papers/hst.json not generated yet' }, () => {
	const file = JSON.parse(fs.readFileSync(HST_PAPERS, 'utf8'));

	it('has the columns this module reads, all the declared length', () => {
		for (const key of ['b', 'y', 't', 'a', 'c', 's', 'e', 'f', 'fe', 'f1', 'w', 'we', 'w1', 'i']) {
			assert.equal(file.columns[key]?.length, file.rows, `column ${key}`);
		}
	});

	it('filters and sorts the whole file under 50 ms', () => {
		const haystack = buildSearchIndex(file.columns);
		const start = performance.now();
		const index = filterIndex(file.columns, { search: 'galaxy', scope: 'full', top: 10, haystack });
		sortIndex(index, file.columns, { sort: 'cited', scope: 'full' });
		const ms = performance.now() - start;
		assert.ok(ms < 50, `filter+sort took ${ms.toFixed(1)} ms over ${file.rows} rows`);
	});

	it('derives a journal for nearly every bibcode', () => {
		const missing = file.columns.b.filter((b) => journalFromBibcode(b) === '').length;
		assert.ok(missing / file.rows < 0.01, `${missing} of ${file.rows} bibcodes gave no journal`);
	});

	it('writes a CSV with one line per row', () => {
		const lines = toCsv(file.columns, ads).split('\r\n');
		assert.equal(lines.length, file.rows + 1);
	});
});
