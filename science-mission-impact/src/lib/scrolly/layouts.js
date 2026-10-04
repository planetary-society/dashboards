// Pure geometry for the mission squares. Each function takes the tiles and a stage size and
// returns where every square sits, plus whatever furniture (cells, axes) that state needs.
// No DOM, no Svelte: the scrolly and the preview image render from these.

import { scaleLinear, scaleLog, scaleSqrt } from 'd3-scale';
import { byCostThenId, decadeTicks, stackLevels } from '../charts/costaxis.js';
import { timeFit } from '../charts/timetoscience.js';

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
 * papers: (tile) => count.
 */
export function skylineLayout(tiles, rug, { papers = (t) => t.papersLifetime, compact = false } = {}) {
	const lineH = compact ? 13 : 15;
	const w = compact ? 1 : 2;
	const { left, right, top, bottom: ground } = rug.chart;
	const withPapers = tiles.filter((t) => rug.pos.has(t.id) && papers(t) > 0);
	const most = Math.max(1, ...withPapers.map(papers));
	const y = scaleSqrt().domain([0, most]).range([0, ground - (top + 2 * lineH)]);

	const byYear = new Map();
	for (const t of withPapers) byYear.set(t.launchYear, [...(byYear.get(t.launchYear) ?? []), t]);
	const columns = [];
	for (const [year, group] of byYear) {
		const k = group.length;
		const pitch = k > 1 ? Math.min(w + 2, (rug.s - w) / (k - 1)) : 0;
		group.forEach((t, i) => {
			const cx = rug.x(year) + (i - (k - 1) / 2) * pitch;
			const h = Math.max(1, y(papers(t)));
			columns.push({ id: t.id, name: t.name, x: cx - w / 2, y: ground - h, w, h, papers: papers(t) });
		});
	}
	return { columns, ground, top, left, right, x: rug.x, lineH, reach: rug.s };
}

/**
 * The column under a pointer skimming the skyline: the nearest by x, within one year's footprint,
 * anywhere between the top of the chart and the ground. Null off the chart or in an empty year.
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
			label: W < 900 ? d.nav : d.name,
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
 * Failure by division: one row per division, its missions at or under the threshold packed
 * toward the divider on the left, the rest away from it on the right, all in one square size.
 * Tile order is kept. divisions: StoryFacts.failure.byDivision ({ division, name }).
 */
