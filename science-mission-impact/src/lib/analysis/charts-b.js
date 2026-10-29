// Geometry for three Analysis page charts: RateBoxes, EfficiencyHeatmap and StandoutScatter.
// N50 per $M runs on a log scale, but failures and uncited missions are measured zeros, which a
// log scale has no place for, so the box plots and the scatter both give zero its own lane
// beneath a dashed break (rateAxis). Pure: values in, coordinates out.

import { scaleLog } from 'd3-scale';
import { interpolateLab, piecewise } from 'd3-interpolate';
import { decadeTicks } from '../charts/costaxis.js';

const clean = (v) => Number(v.toPrecision(12));

/** Rough rendered width of a Poppins label; only used to decide whether a label fits its room. */
export const textWidth = (s, size) => s.length * size * 0.55;

/** A rate as a label: two decimals below 10, one above; a tiny rate keeps one significant digit rather than print "0.00". */
export function rateText(v) {
	if (v == null) return '—';
	if (v === 0) return '0';
	if (v >= 10) return v.toFixed(1);
	return v < 0.005 ? String(+v.toPrecision(1)) : v.toFixed(2);
}

/**
 * The rate axis, shared by the box plots and the scatter: log10 from the decade at or below the
 * smallest positive value to the decade at or above the largest, from `top` down to the break;
 * zeros sit in a lane `lane` px tall ending at `bottom`, below a dashed break midway through
 * `gap`. `at(v)` maps any value, zero included, to the centre of the zero lane.
 */
export function rateAxis(values, top, bottom, { lane = 22, gap = 12 } = {}) {
	const pos = values.filter((v) => v > 0);
	const lo = pos.length ? clean(10 ** Math.floor(Math.log10(Math.min(...pos)))) : 1;
	let hi = pos.length ? clean(10 ** Math.ceil(Math.log10(Math.max(...pos)))) : 10;
	if (hi <= lo) hi = clean(lo * 10); // every value on one decade line: give it a decade of room
	const laneTop = bottom - lane;
	const y = scaleLog().domain([lo, hi]).range([laneTop - gap, top]);
	const zeroY = laneTop + lane / 2;
	return { y, at: (v) => (v > 0 ? y(v) : zeroY), zeroY, laneTop, laneBottom: bottom, breakY: laneTop - gap / 2, ticks: decadeTicks(lo, hi) };
}

/** "0.01", "0.1", "1", "10": decade values print as written. */
export const rateTick = (v) => String(v);

/** A stable number in [0, 1) for a key (FNV-1a, then a final mix so neighbouring keys don't line up). Dots hold still across renders and builds. */
export function jitter(key) {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
	h ^= h >>> 15;
	h = Math.imul(h, 2246822507);
	h ^= h >>> 13;
	return (h >>> 0) / 2 ** 32;
}

/**
 * A packaged spread's box on a rate axis: y for q1, q3, the median and the whisker ends. A zero
 * q1 or lower whisker ends at `floor` (the bottom of the zero lane), so the box takes in every
 * zero dot; a zero median sits on the lane's centre line, with the dots. Whiskers
 * never stop inside the box: with few missions the farthest value within the fence can fall
 * short of a quartile, and then the whisker ends at the box edge (as matplotlib draws it).
 */
export function boxMarks(spread, at, floor = at(0)) {
	if (!spread?.missions) return null;
	const [w0, w1] = spread.whiskers;
	const low = (v) => (v > 0 ? at(v) : floor);
	return { q1: low(spread.q1), q3: at(spread.q3), median: at(spread.median), lo: low(Math.min(w0, spread.q1)), hi: at(Math.max(w1, spread.q3)) };
}

/**
 * Box plots of rates in clusters (cost groups) of one or more boxes. Every value is a dot,
 * jittered across its box by a key of cluster, box and index. Under each box go the box label
 * (several per cluster, when it fits), n and the median, then the cluster label. Labels that
 * don't fit fall back: the zero count moves from beside the zero lane to the rows under the box,
 * and when "median 1.73" is wider than a box's room the rows lose their words to a header in the
 * left gutter ("n", "median"); box labels that don't fit are left to the legend.
 */
