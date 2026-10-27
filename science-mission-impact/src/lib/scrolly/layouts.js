// Pure geometry for the mission squares. Each function takes the tiles and a stage size and
// returns where every square sits, plus whatever furniture (cells, axes) that state needs.
// No DOM, no Svelte: the scrolly and the preview image render from these.

import { scaleLinear, scaleLog, scaleSqrt } from 'd3-scale';
import { byCostThenId, decadeTicks, stackLevels, stepAfterPath } from '../charts/costaxis.js';
import { curveFacts, curveChart } from '../charts/costcurve.js';
import { clipSpan } from '../charts/perdollar.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Largest square size (px) at which `n` squares fit a w×h box with `gap` between them. */
export function fitSquares(n, w, h, gap, max = 28, min = 4) {
	for (let s = max; s >= min; s--) {
		const cols = Math.floor((w + gap) / (s + gap));
		if (cols < 1) continue;
		const rows = Math.ceil(n / cols);
		if (rows * (s + gap) - gap <= h) return { s, cols };
	}
	return { s: min, cols: Math.max(1, Math.floor((w + gap) / (min + gap))) };
}

/** The image grid, centred in the stage below `top` (room for a figure above it). */
export function gridLayout(tiles, W, H, { top = 0 } = {}) {
	const n = tiles.length;
	const gap = W < 600 ? 3 : 5;
	const pad = W < 600 ? 8 : 32;
	const { s, cols } = fitSquares(n, W - pad * 2, H - top - pad * 2, gap, 72, 8);
	const rows = Math.ceil(n / cols);
	const gw = cols * (s + gap) - gap;
	const gh = rows * (s + gap) - gap;
	const x0 = (W - gw) / 2;
	const y0 = top + (H - top - gh) / 2;
	const pos = new Map();
	tiles.forEach((t, i) => {
		pos.set(t.id, { x: x0 + (i % cols) * (s + gap), y: y0 + Math.floor(i / cols) * (s + gap), s });
	});
	return { pos };
}

/**
 * Squares hang in stacks from a ground line at their launch year, earliest launch just under
 * the ground; the chart above the ground (the skyline) shares the same x scale.
 */
export function rugLayout(tiles, W, H, yearDomain) {
	const m = { l: W < 600 ? 40 : 64, r: W < 600 ? 12 : 72, t: 28, b: 30 };
	const x = scaleLinear().domain(yearDomain).range([m.l, W - m.r]);
	const step = x(yearDomain[0] + 1) - x(yearDomain[0]);
	const gap = 1;
	const s = clamp(Math.floor(step) - gap, 3, 12);

	const dated = tiles.filter((t) => t.launchYear != null);
	const depth = new Map();
	for (const t of dated) depth.set(t.launchYear, (depth.get(t.launchYear) ?? 0) + 1);
	const tallest = Math.max(0, ...depth.values());
	const ground = H - m.b - tallest * (s + gap);

	const stacks = new Map();
	const pos = new Map();
	for (const t of dated) {
		const k = stacks.get(t.launchYear) ?? 0;
		stacks.set(t.launchYear, k + 1);
		pos.set(t.id, { x: x(t.launchYear) - s / 2, y: ground + gap + k * (s + gap), s });
	}
	return { pos, x, s, chart: { left: m.l, right: W - m.r, top: m.t, bottom: ground } };
}

/**
 * The skyline over the hanging rug: one column per mission with papers, rising from the ground
 * inside its year's footprint, height ∝ √papers, with two lines of headroom for the hover label.
 * No names by default; the reader skims the columns or the squares to light one up.
 * Each column carries its citations too, for skylineZoom; `room` is the height the tallest fills.
 * papers, cited: (tile) => count.
 */
