import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';

// adapter-static empties its target directory, and docs/science-mission-impact/
// also holds the gitignored raw data (dist/). So the adapter writes to a local
// folder and scripts/sync-to-docs.mjs copies the result across.
// The folder is not called build/ or dist/ because the root .gitignore ignores those
// names at any depth, which hides problems instead of surfacing them.
const OUT_DIR = '.site';

// SvelteKit stamps every build with a version, by default the current time, which would make
// each rebuild differ byte for byte. The data snapshot date plus a hash of the sources keeps an
// unchanged input reproducible, while a code-only redeploy still tells open tabs to reload
// rather than fetch chunks that no longer exist. Dotfiles (.DS_Store) are skipped so a local
// build matches CI's.
const APP_DIR = fileURLToPath(new URL('.', import.meta.url));
const { asOf } = JSON.parse(readFileSync(join(APP_DIR, 'src/lib/data/generated/site.json'), 'utf8'));
const sources = readdirSync(join(APP_DIR, 'src'), { recursive: true, withFileTypes: true })
	.filter((f) => f.isFile())
	.map((f) => relative(APP_DIR, join(f.parentPath, f.name)).split(sep).join('/'))
	.filter((file) => !file.split('/').some((part) => part.startsWith('.')))
	.concat('smi.config.json')
	.sort();
const hash = createHash('sha256');
for (const file of sources) hash.update(`${file}\0`).update(readFileSync(join(APP_DIR, file))).update('\0');
const version = `${asOf}-${hash.digest('hex').slice(0, 8)}`;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ pages: OUT_DIR, assets: OUT_DIR, strict: true }),
		paths: {
			base: process.argv.includes('dev') ? '' : '/science-mission-impact',
			relative: false
		},
		version: { name: version },
		prerender: { handleHttpError: 'fail', handleMissingId: 'fail' }
	}
};

export default config;
