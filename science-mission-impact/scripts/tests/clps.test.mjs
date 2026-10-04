import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { addMonths, buildClps, clpsComparison, CLPS_PROGRAM, loadClps, runningTotal } from '../lib/clps.mjs';
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

describe('loadClps', () => {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'smi-clps-')));
	after(() => fs.rmSync(root, { recursive: true, force: true }));
	const config = (f) => ({ ...f.config, clps: { rawDir: f.rawDir, comparators: [f.runs[0].id], horizonMonths: 3 } });

	it('reads the CLPS population and comparators through the verified loader', () => {
		const f = sourceFixture(fs.mkdtempSync(path.join(root, 'raw-')));
		// One refereed paper two months after the astro comparator's launch.
		const astro = f.runs[0];
		const records = { kind: 'mission_records', schema_version: 5, mission_id: astro.id, scope: 'lifetime',
			provenance: astro.corpus.provenance, records: [paper('a1', '2000-03-01')] };
		astro.corpus.files.records = f.write('payload/astro/records-with-paper.json', records);
		repin(f, 0);
		const clps = loadClps({ rawDir: f.rawDir, config: { ...config(f), names: { fixture_psd: { name: 'Lander One' } } }, asOf: '2026-10-02' });
		assert.deepEqual(clps.missions.map((m) => m.id), ['fixture_psd']);
		assert.equal(clps.missions[0].name, 'Lander One'); // the smi.config.json names override
		assert.equal(clps.start, '2000-01-01');
		assert.deepEqual(clps.comparators[0].series, [0, 0, 0, 1]);
		assert.equal(clps.comparators[0].papers, 1);
	});

	it('refuses a dataset with a different as-of date', () => {
		const f = sourceFixture(fs.mkdtempSync(path.join(root, 'raw-')));
		assert.throws(() => loadClps({ rawDir: f.rawDir, config: config(f), asOf: '2026-09-01' }), /disagree on as_of_date/);
	});
});
