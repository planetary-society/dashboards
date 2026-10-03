import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
	daysToYears,
	groupBy,
	int,
	median,
	num,
	papers,
	parseYearMonth,
	plural,
	ratio,
	round,
	share,
	sum,
	weight,
	yearOf,
	yearsBetween
} from '../lib/util.mjs';

describe('formatters', () => {
	it('int groups thousands, rounds, and takes its own null text', () => {
		assert.equal(int(134281), '134,281');
		assert.equal(int(1.6), '2');
		assert.equal(int(null), '—');
		assert.equal(int(undefined), '—');
		assert.equal(int(Number.NaN), '—');
		assert.equal(int(null, 'n/a'), 'n/a');
	});

	it('papers keeps one decimal below 10 and rounds above it', () => {
		assert.equal(papers(0), '0');
		assert.equal(papers(1.25), '1.3');
		assert.equal(papers(9.94), '9.9');
		assert.equal(papers(12.4), '12');
		assert.equal(papers(1234.5), '1,235');
		assert.equal(papers(null), '—');
		assert.equal(papers(null, 'n/a'), 'n/a');
	});

	it('plural is singular only for an exact 1', () => {
		assert.equal(plural(1, 'paper'), 'paper');
		assert.equal(plural(0, 'paper'), 'papers');
		assert.equal(plural(1.5, 'paper'), 'papers');
		assert.equal(plural(null, 'mission'), 'missions');
	});
});

describe('round', () => {
	it('rounds to the requested precision', () => {
		assert.equal(round(0.123456789, 5), 0.12346);
		assert.equal(round(1.0005, 3), 1.001);
		assert.equal(round(14.666666666, 3), 14.667);
	});

	it('keeps null as null: a missing measure is not zero', () => {
		assert.equal(round(null, 3), null);
		assert.equal(round(undefined, 3), null);
		assert.equal(round(Number.NaN, 3), null);
	});

	it('never emits negative zero, which would break byte-identical output', () => {
		assert.ok(Object.is(round(-0.0001, 2), 0));
		assert.equal(JSON.stringify({ v: round(-0.0001, 2) }), '{"v":0}');
	});

	it('share and weight use the documented precisions', () => {
		assert.equal(share(0.1234567), 0.12346);
		assert.equal(weight(1.23456), 1.235);
	});
});

describe('num / sum / median / ratio', () => {
	it('num keeps null and rejects non-numbers', () => {
		assert.equal(num(null), null);
		assert.equal(num('12'), 12);
		assert.equal(num('nope'), null);
		assert.equal(num(0), 0);
	});

	it('sum treats null as zero without inventing a measured value', () => {
		assert.equal(sum([1, null, 2, undefined]), 3);
		assert.equal(sum([]), 0);
	});

	it('median handles odd, even and empty inputs', () => {
		assert.equal(median([3, 1, 2]), 2);
		assert.equal(median([4, 1, 2, 3]), 2.5);
		assert.equal(median([]), null);
		assert.equal(median([null, undefined]), null);
	});

	it('ratio guards a zero or missing denominator', () => {
		assert.equal(ratio(1, 4), 0.25);
		assert.equal(ratio(1, 0), null);
		assert.equal(ratio(1, null), null);
	});
});

describe('date helpers', () => {
	it('parses the spellings the raw data uses', () => {
		assert.deepEqual(parseYearMonth('2004-07-01T00:00:00Z'), { y: 2004, m: 7 });
		assert.deepEqual(parseYearMonth('2004-07-00'), { y: 2004, m: 7 });
		assert.deepEqual(parseYearMonth('2004-07'), { y: 2004, m: 7 });
		assert.deepEqual(parseYearMonth('2004'), { y: 2004, m: 1 });
		assert.equal(parseYearMonth(null), null);
		assert.equal(parseYearMonth('not a date'), null);
	});

	it('clamps a zero month to January', () => {
		assert.deepEqual(parseYearMonth('1998-00-00'), { y: 1998, m: 1 });
	});

	it('yearOf reads the calendar year', () => {
		assert.equal(yearOf('1998-06-01'), 1998);
		assert.equal(yearOf(null), null);
	});

	it('daysToYears keeps negative values, which are meaningful', () => {
		assert.equal(daysToYears(365.25), 1);
		assert.equal(daysToYears(-772), -2.114);
		assert.equal(daysToYears(null), null);
	});

	it('yearsBetween measures one date to another', () => {
		assert.equal(yearsBetween('1990-10-01', '1997-10-15'), 7.039);
		assert.equal(yearsBetween('2000-01-01', '1999-01-01'), -0.999);
		// A date missing its day still places the month.
		assert.equal(yearsBetween('2000-01', '2001-01'), 1.002);
		assert.equal(yearsBetween(null, '2001-01-01'), null);
		assert.equal(yearsBetween('2001-01-01', undefined), null);
		assert.equal(yearsBetween('not a date', '2001-01-01'), null);
	});
});

describe('groupBy', () => {
	it('preserves input order inside each bucket', () => {
		const grouped = groupBy(
			[
				{ k: 'a', v: 1 },
				{ k: 'b', v: 2 },
				{ k: 'a', v: 3 }
			],
			(x) => x.k
		);
		assert.deepEqual(
			grouped.get('a').map((x) => x.v),
			[1, 3]
		);
		assert.deepEqual([...grouped.keys()], ['a', 'b']);
	});
});
