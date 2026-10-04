import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import { loadConfig, resolveRawDir } from '../lib/config.mjs';
import * as fetchThumbs from '../fetch-thumbs.mjs';
import { parseArgs as parsePackageArgs } from '../package-data.mjs';
import { parseArgs, pipelineTestFiles, summaryLines, testFiles } from '../refresh.mjs';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'smi-pipeline-'));
after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }));

const config = { rawDirDefault: '../docs/science-mission-impact/dist' };
const appDir = '/app';

describe('resolveRawDir', () => {
	it('prefers an explicit directory', () => {
		assert.equal(
			resolveRawDir({ cliArg: '/elsewhere/dist', env: { SMI_RAW_DIR: '/from/env' }, config, appDir }),
			'/elsewhere/dist',
		);
	});

	it('falls back to $SMI_RAW_DIR, then to the configured default', () => {
		assert.equal(
			resolveRawDir({
				cliArg: null,
				env: { SMI_RAW_DIR: '/from/env' },
				config,
				appDir,
			}),
			'/from/env',
		);
		assert.equal(
			resolveRawDir({ cliArg: null, env: {}, config, appDir }),
			path.resolve('/docs/science-mission-impact/dist'),
		);
	});

	it('treats an empty string as "not given" — the Justfile passes SMI_RAW_DIR=""', () => {
		const fallback = path.resolve('/docs/science-mission-impact/dist');
		assert.equal(resolveRawDir({ cliArg: '', env: { SMI_RAW_DIR: '' }, config, appDir }), fallback);
		assert.equal(
			resolveRawDir({ cliArg: null, env: { SMI_RAW_DIR: '' }, config, appDir }),
			fallback,
		);
		// The failure this guards against: resolving to the app directory itself.
		assert.notEqual(
			resolveRawDir({ cliArg: '', env: { SMI_RAW_DIR: '' }, config, appDir }),
			appDir,
		);
	});

	it('is not re-implemented in fetch-thumbs.mjs', () => {
		// Both entry points import lib/config.mjs directly; a pass-through wrapper
		// here is what let the two rules drift apart in the first place.
		assert.equal('resolveRawDir' in fetchThumbs, false);
	});
});

describe('loadConfig', () => {
	it('reads and validates the app\'s own smi.config.json', () => {
		const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
		const loaded = loadConfig(appRoot);
		assert.ok(Array.isArray(loaded.divisions) && loaded.divisions.length > 0);
		assert.equal('costClasses' in loaded, false);
		assert.equal('smallestClass' in loaded, false);
		assert.equal(loaded.rawDirDefault, '../../science-mission-citations/dist/fixed');
		assert.deepEqual(loaded.divisions.map((d) => d.statsLabel), ['astro', 'bps', 'earth', 'helio', 'psd']);
		assert.deepEqual(loaded.schemaVersions, { mission: 5, stats: 11 });
	});

	it('fails loudly on a config that is not there', () => {
		assert.throws(() => loadConfig(path.join(TMP_ROOT, 'nowhere')), /ENOENT/);
	});
});

describe('package-data argument parsing', () => {
	it('takes a positional raw dir and the two flags', () => {
		assert.deepEqual(parsePackageArgs([]), {
			rawDir: null,
			outDir: null,
			allowBrokenClaims: false,
			check: false,
		});
		assert.deepEqual(parsePackageArgs(['/raw', '--allow-broken-claims', '--out', '/tmp/out']), {
			rawDir: '/raw',
			outDir: '/tmp/out',
			allowBrokenClaims: true,
			check: false,
		});
		assert.equal(parsePackageArgs(['--out=/tmp/o']).outDir, '/tmp/o');
		assert.equal(parsePackageArgs(['--check']).check, true);
	});

	it('rejects nonsense rather than silently packaging the wrong thing', () => {
		assert.throws(() => parsePackageArgs(['--nope']), /unknown flag/);
		assert.throws(() => parsePackageArgs(['a', 'b']), /unexpected argument/);
	});
});

describe('refresh argument parsing', () => {
	it('defaults to the full pipeline', () => {
		assert.deepEqual(parseArgs([]), {
			rawDir: null,
			allowBrokenClaims: false,
			skipThumbs: false,
			skipBuild: false,
		});
	});

	it('reads every flag and a positional raw dir', () => {
		const opts = parseArgs(['/raw', '--skip-thumbs', '--skip-build', '--allow-broken-claims']);
		assert.equal(opts.rawDir, '/raw');
		assert.equal(opts.skipThumbs, true);
		assert.equal(opts.skipBuild, true);
		assert.equal(opts.allowBrokenClaims, true);
	});

	it('ignores the empty raw dir `just smi-refresh` passes with no argument', () => {
		assert.equal(parseArgs(['']).rawDir, null);
		assert.equal(parseArgs(['', '--skip-build']).skipBuild, true);
	});

	it('rejects unknown flags', () => {
		assert.throws(() => parseArgs(['--skip-everything']), /unknown flag/);
	});
});

