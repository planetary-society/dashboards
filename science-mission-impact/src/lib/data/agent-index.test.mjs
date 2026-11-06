import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentIndex } from './agent-index.js';

test('agent index links the actual snapshot, exports and both division scopes without restating findings', () => {
	const site = { asOf: '2026-11-03', divisions: [{ slug: 'planetary', name: 'Planetary Science' }] };
	const root = 'https://example.test/science-mission-impact/';
	const text = agentIndex(site, root);
	assert.ok(text.startsWith('# Science Mission Impact\n'));
	assert.ok(text.includes(site.asOf));
	for (const path of ['analysis/', 'methods/', 'download/', 'data/exports/manifest.json', 'data/exports/dictionary.json', 'planetary/', 'planetary/lifetime/']) {
		assert.ok(text.includes(`(${root}${path})`), path);
	}
	assert.match(text, /missing values differ from zero/);
	assert.equal(agentIndex(site, root), text);
});
