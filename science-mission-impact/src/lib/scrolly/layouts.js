// Pure geometry for the mission squares. Each function takes the tiles and a stage size and
// returns where every square sits, plus whatever furniture (cells, axes) that state needs.
// No DOM, no Svelte: the scrolly and the preview image render from these.

import { scaleLinear, scaleLog, scaleSqrt } from 'd3-scale';
import { byCostThenId, costDomain, decadeTicks, stackLevels } from '../charts/costaxis.js';
import { inTier } from '../data/public.js';
import { curveFacts, curveChart } from '../charts/costcurve.js';
import { perDollarLayout, trendLine, rowGutter, rowLabel } from '../charts/perdollar.js';

// The per-dollar states live beside their chart, so the division pages load them without the rest
export { perDollarLayout, trendLine };

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

/**
 * The bar under a pointer on the division lanes (costLayout): in the band the pointer is over, the
 * mission with top-10% papers whose bar is nearest by x, within `reach` px. Null between bands or
 * where no bar is in reach.
 */
export function laneHit(lanes, px, py, reach = 12) {
	const row = lanes.rows.find((r) => py >= r.y && py < r.y + r.h);
	let best = null;
	let dist = reach;
	for (const t of row?.members ?? []) {
		if (!(t.top10PerYear > 0)) continue;
		const d = Math.abs(lanes.x(t.cost) - px);
		if (d <= dist) [best, dist] = [t, d];
	}
	return best?.id ?? null;
}

/** A yearly-rate scale's top: the first multiple of 10 above the highest of the tiles' `top10PerYear`. */
export const rateTop = (tiles) => (Math.floor(Math.max(0, ...tiles.map((t) => t.top10PerYear ?? 0)) / 10) + 1) * 10;

/**
 * The bins dissolve: division rows stay, and each square sits at its own cost on one log axis,
 * rising where neighbours would overlap. The space above each shelf carries that division's
 * missions' top-10% papers a year as bars, up to the row's own `rateTop`, against the same x.
 * `titled` keeps a strip over the lanes for the chart's title, as perDollarLayout's does; on a
 * phone it holds two lines, since LanesChart breaks its title there.
 */
