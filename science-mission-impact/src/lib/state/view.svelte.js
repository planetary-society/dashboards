import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { legacyScopeLocation } from './scope.js';

// Route data is request-local and identical in prerendered HTML and the hydrated page.
export const view = {
	get scope() { return page.data.scope ?? 'full'; },
	get top() { return browser && this.scope === 'full' && page.url.searchParams.get('top') === '1' ? 1 : 10; }
};

/** afterNavigate hook (browser only): old base-page `?scope=` links move to their scope's path. */
export function redirectLegacyScope() {
	const next = legacyScopeLocation(page.url, page.data.scope);
	if (next) return goto(next, { replaceState: true, noScroll: true, keepFocus: true });
}
