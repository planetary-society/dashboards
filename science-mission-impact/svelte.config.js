import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';

// adapter-static empties its target directory, and docs/science-mission-impact/
// also holds the gitignored raw data (dist/). So the adapter writes to a local
// folder and scripts/sync-to-docs.mjs copies the result across.
// The folder is not called build/ or dist/ because the root .gitignore ignores those
// names at any depth, which hides problems instead of surfacing them.
const OUT_DIR = '.site';

// SvelteKit stamps every build with a version, by default the current time, which would make
// each rebuild differ byte for byte. The data snapshot date keeps an unchanged input reproducible.
const { asOf } = JSON.parse(readFileSync(new URL('./src/lib/data/generated/site.json', import.meta.url), 'utf8'));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ pages: OUT_DIR, assets: OUT_DIR, strict: true }),
		paths: {
			base: process.argv.includes('dev') ? '' : '/science-mission-impact',
			relative: false
		},
		version: { name: asOf },
		prerender: { handleHttpError: 'fail', handleMissingId: 'fail' }
	}
};

export default config;
