import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildCostCurve, pooledBand } from '../../../scripts/lib/costcurve.mjs';
import { loadConfig } from '../../../scripts/lib/config.mjs';
import { buildDiscussion, underThreshold } from './public.js';

/** The fixtures are on a $100M scale; a mission at exactly 100 exercises the inclusive edge. */
const discuss = (divisions, options = {}) => buildDiscussion(divisions, { thresholdCost: 100, ...options });

const mission = (id, cost, top10 = 1, extra = {}) => ({
	id, name: id, cost, failed: false,
	full: { status: 'available', papers: 2, citations: 5, top10, top1: 0 },
	window: { status: 'available', top10, top1: 0 },
	lifetime: { papers: 2, citations: 5, top10 },
	...extra
});
/** The same mission with its full-mission citations set. */
const cited = (m, citations) => {
	m.full.citations = citations;
	return m;
};
/** A mission whose first top-10% paper came `years` after formulation. */
const reaching = (id, cost, years, yearsToBuild = null) => {
	const m = mission(id, cost, 1, { yearsToBuild });
	m.full.first = { state: 'reached', yearsFromFormulation: years };
	return m;
};
/** A launch failure: measured, with nothing to show in any scope. */
const failure = (id, cost) => {
	const m = mission(id, cost, 0);
	m.failed = true;
	m.full = { ...m.full, papers: 0, citations: 0 };
	return m;
};
/** A costed mission whose full-mission output was not measured. */
const unmeasured = (id, cost) => {
	const m = mission(id, cost, null);
	m.full = { ...m.full, status: 'unavailable', papers: null, citations: null, top1: null };
	return m;
};
const division = (missions) => ({ slug: 'test', name: 'Test', rankable: true, missions });
const curve = (d, scope) => buildCostCurve(d.missions.map((m) => ({ id: m.id, name: m.name, cost: m.cost, top: m[scope].top10 })));
/** The packaged division: its full-mission and window top-10% cost curves, as package-data.mjs writes them. */
const packaged = (d) => ({
	...d,
	costCurves: { full: { 10: curve(d, 'full') }, window: { 10: curve(d, 'window') } }
});

test('the threshold uses exact positive adjusted costs, inclusive of the threshold itself', () => {
	assert.deepEqual([null, 0, -1, 99.999, 100, 100.5, 101, NaN].map((cost) => underThreshold(100)({ cost })),
		[false, false, false, true, true, false, false, false]);
	assert.throws(() => buildDiscussion([], {}), /thresholdCost/);
	assert.throws(() => buildDiscussion([], { thresholdCost: 0 }), /thresholdCost/);
	const raw = division([mission('low', 80, 2), mission('above', 101, 6), mission('high', 900, 2)]);
	const first = discuss([packaged(raw)]);
	assert.equal(first.scope, 'full');
	assert.equal(first.threshold.missions, 1);
	assert.equal(first.divisions[0].share, 0.2);
});

test('changing mission values dynamically changes counts, shares and cost ranges', () => {
	const raw = division([mission('low', 80, 2), mission('above', 101, 6), mission('high', 900, 2)]);
	const before = discuss([packaged(raw)]);
	raw.missions[1].cost = 90;
	raw.missions[0].full.top10 = 20;
	const after = discuss([packaged(raw)]);
	assert.equal(after.threshold.missions, 2);
	assert.equal(after.divisions[0].top10, 26);
	assert.equal(after.divisions[0].share, 26 / 28);
	assert.notDeepEqual(after.bands, before.bands);
	// The prime-phase window is still readable on request, and did not move.
	const window = discuss([packaged(raw)], { scope: 'window' });
	assert.equal(window.scope, 'window');
	assert.equal(window.divisions[0].top10, 8);
	assert.equal(window.divisions[0].share, 0.8);
});

test('each division keeps its own denominator and unavailable output stays distinct', () => {
	const a = division([mission('a', 20, 2), mission('b', 200, 8)]);
	const b = { ...division([mission('c', 30, 90), mission('d', 300, 10)]), slug: 'other' };
	const unknown = unmeasured('unknown', 40);
	unknown.lifetime.papers = null;
	unknown.window.status = 'unavailable';
	a.missions.push(unknown);
	const story = discuss([packaged(a), packaged(b)]);
	assert.deepEqual(story.divisions.map((d) => d.share), [0.2, 0.9]);
	assert.equal(story.threshold.missions, 3);
	assert.equal(story.threshold.unavailable, 1);
});

