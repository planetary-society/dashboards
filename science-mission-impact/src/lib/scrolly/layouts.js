// Pure geometry for the mission squares. Each function takes the tiles and a stage size and
// returns where every square sits, plus whatever furniture (cells, axes) that state needs.
// No DOM, no Svelte: the scrolly and the preview image render from these.

import { scaleLinear, scaleLog, scaleSqrt } from 'd3-scale';
import { int } from '../format.js';
import { byCostThenId, decadeTicks, stackLevels } from '../charts/costaxis.js';

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
 * inside its year's footprint, height ∝ √papers. The largest few get a name label, nudged up
 * a line at a time until it clears the labels already placed. papers: (tile) => count.
 */
export function skylineLayout(tiles, rug, { papers = (t) => t.papersLifetime, labels = 4, compact = false } = {}) {
	const lineH = compact ? 13 : 15;
	const charW = compact ? 6 : 7;
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

	const placed = [];
	const ranked = [...columns].sort((a, b) => b.papers - a.papers || a.id.localeCompare(b.id)).slice(0, labels);
	for (const c of ranked) {
		const cx = c.x + w / 2;
		const bw = (`${c.name} ${int(c.papers)}`.length + 1) * charW;
		let anchor = 'middle';
		let bx = cx - bw / 2;
		if (bx < left) [anchor, bx] = ['start', c.x];
		else if (bx + bw > right) [anchor, bx] = ['end', c.x + w - bw];
		const x = anchor === 'middle' ? cx : anchor === 'start' ? c.x : c.x + w;
		const base = c.y - 4;
		let ly = base;
		const hits = (p) => bx < p.box.x + p.box.w + 4 && p.box.x < bx + bw + 4 && Math.abs(ly - p.y) < lineH;
		while (placed.some(hits)) ly -= lineH;
		placed.push({ id: c.id, name: c.name, papers: c.papers, x, y: ly, anchor, box: { x: bx, w: bw }, leader: ly === base ? null : { x: cx, y1: ly + 3, y2: c.y - 1 } });
	}
	return { columns, labels: placed, ground, top, left, right, x: rug.x, lineH };
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
	const nameH = stacked ? 16 : 0;
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
 * One division's time from project start on the cost axis. x is the cost layout's scale, so
 * its squares only move vertically. Years from the start of formulation to the first top-10%
 * paper run down from a project-start line; the missions that never produced one, including
 * failures, close the bottom in their own lane. Every other division is left unplaced.
 */
export function projectTimeLayout(tiles, W, H, { scope, x, left, division }) {
	const compact = W < 600;
	const top = compact ? 20 : 28;
	const s = compact ? 6 : 9;
	const gap = 1;
	const first = (t) => t.first[scope];
	const placed = tiles.filter((t) => t.division === division && t.cost > 0).sort(byCostThenId);
	const px = (t) => x(t.cost) - s / 2;

	const reached = placed.filter((t) => first(t).state === 'reached' && first(t).yearsFromFormulation != null);
	const never = placed.filter((t) => !reached.includes(t));
	const stack = stackLevels(never, px, s, gap);
	const neverTop = H - stack.depth * (s + gap) - (compact ? 18 : 22);

	const yMax = Math.max(5, Math.ceil(Math.max(0, ...reached.map((t) => first(t).yearsFromFormulation))));
	const y = scaleLinear().domain([0, yMax]).range([top + 10, neverTop - (compact ? 18 : 24)]).clamp(true);

	const pos = new Map();
	for (const t of reached) pos.set(t.id, { x: px(t), y: y(first(t).yearsFromFormulation) - s / 2, s });
	for (const t of never) pos.set(t.id, { x: px(t), y: neverTop + (compact ? 16 : 20) + stack.levels.get(t.id) * (s + gap), s });

	return { pos, x, y, left, top, neverTop, never: never.length, reached: reached.length, ticks: y.ticks(compact ? 3 : 5) };
}

/**
 * Citations per $100M of cost, one row per compared division on the cost layout's x. Each
 * square rises above its row's shelf by its rate on one shared log scale; a mission with no
 * citations sits on the shelf, lifted only off a neighbour. Rows are read on their own, as
 * everywhere else: fields cite at different rates, so the scale is shared only so a square
 * means the same height wherever it is drawn.
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
		return { slug: d.slug, label: W < 900 ? d.nav : d.name, missions: members.length, zeros: zeros.length, y: y0, h: rh, band: r % 2 === 1, shelfY, curveTop };
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
 * Paper kinds for the missions at or under the threshold: one row per mission with papers (a
 * square, then its bar), in the given order; missions without papers in a strip underneath.
 */
export function kindsLayout(missions, W, H, { compact = false } = {}) {
	const rowIds = missions.filter((m) => m.papers > 0).map((m) => m.id);
	const emptyIds = missions.filter((m) => !(m.papers > 0)).map((m) => m.id);
	const headH = compact ? 56 : 44;
	const gap = compact ? 2 : 3;
	const left = compact ? 6 : 24;
	const nameW = compact ? 64 : 110;
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

/** One mission's square at the top left, its paper list underneath. */
export function exampleLayout(id, W, H, { compact = false } = {}) {
	const s = compact ? 44 : 64;
	const x = compact ? 6 : 24;
	const y = compact ? 6 : 16;
	return { pos: new Map([[id, { x, y, s }]]), s, left: x, top: y, headRight: x + s + 12, listY: y + s + (compact ? 14 : 22) };
}