export function costLayout(tiles, W, H, { divisions, titled = false }) {
	const compact = W < 600;
	const left = rowGutter(W);
	const right = compact ? 8 : 24;
	// the cost labels sit under the lanes, in the bottom margin
	const top = (compact ? 4 : 6) + (titled ? (compact ? 38 : 28) : 0);
	const bottom = compact ? 22 : 28;
	const rh = (H - top - bottom) / divisions.length;
	const nameH = compact ? 18 : 0;
	const figuresH = compact ? 15 : 22;
	const padTop = compact ? 3 : 10;
	const s = compact ? 5 : 9;
	const gap = 1;
	const lift = 2;

	// ticks are the decades that fall inside
	const x = scaleLog()
		.domain(costDomain(tiles))
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
			curveTop: y + nameH + padTop,
			// the rates step's own scale for this division's bars, shelf to curveTop
			rateTop: rateTop(members)
		};
	});

	return { pos, x, rows, ticks: decadeTicks(...x.domain()), left, top, bottomY: top + divisions.length * rh };
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
 * Mission outcomes by cost tier, every division pooled: a column per tier (`tiers`, lo < cost <= hi,
 * the Analysis page's own), each a block of squares several wide. Missions that met their goals
 * stack up from the zero line, those that failed or fell short (`tile.shortfall`) hang below it;
 * both grouped by division (slug order, Site.divisions'), so a division the story highlights is one
 * block in each column, outright failures before partial outcomes, then cheapest first. The block
 * width and square size are picked together for the largest squares that fit.
 */
export function tierOutcomeLayout(tiles, tiers, W, H) {
	const compact = W < 600;
	const pad = compact ? 4 : 16;
	const axis = compact ? 16 : 22; // a gutter left of the columns for the Success/Failure labels
	const padTop = compact ? 28 : 38; // the title's strip, then air over the tallest stack
	const footH = 52; // under each column: its cost range (two lines on a phone) and failure rate
	const mid = compact ? 6 : 10; // between the up and down stacks, where the zero line runs
	const gap = compact ? 1 : 2;
	const colW = (W - pad * 2 - axis) / tiers.length;
	const inner = colW - (compact ? 6 : 16); // air between neighbouring tiers
	const order = (a, b) => a.division.localeCompare(b.division) || (a.failed ? 0 : 1) - (b.failed ? 0 : 1) || byCostThenId(a, b);
	const columns = tiers.map(({ lo, hi }) => {
		const members = tiles.filter((t) => inTier({ lo, hi }, t.cost)).sort(order);
		return { lo, hi, up: members.filter((t) => !t.shortfall), down: members.filter((t) => t.shortfall) };
	});
	const avail = H - padTop - footH - mid;
	// the deepest stack on each side, in rows, at `per` squares wide
	const rowsFor = (per, side) => Math.max(...columns.map((c) => Math.ceil(c[side].length / per)));
	let best = { s: 0, per: 1 };
	for (let per = 2; per <= 8; per++) {
		const rows = rowsFor(per, 'up') + rowsFor(per, 'down');
		const s = Math.floor(Math.min((inner + gap) / per, (avail + gap * 2) / Math.max(1, rows))) - gap;
		if (s > best.s) best = { s, per };
	}
	const { per } = best;
	const s = Math.min(best.s, compact ? 16 : 32);
	const pitch = s + gap;
	const upRows = rowsFor(per, 'up');
	const downRows = rowsFor(per, 'down');
	const blockH = (upRows + downRows) * pitch - gap * 2 + mid;
	// stacks and footers kept together, the group centred on the stage
	const top = Math.round(padTop + Math.max(0, (avail + mid - blockH) / 2));
	const zeroY = top + upRows * pitch - gap + mid / 2;
	const pos = new Map();
	const cols = columns.map((c, i) => {
		const cx = pad + axis + colW * (i + 0.5);
		const x0 = Math.round(cx - (per * pitch - gap) / 2);
		c.up.forEach((t, k) => pos.set(t.id, { x: x0 + (k % per) * pitch, y: zeroY - mid / 2 - (Math.floor(k / per) + 1) * pitch + gap, s }));
		c.down.forEach((t, k) => pos.set(t.id, { x: x0 + (k % per) * pitch, y: zeroY + mid / 2 + Math.floor(k / per) * pitch, s }));
		return { lo: c.lo, hi: c.hi, cx, x: pad + axis + colW * i, w: colW, ok: c.up.length, short: c.down.length };
	});
	// top: where the tallest stack starts; footY: under the deepest, over the footers
	return { pos, zeroY, cols, left: pad + axis, right: W - pad, top, footY: top + blockH };
}

/**
 * One division's top-10% papers a year on the cost axis (curveChart), sized to fill the stage.
 * Given the same tiles as costLayout it spans the lanes' costs. Each bar is the mission's own
 * packaged rate (`tile.top10PerYear`); the scale runs to `rateTop`. Squares hang in the rug
 * under the cost axis.
 */
export function focusLayout(tiles, W, H, { division }) {
	const members = tiles.filter((t) => t.division === division && t.cost > 0).sort(byCostThenId);
	const facts = curveFacts(
		{ points: members.map((t) => ({ id: t.id, cost: t.cost })) },
		members.map((t) => ({ id: t.id, name: t.name, full: { top10: t.top10PerYear ?? 0 } })),
		'full',
		10
	);
	const options = W < 600
		? { padTop: 55, mark: 9, gap: 2, gutter: 36, rightPad: 10, axisH: 22 } // room for FocusChart's two-line title
		: { padTop: 56, mark: 15, gap: 2, gutter: 52, rightPad: 24, axisH: 26 };
	const domain = costDomain(tiles);
	// the rug's depth is only known once the squares are placed: measure it, then give the plot the rest
	const rug = curveChart(facts, W, { ...options, plotH: 100, domain }).height - 100;
	const chart = curveChart(facts, W, { ...options, plotH: Math.max(80, H - rug - 6), domain });
	const y = scaleLinear().domain([0, rateTop(members)]).range(chart.y.range());
	return { division, facts, chart: { ...chart, y, yTicks: y.ticks(4) }, pos: new Map(chart.marks.map((m) => [m.id, { x: m.x, y: m.y, s: m.s }])) };
}