export function rateBoxesLayout(clusters, W) {
	const most = Math.max(1, ...clusters.map((c) => c.boxes.length));
	const compact = W < 420;
	const left = 46;
	const right = 4;
	const top = 26;
	const lane = 24;
	const slot = Math.max(0, W - left - right) / Math.max(1, clusters.length);
	const pitch = (slot * (most > 1 ? 0.88 : 0.8)) / most;
	const bw = Math.min(72, pitch * (most > 1 ? 0.76 : 0.5));
	const r = compact ? 2.2 : 2.6;
	const plotBottom = top + Math.round(Math.min(340, Math.max(220, W * 0.6)));

	const values = clusters.flatMap((c) => c.boxes.flatMap((b) => [...b.values, b.spread.q3 ?? 0, ...(b.spread.whiskers ?? [])]));
	const axis = rateAxis(values, top, plotBottom, { lane, gap: 18 });
	const laneJitter = lane - 2 * r - 4;

	const boxes = clusters.flatMap((c, ci) => {
		const cx = left + slot * (ci + 0.5);
		return c.boxes.map((b, bi) => {
			const x = cx + (bi - (c.boxes.length - 1) / 2) * pitch;
			const dots = b.values.map((v, i) => {
				const key = `${ci}/${b.key}/${i}`;
				return { x: x + (jitter(key) - 0.5) * bw * 0.8, y: v > 0 ? axis.y(v) : axis.zeroY + (jitter(`${key}/0`) - 0.5) * laneJitter };
			});
			return { ...b, id: `${ci}/${b.key}`, cluster: ci, x, marks: boxMarks(b.spread, axis.at, axis.laneBottom - 2), dots };
		});
	});

	// room to the right of each box, up to the next box or the chart's edge
	const room = boxes.map((b, i) => (i + 1 < boxes.length ? boxes[i + 1].x - bw / 2 : W) - (b.x + bw / 2));
	const beside = boxes.every((b, i) => !b.spread.zeros || room[i] - 5 >= textWidth(`${b.spread.zeros} at 0`, 11));
	const inline = boxes.every((b) => textWidth(`median ${rateText(b.spread.median)}`, 12) <= pitch - 6);
	const boxLabels = most > 1 && boxes.every((b) => !b.label || textWidth(b.label, 11) <= pitch - 4);

	const line = 15;
	const kinds = [...(boxLabels ? ['label'] : []), 'n', 'median', ...(!beside && boxes.some((b) => b.spread.zeros) ? ['zeros'] : [])];
	const rows = kinds.map((kind, i) => ({ kind, y: plotBottom + 18 + i * line }));
	const clusterY = plotBottom + 18 + kinds.length * line + 8;
	return {
		W,
		H: clusterY + 8,
		left,
		right: W - right,
		r,
		bw,
		axis,
		boxes,
		beside,
		inline,
		rows,
		clusterY,
		clusters: clusters.map((c, ci) => ({ label: c.label, x: left + slot * (ci + 0.5) }))
	};
}

// The heatmap's ramp, clamped to [0, 2]: near-black with a hint of blue at 0 (so an empty share
// still reads as a cell on the black page), Neptune at 1, Neptune light at 2 and beyond.
const ramp = piecewise(interpolateLab, ['#0b1c29', '#037cc2', '#bfdef0']);

/** A ratio's cell colour, as "rgb(r, g, b)". */
export const heatColor = (ratio) => ramp(Math.min(1, Math.max(0, ratio / 2)));

/** CSS gradient stops for the legend, sampled from the same ramp so the bar matches the cells. */
export const heatStops = (n = 9) => Array.from({ length: n }, (_, i) => heatColor((2 * i) / (n - 1))).join(', ');

