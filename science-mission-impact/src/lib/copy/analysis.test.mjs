import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearlyHigher, clpsCosts, divisionShortfalls, edgeWords, favorsOver, mostUnreached, noFirmLeader, notLinear, rate, scienceOrder, selectionContrast, series, shortestTier, smallLowest, tierWords, topUnder } from './analysis.js';
import { range } from '../format.js';

test('notLinear, topUnder and favorsOver gate the summary’s own sentences', () => {
	const t = (median) => ({ formulation: { median } });
	assert.equal(notLinear({ tiers: [t(5.8), t(5.5), t(5.7), t(11.5)] }), true);
	assert.equal(notLinear({ tiers: [t(4), t(5), t(null), t(9)] }), false);
	const row = (division, missions, ratio) => ({ division, under: { missions, ratio } });
	assert.equal(topUnder({ divisions: [row('helio', 16, 1.39), row('planetary', 7, 0.6), row('earth', 0, null)] }).division, 'helio');
	assert.equal(topUnder({ divisions: [row('a', 2, 1), row('b', 3, 1)] }), null);
	assert.deepEqual(favorsOver([{ favors: 'over' }, { favors: null }, { favors: 'under' }]).length, 1);
});

const tier = (formulation, science, reached = 5, undated = 0) => ({
	missions: reached, reached, without: 0, undated,
	formulation: { median: formulation, min: formulation }, science: { median: science, min: science }
});

test('tier words read the inclusive edges exactly', () => {
	assert.equal(edgeWords(1550), '$1.55B');
	assert.equal(tierWords({ lo: 0, hi: 50 }), '$50M or less');
	assert.equal(tierWords({ lo: 50, hi: 150 }), '$50M to $150M');
	assert.equal(tierWords({ lo: 1550, hi: null }), 'more than $1.55B');
	assert.equal(rate(0.17873), '0.18');
	assert.equal(rate(12.34), '12.3');
});

test('shortestTier ignores thin tiers and names a close runner-up', () => {
	const time = { tiers: [tier(4.0, 2, 2), tier(5.5, 1), tier(5.7, 0.8), tier(7, 0.4)] };
	const s = shortestTier(time);
	assert.equal(s.index, 1); // tier 0 has only two dated missions
	assert.equal(s.close.index, 2);
	assert.equal(shortestTier({ tiers: [tier(5, 1), tier(6, 1)] }).close, null);
	// undated missions don't count toward the minimum
	assert.equal(shortestTier({ tiers: [tier(3, 1, 4, 2), tier(6, 1)] }).index, 1);
	assert.equal(shortestTier({ tiers: [tier(null, null, 0)] }), null);
});

test('scienceOrder claims only the order the medians show', () => {
	assert.equal(scienceOrder({ tiers: [tier(1, 2.3), tier(1, 1.1), tier(1, 0.8), tier(1, 0.2)] }), 'falls');
	assert.equal(scienceOrder({ tiers: [tier(1, 2.2), tier(1, 1.0), tier(1, 1.3), tier(1, 0.4)] }), 'ends');
	assert.equal(scienceOrder({ tiers: [tier(1, 2.2), tier(1, 2.5), tier(1, 0.4)] }), null);
	assert.equal(scienceOrder({ tiers: [tier(1, 2.2), tier(null, null, 0)] }), null);
	// a tier with too few first papers can't carry the order
	assert.equal(scienceOrder({ tiers: [tier(1, 2.3, 2), tier(1, 1.1), tier(1, 0.2)] }), null);
});

test('division gates read the packaged efficiency rows', () => {
	const row = (division, under, holds = false) => ({ division, name: division, under, best: { tier: 2, ratio: 2, holds } });
	const efficiency = { divisions: [
		row('helio', { missions: 16, ratio: 1.39, top10: 20 }),
		row('astro', { missions: 5, ratio: 0.11, top10: 0 }),
		row('earth', { missions: 0, ratio: null, top10: 0 })
	] };
	assert.equal(noFirmLeader(efficiency), true);
	efficiency.divisions[0].best.holds = true;
	assert.equal(noFirmLeader(efficiency), false);
});

test('selectionContrast compares only a group where both methods are common', () => {
	const spread = (missions, median) => ({ missions, median });
	const selection = { groups: [
		{ competed: spread(40, 0.31), directed: spread(5, 0.09) },
		{ competed: spread(35, 1.85), directed: spread(24, 1.3) },
		{ competed: spread(4, 0.79), directed: spread(31, 1.86) }
	] };
	const c = selectionContrast(selection);
	assert.equal(c.index, 1);
	assert.equal(c.higher, 'competed');
	assert.equal(selectionContrast({ groups: [selection.groups[0]] }), null);
});

