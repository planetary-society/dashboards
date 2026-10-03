#!/usr/bin/env node
/**
 * refresh.mjs -- the whole pipeline behind `npm run refresh` / `just smi-refresh`.
 *
 *   node scripts/refresh.mjs [rawDir] [--allow-broken-claims] [--skip-thumbs] [--skip-build]
 *   SMI_RAW_DIR=... node scripts/refresh.mjs
 *
 * Before any stage, run read-only source/compatibility preflight.
 * Stages, in order:
 *   1 thumbnails   cached; network failures are never fatal (flat tiles instead)
 *   2 package      raw dist/ -> generated JSON + refresh-report.md
 *   3 tests        the packaging unit tests
 *   4 preview      the social card, drawn from the packaged data
 *   5 build        vite build -> .site/
 *   6 sync         .site/ -> ../docs/science-mission-impact/
 *
 * Thumbnails run before packaging because `hasThumb` is read from disk. The run
 * stops at the first failing stage with a banner naming it, and exits non-zero.
 *
 * --skip-build skips the sync too: there is nothing new to mirror.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { int } from './lib/util.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(APP_DIR, 'scripts');
const REPORT = path.join(APP_DIR, 'src', 'lib', 'data', 'generated', 'refresh-report.md');
const SITE_JSON = path.join(APP_DIR, 'src', 'lib', 'data', 'generated', 'site.json');
const MANIFEST = path.join(APP_DIR, 'static', 'img', 'missions', 'manifest.json');
const VITE = path.join(APP_DIR, 'node_modules', '.bin', 'vite');

const RULE = '─'.repeat(72);

export function parseArgs(argv) {
	const opts = {
		rawDir: null,
		allowBrokenClaims: false,
		skipThumbs: false,
		skipBuild: false,
	};
	for (const arg of argv) {
		if (arg === '--allow-broken-claims') opts.allowBrokenClaims = true;
		else if (arg === '--skip-thumbs') opts.skipThumbs = true;
		else if (arg === '--skip-build') opts.skipBuild = true;
		else if (arg.startsWith('--')) throw new Error(`unknown flag: ${arg}`);
		else if (opts.rawDir === null && arg !== '') opts.rawDir = arg;
		else if (arg !== '') throw new Error(`unexpected argument: ${arg}`);
	}
	return opts;
}

/**
 * The test files under `dir`, expanded here because `node --test` wants real
 * paths. `recursive` walks subdirectories; without it only `dir` itself is read.
 * Sorted, so a run is reproducible.
 */
export function testFiles(dir, { recursive = false } = {}) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (recursive && entry.name !== 'node_modules') out.push(...testFiles(full, { recursive }));
		} else if (entry.name.endsWith('.test.mjs')) {
			out.push(full);
		}
	}
	return out.sort();
}

/**
 * Exactly what `npm test` runs: `scripts/tests/*.test.mjs src/lib/**\/*.test.mjs`.
 * Discovered rather than listed, so a new test directory under src/lib cannot
 * be picked up by `npm test` and quietly skipped by the pipeline.
 */
export function pipelineTestFiles(appDir = APP_DIR) {
	return [
		...testFiles(path.join(appDir, 'scripts', 'tests')),
		...testFiles(path.join(appDir, 'src', 'lib'), { recursive: true }),
	];
}

function banner(lines) {
	console.error('');
	console.error(RULE);
	for (const line of lines) console.error(`  ${line}`);
	console.error(RULE);
	console.error('');
}

/** Run one stage as a child with inherited stdio. Returns its exit code. */
function run(stage, { command = process.execPath, args, env }) {
	console.log('');
	console.log(`${RULE}\n  ${stage.n}/${stage.total}  ${stage.title}\n${RULE}`);
	const result = spawnSync(command, args, {
		cwd: APP_DIR,
		stdio: 'inherit',
		env: { ...process.env, ...env },
	});
	if (result.error) {
		banner([`refresh failed at stage ${stage.n}: ${stage.title}`, `${result.error.message}`]);
		process.exit(1);
	}
	if (result.signal) {
		banner([`refresh failed at stage ${stage.n}: ${stage.title}`, `killed by ${result.signal}`]);
		process.exit(1);
	}
	return result.status ?? 1;
}

/** Run a stage and stop the pipeline if it fails. */
function runOrStop(stage, spec, hint) {
	const code = run(stage, spec);
	if (code !== 0) {
		banner([
			`refresh failed at stage ${stage.n}: ${stage.title}`,
			`exit code ${code}`,
			...(hint ? ['', hint] : []),
		]);
		process.exit(code);
	}
}