export function skylineLayout(tiles, rug, { papers = (t) => t.papersLifetime, cited = (t) => t.citationsLifetime ?? 0, compact = false } = {}) {
	const lineH = compact ? 13 : 15;
	const w = compact ? 1 : 2;
	const { left, right, top, bottom: ground } = rug.chart;
	const withPapers = tiles.filter((t) => rug.pos.has(t.id) && papers(t) > 0);
	const most = Math.max(1, ...withPapers.map(papers));
	const room = ground - (top + 2 * lineH);
	const y = scaleSqrt().domain([0, most]).range([0, room]);

	const byYear = new Map();
	for (const t of withPapers) byYear.set(t.launchYear, [...(byYear.get(t.launchYear) ?? []), t]);
	const columns = [];
	for (const [year, group] of byYear) {
		const k = group.length;
		const pitch = k > 1 ? Math.min(w + 2, (rug.s - w) / (k - 1)) : 0;
		group.forEach((t, i) => {
			const cx = rug.x(year) + (i - (k - 1) / 2) * pitch;
			const h = Math.max(1, y(papers(t)));
			columns.push({ id: t.id, name: t.name, x: cx - w / 2, y: ground - h, w, h, papers: papers(t), cited: cited(t) });
		});
	}
	return { columns, ground, top, left, right, x: rug.x, lineH, reach: rug.s, room, most };
}

/**
 * The skyline zooming out from papers to citations, one move: at `p` (0..1) each column's count
 * has grown from its papers toward its citations (geometrically, so the zoom runs at a steady
 * rate), the √ scale has widened to keep the tallest column at the top of the chart, and the
 * papers shrink on that same scale. The citations grow out of the paper columns while the scale
 * draws out, with no dip between the two. p = 0 is the paper skyline; p = 1 is every citation to
 * date on one √ scale with the papers. Returns each column's paper and citation heights by id.
 */
export function skylineZoom(sky, p) {
	const grown = (c) => c.papers ** (1 - p) * c.cited ** p;
	const k = sky.room / Math.sqrt(Math.max(sky.most, ...sky.columns.map(grown)));
	return new Map(sky.columns.map((c) => [c.id, { hp: Math.max(1, k * Math.sqrt(c.papers)), hc: k * Math.sqrt(grown(c)) }]));
}

/**
 * The citation primer: one bar per citation count, from none to the most cited paper, with papers
 * on a log scale (gridlines at each power of ten) rising from half a paper so a lone paper still
 * stands. `columns` are the bars with papers, in the skyline's shape, so skylineHit and columnLabel
 * work on them too; a bar's `t` is its top-10% part, which reaches the level of its own count.
 * `cut` is where the top 10% begins: the first bar that is mostly in.
 */
export function primerLayout(primer, W, H, { compact = false } = {}) {
	const m = { l: compact ? 36 : 56, r: compact ? 6 : 16, t: compact ? 30 : 44, b: compact ? 42 : 52 };
	const cap = primer.counts.length;
	const x = scaleLinear().domain([0, cap]).range([m.l, W - m.r]);
	const decades = Math.max(1, Math.ceil(Math.log10(Math.max(...primer.counts))));
	const y = scaleLog().domain([0.5, 10 ** decades]).range([H - m.b, m.t]);
	const ground = H - m.b;
	const pitch = x(1) - x(0);
	const w = Math.max(1, pitch - (pitch >= 3 ? 1 : 0));
	const rise = (n) => Math.max(0, ground - y(Math.max(n, 0.5)));
	const columns = [];
	primer.counts.forEach((n, c) => {
		const top = primer.top[c];
		if (n > 0) columns.push({ id: c, x: x(c), w, h: rise(n), t: top >= n ? rise(n) : rise(top), papers: n, top });
	});
	const edge = columns.find((c) => c.top / c.papers >= 0.5)?.id ?? cap - 1;
	return {
		columns,
		cap,
		ground,
		top: m.t,
		left: m.l,
		right: W - m.r,
		cut: x(edge),
		yTicks: Array.from({ length: decades + 1 }, (_, k) => ({ v: 10 ** k, y: y(10 ** k) })),
		xTicks: x.ticks(compact ? 4 : 6).filter((c) => Number.isInteger(c) && c < cap).map((c) => ({ v: c, x: x(c) + w / 2 })),
		// bars are a few pixels wide, so a pointer reaches a little past its own bar
		reach: Math.max(pitch, compact ? 8 : 4)
	};
}

