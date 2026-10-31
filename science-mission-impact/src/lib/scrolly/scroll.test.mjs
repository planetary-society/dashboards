import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'svelte/compiler';

test('Scroller measures all steps before applying overflow, preserving the phone and full-bleed limits', async () => {
	const source = await readFile(new URL('./Scroller.svelte', import.meta.url), 'utf8');
	const script = parse(source).instance.content.body;
	const mount = script.find((node) => node.expression?.callee?.name === 'onMount').expression.arguments[0];
	const fit = mount.body.body.flatMap((node) => node.declarations ?? []).find((node) => node.id.name === 'fit').init;
	const calls = [];
	const heights = [null, 336, 337, 345, 346];
	const els = heights.map((height, i) => ({
		overflows: true,
		firstElementChild: height == null ? null : {
			get offsetHeight() {
				calls.push('read');
				return heights[i];
			},
			style: { setProperty(name, value) { calls.push('write'); els[i].h = [name, value]; } }
		},
		hasAttribute: () => i >= 3,
		classList: {
			remove() { calls.push('remove'); els[i].overflows = false; },
			add() { calls.push('add'); els[i].overflows = true; }
		}
	}));
	const viewport = { innerHeight: 844 };
	const run = new Function('els', 'window', 'getComputedStyle', `return (${source.slice(fit.start, fit.end)});`)(
		els, viewport, () => ({ top: '500px' })
	);

	run();
	assert.deepEqual(els.map((el) => el.overflows), [false, false, true, false, true]);
	assert.ok(calls.lastIndexOf('remove') < calls.indexOf('read'), 'all old overflow classes are cleared before measuring');
	assert.ok(calls.lastIndexOf('read') < calls.indexOf('add'), 'every step is measured before a class is added');
	assert.ok(calls.lastIndexOf('read') < calls.indexOf('write'), 'every height is read before any is written');
	assert.deepEqual(els[1].h, ['--h', '336px'], 'each text publishes its height for the phone centring');

	viewport.innerHeight = 900;
	calls.length = 0;
	run();
	assert.ok(els.every((el) => !el.overflows), 'a larger viewport clears previously overflowing steps');
	assert.ok(!calls.includes('add'), 'text that fits keeps its sticky hold');
});
