import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { addMonths, buildClps, clpsComparison, CLPS_PROGRAM, loadClps, monthsElapsed, runningTotal, surfaceBehind } from '../lib/clps.mjs';
import { repin, sourceFixture } from './source-fixture.mjs';

const paper = (bibcode, date, refereed = true) => ({ bibcode, date: `${date}T00:00:00Z`, refereed });
const lander = (id, launchDate, records, extra = {}) => ({
	id, name: id, fullName: id, program: CLPS_PROGRAM, launchDate, primeStart: launchDate, cost: 100, records, ...extra
});

describe('addMonths', () => {
	it('adds calendar months, clamping the day to the month end', () => {
		assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
		assert.equal(addMonths('2023-01-31', 1), '2023-02-28');
		assert.equal(addMonths('2024-01-08', 12), '2025-01-08');
		assert.equal(addMonths('2024-11-15', 3), '2025-02-15');
		assert.equal(addMonths('2024-01-08', 0), '2024-01-08');
	});
});

describe('runningTotal', () => {
	it('counts papers before start + m months, null until the month has elapsed', () => {
		assert.deepEqual(runningTotal(['2024-02-01', '2024-02-01', '2024-03-01'], '2024-01-08', '2024-04-08', 4), [0, 2, 3, 3, null]);
	});

	it('throws on a paper dated before its start', () => {
		assert.throws(() => runningTotal(['2023-12-01'], '2024-01-08', '2025-01-01', 3, 'x'), /x: refereed paper dated 2023-12-01 before its start 2024-01-08/);
	});
});

