/**
 * Model for IndexScatter: one mark per mission, what the mission cost against a citation index.
 *
 * Cost runs on a log axis because the missions span four decades of dollars; the index runs
 * linearly from zero because zero is a real value here — a mission with no tracked papers
 * has no index, and a failed one counts as a zero rather than a gap.
 *
 * Positions are percentages of the plot box, so the chart is complete in the prerendered HTML
 * and nothing has to be measured. No DOM, so it is all testable in node.
 */

import { ticks } from 'd3-array';
import { decadeTicks, minorDollarTicks } from './costaxis.js';

export const INDEX_LABEL = { m: 'm-index', h: 'h-index' };

/** The other index, for the readout's parenthesis. */
export const otherIndex = (index) => (index === 'm' ? 'h' : 'm');

/** h-index is a count; m-index runs 0–12 and needs its decimal. */
export function indexValue(index, v) {
	if (v == null) return '—';
	return index === 'h' ? String(Math.round(v)) : v.toFixed(1);
}

/** Axis tick text: integers plain, fractions to two places (small divisions run 0.1 apart). */
export const tickValue = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));

/** Share of the log span left blank at each end, so an edge mission is not on the frame. */
const PAD = 0.06;

/**
 * Log cost axis over the given costs: the domain in log10, decade ticks inside it, and `at`,
 * which places a cost as a percentage across the box.
 */
export function costAxis(costs) {
	const valid = (costs ?? []).filter((c) => Number.isFinite(c) && c > 0);
	if (!valid.length) return null;
	let lo = Math.log10(Math.min(...valid));
	let hi = Math.log10(Math.max(...valid));
	// One cost, or a handful within a factor of three, would otherwise collapse the scale.
	if (hi - lo < 0.5) {
		const mid = (lo + hi) / 2;
		lo = mid - 0.25;
		hi = mid + 0.25;
	}
	const pad = (hi - lo) * PAD;
	lo -= pad;
	hi += pad;
	const at = (c) => ((Math.log10(c) - lo) / (hi - lo)) * 100;
	// the domain is in log10 here; the shared ladder works in dollars
	return {
		lo, hi, at,
		ticks: decadeTicks(10 ** lo, 10 ** hi).map((value) => ({ value, pct: at(value) })),
		minorPositions: minorDollarTicks(10 ** lo, 10 ** hi).map(at)
	};
}

/** Linear index axis from zero, ending on a tick at or above the largest value. */
export function indexAxis(values) {
	const numbers = (values ?? []).filter((v) => Number.isFinite(v));
	const max = Math.max(0, ...numbers);
	const t = ticks(0, max > 0 ? max : 1, 4);
	const step = t.length > 1 ? t[1] - t[0] : 1;
	const top = Math.max(step, Math.ceil(max / step) * step);
	const out = [];
	for (let v = 0; v <= top + 1e-9; v += step) out.push(+v.toFixed(6));
	return { max: top, values: out };
}

/**
 * MissionRow[] -> plotted points and both axes for one index.
 *
 * A mission is plotted when it has a cost and either a value for this index or a failure:
 * failures carry the mark that says so and sit on the zero line when they have no index at all.
 * Missions with neither are left out rather than drawn at a value they do not have.
 */
export function scatterModel(missions, index) {
	const other = otherIndex(index);
	const rows = (missions ?? []).filter((m) => m.cost != null && m.cost > 0 && (m.indices?.[index] != null || m.failed));
	const x = costAxis(rows.map((m) => m.cost));
	if (!x) return null;
	const y = indexAxis(rows.map((m) => m.indices?.[index] ?? 0));
	const points = rows
		.slice()
		.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name))
		.map((m) => {
			const value = m.indices?.[index] ?? null;
			return {
				id: m.id,
				name: m.name,
				cost: m.cost,
				value,
				other: m.indices?.[other] ?? null,
				failed: !!m.failed,
				x: x.at(m.cost),
				y: ((value ?? 0) / y.max) * 100
			};
		});
	const costs = points.map((p) => p.cost);
	const values = points.map((p) => p.value).filter((v) => v != null);
	return {
		points,
		xTicks: x.ticks,
		xMinorPositions: x.minorPositions,
		yTicks: y.values.map((value) => ({ value, pct: (value / y.max) * 100 })),
		max: y.max, // the axis top, which is a tick and so usually above the data
		maxValue: values.length ? Math.max(...values) : null, // the largest figure actually plotted
		failed: points.filter((p) => p.failed).length,
		costs: costs.length ? [Math.min(...costs), Math.max(...costs)] : null
	};
}

/** Division.indexCorrelation[index] -> the sentence under the title. */
export function correlationText(stat) {
	if (!stat || stat.rho == null) return 'Too few missions to correlate.';
	const rho = `${stat.rho < 0 ? '−' : ''}${Math.abs(stat.rho).toFixed(2)}`;
	return `Rank correlation with cost: ρ = ${rho} across ${stat.n} missions.`;
}
