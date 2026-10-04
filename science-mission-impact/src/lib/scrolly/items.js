// Turns a layout (where squares sit) plus the reader's view (scope, threshold) into what each
// square looks like. Pure; shared by the story and the preview image.

import { innerSide } from './layouts.js';

/**
 * Largest mission share in each division, across both thresholds, so 10% → 1% rescales on one
 * ruler. One ruler per division: a fill is only ever comparable with the others in its row,
 * which is the only comparison the analysis allows.
 */
function divisionRulers(tiles, scope) {
	const max = new Map();
	for (const t of tiles) {
		for (const v of Object.values(t.share[scope])) if (v > (max.get(t.division) ?? 0)) max.set(t.division, v);
	}
	return max;
}

/** The smallest fill still drawn, in px: below this an inner square stops reading as a mark. */
const MIN_FILL_PX = 3;

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

/** Mission marks on the continuous cost axis; missions at or under the threshold are emphasised. */
export function costItems(tiles, layout, { scope, top, unranked, referenceCost }) {
	const rulers = divisionRulers(tiles, scope);
	const items = new Map();
	for (const t of tiles) {
		const p = layout.pos.get(t.id);
		if (!p) continue;
		const share = unranked.has(t.division) ? 0 : (t.share[scope][top] ?? 0);
		const filled = share > 0;
		items.set(t.id, {
			...p,
			variant: 'outline',
			inner: innerSide(share, rulers.get(t.division), MIN_FILL_PX / p.s),
			filled,
			emph: filled && t.cost > 0 && t.cost <= referenceCost
		});
	}
	return items;
}

/** Partial or total failures carry the red X; every other placed mission stays solid. */
export function failureItems(tiles, layout) {
	const items = new Map();
	for (const t of tiles) {
		const p = layout.pos.get(t.id);
		if (!p) continue;
		items.set(t.id, { ...p, variant: t.shortfall ? 'shortfall' : 'solid' });
	}
	return items;
}

/** Citations per dollar: a square with any citations is lit, one with none is empty, a failure is slashed. */
export function perDollarItems(tiles, layout) {
	const items = new Map();
	for (const t of tiles) {
		const p = layout.pos.get(t.id);
		if (!p) continue;
		items.set(t.id, { ...p, variant: t.failed ? 'failure' : (t.citations ?? 0) > 0 ? 'lit' : 'outline' });
	}
	return items;
}

export function lanesItems(tiles, layout, { scope }) {
	const items = new Map();
	for (const t of tiles) {
		const p = layout.pos.get(t.id);
		if (!p) continue;
		items.set(t.id, { ...p, variant: t.first[scope].state });
	}
	return items;
}

/** Paper kinds: every placed mission solid; the strip of missions without papers dimmed. */
export function kindsItems(tiles, layout) {
	const empty = new Set(layout.strip?.ids ?? []);
	const items = new Map();
	for (const t of tiles) {
		const p = layout.pos.get(t.id);
		if (!p) continue;
		items.set(t.id, empty.has(t.id) ? { ...p, variant: 'solid', opacity: 0.55 } : { ...p, variant: 'solid' });
	}
	return items;
}

/** The worked example: its one square, emphasised. */
export function exampleItems(tiles, layout) {
	const items = new Map();
	for (const t of tiles) {
		const p = layout.pos.get(t.id);
		if (p) items.set(t.id, { ...p, variant: 'solid', emph: true });
	}
	return items;
}
