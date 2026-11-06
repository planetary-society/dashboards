import { createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { clpsLanders, loadDivision, site } from './server.js';
import { exportCatalog, buildExport } from './export-files.js';
import { zipOne } from './zip.js';
import { CREATORS, DATASET_NAME, LICENSE, RIGHTS, dataDictionary } from './dictionary.js';
import { canonical, divisionHref, downloadHref, exportUrl, methodsHref, missionHref, papersUrl, scixAbstract } from '$lib/paths.js';

const divisions = await Promise.all(site.divisions.map(({ slug }) => loadDivision(slug)));
export const catalog = exportCatalog(divisions);
export const getDictionary = () => dataDictionary(site);
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function csv(entry, fetch) {
	return buildExport(entry, {
		divisions, landers: clpsLanders,
		missionUrl: (slug, id) => canonical(missionHref(slug, id)), scixUrl: scixAbstract,
		readPapers: async (id) => {
			const response = await fetch(papersUrl(id));
			if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
			return response.json();
		}
	});
}

// The zipped corpus (~11 MB) is kept once built, so its route doesn't rebuild and re-deflate it.
const archives = new Map();

/** The served file: the CSV itself, or for an archive entry that CSV zipped. Rows count the CSV text. */
async function exportBody(entry, fetch) {
	if (archives.has(entry.filename)) return archives.get(entry.filename);
	const text = await csv(entry, fetch);
	const rows = text.split('\r\n').length - 1;
	if (!entry.archive) return { rows, body: text, type: 'text/csv; charset=utf-8' };
	const zipped = { rows, body: zipOne(entry.archive, text, site.asOf), type: 'application/zip' };
	archives.set(entry.filename, zipped);
	return zipped;
}

let manifest;
export function getManifest(fetch) {
	// Cache the small catalog, and no CSV body (only the zipped corpus, above). A failed dev request must be retryable.
	return manifest ??= buildManifest(fetch).catch((e) => { manifest = undefined; throw e; });
}

async function buildManifest(fetch) {
	const files = [];
	for (const entry of catalog) {
		const { rows, body, type } = await exportBody(entry, fetch);
		const page = (scope) => entry.mission ? missionHref(entry.division, entry.mission, scope) : divisionHref(entry.division, scope);
		files.push({ ...entry, url: canonical(exportUrl(entry.filename)), format: type.split(';')[0], bytes: Buffer.byteLength(body), sha256: sha256(body),
			rows,
			page: canonical(entry.division ? page() : downloadHref()),
			...(entry.division ? { lifetimePage: canonical(page('lifetime')) } : {}),
			...(entry.mission ? { json: canonical(papersUrl(entry.mission)) } : {})
		});
	}
	const dictionary = getDictionary();
	const version = `${site.asOf}-${sha256(JSON.stringify({ files: files.map(({ filename, sha256 }) => ({ filename, sha256 })), dictionary })).slice(0, 12)}`;
	return {
		name: DATASET_NAME, asOf: site.asOf, version, creators: CREATORS, publisher: 'The Planetary Society',
		license: LICENSE, rights: RIGHTS, dictionary: canonical(exportUrl('dictionary.json')),
		landingPage: canonical(downloadHref()),
		source: { acknowledgement: site.attribution.acknowledgement, terms: site.attribution.adsTermsUrl,
			missionMetadata: site.attribution.missionMetadataSource, codeRevision: site.codeRevision,
			codeRevisionDirty: site.codeRevisionDirty, dashboardCode: 'https://github.com/planetary-society/dashboards/tree/main/science-mission-impact' },
		files
	};
}

export async function exportFile(filename, fetch) {
	if (filename === 'manifest.json') return { body: jsonText(await getManifest(fetch)), type: 'application/json; charset=utf-8' };
	if (filename === 'dictionary.json') return { body: jsonText(getDictionary()), type: 'application/json; charset=utf-8' };
	const entry = catalog.find((entry) => entry.filename === filename);
	if (!entry) error(404, 'No such export');
	return exportBody(entry, fetch);
}

export function datasetMetadata(manifest) {
	return {
		'@context': 'https://schema.org', '@type': 'Dataset', '@id': `${manifest.landingPage}#dataset`,
		name: manifest.name,
		description: 'Mission costs, tracked peer-reviewed publications, and citation measures for NASA science missions. Includes active-window and lifetime measurements, plus a separate CLPS publication export.',
		url: manifest.landingPage, version: manifest.version, dateModified: manifest.asOf,
		creator: CREATORS.map((name) => ({ '@type': 'Person', name })),
		publisher: { '@type': 'Organization', name: manifest.publisher, url: 'https://www.planetary.org/' },
		license: LICENSE, usageInfo: `${manifest.landingPage}#reuse`,
		isAccessibleForFree: true,
		measurementTechnique: canonical(methodsHref('windows')),
		distribution: manifest.files.map((file) => ({ '@type': 'DataDownload', name: file.filename, contentUrl: file.url, encodingFormat: file.format, contentSize: String(file.bytes) }))
	};
}