describe('buildClps', () => {
	const comparator = { ...lander('old', '1997-07-04', [paper('c1', '1997-08-01'), paper('c2', '1997-10-01'), paper('c3', '1997-11-01', false)]),
		program: 'Discovery', launchDate: '1996-12-04' };
	const base = (missions, extra = {}) => buildClps({ asOf: '2024-04-08', horizonMonths: 3, comparators: ['old'], missions: [...missions, comparator], ...extra });

	it('pools distinct refereed papers across landers from the first launch', () => {
		const clps = base([
			lander('b', '2024-02-01', [paper('shared', '2024-03-01'), paper('own', '2024-03-01')]),
			lander('a', '2024-01-08', [paper('shared', '2024-02-01'), paper('unref', '2024-02-01', false)]),
			lander('cp', '2026-10-01', null, { primeStart: null })
		]);
		assert.equal(clps.start, '2024-01-08');
		// shared counts once, at its earliest date; the unrefereed paper not at all.
		assert.deepEqual(clps.series, [0, 1, 2, 2]);
		assert.deepEqual(clps.missions.map((m) => [m.id, m.papers]), [['a', 1], ['b', 2], ['cp', null]]);
		// each lander's outcome flags, as loadClps reads them from mission_status
		const flagged = base([lander('a', '2024-01-08', [], { failed: true, shortfall: true }), lander('b', '2024-02-01', [], { shortfall: true })]);
		assert.deepEqual(flagged.missions.map((m) => [m.id, m.failed, m.shortfall]), [['a', true, true], ['b', false, true]]);
		assert.equal(clps.program, CLPS_PROGRAM);
	});

	it('starts a comparator at its prime-mission start, else its launch', () => {
		const [old] = base([lander('a', '2024-01-08', [])]).comparators;
		assert.deepEqual(old, { id: 'old', name: 'old', fullName: 'old', start: '1997-07-04', cost: 100, papers: 2, series: [0, 1, 1, 2] });
		const noPrime = { ...comparator, primeStart: null, records: [paper('c1', '1997-01-01')] };
		const [fromLaunch] = buildClps({ asOf: '2024-04-08', horizonMonths: 3, comparators: ['old'], missions: [lander('a', '2024-01-08', []), noPrime] }).comparators;
		assert.equal(fromLaunch.start, '1996-12-04');
		assert.deepEqual(fromLaunch.series, [0, 1, 1, 1]);
	});

	it('compares CLPS with each comparator at its last measured month, and each lander at its own age', () => {
		// series [0, 1, 2, 2]; comparator [0, 1, 1, 2] → level at month 3, so not behind
		const old = (papers) => [{ id: 'old', papers }];
		assert.deepEqual(base([lander('b', '2024-02-01', [paper('x', '2024-03-01'), paper('y', '2024-03-01')]), lander('a', '2024-01-08', [paper('z', '2024-02-01')]),
			lander('cp', '2024-03-01', null)]).comparison, {
			month: 3, clps: 3, comparators: [{ id: 'old', name: 'old', cost: 100, papers: 2 }], behindAll: false,
			// a three months old, 1 paper to old's 2 at three months: behind. b two months old, 2 to old's 1: not.
			// cp has no records, so no row; its cost still sums.
			landers: [
				{ id: 'a', name: 'a', age: 3, papers: 1, comparators: old(2) },
				{ id: 'b', name: 'b', age: 2, papers: 2, comparators: old(1) }
			],
			behindEach: false,
			cost: 300,
			costEach: 100 // the landers' summed cost over the three of them
		});
		const { comparison } = base([lander('a', '2024-01-08', [paper('z', '2024-02-01')], { cost: null })]);
		assert.deepEqual([comparison.behindEach, comparison.cost, comparison.costEach], [true, null, null]);
		// a lander's paper dated after launch but before its prime start (in transit) counts from month 0, where a
		// comparator's would throw; at month 0 itself, before any month has elapsed, only such papers count
		const transit = base([lander('a', '2024-01-08', [paper('t', '2024-01-10')], { primeStart: '2024-03-20' }),
			lander('b', '2024-01-15', [paper('pre', '2024-01-20'), paper('own', '2024-03-01')], { primeStart: '2024-02-01' })]);
		assert.deepEqual(transit.comparison.landers.map((l) => [l.id, l.age, l.papers]), [['a', 0, 1], ['b', 2, 2]]);
		const early = { ...comparator, records: [paper('early', '1997-06-01')] };
		assert.throws(() => buildClps({ asOf: '2024-04-08', horizonMonths: 3, comparators: ['old'], missions: [lander('a', '2024-01-08', []), early] }), /old: refereed paper dated 1997-06-01 before its start 1997-07-04/);
		// a lander not yet started at the as-of date has no age: left out of landers and behindEach
		const future = base([lander('a', '2024-01-08', [paper('z', '2024-02-01')]), lander('later', '2024-02-01', [], { primeStart: '2024-05-01' })]).comparison;
		assert.deepEqual([future.landers.map((l) => l.id), future.behindEach], [['a'], true]);
		const series = [0, 1, 2, null];
		const c = (id, s) => ({ id, name: id, series: s });
		assert.deepEqual(clpsComparison({ series, comparators: [c('p', [0, 1, 3, 9]), c('q', [0, 2, 5, 9])] }),
			{ month: 2, clps: 2, comparators: [{ id: 'p', name: 'p', cost: null, papers: 3 }, { id: 'q', name: 'q', cost: null, papers: 5 }], behindAll: true });
		assert.equal(clpsComparison({ series, comparators: [c('p', [0, 1, 3, 9]), c('q', [0, 2, 2, 9])] }).behindAll, false, 'a tie is not behind');
		assert.equal(clpsComparison({ series, comparators: [] }).behindAll, null);
	});

	it('fails loudly', () => {
		assert.throws(() => base([]), /no missions in program/);
		assert.throws(() => base([lander('a', '2024-01-08', [])], { comparators: ['missing'] }), /comparator missing is not in/);
		assert.throws(() => buildClps({ asOf: '2024-04-08', horizonMonths: 3, comparators: ['old'], missions: [lander('a', '2024-01-08', []), { ...comparator, records: null }] }),
			/comparator old has no measured output/);
		assert.throws(() => base([lander('a', '2024-01-08', [])], { asOf: '1997-09-01' }), /comparator old has not reached month 3/);
	});
});

describe('monthsElapsed', () => {
	it('counts whole calendar months from a start to the as-of date', () => {
		assert.equal(monthsElapsed('2025-03-02', '2026-10-30'), 19);
		assert.equal(monthsElapsed('2025-03-02', '2026-11-02'), 20);
		assert.equal(monthsElapsed('2024-01-31', '2024-02-28'), 0); // Jan 31 + 1 month is Feb 29 in 2024
		assert.equal(monthsElapsed('2024-01-31', '2024-02-29'), 1);
	});
});

