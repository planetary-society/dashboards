import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { assertDashboardCompatibility, loadSourceCatalog, readReferencedJson } from '../lib/source.mjs';
import { loadRuns } from '../package-data.mjs';
import { Warnings } from '../lib/invariants.mjs';
import { fixtureApp, repin, sourceFixture } from './source-fixture.mjs';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'smi-source-')));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const fixture = (options) => sourceFixture(fs.mkdtempSync(path.join(root, 'raw-')), options);
const load = (f) => loadSourceCatalog(f.rawDir, f.config);
const saveStats = (f) => f.write(f.runs[0].statsPath, f.runs[0].stats);
/** package-data.mjs in a throwaway app whose CLPS dataset is the fixture. */
const packager = (f) => path.join(fixtureApp(f, fs.mkdtempSync(path.join(root, 'app-'))), 'scripts/package-data.mjs');

describe('namespaced source loader', () => {
	it('uses selected membership and manifest paths, allowing distinct stats fingerprints', () => {
		const f = fixture();
		const source = load(f);
		assert.equal(source.missions.size, 5);
		assert.equal(source.missions.has('unused'), false);
		assert.doesNotThrow(() => source.verifyCompanions());
		assert.equal(source.readMission(f.runs[0].id).short_title, f.runs[0].shortTitle);
		assert.equal(source.readPapers(source.runs[0], 'window').scope, 'window');
		assert.equal(source.readPapers(source.runs[0], 'full').scope, 'full_mission');
		const { snapshot } = loadRuns(f.rawDir, f.config, new Warnings(), source);
		assert.equal(snapshot.windowPolicy.publicationYears, 3);
		assert.equal(snapshot.fullPolicy.postEndYears, 2);
	});

	it('does not fall back to an unprefixed or latest dataset', () => {
		const f = fixture();
		fs.renameSync(path.join(f.rawDir, 'index.json'), path.join(f.rawDir, 'legacy-index.json'));
		assert.throws(() => load(f), /Cannot read source .*index.json/);
	});

	it('rejects missing companions, even if an old conventional file exists', () => {
		const f = fixture();
		delete f.runs[0].stats.companion_exports.missions[f.runs[0].shortTitle];
		f.write(`${f.runs[0].id}.json`, f.runs[0].corpus);
		saveStats(f);
		assert.throws(() => load(f), /missing or invalid companion reference/);
	});

	it('rejects altered bytes, missing files and unknown sibling schemas', () => {
		const f = fixture();
		const ref = f.runs[0].corpus.files.records;
		fs.appendFileSync(path.join(f.rawDir, ref.path), ' ');
		assert.throws(() => load(f).verifyCompanions(), /bytes\/sha256 mismatch/);
		fs.rmSync(path.join(f.rawDir, ref.path));
		assert.throws(() => load(f).verifyCompanions(), /companion not found/);
		f.runs[0].corpus.files.records = f.write(ref.path, { schema_version: 999 });
		repin(f);
		assert.throws(() => load(f).verifyCompanions(), /unknown schema_version 999/);
	});

	it('checks hashes again when files change after preflight', () => {
		const f = fixture();
		const source = load(f);
		source.verifyCompanions();
		fs.appendFileSync(path.join(f.rawDir, f.runs[0].corpus.files.citations.path), ' ');
		assert.throws(() => source.readMission(f.runs[0].id, 'citations'), /bytes\/sha256 mismatch/);
	});

	it('checks paper hashes even when the changed file has the same byte length', () => {
		const f = fixture();
		const ref = f.runs[0].stats.files.papers_json;
		const file = path.join(f.rawDir, ref.path);
		const text = fs.readFileSync(file, 'utf8');
		fs.writeFileSync(file, text.replace('lifetime', 'LIFETIME'));
		assert.equal(fs.statSync(file).size, ref.bytes);
		assert.throws(() => load(f).verifyCompanions(), /bytes\/sha256 mismatch/);
	});

	it('checks paper identity after verifying its bytes', () => {
		const f = fixture();
		const ref = f.runs[0].stats.files.papers_window_json;
		const doc = JSON.parse(fs.readFileSync(path.join(f.rawDir, ref.path), 'utf8'));
		doc.scope = 'full_mission';
		f.runs[0].stats.files.papers_window_json = f.write(ref.path, doc);
		saveStats(f);
		assert.throws(() => load(f).verifyCompanions(), /scope mismatch/);
	});

	it('rejects identity mismatches and stale index references', () => {
		const f = fixture();
		f.runs[0].corpus.mission_id = 'wrong';
		repin(f);
		assert.throws(() => load(f), /mission_id mismatch/);
		f.runs[0].corpus.mission_id = f.runs[0].id;
		repin(f);
		f.index.missions[0].files.corpus = { ...f.runs[0].ref, sha256: '0'.repeat(64) };
		f.write('index.json', f.index);
		assert.throws(() => load(f), /index envelope reference disagrees/);
	});

	it('rejects processing failures and unknown statistics schemas', () => {
		const f = fixture();
		f.runs[0].stats.run.processing_failures = [{ short_title: 'Failed', error: 'offline' }];
		saveStats(f);
		assert.throws(() => load(f), /upstream processing failures/);
		f.runs[0].stats.run.processing_failures = [];
		f.runs[0].stats.schema_version = 999;
		saveStats(f);
		assert.throws(() => load(f), /unknown schema_version 999/);
	});

	it('rejects sibling provenance and effective window mismatches independently', () => {
		const f = fixture();
		const m = f.runs[0];
		const ref = m.corpus.files.records_window;
		const doc = JSON.parse(fs.readFileSync(path.join(f.rawDir, ref.path), 'utf8'));
		doc.provenance.input_fingerprint = 'wrong';
		m.corpus.files.records_window = f.write(ref.path, doc);
		repin(f);
		assert.throws(() => load(f).verifyCompanions(), /input_fingerprint mismatch/);
		doc.provenance = m.corpus.provenance;
		doc.window.publication_end_date = '2017-01-01';
		m.corpus.files.records_window = f.write(ref.path, doc);
		repin(f);
		assert.throws(() => load(f).verifyCompanions(), /publication_end_date mismatch/);
		doc.window.publication_end_date = m.stats.missions[0].window_cohort.publication_end_date;
		doc.window.citation_window_years = 9;
		m.corpus.files.records_window = f.write(ref.path, doc);
		repin(f);
		assert.throws(() => load(f).verifyCompanions(), /citation_window_years mismatch/);
	});

	it('rejects reference traversal and symlink escapes', () => {
		const f = fixture();
		const ref = f.runs[0].ref;
		assert.throws(() => readReferencedJson(f.rawDir, { ...ref, path: '../outside.json' }, 'test'), /escapes dataset root/);
		const outside = path.join(root, 'outside.json');
		fs.writeFileSync(outside, '{}');
		fs.symlinkSync(outside, path.join(f.rawDir, 'link.json'));
		assert.throws(() => readReferencedJson(f.rawDir, { ...ref, path: 'link.json' }, 'test'), /escapes dataset root/);
	});
});

