export const SCOPES = ['full', 'lifetime'];

/** The scope a page renders, from its route: the `/lifetime` routes re-export the base loaders. */
export const routeScope = (route) => (route.id?.endsWith('/lifetime') ? 'lifetime' : 'full');

export const scopePath = (pathname, scope) => {
	const active = pathname.replace(/\/lifetime\/$/, '/');
	return scope === 'lifetime' ? `${active}lifetime/` : active;
};

/** Scope links retain the reader's fragment and unrelated query parameters. */
export function scopeLocation(url, scope) {
	const next = new URL(url);
	next.pathname = scopePath(next.pathname, scope);
	next.searchParams.delete('scope');
	next.searchParams.delete('x');
	if (scope === 'lifetime' || next.searchParams.get('top') !== '1') next.searchParams.delete('top');
	return next.pathname + next.search + next.hash;
}

/** Only old base-page links take their scope from the query; explicit paths win. */
export function legacyScopeLocation(url, scope) {
	if (!SCOPES.includes(scope)) return null;
	const requested = url.searchParams.get('scope');
	const target = scope === 'full' && requested === 'lifetime' && url.searchParams.get('top') !== '1' ? 'lifetime' : scope;
	const next = scopeLocation(url, target);
	return next === url.pathname + url.search + url.hash ? null : next;
}