describe('testFiles', () => {
	it('finds the test files, sorted, and nothing else', () => {
		const dir = path.join(TMP_ROOT, 'tests');
		fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
		for (const name of ['b.test.mjs', 'a.test.mjs', 'helper.mjs', 'notes.md']) {
			fs.writeFileSync(path.join(dir, name), '');
		}
		fs.writeFileSync(path.join(dir, 'nested', 'c.test.mjs'), '');
		assert.deepEqual(testFiles(dir), [path.join(dir, 'a.test.mjs'), path.join(dir, 'b.test.mjs')]);
	});

	it('walks subdirectories when asked', () => {
		const dir = path.join(TMP_ROOT, 'tests');
		assert.deepEqual(testFiles(dir, { recursive: true }), [
			path.join(dir, 'a.test.mjs'),
			path.join(dir, 'b.test.mjs'),
			path.join(dir, 'nested', 'c.test.mjs'),
		]);
	});

	it('finds the suite it is part of', () => {
		const found = testFiles(path.dirname(new URL(import.meta.url).pathname));
		assert.ok(found.length >= 8);
		assert.ok(found.every((f) => f.endsWith('.test.mjs')));
	});
});

describe('pipelineTestFiles', () => {
	const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

	it('is exactly what `npm test` globs, discovered rather than listed', () => {
		const found = pipelineTestFiles(appRoot);
		const npmTest = JSON.parse(
			fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
		).scripts.test;
		// Quoted, so Node expands the globs itself (recursively) whatever the shell.
		assert.equal(npmTest, 'node --test "scripts/tests/*.test.mjs" "src/lib/**/*.test.mjs"');

		// The two halves of that glob, expanded by hand from the same tree.
		const expected = [
			...fs
				.readdirSync(path.join(appRoot, 'scripts', 'tests'))
				.filter((f) => f.endsWith('.test.mjs'))
				.map((f) => path.join(appRoot, 'scripts', 'tests', f)),
			...fs
				.readdirSync(path.join(appRoot, 'src', 'lib'), { recursive: true })
				.filter((f) => String(f).endsWith('.test.mjs'))
				.map((f) => path.join(appRoot, 'src', 'lib', String(f))),
		].sort();
		assert.deepEqual([...found].sort(), expected);
	});

	it('includes this very file, so the pipeline can never skip the pipeline tests', () => {
		assert.ok(pipelineTestFiles(appRoot).includes(new URL(import.meta.url).pathname));
	});
});

describe('summaryLines', () => {
	const site = {
		asOf: '2026-09-18',
		fetchedMin: '2026-09-16',
		fetchedMax: '2026-09-18',
		missions: 132,
		papersDistinct: 134281,
		citationsDistinct: 5696469,
		divisions: [1, 2, 3, 4, 5],
		claims: [{ holds: true }, { holds: true }],
	};
	const manifest = {
		a: { status: 'ok' },
		b: { status: 'failed' },
		c: { status: 'none' },
		d: { status: 'ok' },
	};

	it('is exactly five lines', () => {
		assert.equal(summaryLines({ site, manifest, skipped: [] }).length, 5);
	});

	it('reads the snapshot, totals, claims and tiles', () => {
		const lines = summaryLines({ site, manifest, skipped: [] });
		assert.match(lines[0], /snapshot 2026-09-18/);
		assert.match(lines[1], /132 missions · 5 divisions · 134,281 distinct papers/);
		assert.match(lines[2], /packaging checks passed/);
		assert.match(lines[3], /ok 2 · failed 1 · no image 1/);
		assert.equal(lines[4], 'all stages ran');
	});

	it('names broken claims and skipped stages', () => {
		const lines = summaryLines({
			site: { ...site, claims: [{ holds: true }, { holds: false, id: 'lag' }] },
			manifest,
			skipped: ['vite build', 'sync to docs'],
		});
		assert.match(lines[2], /packaging checks passed/);
		assert.equal(lines[4], 'skipped: vite build, sync to docs');
	});

	it('survives a missing site.json or manifest', () => {
		const lines = summaryLines({ site: null, manifest: null, skipped: [] });
		assert.equal(lines.length, 5);
		assert.match(lines[0], /snapshot —/);
		assert.match(lines[3], /ok 0 · failed 0 · no image 0/);
	});
});
