// Geometry for the per-dollar charts: the overview's bands and the division pages' scatter. Kept
// apart from scrolly/layouts.js (which re-exports it) so a division page loads only this.

import { scaleLog } from 'd3-scale';
import { byCostThenId, decadeTicks, stackLevels } from './costaxis.js';


/**
 * The stretch of log10 costs [a, b] over which the line log10(rate) = intercept + slope · log10(cost)
 * stays inside the rate domain [lo, hi]. A line is cut there rather than clamped at its ends,
 * which would change its tilt. Null when nothing is left.
 */
export function clipSpan({ intercept, slope }, [a, b], [lo, hi]) {
	if (slope !== 0) {
		const ends = [lo, hi].map((r) => (Math.log10(r) - intercept) / slope).sort((p, q) => p - q);
		[a, b] = [Math.max(a, ends[0]), Math.min(b, ends[1])];
	}
	return b > a ? [a, b] : null;
}

/** Label gutter on the left of the row-based states: none on a phone, where names move into the band. */
export const rowGutter = (W) => (W < 600 ? 0 : W < 900 ? 96 : 236);
/** The short name only in the narrow side gutter; a phone puts the full name above its band. */
export const rowLabel = (d, W) => (W >= 600 && W < 900 ? d.nav : d.name);

/**
 * Citations per $100M of cost against cost, both log: one band per division, or one band filling
 * the stage for a single division. Bands share one rate scale and one floor, so a line's tilt
 * means the same in each. A measured mission with no citations sits on its band's floor, lifted
 * only off a neighbour: zero has no place on a log scale. `x` reuses another layout's cost axis,
 * so squares keep their x between states. `fits` (division slug → packaged perDollar fit) gives
 * each row its fit, the cost range of its cited missions and a pivot on the fitted line midway
 * along that range; trendLine() draws a line through the pivot at any slope.
 */
export function perDollarLayout(tiles, W, H, { divisions, fits, x = null }) {
	const compact = W < 600;
	const single = divisions.length === 1;
	const top = compact ? 22 : 28;
	const bottom = compact ? 4 : 6;
	const right = compact ? 8 : 24;
	const s = single ? (compact ? 9 : 14) : compact ? 5 : 9;
	const gap = 1;
	const lift = 2;
	const nameH = !single && compact ? 18 : 0;
	const padTop = single ? 8 : compact ? 4 : 12;
	const shelfPad = single ? (compact ? 6 : 10) : compact ? 4 : 6;

	// measured as the packager reads it: a cost, and full-window output that isn't missing
	const slugs = new Set(divisions.map((d) => d.slug));
	const placed = tiles.filter((t) => slugs.has(t.division) && t.cost > 0 && t.citations != null && t.top10 != null).sort(byCostThenId);
	const rate = (t) => (t.citations / t.cost) * 100;
	const rates = placed.filter((t) => t.citations > 0).map(rate);
	const left = single ? (compact ? 36 : 52) : rowGutter(W);
	x ??= scaleLog()
		.domain(placed.length ? [placed[0].cost * 0.8, placed.at(-1).cost * 1.25] : [1, 10])
		.range([left + s, W - right - s]);
	// 0..1 up the band, with air above and below the data
	const scale = scaleLog()
		.domain(rates.length ? [Math.min(...rates) / 1.5, Math.max(...rates) * 1.5] : [1, 10])
		.range([0, 1])
		.clamp(true);

	const members = divisions.map((d) => placed.filter((t) => t.division === d.slug));
	const shelves = members.map((list) => stackLevels(list.filter((t) => !(t.citations > 0)), (t) => x(t.cost) - s / 2, s, gap));
	// the deepest stack of zeros sets every band's floor, so the rate scale lands on the same pixels in each
	const floorH = lift + Math.max(0, ...shelves.map((k) => k.depth)) * (s + gap) + (single ? 8 : 4);
	const rh = (H - top - bottom) / divisions.length;

	const pos = new Map();
	const rows = divisions.map((d, r) => {
		const y = top + r * rh;
		const shelfY = Math.round(y + rh - shelfPad);
		const curveTop = y + nameH + padTop;
		// a stage too short for the zeros' stack squeezes the rates flat rather than turning them upside down
		const floorY = Math.max(curveTop + 1, shelfY - floorH);
		const rateY = (v) => floorY - scale(v) * (floorY - curveTop);
		const { levels } = shelves[r];
		for (const t of members[r]) {
			const level = levels.get(t.id);
			pos.set(t.id, { x: x(t.cost) - s / 2, y: level == null ? rateY(rate(t)) - s / 2 : shelfY - lift - (level + 1) * (s + gap) + gap, s });
		}
		const costs = members[r].filter((t) => t.citations > 0).map((t) => Math.log10(t.cost));
		// log10 cost and rate: the cited missions' range, and the point on the fitted line midway along it
		const span = costs.length ? [Math.min(...costs), Math.max(...costs)] : null;
		const fit = fits.get(d.slug) ?? null;
		const mid = span && (span[0] + span[1]) / 2;
		return {
			slug: d.slug,
			label: rowLabel(d, W),
			y,
			h: rh,
			band: r % 2 === 1,
			shelfY,
			curveTop,
			floorY,
			rateY,
			fit,
			span,
			pivot: fit && span ? { cost: mid, rate: fit.intercept + fit.slope * mid } : null
		};
	});

	return { pos, x, scale, rows, left, top, bottomY: top + divisions.length * rh, ticks: decadeTicks(...x.domain()), rateTicks: decadeTicks(...scale.domain()) };
}

/** A line of `slope` (log rate per log cost) through a row's pivot, across its cited missions' costs, cut to the rate scale; null with no pivot or nothing on the scale. */
export function trendLine(layout, row, slope) {
	if (!row.pivot) return null;
	const line = { slope, intercept: row.pivot.rate - slope * row.pivot.cost };
	const span = clipSpan(line, row.span, layout.scale.domain());
	if (!span) return null;
	const [[x1, y1], [x2, y2]] = span.map((c) => [layout.x(10 ** c), row.rateY(10 ** (line.intercept + slope * c))]);
	return { x1, y1, x2, y2 };
}
