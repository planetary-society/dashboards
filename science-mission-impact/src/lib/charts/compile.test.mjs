/**
 * The chart components have to compile clean — errors and warnings, a11y included —
 * for both the client and the server (every page here is prerendered).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const components = ['AccumulationPair.svelte', 'LifetimeTimeline.svelte', 'CostCurve.svelte', 'DollarMinorTicks.svelte', 'IndexScatter.svelte', 'PublicationScatter.svelte', 'RankHistogram.svelte', 'TimeToScience.svelte', '../scrolly/Squares.svelte', '../ui/ComparisonControls.svelte', '../ui/Footnote.svelte', '../ui/MissionTable.svelte', '../ui/Num.svelte', '../ui/Nav.svelte', '../ui/Choice.svelte', '../ui/ViewSentence.svelte', '../mission/PaperBrowser.svelte', '../mission/QueryBlock.svelte', '../mission/CurationLists.svelte', '../../routes/[division]/+page.svelte', '../../routes/[division]/[mission]/+page.svelte', '../../routes/+error.svelte'];

for (const name of components) {
	for (const generate of ['client', 'server']) {
		test(`${name} compiles clean (${generate})`, async () => {
			const source = await readFile(join(here, name), 'utf8');
			const { warnings } = compile(source, { filename: name, generate, runes: true });
			assert.deepEqual(
				warnings.map((w) => `${w.code}: ${w.message}`),
				[]
			);
		});
	}
}
