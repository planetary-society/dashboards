#!/usr/bin/env node
// Inspect the actual static output, including pages and files a crawler fetches without JavaScript.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { int } from '../src/lib/format.js';

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
const titles = new Set();
for (const file of pages) {
	const html = read(file);
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
// Each publication JSON explains itself: it links the published dictionary, which defines every column it has.
for (const { json } of manifest.files.filter((file) => file.json)) {
	const papers = JSON.parse(read(local(json)));
	assert.equal(papers.dictionary, manifest.dictionary, `${json}: links a different dictionary`);
	for (const key of Object.keys(papers.columns)) assert.ok(dictionary.fields[key], `${json}: column ${key} is not in the dictionary`);
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
for (const { division, id } of source('index')) {
	const mission = source(`missions/${id}`);
	for (const scope of ['full', 'lifetime']) {
		const path = `${division}/${id}/${scope === 'lifetime' ? 'lifetime/' : ''}index.html`;
		const html = read(path);
		const stats = mission[scope];
		if (mission.facts.papers > 0 && stats.spread) {
			assert.equal(rowValue(html, 'Tracked publications'), int(stats.papers), `${path}: incorrect publication count`);
			assert.equal(rowValue(html, 'Citations'), int(stats.citations), `${path}: incorrect citation count`);
		}
		assert.ok(html.includes(`href="${prefix}${division}/${id}/lifetime/"`), `${path}: no static lifetime selector link`);
		assert.ok(html.includes(`href="${prefix}${division}/${id}/"`), `${path}: no static active selector link`);
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