/** A hover label over a column: centred on it unless that would run it off either end of the chart (width estimated per character). */
export function columnLabel(text, column, { left, right, y, compact = false }) {
	const cx = column.x + column.w / 2;
	const half = ((text.length + 1) * (compact ? 6 : 7)) / 2;
	const anchor = cx - half < left ? 'start' : cx + half > right ? 'end' : 'middle';
	return { text, x: anchor === 'start' ? column.x : anchor === 'end' ? column.x + column.w : cx, y, anchor };
}

/**
 * The column under a pointer skimming the skyline (or the primer's bars): the nearest by x, within
 * `reach` (one year's footprint on the skyline), anywhere between the top of the chart and the
 * ground. Null off the chart or where no column is in reach.
 */
export function skylineHit(sky, px, py) {
	if (py < sky.top || py > sky.ground) return null;
	let best = null;
	let dist = sky.reach;
	for (const c of sky.columns) {
		const d = Math.abs(c.x + c.w / 2 - px);
		if (d <= dist) [best, dist] = [c, d];
	}
	return best?.id ?? null;
}

/** Label gutter on the left of the row-based states: none on a phone, where names move into the band. */
const rowGutter = (W) => (W < 600 ? 0 : W < 900 ? 96 : 236);
/** The short name only in the narrow side gutter; a phone puts the full name above its band. */
const rowLabel = (d, W) => (W >= 600 && W < 900 ? d.nav : d.name);

/**
 * The bins dissolve: division rows stay, and each square sits at its own cost on one log axis,
 * rising where neighbours would overlap. The space above each shelf carries that division's
 * running share of top papers (see costCurve), read against the same x.
 */
export function costLayout(tiles, W, H, { divisions }) {
	const compact = W < 600;
	const left = rowGutter(W);
	const right = compact ? 8 : 24;
	const top = compact ? 22 : 28;
	const bottom = compact ? 4 : 6;
	const rh = (H - top - bottom) / divisions.length;
	const nameH = compact ? 18 : 0;
	const figuresH = compact ? 15 : 22;
	const padTop = compact ? 3 : 10;
	const s = compact ? 5 : 9;
	const gap = 1;
	const lift = 2;

	const costs = tiles.map((t) => t.cost).filter((c) => c > 0);
	// a little air either side of the data; ticks are the decades that fall inside
	const x = scaleLog()
		.domain(costs.length ? [Math.min(...costs) * 0.8, Math.max(...costs) * 1.25] : [1, 10])
		.range([left + s, W - right - s]);

	// one pass to bucket the costed missions by division, rather than a filter per row
	const byDivision = new Map(divisions.map((d) => [d.slug, []]));
	for (const t of tiles) if (t.cost > 0) byDivision.get(t.division)?.push(t);

	const pos = new Map();
	const rows = divisions.map((d, r) => {
		const y = top + r * rh;
		const shelfY = Math.round(y + rh - figuresH);
		const members = byDivision.get(d.slug).sort(byCostThenId);
		const { levels } = stackLevels(members, (t) => x(t.cost) - s / 2, s, gap);
		for (const t of members) {
			pos.set(t.id, { x: x(t.cost) - s / 2, y: shelfY - lift - (levels.get(t.id) + 1) * (s + gap) + gap, s });
		}
		return {
			slug: d.slug,
			label: rowLabel(d, W),
			// in cost order, so the curve above the shelf is drawn from exactly these squares
			members,
			missions: members.length,
			y,
			h: rh,
			band: r % 2 === 1,
			shelfY,
			curveTop: y + nameH + padTop
		};
	});

	return { pos, x, rows, ticks: decadeTicks(...x.domain()), left, top, bottomY: top + divisions.length * rh };
}