test('series switches to semicolons when its items hold lists', () => {
	assert.equal(series(['HaloSat in Astrophysics', 'ELFIN, TRACE and FAST in Heliophysics', 'Lunar Prospector in Planetary Science']),
		'HaloSat in Astrophysics; ELFIN, TRACE and FAST in Heliophysics; and Lunar Prospector in Planetary Science');
	assert.equal(series(['a', 'b', 'c']), 'a, b, and c'); // listify keeps TPS's serial comma
	assert.equal(series(['a']), 'a');
});

test('smallLowest needs the small group below every other', () => {
	assert.equal(smallLowest([{ median: 0.18 }, { median: 1.59 }, { median: 1.81 }]), true);
	assert.equal(smallLowest([{ median: 0.18 }, { median: 0.1 }]), false);
	assert.equal(smallLowest([{ median: null }, { median: 1 }]), false);
});

test('divisionShortfalls splits one division at a tier edge, and clearlyHigher needs the intervals apart', () => {
	const tiers = [{ lo: 0, hi: 50 }, { lo: 50, hi: 350 }, { lo: 350, hi: null }];
	const row = (division, ok, failed, partial) => ({ division, ok, failed, partial });
	const failureTiers = [
		{ byDivision: [row('planetary', 1, 3, 0), row('earth', 5, 0, 0)] },
		{ byDivision: [row('planetary', 2, 3, 1)] },
		{ byDivision: [row('planetary', 25, 1, 0)] }
	];
	const f = divisionShortfalls(tiers, failureTiers, 'planetary', 350);
	assert.deepEqual(f, { all: { missions: 36, short: 8 }, below: { missions: 10, short: 7 }, above: { missions: 26, short: 1 } });
	assert.deepEqual(divisionShortfalls(tiers, failureTiers, 'planetary', 300), { all: f.all, below: null, above: null }, 'not a tier edge: totals, no split');
	assert.ok(!clearlyHigher(null, f.above), 'no split claims nothing');
	assert.ok(clearlyHigher(f.below, f.above));
	assert.ok(!clearlyHigher({ missions: 3, short: 1 }, { missions: 4, short: 0 }), 'too few to tell');
	assert.ok(!clearlyHigher({ missions: 0, short: 0 }, f.above), 'an empty side claims nothing');
});

test('ranges print with their own formatter', () => {
	assert.equal(range([0.42, 10.7], rate), '0.42–10.7');
	assert.equal(range(null, rate), '—');
	assert.equal(range([1.25, 3], (v) => v.toFixed(1), ' to '), '1.3 to 3.0');
});

test('clpsCosts names a comparator only when it cost about as much as one lander or all of them', () => {
	const comparators = [{ id: 'lcross', name: 'LCROSS', cost: 139, papers: 24 }, { id: 'mars_pathfinder', name: 'Mars Pathfinder', cost: 613, papers: 67 }];
	const clps = { comparison: { cost: 621.1, costEach: 155.275, comparators } };
	const c = clpsCosts(clps);
	assert.equal(c.likeOne.id, 'lcross');
	assert.equal(c.likeAll.id, 'mars_pathfinder');
	assert.deepEqual([c.all, c.each, c.either], [621.1, 155.275, 'either']);
	const dearer = { comparison: { ...clps.comparison, comparators: [{ ...comparators[0], cost: 300 }, { ...comparators[1], cost: 2000 }] } };
	assert.deepEqual([clpsCosts(dearer).likeOne, clpsCosts(dearer).likeAll], [null, null]);
	const uncosted = { comparison: { ...clps.comparison, cost: null, costEach: null } };
	assert.deepEqual([clpsCosts(uncosted).likeOne, clpsCosts(uncosted).likeAll, clpsCosts(uncosted).each], [null, null, null]);
	assert.equal(clpsCosts({ comparison: { ...clps.comparison, comparators: comparators.slice(0, 1) } }).either, 'each of them');
});

test('mostUnreached reads a time tier\'s coverage', () => {
	const t = (reached, missions) => ({ reached, missions });
	assert.deepEqual([t(6, 26), t(13, 26), t(14, 26), t(4, 4), t(0, 0)].map(mostUnreached), [true, false, false, false, false]);
});
