import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
	accumulateCitationYears,
	buildLifetimeSeries,
	buildStrip,
	citationsByYearOffset,
	foldYears,
	monthOffset,
	papersByMonth,
	papersByYearMap
} from '../lib/series.mjs';

describe('papersByYearMap', () => {
	it('reads the mission shape (array of {year,total})', () => {
		const map = papersByYearMap([
			{ year: 2000, total: 2, refereed: 2 },
			{ year: 2001, total: 11, refereed: 11 }
		]);
		assert.deepEqual([...map], [
			[2000, 2],
			[2001, 11]
		]);
	});

	it('reads the division shape (object keyed by year string)', () => {
		const map = papersByYearMap({ 1990: 3, 1991: 27 });
		assert.deepEqual([...map], [
			[1990, 3],
			[1991, 27]
		]);
	});

	it('is empty for missing input', () => {
		assert.equal(papersByYearMap(null).size, 0);
	});
});

describe('foldYears', () => {
	it('folds everything past the as-of year into it', () => {
		const folded = foldYears(
			new Map([
				[2025, 5],
				[2026, 3],
				[2027, 2]
			]),
			2026
		);
		assert.deepEqual([...folded], [
			[2025, 5],
			[2026, 5]
		]);
	});
});

describe('accumulateCitationYears', () => {
	const citations = {
		'2000Paper': ['1999Cites', '2001Cites', '2030Cites'],
		'2005Paper': ['2006Cites'],
		'9999Other': ['2006Cites']
	};
	const paperYears = new Map([
		['2000Paper', 2000],
		['2005Paper', 2005]
	]);

	/** One unguarded sink, the common case. */
	const single = (args) => {
		const into = new Map();
		const [edges] = accumulateCitationYears({ ...args, sinks: [{ into }] });
		return { into, edges };
	};

	it('clamps a citing year below the cited paper year up to the paper year', () => {
		const { into } = single({ citations, paperYears, asOfYear: 2026 });
		// 1999Cites is clamped to 2000, joining nothing else in that bucket.
		assert.equal(into.get(2000), 1);
		assert.equal(into.get(2001), 1);
	});

	it('folds citing years beyond the as-of year into it', () => {
		const { into } = single({ citations, paperYears, asOfYear: 2026 });
		assert.equal(into.get(2026), 1); // 2030Cites
	});

	it('ignores cited bibcodes outside the mission paper list', () => {
		const { edges } = single({ citations, paperYears, asOfYear: 2026 });
		assert.equal(edges, 4); // 3 for 2000Paper + 1 for 2005Paper; 9999Other is skipped
	});

	it('counts a shared paper once when a division-wide seen set is passed', () => {
		const seen = new Set();
		const into = new Map();
		const sinks = [{ into, seen }];
		let edges = accumulateCitationYears({ citations, paperYears, asOfYear: 2026, sinks })[0];
		edges += accumulateCitationYears({ citations, paperYears, asOfYear: 2026, sinks })[0];
		assert.equal(edges, 4);
		assert.equal([...into.values()].reduce((a, b) => a + b, 0), 4);
	});

	it('fills every sink in one pass, each with its own seen set', () => {
		const mission = new Map();
		const division = new Map();
		const seen = new Set(['2000Paper']); // already claimed by an earlier mission
		const edges = accumulateCitationYears({
			citations,
			paperYears,
			asOfYear: 2026,
			sinks: [{ into: mission }, { into: division, seen }]
		});
		assert.deepEqual(edges, [4, 1]);
		assert.equal([...mission.values()].reduce((a, b) => a + b, 0), 4);
		// Only 2005Paper's single edge reaches the division sink.
		assert.deepEqual([...division], [[2006, 1]]);
		assert.deepEqual([...seen].sort(), ['2000Paper', '2005Paper']);
	});

	it('counts a rebuilt list in place of the mission’s own stale copy', () => {
		const overrides = new Map([['2005Paper', ['2006Cites', '2007Cites']]]);
		const into = new Map();
		const [edges] = accumulateCitationYears({
			citations,
			paperYears,
			asOfYear: 2026,
			overrides,
			sinks: [{ into }]
		});
		assert.equal(edges, 5); // 3 for 2000Paper, 2 for the rebuilt 2005Paper
		assert.equal(into.get(2007), 1);
	});

	it('returns a zero per sink when there is nothing to read', () => {
		assert.deepEqual(
			accumulateCitationYears({
				citations: null,
				paperYears,
				asOfYear: 2026,
				sinks: [{ into: new Map() }, { into: new Map() }]
			}),
			[0, 0]
		);
	});
});

describe('buildLifetimeSeries', () => {
	it('spans the first year with data through the as-of year', () => {
		const series = buildLifetimeSeries({
			papers: new Map([
				[2000, 2],
				[2002, 1]
			]),
			citations: new Map([[2001, 7]]),
			asOfYear: 2003
		});
		assert.deepEqual(series.years, [2000, 2001, 2002, 2003]);
		assert.deepEqual(series.papers, [2, 0, 1, 0]);
		assert.deepEqual(series.citations, [0, 7, 0, 0]);
		assert.equal(series.partialFromYear, 2003);
	});

	it('returns null when there is nothing to plot', () => {
		assert.equal(buildLifetimeSeries({ papers: new Map(), citations: new Map(), asOfYear: 2026 }), null);
	});

	it('folds a publication year past the as-of year into the last bin', () => {
		const series = buildLifetimeSeries({
			papers: new Map([
				[2025, 1],
				[2027, 4]
			]),
			citations: new Map(),
			asOfYear: 2026
		});
		assert.deepEqual(series.years, [2025, 2026]);
		assert.deepEqual(series.papers, [1, 4]);
	});
});

describe('window series', () => {
	it('measures month offsets by calendar month, not by day', () => {
		assert.equal(monthOffset('2004-04-30', '2004-04-14'), 0);
		assert.equal(monthOffset('2004-07-01T00:00:00Z', '2004-04-14'), 3);
		assert.equal(monthOffset('2005-04-00', '2004-04-14'), 12);
		assert.equal(monthOffset(null, '2004-04-14'), null);
	});

	it('clamps papers to the first and last month bucket', () => {
		const months = papersByMonth(
			[{ date: '2004-03-01' }, { date: '2004-04-20' }, { date: '2007-05-01' }, { pubdate: '2004-05-00' }],
			'2004-04-14',
			36
		);
		assert.equal(months.length, 36);
		assert.equal(months[0], 2); // the pre-start record clamps into month 0
		assert.equal(months[1], 1);
		assert.equal(months[35], 1); // the post-end record clamps into the last month
		assert.equal(months.reduce((a, b) => a + b, 0), 4);
	});

	it('bins window citations by citing year minus the start year', () => {
		const offsets = citationsByYearOffset(
			{ a: ['2004X', '2005X', '2011X'], b: ['2003X'] },
			2004,
			7
		);
		assert.deepEqual(offsets, [2, 1, 0, 0, 0, 0, 1]);
	});
});

describe('buildStrip', () => {
	it('starts at the science-start year and caps its length', () => {
		const strip = buildStrip({
			papersByYear: new Map([
				[1997, 9],
				[1998, 2],
				[2000, 5]
			]),
			startYear: 1998,
			asOfYear: 2026,
			cap: 4
		});
		// The 1997 papers predate science start and are not in the strip.
		assert.deepEqual(strip, [2, 0, 5, 0]);
	});

	it('is empty without a start year', () => {
		assert.deepEqual(buildStrip({ papersByYear: new Map(), startYear: null, asOfYear: 2026, cap: 20 }), []);
	});
});