test('the comparison splits at-or-below and above the threshold over rankable divisions', () => {
	const cheap = mission('cheap', 50, 2.5);
	cheap.full.top1 = 1;
	const a = division([cheap, failure('failed', 60), mission('edge', 100, 3), mission('big', 500, 4.5), unmeasured('lost', 70), mission('nocost', null, 1)]);
	const b = { ...division([mission('o1', 99.999, 1), mission('o2', 1000, 5)]), slug: 'other', name: 'Other' };
	// Not rankable: its missions stay out of every cross-division figure.
	const tiny = { ...division([mission('skip', 10, 9)]), slug: 'tiny', name: 'Tiny', rankable: false };
	const story = discuss([packaged(a), packaged(b), packaged(tiny)]);
	assert.deepEqual(story.comparison.divisions, ['test', 'other']);
	assert.equal(story.comparison.unavailable, 1);
	// The nearest costs either side come from every costed mission; $100M exactly is at or below.
	assert.deepEqual(story.comparison.gap, { below: 100, above: 500 });
	const none = { launchYears: null, launchMedian: null, topType: null };
	assert.deepEqual(story.comparison.groups, [
		// cheap, failed (a measured zero), edge at exactly $100M and o1 at $99.999M
		{ key: 'under', missions: 4, failed: 1, withTop: 3, top10: 6.5, top10PerMission: 1.625, top1: 1, top1PerMission: 0.25, cost: 309.999, citations: 15,
			median: 1.75, papersMedian: 2, noPapers: 1, largest: { id: 'edge', name: 'edge', top10: 3, share: 0.46154 }, costMin: 50, costMax: 100, ...none },
		// big and o2
		{ key: 'over', missions: 2, failed: 0, withTop: 2, top10: 9.5, top10PerMission: 4.75, top1: 0, top1PerMission: 0, cost: 1500, citations: 10,
			median: 4.75, papersMedian: 2, noPapers: 0, largest: { id: 'o2', name: 'o2', top10: 5, share: 0.52632 }, costMin: 500, costMax: 1000, ...none }
	]);
	assert.equal(story.missingCosts, 1);
});

test('the pooled band weights each rankable division with credit equally', () => {
	const a = division([mission('a1', 10, 1), mission('a2', 100, 1)]);
	const b = { ...division([mission('b1', 50, 1), mission('b2', 1000, 3)]), slug: 'other', name: 'Other' };
	const flat = { ...division([mission('z1', 5, 0), mission('z2', 70, 0)]), slug: 'flat', name: 'Flat' };
	const tiny = { ...division([mission('t1', 1, 50)]), slug: 'tiny', name: 'Tiny', rankable: false };
	const [pa, pb, pflat, ptiny] = [a, b, flat, tiny].map(packaged);
	const story = discuss([pa, pb, pflat, ptiny]);
	const expected = pooledBand([pa.costCurves.full[10], pb.costCurves.full[10]]);
	assert.deepEqual(expected, { p25: 10, p50: 100, p75: 1000 });
	// Every costed mission of both divisions sits between $10M and $1,000M.
	assert.deepEqual(story.pooledBand, { divisions: ['test', 'other'], ...expected, costShare: 1, missionShare: 1 });
	// A division without credit still enters the comparison, just not the band.
	assert.deepEqual(story.comparison.divisions, ['test', 'other', 'flat']);
	assert.equal(discuss([pflat, ptiny]).pooledBand, null);
});