/**
 * One division's missions in cost order with running shares of its top papers and of its
 * spending: the step lines the cost layout draws. `members` is a costLayout row's own list, so
 * the line and the squares under it can never fall out of step. share: (tile) => share of
 * division top papers.
 */
export function costCurve(members, share) {
	const costTotal = members.reduce((sum, t) => sum + t.cost, 0);
	const topTotal = members.reduce((sum, t) => sum + (share(t) ?? 0), 0);
	let cost = 0;
	let top = 0;
	return members.map((t) => {
		cost += t.cost;
		top += share(t) ?? 0;
		return { id: t.id, cost: t.cost, topShare: topTotal ? top / topTotal : 0, costShare: cost / costTotal };
	});
}

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

/**
 * Inner-square side as a fraction of the outer square: area is proportional to share. `floor`
 * keeps the smallest real contribution visible; it is the only departure from proportion.
 */
export function innerSide(share, maxShare, floor) {
	if (!share || !maxShare) return 0;
	return clamp(Math.sqrt(share / maxShare), floor, 1);
}

/**
 * Paper kinds for the missions at or under the threshold: one row per mission with papers (a
 * square, then its bar), in the given order; missions without papers in a strip underneath.
 */
export function kindsLayout(missions, W, H, { compact = false } = {}) {
	const rowIds = missions.filter((m) => m.papers > 0).map((m) => m.id);
	const emptyIds = missions.filter((m) => !(m.papers > 0)).map((m) => m.id);
	const headH = compact ? 56 : 44;
	const gap = compact ? 2 : 3;
	const left = compact ? 6 : 24;
	const nameW = compact ? 88 : 110; // "Lunar Prospector" whole at the 9–10px a phone row gets
	const valueW = compact ? 30 : 44;
	const right = compact ? 6 : 24;
	const x = left + nameW + 8;
	const label = 16;
	const n = Math.max(1, rowIds.length);

	const fit = (lines) => {
		const sh = emptyIds.length ? 8 + label + lines * 30 : 0; // first guess at the largest square
		const pitch0 = clamp(Math.floor((H - headH - sh) / n), 10, 30);
		const s0 = pitch0 - gap;
		const stripH = emptyIds.length ? 8 + label + lines * (s0 + gap) : 0;
		const pitch = clamp(Math.floor((H - headH - stripH) / n), 10, 30);
		const s = pitch - gap;
		const barX = x + s + 8;
		const perLine = Math.max(1, Math.floor((W - right - barX + gap) / (s + gap)));
		return { pitch, s, barX, perLine, lines: Math.ceil(emptyIds.length / perLine) || 1 };
	};
	let g = fit(1);
	if (g.lines > 1) g = fit(g.lines); // recompute once
	const { pitch, s, barX, perLine } = g;
	const barW = W - barX - valueW - right;

	const pos = new Map();
	const rows = rowIds.map((id, i) => {
		const y = headH + i * pitch;
		pos.set(id, { x, y, s });
		return { id, y, h: s };
	});
	let strip = null;
	if (emptyIds.length) {
		const y = headH + rowIds.length * pitch + 8 + label;
		emptyIds.forEach((id, i) => pos.set(id, { x: barX + (i % perLine) * (s + gap), y: y + Math.floor(i / perLine) * (s + gap), s }));
		strip = { y, ids: emptyIds };
	}
	return { rows, pos, s, pitch, headH, left, nameW, barX, barW, valueW, valueX: barX + barW + 6, strip, fontPx: clamp(s - 2, 9, 12) };
}

/**
 * One mission's square at the top left, its paper list underneath. On a phone the rows have
 * fixed pitches, `row` for a faded one-line paper and `hit` for a highlighted one (two-line
 * title and its meta line), which KindExample applies, so a list's height is known here.
 */