describe('dashboard compatibility preflight', () => {

	it('accepts prime windows and arbitrary upstream bin labels, rejecting invalid window dates', () => {
		const f = fixture({ compatible: false });
		assert.doesNotThrow(() => assertDashboardCompatibility(load(f).runs, f.config));
		f.runs[0].stats.missions[0].window_cohort.publication_end_date = '1999-01-01';
		saveStats(f);
		assert.throws(() => assertDashboardCompatibility(load(f).runs, f.config), /increasing publication/);
	});

	it('rejects statistics without a full-mission policy', () => {
		const f = fixture();
		assert.doesNotThrow(() => assertDashboardCompatibility(load(f).runs, f.config));
		delete f.runs[0].stats.run.full_mission_policy;
		saveStats(f);
		assert.throws(() => assertDashboardCompatibility(load(f).runs, f.config), /full_mission_policy is missing/);
	});

	it('rejects invalid full-mission window dates on their own', () => {
		const f = fixture();
		f.runs[0].stats.missions[0].full_mission_cohort.publication_end_date = '1999-01-01';
		saveStats(f);
		// The prime-phase cohort is untouched, so the failure can only come from the full-mission check.
		assert.equal(f.runs[0].stats.missions[0].window_cohort.publication_end_date, '2003-01-01');
		assert.throws(() => assertDashboardCompatibility(load(f).runs, f.config), /full-mission window\): available window requires valid increasing publication/);
	});

	it('--check succeeds on compatible definitions without creating an output directory', () => {
		const f = fixture();
		const out = path.join(root, 'must-not-exist');
		const result = spawnSync(process.execPath, [packager(f), f.rawDir, '--check', '--out', out], { encoding: 'utf8' });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Source check passed: 5 missions/);
		assert.equal(fs.existsSync(out), false);
	});

	it('packages recorded lifecycle dates and preserves unknown mission ends', () => {
		const f = fixture();
		f.runs[0].corpus.mission.prime_mission_end_date = '2001-02-03';
		f.runs[0].corpus.mission.mission_end_date = '2005-06-07';
		repin(f);
		const out = path.join(root, 'lifecycle-output');
		const script = packager(f);
		const result = spawnSync(process.execPath, [script, f.rawDir, '--out', out], { encoding: 'utf8' });
		assert.equal(result.status, 0, result.stdout + result.stderr);
		// the classification input is published byte-for-byte
		assert.deepEqual(fs.readFileSync(path.join(out, 'static/data/paper-kinds.json')), fs.readFileSync(path.join(script, '../../data/paper-kinds.json')));
		const mission = (id) => JSON.parse(fs.readFileSync(path.join(out, 'src/lib/data/generated/missions', `${id}.json`), 'utf8'));
		assert.equal(mission(f.runs[0].id).meta.dates.launch, '2000-01-01');
		assert.equal(mission(f.runs[0].id).meta.dates.primeEnd, '2001-02-03');
		assert.equal(mission(f.runs[0].id).meta.dates.missionEnd, '2005-06-07');
		assert.equal(mission(f.runs[1].id).meta.dates.missionEnd, null);
	});

	it('preflight reports inconsistent mission window totals across divisions together', () => {
		const f = fixture();
		for (const run of f.runs.slice(0, 2)) {
			run.stats.missions[0].window_citations = 1;
			f.write(run.statsPath, run.stats);
		}
		const out = path.join(root, 'bad-window-output');
		const result = spawnSync(process.execPath, [packager(f), f.rawDir, '--check', '--out', out], { encoding: 'utf8' });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /fixture_astro: window timeline has 0 citations, statistics report 1/);
		assert.match(result.stderr, /fixture_bps: window timeline has 0 citations, statistics report 1/);
		assert.equal(fs.existsSync(out), false);
	});

	it('check, ordinary import and refresh fail before altering existing outputs or thumbnails', () => {
		const f = fixture({ compatible: false });
		f.runs[0].stats.summary.lifetime[f.config.divisions[0].name].papers = 1;
		saveStats(f);
		const app = fixtureApp(f, fs.mkdtempSync(path.join(root, 'app-')));
		const sentinels = ['src/lib/data/generated/site.json', 'static/data/papers/old.json', 'static/img/missions/old.webp', 'static/img/missions/manifest.json'];
		for (const relative of sentinels) {
			fs.mkdirSync(path.dirname(path.join(app, relative)), { recursive: true });
			fs.writeFileSync(path.join(app, relative), 'unchanged');
		}
		for (const [script, flags] of [['package-data.mjs', ['--check']], ['package-data.mjs', ['--allow-broken-claims']], ['refresh.mjs', ['--allow-broken-claims']]]) {
			const result = spawnSync(process.execPath, [path.join(app, 'scripts', script), f.rawDir, ...flags], { encoding: 'utf8' });
			assert.equal(result.status, 1, result.stdout + result.stderr);
			assert.match(result.stderr, /packaged distinct papers 0/);
			assert.doesNotMatch(result.stdout, /1\/6\s+thumbnails/);
			for (const relative of sentinels) assert.equal(fs.readFileSync(path.join(app, relative), 'utf8'), 'unchanged');
		}
	});
});