test('citations per $100M keep each rankable division apart, null for an empty side', () => {
	const u1 = mission('u1', 30, 1);
	u1.full.citations = 10;
	const o1 = mission('o1', 300, 1);
	o1.full.citations = 7;
	const o2 = mission('o2', 150, 1);
	o2.full.citations = 10;
	const a = division([u1, failure('f', 20), o1, unmeasured('lost', 40)]);
	const b = { ...division([o2]), slug: 'other', name: 'Other' };
	const tiny = { ...division([mission('skip', 10, 9)]), slug: 'tiny', name: 'Tiny', rankable: false };
	const story = discuss([packaged(a), packaged(b), packaged(tiny)]);
	assert.deepEqual(story.perDollar, [
		// Without u1 the under side reads 0 per $100M, so its lead does not survive.
		{ division: 'test', name: 'Test', groups: [
			{ key: 'under', missions: 2, cost: 50, citations: 10, perHundredM: 20 },
			{ key: 'over', missions: 1, cost: 300, citations: 7, perHundredM: 2.333 }
		], favors: null, flipsOn: [{ id: 'u1', name: 'u1', side: 'under' }, { id: 'o1', name: 'o1', side: 'over' }],
		margin: 0.88335, largestUnder: { id: 'u1', name: 'u1', share: 1 } },
		{ division: 'other', name: 'Other', groups: [
			{ key: 'under', missions: 0, cost: 0, citations: 0, perHundredM: null },
			{ key: 'over', missions: 1, cost: 150, citations: 10, perHundredM: 6.667 }
		], favors: null, flipsOn: [], margin: null, largestUnder: null }
	]);
});

test('the gap around the threshold spans every division, and a side with no mission is null', () => {
	const a = division([mission('a1', 40), mission('above', 101), mission('nocost', null), unmeasured('lost', 99.5)]);
	const tiny = { ...division([mission('t1', 99.9), mission('t2', 150)]), slug: 'tiny', name: 'Tiny', rankable: false };
	// $99.9M is in a division that is not even rankable.
	assert.deepEqual(discuss([packaged(a), packaged(tiny)]).comparison.gap, { below: 99.9, above: 101 });
	assert.deepEqual(discuss([packaged(a), packaged(tiny)], { thresholdCost: 99.9 }).comparison.gap, { below: 99.9, above: 101 });
	assert.deepEqual(discuss([packaged(division([mission('x', 20), mission('y', 0)]))]).comparison.gap, { below: 20, above: null });
});

test('each side of the comparison carries its medians, largest mission, cost and launch range and commonest type', () => {
	const f = Object.assign(failure('f', 40), { launchYear: 2001, type: 'Lander' });
	// Measured, but with no paper count: not a measured zero.
	const q = mission('q', 60, 0, { type: 'Orbiter' });
	q.full.papers = null;
	const a = division([
		mission('b', 20, 2, { launchYear: 1990, type: 'Orbiter' }),
		mission('a', 30, 2, { launchYear: 1997, type: 'Lander' }),
		f, q,
		mission('r', 70, 1),
		mission('zero', 101, 0)
	]);
	const [under, over] = discuss([packaged(a)]).comparison.groups;
	assert.equal(under.median, 1); // 0, 0, 1, 2, 2
	assert.equal(under.papersMedian, 2); // q's null is left out: 0, 2, 2, 2
	assert.equal(under.noPapers, 1); // the failure's zero, not q's null
	assert.deepEqual(under.largest, { id: 'a', name: 'a', top10: 2, share: 0.4 }); // a and b tie at 2; a by name
	assert.deepEqual([under.costMin, under.costMax], [20, 70]);
	assert.deepEqual(under.launchYears, [1990, 2001]);
	assert.equal(under.launchMedian, 1997);
	assert.deepEqual(under.topType, { type: 'Lander', missions: 2 }); // two each; nulls are not a type
	// A side whose missions hold no top credit has no largest; one mission is its own range.
	assert.equal(over.largest, null);
	assert.deepEqual([over.median, over.costMin, over.costMax, over.launchYears, over.launchMedian, over.topType], [0, 101, 101, null, null, null]);
	// An empty side is null throughout, never zero, except the count of missions with no papers.
	const [, empty] = discuss([packaged(division([mission('u', 50)]))]).comparison.groups;
	assert.deepEqual(
		[empty.median, empty.papersMedian, empty.noPapers, empty.largest, empty.costMin, empty.costMax, empty.launchYears, empty.launchMedian, empty.topType],
		[null, null, 0, null, null, null, null, null, null]
	);
});