const channel = (c) => {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Black or white text on an "rgb(r, g, b)" fill, whichever has the higher WCAG contrast. */
export function textOn(fill) {
	const [r, g, b] = fill.match(/\d+(\.\d+)?/g).map(Number);
	const L = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
	return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#000' : '#fff';
}

/**
 * Nudge labels apart vertically, greedily from the top: a label moves down below any placed
 * label whose horizontal extent it shares. `labels`: { x0, x1, y } (y the text's centre); returns
 * the new ys in input order, clamped to [lo, hi]. Meant for a handful of labels per panel.
 */
export function dodge(labels, h, [lo, hi]) {
	const order = labels.map((l, i) => i).sort((a, b) => labels[a].y - labels[b].y);
	const placed = [];
	const ys = new Array(labels.length);
	for (const i of order) {
		const l = labels[i];
		let y = Math.max(lo, l.y);
		for (let moved = true; moved; ) {
			moved = false;
			for (const p of placed) {
				if (p.x0 < l.x1 && l.x0 < p.x1 && Math.abs(p.y - y) < h) {
					y = p.y + h;
					moved = true;
				}
			}
		}
		ys[i] = Math.min(hi, y);
		placed.push({ x0: l.x0, x1: l.x1, y: ys[i] });
	}
	return ys;
}

/**
 * Small multiples of N50 per $M against cost, one panel per division, on shared axes: 2×2 from
 * 640px, one column below. Each panel is its own SVG in local coordinates. Zeros sit in the zero
 * lane, spread a little up and down by id so missions at one cost don't hide each other.
 * Standouts are labelled beside their marks (left of them near the right edge) and nudged apart.
 */
export function standoutLayout(missions, standouts, divisions, referenceCost, W) {
	const cols = W >= 640 ? 2 : 1;
	const gapX = 32;
	const pw = (W - gapX * (cols - 1)) / cols;
	const left = 34;
	const right = 8;
	const titleH = 24;
	const lane = 18;
	const plotBottom = titleH + Math.round(Math.min(250, Math.max(190, pw * 0.62)));
	const ph = plotBottom + 22;

	const slugs = new Set(divisions.map((d) => d.division));
	const shown = missions.filter((m) => slugs.has(m.division));
	const costs = shown.map((m) => m.cost);
	const x = scaleLog()
		.domain(costs.length ? [Math.min(...costs) / 1.4, Math.max(...costs) * 1.4] : [1, 10])
		.range([left + 4, pw - right - 4]);
	const axis = rateAxis(shown.map((m) => m.rate), titleH + 8, plotBottom, { lane, gap: 16 });
	const labelH = 13;

	const panels = divisions.map((d, i) => {
		const entry = standouts.find((s) => s.division === d.division);
		const ids = new Set(entry?.missions.map((m) => m.id) ?? []);
		const points = shown
			.filter((m) => m.division === d.division)
			.map((m) => ({
				...m,
				x: x(m.cost),
				y: m.rate > 0 ? axis.y(m.rate) : axis.zeroY + (jitter(m.id) - 0.5) * (lane - 8),
				kind: m.failed ? 'failed' : ids.has(m.id) ? 'standout' : m.cost <= referenceCost ? 'under' : 'over'
			}));
		// standouts drawn last, so their rings sit on top
		const rank = { over: 0, under: 1, failed: 2, standout: 3 };
		points.sort((a, b) => rank[a.kind] - rank[b.kind]);
		const named = points.filter((p) => p.kind === 'standout');
		const boxes = named.map((p) => {
			const w = textWidth(p.name, 11);
			const flip = p.x + 8 + w > pw - right;
			return { x0: flip ? p.x - 8 - w : p.x + 8, x1: flip ? p.x - 8 : p.x + 8 + w, y: p.y, anchor: flip ? 'end' : 'start', x: flip ? p.x - 8 : p.x + 8 };
		});
		const ys = dodge(boxes, labelH, [titleH + 8, axis.breakY - 8]);
		return {
			division: d.division,
			name: d.name,
			overMedian: entry?.overMedian ?? null,
			medianY: entry?.overMedian > 0 ? axis.y(entry.overMedian) : null,
			standouts: entry?.missions ?? [],
			points,
			labels: named.map((p, k) => ({ id: p.id, text: p.name, x: boxes[k].x, y: ys[k], anchor: boxes[k].anchor }))
		};
	});

	return { cols, gapX, pw, ph, left, right: pw - right, titleH, x, axis, ticks: decadeTicks(...x.domain()), panels };
}
