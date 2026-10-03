/**
 * The story's components have to compile clean, errors and warnings (a11y included), for both
 * the client and the server: the overview is prerendered like every other page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
// Story.svelte reads its props once, on purpose: they are the packaged data, fixed at build time.
const EXPECTED = new Set(['state_referenced_locally']);
const components = (await readdir(here)).filter((name) => name.endsWith('.svelte'));

for (const name of components) {
	for (const generate of ['client', 'server']) {
		test(`${name} compiles clean (${generate})`, async () => {
			const source = await readFile(join(here, name), 'utf8');
			const { warnings } = compile(source, { filename: name, generate, runes: true });
			assert.deepEqual(
				warnings.filter((w) => !EXPECTED.has(w.code)).map((w) => `${w.code}: ${w.message}`),
				[]
			);
		});
	}
}
