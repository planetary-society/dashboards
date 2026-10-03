/**
 * Model for RankHistogram: a mission's papers by citation rank within its division, in ten
 * equal bins. An evenly spread mission would put a tenth of its papers in every bin, which is
 * the reference line; a mission that skews right is cited more than the division's norm.
 */

import { ticks } from 'd3-array';

const sum = (list) => list.reduce((a, b) => a + (Number(b) || 0), 0);

/** @param {{ bins: number[], top1: number } | null} ranks bins[0] = bottom tenth … last = top tenth */
export function histogramModel(ranks) {
	if (!ranks) return null;
	const bins = ranks.bins.map((v) => Math.max(0, Number(v) || 0));
	const n = bins.length;
	const total = sum(bins);
	const even = total / n;
	// Whole-paper ticks; the axis ends on the first tick at or above the tallest bar.
	const raw = Math.max(1, ...bins, even);
	const step = ticks(0, raw, 3).filter(Number.isInteger);
	const gap = step.length > 1 ? step[1] - step[0] : Math.ceil(raw);
	const max = Math.ceil(raw / gap) * gap;
	const yTicks = [];
	for (let v = gap; v <= max; v += gap) yTicks.push(v);

	const top = bins[n - 1];
	const top1 = Math.min(top, Math.max(0, Number(ranks.top1) || 0));
	return {
		total,
		even,
		max,
		yTicks,
		edges: Array.from({ length: n + 1 }, (_, i) => (i * 100) / n),
		bars: bins.map((value, i) => ({
			from: (i * 100) / n,
			to: ((i + 1) * 100) / n,
			value,
			height: value / max,
			top: i === n - 1
		})),
		top1,
		top1Height: top1 / max,
		topShare: total > 0 ? top / total : null,
		topPercent: 100 / n
	};
}
