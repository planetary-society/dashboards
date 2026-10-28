import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsLede, statRows, carrier, loneFlip } from './discussion.js';

const side = (missions, extra = {}) => ({ missions, failed: 0, withTop: 0, top10: 0, top10PerMission: 0, median: 0, largest: null, ...extra });
const rates = (under, over) => [{ key: 'under', missions: 16, cost: 571.8, citations: 13117, perHundredM: under }, { key: 'over', missions: 17, cost: 10863.4, citations: 178738, perHundredM: over }];
/** A Heliophysics-shaped division: TRACE carries the small side, and per dollar the lead rests on it alone. */
const helio = {
	referenceCost: 150,
	divisions: { missions: 16, missionsAll: 33, missionShare: 0.48485, costShare: 0.05, citationShare: 0.0684, share: 0.10278 },
	failure: { under: { missions: 16, failed: 6, lost: 6 }, over: { missions: 17, failed: 0, lost: 0 } },
	comparison: {
		under: side(16, { withTop: 5, top10: 148.18, top10PerMission: 9.26, largest: { id: 'trace', name: 'TRACE', top10: 96.2, share: 0.6493 } }),
		over: side(17, { withTop: 17, top10: 1293.5, top10PerMission: 76.1, median: 61.681, largest: { id: 'sdo', name: 'SDO', top10: 284.4, share: 0.22 } })
	},
	perDollar: {
		groups: rates(2292.9, 1643.1), favors: null, flipsOn: [{ id: 'trace', name: 'TRACE', side: 'under' }], largestUnder: { id: 'trace', name: 'TRACE', share: 0.63176 },
		fit: { missions: 27, zeros: 6, slope: 0.04, intercept: 3.027, tenfold: 1.1, holds: false }
	}
};
const rankable = { name: 'Heliophysics', rankable: true };
const withFit = (fit) => ({ ...helio, perDollar: { ...helio.perDollar, fit } });

test('the lede gives the whole division, then its per-dollar trend', () => {
	assert.equal(statsLede(helio, rankable),
		'Heliophysics’ 33 missions in this study cost $11 billion in all and produced 1,442 top-10% papers, the ones other scientists cited most; 22 of them had at least one. ' +
		'Per dollar, the best fit across its 27 missions with citations is nearly flat, though leaving out a single mission tips it the other way.');
	assert.doesNotMatch(statsLede(helio, rankable), /[Ss]mall|[Ll]arger/, 'no small-vs-larger framing');
});

test('a trend rises or falls only from the packaged slope, and the tenfold is given only when it rises', () => {
	const rises = statsLede(withFit({ missions: 24, slope: 0.2, tenfold: 1.6, holds: true }), rankable);
	assert.match(rises, /rises with cost: A mission that cost 10 times as much drew about 1\.6 times as many citations per dollar\.$/);
	assert.match(statsLede(withFit({ missions: 24, slope: 0.3, tenfold: 2.01, holds: null }), rankable), /about twice as many citations per dollar\.$/, 'untested holds carries no caveat');
	assert.match(statsLede(withFit({ missions: 24, slope: -0.3, tenfold: 0.5, holds: true }), rankable), /falls with cost\.$/);
	assert.match(statsLede(withFit({ missions: 24, slope: 0.3, tenfold: 2, holds: false }), rankable), /twice as many citations per dollar, though leaving out a single mission tips it the other way\.$/);
	assert.match(statsLede(withFit(null), rankable), /had at least one\.$/, 'no fit, no trend sentence');
});

test('carrier names a small side’s dominant mission only when it has enough top papers', () => {
	assert.equal(carrier(helio.comparison.under).name, 'TRACE');
	assert.equal(carrier(side(13, { withTop: 3, top10: 1.8, largest: { id: 'x', name: 'X', top10: 1, share: 0.55 } })), null);
});

test('loneFlip names the mission a small side’s per-dollar lead rests on, and nothing when several do', () => {
	assert.equal(loneFlip(helio.perDollar).name, 'TRACE');
	assert.equal(loneFlip({ ...helio.perDollar, flipsOn: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }), null);
});


test('a division with no larger missions sits out the comparison: no table', () => {
	const f = { referenceCost: 150, divisions: { missions: 5, missionsAll: 5, missionShare: 1, costShare: 1, share: null },
		failure: { under: { missions: 5, failed: 1, lost: 0 }, over: { missions: 0, failed: 0, lost: 0 } } };
	assert.equal(statsLede(f, { name: 'Biological & Physical Sciences', rankable: false }),
		'All five Biological & Physical Sciences missions in this study cost $150 million or less, so there are no larger missions to compare them with. Of the five, one fell short of its goals.');
	assert.deepEqual(statRows(f), []);
});

test('the table sums both sides into one division-wide column, the rate over the pooled cost', () => {
	assert.deepEqual(statRows(helio).map((r) => [r.label, r.value]), [
		['Missions', '33'],
		['Spending', '$11B'],
		['Top-10% papers', '1,442'],
		['Missions with a top-10% paper', '22 of 33'],
		['Citations per $100M', '1,678'],
		['Failed or fell short', '6 of 33']
	]);
});
