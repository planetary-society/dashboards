#!/usr/bin/env node
// Mirror the built site from <app>/.site/ into docs/science-mission-impact/.
//
//   node scripts/sync-to-docs.mjs [--dry-run] [--source <dir>] [--target <dir>]
//
// docs/science-mission-impact/ also holds dist/ (gitignored raw data, ~446 MB)
// and reference/. Those are protected: never deleted, never written, never
// descended into. See scripts/lib/sync-core.mjs for the three guards.
//
// --source/--target exist for testing; the defaults are the only real pair.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatSummary, syncToDocs } from './lib/sync-core.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_SOURCE = path.join(APP_DIR, '.site');
export const DEFAULT_TARGET = path.resolve(APP_DIR, '..', 'docs', 'science-mission-impact');

export function parseArgs(argv) {
	const opts = { dryRun: false, source: DEFAULT_SOURCE, target: DEFAULT_TARGET };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--dry-run' || arg === '-n') opts.dryRun = true;
		else if (arg === '--source') opts.source = path.resolve(argv[++i] ?? '');
		else if (arg === '--target') opts.target = path.resolve(argv[++i] ?? '');
		else throw new Error(`unknown argument: ${arg}`);
	}
	return opts;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const result = syncToDocs({
		sourceDir: opts.source,
		targetDir: opts.target,
		dryRun: opts.dryRun
	});
	console.log(formatSummary(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (err) {
		console.error(`sync-to-docs: ${err.message}`);
		process.exit(1);
	}
}
