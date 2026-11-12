import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from 'svelte/compiler';
import { readFile } from 'node:fs/promises';
import { exportCatalog, buildExport } from './export-files.js';
import { dataDictionary } from './dictionary.js';
import { allMissionsCsv, clpsCsv, missionsCsv, publicationsCsv, toCsv } from '../mission/papers.js';

const paper = { columns: { bibcode: ['2001Test....1....1A'], doi: ['10.1000/test'], year: [2001], pubdate: ['2001-01-00'], title: ['A "quoted, café" title'], first_author: ['Test, A.'], citations: [12], shared_by: [2], full_window_citations: [3], top10_weight_full: [0.25], top1_weight_full: [null], curated: [0] } };
const mission = (id, papers = 1) => ({ id, shortTitle: id.toUpperCase(), name: `Mission ${id}`, lcc: 10, cost: 15, status: 'Completed', full: { papers, citations: 3, top10: 0.125, top1: null, status: 'available', bounds: { start: '2001-01-01', end: '2005-01-01' } }, lifetime: { papers, citations: 12, top10: 0.25, top1: null, status: 'available' }, indices: { h: 1, g: 1 } });
const divisions = [{ slug: 'astro', missions: [mission('alpha'), mission('zero', 0)] }, { slug: 'planetary', missions: [mission('beta')] }, { slug: 'empty', missions: [] }];
const landers = [{ shortTitle: 'LANDER', name: 'Lander', lcc: null, cost: 1, status: 'Failure', papers: { b: [], d: [], t: [] } }];
const catalog = exportCatalog(divisions);
const missionUrl = (slug, id) => `https://example.test/${slug}/${id}/`;
const scixUrl = (bibcode) => `https://scixplorer.org/abs/${bibcode}/abstract`;
const options = { divisions, landers, missionUrl, scixUrl, readPapers: async () => paper };
const get = (filename) => buildExport(catalog.find((entry) => entry.filename === filename), options);

test('export catalog enumerates real files and omits zero-paper mission files', () => {
	assert.equal(new Set(catalog.map((f) => f.filename)).size, catalog.length);
	assert.equal(catalog.find((f) => f.mission === 'alpha').missionKey, 'ALPHA');
	assert.ok(!catalog.some((f) => f.filename === 'zero-publications.csv'));
	assert.ok(!catalog.some((f) => f.filename === '../site.json'));
	// The corpus is one zipped file; per-division publication files would only repeat it.
	assert.equal(catalog.find((f) => f.kind === 'publications' && !f.mission).archive, 'science-mission-impact-publications.csv');
	assert.ok(!catalog.some((f) => f.filename === 'astro-publications.csv'));
});

test('static CSVs preserve the existing builders, headers, canonical links and fractional/null values', async () => {
	const tables = divisions.map((d) => missionsCsv(d.missions, { url: (id) => missionUrl(d.slug, id) }));
	assert.equal(await get('science-mission-impact-missions.csv'), allMissionsCsv(divisions, tables));
	assert.equal(await get('astro-missions.csv'), tables[0]);
	assert.equal(await get('alpha-publications.csv'), toCsv(paper.columns, scixUrl));
	assert.equal(await get('science-mission-impact-publications.zip'), publicationsCsv(divisions, () => toCsv(paper.columns, scixUrl)));
	assert.equal(await get('science-mission-impact-clps.csv'), clpsCsv(landers, scixUrl));
	// The manifest counts rows this way: one per mission, per mission–paper association, per lander/paper.
	const rows = async (filename) => (await get(filename)).split('\r\n').length - 1;
	assert.deepEqual([await rows('science-mission-impact-missions.csv'), await rows('science-mission-impact-publications.zip'), await rows('science-mission-impact-clps.csv')], [3, 2, 1]);
	for (const file of catalog) {
		const text = await buildExport(file, options);
		assert.ok(text.length > 0, 'even a zero-row export has a header');
	}
	assert.match(await get('astro-missions.csv'), /0\.125/);
	assert.ok(Buffer.byteLength(await get('alpha-publications.csv')) > (await get('alpha-publications.csv')).length);
});

test('aggregate reads are sequential and propagate a missing source instead of exporting incomplete data', async () => {
	let active = 0;
	const read = [];
	await buildExport(catalog[1], { ...options, readPapers: async (id) => {
		assert.equal(active++, 0);
		await Promise.resolve();
		read.push(id);
		active--;
		return paper;
	} });
	assert.deepEqual(read, ['alpha', 'beta']);
	await assert.rejects(buildExport(catalog[1], { ...options, readPapers: async () => { throw new Error('missing source'); } }), /missing source/);
});

test('dictionary documents every CSV field and compact JSON column with snapshot-driven policy values', () => {
	const site = { asOf: '2026-01-01', costBaseYear: 2025, fullPolicy: { postEndYears: 2, citationYears: 3, minWindowYears: 2 }, attribution: { adsTermsUrl: 'https://example.test/terms' } };
	const dictionary = dataDictionary(site);
	for (const fields of Object.values(dictionary.schemas)) {
		for (const field of fields) assert.ok(dictionary.fields[field], `missing definition for ${field}`);
	}
	// the publication JSON names its columns as the dictionary does, so every one is defined there
	// JSON-only names: the CSV exports drop these, or rename citations to lifetime_citations
	const internal = ['citations', 'full_window_citations', 'top10_weight_full', 'top1_weight_full'];
	for (const key of internal) assert.equal(dictionary.fields[key], undefined, key);
	for (const key of Object.keys(paper.columns).filter((k) => !internal.includes(k))) assert.ok(dictionary.fields[key], `missing definition for JSON column ${key}`);
	assert.equal(dictionary.paperJson, undefined);
	assert.match(dictionary.fields.adjusted_lcc, /millions of 2025/);
	assert.match(dictionary.scopes.active, /following 3 calendar years/);
	for (const gone of ['lifetime_top10', 'lifetime_top1', 'top10_weight_lifetime']) assert.equal(dictionary.fields[gone], undefined, gone);
	assert.match(dictionary.scopes.lifetime, /no top-10% or top-1% measure/);
	const changed = dataDictionary({ ...site, costBaseYear: 2030, fullPolicy: { ...site.fullPolicy, citationYears: 2 } });
	assert.match(changed.fields.adjusted_lcc, /2030/);
	assert.match(changed.scopes.active, /following 2 calendar years/);
});

test('download page compiles with static anchors and safely embedded dataset JSON-LD', async () => {
	const filename = new URL('../../routes/download/+page.svelte', import.meta.url);
	const source = await readFile(filename, 'utf8');
	assert.doesNotThrow(() => compile(source, { filename: filename.pathname, generate: 'server' }));
	assert.match(source, /application\/ld\+json/);
});
