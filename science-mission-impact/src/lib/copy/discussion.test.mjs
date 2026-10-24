import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statsLede, statRows, shareRows } from './discussion.js';

const side = (missions, extra = {}) => ({ missions, failed: 0, withTop: 0, top10: 0, top10PerMission: 0, median: 0, largest: null, ...extra });
const rates = (under, over) => [{ key: 'under', missions: 16, cost: 571.8, perHundredM: under }, { key: 'over', missions: 17, cost: 10863.4, perHundredM: over }];
/** A Heliophysics-shaped division: TRACE carries the small side, and per dollar the lead rests on it alone. */
const helio = {
	referenceCost: 150,
	divisions: { missions: 16, missionsAll: 33, missionShare: 0.48485, costShare: 0.05, citationShare: 0.0684, share: 0.10278 },
	failure: { under: { missions: 16, failed: 6, lost: 6 }, over: { missions: 17, failed: 0, lost: 0 } },
	comparison: {
		under: side(16, { withTop: 5, top10: 148.18, top10PerMission: 9.26, largest: { id: 'trace', name: 'TRACE', top10: 96.2, share: 0.6493 } }),
		over: side(17, { withTop: 17, top10: 1293.5, top10PerMission: 76.1, median: 61.681, largest: { id: 'sdo', name: 'SDO', top10: 284.4, share: 0.22 } })
	},
	perDollar: { groups: rates(2292.9, 1643.1), favors: null, flipsOn: [{ id: 'trace', name: 'TRACE', side: 'under' }], largestUnder: { id: 'trace', name: 'TRACE', share: 0.63176 } }
};
const rankable = { name: 'Heliophysics', rankable: true };

test('the lede defines small, names the mission that carries the small side, and what per dollar rests on', () => {
	assert.equal(statsLede(helio, rankable),
		'Small missions, those that cost $150 million or less, make up 48% of Heliophysics’ missions in this study and 5.0% of its spending. ' +
		'They produced 10% of its top-10% papers, the ones other scientists cited most. TRACE alone produced 65% of that share. ' +
		'Per dollar, small missions drew more citations, but only because of TRACE; without it, larger missions lead.');
});

test('a robust verdict says "also" only when larger missions led per mission too', () => {
	const f = {
		...helio,
		divisions: { missions: 5, missionsAll: 25, missionShare: 0.2, costShare: 0.009, share: 0 },
		comparison: { under: side(5), over: side(20, { withTop: 19, top10PerMission: 80 }) },
		perDollar: { groups: rates(298, 3648), favors: 'over', flipsOn: [], largestUnder: null }
	};
	const lede = statsLede(f, { name: 'Astrophysics', rankable: true });
	assert.doesNotMatch(lede, /alone/);
	assert.match(lede, /Larger missions also drew more citations per dollar\.$/);
	const level = { ...f, comparison: { under: side(5, { top10PerMission: 90 }), over: side(20, { top10PerMission: 80 }) } };
	assert.match(statsLede(level, { name: 'Astrophysics', rankable: true }), /Larger missions drew more citations per dollar\.$/);
});

test('a few top papers from one small mission are not called carrying the side', () => {
	const f = { ...helio, comparison: { ...helio.comparison, under: side(13, { withTop: 3, top10: 1.8, largest: { id: 'x', name: 'X', top10: 1, share: 0.55 } }) } };
	assert.doesNotMatch(statsLede(f, rankable), /X alone/);
});

test('without a lone mission behind it, a close call says neither side leads', () => {
	const f = { ...helio, perDollar: { ...helio.perDollar, flipsOn: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } };
	assert.match(statsLede(f, rankable), /Per dollar, neither side clearly leads\.$/);
});

test('a division with no larger missions sits out the comparison: no table, no strip', () => {
	const f = { referenceCost: 150, divisions: { missions: 5, missionsAll: 5, missionShare: 1, costShare: 1, share: null },
		failure: { under: { missions: 5, failed: 1, lost: 0 }, over: { missions: 0, failed: 0, lost: 0 } } };
	assert.equal(statsLede(f, { name: 'Biological & Physical Sciences', rankable: false }),
		'All five Biological & Physical Sciences missions in this study cost $150 million or less, so there are no larger missions to compare them with. Of the five, one fell short of its goals.');
	assert.deepEqual(statRows(f), []);
	assert.deepEqual(shareRows(f), []);
});

test('the table pairs each measure either side, with counts out of the group', () => {
	assert.deepEqual(statRows(helio).map((r) => [r.label, r.under, r.over]), [
		['Missions', '16', '17'],
		['Spending', '$572M', '$11B'],
		['Top-10% papers', '148', '1,294'],
		['Missions with a top-10% paper', '5 of 16', '17 of 17'],
		['Citations per $100M', '2,293', '1,643'],
		['Failed or fell short', '6 of 16', '0 of 17']
	]);
	assert.deepEqual(shareRows(helio).map((r) => r.share), [0.48485, 0.05, 0.0684, 0.10278]);
});