describe('buildClps surface', () => {
	const comparator = { ...lander('old', '1997-07-04', [paper('c1', '1997-08-01'), paper('c2', '1997-10-01')]), program: 'Discovery', launchDate: '1996-12-04' };
	const landers = (cost = 150) => [lander('a', '2024-01-08', [paper('z', '2024-02-01')]), lander('b', '2024-02-01', [paper('x', '2024-03-01'), paper('y', '2024-03-01')], { cost })];
	const big = {
		...lander('big', '1999-06-01', [
			...['2000-01-05', '2000-01-20', '2000-02-01', '2000-02-15', '2000-02-28'].map((d, i) => paper(`b${i}`, d)),
			paper('edge', '2000-03-01'), // month 2 ends here: not counted
			paper('late', '2000-04-01'),
			paper('unref', '2000-01-15', false)
		]),
		program: 'MEP', primeStart: '2000-01-01', cost: 1000, selection: 'directed', failed: false
	};
	const lost = { ...lander('lost', '1999-01-03', []), program: 'MS', primeStart: null, cost: 300, selection: 'competed', failed: true };
	// asOf before month 3 of the CLPS line closes: the line's last month is 2
	const build = (extra = {}) => buildClps({ asOf: '2024-03-20', horizonMonths: 3, comparators: ['old'], surface: ['big', 'lost', 'old'],
		missions: [...landers(), comparator, big, lost], ...extra });

	it('cuts each mission at the CLPS line’s last elapsed month, from its prime-mission start', () => {
		const { comparison, surface } = build();
		assert.equal(comparison.month, 2);
		assert.equal(surface.month, 2);
		assert.deepEqual(surface.clps, { papers: 3, cost: 250 });
		assert.deepEqual(surface.missions, [
			{ id: 'big', name: 'big', fullName: 'big', start: '2000-01-01', cost: 1000, selection: 'directed', failed: false, papers: 5 },
			// a failure with no records is a counted zero, from launch when it has no prime start
			{ id: 'lost', name: 'lost', fullName: 'lost', start: '1999-01-03', cost: 300, selection: 'competed', failed: true, papers: 0 },
			{ id: 'old', name: 'old', fullName: 'old', start: '1997-07-04', cost: 100, selection: null, failed: false, papers: 1 }
		]);
		// old has 1 paper to CLPS's 3; big 5 per $1B to CLPS's 12
		assert.deepEqual(surface.behind, { total: false, perDollar: false });
		assert.deepEqual(build({ surface: [] }).surface, { month: 2, clps: { papers: 3, cost: 250 }, flown: { papers: 3, cost: 250 }, missions: [], behind: null });
	});

	it('pools only the landers that did not fail outright for the test, papers and cost, as the surface missions\' failures are left out', () => {
		// a: 1 paper, $100M; b: 2 papers, $150M. big: 5 papers at $250M, 20 per $1B.
		const priced = { ...big, cost: 250 };
		const run = (failed) => buildClps({ asOf: '2024-03-20', horizonMonths: 3, comparators: ['old'], surface: ['big'],
			missions: [landers()[0], { ...landers()[1], failed }, comparator, priced] }).surface;
		// all landers flew: 3 papers for $250M (12 per $1B), behind big both ways
		assert.deepEqual([run(false).clps, run(false).flown, run(false).behind], [{ papers: 3, cost: 250 }, { papers: 3, cost: 250 }, { total: true, perDollar: true }]);
		// b failed: the test pools a alone, 1 paper for $100M (10 per $1B); the all-lander point stays for the chart
		assert.deepEqual([run(true).clps, run(true).flown, run(true).behind], [{ papers: 3, cost: 250 }, { papers: 1, cost: 100 }, { total: true, perDollar: true }]);
		// a paper a flown lander shares with the failed one still counts, once
		const shared = buildClps({ asOf: '2024-03-20', horizonMonths: 3, comparators: ['old'], surface: ['big'], missions: [
			lander('a', '2024-01-08', [paper('z', '2024-02-01'), paper('x', '2024-03-01')]), { ...landers()[1], failed: true }, comparator, priced] }).surface;
		assert.deepEqual(shared.flown, { papers: 2, cost: 100 });
	});

	it('leaves the flown pool\'s cost null with no lander flown', () => {
		const { surface } = buildClps({ asOf: '2024-03-20', horizonMonths: 3, comparators: ['old'], surface: ['big'],
			missions: landers().map((m) => ({ ...m, failed: true })).concat(comparator, big) });
		assert.deepEqual([surface.flown, surface.behind], [{ papers: 0, cost: null }, { total: true, perDollar: null }]);
	});

	it('leaves the pooled cost null when a lander has none', () => {
		const { surface } = build({ missions: [...landers(null), comparator, big, lost], surface: ['big', 'lost'] });
		assert.deepEqual(surface.clps, { papers: 3, cost: null });
		assert.deepEqual(surface.behind, { total: true, perDollar: null });
	});

	it('is behind only when every successful mission is strictly ahead; failures and missing costs left out', () => {
		const clps = { papers: 10, cost: 500 };
		const m = (id, papers, cost, failed = false) => ({ id, papers, cost, failed });
		assert.deepEqual(surfaceBehind(clps, [m('a', 11, 500), m('b', 30, 1000)]), { total: true, perDollar: true });
		assert.deepEqual(surfaceBehind(clps, [m('a', 11, 500), m('x', 0, 300, true)]), { total: true, perDollar: true }, 'a failure is ignored');
		assert.deepEqual(surfaceBehind(clps, [m('a', 10, 100)]), { total: false, perDollar: true }, 'a tie is not behind');
		assert.deepEqual(surfaceBehind(clps, [m('a', 30, 2000)]), { total: true, perDollar: false });
		assert.deepEqual(surfaceBehind(clps, [m('a', 11, 500), m('n', 5, null)]), { total: false, perDollar: true }, 'no cost: total only');
		assert.deepEqual(surfaceBehind({ papers: 10, cost: null }, [m('a', 11, 500)]), { total: true, perDollar: null });
		assert.deepEqual(surfaceBehind(clps, [m('n', 11, null)]), { total: true, perDollar: null });
		assert.equal(surfaceBehind(clps, [m('x', 0, 300, true)]), null);
		assert.equal(surfaceBehind(clps, []), null);
	});

	it('fails loudly', () => {
		const only = (mission, id = mission.id) => build({ missions: [...landers(), comparator, mission], surface: [id] });
		assert.throws(() => only(big, 'nope'), /surface mission nope is not in the CLPS dataset/);
		assert.throws(() => only({ ...big, records: null }), /surface mission big has no measured output/);
		assert.throws(() => only({ ...big, primeStart: null, launchDate: null }), /surface mission big has no prime-mission start or launch date/);
		assert.throws(() => only({ ...big, primeStart: '2024-02-01', records: [] }), /surface mission big has not reached month 2 by 2024-03-20/);
	});
});