const readJson = (file) => {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
};

/** The five lines an operator reads before opening the report. */
export function summaryLines({ site, manifest, skipped }) {
	const statuses = Object.values(manifest ?? {});
	const count = (s) => statuses.filter((e) => e?.status === s).length;
	return [
		`snapshot ${site?.asOf ?? '—'} · fetched ${site?.fetchedMin ?? '—'} → ${site?.fetchedMax ?? '—'}`,
		`${int(site?.missions)} missions · ${site?.divisions?.length ?? 0} divisions · ` +
			`${int(site?.papersDistinct)} distinct papers · ${int(site?.citationsDistinct)} citations`,
		'source and packaging checks passed before replacement',
		`thumbnails: ok ${count('ok')} · failed ${count('failed')} · no image ${count('none')}`,
		skipped.length ? `skipped: ${skipped.join(', ')}` : 'all stages ran',
	];
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const rawArg = opts.rawDir ? [opts.rawDir] : [];
	const skipped = [];
	runOrStop(
		{ n: 0, total: 6, title: 'source preflight (read-only)' },
		{ args: [path.join(SCRIPTS, 'package-data.mjs'), ...rawArg, '--check'] },
		'Preflight stopped the refresh before thumbnail or dashboard output changes.'
	);

	const planned = [
		'thumbnails',
		'package data',
		'tests',
		'preview image',
		'vite build',
		'sync to docs',
	];
	const total = planned.length;
	const stage = (n) => ({ n, total, title: planned[n - 1] });

	// 1 — thumbnails. Never fatal: a blocked CDN must not stop a data refresh.
	if (opts.skipThumbs) {
		console.log('skipping stage 1 (thumbnails) — tiles already on disk are reused');
		skipped.push('thumbnails');
	} else {
		const code = run(stage(1), {
			args: [path.join(SCRIPTS, 'fetch-thumbs.mjs'), ...rawArg],
			// Node's fetch ignores HTTPS_PROXY unless told; without this every host
			// looks like ENOTFOUND behind a proxy.
			env: { NODE_USE_ENV_PROXY: '1' },
		});
		if (code !== 0) {
			console.warn(
				`\nWARNING: thumbnails exited ${code}. Continuing — missions without a tile ` +
					'render as flat squares.',
			);
		}
	}

	// 2 — package. Thumbnails first: hasThumb is read from disk.
	runOrStop(
		stage(2),
		{
			args: [
				path.join(SCRIPTS, 'package-data.mjs'),
				...rawArg,
				...(opts.allowBrokenClaims ? ['--allow-broken-claims'] : []),
			],
		},
		'For completed packaging, review ' + path.relative(APP_DIR, REPORT) + '; source failures leave the previous report unchanged.',
	);

	// 3 — tests.
	runOrStop(stage(3), { args: ['--test', ...pipelineTestFiles()] });

	// 4 — preview image, drawn from the data packaged a moment ago.
	runOrStop(stage(4), { args: [path.join(SCRIPTS, 'make-preview.mjs')] });

	// 5/6 — build and mirror. Skipping the build skips the sync: nothing new.
	if (opts.skipBuild) {
		console.log('\nskipping stages 5-6 (vite build, sync to docs) — docs/ left untouched');
		skipped.push('vite build', 'sync to docs');
	} else {
		if (!existsSync(VITE)) {
			banner([
				`refresh failed at stage 5: ${planned[4]}`,
				`vite not found at ${path.relative(APP_DIR, VITE)}`,
				'',
				'Run `npm ci` in science-mission-impact/ first.',
			]);
			process.exit(1);
		}
		runOrStop(stage(5), { args: [VITE, 'build'] });
		runOrStop(stage(6), { args: [path.join(SCRIPTS, 'sync-to-docs.mjs')] });
	}

	// 7 — what to read next.
	const lines = summaryLines({
		site: readJson(SITE_JSON),
		manifest: readJson(MANIFEST),
		skipped,
	});
	console.log('');
	console.log(RULE);
	console.log(`  refresh complete · report: ${REPORT}`);
	console.log(RULE);
	for (const line of lines) console.log(`  ${line}`);
	console.log('');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (err) {
		banner(['refresh failed before any stage ran', err.message]);
		process.exit(1);
	}
}
