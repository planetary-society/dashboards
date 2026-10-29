import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { addMonths, buildClps, clpsComparison, CLPS_PROGRAM, loadClps, runningTotal, surfaceBehind } from '../lib/clps.mjs';
import { repin, sourceFixture } from './source-fixture.mjs';

const paper = (bibcode, date, refereed = true) => ({ bibcode, date: `${date}T00:00:00Z`, refereed });
const lander = (id, launchDate, records, extra = {}) => ({
	id, name: id, fullName: id, program: CLPS_PROGRAM, launchDate, primeStart: launchDate, status: 'Completed', cost: 100, records, ...extra
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

	it('compares CLPS with each comparator at its last measured month', () => {
		// series [0, 1, 2, 2]; comparator [0, 1, 1, 2] → level at month 3, so not behind
		assert.deepEqual(base([lander('b', '2024-02-01', [paper('x', '2024-03-01'), paper('y', '2024-03-01')]), lander('a', '2024-01-08', [paper('z', '2024-02-01')])]).comparison,
			{ month: 3, clps: 3, comparators: [{ id: 'old', name: 'old', papers: 2 }], behindAll: false });
		const series = [0, 1, 2, null];
		const c = (id, s) => ({ id, name: id, series: s });
		assert.deepEqual(clpsComparison({ series, comparators: [c('p', [0, 1, 3, 9]), c('q', [0, 2, 5, 9])] }),
			{ month: 2, clps: 2, comparators: [{ id: 'p', name: 'p', papers: 3 }, { id: 'q', name: 'q', papers: 5 }], behindAll: true });
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
		assert.deepEqual(build({ surface: [] }).surface, { month: 2, clps: { papers: 3, cost: 250 }, missions: [], behind: null });
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