describe('loadClps', () => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'smi-clps-')));
	after(() => fs.rmSync(root, { recursive: true, force: true }));
	const config = (f) => ({ ...f.config, clps: { rawDir: f.rawDir, comparators: [f.runs[0].id], surface: [f.runs[0].id], horizonMonths: 3 } });

	it('reads the CLPS population and comparators through the verified loader', () => {
		const f = sourceFixture(fs.mkdtempSync(path.join(root, 'raw-')));
		// One refereed paper two months after the astro comparator's launch.
		const astro = f.runs[0];
		const records = { kind: 'mission_records', schema_version: 6, mission_id: astro.id, scope: 'lifetime',
			provenance: astro.corpus.provenance, records: [paper('a1', '2000-03-01')] };
		astro.corpus.files.records = f.write('payload/astro/records-with-paper.json', records);
		repin(f, 0);
		const clps = loadClps({ rawDir: f.rawDir, config: { ...config(f), names: { fixture_psd: { name: 'Lander One' } } }, asOf: '2026-10-02' });
		assert.deepEqual(clps.missions.map((m) => m.id), ['fixture_psd']);
		assert.equal(clps.missions[0].name, 'Lander One'); // the smi.config.json names override
		assert.equal(clps.start, '2000-01-01');
		assert.deepEqual(clps.comparators[0].series, [0, 0, 0, 1]);
		assert.equal(clps.comparators[0].papers, 1);
		// the surface figure reads selection and failure as the mission rows do (the fixture has no selection)
		const [surface] = clps.surface.missions;
		assert.deepEqual([surface.id, surface.start, surface.selection, surface.failed, surface.papers], [astro.id, '2000-01-01', null, false, 1]);
		assert.equal(clps.surface.month, 3);
	});

	it('accepts a dataset a day either side of the main package, and refuses one further off', () => {
		const f = sourceFixture(fs.mkdtempSync(path.join(root, 'raw-')));
		for (const asOf of ['2026-10-01', '2026-10-03']) assert.doesNotThrow(() => loadClps({ rawDir: f.rawDir, config: config(f), asOf }));
		assert.throws(() => loadClps({ rawDir: f.rawDir, config: config(f), asOf: '2026-10-04' }), /more than 1 day from the main package's 2026-10-04/);
		assert.throws(() => loadClps({ rawDir: f.rawDir, config: config(f), asOf: '2026-09-01' }), /more than 1 day/);
	});
});
