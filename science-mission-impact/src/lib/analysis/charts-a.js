// Geometry for two Analysis page figures: the failure grid (mission outcomes by cost tier and
// division) and the time bars (years to the first top-10% paper by cost tier). The components only
// draw what these return.

import { scaleLinear } from 'd3-scale';
import { tierLabel } from './tiers.js';
import { textWidth } from './charts-b.js';
import { yearsLabel } from '../format.js';

/**
 * Outcome marks per division (rows, in `divisions` order) and cost tier (columns): succeeded,
 * then partial failures or successes, then failures, so each cell reads in that order as it wraps.
 * `totals` is each tier's footer: its shortfall rate and "shortfalls of missions".
 */
export function failureGrid(failures, divisions) {
	const rows = divisions.map((d) => ({
		slug: d.slug,
		name: d.name,
		nav: d.nav,
		cells: failures.tiers.map((t) => {
			const { ok = 0, partial = 0, failed = 0 } = t.byDivision.find((b) => b.division === d.slug) ?? {};
			return { ok, partial, failed, marks: [...Array(ok).fill('solid'), ...Array(partial).fill('partial'), ...Array(failed).fill('lost')] };
		})
	}));
	const totals = failures.tiers.map((t) => ({ missions: t.missions, ok: t.ok, partial: t.partial, failed: t.failed, shortfall: t.failed + t.partial, rate: t.rate }));
	return { rows, totals };
}

/** Squares per line in a failure-grid cell: its CSS grid wraps there at every width, so a row is as tall as ceil(n / 5) lines of its fullest cell. */
export const PER_LINE = 5;

const breakPad = 4; // air either side of a value in its broken whisker
const minStub = 6; // the shortest whisker piece worth drawing either side of the value

/**
 * Two bars per tier on one years axis from 0 (further left only if a median is negative): the
 * median from formulation start, thick, and from the start of science, thin, each with its value
 * at the bar's outer end. Rows have a fixed height, so the height does not depend on `width`: at
 * width 0 (the server) the layout still says how tall a stage to reserve. A tier with no first
 * top-10% paper yet draws no bars. `ci` adds each median's packaged 95% interval as a whisker
 * (`{ x0, x1, segments }`, null when the tier has too few missions for one) and the axis spans the
 * whiskers. The value then sits centred in its whisker, the line broken around it (`segments`, the
 * pieces left to draw); a whisker too short to hold it stays whole, the value past its outer end.
 */
export function timeLayout(tiers, time, width, { pitch = 54, only = null, ci = false } = {}) {
	const labels = tiers.map((t) => tierLabel(t));
	// tier labels are mostly digits, $ and M, wider than the average character
	const left = Math.ceil(Math.max(...labels.map((l) => l.length)) * 7.6) + 14;
	const thick = 14, thin = 7, gap = 4, top = 6;
	const valueRoom = 52; // "11.5 yr" at 12px, and air
	const spread = (m) => [m.median, ...(ci && m.ci ? m.ci : [])];
	const values = time.tiers.flatMap((t) => (t.reached > 0 ? [...spread(t.formulation), ...spread(t.science)] : [])).filter((v) => v != null);
	const x = scaleLinear()
		.domain([Math.min(0, ...values), Math.max(1, ...values)])
		.nice()
		.range([left, Math.max(left + 1, width - valueRoom)]);
	const rows = time.tiers.map((t, i) => {
		const y0 = top + i * pitch;
		const bar = ({ median, ci: interval }, y, h) => {
			if (median == null) return null;
			const [a, b] = [x(0), x(median)];
			const out = median < 0;
			const base = { median, x: Math.min(a, b), w: Math.abs(b - a), y, h, cy: y + h / 2, whisker: null, tx: out ? b - 5 : b + 5, anchor: out ? 'end' : 'start' };
			if (!ci || !interval) return base;
			const [x0, x1] = interval.map(x); // [lo, hi] on an increasing scale
			const half = textWidth(yearsLabel(median), 12) / 2 + breakPad;
			const mid = (x0 + x1) / 2;
			if (x1 - x0 >= 2 * (half + minStub)) {
				return { ...base, whisker: { x0, x1, segments: [[x0, mid - half], [mid + half, x1]] }, tx: mid, anchor: 'middle' };
			}
			// too short to break: whole, the value clearing whichever runs further out, the bar or its whisker
			const end = out ? Math.min(b, x0) : Math.max(b, x1);
			return { ...base, whisker: { x0, x1, segments: [[x0, x1]] }, tx: out ? end - 5 : end + 5 };
		};
		const none = t.reached === 0;
		// one measure alone (the story's steps): both draw as the same thick bar in the same place
		const h = only ? thick : thick + gap + thin;
		return {
			label: labels[i],
			none,
			labelY: y0 + h / 2,
			formulation: none ? null : bar(t.formulation, y0, thick),
			science: none ? null : only ? bar(t.science, y0, thick) : bar(t.science, y0 + thick + gap, thin)
		};
	});
	const bottom = top + tiers.length * pitch - 8;
	const height = bottom + 44;
	const ticks = x.ticks(Math.max(2, Math.floor((x.range()[1] - left) / 80)));
	return { width, height, left, top, bottom, x, ticks, rows };
}
