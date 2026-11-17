#!/usr/bin/env node
// Inspect the actual static output, including pages and files a crawler fetches without JavaScript.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { int } from '../src/lib/format.js';
import { scopeLabel } from '../src/lib/copy/window.js';

const root = fileURLToPath(new URL('../.site/', import.meta.url));
const origin = 'https://dashboards.planetary.org';
const prefix = '/science-mission-impact/';
const read = (path) => readFileSync(join(root, path), 'utf8');
const source = (path) => JSON.parse(readFileSync(new URL(`../src/lib/data/generated/${path}.json`, import.meta.url), 'utf8'));
const local = (url) => {
	const parsed = new URL(url, origin);
	assert.equal(parsed.origin, origin, `Unexpected data host: ${url}`);
	assert.ok(parsed.pathname.startsWith(prefix), `Missing site base: ${url}`);
	return parsed.pathname.slice(prefix.length);
};

const pages = readdirSync(root, { recursive: true }).filter((file) => /(^|\/)index\.html$/.test(file));
assert.ok(pages.length > 0, 'Build the site before running check:site');
const awaiting = source('awaiting');
const redirects = new Map(awaiting.map(({ division, id }) => [`${division}/${id}/index.html`, `${prefix}${division}/${id}/lifetime/`]));
const titles = new Set();
for (const file of pages) {
	const html = read(file);
	if (redirects.has(file)) {
		const target = redirects.get(file);
		assert.ok(html.includes(`<meta http-equiv="refresh" content="0;url=${target}">`), `${file}: missing lifetime redirect`);
		assert.ok(statSync(join(root, local(target), 'index.html')).isFile(), `${file}: broken lifetime redirect`);
		continue;
	}
	const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
	assert.ok(title, `${file}: missing title`);
	assert.ok(!titles.has(title), `${file}: duplicate title ${title}`);
	titles.add(title);
	assert.match(html, /<meta name="description" content="[^"]+"/, `${file}: missing description`);
	assert.match(html, /<h1(?:\s|>)/, `${file}: missing H1`);
	assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
		origin + prefix + file.replace(/index\.html$/, ''), `${file}: wrong canonical`);
	assert.ok(html.includes(`rel="describedby" href="${prefix}llms.txt"`), `${file}: missing agent index`);
	if (file.includes('/lifetime/')) assert.ok(title.includes('Lifetime'), `${file}: scope missing from title`);
}

const manifest = JSON.parse(read('data/exports/manifest.json'));
const dictionary = JSON.parse(read('data/exports/dictionary.json'));
assert.ok(manifest.asOf && manifest.version && dictionary, 'Missing dataset provenance');
assert.ok(manifest.files.length > 0, 'Empty export inventory');
for (const file of manifest.files) {
	const path = join(root, local(file.url));
	assert.equal(statSync(path).size, file.bytes, `${file.url}: size differs from manifest`);
	assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), file.sha256, `${file.url}: content differs from manifest`);
}
// Compact JSON uses internal aliases for the dictionary's public CSV field names.
const publicField = { citations: 'lifetime_citations', full_window_citations: 'active_citations', top10_weight_full: 'active_top10', top1_weight_full: 'active_top1' };
for (const { json } of manifest.files.filter((file) => file.json)) {
	const papers = JSON.parse(read(local(json)));
	assert.equal(papers.dictionary, manifest.dictionary, `${json}: links a different dictionary`);
	for (const key of Object.keys(papers.columns)) assert.ok(dictionary.fields[publicField[key] ?? key], `${json}: column ${key} is not in the dictionary`);
}
const download = read('download/index.html');
const schema = JSON.parse(download.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? 'null');
assert.equal(schema?.['@type'], 'Dataset', 'Download page needs Dataset metadata');
assert.equal(schema.version, manifest.version, 'Dataset metadata version differs from downloads');
for (const distribution of schema.distribution) {
	assert.ok(statSync(join(root, local(distribution.contentUrl))).isFile(), 'Missing Dataset distribution');
}
assert.match(download, /id="data-dictionary"/);
assert.match(download, /id="citation"/);
assert.match(download, /href="[^"]+\.csv"/, 'Downloads require ordinary file links');

