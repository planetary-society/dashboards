import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Story.svelte numbers its steps by hand (TITLE = 0 … CLOSE), and every gate, mount and layout reads
// those constants. Each step's section is preceded by a comment naming it, so a moved, added or dropped
// step that leaves the constants behind fails here instead of silently showing the wrong graphic.
test('Story step constants match the order of the named step sections', async () => {
	const source = await readFile(new URL('./Story.svelte', import.meta.url), 'utf8');
	const constants = new Map();
	for (const [, list] of source.matchAll(/^\tconst ((?:[A-Z_]+ = \d+(?:, )?)+);$/gm)) {
		for (const [, name, value] of list.matchAll(/([A-Z_]+) = (\d+)/g)) constants.set(name, Number(value));
	}
	// the comment opening each step's block names it: "<!-- NAME: …" or "<!-- NAME …" directly before a data-step section
	const steps = [...source.matchAll(/<!-- ([A-Z_]+)\b[^>]*?-->\s*<section[^>]*\bdata-step\b/g)].map((m) => m[1]);
	assert.ok(steps.length > 0, 'no named steps found');
	assert.deepEqual(steps, [...steps].sort((a, b) => constants.get(a) - constants.get(b)), 'steps out of constant order');
	steps.forEach((name, i) => assert.equal(constants.get(name), i, `${name} is step ${i} but its constant is ${constants.get(name)}`));
	assert.equal(steps.length, Math.max(...constants.values()) + 1, 'a constant has no step');
});
