// Turns a layout (where squares sit) into what each square looks like. Pure.

/**
 * Every tile the layout had no place for — no launch year, no cost — fades out where
 * `fallbackPos` last left it, or at the origin at no size when there is nowhere to fade from.
 * Fills in `items` and returns it, so a caller can place what it can and hand the rest here.
 */
export function withHidden(items, tiles, fallbackPos) {
	for (const t of tiles) {
		if (!items.has(t.id)) items.set(t.id, { ...(fallbackPos?.get(t.id) ?? { x: 0, y: 0, s: 0 }), opacity: 0 });
	}
	return items;
}

/** An outright failure carries the red X, a partial failure or partial success one red stroke; every other placed mission stays solid. */
export function failureItems(tiles, layout) {
	const items = new Map();
	for (const t of tiles) {
		const p = layout.pos.get(t.id);
		if (!p) continue;
		items.set(t.id, { ...p, variant: t.failed ? 'lost' : t.shortfall ? 'partial' : 'solid' });
	}
	return items;
}

/** One division's squares washed in the highlight colour over whatever marks they carry; the rest dimmed. Edits `items` in place. */
export function highlightDivision(items, tiles, division) {
	for (const t of tiles) {
		const it = items.get(t.id);
		if (it) items.set(t.id, t.division === division ? { ...it, tint: true } : { ...it, opacity: 0.25 });
	}
	return items;
}
