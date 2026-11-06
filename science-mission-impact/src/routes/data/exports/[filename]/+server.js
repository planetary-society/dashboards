import { catalog, exportFile } from '$lib/data/exports.server.js';

export const prerender = true;
export const trailingSlash = 'never';
export const entries = () => [...catalog.map(({ filename }) => ({ filename })), { filename: 'manifest.json' }, { filename: 'dictionary.json' }];

export async function GET({ params, fetch }) {
	const { body, type } = await exportFile(params.filename, fetch);
	return new Response(body, { headers: { 'content-type': type } });
}