test('the threshold facts carry the median launch year of every under-reference mission, as a whole year', () => {
	const lost = unmeasured('lost', 30);
	const a = division([mission('a1', 10, 1, { launchYear: 1990 }), mission('big', 200, 1, { launchYear: 2020 }), lost]);
	const tiny = { ...division([mission('t1', 5, 1, { launchYear: 1997 })]), slug: 'tiny', name: 'Tiny', rankable: false };
	// 1990 and 1997, the unrankable one included and the unmeasured one's missing year left out: 1993.5.
	assert.equal(discuss([packaged(a), packaged(tiny)]).threshold.launchMedian, 1994);
	assert.equal(discuss([packaged(division([mission('n', 10)]))]).threshold.launchMedian, null);
});

test('the pooled band says how much spending and how many missions sit inside it, divisions weighted equally', () => {
	// Test: $100M in all; the band ($20M-$30M) holds a2 and a3, $50M of it and 2 of 4 costed missions.
	const a = division([mission('a1', 10, 0), mission('a2', 20, 1), mission('a3', 30, 1), mission('a4', 40, 0), mission('anocost', null, 0)]);
	// Other: $200M in all; the band holds b2 alone, $25M of it and 1 of 4 missions.
	const b = { ...division([mission('b1', 5, 0), mission('b2', 25, 1), mission('b3', 70, 1), mission('b4', 100, 0)]), slug: 'other', name: 'Other' };
	// No credit: not in the band, so not in its means either.
	const flat = { ...division([mission('z1', 22, 0), mission('z2', 28, 0)]), slug: 'flat', name: 'Flat' };
	const story = discuss([packaged(a), packaged(b), packaged(flat)]);
	assert.deepEqual(story.pooledBand, { divisions: ['test', 'other'], p25: 20, p50: 25, p75: 30,
		costShare: 0.3125, missionShare: 0.375 }); // (0.5 + 0.125) / 2 and (0.5 + 0.25) / 2
});

test('per-dollar favors a side only when no single mission decides it', () => {
	// Under 366.667 vs over 40, and it stays so whichever one mission is dropped.
	const stable = division([cited(mission('u1', 10), 50), cited(mission('u2', 20), 60), cited(mission('o1', 200), 100), cited(mission('o2', 300), 100)]);
	// Under 200 vs over 150, but without u1 the under side reads 0.
	const flipped = { ...division([cited(mission('v1', 10), 100), cited(mission('v2', 40), 0), cited(mission('w1', 200), 300)]), slug: 'flipped', name: 'Flipped' };
	// Over 60 vs under 30, stable both ways.
	const over = { ...division([cited(mission('x1', 50), 10), cited(mission('x2', 50), 20), cited(mission('y1', 200), 100), cited(mission('y2', 300), 200)]), slug: 'over', name: 'Over' };
	// One under mission: dropping it leaves nothing to compare, so the lead is not robust.
	const single = { ...division([cited(mission('s1', 10), 100), cited(mission('s2', 200), 10)]), slug: 'single', name: 'Single' };
	const empty = { ...division([cited(mission('e1', 200), 10)]), slug: 'empty', name: 'Empty' };
	const rows = discuss([stable, flipped, over, single, empty].map(packaged)).perDollar;
	const facts = ({ favors, margin, largestUnder }) => ({ favors, margin, largestUnder });
	assert.deepEqual(rows.map(facts), [
		{ favors: 'under', margin: 0.89091, largestUnder: { id: 'u2', name: 'u2', share: 0.54545 } },
		{ favors: null, margin: 0.25, largestUnder: { id: 'v1', name: 'v1', share: 1 } },
		{ favors: 'over', margin: 0.5, largestUnder: { id: 'x2', name: 'x2', share: 0.66667 } },
		{ favors: null, margin: 0.995, largestUnder: { id: 's1', name: 's1', share: 1 } },
		{ favors: null, margin: null, largestUnder: null }
	]);
	// flipsOn names what favors === null rests on: without v1 the under side reads 0 (reversed),
	// without w1 the over side is empty; a robust lead, or no order at all, has none.
	const flips = (row) => row.flipsOn.map((m) => `${m.id}:${m.side}`);
	assert.deepEqual(rows.map(flips), [[], ['v1:under', 'w1:over'], [], ['s1:under', 's2:over'], []]);
	for (const row of rows) assert.equal(row.favors !== null, row.flipsOn.length === 0 && row.margin !== null);
});