// Check actual table text, not Svelte's embedded hydration data or metadata counts.
const rowValue = (html, label) => {
	const row = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
		.find(([, body]) => body.includes(`>${label}<`))?.[1];
	return row?.match(/<td[^>]*>([\s\S]*?)<\/td>/)?.[1].replace(/<[^>]*>/g, '').trim();
};
const checkMap = (html, doc, kind, id, scope, path) => {
	const summary = scope === 'lifetime' ? doc.affiliations : doc.fullAffiliations;
	const label = html.match(/aria-label="(Heat map of where the authors worked,[^"]*)"/)?.[1];
	if (!summary) {
		assert.equal(label, undefined, `${path}: map shown without scoped affiliations`);
		return;
	}
	assert.ok(label?.includes(`of ${int(summary.papers)} tracked publications in the ${scopeLabel(scope)} scope`), `${path}: incorrect map scope or paper count`);
	assert.equal(summary.papers, (kind === 'missions' ? doc[scope] : doc.stats[scope]).papers, `${path}: map cohort differs from the stats`);
	const grid = JSON.parse(read(`data/maps/${kind}/${id}${scope === 'full' ? '.full' : ''}.json`));
	for (const key of ['us', 'world']) {
		assert.ok(grid[key].cells.every((cell) => cell[2] > 0 && cell[2] <= summary[key].mapped), `${path}: invalid ${key} map counts`);
	}
};
for (const { slug } of source('site').divisions) {
	const division = source(`divisions/${slug}`);
	for (const scope of ['full', 'lifetime']) {
		const path = `${slug}/${scope === 'lifetime' ? 'lifetime/' : ''}index.html`;
		checkMap(read(path), division, 'divisions', slug, scope, path);
	}
}
for (const { division, id } of source('index')) {
	const mission = source(`missions/${id}`);
	for (const scope of ['full', 'lifetime']) {
		const path = `${division}/${id}/${scope === 'lifetime' ? 'lifetime/' : ''}index.html`;
		const html = read(path);
		const stats = mission[scope];
		checkMap(html, mission, 'missions', id, scope, path);
		if (mission.facts.papers > 0 && stats.spread) {
			assert.equal(rowValue(html, 'Tracked publications'), int(stats.papers), `${path}: incorrect publication count`);
			assert.equal(rowValue(html, 'Citations'), int(stats.citations), `${path}: incorrect citation count`);
		}
		assert.equal(html.includes('aria-label="Scope"'), mission.facts.papers > 0, `${path}: incorrect scope selector visibility`);
		if (mission.facts.papers > 0) {
			assert.ok(html.includes(`href="${prefix}${division}/${id}/lifetime/"`), `${path}: no static lifetime selector link`);
			assert.ok(html.includes(`href="${prefix}${division}/${id}/"`), `${path}: no static active selector link`);
		}
	}
}

for (const { division, id } of awaiting) {
	const mission = source(`missions/${id}`);
	const path = `${division}/${id}/lifetime/index.html`;
	const html = read(path);
	checkMap(html, mission, 'missions', id, 'lifetime', path);
	assert.ok(!html.includes('aria-label="Scope"'), `${path}: awaiting missions must have no scope switch`);
	assert.ok(!html.includes(`href="${prefix}${division}/${id}/"`), `${path}: links to an active view`);
	assert.match(html, /not yet included in the analysis/i, `${path}: missing analysis inclusion notice`);
	if (mission.facts.papers > 0) {
		assert.equal(rowValue(html, 'Tracked publications'), int(mission.lifetime.papers), `${path}: incorrect lifetime publication count`);
		assert.equal(rowValue(html, 'Citations'), int(mission.lifetime.citations), `${path}: incorrect lifetime citation count`);
		const entry = manifest.files.find((file) => file.mission === id);
		assert.ok(entry?.inclusion, `${path}: publication export missing inclusion metadata`);
		assert.equal(entry.page, `${origin}${prefix}${division}/${id}/lifetime/`, `${path}: incorrect export page`);
	}
	for (const scope of ['', 'lifetime/']) {
		const divisionHtml = read(`${division}/${scope}index.html`);
		assert.ok(divisionHtml.includes(`href="${prefix}${division}/${id}/lifetime/"`), `${division}/${scope}: awaiting mission missing from table`);
	}
}

const index = read('llms.txt');
assert.ok(index.includes(manifest.asOf), 'Agent index has an outdated snapshot');
for (const [, url] of index.matchAll(/\]\((https:\/\/[^)]+)\)/g)) {
	let file = local(url);
	if (!file || file.endsWith('/')) file += 'index.html';
	assert.ok(statSync(join(root, file)).isFile(), `Agent index has a broken link: ${url}`);
}
console.log(`Checked ${pages.length} static pages, ${manifest.files.length} downloadable files, Dataset metadata, and llms.txt.`);
