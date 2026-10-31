// Geometry for the per-dollar charts: the overview's grid and the division pages' scatter. Kept
// apart from scrolly/layouts.js (which re-exports it) so a division page loads only this.

import { scaleLinear, scaleLog } from 'd3-scale';
import { area, line } from 'd3-shape';
import { byCostThenId, costAxisBottom, costDomain, decadeTicks, stackLevels } from './costaxis.js';


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
 * Citations per $100M of cost against cost, both log: a two-column grid, or one plot filling
 * the stage for a single division. Panels share cost and rate domains, so a line's tilt
 * means the same in each. A measured mission with no citations sits on its band's floor, lifted
 * only off a neighbour: zero has no place on a log scale. `x` reuses another layout's cost axis
 * for a single plot, or its domain for the grid. `averages` (division slug → packaged
 * perDollar.runningMean) gives each row its running mean, the cost range of every measured mission
 * in it (the zeros on its shelf too, since the average counts them) and a pivot on the supported
 * average nearest the middle of that range; trendLine() draws a line through the pivot at any slope.
 * `citations` plots each mission's citations themselves instead, with no average: the scatter
 * alone, before per dollar. `titled` keeps a strip over the plot for the chart's title (the
 * overview's; a division page heads its chart itself).
 */
export function perDollarLayout(tiles, W, H, { divisions, averages = null, x = null, citations = false, titled = false }) {
	const compact = W < 600;
	const single = divisions.length === 1;
	// the cost ticks and the axis label under them sit in the bottom margin, costLayout's too, so the axis stays put between the two
	const top = (compact ? 4 : 6) + (titled ? (compact ? 22 : 28) : 0);
	const bottom = costAxisBottom(compact);
	const columns = single ? 1 : 2;
	const rowCount = Math.ceil(divisions.length / columns);
	const columnGap = single ? 0 : compact ? 12 : 24;
	const rowGap = single ? 0 : compact ? 26 : 32;
	const panelWidth = (W - columnGap) / columns;
	const right = single ? (compact ? 8 : 24) : compact ? 4 : 8;
	const s = single ? (compact ? 9 : 14) : compact ? 5 : 9;
	const gap = 1;
	const lift = 2;
	const nameH = single ? 0 : compact ? 32 : 42;
	const padTop = single ? 8 : compact ? 4 : 12;

	// measured as the packager reads it (`measuredIn`): a tile with a cost and output that isn't
	// missing; eligible empty failures remain measured zeros
	const slugs = new Set(divisions.map((d) => d.slug));
	const placed = tiles.filter((t) => slugs.has(t.division) && t.cost > 0 && t.citations != null && t.top10 != null).sort(byCostThenId);
	const rate = (t) => (citations ? t.citations : (t.citations / t.cost) * 100);
	const rates = placed.filter((t) => t.citations > 0).map(rate);
	if (!citations && averages) rates.push(...divisions.flatMap((d) => (averages.get(d.slug)?.points ?? []).map((p) => p[1]).filter((v) => v > 0)));
	const left = single ? (compact ? 36 : 52) : compact ? 24 : 36;
	// Reuse the earlier chart's domain; each grid column needs its own pixel range.
	if (!x || !single) x = scaleLog()
		.domain(x?.domain() ?? costDomain(placed))
		.range([left + s, panelWidth - right - s]);
	// 0..1 up the band, with air above and below the data
	const scale = scaleLog()
		.domain(rates.length ? [Math.min(...rates) / 1.5, Math.max(...rates) * 1.5] : [1, 10])
		.range([0, 1])
		.clamp(true);

	const members = divisions.map((d) => placed.filter((t) => t.division === d.slug));
	const shelves = members.map((list) => stackLevels(list.filter((t) => !(t.citations > 0)), (t) => x(t.cost) - s / 2, s, gap));
	// the deepest stack of zeros sets every band's floor, so the rate scale lands on the same pixels in each
	const floorH = lift + Math.max(0, ...shelves.map((k) => k.depth)) * (s + gap) + (single ? 8 : 4);
	const rh = (H - top - bottom - (rowCount - 1) * rowGap) / rowCount;

	const pos = new Map();
	const rows = divisions.map((d, r) => {
		const panelLeft = (r % columns) * (panelWidth + columnGap);
		const panelX = x.copy().range(x.range().map((v) => v + panelLeft));
		const y = top + Math.floor(r / columns) * (rh + rowGap);
		const shelfY = single ? Math.round(y + rh - (compact ? 6 : 10)) : y + rh;
		const curveTop = y + nameH + padTop;
		// a stage too short for the zeros' stack squeezes the rates flat rather than turning them upside down
		const floorY = Math.max(curveTop + 1, shelfY - floorH);
		const rateY = (v) => floorY - scale(v) * (floorY - curveTop);
		const { levels } = shelves[r];
		for (const t of members[r]) {
			const level = levels.get(t.id);
			pos.set(t.id, { x: panelX(t.cost) - s / 2, y: level == null ? rateY(rate(t)) - s / 2 : shelfY - lift - (level + 1) * (s + gap) + gap, s });
		}
		const costs = members[r].map((t) => Math.log10(t.cost));
		// log10 cost: every measured mission's range, zeros included
		const span = costs.length ? [Math.min(...costs), Math.max(...costs)] : null;
		const average = citations ? null : (averages?.get(d.slug) ?? null);
		const mid = span && (span[0] + span[1]) / 2;
		// The hypothetical guides pivot on the supported positive average nearest the range's middle.
		const middle = average?.points.filter(([, value]) => value > 0)
			.sort((a, b) => Math.abs(Math.log10(a[0]) - mid) - Math.abs(Math.log10(b[0]) - mid))[0];
		return {
			slug: d.slug,
			label: d.name,
			x: panelX,
			left: panelLeft,
			width: panelWidth,
			y,
			h: rh,
			band: r % 2 === 1,
			shelfY,
			curveTop,
			floorY,
			rateY,
			average,
			span,
			pivot: middle ? { cost: Math.log10(middle[0]), rate: Math.log10(middle[1]) } : null
		};
	});

	return { pos, x, scale, rows, columns, left, top, bottomY: H - bottom, ticks: decadeTicks(...x.domain()), rateTicks: decadeTicks(...scale.domain()) };
}

