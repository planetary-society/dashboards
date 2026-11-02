import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { CSV_HEADER, buildSearchIndex, clpsCsv, csvField, filterIndex, joinCsv, journalFromBibcode, missionsCsv, publicationsCsv, rowAt, rowsFor, sortIndex, toCsv, topColumn } from './papers.js';

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
		d: ['2004-07-00', '1998-00-00', '2017-05-00', null, '1995-11-00'],
		t: ['Cassini at Saturn', 'Maps of dust', 'A "quoted, comma" title', null, 'Icy moons'],
		a: ['Porco, C.', 'Schlegel, D.', null, 'Adams, J.', 'Brown, R.'],
		c: [900, 900, 300, 50, 10],
		s: [1, 3, 1, 1, 2],
		e: [1, 0.5, 0, null, 0],
		f: [400, 150, null, 30, 8],
		fe: [0, 1, null, 0.5, 0],
		f1: [0, 1, null, 0, 0],
		i: [0, 0, 0, 1, 0]
	};
}

const SCOPES = ['full', 'lifetime'];

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
		// the files carry no prime-window columns, so that scope reads the full-mission window
		assert.equal(topColumn(c, 'window', 10), c.fe);
		assert.equal(topColumn(c, 'window', 1), c.f1);
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
		assert.deepEqual(filterIndex(c, { topOnly: true, scope: 'window', top: 10 }), [1, 3]);
		assert.deepEqual(filterIndex(c, { topOnly: true, scope: 'window', top: 1 }), [1]);
	});

	it('defaults to the full-mission window', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { topOnly: true }), filterIndex(c, { topOnly: true, scope: 'full', top: 10 }));
	});

	it('combines search and top-only', () => {
		const c = fixture();
		assert.deepEqual(filterIndex(c, { search: 'dust', topOnly: true, scope: 'lifetime', top: 10 }), [1]);
		assert.deepEqual(filterIndex(c, { search: 'dust', topOnly: true, scope: 'full', top: 10 }), [1]);
		assert.deepEqual(filterIndex(c, { search: 'dust', topOnly: true, scope: 'window', top: 10 }), [1]);
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

	it('reads the full-mission columns for the prime window, which the files no longer carry', () => {
		for (const i of [0, 1, 2]) assert.deepEqual(rowAt(fixture(), i, 'window'), rowAt(fixture(), i, 'full'));
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
			'bibcode,year,pubdate,title,first_author,citations,top10_weight_lifetime,full_window_citations,top10_weight_full,top1_weight_full,shared_by,scix_url'
		);
	});

	it('writes one line per row with nulls as empty fields', () => {
		const lines = toCsv(fixture(), ads).split('\r\n');
		assert.equal(lines.length, 6);
		assert.equal(
			lines[1],
			'2004Sci...305..842P,2004,2004-07-00,Cassini at Saturn,"Porco, C.",900,1,400,0,0,1,https://scixplorer.org/abs/2004Sci...305..842P/abstract'
		);
		// row 2: outside the full-mission cohort
		assert.match(lines[3], /,300,0,,,,1,https:/);
		// row 3: no year, no pubdate, no title, no lifetime weight
		assert.equal(lines[4], '2001AJ....121.2431A,,,,"Adams, J.",50,,30,0.5,0,1,https://scixplorer.org/abs/2001AJ....121.2431A/abstract');	});

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
		const c = { b: [], y: [], t: [], a: [], c: [], s: [], e: [], f: [], fe: [], f1: [], i: [] };
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
		for (const key of ['b', 'y', 'd', 't', 'a', 'c', 's', 'e', 'f', 'fe', 'f1', 'i']) {
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

describe('missionsCsv', () => {
	it('writes both reader scopes, sizes each mission, and leaves unmeasured output blank', () => {
		const scope = (papers, top1 = 0.5) => ({ papers, citations: papers * 10, top10: 1.5, top1, status: 'available' });
		const missions = [
			{ id: 'a', shortTitle: 'ALPHA', name: 'Alpha, Jr.', launchYear: 2001, type: 'Orbiter', lcc: 90, cost: 150, status: 'Partial Success', indices: { h: 3, g: 4 },
				selection: 'competed', dates: { formulation: '1996-10-01', launch: '2001-04-07', scienceStart: '2002-02-01' },
				full: { ...scope(4), status: 'unavailable', bounds: { start: '2002-03-01', end: '2008-03-01' } }, lifetime: scope(9, null) },
			{ id: 'b', shortTitle: 'BETA', name: 'Beta', launchYear: 2010, type: 'Lander', lcc: 120.5, cost: 151, status: 'Failure', indices: {},
				full: scope(0), lifetime: scope(0, null) }
		];
		const [header, a, b] = missionsCsv(missions, { url: (id) => `/m/${id}/` }).split('\r\n');
		assert.equal(header, 'mission,name,launch_year,type,lcc,adjusted_lcc,status,selection,formulation_start,launch_date,science_start,active_window_start,active_window_end,active_papers,active_citations,active_top10,active_top1,lifetime_papers,lifetime_citations,lifetime_top10,lifetime_top1,h_index,g_index,url');
		// the dates and window print even where the scope's output is unmeasured; absent ones stay blank
		assert.equal(a, 'ALPHA,"Alpha, Jr.",2001,Orbiter,90,150,Partial Success,competed,1996-10-01,2001-04-07,2002-02-01,2002-03-01,2008-03-01,,,,,9,90,1.5,,3,4,/m/a/');
		assert.equal(b, 'BETA,Beta,2010,Lander,120.5,151,Failure,,,,,,,0,0,1.5,0.5,0,0,1.5,,,,/m/b/');
		const uncosted = missionsCsv([{ ...missions[1], lcc: null, cost: null }]).split('\r\n')[1];
		assert.match(uncosted, /^BETA,Beta,2010,Lander,,,Failure,/, 'no costs');
	});
});

describe('clpsCsv', () => {
	it('writes the landers, a row per lander and paper and one for a lander with none', () => {
		const mission = (id, name, cost, status, papers) => ({ id, shortTitle: name.toUpperCase(), name, fullName: name, lcc: cost && Math.floor(cost), cost, status, papers });
		const landers = [
				{ ...mission('peregrine', 'Peregrine', 130.3, 'Failure', { b: ['2024A', '2025B'], d: ['2024-09-00', '2025-01-00'], t: ['One, two', null] }), launchDate: '2024-01-08' },
				{ ...mission('m1', 'Blue Ghost M1', 174.3, 'Completed', { b: [], d: [], t: [] }), launchDate: '2025-01-15' },
				{ ...mission('x', 'X', null, 'Partial Success', null), launchDate: null }
		];
		assert.deepEqual(clpsCsv(landers, ads).split('\r\n'), [
			'mission,name,launch_date,lcc,adjusted_lcc,status,papers,bibcode,pubdate,title,scix_url',
			`PEREGRINE,Peregrine,2024-01-08,130,130.3,Failure,2,2024A,2024-09-00,"One, two",${ads('2024A')}`,
			`PEREGRINE,Peregrine,2024-01-08,130,130.3,Failure,2,2025B,2025-01-00,,${ads('2025B')}`,
			'BLUE GHOST M1,Blue Ghost M1,2025-01-15,174,174.3,Completed,0,,,,',
			// unavailable output: papers blank, not 0
			'X,X,,,,Partial Success,,,,,'
		]);
	});
});

describe('publicationsCsv', () => {
	it('names each mission by its upstream short title, skipping missions without a paper file', () => {
		const m = (id, shortTitle, papers) => ({ id, shortTitle, name: id, lifetime: { papers } });
		const divisions = [{ slug: 'astrophysics', missions: [m('hst', 'HST', 2), m('none', 'NONE', 0)] }, { slug: 'planetary', missions: [m('msl', 'MSL', 1)] }];
		const out = publicationsCsv(divisions, (id) => `x\r\n${id}-row`).split('\r\n');
		assert.deepEqual(out, ['division,mission,x', 'astrophysics,HST,hst-row', 'planetary,MSL,msl-row']);
	});
});

describe('joinCsv', () => {
	const csv = (...rows) => ['x,y', ...rows].join('\r\n');

	it('leads the shared header with its own fields, once', () => {
		const lines = joinCsv(['division', 'mission_id'], [{ lead: ['a', 'm1'], csv: csv('1,2') }, { lead: ['b', 'm2'], csv: csv('3,4') }]).split('\r\n');
		assert.equal(lines[0], 'division,mission_id,x,y');
		assert.equal(lines.filter((l) => l.endsWith('x,y')).length, 1);
	});

	it('leads every row with its part’s fields, quoted when they need it', () => {
		const out = joinCsv(['division'], [{ lead: ['Earth, Science'], csv: csv('1,2', '"a, b",3') }]);
		assert.equal(out, 'division,x,y\r\n"Earth, Science",1,2\r\n"Earth, Science","a, b",3');
	});

	it('keeps rows in part order, and a header-only part adds none', () => {
		const out = joinCsv(['d'], [{ lead: ['empty'], csv: csv() }, { lead: ['a'], csv: csv('1,2', '3,4') }, { lead: ['none'], csv: csv() }, { lead: ['b'], csv: csv('5,6') }]);
		assert.equal(out, 'd,x,y\r\na,1,2\r\na,3,4\r\nb,5,6');
		assert.equal(joinCsv(['d'], [{ lead: ['a'], csv: csv() }]), 'd,x,y');
	});

	it('joins real paper CSVs line for line', () => {
		const one = toCsv(fixture(), ads);
		const lines = joinCsv(['division', 'mission_id'], [{ lead: ['planetary', 'cassini'], csv: one }, { lead: ['astrophysics', 'hst'], csv: one }]).split('\r\n');
		assert.equal(lines[0], `division,mission_id,${CSV_HEADER.join(',')}`);
		assert.equal(lines.length, 1 + 2 * 5);
		assert.equal(lines[1], `planetary,cassini,${one.split('\r\n')[1]}`);
		assert.equal(lines[6], `astrophysics,hst,${one.split('\r\n')[1]}`);
	});
});