test('the comparison per rankable division, and its equal-weight mean over divisions with both sides', () => {
	// Test: under a1 (2) and a failure (0); over b1 (6).
	const a = division([mission('a1', 50, 2), failure('af', 60), mission('b1', 500, 6), unmeasured('lost', 70)]);
	// Other: under o1 (1); over o2 (3) and o3 (5).
	const b = { ...division([mission('o1', 100, 1), mission('o2', 200, 3), mission('o3', 900, 5)]), slug: 'other', name: 'Other' };
	// One-sided: present in byDivision, left out of the mean.
	const c = { ...division([mission('c1', 20, 4), mission('c2', 30, 0)]), slug: 'cheap', name: 'Cheap' };
	const tiny = { ...division([mission('skip', 10, 9)]), slug: 'tiny', name: 'Tiny', rankable: false };
	const { comparison } = discuss([a, b, c, tiny].map(packaged));
	assert.deepEqual(comparison.byDivision, [
		{ division: 'test', name: 'Test', under: { missions: 2, failed: 1, withTop: 1, top10: 2, top10PerMission: 1 },
			over: { missions: 1, failed: 0, withTop: 1, top10: 6, top10PerMission: 6 } },
		{ division: 'other', name: 'Other', under: { missions: 1, failed: 0, withTop: 1, top10: 1, top10PerMission: 1 },
			over: { missions: 2, failed: 0, withTop: 2, top10: 8, top10PerMission: 4 } },
		{ division: 'cheap', name: 'Cheap', under: { missions: 2, failed: 0, withTop: 1, top10: 4, top10PerMission: 2 },
			over: { missions: 0, failed: 0, withTop: 0, top10: 0, top10PerMission: null } }
	]);
	// (1 + 1) / 2 and (6 + 4) / 2; the pooled groups instead read 7 / 5 and 14 / 3.
	assert.deepEqual(comparison.equalWeight, { under: 1, over: 5 });
	assert.deepEqual(comparison.groups.map((g) => g.top10PerMission), [1.4, 4.667]);
	assert.deepEqual(discuss([packaged(c)]).comparison.equalWeight, { under: null, over: null });
});

test('timing cuts the reached missions into cost thirds at round(n/3) and round(2n/3)', () => {
	const pad = (i) => String(i).padStart(2, '0');
	// $10M to $260M, i years to a first top paper and i/2 to build.
	const reached = Array.from({ length: 26 }, (_, k) => reaching(`m${pad(k + 1)}`, (k + 1) * 10, k + 1, (k + 1) / 2));
	const d = division([...reached.reverse(), failure('crash', 50), mission('quiet', 500)]);
	const [row] = discuss([packaged(d)]).timing;
	assert.deepEqual([row.missions, row.reached, row.never], [28, 26, 2]);
	assert.deepEqual(row.under, { missions: 11, reached: 10, failed: 1 }); // m01 to m10 ($100M inclusive) and the crash
	assert.deepEqual(row.byCostThird, [
		{ key: 'low', missions: 9, costRange: [10, 90], medianYears: 5, medianBuildYears: 2.5 },
		{ key: 'mid', missions: 8, costRange: [100, 170], medianYears: 13.5, medianBuildYears: 6.75 },
		{ key: 'high', missions: 9, costRange: [180, 260], medianYears: 22, medianBuildYears: 11 }
	]);
	// n = 2 cuts at 1 and 1: the middle third is empty, and a missing build time stays null.
	const [pair] = discuss([packaged(division([reaching('r2', 300, 5), reaching('r1', 10, 3, 2)]))]).timing;
	assert.deepEqual(pair.byCostThird, [
		{ key: 'low', missions: 1, costRange: [10, 10], medianYears: 3, medianBuildYears: 2 },
		{ key: 'mid', missions: 0, costRange: null, medianYears: null, medianBuildYears: null },
		{ key: 'high', missions: 1, costRange: [300, 300], medianYears: 5, medianBuildYears: null }
	]);
});

