// Geometry for two Analysis page figures: the failure grid (mission outcomes by cost tier and
// division) and the time bars (years to the first top-10% paper by cost tier). The components only
// draw what these return.

import { scaleLinear } from 'd3-scale';
import { plural } from '../format.js';
import { tierLabel } from './tiers.js';

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

/**
 * Two bars per tier on one years axis from 0 (further left only if a median is negative): the
 * median from formulation start, thick, and from the start of science, thin, each with its value
 * at the bar's outer end. Rows have a fixed height, so the height does not depend on `width`: at
 * width 0 (the server) the layout still says how tall a stage to reserve. A tier with no first
 * top-10% paper yet draws no bars.
 */
export function timeLayout(tiers, time, width, { pitch = 54, only = null } = {}) {
	const labels = tiers.map((t) => tierLabel(t));
	// tier labels are mostly digits, $ and M, wider than the average character
	const left = Math.ceil(Math.max(...labels.map((l) => l.length)) * 7.6) + 14;
	const thick = 14, thin = 7, gap = 4, top = 6;
	const valueRoom = 52; // "11.5 yr" at 12px, and air
	const values = time.tiers.flatMap((t) => (t.reached > 0 ? [t.formulation.median, t.science.median] : [])).filter((v) => v != null);
	const x = scaleLinear()
		.domain([Math.min(0, ...values), Math.max(1, ...values)])
		.nice()
		.range([left, Math.max(left + 1, width - valueRoom)]);
	const rows = time.tiers.map((t, i) => {
		const y0 = top + i * pitch;
		const bar = (median, y, h) => {
			if (median == null) return null;
			const [a, b] = [x(0), x(median)];
			const out = median < 0;
			return { median, x: Math.min(a, b), w: Math.abs(b - a), y, h, cy: y + h / 2, tx: out ? b - 5 : b + 5, anchor: out ? 'end' : 'start' };
		};
		const none = t.reached === 0;
		const meta = none ? `${t.without} without one yet` : `${t.reached} ${plural(t.reached, 'mission')}${t.without > 0 ? ` · ${t.without} without one yet` : ''}`;
		// one measure alone (the story's steps): both draw as the same thick bar in the same place
		const h = only ? thick : thick + gap + thin;
		return {
			label: labels[i],
			none,
			labelY: y0 + h / 2,
			formulation: none ? null : bar(t.formulation.median, y0, thick),
			science: none ? null : only ? bar(t.science.median, y0, thick) : bar(t.science.median, y0 + thick + gap, thin),
			meta,
			metaY: y0 + h + 15
		};
	});
	const bottom = top + tiers.length * pitch - 8;
	const height = bottom + 44;
	const ticks = x.ticks(Math.max(2, Math.floor((x.range()[1] - left) / 80)));
	return { width, height, left, top, bottom, x, ticks, rows };
}
