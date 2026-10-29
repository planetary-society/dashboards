// Geometry for the Analysis page's CLPS figure (ClpsScatter): papers per $1B at the CLPS landers'
// age against life-cycle cost. Surface missions are dots (failures X's at zero), each lander an
// open diamond, the landers pooled one large diamond. Every mark is named, and labels are placed
// greedily so none overlaps another label or any mark. Pure: values in, coordinates out.

import { scaleLinear, scaleLog } from 'd3-scale';
import { costTicks } from '../charts/costaxis.js';
import { moneyTick } from '../format.js';

/** Papers per $1B of a $M cost; null without a positive cost. */
export const perBillion = (papers, cost) => (cost > 0 ? papers / (cost / 1000) : null);

/** The figure's height at every width (see clpsScatterLayout), so a stage can be reserved before it has a width. */
export const CLPS_SCATTER_HEIGHT = 430;

/** Name labels are 11px on 13px lines; the pooled label's two bold 12px lines sit 15px apart. */
const LINE = 13;
const POOLED_LINE = 15;
/**
 * Rough rendered label widths. Mission names run to capitals (DART, LCROSS), which Poppins 500
 * sets at about 0.65em, wider than charts-b's textWidth assumes, and a label drawn wider than its
 * box would overlap a neighbour; 0.6em is within ~1px on the widest names here. The pooled label
 * is bold (synthesized from the 500 face) and mostly lowercase, set at about 0.52em.
 */
const nameWidth = (s) => s.length * 11 * 0.6;
const boldWidth = (s) => s.length * 12 * 0.58;

const overlaps = (a, b, pad = 0) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

/**
 * Place labels in order, each in the first spot that stays inside `bounds` and clear of every
 * mark and every label already placed: right of its mark, left, off its upper corners, above, off
 * its lower corners, below, then right or left nudged up or down a line at a time (up first) with
 * a leader line back to the mark. A label with no clear spot takes its first spot clamped into
 * bounds (`clear: false`).
 *
 * items: [{ id, x, y, r, w, lines: string[], lineH }] (x, y the mark's centre, r its half-size).
 * marks: [{ x, y, r }]. bounds: { x0, x1, y0, y1 }.
 */
export function placeLabels(items, marks, bounds, { maxNudge = 8 } = {}) {
	const markBoxes = marks.map((m) => ({ x0: m.x - m.r, x1: m.x + m.r, y0: m.y - m.r, y1: m.y + m.r }));
	const placed = [];
	return items.map((it) => {
		const h = it.lines.length * it.lineH;
		const box = (x0, cy, anchor, nudged) => ({ x0, x1: x0 + it.w, y0: cy - h / 2, y1: cy + h / 2, cy, anchor, nudged });
		const side = (dir, dy) => {
			const push = dy ? 4 : 0; // a nudged label stands off a little, so its leader line shows
			return box(dir > 0 ? it.x + it.r + 4 + push : it.x - it.r - 4 - push - it.w, it.y + dy, dir > 0 ? 'start' : 'end', dy !== 0);
		};
		// a corner spot: the label's near corner just off the mark's, above (-1) or below (+1)
		const corner = (dir, v) => box(dir > 0 ? it.x + it.r : it.x - it.r - it.w, it.y + v * (it.r + 1 + h / 2), dir > 0 ? 'start' : 'end', false);
		const centred = (v) => box(it.x - it.w / 2, it.y + v * (it.r + 3 + h / 2), 'middle', false);
		const spots = [side(1, 0), side(-1, 0), corner(1, -1), corner(-1, -1), centred(-1), corner(1, 1), corner(-1, 1), centred(1)];
		for (let k = 1; k <= maxNudge; k++) for (const dy of [-k * LINE, k * LINE]) spots.push(side(1, dy), side(-1, dy));
		const inside = (b) => b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1;
		const free = (b) => !markBoxes.some((m) => overlaps(b, m, 1)) && !placed.some((p) => overlaps(b, p, 2));
		let spot = spots.find((b) => inside(b) && free(b));
		const clear = Boolean(spot);
		if (!spot) {
			const first = spots[0];
			const dx = Math.min(0, bounds.x1 - first.x1) + Math.max(0, bounds.x0 - first.x0);
			const dy = Math.min(0, bounds.y1 - first.y1) + Math.max(0, bounds.y0 - first.y0);
			spot = { ...first, x0: first.x0 + dx, x1: first.x1 + dx, y0: first.y0 + dy, y1: first.y1 + dy, cy: first.cy + dy };
		}
		placed.push(spot);
		const tx = spot.anchor === 'start' ? spot.x0 : spot.anchor === 'end' ? spot.x1 : (spot.x0 + spot.x1) / 2;
		let leader = null;
		if (spot.nudged) {
			// from the mark's edge to the label's near edge, level with its middle
			const lx = spot.anchor === 'start' ? spot.x0 - 2 : spot.x1 + 2;
			const len = Math.hypot(lx - it.x, spot.cy - it.y);
			const k = (it.r + 2) / len;
			leader = { x1: it.x + (lx - it.x) * k, y1: it.y + (spot.cy - it.y) * k, x2: lx, y2: spot.cy };
		}
		const lines = it.lines.map((text, i) => ({ text, y: spot.cy + (i - (it.lines.length - 1) / 2) * it.lineH }));
		return { id: it.id, x0: spot.x0, x1: spot.x1, y0: spot.y0, y1: spot.y1, anchor: spot.anchor, tx, lines, leader, clear };
	});
}