test('failure facts count shortfalls either side of the threshold, every costed mission of every division', () => {
	const short = (m) => Object.assign(m, { shortfall: true });
	const a = division([short(mission('u1', 50)), short(mission('edge', 100)), mission('u3', 80),
		short(mission('o1', 101)), mission('o2', 200), short(mission('nocost', null))]);
	// Not rankable, still counted: failure is not a citation measure.
	const tiny = { ...division([mission('o3', 300)]), slug: 'tiny', name: 'Tiny', rankable: false };
	const { failure } = discuss([packaged(a), packaged(tiny)]);
	assert.deepEqual(failure.under, { missions: 3, failed: 2, rate: 0.66667 });
	assert.deepEqual(failure.over, { missions: 3, failed: 1, rate: 0.33333 });
	assert.equal(failure.higher, 'under');
	assert.deepEqual(failure.byDivision, [
		{ division: 'test', name: 'Test', under: { missions: 3, failed: 2 }, over: { missions: 2, failed: 1 } },
		{ division: 'tiny', name: 'Tiny', under: { missions: 0, failed: 0 }, over: { missions: 1, failed: 0 } }
	]);
	// Equal rates, or an empty side, name no side.
	assert.equal(discuss([packaged(division([short(mission('x', 10)), short(mission('y', 500))]))]).failure.higher, null);
	assert.equal(discuss([packaged(division([short(mission('x', 10))]))]).failure.higher, null);
});

test('threshold facts count the missions at or below it and their mission papers', () => {
	const lost = unmeasured('lost', 30);
	const a = division([mission('a1', 10, 1, { launchYear: 1990 }), mission('edge', 100, 1, { launchYear: 1996 }),
		mission('big', 200, 1, { launchYear: 2020 }), lost, mission('nocost', null)]);
	a.missions[0].full.papers = 7;
	const { threshold } = discuss([packaged(a)]);
	assert.deepEqual(threshold, { missions: 3, total: 4, ids: ['a1', 'edge', 'lost'], papers: 9, papersAll: 13,
		unavailable: 1, launchMedian: 1993 });
});

test('the packaged story is the discussion over the packaged divisions', () => {
	const dir = new URL('./generated/', import.meta.url);
	const read = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
	const site = read('site.json');
	const divisions = readdirSync(new URL('divisions/', dir)).filter((n) => n.endsWith('.json')).map((n) => read(`divisions/${n}`));
	const order = site.divisions.map((d) => d.slug);
	divisions.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
	const ref = site.story.referenceCost;
	assert.equal(ref, loadConfig(new URL('../../../', import.meta.url).pathname).thresholdCost);
	const story = buildDiscussion(divisions, { thresholdCost: ref, scope: site.story.scope, timingDivision: site.story.timingDivision });
	const all = divisions.flatMap((d) => d.missions);
	const selected = all.filter(underThreshold(ref));
	assert.equal(story.threshold.missions, selected.length);
	assert.equal(story.failure.under.missions + story.failure.over.missions + story.missingCosts, all.length);
	const { tiles } = read('scrolly.json');
	assert.equal(tiles.filter((t) => t.shortfall && t.cost > 0 && t.cost <= ref).length, story.failure.under.failed);
	assert.ok(story.bands.every((b) => Number.isFinite(b.p25) && b.p25 <= b.p75));
	assert.deepEqual(story, site.story);
	// ponytail: conditional until data/paper-kinds.json has been packaged; make it unconditional after.
	assert.deepEqual(new Set(site.kinds.missions.map((m) => m.id)), new Set(site.story.threshold.ids));
});

test('every smi.config.json names override reaches the packaged tiles, index, mission docs and CLPS', () => {
	const dir = new URL('./generated/', import.meta.url);
	const read = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
	const { names } = loadConfig(new URL('../../../', import.meta.url).pathname);
	const { tiles } = read('scrolly.json');
	const index = read('index.json');
	const { clps } = read('site.json');
	for (const [id, override] of Object.entries(names)) {
		const tile = tiles.find((t) => t.id === id);
		const lander = clps.missions.find((m) => m.id === id);
		assert.ok(tile || lander, `${id} is published`);
		if (tile) {
			const doc = read(`missions/${id}.json`);
			const entry = index.find((e) => e.id === id);
			if (override.name) for (const named of [tile, doc, entry]) assert.equal(named.name, override.name, id);
			if (override.fullName) for (const named of [doc, entry]) assert.equal(named.fullName, override.fullName, id);
		}
		if (lander && override.name) assert.equal(lander.name, override.name, id);
		if (lander && override.fullName) assert.equal(lander.fullName, override.fullName, id);
	}
	// The overridden tile in the example: MarCo is published as MarCO.
	assert.equal(tiles.find((t) => t.id === 'marco')?.name, names.marco.name);
});
