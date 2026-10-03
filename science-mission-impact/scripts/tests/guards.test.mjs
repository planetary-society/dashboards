import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { tierBounds, validateConfig } from '../lib/config.mjs';
import { buildTitleIndex, resolveRunMissions } from '../lib/join.mjs';
import {
	assertDivisionTotals,
	assertMissionPaperRows,
	assertSchemaVersion,
	assertSingleAsOfDate,
	citationGap,
	Warnings
} from '../lib/invariants.mjs';

const config = {
	rawDirDefault: '../raw',
	schemaVersions: { mission: 3, stats: 7 },
	divisions: [{ slug: 'alpha', name: 'Alpha', nav: 'A', statsLabel: 'us_alpha' }],
	thresholdCost: 150,
	clps: { rawDir: '../latest', comparators: ['lcross'], horizonMonths: 36 },
	paperKinds: { file: 'data/paper-kinds.json', examples: ['raincube'], smallMax: 10 },
	rankingMinPapers: 50,
	topPercents: [10, 1],
	tierPercents: [0.1, 1, 5, 10, 25, 50]
};

describe('validateConfig', () => {
	it('accepts a well-formed config and exposes its ordering', () => {
		assert.equal(validateConfig(config), config);
		assert.deepEqual(tierBounds(config), [0.1, 1, 5, 10, 25, 50, 100]);
	});

	it('requires a positive thresholdCost and a complete clps block', () => {
		for (const thresholdCost of [0, -5, undefined, NaN]) {
			assert.throws(() => validateConfig({ ...config, thresholdCost }), /thresholdCost/);
		}
		const clps = (o) => ({ ...config, clps: { ...config.clps, ...o } });
		assert.throws(() => validateConfig({ ...config, clps: undefined }), /clps.rawDir/);
		assert.throws(() => validateConfig(clps({ rawDir: '' })), /clps.rawDir/);
		assert.throws(() => validateConfig(clps({ comparators: 'lcross' })), /clps.comparators/);
		assert.throws(() => validateConfig(clps({ comparators: ['lcross', ''] })), /clps.comparators/);
		for (const horizonMonths of [0, 2.5, undefined]) {
			assert.throws(() => validateConfig(clps({ horizonMonths })), /clps.horizonMonths/);
		}
	});

	it('requires a paperKinds file and non-empty examples', () => {
		const kinds = (o) => ({ ...config, paperKinds: { ...config.paperKinds, ...o } });
		assert.throws(() => validateConfig({ ...config, paperKinds: undefined }), /paperKinds.file/);
		assert.throws(() => validateConfig(kinds({ file: '' })), /paperKinds.file/);
		for (const examples of [[], 'raincube', ['raincube', ''], undefined]) {
			assert.throws(() => validateConfig(kinds({ examples })), /paperKinds.examples/);
		}
		for (const smallMax of [0, 2.5, '10', undefined]) {
			assert.throws(() => validateConfig(kinds({ smallMax })), /paperKinds.smallMax/);
		}
	});

	it('rejects duplicate division slugs and unsorted tiers', () => {
		assert.throws(
			() =>
				validateConfig({
					...config,
					divisions: [...config.divisions, { ...config.divisions[0], statsLabel: 'other' }]
				}),
			/duplicate division slug/
		);
		assert.throws(() => validateConfig({ ...config, tierPercents: [5, 1] }), /ascending/);
	});

});

describe('join', () => {
	const indexJson = {
		missions: [
			{ mission_id: 'cassini', short_title: 'Cassini' },
			{ mission_id: 'trace', short_title: 'TRACE' }
		]
	};

	it('maps short_title to mission_id', () => {
		const byTitle = buildTitleIndex(indexJson);
		const resolved = resolveRunMissions('us_alpha', [{ short_title: 'TRACE' }], byTitle);
		assert.equal(resolved[0].id, 'trace');
	});

	it('refuses an ambiguous short_title', () => {
		assert.throws(
			() =>
				buildTitleIndex({
					missions: [
						{ mission_id: 'a', short_title: 'Same' },
						{ mission_id: 'b', short_title: 'Same' }
					]
				}),
			/ambiguous/
		);
	});

	it('names the run and the title when a stats mission does not resolve', () => {
		const byTitle = buildTitleIndex(indexJson);
		assert.throws(
			() => resolveRunMissions('us_alpha', [{ short_title: 'Ghost' }], byTitle),
			/us_alpha.*Ghost.*does not resolve/
		);
	});
});

describe('invariants', () => {
	it('rejects an unknown schema_version', () => {
		assert.doesNotThrow(() => assertSchemaVersion('stats', 7, 7));
		assert.throws(() => assertSchemaVersion('stats', 8, 7), /unknown schema_version 8/);
	});

	it('rejects runs taken from different snapshots', () => {
		assert.equal(
			assertSingleAsOfDate([
				{ label: 'a', asOfDate: '2026-09-18' },
				{ label: 'b', asOfDate: '2026-09-18' }
			]),
			'2026-09-18'
		);
		assert.throws(
			() =>
				assertSingleAsOfDate([
					{ label: 'a', asOfDate: '2026-09-18' },
					{ label: 'b', asOfDate: '2026-09-17' }
				]),
			/disagree on as_of_date/
		);
	});

	it('checks packaged division totals against the run summary', () => {
		const summary = { papers: 16169, citations_total: 569782 };
		assert.doesNotThrow(() =>
			assertDivisionTotals({
				slug: 'planetary',
				packagedPapers: 16169,
				packagedCitations: 569782,
				summary
			})
		);
		assert.throws(
			() =>
				assertDivisionTotals({
					slug: 'planetary',
					packagedPapers: 16168,
					packagedCitations: 569782,
					summary
				}),
			/packaged distinct papers 16168/
		);
	});

	it('checks a mission paper-row count, and that null means no rows', () => {
		assert.doesNotThrow(() =>
			assertMissionPaperRows({ id: 'cassini', shortTitle: 'Cassini', rows: 3399, lifetimePapers: 3399 })
		);
		assert.throws(
			() => assertMissionPaperRows({ id: 'cassini', shortTitle: 'Cassini', rows: 3, lifetimePapers: 3399 }),
			/holds 3 rows/
		);
		assert.doesNotThrow(() =>
			assertMissionPaperRows({ id: 'mirata', shortTitle: 'MiRaTA', rows: 0, lifetimePapers: null })
		);
		assert.throws(
			() => assertMissionPaperRows({ id: 'mirata', shortTitle: 'MiRaTA', rows: 2, lifetimePapers: null }),
			/unavailable/
		);
	});

	it('reports the citation gap rather than throwing', () => {
		assert.deepEqual(citationGap({ edges: 99, citationsTotal: 100 }), {
			edges: 99,
			citationsTotal: 100,
			relative: -0.01
		});
		assert.equal(citationGap({ edges: 0, citationsTotal: 0 }).relative, null);
	});

	it('collects warnings without throwing', () => {
		const warnings = new Warnings();
		warnings.add('dirty working tree');
		assert.equal(warnings.length, 1);
		assert.deepEqual(warnings.items, ['dirty working tree']);
	});
});