export function failureLayout(tiles, W, H, { divisions, threshold }) {
	const compact = W < 600;
	const stacked = W < 900;
	const left = stacked ? (compact ? 8 : 24) : rowGutter(W);
	const right = compact ? 8 : 24;
	const gapX = compact ? 16 : 40;
	const gap = compact ? 1 : 2;
	const headH = compact ? 52 : 76;
	// the name's line box (FailureLabels: 16px on a phone, 20px otherwise) plus clearance for its descenders
	const nameH = stacked ? (compact ? 16 : 26) : 0;
	const figuresH = compact ? 14 : 18;
	const rowGap = compact ? 6 : 10;
	const inner = W - left - right - gapX;
	const underW = Math.round(inner * 0.34);
	const overW = inner - underW;
	const underRight = left + underW;
	const overLeft = underRight + gapX;

	const groups = divisions.map((d) => {
		const members = tiles.filter((t) => t.division === d.division && t.cost > 0);
		return { d, under: members.filter((t) => t.cost <= threshold), over: members.filter((t) => t.cost > threshold) };
	});
	const cols = (width, s) => Math.max(1, Math.floor((width + gap) / (s + gap)));
	const body = (g, s) => Math.max(1, Math.ceil(g.under.length / cols(underW, s)), Math.ceil(g.over.length / cols(overW, s))) * (s + gap) - gap;
	const rowH = (g, s) => nameH + body(g, s) + figuresH + rowGap;
	let s = compact ? 18 : 28;
	while (s > 3 && headH + groups.reduce((sum, g) => sum + rowH(g, s), 0) > H) s--;

	const pos = new Map();
	let y = headH;
	const rows = groups.map((g, r) => {
		const h = rowH(g, s);
		const squaresTop = y + rowGap / 2 + nameH;
		const [cu, co] = [cols(underW, s), cols(overW, s)];
		g.under.forEach((t, k) => pos.set(t.id, { x: underRight - ((k % cu) + 1) * (s + gap) + gap, y: squaresTop + Math.floor(k / cu) * (s + gap), s }));
		g.over.forEach((t, k) => pos.set(t.id, { x: overLeft + (k % co) * (s + gap), y: squaresTop + Math.floor(k / co) * (s + gap), s }));
		const row = { division: g.d.division, label: g.d.name, y, h, band: r % 2 === 1, nameY: y + rowGap / 2, figuresY: squaresTop + body(g, s) + 2, under: g.under.length, over: g.over.length };
		y += h;
		return row;
	});
	return { pos, s, stacked, left, headH, bottomY: y, dividerX: underRight + gapX / 2, underRight, overLeft, rows };
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
 * Time on the cost axis. x is the cost layout's scale, so squares only move vertically. Below
 * the zero line: years of science before a first top-10% paper, with the missions that never
 * got one along the bottom. Above it: a hairline as tall as the mission took to build.
 */
export function timeLayout(tiles, W, H, { scope, x, left }) {
	const compact = W < 600;
	const top = compact ? 20 : 28;
	const s = compact ? 5 : 8;
	const gap = 1;
	const state = (t) => t.first[scope];
	const placed = tiles.filter((t) => t.cost > 0).sort(byCostThenId);
	const px = (t) => x(t.cost) - s / 2;

	const never = placed.filter((t) => state(t).state !== 'reached');
	const stack = stackLevels(never, px, s, gap);
	const neverH = stack.depth * (s + gap) + (compact ? 18 : 22);
	const neverTop = H - neverH;

	const reached = placed.filter((t) => state(t).state === 'reached');
	// Two measures share the zero line, each on its own scale: build years rise above it and
	// would otherwise squeeze the years of science below into a sliver.
	const ZERO_SPLIT = 0.4; // the zero line sits this far down the plot: build above, science below
	const build = placed.map((t) => t.yearsToBuild).filter((v) => v != null);
	const upMax = Math.ceil(Math.max(1, ...build));
	const downMax = Math.max(3, Math.ceil(Math.max(0, ...reached.map((t) => state(t).yearsFromScienceStart))));
	const zeroY = Math.round(top + 6 + (neverTop - 20 - top - 6) * ZERO_SPLIT);
	const up = scaleLinear().domain([0, upMax]).range([zeroY, top + 6]).clamp(true);
	const down = scaleLinear().domain([0, downMax]).range([zeroY, neverTop - 20]).clamp(true);
	const y = (v) => (v < 0 ? up(-v) : down(v));

	const pos = new Map();
	// papers from before science began (cruise, flyby) sit on the zero line
	for (const t of reached) pos.set(t.id, { x: px(t), y: y(Math.max(0, state(t).yearsFromScienceStart)) - s / 2, s });
	for (const t of never) pos.set(t.id, { x: px(t), y: neverTop + (compact ? 16 : 20) + stack.levels.get(t.id) * (s + gap), s });

	return {
		pos,
		x,
		y,
		left,
		neverTop,
		never: never.length,
		hairlines: placed.filter((t) => t.yearsToBuild != null).map((t) => ({ id: t.id, x: x(t.cost), y: y(-t.yearsToBuild) })),
		ticks: [...up.ticks(3).filter((t) => t > 0).map((t) => -t), ...down.ticks(compact ? 3 : 5)]
	};
}

/**
 * Citations per $100M of cost, one row per compared division on the cost layout's x. Each
 * square rises above its row's shelf by its rate on one shared log scale; a mission with no
 * citations sits on the shelf, lifted only off a neighbour. Rows are read on their own, as
 * everywhere else: fields cite at different rates, so the scale is shared only so a square
 * means the same height wherever it is drawn. Each row's `fit` is the least-squares line of log
 * rate on log cost over its missions with citations, across their cost range: a zero has no
 * place on a log scale, and any stand-in value would set the slope, so the shelf shows those
 * missions apart (the rate sentences still count them). Null below three cited missions.
 */
export function perDollarLayout(tiles, W, H, { divisions, x, left }) {
	const compact = W < 600;
	const top = compact ? 22 : 28;
	const bottom = compact ? 4 : 6;
	const rh = (H - top - bottom) / divisions.length;
	const nameH = compact ? 18 : 0;
	const shelfPad = compact ? 4 : 6;
	const padTop = compact ? 4 : 12;
	const s = compact ? 5 : 9;
	const gap = 1;
	const lift = 2;

	const rate = (t) => ((t.citations ?? 0) / t.cost) * 100;
	const slugs = new Set(divisions.map((d) => d.slug));
	const placed = tiles.filter((t) => slugs.has(t.division) && t.cost > 0 && t.citations != null);
	const rates = placed.map(rate).filter((r) => r > 0);
	// 0..1 up the row; half a decade of air above and below the data
	const scale = scaleLog()
		.domain(rates.length ? [Math.min(...rates) / 1.5, Math.max(...rates) * 1.5] : [1, 10])
		.range([0, 1])
		.clamp(true);

	const pos = new Map();
	const rows = divisions.map((d, r) => {
		const y0 = top + r * rh;
		const shelfY = Math.round(y0 + rh - shelfPad);
		const curveTop = y0 + nameH + padTop;
		const members = placed.filter((t) => t.division === d.slug).sort(byCostThenId);
		const zeros = members.filter((t) => !(rate(t) > 0));
		const { levels } = stackLevels(zeros, (t) => x(t.cost) - s / 2, s, gap);
		for (const t of members) {
			const v = rate(t);
			pos.set(t.id, {
				x: x(t.cost) - s / 2,
				y: v > 0 ? shelfY - scale(v) * (shelfY - curveTop) - s / 2 : shelfY - lift - (levels.get(t.id) + 1) * (s + gap) + gap,
				s
			});
		}
		const rateY = (v) => shelfY - scale(v) * (shelfY - curveTop);
		// timeFit regresses `months` on log10(cost); here that y is log10(rate)
		const cited = members.filter((t) => rate(t) > 0);
		const line = timeFit(cited.map((t) => ({ cost: t.cost, months: Math.log10(rate(t)) })));
		const at = (c) => ({ x: x(c), y: rateY(10 ** (line.intercept + line.slope * Math.log10(c))) });
		const [c1, c2] = [cited[0]?.cost, cited.at(-1)?.cost];
		const fit = line ? { x1: at(c1).x, y1: at(c1).y, x2: at(c2).x, y2: at(c2).y } : null;
		return { slug: d.slug, label: W < 900 ? d.nav : d.name, missions: members.length, zeros: zeros.length, y: y0, h: rh, band: r % 2 === 1, shelfY, curveTop, fit };
	});

	return { pos, x, rows, left, top, bottomY: top + divisions.length * rh, scale, rateTicks: decadeTicks(...scale.domain()) };
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
 * A waffle of `total` with `part` in the first boxes: the smallest unit from 100 up whose grid
 * keeps a readable pitch, a grid shaped like the stage below `top`, and a legend band reserved
 * under it. The box after the last full one carries `fraction` of a unit.
 */
export function waffleLayout(total, part, W, H, { top = 0, compact = false, legendH = compact ? 30 : 20 } = {}) {
	const margin = compact ? 8 : 24;
	const minPitch = compact ? 7 : 9;
	const availW = W - margin * 2;
	const availH = H - top - margin * 2 - legendH;
	const grid = (unit) => {
		const cells = Math.ceil(total / unit);
		const cols = Math.ceil(Math.sqrt((cells * availW) / availH));
		const rows = Math.ceil(cells / cols);
		return { unit, cells, cols, rows, pitch: Math.floor(Math.min(availW / cols, availH / rows)) };
	};
	const units = [100, 200, 500, 1000].map(grid);
	const g = units.find((u) => u.pitch >= minPitch) ?? units.at(-1);
	const gap = g.pitch < 8 ? 1 : 2;
	const width = g.cols * g.pitch - gap;
	const height = g.rows * g.pitch - gap;
	const partCells = part / g.unit;
	const full = Math.floor(partCells);
	const fraction = partCells - full;
	// a sliver under 5% of a box is not drawn
	const partial = fraction >= 0.05 && full < g.cells;
	const l = { ...g, part, size: g.pitch - gap, gap, x0: Math.round((W - width) / 2), y0: top + margin, full, fraction, partial, partCells, width, height, margin, legendH };
	return { ...l, ring: waffleRing(l, full + (partial ? 1 : 0)) };
}

/**
 * The outline 3px outside the first `n` boxes of a waffle in reading order: one row segment, a
 * block of whole rows, or that block with a shorter last row (clockwise points, corners rounded
 * 3px). The label sits 6px right of the first row, or under the ring when that end is within
 * 90px of the grid's right edge.
 */
export function waffleRing({ x0, y0, cols, pitch, size, width }, n, { offset = 3, radius = 3 } = {}) {
	if (!(n > 0)) return null;
	const rows = Math.ceil(n / cols);
	const last = n - (rows - 1) * cols; // boxes in the last row, 1..cols
	const right = (k) => x0 + (k - 1) * pitch + size + offset; // outside edge of k boxes from the left
	const bottom = (r) => y0 + (r - 1) * pitch + size + offset; // outside edge of r rows from the top
	const [L, T] = [x0 - offset, y0 - offset];
	const R = right(rows > 1 ? cols : n);
	const points =
		rows > 1 && last < cols
			? [[L, T], [R, T], [R, bottom(rows - 1)], [right(last), bottom(rows - 1)], [right(last), bottom(rows)], [L, bottom(rows)]]
			: [[L, T], [R, T], [R, bottom(rows)], [L, bottom(rows)]];
	// each corner: a line to `radius` short of it, then a quadratic through it (convex or concave alike)
	const toward = ([x, y], [tx, ty]) => [x + Math.sign(tx - x) * radius, y + Math.sign(ty - y) * radius];
	const ends = points.map((p, i) => [toward(p, points.at(i - 1)), toward(p, points[(i + 1) % points.length])]);
	const d = `M${ends[0][0]}${points.map((p, i) => `${i ? `L${ends[i][0]}` : ''}Q${p} ${ends[i][1]}`).join('')}Z`;
	const below = x0 + width - R < 90;
	return { points, d, label: below ? { x: L, y: bottom(rows) + 6, below } : { x: R + 6, y: y0 + size / 2, below } };
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
