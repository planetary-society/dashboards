// Geometry for the story's time-to-science chart (TIME_FORM, TIME_SCI): one band per cost group,
// every flown mission that reached a first high-impact paper a mission square at its own years on
// one shared axis, packed into a beeswarm, with the group's packaged median and its 95% interval;
// past an axis break, a "None" column holds the square of each mission without one. Both clocks are
// laid out at once, on one square size and one set of bands, so the squares can glide from one
// step's positions to the other's while the bands and the None column hold still. The stage's
// Squares draws the squares (`timeItems`); TimeSwarm draws everything else.

import { scaleLinear } from 'd3-scale';
import { rowGutter } from '../charts/perdollar.js';
import { tierLabel } from '../analysis/tiers.js';
import { textWidth } from '../analysis/charts-b.js';
import { yearsLabel } from '../format.js';
import { columnLabel } from './layouts.js';

export const CLOCKS = ['formulation', 'science'];

/** The None column's squares, dimmed: the picture still shows, but they read as missing the measure. */
export const NONE_OPACITY = 0.45;

/** Squares are drawn this much of the largest size that fits the stage. */
const SHRINK = 0.9;

/**
 * Offsets from a row's midline that pack squares of side `s` centred at `xs` (pixels) without
 * overlap, `gap` apart: placed in x order, each takes the free offset nearest the midline (above
 * first on a tie), so the swarm stays symmetric and its height shows where missions crowd.
 */
export function swarm(xs, s, gap = 1) {
	const d = s + gap;
	const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || a - b);
	const placed = [];
	const ys = new Array(xs.length);
	for (const i of order) {
		// a placed square that overlaps this one's column rules out the offsets within a pitch of its own
		const blocked = placed.filter(([px]) => Math.abs(xs[i] - px) < d).map(([, py]) => [py - d, py + d]);
		const free = (y) => blocked.every(([lo, hi]) => y <= lo + 1e-6 || y >= hi - 1e-6);
		const y = [0, ...blocked.flat()].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b).find(free);
		ys[i] = y;
		placed.push([xs[i], y]);
	}
	return ys;
}

/**
 * `groups`: the packaged `analysis.time.groups` (each with its `points`); `tiers`: the matching cost
 * groups. Between a title strip (two lines on a phone) and the axis, each band has a header strip
 * (on a phone the group's name, elsewhere in the lanes' gutter; and the median's value) over its
 * squares. A band is as tall as the taller of its two swarms or its None column needs, and what is
 * left over is shared out evenly; the square steps down from its preferred size until all of that
 * fits the stage (at the smallest, the bands share the room and a swarm may spill).
 */
