#!/usr/bin/env node
// Fetch one 192x192 greyscale webp tile per mission into static/img/missions/.
//
//   node scripts/fetch-thumbs.mjs [rawDir] [--force]
//
// rawDir also comes from $SMI_RAW_DIR; the default is smi.config.json's
// rawDirDefault resolved against the app directory.
//
// Network failures are never fatal: they are recorded in manifest.json and
// summarised on stderr, and the process still exits 0 so a refresh pipeline
// keeps going with flat tiles for the misses. Setup failures (missing raw dir,
// malformed stats) exit 1.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, resolveRawDir } from './lib/config.mjs';
import { failuresByHost, loadMissionScope, runThumbs } from './lib/thumbs-core.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
	const opts = { force: false, rawDir: null };
	for (const arg of argv) {
		if (arg === '--force') opts.force = true;
		else if (arg.startsWith('--')) throw new Error(`unknown flag: ${arg}`);
		else if (opts.rawDir === null) opts.rawDir = arg;
		else throw new Error(`unexpected argument: ${arg}`);
	}
	return opts;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const config = loadConfig(APP_DIR);
	const rawDir = resolveRawDir({ cliArg: opts.rawDir, env: process.env, config, appDir: APP_DIR });
	const outDir = path.join(APP_DIR, 'static', 'img', 'missions');

	console.log(`raw dir: ${rawDir}`);
	console.log(`out dir: ${outDir}`);

	// Node's built-in fetch ignores HTTPS_PROXY unless asked. Behind a proxy
	// without this, every host looks like ENOTFOUND, which is a confusing way
	// to learn you are not actually offline.
	if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
		console.warn('WARNING: HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not.');
		console.warn('         Re-run as: NODE_USE_ENV_PROXY=1 node scripts/fetch-thumbs.mjs');
	}

	const { missions, unmatched } = loadMissionScope({ rawDir, config });
	if (unmatched.length) {
		// A short_title in a stats run with no index.json entry means the two
		// inputs disagree — loud, but not a reason to skip the other tiles.
		console.warn(`WARNING: ${unmatched.length} short_title(s) not in index.json: ${unmatched.join(', ')}`);
	}
	console.log(`missions in scope: ${missions.length}${opts.force ? ' (--force)' : ''}`);

	const t0 = Date.now();
	const summary = await runThumbs({
		missions,
		outDir,
		force: opts.force,
		log: (m) => console.log(m)
	});

	console.log('');
	console.log(
		`ok ${summary.ok} (fetched ${summary.fetched}, cached ${summary.cached})  ` +
			`failed ${summary.failed}  none ${summary.none}  removed ${summary.removed.length}`
	);
	console.log(`tile bytes: ${summary.totalBytes} (${(summary.totalBytes / 1024).toFixed(1)} KiB)`);
	console.log(`manifest:   ${summary.manifestFile}`);
	if (summary.removed.length) console.log(`removed:    ${summary.removed.join(', ')}`);

	if (summary.failures.length) {
		console.error('');
		console.error(`${summary.failures.length} failure(s), by host:`);
		for (const [host, list] of failuresByHost(summary.failures)) {
			console.error(`  ${host}  (${list.length})`);
			for (const f of list) console.error(`    ${f.mission_id}: ${f.error}`);
		}
	}
	process.exitCode = 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(`fetch-thumbs: ${err.message}`);
		process.exit(1);
	});
}
