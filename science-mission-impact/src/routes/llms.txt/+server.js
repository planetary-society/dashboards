import { site } from '$lib/data/server.js';
import { agentIndex } from '$lib/data/agent-index.js';
import { canonical, home } from '$lib/paths.js';

export const prerender = true;
export const trailingSlash = 'never';

export function GET() {
	return new Response(agentIndex(site, canonical(home())), {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}
