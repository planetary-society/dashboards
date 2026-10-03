/**
 * The bin-free view of a division: its missions in cost order, carrying the
 * running share of the division's top-percentile credit against the running
 * share of its spending. The curve has no cost bins in it.
 *
 * A mission with no recorded cost cannot be placed on the axis. It is named in
 * `unplaced` and left out of both denominators, so the two cumulative series
 * always close at 1 -- which is what the invariant below insists on.
 *
 * Pure: values in, one CostCurve out. Shares are rounded only on the way out.
 */

import { PackagingError } from './invariants.mjs';
import { byText, num, share, sum } from './util.mjs';

/** The cumulative top-share levels `band` marks on the cost axis. */
export const BAND_LEVELS = [0.25, 0.5, 0.75];

// A cumulative sum of floats lands a hair under the level it mathematically
// reaches; without this the band would skip the mission that gets there.
const REACH_EPSILON = 1e-12;
/** How far the last cumulative share may sit from 1 before it is a bug. */
export const CLOSES_AT = 1e-9;

/**
 * One cost curve.
 *
 * @param {{id: string, name: string, cost: number|null, top: number|null}[]} missions
 *   every mission of the division, `top` being its tie-weighted credit at the
 *   scope and percentile this curve is for (see measures.mjs)
 * @param {{division?: string, scope?: string, top?: number}} [context] named in
 *   the invariant's message, so a failure says which curve broke
 * @returns {{points: {id: string, cost: number, topShare: number, costShare: number}[],
 *   band: {p25: number|null, p50: number|null, p75: number|null},
 *   cheapestWithTop: {id: string, name: string, cost: number}|null,
 *   unplaced: string[]}}
 */
export function buildCostCurve(missions, context = {}) {
	const rows = (missions ?? []).map((m) => ({ ...m, cost: num(m.cost), top: num(m.top) }));
	const placed = rows
		.filter((m) => m.cost !== null)
		.sort((a, b) => a.cost - b.cost || byText(a.id, b.id));
	const unplaced = rows
		.filter((m) => m.cost === null)
		.map((m) => m.id)
		.sort(byText);

	const topTotal = sum(placed.map((m) => m.top));
	const costTotal = sum(placed.map((m) => m.cost));

	const points = [];
	const band = { p25: null, p50: null, p75: null };
	let cheapestWithTop = null;
	let runningTop = 0;
	let runningCost = 0;
	for (const mission of placed) {
		if (cheapestWithTop === null && (mission.top ?? 0) > 0) {
			cheapestWithTop = { id: mission.id, name: mission.name, cost: mission.cost };
		}
		runningTop += mission.top ?? 0;
		runningCost += mission.cost;
		const topShare = topTotal > 0 ? runningTop / topTotal : 0;
		const costShare = costTotal > 0 ? runningCost / costTotal : 0;
		if (topTotal > 0) {
			for (const level of BAND_LEVELS) {
				const key = `p${level * 100}`;
				if (band[key] === null && topShare >= level - REACH_EPSILON) band[key] = mission.cost;
			}
		}
		points.push({
			id: mission.id,
			cost: mission.cost,
			topShare: share(topShare),
			costShare: share(costShare)
		});
	}

	assertCurveCloses({ context, topTotal, costTotal, runningTop, runningCost });
	return { points, band, cheapestWithTop, unplaced };
}

/**
 * The band across several divisions with each division weighted equally: at every cost where
 * any of them places a mission, the mean of their running top shares, and the quarter marks
 * are the costs at which that mean first reaches each level. Credit is never summed across
 * fields; only each field's own share enters. A division with no top credit at all is left
 * out, since a share of nothing says nothing about where the papers are.
 *
 * @param {{points: {cost: number, topShare: number}[]}[]} curves one CostCurve per division
 * @returns {{p25: number, p50: number, p75: number}|null} null when no curve has top credit
 */
export function pooledBand(curves) {
	const used = (curves ?? []).filter((c) => c?.points?.length && c.points.some((p) => p.topShare > 0));
	if (used.length === 0) return null;
	const costs = [...new Set(used.flatMap((c) => c.points.map((p) => p.cost)))].sort((a, b) => a - b);
	const shareAt = (points, cost) => {
		let last = 0;
		for (const p of points) {
			if (p.cost > cost) break;
			last = p.topShare;
		}
		return last;
	};
	const band = { p25: null, p50: null, p75: null };
	for (const cost of costs) {
		const mean = used.reduce((total, c) => total + shareAt(c.points, cost), 0) / used.length;
		for (const level of BAND_LEVELS) {
			const key = `p${level * 100}`;
			if (band[key] === null && mean >= level - REACH_EPSILON) band[key] = cost;
		}
		if (band.p75 !== null) break;
	}
	return band;
}

/**
 * The curve is a partition of the division: every placed mission's credit and
 * every placed mission's dollar is on it exactly once, so the last point must
 * read 1 on both series. Anything else means the accumulation lost or
 * double-counted a mission, and the chart would draw a share of nothing.
 */
function assertCurveCloses({ context, topTotal, costTotal, runningTop, runningCost }) {
	const where =
		`cost curve for division "${context.division ?? 'unknown'}" ` +
		`(${context.scope ?? 'unknown'} top-${context.top ?? '?'}%)`;
	for (const [label, total, running] of [
		['top', topTotal, runningTop],
		['cost', costTotal, runningCost]
	]) {
		if (total <= 0) continue;
		const closes = running / total;
		if (Math.abs(closes - 1) > CLOSES_AT) {
			throw new PackagingError(
				`${where}: cumulative ${label} share closes at ${closes}, not 1 (tolerance ${CLOSES_AT})`
			);
		}
	}
}