/**
 * The figure at width W. `clps` is Site.clps: the surface missions and the pooled landers come from
 * `clps.surface`, each lander from `clps.missions` (its papers to date over its own cost). Missions
 * or landers without a cost are left out (`unplaced` names the missions). y is linear from 0, with
 * zero lifted off the cost axis so the failures' X's clear it; x is log cost.
 */
export function clpsScatterLayout(clps, W) {
	const { surface } = clps;
	const left = 30;
	const right = 6;
	const top = 8;
	// One height at every width, so taller than wide on a phone: the low-rate corner (landers,
	// failures, the pooled diamond) needs that room for its labels.
	const H = CLPS_SCATTER_HEIGHT;
	const bottom = H - 22; // the cost axis, its tick labels below

	const costed = surface.missions.filter((m) => m.cost > 0);
	const landers = clps.missions.filter((m) => m.cost > 0 && m.papers != null);
	const pooledRate = perBillion(surface.clps.papers, surface.clps.cost);
	const costs = [...costed, ...landers].map((m) => m.cost).concat(pooledRate == null ? [] : [surface.clps.cost]);
	const x = scaleLog()
		.domain(costs.length ? [Math.min(...costs) / 1.4, Math.max(...costs) * 1.4] : [1, 10])
		.range([left + 4, W - right - 4]);
	const rates = [...costed, ...landers].map((m) => perBillion(m.papers, m.cost)).concat(pooledRate ?? []);
	const count = 6;
	const y = scaleLinear().domain([0, Math.max(1, ...rates)]).nice(count).range([bottom - 10, top]);

	const points = costed.map((m) => {
		const rate = perBillion(m.papers, m.cost);
		return { id: m.id, name: m.name, kind: m.failed ? 'failed' : (m.selection ?? 'unknown'), papers: m.papers, cost: m.cost, rate, x: x(m.cost), y: y(rate), r: 4.5 };
	});
	const diamonds = landers.map((m) => {
		const rate = perBillion(m.papers, m.cost);
		return { id: m.id, name: m.name, papers: m.papers, cost: m.cost, rate, x: x(m.cost), y: y(rate), r: 5 };
	});
	const n = clps.missions.length;
	const pooled = pooledRate == null ? null
		: { n, papers: surface.clps.papers, cost: surface.clps.cost, rate: pooledRate, x: x(surface.clps.cost), y: y(pooledRate), r: 10 };

	const pooledLines = pooled ? [`CLPS (${n} landers)`, `${pooled.papers} papers to date`] : [];
	const big = pooled ? [{ id: 'clps', x: pooled.x, y: pooled.y, r: pooled.r, w: Math.max(...pooledLines.map(boldWidth)), lines: pooledLines, lineH: POOLED_LINE }] : [];
	const named = (list) => list.map((p) => ({ id: p.id, x: p.x, y: p.y, r: p.r, w: nameWidth(p.name), lines: [p.name], lineH: LINE }));
	const marks = [...points, ...diamonds, ...(pooled ? [pooled] : [])];
	const bounds = { x0: left, x1: W - right, y0: 0, y1: bottom - 2 };
	// Greedy placement depends on the order, so try a few and keep the best: fewest labels left
	// unclear, then the least leader line (the first such order on a tie).
	const small = named([...diamonds, ...points]);
	const bottomUp = [...small].sort((a, b) => b.y - a.y);
	const orders = [
		[...big, ...named(diamonds), ...named(points)],
		[...big, ...named(points), ...named(diamonds)],
		[...big, ...bottomUp],
		[...named(diamonds), ...big, ...named(points)],
		[...bottomUp, ...big],
		[...named(points), ...big, ...named(diamonds)]
	];
	const score = (ls) => ls.filter((l) => !l.clear).length * 1e6 + ls.reduce((s, l) => s + (l.leader ? Math.hypot(l.leader.x2 - l.leader.x1, l.leader.y2 - l.leader.y1) : 0), 0);
	let labels = null;
	for (const order of orders) {
		const tried = placeLabels(order, marks, bounds);
		if (!labels || score(tried) < score(labels)) labels = tried;
	}

	return {
		W,
		H,
		left,
		right: W - right,
		top,
		bottom,
		x,
		y,
		// a tick label that would run off either edge of the figure goes unlabelled
		xTicks: costTicks(x, 40).map((t) => ({ ...t, label: t.label && Math.abs(x(t.value) - W / 2) + moneyTick(t.value).length * 3.3 <= W / 2 })),
		yTicks: y.ticks(count),
		points,
		landers: diamonds,
		pooled,
		labels,
		unplaced: surface.missions.filter((m) => !(m.cost > 0)).map((m) => m.id)
	};
}