/** A line of `slope` (log rate per log cost) through a row's pivot, across its measured missions' costs, cut to the rate scale; null with no pivot or nothing on the scale. */
export function trendLine(layout, row, slope) {
	if (!row.pivot) return null;
	const line = { slope, intercept: row.pivot.rate - slope * row.pivot.cost };
	const span = clipSpan(line, row.span, layout.scale.domain());
	if (!span) return null;
	const [[x1, y1], [x2, y2]] = span.map((c) => [row.x(10 ** c), row.rateY(10 ** (line.intercept + slope * c))]);
	return { x1, y1, x2, y2 };
}

/** A packaged running mean: gaps stay gaps, and a true zero sits on the zero shelf. */
export function runningLine(layout, row) {
	const points = row.average?.points ?? [];
	const defined = ([cost, mean]) => cost > 0 && Number.isFinite(mean) && mean >= 0;
	const last = points.findLast(defined);
	if (!last) return null;
	const y = ([, mean]) => mean === 0 ? row.shelfY : row.rateY(mean);
	return { path: line().defined(defined).x(([cost]) => row.x(cost)).y(y)(points), x2: row.x(last[0]), y2: y(last) };
}

/** Packaged intervals, [cost, lower, upper] rates, unclamped; SVG clips them above the zero shelf. Unsupported windows stay gaps. */
export function trendBand(layout, row, points) {
	if (!points?.length || !row.span) return null;
	const y = scaleLinear().domain(layout.scale.domain().map(Math.log10)).range([row.floorY, row.curveTop]);
	const boundY = (v) => v === 0 ? row.floorY : y(Math.log10(v));
	const path = area().defined(([cost, lo, hi]) => cost > 0 && Number.isFinite(lo) && Number.isFinite(hi) && lo >= 0 && hi >= 0)
		.x(([cost]) => row.x(cost)).y0(([, lo]) => boundY(lo)).y1(([, , hi]) => boundY(hi))(points);
	if (!path) return null;
	const [left, right] = row.span.map((cost) => row.x(10 ** cost));
	return { path, x: left, y: row.curveTop, width: right - left, height: row.floorY - row.curveTop };
}