export function exampleLayout(id, W, H, { compact = false } = {}) {
	const s = compact ? 36 : 64;
	const x = compact ? 6 : 24;
	const y = compact ? 6 : 16;
	const rows = compact ? { row: 24, hit: 54 } : {};
	return { pos: new Map([[id, { x, y, s }]]), s, left: x, top: y, headRight: x + s + (compact ? 10 : 12), listY: y + s + (compact ? 8 : 22), ...rows };
}

/**
 * Icon arrays side by side, one per group: the same square size and the same number of rows,
 * so each block is as wide as its count is large. `groups` in display order, each with its ids
 * in reading order. The blocks sit `headH` below the top of the stage, which their labels use;
 * the whole is centred vertically when the stage has room to spare.
 */
export function splitLayout(W, H, groups, { headH }) {
	const compact = W < 600;
	const pad = compact ? 4 : 24;
	const gapX = compact ? 20 : 56;
	const gap = compact ? 2 : 3;
	const availW = W - pad * 2 - gapX * (groups.length - 1);
	const availH = H - headH - pad;
	let best = { pitch: 0, rows: 1, cols: groups.map((g) => g.ids.length) };
	for (let rows = 1; rows <= Math.max(1, ...groups.map((g) => g.ids.length)); rows++) {
		const cols = groups.map((g) => Math.max(1, Math.ceil(g.ids.length / rows)));
		const pitch = Math.floor(Math.min(availW / cols.reduce((a, b) => a + b, 0), availH / rows));
		if (pitch > best.pitch) best = { pitch, rows, cols };
	}
	const pitch = Math.min(best.pitch, compact ? 32 : 52);
	const s = pitch - gap;
	const widths = best.cols.map((c) => c * pitch - gap);
	const blockH = best.rows * pitch - gap;
	const y = headH + Math.max(0, Math.floor((availH - blockH) / 2));
	let x = Math.round((W - widths.reduce((a, b) => a + b, 0) - gapX * (groups.length - 1)) / 2);
	const pos = new Map();
	const blocks = groups.map((g, i) => {
		const cols = best.cols[i];
		g.ids.forEach((id, k) => pos.set(id, { x: x + (k % cols) * pitch, y: y + Math.floor(k / cols) * pitch, s }));
		const block = { key: g.key, x, y, w: widths[i], h: blockH, n: g.ids.length };
		x += widths[i] + gapX;
		return block;
	});
	return { pos, s, blocks, headH };
}

/**
 * One division's running total of top-10% papers on the cost axis (curveChart), sized to fill
 * the stage. Each bar is the mission's own packaged credit (`tile.top10`). Squares hang in the
 * rug under the cost axis.
 */
export function focusLayout(tiles, W, H, { division }) {
	const members = tiles.filter((t) => t.division === division && t.cost > 0).sort(byCostThenId);
	const facts = curveFacts(
		{ points: members.map((t) => ({ id: t.id, cost: t.cost })) },
		members.map((t) => ({ id: t.id, name: t.name, full: { top10: t.top10 ?? 0 } })),
		'full',
		10
	);
	const options = W < 600
		? { padTop: 40, mark: 9, gap: 2, gutter: 36, rightPad: 10, axisH: 22 }
		: { padTop: 56, mark: 15, gap: 2, gutter: 52, rightPad: 24, axisH: 26 };
	// the rug's depth is only known once the squares are placed: measure it, then give the plot the rest
	const rug = curveChart(facts, W, { ...options, plotH: 100 }).height - 100;
	const chart = curveChart(facts, W, { ...options, plotH: Math.max(80, H - rug - 6) });
	// a closer count scale than the division page's three ticks, so the bars use the height
	const y = scaleLinear().domain([0, facts.total || 1]).nice(6).range(chart.y.range());
	const path = facts.hasTop ? stepAfterPath(facts.points, { x: chart.x, y, x0: chart.x0, x1: chart.x1, value: (p) => p.total, round: (n) => Math.round(n * 10) / 10 }) : null;
	return { facts, chart: { ...chart, y, yTicks: y.ticks(6), path }, pos: new Map(chart.marks.map((m) => [m.id, { x: m.x, y: m.y, s: m.s }])) };
}
