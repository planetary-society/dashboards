import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexValue } from './measures.js';
import { FOOTNOTES } from './footnotes.js';

// The prerender fails on a link to a missing id; this catches it without a build.
test('every footnote links to a section the Methods page has, or to its top', async () => {
	const page = await readFile(new URL('../../routes/methods/+page.svelte', import.meta.url), 'utf8');
	const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
	for (const [key, note] of Object.entries(FOOTNOTES)) assert.ok(note.anchor === '' || ids.has(note.anchor), `${key} → #${note.anchor}`);
});

test('the index formatter keeps h whole and m to one decimal', () => {
	assert.equal(indexValue('h', 127), '127');
	assert.equal(indexValue('m', 4.704), '4.7');
	assert.equal(indexValue('m', null), '—');
});
