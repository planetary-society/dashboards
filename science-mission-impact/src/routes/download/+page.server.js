import { datasetMetadata, getDictionary, getManifest } from '$lib/data/exports.server.js';
import { site } from '$lib/data/server.js';

export async function load({ fetch }) {
	const manifest = await getManifest(fetch);
	// The page reads only these per-file fields; checksums and page URLs stay in manifest.json.
	const files = manifest.files.map(({ filename, format, bytes, rows, division, mission, name, json }) => ({ filename, format, bytes, rows, division, mission, name, json }));
	return { manifest: { ...manifest, files }, dictionary: getDictionary(), landers: site.clps.missions.length, dataset: datasetMetadata(manifest) };
}
