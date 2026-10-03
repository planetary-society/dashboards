import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';

// Reader's choice of scope and percentile. Lives in the URL (?scope=&top=) so a view can be
// shared, and in module state so it carries across pages. Pages are prerendered, so the
// URL is only read in the browser.
const DEFAULTS = { scope: 'full', top: 10 };
const SCOPES = ['full', 'window', 'lifetime'];

export const view = $state({ ...DEFAULTS });

/** Top 1% exists only for the two windowed scopes, so choosing one can move the other. */
export function setScope(scope) {
	view.scope = scope;
	if (scope === 'lifetime') view.top = 10;
	writeUrl();
}

export function setTop(top) {
	view.top = top;
	if (top === 1 && view.scope === 'lifetime') view.scope = 'full';
	writeUrl();
}

export function readUrl() {
	if (!browser) return;
	const q = new URLSearchParams(window.location.search);
	const scope = q.get('scope');
	const top = Number(q.get('top'));
	if (SCOPES.includes(scope)) view.scope = scope;
	if (top === 10 || top === 1) view.top = top;
	if (view.top === 1 && view.scope === 'lifetime') view.scope = 'full';
}

/** Re-apply the current view to the address bar (after a navigation, or a change). */
export function writeUrl() {
	if (!browser) return;
	const url = new URL(window.location.href);
	url.searchParams.delete('x'); // Old shared links now use the continuous cost view.
	for (const key of ['scope', 'top']) {
		if (view[key] === DEFAULTS[key]) url.searchParams.delete(key);
		else url.searchParams.set(key, String(view[key]));
	}
	if (url.href !== window.location.href) replaceState(url, {});
}