export function timeSwarmLayout(groups, tiers, W, H) {
	const compact = W < 600;
	const left = rowGutter(W);
	const right = compact ? 4 : 16;
	const top = (compact ? 4 : 6) + (compact ? 38 : 28);
	const bottom = compact ? 36 : 42;
	const axisY = H - bottom;
	const headH = compact ? 16 : 18;
	const pad = compact ? 3 : 10;
	const gap = 1;
	const breakGap = compact ? 12 : 24; // between the year axis and the None column
	const pileInset = compact ? 5 : 8; // the None column's padding either side of its squares
	const lead = compact ? 10 : 8; // room left of the axis for its first tick label
	const labels = tiers.map((t) => tierLabel(t));
	const withouts = groups.map((g) => g.points.filter((p) => !p.reached));
	// a None column about half as wide as it is tall
	const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(...withouts.map((w) => w.length)) / 1.25)));

	const attempt = (s) => {
		const pitch = s + gap;
		const pileW = cols * pitch - gap + 2 * pileInset;
		const pileX = W - right - pileW;
		const x0 = left + lead;
		const x1 = Math.max(x0 + 1, pileX - breakGap);
		const clocks = Object.fromEntries(
			CLOCKS.map((clock) => {
				const values = groups.flatMap((g) => [...g.points.map((p) => p[clock]), g[clock].median, ...(g[clock].ci ?? [])]).filter((v) => v != null);
				const x = scaleLinear()
					.domain([Math.min(0, ...values), Math.max(1, ...values)])
					.nice()
					.range([x0, x1]);
				const rows = groups.map((g) => {
					const pts = g.points.filter((p) => p.reached && p[clock] != null);
					const xs = pts.map((p) => x(p[clock]));
					const ys = swarm(xs, s, gap);
					return { pts, xs, ys, half: Math.max(0, ...ys.map(Math.abs)) + s / 2 };
				});
				return [clock, { x, rows }];
			})
		);
		// each band's squares need the taller of its two swarms or its None column
		const needs = groups.map((_, i) => Math.max(s, ...CLOCKS.map((c) => 2 * clocks[c].rows[i].half), Math.ceil(withouts[i].length / cols) * pitch - gap));
		const spare = axisY - top - groups.length * (headH + 2 * pad) - needs.reduce((a, b) => a + b, 0);
		return { s, pitch, pileX, pileW, x0, x1, clocks, needs, spare };
	};

	// the preferred square: 18px on a desktop, big enough to make out its picture; 10px on a phone
	let fit = null;
	for (let s = compact ? 10 : 18; s >= 4; s -= 0.5) {
		fit = attempt(s);
		if (fit.spare >= 0) break;
	}
	// then a tenth smaller than the largest that fits (Casey's choice), packed again at that size
	fit = attempt(fit.s * SHRINK);
	const { s, pitch, pileX, pileW, x0, x1, clocks, needs, spare } = fit;
	// short of room even at the smallest square, the bands share it evenly instead
	const heights = spare >= 0 ? needs.map((n) => n + 2 * pad + headH + spare / groups.length) : groups.map(() => (axisY - top) / groups.length);

	let y = top;
	const rows = groups.map((g, i) => {
		const h = heights[i];
		const row = { label: labels[i], missions: g.missions, reached: g.reached, y, h, headY: y + headH / 2 + 1, y0: y + headH + pad, y1: y + h - pad };
		row.mid = (row.y0 + row.y1) / 2;
		y += h;
		return row;
	});
	// a phone's header strip starts with the group's name: a median's value keeps clear of it
	const nameEnd = (i) => (compact ? 4 + textWidth(labels[i], 12) + 8 : -Infinity);

	// the None column: the same squares, filled row by row and centred on the band's midline
	const piles = withouts.map((without, i) => {
		const lines = Math.ceil(without.length / cols);
		const first = rows[i].mid - ((lines - 1) * pitch) / 2;
		const marks = without.map((p, k) => ({ id: p.id, name: p.name, x: pileX + pileInset + s / 2 + (k % cols) * pitch, y: first + Math.floor(k / cols) * pitch }));
		return { marks };
	});

	const out = Object.fromEntries(
		CLOCKS.map((clock) => {
			const { x, rows: placed } = clocks[clock];
			const clockRows = groups.map((g, i) => {
				const { pts, xs, ys, half } = placed[i];
				const row = rows[i];
				// each mark by its centre
				const marks = pts.map((p, k) => ({ id: p.id, name: p.name, years: p[clock], x: xs[k], y: row.mid + ys[k] }));
				const { median, ci } = g[clock];
				if (median == null) return { marks, median: null };
				// the median line and the interval's shading span this clock's swarm, a little either side;
				// the value sits just over the line (in the header strip when the swarm fills its band)
				const y0 = Math.max(row.y0 - 2, row.mid - half - 6);
				const y1 = Math.min(row.y1 + 2, row.mid + half + 6);
				const ty = Math.max(row.headY, y0 - 9);
				const text = yearsLabel(median);
				const mx = x(median);
				// on a phone the value steps right of the group's name when they share the header strip
				const shift = ty < row.headY + 12 && mx - textWidth(text, 12) / 2 < nameEnd(i);
				return { marks, median: { x: mx, y0, y1, ty, text, tx: shift ? nameEnd(i) : mx, anchor: shift ? 'start' : 'middle', ci: ci ? ci.map(x) : null } };
			});
			// about four gridlines at any width: every five years on the build clock, every year on the science one
			return [clock, { x, ticks: x.ticks(4), rows: clockRows }];
		})
	);

	return { compact, W, H, left, right, top, axisY, s, x0, x1, pile: { x: pileX, w: pileW, cx: pileX + pileW / 2 }, rows, clocks: out, piles };
}

/**
 * The stage's squares on one clock, for Squares: each mission with a first high-impact paper at its
 * place in its swarm, solid; each without one in the None column, dimmed. Failures aren't here (they
 * have no time to science), so the caller hides them.
 */
export function timeItems(layout, clock) {
	const { s } = layout;
	const items = new Map();
	for (const row of layout.clocks[clock].rows) {
		for (const m of row.marks) items.set(m.id, { x: m.x - s / 2, y: m.y - s / 2, s, variant: 'solid', opacity: 1 });
	}
	for (const pile of layout.piles) {
		for (const m of pile.marks) items.set(m.id, { x: m.x - s / 2, y: m.y - s / 2, s, variant: 'solid', opacity: NONE_OPACITY });
	}
	return items;
}

/**
 * The mission under a pointer on one clock: the nearest square, the None column's included, within
 * a reach a little wider than a square (a finger is blunt). Null off the bands or where none is in reach.
 */
export function timeHit(layout, clock, px, py) {
	if (py < layout.top || py > layout.axisY) return null;
	const reach = Math.max(layout.s / 2 + 4, 9);
	let best = null;
	let dist = reach;
	const consider = (m) => {
		const e = Math.hypot(m.x - px, m.y - py);
		if (e <= dist) [best, dist] = [m.id, e];
	};
	for (const row of layout.clocks[clock].rows) row.marks.forEach(consider);
	for (const pile of layout.piles) pile.marks.forEach(consider);
	return best;
}

/** The name tag over the pointed-at mission: its years on this clock, or that it has no high-impact paper. */
export function timeLabel(layout, clock, id) {
	if (id == null) return null;
	const { s } = layout;
	const mark = layout.clocks[clock].rows.flatMap((r) => r.marks).find((m) => m.id === id);
	const held = mark ?? layout.piles.flatMap((p) => p.marks).find((m) => m.id === id);
	if (!held) return null;
	const text = mark ? `${mark.name}: ${yearsLabel(mark.years)}` : `${held.name}: no high-impact papers`;
	return columnLabel(text, { x: held.x - s / 2, w: s }, { left: 4, right: layout.W - 4, y: held.y - s / 2 - 6, compact: layout.compact });
}
